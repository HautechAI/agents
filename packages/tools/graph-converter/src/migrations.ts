import type { JsonValue } from './internal/types.js';
import { deriveNodeIdFromPath } from './fs.js';
import { deterministicEdgeId } from './internal/graph.js';

export function migrateNode(input: unknown, relativePath: string): Record<string, JsonValue> {
  const value = asRecord(input);
  const result: Record<string, JsonValue> = {};
  const derivedId = deriveNodeIdFromPath(relativePath);
  const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : derivedId;
  result.id = id;
  if (typeof value.template === 'string') {
    result.template = value.template;
  }
  if ('config' in value) {
    result.config = value.config as JsonValue;
  }
  if ('state' in value) {
    result.state = value.state as JsonValue;
  }
  if (isPosition(value.position)) {
    result.position = value.position;
  }
  return result;
}

export function migrateEdge(input: unknown): Record<string, JsonValue> {
  const value = asRecord(input);
  const result: Record<string, JsonValue> = {};

  if ('source' in value) result.source = value.source as JsonValue;
  if ('sourceHandle' in value) result.sourceHandle = value.sourceHandle as JsonValue;
  if ('target' in value) result.target = value.target as JsonValue;
  if ('targetHandle' in value) result.targetHandle = value.targetHandle as JsonValue;

  if (
    typeof value.source === 'string' &&
    typeof value.sourceHandle === 'string' &&
    typeof value.target === 'string' &&
    typeof value.targetHandle === 'string'
  ) {
    result.id = deterministicEdgeId({
      source: value.source,
      sourceHandle: value.sourceHandle,
      target: value.target,
      targetHandle: value.targetHandle,
    });
  }

  return result;
}

export function migrateVariables(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  return input.map((item) => {
    const record = asRecord(item);
    return {
      key: String(record.key ?? ''),
      value: String(record.value ?? ''),
    };
  });
}

function asRecord(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object') return {};
  return input as Record<string, any>;
}

function isPosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.x === 'number' && typeof record.y === 'number';
}
