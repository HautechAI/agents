import { DynamicStructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import { EngineerAgent } from "../agents/engineer.agent";
import { ContainerProviderEntity } from "../entities/containerProvider.entity";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";
import { BaseTool } from "./base.tool";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";

const schema = z.object({
  owner: z.string().describe("Repo owner"),
  repo: z.string().describe("Repo name"),
  branch: z.string().describe("Branch name"),
  task: z.string().describe("Task to perform on the PR"),
});

export class AskEngineerTool extends BaseTool {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private containerProvider: ContainerProviderEntity,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    const egineerAgent = new EngineerAgent(this.configService, this.logger, this.containerProvider);

    return tool(
      async (rawInput, config) => {
        const { owner, repo, branch, task } = schema.parse(rawInput);
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error("thread_id is required in configurable to use ask_engineer tool");

        this.logger.info("Tool called", "ask_engineer", { owner, repo, branch, task });

        const response = (await egineerAgent.graph.invoke(
          { messages: [new HumanMessage(JSON.stringify({ content: task, info: { owner, repo, branch } }))] },
          { configurable: { thread_id: `engineer_${thread_id}` } },
        )) as { messages: BaseMessage[] };
        return response.messages[response.messages.length - 1].text;
      },
      {
        name: "ask_engineer",
        description: "Ask a software engineer to execute a specific coding task.",
        schema: schema,
      },
    );
  }
}
