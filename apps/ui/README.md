# Agents UI (Vite + React + TS)

This UI renders the agent graph and integrates server-provided template metadata for human-readable titles and node kinds.

Key features implemented:
- Rename Bash → Shell across user-facing labels
- Map tool call name bash_command → shell_command (migration)
- Show color-coded node kind badges (trigger, agent, tool, mcp)
- Support custom per-node titles via config.title
- Use server-provided titles from GET /api/templates
- Relabel containerProvider as “Workspace” (via server metadata)

Dev
- pnpm --filter ui dev

Build
- pnpm --filter ui build

Test
- pnpm --filter ui test

Notes
- The UI expects the server at :3010. Vite dev server proxies /api and /socket.io.
- Migration: If you see tool calls named bash_command, they will be mapped to shell_command in UI logic.
