# LifeOS — Personal Life Management App

A PWA (Progressive Web App) designed to act as a personal life operating system powered by Claude AI. Six tabs — Today, Calendar, Fitness, Macros, Health, Goals — each with its own AI butler that sees only the data for that section and can take real actions on the user's behalf. Connects to the user's real Google Calendar to read and write events.

## Core Features

**Calendar & Scheduling** — Reads and writes to Google Calendar through the official API. Alfred, the head butler, can create events (with recurrence), edit them by ID, and delete single occurrences or whole series. Today screen surfaces tomorrow's agenda; Calendar tab lists the next week with tap-to-edit and tap-to-delete.

**AI Butlers** — Five conversational assistants, one per section, with different models tuned to the work:

- **Alfred** (Today) — Sees the whole picture: calendar, tasks, habits, daily metrics, recent workouts, macros, goals. Use him for cross-cutting questions ("how's my week going?", "should I do legs tomorrow given my sleep?") and calendar actions.
- **Jarvis** (Fitness) — Strength coach. Can start a workout, add exercises, log sets, and finish the workout — all from chat. Reacts to your logged sets in real time, suggests weight increments, and spots patterns in your history.
- **Sebastian** (Macros) — Nutrition coach. Log meals conversationally ("I had two eggs and oatmeal for breakfast") and he writes them to your day, pulling macros from your food library. Asks for macros before logging unknown foods rather than guessing.
- **Cornelius** (Health) — Sleep, weight, mood, energy, and water. Quotes specific dates and numbers from your logs and looks for cross-metric patterns ("energy dipped on days you slept under 6 h").
- **Benson** (Goals) — Accountability coach. Sees all active goals, deadlines, and journal entries; helps reflect and plan next steps.

Every butler can also answer general advice and off-topic questions — they're domain experts but not trapped in their section. The hard line is they never fabricate data about you.

**Workout Tracker** — Full strength-training log: starter exercise library plus custom additions, workouts with sets/reps/weight/RPE/rest, templates you can save and re-run with one tap, PR detection using estimated 1-rep max (Epley), GitHub-style 365-day activity heatmap, and a one-tap "repeat" button on any past workout.

**Meal Planner & Macro Tracker** — Food library with per-serving macros, daily meal entries split into breakfast/lunch/dinner/snacks, totals vs editable goals (calories/protein/carbs/fat), 7-day running averages, and the conversational logging through Sebastian.

**Health Logging** — Sleep, water, weight, mood (1-10), and energy (1-10) — each with quick-log inputs, 14-day sparkline trends, and a recent-entries log. Sleep and water also surface as tiles on the Today screen with streak counters.

**Tasks & Habits** — A this-week task list that auto-resets every Monday so the slate stays clean, plus daily-habit tracking with rolling streak dots and a longest-streak record.

**Goals** — Active and completed goals organized by term (short / mid / long), each with a description, optional target date with relative copy ("3 weeks left" / "overdue"), and a per-goal journal for progress notes you can revisit.

**Weekly Review** — One tap on the Today tab kicks off a Sonnet-generated recap of the past 7 days across every section. It produces a headline, body summary, mind & recovery notes, habit/task review, goal status, and 2-3 concrete suggestions for next week — then caches the result so re-opening doesn't re-spend tokens.

**Backup & Restore** — Export everything in the database as JSON, paste it into a note or email it to yourself, and re-import on another device. Sensitive settings (your Anthropic API key and Google sign-in tokens) are intentionally excluded.

## Technical

- **PWA** — installable on Android and iPhone home screen, dark/light themes, mobile-first design
- **Google Calendar** integration via `@react-oauth/google` (implicit OAuth flow).
- **Built on Claude AI** via the Anthropic SDK — Sonnet 4.6 with adaptive thinking for the heavier butlers (Jarvis, Sebastian, Cornelius) and weekly review; Haiku 4.5 for the lighter ones (Alfred, Benson). User provides their own Anthropic API key, stored on the device.
- **Tool use** — Jarvis, Sebastian, and Alfred actually take actions, not just give advice. The tool-use loop runs up to 6 iterations per turn with results streamed back as inline confirmations.
- **All data local** — Dexie (IndexedDB) holds the entire database. Schema v5 with 14 tables. No accounts, no backend, no analytics.
- **React 19 + TypeScript + Vite + Tailwind v4** — single-chunk ~170 kB gzipped bundle.

## Setup

```bash
npm install
npm run dev      # local dev with HMR
npm run build    # production bundle to dist/
```

In `.env.local`:
- `VITE_ANTHROPIC_API_KEY` — your Anthropic key (or paste into the chat dock on first launch)
- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID for Google Calendar

Deploy to Vercel:

```bash
npx vercel --prod
```

## Status

Personal project. Built for one user, on one device, with hardcoded assumptions (lb units, butler personas, US-style date formatting) that reflect that.
