llloop (Large Language Loop)

Lightweight LLM turn engine used by the platform. No DB writes inside.
Implements a minimal dispatcher and types. See issue #376 for design.

Usage

1) Install (workspace-managed)
- Ensure workspace has openai@6.5.0 and zod installed (root already includes these).

2) Import and prepare a tool

```ts
import OpenAI from 'openai';
import { runTurn, type Message, type Tool, type ToolDef, type ToolRegistry } from '@agyn/llloop';

// Minimal in-memory ToolRegistry
class SimpleRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  add(t: Tool) { this.tools.set(t.name, t); }
  get(name: string) { return this.tools.get(name); }
  list() { return Array.from(this.tools.values()); }
}

// Define a simple echo tool
const echoToolDef: ToolDef = {
  name: 'echo',
  description: 'Echo input back',
  schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
};
const echoTool: Tool = {
  name: 'echo',
  async call(args) {
    const text = (args as { text: string }).text;
    return { outputText: `echo: ${text}` };
  },
};

// Registry and client
const tools = new SimpleRegistry();
tools.add(echoTool);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Prepare messages
const messages: Message[] = [
  { role: 'system', contentText: 'You are a helpful assistant.' },
  { role: 'user', contentText: 'Say hello and then call echo with text="hi".' },
];

// Run a turn
const result = await runTurn(
  { model: 'gpt-5', messages, tools: [echoToolDef], streaming: false },
  { openai, tools, logger: console },
  {
    onMessage: (m) => console.log('assistant:', m.contentText),
    onToolCall: (tc) => console.log('tool call:', tc.name, tc.input),
  },
);

console.log(result.messages[0]?.contentText);
```

Notes
- No DB writes occur inside llloop; the host app is responsible for persistence.
- Only message-level events are emitted initially; reasoning/token streaming hooks can be added later.
