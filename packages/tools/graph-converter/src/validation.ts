import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { GraphEdgeInput, GraphMeta, GraphNode, GraphVariable } from './internal/types.js';
import metaSchema from './schemas/meta.schema.json';
import nodeSchema from './schemas/node.schema.json';
import edgeSchema from './schemas/edge.schema.json';
import variablesSchema from './schemas/variables.schema.json';

type Schema = Record<string, unknown>;

function cloneForStrict(schema: Schema, strict: boolean): Schema {
  if (!strict) return schema;
  return deepClone(schema, enforceNoAdditionalProperties);
}

function deepClone<T>(input: T, transform: (value: any) => any): T {
  if (Array.isArray(input)) {
    return input.map((item) => deepClone(item, transform)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = deepClone(value, transform);
    }
    return transform(result) as T;
  }
  return transform(input);
}

function enforceNoAdditionalProperties(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'object' && value.additionalProperties === undefined) {
    return { ...value, additionalProperties: false };
  }
  return value;
}

function buildAjv(strict: boolean): Ajv {
  const ajv = new Ajv({
    strict,
    allErrors: true,
    coerceTypes: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv;
}

function compileValidator<T>(ajv: Ajv, schema: Schema): ValidateFunction<T> {
  return ajv.compile(schema) as ValidateFunction<T>;
}

export interface Validators {
  meta: ValidateFunction<GraphMeta>;
  node: ValidateFunction<GraphNode>;
  edge: ValidateFunction<GraphEdgeInput>;
  variables: ValidateFunction<GraphVariable[]>;
}

export function createValidators(options: { strict: boolean }): Validators {
  const ajv = buildAjv(options.strict);
  const meta = compileValidator<GraphMeta>(ajv, cloneForStrict(metaSchema, options.strict));
  const node = compileValidator<GraphNode>(ajv, cloneForStrict(nodeSchema, options.strict));
  const edge = compileValidator<GraphEdgeInput>(ajv, cloneForStrict(edgeSchema, options.strict));
  const variables = compileValidator<GraphVariable[]>(ajv, cloneForStrict(variablesSchema, options.strict));
  return { meta, node, edge, variables };
}

export function collectErrors(validate: ValidateFunction<any>, value: unknown): ErrorObject[] {
  const valid = validate(value);
  if (valid) return [];
  return (validate.errors ?? []).map((error) => ({ ...error }));
}

export function formatErrors(errors: ErrorObject[], prefix: string): string[] {
  return errors.map((error) => {
    const instancePath = error.instancePath ? error.instancePath : '/';
    return `${prefix}${instancePath}: ${error.message ?? 'validation error'}`;
  });
}
