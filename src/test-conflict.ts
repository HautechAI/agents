import { ConfigService } from "./services/config.service";
import { LoggerService } from "./services/logger.service";
import { ConflictAgentService } from "./agents/conflict.agent";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const conflictAgentService = new ConflictAgentService(configService, logger);

const agent = conflictAgentService.createAgent();

await agent.invoke(
  {
    messages: [
      {
        role: "system",
        content: `You are software engineer. Use bash_command to resolve merge conflicts with the main branch.`,
      },
    ],
  },
  { recursionLimit: 250 },
);
