import { writeFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool } from "@langchain/core/tools";

export function makeFsWriteFileTool(logger: LoggerService) {
  const schema = z.object({
    path: z.string().describe("Path to the file to write."),
    content: z.string().describe("Content to write to the file."),
  });
  return tool(
    async (input) => {
      const { path, content } = schema.parse(input);
      logger.info("Tool called", "fs_write_file", { path, content });
      writeFileSync(path, content, "utf-8");
      return `Wrote to file: ${path}`;
    },
    {
      name: "fs_write_file",
      description: "Write content to a file.",
      schema,
    },
  );
}
