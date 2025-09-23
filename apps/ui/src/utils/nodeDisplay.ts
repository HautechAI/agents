import type { NodeKind } from '../components/Badge';

export interface GraphNode {
  id: string;
  template: string; // e.g., 'simpleAgent', 'shellTool', 'containerProvider'
  config?: { title?: string };
}

export interface DisplayNode extends GraphNode {
  kind: NodeKind;
  displayTitle: string; // final title to render
}

export function mapToolCallName(name: string): string {
  // Migration mapping: Bash -> Shell command
  if (name === 'bash_command') return 'shell_command';
  return name;
}

export function computeDisplayTitle(node: GraphNode, templates: Record<string, { title: string; kind: string }>): { displayTitle: string; kind: NodeKind } {
  const tpl = templates[node.template] as { title?: string; kind?: string } | undefined;
  const kind = (tpl?.kind as NodeKind) ?? 'unknown';
  // Use custom config.title if provided, else fallback to template human title, else template name
  const displayTitle = node.config?.title?.trim() || tpl?.title || humanize(node.template);
  return { displayTitle, kind };
}

export function augmentGraphWithTemplates(graph: any, templates: Record<string, { title: string; kind: string }>): DisplayNode[] {
  const nodes: GraphNode[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes.map((n) => {
    const { displayTitle, kind } = computeDisplayTitle(n, templates);
    return { ...n, displayTitle, kind } as DisplayNode;
  });
}

function humanize(s: string): string {
  // Basic humanization: split camelCase / snake_case
  const spaced = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
