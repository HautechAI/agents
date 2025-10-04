# Agents Technical Documentation

This document provides a comprehensive, developer-focused overview of the Agents repository. It describes the runtime model, graph-based architecture, key flows, configuration, and development practices so new contributors can quickly become effective.

Table of contents
- Project Overview
- High-Level Architecture
- File & Directory Organization
- Code Patterns & Conventions
- Unique Details & Domain Logic
- Key Flows
- Configuration & Dependencies
- How to Develop & Test
- Conversation summarization
- How to Extend & Contribute
- Security & Ops Notes
- Glossary

1. Project Overview
- Purpose: A TypeScript runtime and UI for building and operating graph-driven AI agents using LangGraph. The system composes Agents, Tools, Triggers, and external MCP servers into a live, reversible graph that can be updated at runtime.
- Primary use cases:
  - Operate agent graphs that react to external events (Slack messages, PR updates) and call tools (bash, GitHub, Slack) and MCP tools inside containers.
  - Persist graph definitions to MongoDB and apply diffs live without restarts.
  - Stream checkpoint writes to an interactive UI for observability.
- Pipeline phases:
  - Persisted graph fetch/validate -> Live graph apply (diff) -> Runtime execution (triggers -> agent graph -> tools) -> Checkpoint stream.
  - Parallelism: Graph diff/apply serializes graph mutations (to keep consistency), while operations inside nodes/tools (e.g., tool execution, network IO) run concurrently.
- Primary entry points:
  - Server bootstrap: apps/server/src/index.ts
  - Live graph runtime: apps/server/src/graph/liveGraph.manager.ts (class LiveGraphRuntime)
  - Template registry: apps/server/src/templates.ts (buildTemplateRegistry)
  - Triggers: apps/server/src/triggers
  - Tools: apps/server/src/tools
  - MCP: apps/server/src/mcp

2. High-Level Architecture
Design principles
- Idempotent, reversible graph edges: All connections are made via declared ports with create/destroy symmetry.
- Minimal global state: Nodes own their state; graph runtime orchestrates instantiation and connections.
- Live-updatable: Apply diffs to add/remove/update nodes and edges safely.
- Composition over reflection: Ports registry explicitly declares allowed connections to avoid brittle reflection.
- Container isolation per thread: Tools and MCP operations run in per-thread containers to isolate state.

Layers
- Application server (apps/server/src/index.ts): wires services, loads persisted graph, exposes minimal REST (templates/graph) and a Socket.IO stream for checkpoints.
- Graph runtime (apps/server/src/graph/*): live diff/apply engine (LiveGraphRuntime) enforcing reversible edges via PortsRegistry and TemplateRegistry wiring.
- Templates (apps/server/src/templates.ts): declarative registration of node factories and their ports.
- Triggers (apps/server/src/triggers/*): external event sources (Slack, PR polling) that push messages into agents.
- Nodes (apps/server/src/nodes/*): graph components like LLM invocation (CallModelNode, MemoryCallModelNode, ToolsNode).
- Tools (apps/server/src/tools/*): actions callable by the LLM (bash, GitHub clone, Slack message) and adapters.
- MCP (apps/server/src/mcp/*): LocalMCPServer and DockerExecTransport.
- Services (apps/server/src/services/*): infra clients and helpers (config, docker container provision, Mongo, Slack, GitHub, checkpointer, sockets).

Workspace container platform
- containerProvider.staticConfig.platform: Optional; enum of `linux/amd64` or `linux/arm64`.
- Behavior: When set, `docker pull` includes the platform selector and `docker.createContainer` receives `platform` as a query parameter. New containers are labeled with `hautech.ai/platform`.
- Reuse rules: If a platform is requested and an existing container found by labels has a different or missing `hautech.ai/platform` label, it is not reused; the old container is stopped and removed, and a new one is created.
- Source of truth: We do not infer platform from image architecture or variant, and we do not normalize values. The requested enum (`linux/amd64` or `linux/arm64`) and the `hautech.ai/platform` label are the only source of truth for reuse decisions.
- Error handling: On stop/remove during mismatch cleanup, benign 304/404 errors are swallowed; only unexpected status codes bubble up.
- Example:
  - platform: linux/amd64
  - image: node:20
  - env: { FOO: "bar" }
- Note: Docker Desktop generally supports both platforms; non-native emulation may be slower (qemu/binfmt). Not all tags are multi-arch; prefer multi-arch images when specifying platform.

Defaults and toggles
- LiveGraphRuntime serializes apply operations by default.
- PRTrigger intervalMs default 60000; includeAuthored default false.
- MCP restart defaults: maxAttempts 5; backoffMs 2000.

How to Develop & Test
- Prereqs: Node.js 20+, pnpm 9+, Docker, MongoDB
- Run server: pnpm --filter server dev
- Tests: pnpm --filter server test
