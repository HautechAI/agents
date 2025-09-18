import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../logger.service";
import { tool } from "@langchain/core/tools";

export function makeFsEditFileTool(logger: LoggerService) {
  const schema = z.object({
    path: z.string().describe("Path to the file to edit."),
    old_content: z.string().describe("Content to replace."),
    new_content: z.string().describe("New content to insert."),
  });
  return tool(
    async (input) => {
      const { path, old_content, new_content } = schema.parse(input);
      logger.info("Tool called", "fs_edit_file", { path, old_content, new_content });
      const file = readFileSync(path, "utf-8");
      const updated = file.replace(old_content, new_content);
      writeFileSync(path, updated, "utf-8");
      return `Edited file: ${path}`;
    },
    {
      name: "fs_edit_file",
      description: "Edit a file by replacing old content with new content.",
      schema,
    },
  );
}
