# Migrations

## 2025-09: Bash tool rename → Shell

Summary
- The Bash tool has been renamed to Shell across the UI.
- Tool call name changed: bash_command → shell_command.

Impact
- Server already exposes the tool template as `shellTool` with title "Shell".
- Existing persisted tool call names in conversations or tests may refer to `bash_command`.

Action
- UI maps `bash_command` → `shell_command` during tool name handling.
- Update any external scripts or tests referencing `bash_command` to use `shell_command`.

Related
- Server template metadata includes human-friendly titles and kinds via GET /api/templates.
