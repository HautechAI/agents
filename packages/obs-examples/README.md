# @agyn/obs-examples

Example scripts for Observability Stage 1.

Run (no Docker):
- Ensure @agyn/obs-server is running locally (PORT default 4319)
- Dev from sources: `pnpm --filter @agyn/obs-examples dev`
- Build + start: `pnpm --filter @agyn/obs-examples build && pnpm --filter @agyn/obs-examples start`

Env:
- `OBS_EXTENDED_ENDPOINT` (default: http://localhost:4319)
