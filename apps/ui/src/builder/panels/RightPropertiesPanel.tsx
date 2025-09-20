import type { BuilderNode } from '../types';

interface Props {
  node: BuilderNode | null;
  onChange: (id: string, data: Partial<BuilderNode['data']>) => void;
}

export function RightPropertiesPanel({ node, onChange }: Props) {
  if (!node) {
    return <div className="text-xs text-muted-foreground">Select a node to edit its properties.</div>;
  }
  const { data } = node;

  const update = (patch: Record<string, unknown>) => onChange(node.id, patch);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Name</label>
        <input value={data.name} onChange={e => update({ name: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
      </div>
      {data.kind === 'slack-trigger' && (
        <div>
          <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Channel</label>
          <input value={data.channel} onChange={e => update({ channel: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
        </div>
      )}
      {data.kind === 'agent' && (
        <>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Model</label>
            <input value={data.model} onChange={e => update({ model: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Description</label>
            <textarea value={data.description} onChange={e => update({ description: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" rows={3} />
          </div>
        </>
      )}
      {data.kind === 'send-slack-message' && (
        <>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Channel</label>
            <input value={data.channel} onChange={e => update({ channel: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Template</label>
            <textarea value={data.template} onChange={e => update({ template: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" rows={3} />
          </div>
        </>
      )}
    </div>
  );
}
