import Anthropic from '@anthropic-ai/sdk'
import { deleteSetting, getSetting } from '../db'
import type { CalEvent } from './calendar'

export const ANTHROPIC_KEY_SETTING = 'anthropic_api_key'

// Read the Anthropic API key. Prefers a key the user pasted into the app
// (stored in Dexie's settings table) so production bundles don't need to
// embed it. Falls back to the .env.local value for local dev.
async function getApiKey(): Promise<string> {
  const fromDb = await getSetting<string>(ANTHROPIC_KEY_SETTING)
  if (fromDb && fromDb.trim()) return fromDb.trim()
  return (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim()
}

interface BuildSystemPromptArgs {
  todayEvents: CalEvent[]
  now?: Date
}

export function buildSystemPrompt({
  todayEvents,
  now = new Date(),
}: BuildSystemPromptArgs): string {
  const dateStr = now.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const eventsBlock =
    todayEvents.length === 0
      ? '(no events on the calendar today)'
      : todayEvents
          .map((e) => {
            const time = e.allDay
              ? 'all day'
              : e.start.toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
            const loc = e.location ? ` @ ${e.location}` : ''
            return `- ${time}: ${e.title}${loc}`
          })
          .join('\n')

  return `You are LifeOS, a personal life assistant for one user (the owner of this app). Help them manage their day, reflect on patterns, and stay organized.

Current local time: ${dateStr}

## Today's calendar
${eventsBlock}

Be direct and concise. The user owns this app and prefers terse, useful answers over corporate hedging. If you don't know something — say so. When the user asks about data not yet wired in (workouts, meals, transactions, habits beyond the basics), acknowledge the gap rather than inventing values.`
}

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void
  onComplete: (finalText: string) => void
  onError: (err: Error) => void
  // Optional — fired after a tool successfully executes. The string is the
  // tool's return text (already user-readable).
  onToolResult?: (toolName: string, resultText: string, isError: boolean) => void
}

// App-defined tool: schema goes to the API, handler runs locally.
export interface AppTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (input: unknown) => Promise<string>
}

export interface StreamChatOptions {
  // Model is optional; defaults to claude-opus-4-7. Caller (Chat.tsx) passes
  // the per-coach model from COACH_CONFIG.
  model?: string
  // Adaptive thinking is on by default. Pass 'disabled' for models that don't
  // support it (e.g. Haiku 4.5) or to skip thinking entirely.
  thinking?: 'adaptive' | 'disabled'
}

// One-shot completion (non-streaming). Returns the model's text reply.
export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 512,
): Promise<string> {
  const apiKey = await getApiKey()
  if (!apiKey) {
    throw new Error('Set your Anthropic API key in the chat dock first.')
  }
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) {
        await deleteSetting(ANTHROPIC_KEY_SETTING)
      }
      throw new Error(`Claude API ${err.status}: ${err.message}`)
    }
    throw err
  }
}

export async function streamChat(
  messages: ApiMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  tools: AppTool[] = [],
  options: StreamChatOptions = {},
): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey) {
    callbacks.onError(new Error('Set your Anthropic API key above to start chatting.'))
    return
  }

  const model = options.model ?? 'claude-opus-4-7'
  const useAdaptiveThinking = options.thinking !== 'disabled'

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const toolsByName = new Map(tools.map((t) => [t.name, t]))
  const apiTools =
    tools.length > 0
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as never,
        }))
      : undefined

  // Build a mutable conversation we can append assistant turns and tool
  // results to as the tool-use loop progresses.
  type AnyMsg = { role: 'user' | 'assistant'; content: unknown }
  const convo: AnyMsg[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let totalText = ''
  const MAX_ITERATIONS = 6 // safety cap to prevent runaway loops

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        ...(useAdaptiveThinking
          ? { thinking: { type: 'adaptive' } }
          : {}),
        ...(apiTools ? { tools: apiTools } : {}),
        messages: convo as never,
      })

      stream.on('text', (delta) => {
        totalText += delta
        callbacks.onTextDelta(delta)
      })

      const finalMessage = await stream.finalMessage()

      // Echo the assistant's content (text + tool_use blocks) back into the
      // conversation so the next turn has the full context.
      const assistantContent: unknown[] = []
      const toolUses: { id: string; name: string; input: unknown }[] = []
      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          })
          toolUses.push({ id: block.id, name: block.name, input: block.input })
        }
        // thinking blocks are not echoed back (display: omitted on Opus 4.7)
      }
      convo.push({ role: 'assistant', content: assistantContent })

      if (
        finalMessage.stop_reason !== 'tool_use' ||
        toolUses.length === 0
      ) {
        callbacks.onComplete(totalText)
        return
      }

      // Run tools and feed results back as a user turn.
      const toolResults: unknown[] = []
      for (const tu of toolUses) {
        const tool = toolsByName.get(tu.name)
        if (!tool) {
          const msg = `Unknown tool: ${tu.name}`
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: msg,
            is_error: true,
          })
          callbacks.onToolResult?.(tu.name, msg, true)
          continue
        }
        try {
          const out = await tool.handler(tu.input)
          const isError = out.startsWith('Error')
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: out,
            is_error: isError,
          })
          callbacks.onToolResult?.(tu.name, out, isError)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Error: ${msg}`,
            is_error: true,
          })
          callbacks.onToolResult?.(tu.name, `Error: ${msg}`, true)
        }
      }
      convo.push({ role: 'user', content: toolResults })
      // Loop continues — Claude will see tool results and respond.
    }
    // Hit iteration cap.
    callbacks.onComplete(totalText)
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) {
        await deleteSetting(ANTHROPIC_KEY_SETTING)
      }
      callbacks.onError(new Error(`Claude API ${err.status}: ${err.message}`))
    } else {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
}
