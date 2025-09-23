export async function fetchTemplates(): Promise<Record<string, { title: string; kind: 'trigger'|'agent'|'tool'|'mcp' }>> {
  const res = await fetch('/api/templates');
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  const data = await res.json();
  // Expecting data like { templates: { [templateName]: { title, kind } } }
  return data.templates ?? {};
}

export async function fetchGraph(): Promise<any> {
  const res = await fetch('/api/graph');
  if (!res.ok) throw new Error(`Failed to fetch graph: ${res.status}`);
  const data = await res.json();
  return data?.graph ?? data;
}
