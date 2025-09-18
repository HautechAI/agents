import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool } from "@langchain/core/tools";

export function makeWorkWithPrTool(logger: LoggerService) {
  const schema = z.object({
    owner: z.string().describe("Repo owner"),
    repo: z.string().describe("Repo name"),
    branch: z.string().describe("Branch name"),
    task: z.string().describe("Task to perform on the PR"),
  });
  return tool(
    async (input) => {
      const { owner, repo, branch, task } = schema.parse(input);
      logger.info("Tool called", "work_with_pr", { owner, repo, branch, task });
      // Placeholder logic: implement PR operations here.
      return "Job is done";
    },
    {
      name: "work_with_pr",
      description: "Work with a pull request.",
      schema,
    },
  );
}
