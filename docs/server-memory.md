# Server Memory

Enabling Memory
- Connector defaults: placement=after_system, content=tree, maxChars=4000.
- Wiring: add a `memoryNode` and connect its `$self` to the agent's CallModel via `setMemoryConnector`.
- Tool: attach the unified `memory` tool to `simpleAgent` and wire `$memory` from Memory node. Commands supported: `read | list | append | update | delete`.
- Scope: `global` per node by default; `perThread` uses the thread id. Data is string-only.
- Environment: server requires MongoDB in prod; integration/E2E tests use mongodb-memory-server (no env gating); FakeDb is reserved for unit tests only.

Unified Memory Tool interface
- Args: `{ path: string, command: 'read'|'list'|'append'|'update'|'delete', content?: string, oldContent?: string }`
- Output: JSON stringified envelope `{ command, path, ok, result?, error? }`
  - read: `result = { content }`
  - list: `result = { entries: Array<{ name, kind: 'file'|'dir' }> }`
  - append: `result = { status: 'ok' }`
  - update: `result = { replaced: number }`
  - delete: `result = { files: number, dirs: number }`

Migration notes
- Old tools `memory_read|memory_list|memory_append|memory_update|memory_delete` are removed. Use the unified `memory` tool.
- Temporary `memory_dump` diagnostic tool is removed.
- Path normalization is unchanged; empty path treated as `/` for `list`.

Refer to ADR 0005 for design details and migration notes: docs/adr/adr-0005-memory-v2.md
