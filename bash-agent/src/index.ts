
import { ConfigService } from "./config.service";


import { AgentService, tools } from "./agent.service";

const configService = new ConfigService();
const agentService = new AgentService(configService);

const agent = agentService.createAgent();

// Placeholder for agent logic using Graph/StateGraph if needed
console.log("Bash agent tools initialized.");
