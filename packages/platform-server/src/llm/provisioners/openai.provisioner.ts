import OpenAI from 'openai';
import { LLM } from '@agyn/llm';
import { LLMProvisioner } from '../llm.provisioner';
import { LLMProvisioner } from './llm.provisioner';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner implements LLMProvisioner {
  private llm: LLM | null = null;
  constructor(private cfg: ConfigService) {}

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;
    const apiKey = this.cfg.openaiApiKey;
    const baseURL = this.cfg.openaiBaseUrl;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const client = new OpenAI({ apiKey, baseURL });
    this.llm = new LLM(client as any);
    return this.llm;
  }
export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm: LLM | null = null;
  constructor(private cfg: ConfigService) {
    super();
  }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;
    const apiKey = this.cfg.openaiApiKey;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = this.cfg.openaiBaseUrl;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client);
    return this.llm;
  }
>>>>>>> d49b9af (merge: resolve remaining conflicts across graph/templates/llm modules and provisioners; finalize DI with LLMProvisioner provider)
}
