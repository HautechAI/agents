import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { ToolCallResponse, withToolCall } from '@hautech/obs-sdk';
import { BaseTool } from './tools/base.tool';
import { NodeOutput } from '../types';
import { TerminateResponse } from './tools/terminateResponse';

// Narrowed view of a tool call extracted from AIMessage
type ToolCall = { id?: string; name: string; args: unknown };
type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string; caller_agent?: unknown; nodeId?: string; node_id?: string } };

export class ToolsNode {
  constructor(private tools: BaseTool[], private nodeId?: string) {
    this.tools = [...tools];
  }

  addTool(tool: BaseTool) {
    if (!this.tools.includes(tool)) this.tools.push(tool);
  }

  removeTool(tool: BaseTool) {
    this.tools = this.tools.filter((t) => t !== tool);
  }

  listTools() { return this.tools; }

  async action(state: { messages: BaseMessage[] }, config: WithRuntime): Promise<NodeOutput> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = (lastMessage?.tool_calls as ToolCall[]) || [];
    if (!toolCalls.length) return {};

    const tools = this.tools.map((tool) => tool.init(config));
    let terminated = false;

    const toolMessages: ToolMessage[] = await Promise.all(
      toolCalls.map(async (tc) => {
        const callId = tc.id ?? `missing_id_${Math.random().toString(36).slice(2)}`;
        const cfgToolNodeId = config?.configurable?.nodeId ?? config?.configurable?.node_id;
        if (!cfgToolNodeId) {
          try { console.warn('[ToolsNode] Missing Tool node id in config.configurable.nodeId/node_id; emitting tool_call span without nodeId'); } catch {}
        }
        return await withToolCall(
          { toolCallId: callId, name: tc.name, input: tc.args, ...(cfgToolNodeId ? { nodeId: cfgToolNodeId } : {}) },
          async () => {
            const tool = tools.find((t) => t.name === tc.name);
            const createMessage = (content: string, success = true) => new ToolCallResponse({
              raw: new ToolMessage({ tool_call_id: callId, name: tc.name, content }),
              output: content,
              status: success ? 'success' : 'error',
            });
            if (!tool) return createMessage(`Tool '${tc.name}' not found.`, false);
            try {
              const output = await tool.invoke(tc.args, {
                configurable: {
                  thread_id: config?.configurable?.thread_id,
                  caller_agent: config?.configurable?.caller_agent,
                },
              });
              if (output instanceof TerminateResponse) { terminated = true; return createMessage(output.message || 'Finished'); }
              const content = typeof output === 'string' ? output : JSON.stringify(output);
              if (content.length > 50000) return createMessage(`Error (output too long: ${content.length} characters).`, false);
              return createMessage(content);
            } catch (e: unknown) {
              let errStr = 'Unknown error';
              if (e instanceof Error) errStr = `${e.name}: ${e.message}`; else { try { errStr = JSON.stringify(e); } catch { errStr = String(e); } }
              return createMessage(`Error executing tool '${tc.name}': ${errStr}`, false);
            }
          },
        );
      }),
    );
    return { messages: { method: 'append', items: toolMessages }, done: terminated };
  }
}
