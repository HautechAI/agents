import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { exec } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { ConfigService } from "./config.service";

// Tool: bash_command
async function bash_command(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            resolve(stdout);
        });
    });
}

// Tool: fs_read_file
function fs_read_file(path: string): string {
    return readFileSync(path, "utf-8");
}

// Tool: fs_write_file
function fs_write_file(path: string, content: string): void {
    writeFileSync(path, content, "utf-8");
}

// Tool: fs_edit_file
function fs_edit_file(path: string, old_content: string, new_content: string): void {
    const file = readFileSync(path, "utf-8");
    const updated = file.replace(old_content, new_content);
    writeFileSync(path, updated, "utf-8");
}

export const tools = {
    bash_command,
    fs_read_file,
    fs_write_file,
    fs_edit_file,
};

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
        // Wrap tools as objects compatible with createReactAgent
        const wrappedTools = [
            {
                name: "bash_command",
                description: "Execute a bash command and return the output.",
                execute: bash_command,
            },
            {
                name: "fs_read_file",
                description: "Read the contents of a file.",
                execute: fs_read_file,
            },
            {
                name: "fs_write_file",
                description: "Write content to a file.",
                execute: fs_write_file,
            },
            {
                name: "fs_edit_file",
                description: "Edit a file by replacing old content with new content.",
                execute: fs_edit_file,
            },
        ];
        return createReactAgent({
            llm: model,
            tools: wrappedTools,
        });
    }
}