// Generic template-driven node implementation using the shared Node component wrapper
import { NodeRF } from './NodeRF';
import type { TemplateNodeSchema } from '@agyn/shared';
import type { NodeTypes } from 'reactflow';

export function makeNodeTypes(templates: TemplateNodeSchema[]): NodeTypes {
  const map: NodeTypes = {};
  for (const t of templates) map[t.name] = NodeRF;
  return map;
}
