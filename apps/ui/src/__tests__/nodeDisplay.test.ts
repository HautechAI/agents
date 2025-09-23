import { describe, it, expect } from 'vitest';
import { augmentGraphWithTemplates, computeDisplayTitle, mapToolCallName } from '../utils/nodeDisplay';

describe('node display helpers', () => {
  const templates = {
    simpleAgent: { title: 'Agent', kind: 'agent' },
    shellTool: { title: 'Shell', kind: 'tool' },
    githubCloneRepoTool: { title: 'Github clone', kind: 'tool' },
    containerProvider: { title: 'Workspace', kind: 'tool' },
  } as Record<string, { title: string; kind: string }>;

  it('respects config.title override', () => {
    const n = { id: 'n1', template: 'simpleAgent', config: { title: 'My Agent' } };
    const { displayTitle, kind } = computeDisplayTitle(n as any, templates);
    expect(displayTitle).toBe('My Agent');
    expect(kind).toBe('agent');
  });

  it('falls back to template title when no custom title', () => {
    const n = { id: 'n2', template: 'shellTool' };
    const { displayTitle, kind } = computeDisplayTitle(n as any, templates);
    expect(displayTitle).toBe('Shell');
    expect(kind).toBe('tool');
  });

  it('humanizes template name if metadata missing', () => {
    const n = { id: 'n3', template: 'someUnknownTemplate' };
    const { displayTitle, kind } = computeDisplayTitle(n as any, {} as any);
    expect(displayTitle).toBe('Some Unknown Template');
    expect(kind).toBe('unknown');
  });

  it('augmentGraphWithTemplates maps nodes correctly', () => {
    const graph = { nodes: [
      { id: 'a', template: 'simpleAgent' },
      { id: 'b', template: 'containerProvider' },
    ]};
    const res = augmentGraphWithTemplates(graph, templates);
    expect(res).toMatchInlineSnapshot(`
      [
        {
          "config": undefined,
          "displayTitle": "Agent",
          "id": "a",
          "kind": "agent",
          "template": "simpleAgent",
        },
        {
          "config": undefined,
          "displayTitle": "Workspace",
          "id": "b",
          "kind": "tool",
          "template": "containerProvider",
        },
      ]
    `);
  });

  it('migrates bash_command to shell_command', () => {
    expect(mapToolCallName('bash_command')).toBe('shell_command');
    expect(mapToolCallName('shell_command')).toBe('shell_command');
    expect(mapToolCallName('other')).toBe('other');
  });
});
