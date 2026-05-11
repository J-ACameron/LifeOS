import {
  createEvent,
  deleteEvent,
  formatEventTime,
  listEventsForRange,
  updateEvent,
} from './calendar'
import type { AppTool } from './anthropic'

function parseDateInput(s: string, label: string): Date {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) {
    throw new Error(
      `Invalid ${label}: "${s}". Use ISO 8601 format (e.g. "2026-05-15T14:00:00").`,
    )
  }
  return d
}

const createEventTool: AppTool = {
  name: 'create_event',
  description: `Create a new event in the user's Google Calendar. Make sure you have a clear title and start/end times from the user — don't infer or guess. For "all day" events, set all_day=true and pass the date in YYYY-MM-DD format for start_iso and end_iso (end is exclusive — for a single all-day event on May 15, end_iso should be 2026-05-16).`,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      start_iso: {
        type: 'string',
        description:
          "Start time in ISO 8601, e.g. '2026-05-15T14:00:00' (local time). For all-day, just the date 'YYYY-MM-DD'.",
      },
      end_iso: {
        type: 'string',
        description:
          "End time in ISO 8601. For all-day events, end is exclusive (next-day date).",
      },
      all_day: { type: 'boolean', description: 'True for all-day events' },
      recurrence: {
        type: 'string',
        description:
          "RRULE body without 'RRULE:' prefix, e.g. 'FREQ=WEEKLY' or 'FREQ=DAILY'. Omit for non-repeating.",
      },
      location: { type: 'string', description: 'Optional location' },
      description: { type: 'string', description: 'Optional event description' },
    },
    required: ['title', 'start_iso', 'end_iso'],
  },
  handler: async (raw: unknown) => {
    const input = raw as {
      title: string
      start_iso: string
      end_iso: string
      all_day?: boolean
      recurrence?: string
      location?: string
      description?: string
    }
    try {
      const start = parseDateInput(input.start_iso, 'start_iso')
      const end = parseDateInput(input.end_iso, 'end_iso')
      const event = await createEvent({
        title: input.title,
        start,
        end,
        allDay: input.all_day,
        recurrence: input.recurrence,
        location: input.location,
        description: input.description,
      })
      const when = input.all_day
        ? `all day on ${event.start.toLocaleDateString()}`
        : `${event.start.toLocaleString()}`
      return `Created event "${event.title}" — ${when}${event.id ? ` [id: ${event.id}]` : ''}`
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

const updateEventTool: AppTool = {
  name: 'update_event',
  description: `Modify an existing Google Calendar event by ID. Only fields you pass are changed. The event ID is shown in brackets next to each event in the user's calendar context. NOTE: editing a recurring event modifies the entire series, not a single occurrence.`,
  inputSchema: {
    type: 'object',
    properties: {
      event_id: {
        type: 'string',
        description: "The Google Calendar event ID (shown in [brackets] in context).",
      },
      title: { type: 'string' },
      start_iso: { type: 'string', description: 'New start in ISO 8601' },
      end_iso: { type: 'string', description: 'New end in ISO 8601' },
      all_day: { type: 'boolean' },
      location: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['event_id'],
  },
  handler: async (raw: unknown) => {
    const input = raw as {
      event_id: string
      title?: string
      start_iso?: string
      end_iso?: string
      all_day?: boolean
      location?: string
      description?: string
    }
    try {
      const event = await updateEvent({
        eventId: input.event_id,
        title: input.title,
        start: input.start_iso ? parseDateInput(input.start_iso, 'start_iso') : undefined,
        end: input.end_iso ? parseDateInput(input.end_iso, 'end_iso') : undefined,
        allDay: input.all_day,
        location: input.location,
        description: input.description,
      })
      return `Updated event "${event.title}" — ${event.start.toLocaleString()}`
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

const deleteEventTool: AppTool = {
  name: 'delete_event',
  description: `Delete a Google Calendar event by ID. Only call when the user has explicitly confirmed they want it deleted. Deleting a recurring event removes the entire series.`,
  inputSchema: {
    type: 'object',
    properties: {
      event_id: {
        type: 'string',
        description: 'The Google Calendar event ID',
      },
    },
    required: ['event_id'],
  },
  handler: async (raw: unknown) => {
    const input = raw as { event_id: string }
    try {
      await deleteEvent(input.event_id)
      return `Deleted event ${input.event_id}.`
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

const listEventsTool: AppTool = {
  name: 'list_events',
  description: `List events from the user's Google Calendar in a specific date range. Use this when the user asks about events outside the visible week shown in your context (e.g. "what's on next Wednesday").`,
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Inclusive start date in YYYY-MM-DD',
      },
      end_date: {
        type: 'string',
        description: 'Exclusive end date in YYYY-MM-DD',
      },
    },
    required: ['start_date', 'end_date'],
  },
  handler: async (raw: unknown) => {
    const input = raw as { start_date: string; end_date: string }
    try {
      const start = parseDateInput(input.start_date + 'T00:00:00', 'start_date')
      const end = parseDateInput(input.end_date + 'T00:00:00', 'end_date')
      const events = await listEventsForRange(start, end)
      if (events.length === 0) {
        return `No events between ${input.start_date} and ${input.end_date}.`
      }
      return events
        .map((e) => {
          const date = e.start.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
          return `[${e.id}] ${date} ${formatEventTime(e)}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`
        })
        .join('\n')
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

export const CALENDAR_TOOLS: AppTool[] = [
  createEventTool,
  updateEventTool,
  deleteEventTool,
  listEventsTool,
]
