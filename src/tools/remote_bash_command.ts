import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool } from "@langchain/core/tools";
import { CodespaceSSHService } from "../services/codespace-ssh.service";

export function makeRemoteBashCommandTool(logger: LoggerService, ssh: CodespaceSSHService) {
  const schema = z.object({
    command: z.string().describe("The bash command to execute."),
  });
  return tool(
    async (input) => {
      const { command } = schema.parse(input);
      logger.info("Tool called", "bash_command", { command });
      const response = await ssh.run(command);
      logger.info("bash_command result", response.stdout);
      return response;
    },
    {
      name: "bash_command",
      description: "Execute a bash command and return the output.",
      schema,
    },
  );
}
