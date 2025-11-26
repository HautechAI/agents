import path from 'node:path';
import { createValidators, collectErrors, formatErrors } from './validation.js';
import { normalizeDataset, serializeYaml, deterministicEdgeId } from './internal/graph.js';
import type {
  GraphDataset,
  GraphEdgeInput,
  GraphMeta,
  GraphNode,
  GraphVariable,
  NormalizedGraph,
} from './internal/types.js';
import type { Logger } from './log.js';
import {
  DEFAULT_PATTERNS,
  discoverGraphFiles,
  readJsonFile,
  writeYamlFile,
  backupOriginal,
  deriveNodeIdFromPath,
  type GraphFileDescriptor,
} from './fs.js';
import { migrateNode, migrateEdge, migrateVariables } from './migrations.js';

export interface ConverterOptions {
  root: string;
  patterns: string[];
  inPlace: boolean;
  backupExt?: string | null;
  dryRun: boolean;
  outputExt: string;
  atomic: boolean;
  validateOnly: boolean;
  schemaMigrate: boolean;
  strict: boolean;
}

export interface ConvertedFile {
  inputPath: string;
  outputPath: string;
  wrote: boolean;
}

export interface ConversionResult {
  converted: ConvertedFile[];
  validationErrors: string[];
  ioErrors: string[];
  skipped: string[];
}

interface LoadedNode {
  descriptor: GraphFileDescriptor;
  value: GraphNode;
}

interface LoadedEdge {
  descriptor: GraphFileDescriptor;
  value: GraphEdgeInput;
}

interface LoadedVariables {
  descriptor: GraphFileDescriptor;
  value: GraphVariable[];
}

interface LoadContext {
  dataset: GraphDataset;
  nodes: LoadedNode[];
  edges: LoadedEdge[];
  variables: LoadedVariables | null;
  meta: { descriptor: GraphFileDescriptor; value: GraphMeta } | null;
}

