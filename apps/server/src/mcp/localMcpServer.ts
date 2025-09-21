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
  private toolsDiscovered = false; // tracks if we've done initial tool discovery

  constructor(
    private containerService: ContainerService,
    private logger: LoggerService,
  ) {}

  /** 
   * Discover tools by starting temporary MCP server, fetching tools, then stopping the container.
   * This is called during agent registration to discover available tools.
   */
  async discoverTools(): Promise<McpTool[]> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot discover tools');
    
    if (this.toolsDiscovered && this.toolsCache) {
      return this.toolsCache;
    }

    this.logger.info(`[MCP:${this.namespace}] Starting tool discovery`);
    
    // Use temporary container for tool discovery
    const tempContainer = await this.containerProvider.provide('_discovery_temp');
    const tempContainerId = tempContainer.id;
    
    const cfg = this.cfg!;
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
    const docker = this.containerService.getDocker();
    
    let tempTransport: DockerExecTransport | undefined;
    let tempClient: Client | undefined;
    
    try {
      // Create temporary transport and client for discovery
      tempTransport = new DockerExecTransport(
        docker,
        async () => {
          const exec = await docker.getContainer(tempContainerId).exec({
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

      await tempTransport.start();
      
      tempClient = new Client({ name: 'local-agent-discovery', version: '0.1.0' });
      this.logger.info(`[MCP:${this.namespace}] Connecting for tool discovery`);
      await tempClient.connect(tempTransport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      this.logger.info(`[MCP:${this.namespace}] Tool discovery handshake complete`);
      
      // Fetch tools
      const result = await tempClient.listTools({}, { timeout: cfg.requestTimeoutMs ?? 15000 });
      this.toolsCache = result.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      }));
      
      this.logger.info(`[MCP:${this.namespace}] Discovered ${this.toolsCache.length} tools`);
      this.toolsDiscovered = true;
      
    } finally {
      // Clean up temporary resources
      if (tempClient) {
        try {
          await tempClient.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp client: ${e}`);
        }
      }
      if (tempTransport) {
        try {
          await tempTransport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp transport: ${e}`);
        }
      }
      // Stop the temporary container 
      try {
        await tempContainer.stop(5);
        await tempContainer.remove(true);
        this.logger.info(`[MCP:${this.namespace}] Temporary discovery container stopped and removed`);
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] Error cleaning up temp container: ${e}`);
      }
    }
    
    return this.toolsCache ?? [];
  }

  async start(): Promise<void> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot start');

    if (this.started) return; // already up
    if (this.pendingStart) return this.pendingStart; // wait for existing in-flight start

    this.pendingStart = (async () => {
      this.logger.info(`[MCP:${this.namespace}] Starting MCP server (discovery mode)`);
      
      // Discover tools if not already done
      if (!this.toolsDiscovered) {
        await this.discoverTools();
      }
      
      this.started = true;
      this.logger.info(`[MCP:${this.namespace}] Started successfully with ${this.toolsCache?.length || 0} tools`);
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
    if (this.toolsCache && !force) return this.toolsCache;
    
    // If tools haven't been discovered yet, trigger discovery
    if (!this.toolsDiscovered || force) {
      return await this.discoverTools();
    }
    
    return this.toolsCache ?? [];
  }

  async callTool(name: string, args: any, options?: { timeoutMs?: number; threadId?: string }): Promise<McpToolCallResult> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot call tool');
    
    const threadId = options?.threadId || 'default';
    this.logger.info(`[MCP:${this.namespace}] Calling tool ${name} for thread ${threadId}`);
    
    // Get thread-specific container
    const container = await this.containerProvider.provide(threadId);
    const containerId = container.id;
    
    const cfg = this.cfg!;
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
    const docker = this.containerService.getDocker();
    
    let transport: DockerExecTransport | undefined;
    let client: Client | undefined;
    
    try {
      // Create transport and client for this tool call
      transport = new DockerExecTransport(
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

      await transport.start();
      
      client = new Client({ name: `local-agent-${threadId}`, version: '0.1.0' });
      await client.connect(transport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      
      // Call the tool
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: options?.timeoutMs ?? cfg.requestTimeoutMs ?? 30000,
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
    } finally {
      // Clean up after tool call
      if (client) {
        try {
          await client.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing client after tool call: ${e}`);
        }
      }
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing transport after tool call: ${e}`);
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // No persistent client/transport to clean up in the new lifecycle
    this.started = false;
    this.logger.info(`[MCP:${this.namespace}] Stopped`);
  }

  on(_event: 'ready' | 'exit' | 'error' | 'restarted', _handler: (...a: any[]) => void): this {
    return this; // placeholder
  }
}
