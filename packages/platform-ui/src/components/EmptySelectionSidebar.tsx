import { AlertCircle, Loader2, Plus } from 'lucide-react';
import Badge from './Badge';

export interface DraggableNodeItem {
  id: string;
  kind: 'Trigger' | 'Agent' | 'Tool' | 'MCP' | 'Workspace';
  title: string;
  description?: string;
}

const nodeKindConfig = {
  Trigger: { color: 'var(--agyn-yellow)', bgColor: 'var(--agyn-bg-yellow)' },
  Agent: { color: 'var(--agyn-blue)', bgColor: 'var(--agyn-bg-blue)' },
  Tool: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)' },
  MCP: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)' },
  Workspace: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)' },
};

interface EmptySelectionSidebarProps {
  nodeItems?: DraggableNodeItem[];
  onNodeDragStart?: (nodeType: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export default function EmptySelectionSidebar({
  nodeItems,
  onNodeDragStart,
  isLoading = false,
  errorMessage = null,
}: EmptySelectionSidebarProps) {
  const items = Array.isArray(nodeItems)
    ? nodeItems.filter((item): item is DraggableNodeItem =>
        !!item && typeof item.id === 'string' && item.id.length > 0 && typeof item.kind === 'string' && typeof item.title === 'string',
      )
    : [];
  const hasItems = items.length > 0;
  const dragDisabled = !!errorMessage;

  const handleDragStart = (event: React.DragEvent, item: DraggableNodeItem) => {
    if (dragDisabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/reactflow', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
    if (onNodeDragStart) {
      onNodeDragStart(item.kind);
    }
  };

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[var(--agyn-bg-blue)] flex items-center justify-center flex-shrink-0">
            <Plus size={20} style={{ color: 'var(--agyn-blue)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-[var(--agyn-dark)]">Build Your AI Team</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-0.5">
              Add agents and tools to shape your own processes
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-4">
          {errorMessage ? (
            <div className="flex items-start gap-2 rounded-[10px] border border-[var(--agyn-status-failed)] bg-[var(--agyn-status-failed-bg)] px-3 py-2">
              <AlertCircle className="h-4 w-4 text-[var(--agyn-status-failed)] mt-0.5" />
              <p className="text-sm text-[var(--agyn-status-failed)]">
                {errorMessage}
              </p>
            </div>
          ) : null}

          {isLoading && !hasItems ? (
            <div className="flex items-center gap-2 text-sm text-[var(--agyn-gray)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading templates…</span>
            </div>
          ) : null}

          {!isLoading && !hasItems && !errorMessage ? (
            <div className="text-sm text-[var(--agyn-gray)]">
              No templates available
            </div>
          ) : null}

          {hasItems ? (
            <>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">
                Drag to Canvas
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  const config = nodeKindConfig[item.kind];
                  return (
                    <div
                      key={item.id}
                      draggable={!dragDisabled}
                      aria-disabled={dragDisabled || undefined}
                      onDragStart={(e) => handleDragStart(e, item)}
                      className={`p-3 rounded-[8px] border border-[var(--agyn-border-subtle)] bg-white transition-all ${
                        dragDisabled
                          ? 'cursor-not-allowed opacity-70'
                          : 'hover:border-[var(--agyn-border-medium)] hover:shadow-sm cursor-grab active:cursor-grabbing'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge size="sm" color={config.color} bgColor={config.bgColor}>
                              {item.kind}
                            </Badge>
                            <span className="text-sm text-[var(--agyn-dark)]">
                              {item.title}
                            </span>
                          </div>
                          {item.description ? (
                            <p className="text-xs text-[var(--agyn-gray)] leading-relaxed">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