export async function convertGraphs(options: ConverterOptions, logger: Logger): Promise<ConversionResult> {
  const patterns = options.patterns.length ? options.patterns : DEFAULT_PATTERNS;
  const descriptors = await discoverGraphFiles(options.root, patterns);

  const converted: ConvertedFile[] = [];
  const validationErrors: string[] = [];
  const ioErrors: string[] = [];
  const skipped: string[] = [];

  if (!descriptors.length) {
    validationErrors.push('No files matched the requested patterns.');
    return { converted, validationErrors, ioErrors, skipped };
  }

  const validators = createValidators({ strict: options.strict });
  const loadContext: LoadContext = {
    dataset: { meta: null, nodes: [], edges: [], variables: [] },
    nodes: [],
    edges: [],
    variables: null,
    meta: null,
  };

  for (const descriptor of descriptors) {
    logger.debug(`Reading ${descriptor.relativePath}`);
    let parsed: unknown;
    try {
      parsed = await readJsonFile(descriptor.absolutePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ioErrors.push(`Failed to read ${descriptor.relativePath}: ${message}`);
      continue;
    }

    const migrated = applyMigration(parsed, descriptor, options.schemaMigrate);

    switch (descriptor.kind) {
      case 'meta':
        handleMeta(descriptor, migrated, validators, loadContext, validationErrors);
        break;
      case 'node':
        handleNode(descriptor, migrated, validators, loadContext, validationErrors, options.schemaMigrate);
        break;
      case 'edge':
        handleEdge(descriptor, migrated, validators, loadContext, validationErrors, options.schemaMigrate);
        break;
      case 'variables':
        handleVariables(descriptor, migrated, validators, loadContext, validationErrors);
        break;
      default:
        skipped.push(descriptor.relativePath);
        break;
    }
  }

  if (!loadContext.dataset.meta) {
    validationErrors.push('graph.meta.json is required for conversion.');
  }

  if (ioErrors.length || validationErrors.length) {
    return { converted, validationErrors, ioErrors, skipped };
  }

  let normalized: NormalizedGraph;
  try {
    normalized = normalizeDataset(loadContext.dataset);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    validationErrors.push(message);
    return { converted, validationErrors, ioErrors, skipped };
  }

  const outputExt = normalizeExtension(options.outputExt);
  const writes = buildWritePlan({ normalized, loadContext, options, outputExt });

  for (const write of writes) {
    const { descriptor, value, yamlPath } = write;
    const yaml = serializeYaml(value);
    const willWrite = options.inPlace && !options.validateOnly && !options.dryRun;

    try {
      if (willWrite) {
        logger.info(`Writing ${relativePath(options.root, yamlPath)}`);
        await writeYamlFile(yamlPath, yaml, options.atomic);
        if (options.backupExt) {
          await backupOriginal(descriptor.absolutePath, options.backupExt);
        }
      } else {
        logger.info(`Prepared ${relativePath(options.root, yamlPath)} (skipped)`);
      }

      converted.push({
        inputPath: relativePath(options.root, descriptor.absolutePath),
        outputPath: relativePath(options.root, yamlPath),
        wrote: willWrite,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ioErrors.push(`Failed to write ${relativePath(options.root, yamlPath)}: ${message}`);
      break;
    }
  }

  return { converted, validationErrors, ioErrors, skipped };
}

function applyMigration(value: unknown, descriptor: GraphFileDescriptor, enabled: boolean): unknown {
  if (!enabled) return value;
  if (descriptor.kind === 'node') return migrateNode(value, descriptor.relativePath);
  if (descriptor.kind === 'edge') return migrateEdge(value);
  if (descriptor.kind === 'variables') return migrateVariables(value);
  return value;
}

function handleMeta(
  descriptor: GraphFileDescriptor,
  value: unknown,
  validators: ReturnType<typeof createValidators>,
  ctx: LoadContext,
  validationErrors: string[],
): void {
  const errors = collectErrors(validators.meta, value);
  if (errors.length) {
    validationErrors.push(...formatErrors(errors, `${descriptor.relativePath}`));
    return;
  }
  const meta = value as GraphMeta;
  if (ctx.meta) {
    validationErrors.push(`Duplicate graph.meta.json encountered at ${descriptor.relativePath}`);
    return;
  }
  ctx.meta = { descriptor, value: meta };
  ctx.dataset.meta = meta;
}

function handleNode(
  descriptor: GraphFileDescriptor,
  value: unknown,
  validators: ReturnType<typeof createValidators>,
  ctx: LoadContext,
  validationErrors: string[],
  schemaMigrate: boolean,
): void {
  const errors = collectErrors(validators.node, value);
  if (errors.length) {
    validationErrors.push(...formatErrors(errors, `${descriptor.relativePath}`));
    return;
  }
  const node = value as GraphNode;
  if (!schemaMigrate) {
    const expected = deriveNodeIdFromPath(descriptor.relativePath);
    if (node.id !== expected) {
      validationErrors.push(
        `${descriptor.relativePath}: node id mismatch; expected ${expected} but found ${node.id}`,
      );
      return;
    }
  }
  ctx.nodes.push({ descriptor, value: node });
  ctx.dataset.nodes.push(node);
}

function handleEdge(
  descriptor: GraphFileDescriptor,
  value: unknown,
  validators: ReturnType<typeof createValidators>,
  ctx: LoadContext,
  validationErrors: string[],
  schemaMigrate: boolean,
): void {
  const errors = collectErrors(validators.edge, value);
  if (errors.length) {
    validationErrors.push(...formatErrors(errors, `${descriptor.relativePath}`));
    return;
  }
  const edge = value as GraphEdgeInput;
  const expectedId = deterministicEdgeId(edge);
  if (!schemaMigrate) {
    if (!edge.id) {
      validationErrors.push(
        `${descriptor.relativePath}: missing edge id; expected ${expectedId}`,
      );
      return;
    }
    if (edge.id !== expectedId) {
      validationErrors.push(
        `${descriptor.relativePath}: edge id mismatch; expected ${expectedId} but found ${edge.id}`,
      );
      return;
    }
  } else {
    edge.id = expectedId;
  }
  ctx.edges.push({ descriptor, value: edge });
  ctx.dataset.edges.push(edge);
}

function handleVariables(
  descriptor: GraphFileDescriptor,
  value: unknown,
  validators: ReturnType<typeof createValidators>,
  ctx: LoadContext,
  validationErrors: string[],
): void {
  const errors = collectErrors(validators.variables, value);
  if (errors.length) {
    validationErrors.push(...formatErrors(errors, `${descriptor.relativePath}`));
    return;
  }
  const vars = value as GraphVariable[];
  if (ctx.variables) {
    validationErrors.push(`Duplicate variables.json encountered at ${descriptor.relativePath}`);
    return;
  }
  ctx.variables = { descriptor, value: vars };
  ctx.dataset.variables = vars;
}

function buildWritePlan(args: {
  normalized: NormalizedGraph;
  loadContext: LoadContext;
  options: ConverterOptions;
  outputExt: string;
}): Array<{ descriptor: GraphFileDescriptor; yamlPath: string; value: unknown }> {
  const { normalized, loadContext, outputExt } = args;
  const writes: Array<{ descriptor: GraphFileDescriptor; yamlPath: string; value: unknown }> = [];

  if (loadContext.meta) {
    writes.push({
      descriptor: loadContext.meta.descriptor,
      yamlPath: replaceExtension(loadContext.meta.descriptor.absolutePath, outputExt),
      value: normalized.meta,
    });
  }

  for (const nodeEntry of loadContext.nodes) {
    const node = normalized.nodes.find((candidate) => candidate.id === nodeEntry.value.id);
    if (!node) {
      throw new Error(`Normalized graph lost node ${nodeEntry.value.id}`);
    }
    writes.push({
      descriptor: nodeEntry.descriptor,
      yamlPath: replaceExtension(nodeEntry.descriptor.absolutePath, outputExt),
      value: node,
    });
  }

  for (const edgeEntry of loadContext.edges) {
    const edgeId = deterministicEdgeId(edgeEntry.value);
    const edge = normalized.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) {
      throw new Error(`Normalized graph lost edge ${edgeId}`);
    }
    writes.push({
      descriptor: edgeEntry.descriptor,
      yamlPath: replaceExtension(edgeEntry.descriptor.absolutePath, outputExt),
      value: edge,
    });
  }

  if (loadContext.variables) {
    writes.push({
      descriptor: loadContext.variables.descriptor,
      yamlPath: replaceExtension(loadContext.variables.descriptor.absolutePath, outputExt),
      value: normalized.variables,
    });
  }

  return writes;
}

function replaceExtension(filePath: string, ext: string): string {
  if (filePath.toLowerCase().endsWith('.json')) {
    return `${filePath.slice(0, -5)}${ext}`;
  }
  return `${filePath}${ext}`;
}

function normalizeExtension(ext: string): string {
  return ext.startsWith('.') ? ext : `.${ext}`;
}

function relativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}
