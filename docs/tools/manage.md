# Manage tool

Tool name: `Manage` (class: ManageTool)

Purpose: Manage connected agents from a parent agent. Supports sending a message to a specific worker using isolated child threads and checking status of active child threads for the current parent thread. Connected workers are addressed by their configured agent titles (trimmed).

Ports
- targetPorts: { $self: { kind: 'instance' } }
- sourcePorts: { agent: { kind: 'method', create: 'addWorker' } }

Configuration
- `name` (optional): override the tool name exposed to the agent. Defaults to `manage`.
- `description` (optional): human readable description surfaced to the parent agent.
- `mode` (optional): `'sync'` (default) waits for the child worker's first response before returning; `'async'` forwards responses back to the parent thread without blocking the invocation.
- `timeoutMs` (optional, default `30000`): milliseconds to wait for a child response in sync mode before failing with `manage_timeout`.

Invocation schema
```
{
  command: 'send_message' | 'check_status',
  worker?: string,   // required for send_message; matches the agent title
  message?: string,  // required for send_message
  threadAlias?: string // optional; defaults to sanitized worker title when omitted
}
```

 Behavior
- send_message: routes the provided message to the specified worker and registers Manage as the channel owner for the resolved child thread.
  - Requires runtime `LLMContext.threadId` (parent thread UUID).
  - `threadAlias` is normalized to lowercase with whitespace collapsed to `-` if not provided.
  - `'sync'` mode waits for the worker's first response (or the configured timeout) and returns the formatted worker reply.
  - `'async'` mode immediately returns an acknowledgement while queuing the worker response to be forwarded back to the parent thread via the caller agent.
- check_status: aggregates active child threads across connected agents within the current parent thread only. Returns `{ activeTasks: number, childThreadIds: string[] }`.

Validation and errors
- Missing runtime thread_id throws.
- If no agents are connected: send_message => error, check_status => `{ activeTasks: 0, childThreadIds: [] }`.
- For send_message: `worker` and `message` are required; unknown worker (title mismatch) results in error.

- Notes
- Thread isolation: child threads are managed via persistence: `getOrCreateSubthreadByAlias(source, threadAlias, parentThreadId, summary)`; Manage supplies an empty summary string and persists itself as the thread's channel node via `setThreadChannelNode`.
- Connected agents must expose a non-empty `title` in their configuration. ManageToolNode enforces uniqueness by trimmed title and resolves workers using that title at runtime.
- This tool mirrors the node interface of call_agent for wiring and uses zod for input validation like other tools.

Examples
```
// Send a message to worker 'agent-ops'
{ command: 'send_message', worker: 'agent-ops', message: 'deploy latest build', threadAlias: 'ops-task-1' }

// Check status within the current parent thread
{ command: 'check_status', threadAlias: 'status' }

// Send a message using a worker title that contains extra whitespace (trimmed automatically)
{ command: 'send_message', worker: '  agent-ops  ', message: 'sync status' }
```
