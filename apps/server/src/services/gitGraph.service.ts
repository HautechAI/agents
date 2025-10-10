import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LoggerService } from './logger.service';
import { TemplateRegistry } from '../graph/templateRegistry';
import { PersistedGraph, PersistedGraphEdge, PersistedGraphNode, PersistedGraphUpsertRequest, PersistedGraphUpsertResponse } from '../graph/types';
import { validatePersistedGraph } from './graph.validation';

export interface GitGraphConfig {
  repoPath: string;
  branch: string; // e.g. graph-state
  defaultAuthor?: { name?: string; email?: string };
  lockTimeoutMs?: number; // advisory lock wait timeout
}

export class GitGraphService {
  constructor(
    private readonly cfg: GitGraphConfig,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {}

  // Repo/bootstrap helpers
  async initIfNeeded(): Promise<void> {
    await fs.mkdir(this.cfg.repoPath, { recursive: true });
    const gitDir = path.join(this.cfg.repoPath, '.git');
    const exists = await this.pathExists(gitDir);
    if (!exists) {
      await this.runGit(['init', '-b', this.cfg.branch], this.cfg.repoPath);
      // Basic .gitignore
      const gi = path.join(this.cfg.repoPath, '.gitignore');
      const ignore = ['node_modules/', '*.tmp', '*.lock', '.DS_Store'];
      await fs.writeFile(gi, ignore.join('\n') + '\n', 'utf8');
      // Seed root-level single-graph layout (format:2)
      await fs.mkdir(path.join(this.cfg.repoPath, 'nodes'), { recursive: true });
      await fs.mkdir(path.join(this.cfg.repoPath, 'edges'), { recursive: true });
      const meta = { name: 'main', version: 0, updatedAt: new Date().toISOString(), format: 2 };
      await this.atomicWriteFile(path.join(this.cfg.repoPath, 'graph.meta.json'), JSON.stringify(meta, null, 2));
      await this.runGit(['add', '.'], this.cfg.repoPath);
      await this.commit('chore(graph): init repository (format:2)', this.cfg.defaultAuthor);
    } else {
      // Ensure branch exists and checked out
      await this.ensureBranch(this.cfg.branch);
    }
  }

  async get(name: string): Promise<PersistedGraph | null> {
    // Prefer root-level per-entity layout in working tree; recover from HEAD if corrupt
    try {
      const metaPath = path.join(this.cfg.repoPath, 'graph.meta.json');
      if (await this.pathExists(metaPath)) {
        return await this.readFromWorkingTreeRoot(name);
      }
    } catch {
      // ignore and try HEAD fallbacks
    }
    const headRoot = await this.readFromHeadRoot(name);
    if (headRoot) return headRoot;
    const headPerGraph = await this.readFromHeadPerGraph(name);
    if (headPerGraph) return headPerGraph;
    const headMonolith = await this.readFromHeadMonolith(name);
    if (headMonolith) return headMonolith;
    return null;
  }

  async upsert(
    req: PersistedGraphUpsertRequest,
    author?: { name?: string; email?: string },
  ): Promise<PersistedGraphUpsertResponse> {
    validatePersistedGraph(req, this.templateRegistry.toSchema());

    const name = req.name;
    const lock = await this.acquireLock();
    try {
      const existing = await this.get(name);
      const nowIso = new Date().toISOString();
      if (!existing) {
        if (req.version !== undefined && req.version !== 0) {
          const err: any = new Error('Version conflict');
          err.code = 'VERSION_CONFLICT';
          err.current = { name, version: 0, updatedAt: nowIso, nodes: [], edges: [] } as PersistedGraph;
          throw err;
        }
      } else if (req.version !== undefined && req.version !== existing.version) {
        const err: any = new Error('Version conflict');
        err.code = 'VERSION_CONFLICT';
        err.current = existing;
        throw err;
      }

      // Normalize nodes and edges; enforce deterministic edge id
      const normalizedNodes = req.nodes.map(this.stripInternalNode);
      const normalizedEdges = req.edges.map((e) => {
        const base = this.stripInternalEdge(e);
        const detId = this.edgeId(base);
        if (base.id && base.id !== detId) {
          const err: any = new Error(`Edge id mismatch: expected ${detId} got ${base.id}`);
          err.code = 'EDGE_ID_MISMATCH';
          throw err;
        }
        return { ...base, id: detId };
      });

      const current = existing ?? { name, version: 0, updatedAt: nowIso, nodes: [], edges: [] };
      const target: PersistedGraph = {
        name,
        version: (current.version || 0) + 1,
        updatedAt: nowIso,
        nodes: normalizedNodes,
        edges: normalizedEdges,
      };

      // Compute deltas
      const { nodeAdds, nodeUpdates, nodeDeletes } = this.diffNodes(current.nodes, target.nodes);
      const { edgeAdds, edgeUpdates, edgeDeletes } = this.diffEdges(current.edges, target.edges);

      const root = this.cfg.repoPath;
      const nodesDir = path.join(root, 'nodes');
      const edgesDir = path.join(root, 'edges');
      await fs.mkdir(nodesDir, { recursive: true });
      await fs.mkdir(edgesDir, { recursive: true });

      const touched: { added: string[]; updated: string[]; deleted: string[] } = { added: [], updated: [], deleted: [] };

      const writeNode = async (n: PersistedGraphNode, isNew: boolean) => {
        const rel = path.posix.join('nodes', `${encodeURIComponent(n.id)}.json`);
        await this.atomicWriteFile(path.join(root, rel), JSON.stringify(n, null, 2));
        (isNew ? touched.added : touched.updated).push(rel);
      };
      const writeEdge = async (e: PersistedGraphEdge, isNew: boolean) => {
        const id = e.id!;
        const rel = path.posix.join('edges', `${encodeURIComponent(id)}.json`);
        await this.atomicWriteFile(path.join(root, rel), JSON.stringify({ ...e, id }, null, 2));
        (isNew ? touched.added : touched.updated).push(rel);
      };
      const delRel = async (rel: string) => {
        try { await fs.unlink(path.join(root, rel)); } catch {}
        touched.deleted.push(rel);
      };

      for (const id of nodeAdds) await writeNode(target.nodes.find((n) => n.id === id)!, true);
      for (const id of nodeUpdates) await writeNode(target.nodes.find((n) => n.id === id)!, false);
      for (const id of nodeDeletes) await delRel(path.posix.join('nodes', `${encodeURIComponent(id)}.json`));

      for (const id of edgeAdds) await writeEdge(target.edges.find((e) => e.id === id)!, true);
      for (const id of edgeUpdates) await writeEdge(target.edges.find((e) => e.id === id)!, false);
      for (const id of edgeDeletes) await delRel(path.posix.join('edges', `${encodeURIComponent(id)}.json`));

      // Update meta last
      const meta = { name, version: target.version, updatedAt: target.updatedAt, format: 2 } as const;
      await this.atomicWriteFile(path.join(root, 'graph.meta.json'), JSON.stringify(meta, null, 2));

      // Stage changes
      const toStage = Array.from(new Set([...touched.added, ...touched.updated, ...touched.deleted, 'graph.meta.json']));
      if (toStage.length) await this.runGit(['add', '--all', ...toStage], root);

      // Remove legacy graphs/ directory if exists
      if (await this.pathExists(path.join(root, 'graphs'))) {
        try { await this.runGit(['rm', '-r', '--ignore-unmatch', 'graphs'], root); } catch {
          try { await fs.rm(path.join(root, 'graphs'), { recursive: true, force: true }); } catch {}
        }
      }

      const deltaMsg = this.deltaSummaryDetailed({ before: current, after: target });
      try {
        await this.commit(`chore(graph): v${target.version} ${deltaMsg}`, author ?? this.cfg.defaultAuthor);
      } catch (e: any) {
        await this.rollbackPaths(touched);
        const err: any = e instanceof Error ? e : new Error(String(e));
        err.code = 'COMMIT_FAILED';
        throw err;
      }
      return target;
    } finally {
      await this.releaseLock(lock);
    }
  }

  // Internal helpers
  // Validation is shared via validatePersistedGraph

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return { id: n.id, template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, position: n.position };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private async atomicWriteFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
    const fd = await fs.open(tmp, 'w');
    try { await fd.writeFile(content); await fd.sync(); } finally { await fd.close(); }
    await fs.rename(tmp, filePath);
    try { const dfd = await fs.open(dir, 'r'); try { await dfd.sync(); } finally { await dfd.close(); } } catch {}
  }

