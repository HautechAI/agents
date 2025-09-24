import { Collection, Db } from 'mongodb';
import { LoggerService } from './logger.service';
import { TemplateRegistry } from '../graph/templateRegistry';
import {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
  TemplateNodeSchema,
} from '../graph/types';
import type { ProvisionStatus } from '../graph/capabilities';
import { LiveGraphRuntime } from '../graph/liveGraph.manager';

interface GraphDocument {
  _id: string; // name
  version: number;
  updatedAt: Date;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}

export class GraphService {
  private collection?: Collection<GraphDocument>;
  // Simple registry mapping graph name to its runtime. In production, this should be managed by a runtime manager.
  private runtimes = new Map<string, LiveGraphRuntime>();

  constructor(
    private readonly db: Db,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    this.collection = this.db.collection<GraphDocument>('graphs');
  }

  attachRuntime(name: string, runtime: LiveGraphRuntime) {
    this.runtimes.set(name, runtime);
  }

  async get(name: string): Promise<PersistedGraph | null> {
    const doc = await this.collection!.findOne({ _id: name });
    if (!doc) return null;
    return this.toPersisted(doc);
  }

  async upsert(req: PersistedGraphUpsertRequest): Promise<PersistedGraphUpsertResponse> {
    const schema = this.templateRegistry.toSchema();
    this.validate(req, schema);
    const now = new Date();
    const name = req.name;
    const existing = await this.collection!.findOne({ _id: name });
    if (!existing) {
      const doc: GraphDocument = {
        _id: name,
        version: 1,
        updatedAt: now,
        nodes: req.nodes.map(this.stripInternalNode),
        edges: req.edges.map(this.stripInternalEdge),
      };
      await this.collection!.insertOne(doc);
      return this.toPersisted(doc);
    }
    // optimistic lock check
    if (req.version !== undefined && req.version !== existing.version) {
      const err: any = new Error('Version conflict');
      err.code = 'VERSION_CONFLICT';
      err.current = this.toPersisted(existing);
      throw err;
    }
    const updated: GraphDocument = {
      _id: name,
      version: existing.version + 1,
      updatedAt: now,
      nodes: req.nodes.map(this.stripInternalNode),
      edges: req.edges.map(this.stripInternalEdge),
    };
    await this.collection!.replaceOne({ _id: name }, updated);
    return this.toPersisted(updated);
  }

  // API-like helpers to be wired to HTTP in a follow-up
  getTemplates() {
    return this.templateRegistry.toSchema();
  }

  getNodeStatus(name: string, nodeId: string): { isPaused?: boolean; provisionStatus?: ProvisionStatus; dynamicConfigReady?: boolean } | null {
    const rt = this.runtimes.get(name);
    if (!rt) return null;
    return rt.getNodeStatus(nodeId);
  }

  async nodeAction(
    name: string,
    nodeId: string,
    action: 'pause' | 'resume' | 'provision' | 'deprovision',
  ): Promise<void> {
    const rt = this.runtimes.get(name);
    if (!rt) return;
    if (action === 'pause') return rt.pauseNode(nodeId);
    if (action === 'resume') return rt.resumeNode(nodeId);
    if (action === 'provision') return rt.provisionNode(nodeId);
    if (action === 'deprovision') return rt.deprovisionNode(nodeId);
  }

  async setNodeConfig(name: string, nodeId: string, cfg: Record<string, unknown>): Promise<void> {
    const rt = this.runtimes.get(name);
    if (!rt) return; // TODO: decide whether to persist-only if runtime not attached
    const inst: any = rt.getNodeInstance(nodeId);
    if (inst && typeof inst.setConfig === 'function') await inst.setConfig(cfg);
  }

  async setNodeDynamicConfig(name: string, nodeId: string, cfg: Record<string, unknown>): Promise<void> {
    const rt = this.runtimes.get(name);
    if (!rt) return;
    const inst: any = rt.getNodeInstance(nodeId);
    if (inst && typeof inst.setDynamicConfig === 'function') await inst.setDynamicConfig(cfg);
  }

  private validate(req: PersistedGraphUpsertRequest, schema: TemplateNodeSchema[]) {
    const templateSet = new Set(schema.map((s) => s.name));
    const schemaMap = new Map(schema.map((s) => [s.name, s] as const));
    const nodeIds = new Set<string>();
    for (const n of req.nodes) {
      if (!n.id) throw new Error(`Node missing id`);
      if (nodeIds.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
      nodeIds.add(n.id);
      if (!templateSet.has(n.template)) throw new Error(`Unknown template ${n.template}`);
    }
    for (const e of req.edges) {
      if (!nodeIds.has(e.source)) throw new Error(`Edge source missing node ${e.source}`);
      if (!nodeIds.has(e.target)) throw new Error(`Edge target missing node ${e.target}`);
      const sourceNode = req.nodes.find((n) => n.id === e.source)!;
      const targetNode = req.nodes.find((n) => n.id === e.target)!;
      const sourceSchema = schemaMap.get(sourceNode.template)!;
      const targetSchema = schemaMap.get(targetNode.template)!;
      if (!sourceSchema.sourcePorts.includes(e.sourceHandle)) {
        throw new Error(`Invalid source handle ${e.sourceHandle} on template ${sourceNode.template}`);
      }
      if (!targetSchema.targetPorts.includes(e.targetHandle)) {
        throw new Error(`Invalid target handle ${e.targetHandle} on template ${targetNode.template}`);
      }
    }
  }

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return { id: n.id, template: n.template, config: n.config, position: n.position };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private toPersisted(doc: GraphDocument): PersistedGraph {
    return {
      name: doc._id,
      version: doc.version,
      updatedAt: doc.updatedAt.toISOString(),
      nodes: doc.nodes,
      edges: doc.edges,
    };
  }
}
