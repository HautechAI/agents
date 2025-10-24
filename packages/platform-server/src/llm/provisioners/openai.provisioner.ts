import OpenAI from 'openai';
import { LLMProvisioner } from './types';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner extends LLMProvisioner {
  private client: OpenAI | null = null;
  constructor(private cfg: ConfigService) {
    super();
  }

  async getClient(): Promise<OpenAI> {
    if (this.client) return this.client;
    const { apiKey, baseUrl } = await this.fetchOrCreateKeys();
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    return this.client;
  }

  async ensureKeys(): Promise<void> {
    if (!this.cfg.openaiApiKey) throw new Error('openai_provider_missing_key');
  }

  async fetchOrCreateKeys(): Promise<{ apiKey: string; baseUrl?: string }> {
    await this.ensureKeys();
    return { apiKey: this.cfg.openaiApiKey as string, baseUrl: this.cfg.openaiBaseUrl };
  }

  async refresh(): Promise<void> {
    this.client = null;
  }

  async dispose(): Promise<void> {
    this.client = null;
  }
}
