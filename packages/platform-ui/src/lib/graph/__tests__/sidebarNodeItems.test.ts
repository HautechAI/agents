import { describe, expect, it } from 'vitest';
import { mapTemplatesToSidebarItems } from '../sidebarNodeItems';

describe('mapTemplatesToSidebarItems', () => {
  it('maps templates to draggable node items with normalized kinds and titles', () => {
    const items = mapTemplatesToSidebarItems([
      { name: 'trigger-http', title: 'HTTP Trigger', kind: 'trigger', sourcePorts: [], targetPorts: [] },
      { name: 'agent-basic', title: '  ', kind: 'agent', sourcePorts: [], targetPorts: [] },
      { name: 'tool-search', title: 'Search Tool', kind: 'tool', sourcePorts: [], targetPorts: [] },
      { name: 'workspace-dev', title: 'Dev Workspace', kind: 'service', sourcePorts: [], targetPorts: [] },
      { name: 'mcp-db', title: 'Database MCP', kind: 'mcp', sourcePorts: [], targetPorts: [] },
    ]);

    expect(items).toEqual([
      { id: 'trigger-http', kind: 'Trigger', title: 'HTTP Trigger' },
      { id: 'agent-basic', kind: 'Agent', title: 'agent-basic' },
      { id: 'tool-search', kind: 'Tool', title: 'Search Tool' },
      { id: 'workspace-dev', kind: 'Workspace', title: 'Dev Workspace' },
      { id: 'mcp-db', kind: 'MCP', title: 'Database MCP' },
    ]);
  });

  it('omits templates with invalid names, kinds, or duplicates', () => {
    const items = mapTemplatesToSidebarItems([
      { name: '', title: 'Missing name', kind: 'trigger', sourcePorts: [], targetPorts: [] },
      { name: 'tool-unknown', title: 'Unknown', kind: 'unknown', sourcePorts: [], targetPorts: [] },
      { name: 'tool-valid', title: 'Valid Tool', kind: 'tool', sourcePorts: [], targetPorts: [] },
      { name: 'tool-valid', title: 'Duplicate', kind: 'tool', sourcePorts: [], targetPorts: [] },
      // @ts-expect-error simulate unexpected payload
      { },
    ] as any);

    expect(items).toEqual([
      { id: 'tool-valid', kind: 'Tool', title: 'Valid Tool' },
    ]);
  });
});