  private async pathExists(p: string) {
    try { await fs.stat(p); return true; } catch { return false; }
  }

  private runGit(args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()))
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
      });
    });
  }

  private runGitCapture(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      let stderr = '';
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
      });
    });
  }

  private async ensureBranch(branch: string) {
    // Try to checkout branch; if missing, create
    try {
      await this.runGit(['rev-parse', '--verify', branch], this.cfg.repoPath);
    } catch {
      await this.runGit(['branch', branch], this.cfg.repoPath);
    }
    await this.runGit(['checkout', branch], this.cfg.repoPath);
  }

  private commit(message: string, author?: { name?: string; email?: string }): Promise<void> {
    const env = { ...process.env };
    if (author?.name) env.GIT_AUTHOR_NAME = author.name;
    if (author?.email) env.GIT_AUTHOR_EMAIL = author.email;
    if (author?.name) env.GIT_COMMITTER_NAME = author.name;
    if (author?.email) env.GIT_COMMITTER_EMAIL = author.email;
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['commit', '-m', message], { cwd: this.cfg.repoPath, env });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git commit failed: ${stderr}`));
      });
    });
  }

  private deltaSummary(before: Pick<PersistedGraph, 'nodes' | 'edges'>, after: Pick<PersistedGraph, 'nodes' | 'edges'>) {
    const dn = after.nodes.length - (before.nodes?.length || 0);
    const de = after.edges.length - (before.edges?.length || 0);
    const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    return `(${sign(dn)} nodes, ${sign(de)} edges)`;
  }

  private deltaSummaryDetailed({ before, after }: { before: PersistedGraph; after: PersistedGraph }) {
    const nd = this.diffNodes(before.nodes, after.nodes);
    const ed = this.diffEdges(before.edges, after.edges);
    const fmt = (adds: string[], upds: string[], dels: string[]) => `add:${adds.length},upd:${upds.length},del:${dels.length}`;
    return `(+${nd.nodeAdds.length}/-${nd.nodeDeletes.length} nodes, +${ed.edgeAdds.length}/-${ed.edgeDeletes.length} edges; changed: nodes=[${fmt(nd.nodeAdds, nd.nodeUpdates, nd.nodeDeletes)}], edges=[${fmt(ed.edgeAdds, ed.edgeUpdates, ed.edgeDeletes)}])`;
  }

  private async safeUnstage(relPosix: string) {
    try { await this.runGit(['restore', '--staged', relPosix], this.cfg.repoPath); } catch {}
  }

  private async rollbackPaths(touched: { added: string[]; updated: string[]; deleted: string[] }) {
    for (const rel of [...touched.updated, ...touched.deleted, 'graph.meta.json']) {
      try { await this.runGit(['restore', '--worktree', '--source', 'HEAD', rel], this.cfg.repoPath); } catch {}
    }
    for (const rel of touched.added) {
      try { await fs.unlink(path.join(this.cfg.repoPath, rel)); } catch {}
    }
  }

  // Advisory lock: repo-root .graph.lock
  private async acquireLock() {
    const lockPath = path.join(this.cfg.repoPath, '.graph.lock');
    const timeout = this.cfg.lockTimeoutMs ?? 5000;
    const start = Date.now();
    while (true) {
      try {
        const fd = await fs.open(lockPath, 'wx');
        // write pid and time for debugging
        await fd.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await fd.close();
        return { lockPath };
      } catch (e) {
        if ((e as any).code === 'EEXIST') {
          if (Date.now() - start > timeout) {
            const err: any = new Error('Lock timeout');
            err.code = 'LOCK_TIMEOUT';
            throw err;
          }
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        throw e;
      }
    }
  }

  private async releaseLock(handle: { lockPath: string } | null | undefined) {
    if (!handle) return;
    try {
      await fs.unlink(handle.lockPath);
    } catch {}
  }

  // Root-level readers and fallbacks
  private async readFromWorkingTreeRoot(name: string): Promise<PersistedGraph> {
    const metaPath = path.join(this.cfg.repoPath, 'graph.meta.json');
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as any;
      const nodes = await this.readEntitiesFromDir(path.join(this.cfg.repoPath, 'nodes')) as PersistedGraphNode[];
      const edges = await this.readEntitiesFromDir(path.join(this.cfg.repoPath, 'edges')) as PersistedGraphEdge[];
      return { name: meta.name ?? name, version: meta.version ?? 0, updatedAt: meta.updatedAt ?? new Date().toISOString(), nodes, edges };
    } catch {
      const head = await this.readFromHeadRoot(name);
      if (head) return head;
      throw new Error('Failed to read working tree root layout');
    }
  }

  private async readEntitiesFromDir(dir: string) {
    const out: any[] = [];
    try {
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const p = path.join(dir, f);
        try {
          const raw = JSON.parse(await fs.readFile(p, 'utf8'));
          const decodedId = decodeURIComponent(f.replace(/\.json$/, ''));
          if (!raw.id) raw.id = decodedId;
          out.push(raw);
        } catch {
          // Skip corrupt file; HEAD reader will backfill
        }
      }
    } catch {
      // directory may not exist
    }
    return out;
  }

  private async readFromHeadRoot(name: string): Promise<PersistedGraph | null> {
    try {
      const metaRaw = await this.runGitCapture(['show', 'HEAD:graph.meta.json'], this.cfg.repoPath);
      const meta = JSON.parse(metaRaw) as any;
      const list = await this.runGitCapture(['ls-tree', '-r', '--name-only', 'HEAD'], this.cfg.repoPath);
      const paths = list.split('\n').filter(Boolean);
      const nodes: PersistedGraphNode[] = [];
      const edges: PersistedGraphEdge[] = [];
      for (const p of paths) {
        if (p.startsWith('nodes/') && p.endsWith('.json')) {
          const raw = await this.runGitCapture(['show', `HEAD:${p}`], this.cfg.repoPath);
          const obj = JSON.parse(raw);
          if (!obj.id) obj.id = decodeURIComponent(path.basename(p, '.json'));
          nodes.push(obj);
        }
        if (p.startsWith('edges/') && p.endsWith('.json')) {
          const raw = await this.runGitCapture(['show', `HEAD:${p}`], this.cfg.repoPath);
          const obj = JSON.parse(raw);
          if (!obj.id) obj.id = decodeURIComponent(path.basename(p, '.json'));
          edges.push(obj);
        }
      }
      return { name: meta.name ?? name, version: meta.version ?? 0, updatedAt: meta.updatedAt ?? new Date().toISOString(), nodes, edges };
    } catch {
      return null;
    }
  }

  private async readFromHeadPerGraph(name: string): Promise<PersistedGraph | null> {
    try {
      const relMeta = path.posix.join('graphs', name, 'graph.meta.json');
      const rawMeta = await this.runGitCapture(['show', `HEAD:${relMeta}`], this.cfg.repoPath);
      const meta = JSON.parse(rawMeta) as any;
      const base = path.posix.join('graphs', name);
      const list = await this.runGitCapture(['ls-tree', '-r', '--name-only', 'HEAD', base], this.cfg.repoPath);
      const paths = list.split('\n').filter(Boolean);
      const nodes: PersistedGraphNode[] = [];
      const edges: PersistedGraphEdge[] = [];
      for (const p of paths) {
        if (p.startsWith(`${base}/nodes/`) && p.endsWith('.json')) {
          const raw = await this.runGitCapture(['show', `HEAD:${p}`], this.cfg.repoPath);
          nodes.push(JSON.parse(raw));
        }
        if (p.startsWith(`${base}/edges/`) && p.endsWith('.json')) {
          const raw = await this.runGitCapture(['show', `HEAD:${p}`], this.cfg.repoPath);
          edges.push(JSON.parse(raw));
        }
      }
      return { name: meta.name ?? name, version: meta.version ?? 0, updatedAt: meta.updatedAt ?? new Date().toISOString(), nodes, edges };
    } catch {
      return null;
    }
  }

  private async readFromHeadMonolith(name: string): Promise<PersistedGraph | null> {
    try {
      const rel = path.posix.join('graphs', name, 'graph.json');
      const out = await this.runGitCapture(['show', `HEAD:${rel}`], this.cfg.repoPath);
      return JSON.parse(out) as PersistedGraph;
    } catch {
      return null;
    }
  }

  private edgeId(e: PersistedGraphEdge): string {
    return `${e.source}-${e.sourceHandle}__${e.target}-${e.targetHandle}`;
  }

  private diffNodes(before: PersistedGraphNode[], after: PersistedGraphNode[]) {
    const b = new Map(before.map((n) => [n.id, JSON.stringify(n)]));
    const a = new Map(after.map((n) => [n.id, JSON.stringify(n)]));
    const nodeAdds: string[] = [];
    const nodeUpdates: string[] = [];
    const nodeDeletes: string[] = [];
    for (const id of a.keys()) {
      if (!b.has(id)) nodeAdds.push(id);
      else if (b.get(id) !== a.get(id)) nodeUpdates.push(id);
    }
    for (const id of b.keys()) if (!a.has(id)) nodeDeletes.push(id);
    return { nodeAdds, nodeUpdates, nodeDeletes };
  }

  private diffEdges(before: PersistedGraphEdge[], after: PersistedGraphEdge[]) {
    const bi = new Map(before.map((e) => [e.id ?? this.edgeId(e), JSON.stringify({ ...e, id: e.id ?? this.edgeId(e) })]));
    const ai = new Map(after.map((e) => [e.id ?? this.edgeId(e), JSON.stringify({ ...e, id: e.id ?? this.edgeId(e) })]));
    const edgeAdds: string[] = [];
    const edgeUpdates: string[] = [];
    const edgeDeletes: string[] = [];
    for (const id of ai.keys()) {
      if (!bi.has(id)) edgeAdds.push(id);
      else if (bi.get(id) !== ai.get(id)) edgeUpdates.push(id);
    }
    for (const id of bi.keys()) if (!ai.has(id)) edgeDeletes.push(id);
    return { edgeAdds, edgeUpdates, edgeDeletes };
  }
}
