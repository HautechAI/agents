import { Module } from '@nestjs/common';
import { ConversationStateRepository } from './repositories/conversationState.repository';
import { LoadLLMReducer } from './reducers/load.llm.reducer';
import { SaveLLMReducer } from './reducers/save.llm.reducer';
import { CallModelLLMReducer } from './reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from './reducers/callTools.llm.reducer';
import { EnforceToolsLLMReducer } from './reducers/enforceTools.llm.reducer';
import { SummarizationLLMReducer } from './reducers/summarization.llm.reducer';
import { StaticLLMRouter } from './routers/static.llm.router';
import { ConditionalLLMRouter } from './routers/conditional.llm.router';
<<<<<<< HEAD
import { LLMProvisioner } from './llm.provisioner';
=======
import { LLMProvisioner } from './provisioners/llm.provisioner';
>>>>>>> ffaf5ae (refactor(platform-server): simplify LLMProvisioner to getLLM(); update provisioners; remove LLMFactoryService; inject provisioner in consumers; keep DI factory provider (Issue #423)})
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { LiteLLMProvisioner } from './provisioners/litellm.provisioner';
import { OpenAILLMProvisioner } from './provisioners/openai.provisioner';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: LLMProvisioner,
      useFactory: (cfg: ConfigService, logger: LoggerService) => {
        const provider = (cfg.llmProvider || 'auto') as 'openai' | 'litellm' | 'auto';
        if (provider === 'openai') return new OpenAILLMProvisioner(cfg);
        if (provider === 'litellm') return new LiteLLMProvisioner(cfg, logger);
        if (cfg.openaiApiKey) return new OpenAILLMProvisioner(cfg);
        return new LiteLLMProvisioner(cfg, logger);
      },
      inject: [ConfigService, LoggerService],
    },
    ConversationStateRepository,
    LoadLLMReducer,
    SaveLLMReducer,
    CallModelLLMReducer,
    CallToolsLLMReducer,
    EnforceToolsLLMReducer,
    SummarizationLLMReducer,
    StaticLLMRouter,
    ConditionalLLMRouter,
  ],
  exports: [LLMProvisioner],
})
export class LLMModule {}
