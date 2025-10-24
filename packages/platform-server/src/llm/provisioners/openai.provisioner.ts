import OpenAI from 'openai';
import { LLM } from '@agyn/llm';
import { LLMProvisioner } from '../llm.provisioner';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm: LLM | null = null;
  constructor(private cfg: ConfigService) {
    super();
  }

  async getLLM(): Promise<LLM> {
<<<<<<< HEAD
    if (!this.client) {
      const apiKey = this.cfg.openaiApiKey;
      const baseURL = this.cfg.openaiBaseUrl;
      if (!apiKey) throw new Error('openai_provider_missing_key');
      this.client = new OpenAI({ apiKey, baseURL });
    }
    return new LLM(this.client as any);
=======
    if (this.llm) return this.llm;
    const apiKey = this.cfg.openaiApiKey;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = this.cfg.openaiBaseUrl;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client);
    return this.llm;
>>>>>>> ffaf5ae (refactor(platform-server): simplify LLMProvisioner to getLLM(); update provisioners; remove LLMFactoryService; inject provisioner in consumers; keep DI factory provider (Issue #423)})
  }
}
