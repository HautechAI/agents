# Apps/Server

Socket.io + Fastify server hosting the graph runtime and templates.

Trigger Events (Socket-only)
- In-memory store captures recent trigger events per node; no HTTP endpoints are exposed.
- Configure pruning with env var `TRIGGER_EVENTS_MAX` (default 300).
- Socket messages:
  - Client -> Server: `trigger_init` { nodeId: string, threadId?: string }
    - Server responds with `trigger_initial` { nodeId, items: TriggerEvent[] } where items are newest-first.
  - Client -> Server: `trigger_update` { nodeId: string, threadId?: string }
    - Server responds again with `trigger_initial` for the new filter.
  - Client -> Server: `trigger_close` { nodeId: string }
    - Server removes the subscription for that node for that socket.
  - Server -> Client: `trigger_event` { nodeId, event }
    - Delivered to subscribed socket when matching event occurs.

Where events come from
- Triggers (e.g., SlackTrigger) are bound to the in-memory store during template instantiation. As messages arrive, they are buffered with timestamp + threadId and re-emitted via Socket.io to interested clients.

Notes
- Existing checkpoint stream over sockets remains unchanged.
