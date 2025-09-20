import { useDrag } from 'react-dnd';
import { DND_ITEM_NODE } from '../dnd';
import type { BuilderNodeKind } from '../types';

const ITEMS: { kind: BuilderNodeKind; label: string; accent: string }[] = [
  { kind: 'slack-trigger', label: 'Slack Trigger', accent: 'text-blue-600' },
  { kind: 'agent', label: 'Agent', accent: 'text-emerald-600' },
  { kind: 'send-slack-message', label: 'Send Slack', accent: 'text-violet-600' }
];

function PaletteItem({ kind, label, accent }: { kind: BuilderNodeKind; label: string; accent: string }) {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: DND_ITEM_NODE,
    item: { kind },
    collect: monitor => ({ isDragging: monitor.isDragging() })
  }), [kind]);
  const setRef = (el: HTMLDivElement | null) => {
    if (el) dragRef(el);
  };
  return (
    <div ref={setRef} className={`cursor-move select-none rounded border bg-card px-2 py-1 text-xs shadow-sm ${isDragging ? 'opacity-50' : ''}`}>
      <span className={accent}>{label}</span>
    </div>
  );
}

export function LeftPalette() {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Nodes</div>
      {ITEMS.map(i => <PaletteItem key={i.kind} {...i} />)}
    </div>
  );
}
