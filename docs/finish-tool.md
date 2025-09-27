# FinishTool and TerminateResponse

## Purpose
- Allow explicit agent termination when output is restricted or tool calling is enforced.
- Provide graceful completion mechanism for agents configured with `restrictOutput: true`.

## TerminateResponse Class
**Location**: `apps/server/src/tools/terminateResponse.ts`

A special response class that signals to ToolsNode that the agent should terminate.

**Constructor**
- `new TerminateResponse(message?: string)`
  - `message`: Optional completion message to include in the final ToolMessage

**Usage**
```typescript
import { TerminateResponse } from '../tools/terminateResponse';

// In a tool implementation
return new TerminateResponse('Task completed successfully');
```

**Behavior**
- When ToolsNode detects a TerminateResponse from any tool, it sets `done=true` in the NodeOutput
- The message (or default "Task completed.") becomes the ToolMessage content
- The agent graph uses the `done` flag to route to END via conditional edges

## FinishTool
**Location**: `apps/server/src/tools/finish.tool.ts`

A built-in tool that returns TerminateResponse to signal task completion.

**Configuration**
- No static configuration required
- Available as template `'finishTool'` in the registry

**Schema (LLM arguments)**
- `note`: string (optional) - Note about task completion

**Behavior**
- Returns `new TerminateResponse(note)` where `note` is the optional parameter
- Allows LLM to explicitly signal completion with context

**Template Registration**
```typescript
.register(
  'finishTool',
  () => new FinishTool(),
  {
    targetPorts: { $self: { kind: 'instance' } },
  },
  {
    title: 'Finish',
    kind: 'tool',
  },
)
```

## Agent Configuration
SimpleAgent supports restriction enforcement via these configuration fields:

- `restrictOutput`: boolean (default: false) - Require tool call before finishing
- `restrictionMessage`: string (default: "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.") - Message injected when model tries to finish without tools
- `restrictionMaxInjections`: number (default: 0) - Max injections per turn (0 = unlimited, bounded by recursionLimit)

## Graph Flow with Restrictions
When `restrictOutput: true`:

1. **call_model** → conditional:
   - If `tool_calls.length > 0` → **tools**
   - Else → **enforce**

2. **enforce** → conditional: 
   - If `restrictionInjected === true` → **call_model** (retry)
   - Else → **END**

3. **tools** → conditional:
   - If `done === true` → **END** (TerminateResponse received)
   - Else → **summarize** (new turn, resets restriction counters)

## Examples

### Basic Usage
```typescript
// Agent configuration
agent.setConfig({
  restrictOutput: true,
  restrictionMessage: "You must call a tool before finishing. Use the 'finish' tool if no other tool is needed.",
});

// Add FinishTool to agent
const finishTool = new FinishTool();
agent.addTool(finishTool);
```

### Custom Tool with TerminateResponse
```typescript
class CustomCompletionTool extends BaseTool {
  init(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'complete_task',
      description: 'Mark the current task as complete',
      schema: z.object({
        summary: z.string().describe('Summary of completed work'),
      }),
      func: async ({ summary }) => {
        // Perform cleanup or logging
        return new TerminateResponse(`Task completed: ${summary}`);
      },
    });
  }
}
```

### Restriction with Limited Injections
```typescript
agent.setConfig({
  restrictOutput: true,
  restrictionMaxInjections: 2, // Only remind twice per turn
  restrictionMessage: "Please call a tool or use 'finish' to complete.",
});
```

## Backward Compatibility
- Default `restrictOutput: false` maintains existing behavior
- System prompt remains unchanged; restriction messages are injected as SystemMessage only when needed
- All existing tests pass without modification

## State Management
The restriction enforcement adds these state fields:
- `done`: boolean - Set by ToolsNode when TerminateResponse is received
- `restrictionInjectionCount`: number - Count of injections in current turn
- `restrictionInjected`: boolean - Whether injection occurred on latest enforce step

SummarizationNode resets `restrictionInjectionCount` and `restrictionInjected` to 0/false at the start of each new turn.