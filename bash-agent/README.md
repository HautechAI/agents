# Bash Agent

A TypeScript agent using `@langchain/langgraph` to interact with bash and files.

## Features

- Execute bash commands
- Read files
- Write files
- Edit files (find and replace)

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Set your OpenAI API key in `.env`:
   ```env
   OPENAI_API_KEY=your-key-here
   ```
3. Run the agent:
   ```bash
   pnpm start
   ```

## Tools

- `bash_command(command: string)`
- `read_file(path: string)`
- `write_file(path: string, content: string)`
- `edit_file(path: string, old_content: string, new_content: string)`

## Stack

- TypeScript
- pnpm
- @langchain/langgraph
