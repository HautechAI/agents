import {
  BuildResult,
  DependencyBag,
  Endpoint,
  FactoryContext,
  GraphBuilderOptions,
  GraphDefinition,
  GraphError,
  HandleRegistryLike,
  MethodEndpoint,
  NodeDef,
  PropertyEndpoint,
  SelfEndpoint,
  TemplateRegistryLike,
} from './types';
import { Errors } from './errors';

const SELF_HANDLE = '$self';

export class GraphBuilderService {
  constructor(
    private readonly templateRegistry: TemplateRegistryLike,
    private readonly handleRegistry: HandleRegistryLike,
  ) {}

  async build(graph: GraphDefinition, deps: DependencyBag, options: GraphBuilderOptions = {}): Promise<BuildResult> {
    const instances: Record<string, unknown> = {};
    const errors: GraphError[] = [];
    const pushError = (err: GraphError) => {
      if (options.continueOnError) {
        errors.push(err);
        return false; // signal to continue
      }
      throw err;
    };

    // 1. Node ID uniqueness
    const seen = new Set<string>();
    for (const node of graph.nodes) {
      if (seen.has(node.id)) {
        if (!pushError(Errors.duplicateNodeId(node.id))) break;
      }
      seen.add(node.id);
    }

    // 2. Instantiate nodes sequentially (ordering responsibility is external if factories depend on prior nodes)
    for (const node of graph.nodes) {
      if (instances[node.id]) continue; // already created (should not happen unless duplicate)
      const factory = this.templateRegistry.get(node.data.template);
      if (!factory) {
        if (!pushError(Errors.unknownTemplate(node.data.template, node.id))) break;
        continue;
      }
      const ctx: FactoryContext = {
        deps,
        get: (id: string) => {
          if (!(id in instances)) {
            throw Errors.unreadyDependency(node.id, id);
          }
          return instances[id];
        },
      };
      try {
        const created = await factory(ctx);
        instances[node.id] = created;
      } catch (e) {
        if (!pushError(
          new GraphError({
            code: 'FACTORY_ERROR',
            message: `Factory for node ${node.id} (template ${node.data.template}) threw: ${(e as Error).message}`,
            nodeId: node.id,
            template: node.data.template,
            cause: e,
          }),
        )) {
          break;
        }
      }
    }

    // 3. Apply configs automatically
    for (const node of graph.nodes) {
      const cfg = node.data.config;
      if (!cfg) continue;
      const inst: any = instances[node.id]; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!inst) continue; // previous error
      if (typeof inst.setConfig === 'function') {
        try {
          await inst.setConfig(cfg);
        } catch (e) {
          if (!pushError(
            new GraphError({
              code: 'SET_CONFIG_ERROR',
              message: `setConfig failed for node ${node.id}: ${(e as Error).message}`,
              nodeId: node.id,
              cause: e,
            }),
          )) {
            break;
          }
        }
      } else if (options.warnOnMissingSetConfig) {
        // treat as warning (store in errors with special code but continue)
        errors.push(Errors.missingSetConfig(node.id));
      }
    }

    // 4. Execute edges sequentially
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      const sourceInst = instances[edge.source];
      const targetInst = instances[edge.target];
      if (!sourceInst) {
        if (!pushError(Errors.missingNode(edge.source, i))) break;
        continue;
      }
      if (!targetInst) {
        if (!pushError(Errors.missingNode(edge.target, i))) break;
        continue;
      }

      const sourceNodeDef = graph.nodes.find((n) => n.id === edge.source)!;
      const targetNodeDef = graph.nodes.find((n) => n.id === edge.target)!;

      const sourceEndpoint = this.resolveEndpoint(sourceInst, sourceNodeDef, edge.sourceHandle, i);
      if (!sourceEndpoint) {
        if (!pushError(Errors.unresolvedHandle(edge.sourceHandle, edge.source, i))) break;
        continue;
      }
      const targetEndpoint = this.resolveEndpoint(targetInst, targetNodeDef, edge.targetHandle, i);
      if (!targetEndpoint) {
        if (!pushError(Errors.unresolvedHandle(edge.targetHandle, edge.target, i))) break;
        continue;
      }

      const bothMethods = sourceEndpoint.type === 'method' && targetEndpoint.type === 'method';
      const noMethod = sourceEndpoint.type !== 'method' && targetEndpoint.type !== 'method';
      if (bothMethods) {
        if (!pushError(Errors.ambiguousCallable(i))) break;
        continue;
      }
      if (noMethod) {
        if (!pushError(Errors.missingCallable(i))) break;
        continue;
      }

      // Identify callable & argument endpoint
      const callable: MethodEndpoint = (sourceEndpoint.type === 'method'
        ? sourceEndpoint
        : (targetEndpoint as MethodEndpoint));
      const argEndpoint: Endpoint = callable === sourceEndpoint ? targetEndpoint : sourceEndpoint;

      const argValue = this.extractArgumentValue(argEndpoint);
      try {
        await callable.fn.call(callable.owner, argValue);
      } catch (e) {
        if (!pushError(Errors.invocationError(i, e))) break;
      }
    }

    return { instances, errors };
  }

  private resolveEndpoint(instance: any, node: NodeDef, handle: string, edgeIndex: number): Endpoint | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (handle === SELF_HANDLE) {
      return { type: 'self', owner: instance } as SelfEndpoint;
    }

    // First attempt explicit handle registry resolution
    const epFromRegistry = this.handleRegistry.resolve(instance, node.data.template, handle);
    if (epFromRegistry) return epFromRegistry;

    // Fallback: direct property on the instance
    if (handle in instance) {
      const value = instance[handle];
      if (typeof value === 'function') {
        return { type: 'method', key: handle, fn: value, owner: instance } as MethodEndpoint;
      }
      return { type: 'property', key: handle, owner: instance } as PropertyEndpoint;
    }

    return undefined; // unresolved
  }

  private extractArgumentValue(endpoint: Endpoint): unknown {
    switch (endpoint.type) {
      case 'self':
        return endpoint.owner;
      case 'property':
        return endpoint.owner[endpoint.key];
      case 'method':
        // Should never be argument; validation ensures only one method
        return undefined;
    }
  }
}
