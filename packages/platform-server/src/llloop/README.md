llloop (embedded in platform-server)

Lightweight LLM turn engine used by the platform. No DB writes occur here; persistence is handled by platform-server services.

Usage example

```ts
import OpenAI from 'openai';
import { runTurn } from '../llloop/engine';
import type { Message, Tool, ToolDef, ToolRegistry } from '../llloop/types';

class SimpleRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  add(t: Tool) { this.tools.set(t.name, t); }
  get(name: string) { return this.tools.get(name); }
  list() { return Array.from(this.tools.values()); }
}

const echoDef: ToolDef = {
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

const registry = new SimpleRegistry();
registry.add(echoTool);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const messages: Message[] = [
  { role: 'system', contentText: 'You are a helpful assistant.' },
  { role: 'user', contentText: 'Say hello and call echo with text="hi".' },
];

const result = await runTurn(
  { model: 'gpt-5', messages, tools: [echoDef], streaming: false },
  { openai, tools: registry, logger: console },
  {
    onMessage: (m) => console.log('assistant:', m.contentText),
    onToolCall: (tc) => console.log('tool call:', tc.name, tc.input),
  },
);

console.log(result.messages[0]?.contentText);
```

Notes
- No DB writes here; platform-server services handle persistence.
- Only message-level events initially; hooks for streaming can be added later.

