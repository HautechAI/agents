Nix Cache Proxy (ncps)

Overview

- ncps runs on the internal agents_net only; do not expose host ports.
- Only trust public keys from caches you control. Obtain the key from http://ncps:8501/pubkey.
- The storage volume holds cached binaries; size may grow with usage – plan disk space accordingly.

Bring up services

- docker compose up -d ncps-init ncps-migrate ncps
  - ncps-init creates directories on the shared volume
  - ncps-migrate runs the one-time schema initialization with dbmate up (per volume)

Configure env

- Suggested env variables (in server process):

```sh
export NCPS_ENABLED=true
export NCPS_URL=http://ncps:8501
# Optional: control pubkey cache TTL (ms); default 600000 (10m)
export NCPS_KEY_TTL_MS=600000
```

Injection behavior

- The server injects NIX_CONFIG into workspace containers only when all conditions are met:
  - NCPS_ENABLED=true
  - NCPS_URL is set
  - NIX_CONFIG is not already present in the container env

The server fetches the public key at runtime from `${NCPS_URL}/pubkey` with timeout, retry, and in-memory caching.
Failures to fetch or validate the key do not prevent container creation; NIX_CONFIG injection is skipped with a warning.

Verify inside a workspace container:

```sh
nix show-config | grep -E 'substituters|trusted-public-keys'
```

Startup installs

- Workspace startup performs a best-effort Nix package installation when the node config contains resolved items:
  - Shape: { commitHash: <40-hex>, attributePath: <attr> }
  - Command: PATH is prefixed and a single combined `nix profile install` is attempted; on failure, per-package fallbacks run.
  - If Nix is not present in the container image, install is skipped (info-level log).
  - When NCPS is configured (NIX_CONFIG injected), installs automatically leverage the cache.
