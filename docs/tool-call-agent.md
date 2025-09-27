# CallAgentTool

Purpose
- Let one agent invoke another agent as a subtask with configurable response behavior.

Configuration
- description: string (required). Shown to the LLM as the tool description.
- response: 'sync' | 'async' | 'ignore' (optional, default: 'sync'). Response mode:
  - sync: await child response and return text (current blocking behavior)
  - async: return {status: 'sent'} immediately; when child responds, trigger parent with callback
  - ignore: fire-and-forget, return confirmation message without waiting

Ports
- targetPorts
  - $self: instance
- sourcePorts
  - agent: method (create: setAgent)

Invocation schema (LLM arguments)
- input: string (required). The message to forward.
- context: object (optional). Passed through to TriggerMessage.info.

Behavior
- If no target agent attached: returns exactly the string "Target agent is not connected".
- Thread ID is read from config.configurable.thread_id; if missing, throws error.
- Forwards TriggerMessage { content: input, info: context || {} } to BaseAgent.invoke(threadId, [message]).
- Response behavior depends on 'response' config:
  - sync (default): Returns the target agent's last message text if available; otherwise empty string.
  - async: Returns {status: 'sent'} immediately. When child completes, parent receives TriggerMessage with:
    - content: `${parentThreadId}__${childThreadId}`
    - info: { childResponse: string, originalChildThreadId: string, type: 'async_callback' }
    - Falls back to sync mode if no caller_agent available in runtime config
  - ignore: Returns "Message sent (ignore mode)" immediately; child invocation happens in background
- Errors are caught and returned as text: `Error calling agent: <message>`.

Graph wiring example

Nodes
- A: { template: 'simpleAgent' }
- B: { template: 'simpleAgent' }
- T: { template: 'callAgentTool', config: { description: "Call B to evaluate something", response: "async" } }

Edges
- { source: 'A', sourceHandle: 'tools', target: 'T', targetHandle: '$self' }
- { source: 'T', sourceHandle: 'agent', target: 'B', targetHandle: '$self' }

Notes
- Valid configuration keys: description, response. Any other keys are ignored.
- Async mode requires caller_agent in runtime configurable; falls back to sync if unavailable.
- Logging: each invocation logs info with { targetAttached: boolean, hasContext: boolean } and errors with message and stack.
