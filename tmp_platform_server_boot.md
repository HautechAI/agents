Context
- Repo: HautechAI/agents, package: packages/platform-server
- Goal: Make `pnpm dev` run successfully with only CoreModule and InfraModule imported. Current boot fails:
  TypeError: Cannot read properties of undefined (reading 'githubAppId') at GithubService.initOctokit (.../src/infra/github/github.client.ts:20:31)

Root cause
- Nest DI is not injecting ConfigService correctly into GithubService due to missing `reflect-metadata` import at app bootstrap.
- GithubService performs synchronous Octokit initialization in its constructor and throws when GitHub env values are absent, which prevents app startup even in dev when GitHub is not configured.

Requirements (strict typing & DI rules)
1) App bootstrap
   - Add `import 'reflect-metadata'` at the very top of packages/platform-server/src/index.ts before any NestJS usage.

2) Typed optional GitHub configuration via DI
   - Introduce a dedicated typed config and provider under infra/github:
     - File: src/infra/github/github.config.ts
     - Types:
       - GithubConfigRaw: optional unknown values for appId, privateKey, installationId, token, webhookSecret, apiUrl, baseUrl.
       - GithubConfig: strict typed config refined from raw with structure:
         - enabled: boolean
         - app?: { appId: string; privateKey: string; installationId: string }
         - token?: string
         - webhookSecret?: string
         - apiUrl?: string
         - baseUrl?: string
     - Provide a factory `buildGithubConfigFromEnv()` that reads process.env and returns GithubConfig without throwing if values are absent; only validate type when present.
     - Export provider token `GithubConfigToken = 'GITHUB_CONFIG'`.

3) Refactor GithubService lifecycle and typing
   - Ensure @Injectable() with proper singleton scope.
   - Constructor must be DI-only: inject GithubConfig via `@Inject(GithubConfigToken) cfg` (and LoggerService if needed). Do not initialize Octokit in the constructor.
   - Add `isEnabled(): boolean` and internal `ensureInitialized()` method:
     - Lazy initialize clients when first used; do not throw during app startup.
     - If app credentials are required but missing, throw clear errors at call time: e.g., "GitHub integration is disabled: missing App credentials" or "...personal access token".
   - Remove direct reliance on ConfigService’s github getters inside GithubService; use cfg.app.* and cfg.token instead.

4) InfraModule wiring
   - Register the GithubConfigToken provider via `useFactory: () => buildGithubConfigFromEnv()`.
   - Keep GithubService provider; it should consume GithubConfig via DI.

5) ConfigService adjustments
   - Make GitHub fields optional in config.service.ts or remove them entirely from the global Config schema to avoid mandatory env for dev boot.
   - If getters are kept, return `string | undefined`.

6) Consumers (PRService etc.)
   - Ensure methods that depend on GitHub either check `githubService.isEnabled()` or rely on GithubService’s guarded methods to throw clear runtime errors when disabled.

7) Tests and docs
   - Add unit tests for github.config.ts: no env => enabled=false; token-only => enabled=true; app-only => enabled=true.
   - Add a dev note in README and update .env.example to mark GitHub settings optional for local dev.

Acceptance criteria
- `pnpm dev` in packages/platform-server boots successfully with only CoreModule and InfraModule imported, without requiring any GitHub env variables.
- App listens on the configured port; no startup exceptions.
- When GitHub is not configured, any runtime use of GithubService yields clear, user-facing errors rather than crashing the app.
- All changes adhere to project rules: strict typing (no `any`; use `unknown` only for raw inputs then refine), DI-only constructors with separate init methods if needed, and no backward-compat shims.

Potentially impacted features if GitHub remains unconfigured (disabled until env provided)
- Reading PR details, comments, reviews, commits; listing requested reviewers; merge status checks; writing PR comments; clone via personal token.

Verification steps
- Without GitHub env: run `pnpm dev`; confirm server starts and logs that GitHub integration is disabled.
- With GitHub env (App or PAT): run `pnpm dev`; confirm GithubService initializes and operations succeed.
