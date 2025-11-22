import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import Node, { type NodeKind } from '@agyn/ui-new/components/Node';
import { useTemplates } from '../useTemplates';
import { getKind } from '../lib/display';

interface BuilderNodeData {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
}

const templateKindToNodeKind: Record<string, NodeKind> = {
  trigger: 'Trigger',
  agent: 'Agent',
  tool: 'Tool',
  mcp: 'MCP',
  service: 'Workspace',
};

function mapTemplateKind(kind?: string): NodeKind {
  return templateKindToNodeKind[kind ?? ''] ?? 'Tool';
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function NodeRFComponent({ id, data, selected }: NodeProps<BuilderNodeData>) {
  const { templates } = useTemplates();
  const schema = useMemo(() => templates.find((t) => t.name === data.template), [templates, data.template]);
  const targetPorts = useMemo(() => schema?.targetPorts ?? [], [schema]);
  const sourcePorts = useMemo(() => schema?.sourcePorts ?? [], [schema]);

  const templateKind = getKind(templates, data.template);
  const nodeKind = mapTemplateKind(templateKind);

  const inputs = useMemo(() => targetPorts.map((port) => ({ id: port, title: port })), [targetPorts]);
  const outputs = useMemo(() => sourcePorts.map((port) => ({ id: port, title: port })), [sourcePorts]);

  const [positions, setPositions] = useState<{ inputs: number[]; outputs: number[] }>({ inputs: [], outputs: [] });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updatePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const columns = Array.from(container.querySelectorAll('.space-y-2')) as HTMLElement[];

    const inputColumn = columns[0];
    const outputColumn = columns[1];

    const nextInputs = inputColumn ? Array.from(inputColumn.children)
      .slice(0, inputs.length)
      .map((child) => {
        const rect = (child as HTMLElement).getBoundingClientRect();
        return rect.top - containerRect.top + rect.height / 2;
      }) : [];

    const nextOutputs = outputColumn ? Array.from(outputColumn.children)
      .slice(0, outputs.length)
      .map((child) => {
        const rect = (child as HTMLElement).getBoundingClientRect();
        return rect.top - containerRect.top + rect.height / 2;
      }) : [];

    setPositions((prev) => {
      if (arraysEqual(prev.inputs, nextInputs) && arraysEqual(prev.outputs, nextOutputs)) return prev;
      return { inputs: nextInputs, outputs: nextOutputs };
    });
  }, [inputs.length, outputs.length]);

  useLayoutEffect(() => {
    updatePositions();
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updatePositions());
    observer.observe(container);

    return () => observer.disconnect();
  }, [updatePositions]);

  return (
    <div ref={containerRef} className="relative">
      <Node
        kind={nodeKind}
        title={id}
        inputs={inputs}
        outputs={outputs}
        selected={selected}
      />
      <div className="pointer-events-none absolute inset-0">
        {positions.inputs.map((top, index) => (
          <Handle
            key={inputs[index]?.id ?? index}
            type="target"
            position={Position.Left}
            id={inputs[index]?.id}
            className="!pointer-events-auto !w-3 !h-3 !bg-transparent !border-none -translate-y-1/2 -translate-x-1/2"
            style={{ top, left: 0 }}
          />
        ))}
        {positions.outputs.map((top, index) => (
          <Handle
            key={outputs[index]?.id ?? index}
            type="source"
            position={Position.Right}
            id={outputs[index]?.id}
            className="!pointer-events-auto !w-3 !h-3 !bg-transparent !border-none -translate-y-1/2 translate-x-1/2"
            style={{ top, right: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

export const NodeRF = memo(NodeRFComponent);
