# Graph Store JSON → YAML Migration

This document captures the migration plan and operational guidance for moving
graph persistence from the legacy JSON layout to YAML.

## Goals

- Prefer human-friendly YAML for `graph.meta`, node, edge, and variables files.
- Maintain backward compatibility by reading JSON files when YAML is absent.
- Provide tooling to convert existing repositories safely and atomically.

## Runtime behaviour

The server now writes YAML by default for all graph entities. Two environment
flags control transitional behaviour:

- `GRAPH_STORE_WRITE_JSON` (default `false`): write JSON mirrors alongside
  YAML. Enable this for the first release after migration to keep downstream
  tooling working.
- `GRAPH_AUTO_CONVERT_JSON` (default `false`): when enabled, the server
  auto-generates YAML files if it encounters JSON-only entities in the working
  tree. This is useful for one-off conversions or when running older repos.

The reader prefers YAML but transparently falls back to JSON for nodes, edges,
graph meta, and variables. HEAD fallbacks also consider `.yaml` files.

## Conversion script

Located at `scripts/json_to_yaml/convert.py`, the Python utility validates and
converts JSON files to YAML. Install dependencies and run:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/json_to_yaml/requirements.txt

# Convert an entire graph root in-place
python scripts/json_to_yaml/convert.py --root path/to/graph

# Dry-run validation
python scripts/json_to_yaml/convert.py --root path/to/graph --dry-run

# Convert specific files with backups and atomic writes
python scripts/json_to_yaml/convert.py \
  --files graph.meta.json nodes/foo.json \
  --backup --atomic
```

Key options:

- `--schema-migrate`: normalize node/edge IDs from filenames when missing.
- `--validate-only`: perform schema checks without emitting YAML.
- `--dry-run`: report planned changes without touching disk.
- `--backup`: leave a `.bak` copy of the source JSON.
- `--strict`: fail on unknown file types instead of skipping.

The script prints per-file status (`ok`, `skip`, `dry-run`) and a final summary.
It exits non-zero if validation or writing fails.

## Recommended rollout

1. Enable `GRAPH_STORE_WRITE_JSON=true` for one release. Deploy the server and
   run the converter in dry-run mode to surface validation issues.
2. Re-run the converter without `--dry-run` to generate YAML files.
3. Once consumers have switched to YAML, disable `GRAPH_STORE_WRITE_JSON`.
4. Optionally enable `GRAPH_AUTO_CONVERT_JSON` to catch any stragglers.

## Backward compatibility

- JSON reads remain supported through the deprecation window.
- YAML writes are atomic; JSON mirrors (when enabled) are kept in sync.
- On failures the repository rolls back touched files and leaves the working
  tree clean.

Monitor CI (`Test Converter` job) to ensure the converter stays healthy as the
schema evolves.
