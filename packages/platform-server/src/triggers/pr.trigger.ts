import type { LoggerService } from '../core/services/logger.service';

export type TriggerMessage = { content: string; info: Record<string, unknown> };
export type TriggerListener = { invoke: (thread: string, messages: TriggerMessage[]) => Promise<void> };

type PRTriggerConfig = { owner: string; repos: string[]; intervalMs?: number; includeAuthored?: boolean };

export class PRTrigger {
  private listeners: TriggerListener[] = [];
  private timer: NodeJS.Timeout | null = null;
  private _status: 'not_ready' | 'provisioning' | 'ready' | 'deprovisioning' | 'error' = 'not_ready';
  private lastFingerprintByRepo: Map<string, string> = new Map();

  constructor(
    private gh: { getAuthenticatedUserLogin: () => Promise<string>; listAssignedOpenPullRequestsForRepo: (owner: string, repo: string) => Promise<Array<{ number: number; title: string; html_url: string; author?: string; isAuthor?: boolean; isAssignee?: boolean }>> },
    private prs: { getPRInfo: (owner: string, repo: string, num: number) => Promise<{ events: Array<{ id: string; created_at?: string }>; checks: Array<{ name: string; status?: string; conclusion?: string }> }> },
    private logger: LoggerService,
    private cfg: PRTriggerConfig,
  ) {}

  async subscribe(listener: TriggerListener): Promise<void> { this.listeners.push(listener); }
  async unsubscribe(listener: TriggerListener): Promise<void> { this.listeners = this.listeners.filter((l) => l !== listener); }

  private emit(thread: string, messages: TriggerMessage[]): void {
    if (!messages.length) return;
    void Promise.all(this.listeners.map((l) => l.invoke(thread, messages))).catch(() => {});
  }

  private fingerprint(info: { events: Array<{ id: string; created_at?: string }>; checks: Array<{ name: string; status?: string; conclusion?: string }> }): string {
    const e = (info.events || []).map((x) => x.id).join(',');
    const c = (info.checks || []).map((x) => `${x.name}:${x.status}:${x.conclusion}`).join(',');
    return `${e}|${c}`;
  }

  async pollOnce(): Promise<void> {
    try {
      await this.gh.getAuthenticatedUserLogin();
      for (const repo of this.cfg.repos) {
        const prs = await this.gh.listAssignedOpenPullRequestsForRepo(this.cfg.owner, repo);
        for (const pr of prs) {
          if (!this.cfg.includeAuthored && pr.isAuthor) continue; // default exclude authored
          const info = await this.prs.getPRInfo(this.cfg.owner, repo, pr.number);
          const fp = this.fingerprint(info);
          const key = `${repo}#${pr.number}`;
          const prev = this.lastFingerprintByRepo.get(key);
          const thread = `${this.cfg.owner}/${repo}#${pr.number}`;
          const msg: TriggerMessage = { content: `PR ${repo}#${pr.number} updated`, info: { url: pr.html_url, title: pr.title, repo, number: pr.number } };
          if (!prev) {
            this.lastFingerprintByRepo.set(key, fp);
            this.emit(thread, [msg]);
          } else if (prev !== fp) {
            this.lastFingerprintByRepo.set(key, fp);
            this.emit(thread, [msg]);
          }
        }
      }
    } catch (e) {
      this.logger.error('PRTrigger poll error: %s', (e as Error)?.message || String(e));
    }
  }

  async provision(): Promise<void> {
    if (this._status === 'ready' || this._status === 'provisioning') return;
    this._status = 'provisioning';
    const interval = Math.max(10, this.cfg.intervalMs ?? 60000);
    try {
      // Start polling; mark ready immediately
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => { void this.pollOnce(); }, interval).unref?.() || null;
      this._status = 'ready';
      this.logger.info('PRTrigger provisioned');
    } catch (e) {
      this._status = 'error';
      this.logger.error('PRTrigger provision failed: %s', (e as Error)?.message || String(e));
    }
  }

  async deprovision(): Promise<void> {
    if (this._status === 'deprovisioning' || this._status === 'not_ready') return;
    this._status = 'deprovisioning';
    try {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this._status = 'not_ready';
      this.logger.info('PRTrigger deprovisioned');
    } catch (e) {
      this._status = 'error';
      this.logger.error('PRTrigger deprovision failed: %s', (e as Error)?.message || String(e));
    }
  }
}
