import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer, McpServerConfig, McpTool, McpToolCallResult, DEFAULT_MCP_COMMAND, McpError } from './types.js';
import { DockerExecTransport } from './dockerExecTransport.js';
import { ContainerService } from '../services/container.service.js';
import { ContainerProviderEntity } from '../entities/containerProvider.entity.js';
import { LoggerService } from '../services/logger.service.js';

export class LocalMCPServer implements McpServer {
  readonly namespace: string = 'mcp'; // default; overridden by first setConfig
  private client?: Client;
  private started = false;
  private toolsCache: McpTool[] | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private restartAttempts = 0;
  private transport?: DockerExecTransport;
  private containerProvider?: ContainerProviderEntity;
  private pendingStart?: Promise<void>; // ensure single in-flight start
  private containerId?: string;
  private cfg?: McpServerConfig;

  constructor(
    private containerService: ContainerService,
    private logger: LoggerService,
  ) {}

  async start(): Promise<void> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot start');

    if (this.started) return; // already up
    if (this.pendingStart) return this.pendingStart; // wait for existing in-flight start

    this.pendingStart = (async () => {
      this.logger.info(`[MCP:${this.namespace}] Starting MCP server`);

      if (this.containerProvider) {
        try {
          const container = await this.containerProvider.provide('default');
          this.containerId = container.id;
        } catch (e: any) {
          this.logger.error(`[MCP:${this.namespace}] Failed to obtain container from provider: ${e.message}`);
          throw e;
        }
      } else {
        throw new Error('LocalMCPServer: no containerProvider available to start');
      }

      const cfg = this.cfg!; // guarded above
      const command = cfg.command ?? DEFAULT_MCP_COMMAND;
      const containerId = this.containerId!;

      const docker = this.containerService.getDocker();
      this.transport = new DockerExecTransport(
        docker,
        async () => {
          const exec = await docker.getContainer(containerId).exec({
            Cmd: ['sh', '-lc', command],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false,
            WorkingDir: cfg.workdir,
          });
          const stream: any = await new Promise((resolve, reject) => {
            exec.start({ hijack: true, stdin: true }, (err, s) => {
              if (err) return reject(err);
              if (!s) return reject(new Error('No stream from exec.start'));
              resolve(s);
            });
          });
          return {
            stream,
            inspect: async () => {
              const r = await exec.inspect();
              return { ExitCode: r.ExitCode ?? undefined };
            },
          };
        },
        { demux: true },
      );

      await this.transport.start();

      this.client = new Client({ name: 'local-agent', version: '0.1.0' });
      this.logger.info(`[MCP:${this.namespace}] Connecting (waiting for initialize handshake)`);
      await this.client.connect(this.transport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      this.logger.info(`[MCP:${this.namespace}] Handshake complete`);
      this.started = true;
      this.logger.info(`[MCP:${this.namespace}] Connected`);

      if (cfg.heartbeatIntervalMs) {
        this.startHeartbeat();
      }
    })();

    try {
      await this.pendingStart;
    } finally {
      this.pendingStart = undefined;
    }
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
  }

  /** Update runtime configuration (only env/workdir/command currently applied to next restart). */
  async setConfig(partial: Partial<McpServerConfig>): Promise<void> {
    // Allow setting namespace only if not yet explicitly overridden by prior config.
    if (partial.namespace && (!this.cfg?.namespace || this.cfg?.namespace === 'mcp')) {
      (this as any).namespace = partial.namespace; // bypass readonly
    }
    const { containerId: _ignored, ...rest } = partial as any; // ignore containerId if provided
    // Merge with existing config so unspecified fields persist instead of being lost.
    this.cfg = { ...this.cfg, ...rest } as McpServerConfig;
  }

  private startHeartbeat() {
    const cfg = this.cfg!;
    if (!cfg.heartbeatIntervalMs) return;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.client) return;
      try {
        await this.client.ping({ timeout: 5000 });
      } catch (e: any) {
        this.logger.error(`[MCP:${this.namespace}] Heartbeat failed: ${e.message}`);
      }
    }, cfg.heartbeatIntervalMs);
  }

  async listTools(force = false): Promise<McpTool[]> {
    if (!this.client) throw new Error('MCP client not started');
    if (this.toolsCache && !force) return this.toolsCache;
    const cfg = this.cfg!;
    const result = await this.client.listTools({}, { timeout: cfg.requestTimeoutMs ?? 15000 });
    this.toolsCache = result.tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    }));
    return this.toolsCache ?? [];
  }

  async callTool(name: string, args: any, options?: { timeoutMs?: number }): Promise<McpToolCallResult> {
    if (!this.client) throw new Error('MCP client not started');
    try {
      const result = await this.client.callTool({ name, arguments: args }, undefined, {
        timeout: options?.timeoutMs ?? this.cfg!.requestTimeoutMs ?? 30000,
      });
      const rawContent = (result as any).content;
      const contentArr = Array.isArray(rawContent) ? rawContent : [];
      const flattened = contentArr
        .map((c: any) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object') {
            if ('text' in c && typeof c.text === 'string') return c.text;
            if ('data' in c) return JSON.stringify(c.data);
          }
          return JSON.stringify(c);
        })
        .join('\n');
      return {
        isError: (result as any).isError,
        content: flattened,
        structuredContent: (result as any).structuredContent,
        raw: result,
      };
    } catch (e: any) {
      throw new McpError(`Tool '${name}' failed: ${e.message}`, e.code || 'TOOL_CALL_ERROR');
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.client) await this.client.close();
    if (this.transport) await this.transport.close();
    this.started = false;
  }

  on(_event: 'ready' | 'exit' | 'error' | 'restarted', _handler: (...a: any[]) => void): this {
    return this; // placeholder
  }
}
