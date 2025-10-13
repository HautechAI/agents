# RemindMe Tool

Behavior
- Supports multiple concurrent reminders for the same thread; each call schedules its own timer and none overwrite others.
- Async-only: returns immediately with `{ status: 'scheduled', etaMs, at }`. The reminder fires later and posts a system message to the caller agent.
- Persistence, cancel-by-id, and durable scheduling are out of scope for now.

New in vNext
- In-memory registry of scheduled reminders per RemindMe node instance.
- Server endpoint: `GET /graph/nodes/:nodeId/reminders` returns `{ items: [{ id, threadId, note, at }] }` for active (pending) reminders.
- UI shows:
  - Numeric badge on the Remind Me node with active reminder count.
  - An “Active Reminders” section in the Activity sidebar listing note, scheduled time, and threadId. Auto-refresh every ~3.5s.

Usage
- Tool name: `remindMeTool`
- Input: `{ delayMs: number >= 0, note: string }`
- Effect: schedules a system message `{ kind: 'system', content: note, info: { reason: 'reminded' } }` back to the originating agent/thread.

Notes
- The registry is in-memory only; reminders disappear if the server restarts.
- The reminder is removed from the registry when it fires (regardless of success).
