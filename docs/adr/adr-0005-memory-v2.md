# ADR: Memory System v2

Status: Accepted
Date: 2025-09-28

Context
- We need durable, query-free memory scoped to a graph node and optionally per thread, with deterministic local tests and no external services in CI.

Decision
- String-only semantics: files store strings only; all operations treat values as plain text.
- Path rules: normalized absolute paths, collapse duplicate slashes, forbid `..` and `$`, segments allow `[A-Za-z0-9_ -]`.
- Storage layout: one Mongo document per `{ nodeId, scope[, threadId] }`. File paths map to dotted keys in `data` (e.g., `/a/b` -> `data["a.b"]`). Directories are tracked in `dirs` by dotted keys.
- Indexes: idempotent unique indexes `uniq_global(nodeId,scope)` and `uniq_per_thread(nodeId,scope,threadId)` with partial filters.
- Scope: `global` across all threads for a node; `perThread` isolates by `threadId`.
- Connector defaults: `placement=after_system`, `content=tree`, `maxChars=4000`.
- Wiring: MemoryNode exposes `memoryTools` (for agents) and `createConnector()` returning a MemoryConnectorNode; SimpleAgent accepts `setMemoryConnector()`; CallModelNode injects a SystemMessage based on placement.

Consequences
- Deterministic local/unit tests using in-memory FakeDb ensure CI stability.
- No binary/JSON types in memory values; callers must serialize manually if needed.
- Tree fallback prevents overlong context when `full` exceeds `maxChars`.
