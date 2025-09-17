import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { exec } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { ConfigService } from "./config.service";
import { z } from "zod";

// Tool functions are now defined as arrow functions inside the tools array below


export class AgentService {
    private configService: ConfigService;

    constructor(configService: ConfigService) {
        this.configService = configService;
    }

    createAgent() {
        const model = new ChatOpenAI({
            model: "gpt-4.1",
            apiKey: this.configService.getOpenAIKey(),
        });
        // Define tools as objects compatible with createReactAgent
        const tools = [
            {
                name: "bash_command",
                description: "Execute a bash command and return the output.",
                schema: z.object({
                    command: z.string().describe("The bash command to execute."),
                }),
                execute: async ({ command }: { command: string }) => {
                    return new Promise<string>((resolve, reject) => {
                        exec(command, (error, stdout, stderr) => {
                            if (error) return reject(stderr || error.message);
                            resolve(stdout);
                        });
                    });
                },
            },
            {
                name: "fs_read_file",
                description: "Read the contents of a file.",
                schema: z.object({
                    path: z.string().describe("Path to the file to read."),
                }),
                execute: ({ path }: { path: string }) => readFileSync(path, "utf-8"),
            },
            {
                name: "fs_write_file",
                description: "Write content to a file.",
                schema: z.object({
                    path: z.string().describe("Path to the file to write."),
                    content: z.string().describe("Content to write to the file."),
                }),
                execute: ({ path, content }: { path: string; content: string }) => {
                    writeFileSync(path, content, "utf-8");
                },
            },
            {
                name: "fs_edit_file",
                description: "Edit a file by replacing old content with new content.",
                schema: z.object({
                    path: z.string().describe("Path to the file to edit."),
                    old_content: z.string().describe("Content to replace."),
                    new_content: z.string().describe("New content to insert."),
                }),
                execute: ({ path, old_content, new_content }: { path: string; old_content: string; new_content: string }) => {
                    const file = readFileSync(path, "utf-8");
                    const updated = file.replace(old_content, new_content);
                    writeFileSync(path, updated, "utf-8");
                },
            },
        ];
        return createReactAgent({
            llm: model,
            tools,
        });
    }
}