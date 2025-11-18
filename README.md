# Agents

Composable, graph-driven AI agents (LangGraph) with a live-updatable runtime, Docker-backed tools/MCP, and a minimal UI.

Quick links
- Server: [packages/platform-server](packages/platform-server) — runtime, triggers, tools, MCP, graph persistence
- UI: [packages/platform-ui](packages/platform-ui) — graph builder and checkpoint stream viewer
  - Threads view streams new runs, status updates, and messages in real time via Socket.IO
- Docs: [docs/README.md](docs/README.md) — technical overview, contributing, MCP design
 
- Tools: [docs/tools/remind_me.md](docs/tools/remind_me.md) — RemindMe tool behavior and usage

Getting started
- Architecture and setup: [docs/technical-overview.md](docs/technical-overview.md)
- Contribution workflow & style guides: [docs/contributing/index.md](docs/contributing/index.md)
 - Before running tests, run `pnpm prisma:generate`.

Development services
- docker compose up -d agents-db registry-mirror
- Optional: start Vault for dev secret flows: `docker compose up -d vault vault-init`
  - Set VAULT_ENABLED=true, VAULT_ADDR, VAULT_TOKEN in packages/platform-server/.env
  - See docs/security/vault.md

Postgres checkpointer
- Configure server env:
  - `LANGGRAPH_CHECKPOINTER=postgres`
  - `POSTGRES_URL=postgresql://agents:agents@localhost:5443/agents?sslmode=disable`

Slack integration
- Use Vault-managed secrets and the Graph UI templates for SlackTrigger and SendSlackMessageTool.
  - Setup: docs/security/vault.md
  - UI reference: docs/ui/graph/README.md

Docker-in-Docker and registry mirror (Issue #99)
- Workspace containers can opt-in to a per-workspace Docker daemon via `DOCKER_HOST=tcp://localhost:2375`; this port is only reachable inside the workspace namespace and is not published on the host.
- A lightweight registry mirror runs as a compose service `registry-mirror` on the shared network `agents_net`. It is HTTP-only and only reachable within that network.
- Override the mirror by setting `DOCKER_MIRROR_URL` (default `http://registry-mirror:5000`).

Git graph storage (format: 2)
- Root-level files/directories: `graph.meta.json`, `nodes/`, `edges/`, and advisory lock `.graph.lock`.
- Filenames use encodeURIComponent(id); edge ids are deterministic: `<src>-<srcH>__<tgt>-<tgtH>`.
- Writes are atomic per-entity; meta is written last; `.graph.lock` guards concurrent writers.
- Configuration env vars:
  - `GRAPH_REPO_PATH` (default `./data/graph`)
  - `GRAPH_BRANCH` (default `graph-state`)
  - `GRAPH_AUTHOR_NAME` / `GRAPH_AUTHOR_EMAIL`

LiteLLM proxy (optional)
- See docs/litellm-setup.md for full setup.
- Auto-provisioning (recommended):
  - Set LITELLM_BASE_URL and LITELLM_MASTER_KEY; leave OPENAI_API_KEY unset.
  - Server will generate a virtual key on startup and set OPENAI_API_KEY/OPENAI_BASE_URL.
- Direct to OpenAI:
  - Set OPENAI_API_KEY=sk-<real-openai-key>; unset LITELLM_* envs.
Prisma workflow (platform-server)
- See packages/platform-server/README.md#prisma-workflow-platform-server
