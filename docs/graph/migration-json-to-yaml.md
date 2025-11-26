# JSON → YAML Graph Migration

The Node-based `graph-converter` CLI normalizes graph JSON entities and emits
YAML representations that match the runtime store expectations (indent 2, no key
sorting, unlimited line width). Use the CLI locally when migrating repositories
or validating graph snapshots.

## Installation

```bash
pnpm install
pnpm --filter @agyn/graph-converter run build
```

## Usage

```bash
pnpm convert-graphs -- --root ./graph --in-place --schema-migrate --strict
```

Flags:

- `--root`: graph repository root (defaults to `process.cwd()`)
- `--files`: space-separated glob patterns relative to `--root`
- `--in-place`: write YAML files next to each JSON source
- `--backup [ext]`: move original JSON to `<file>.json<ext>` after success
- `--dry-run`: log planned writes without touching disk
- `--validate-only`: validate JSON without producing YAML
- `--schema-migrate`: derive missing ids, normalize edge ids, coerce variable values
- `--strict`: enable Ajv strict mode (`additionalProperties=false`)
- `--output-ext`: emitted extension (default `.yaml`)
- `--atomic`: write via temp file + rename + fsync (default disabled)
- `--verbose`: verbose logging

Exit codes:

- `0`: success
- `1`: schema or reference validation failure
- `2`: IO or parse error

## Local testing

Tests are local-only (excluded from CI):

```bash
pnpm --filter @agyn/graph-converter run test:local
```
