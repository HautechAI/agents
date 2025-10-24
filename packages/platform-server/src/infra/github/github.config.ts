import { z } from 'zod';

// Raw env-driven shape; unknowns refined into typed config below
export const GithubConfigRawSchema = z.object({
  appId: z.unknown().optional(),
  privateKey: z.unknown().optional(),
  installationId: z.unknown().optional(),
  token: z.unknown().optional(),
  webhookSecret: z.unknown().optional(),
  apiUrl: z.unknown().optional(),
  baseUrl: z.unknown().optional(),
});

export type GithubConfigRaw = z.infer<typeof GithubConfigRawSchema>;

export type GithubConfig = {
  enabled: boolean;
  app?: { appId: string; privateKey: string; installationId: string };
  token?: string;
  webhookSecret?: string;
  apiUrl?: string;
  baseUrl?: string;
};

export const GithubConfigToken = 'GITHUB_CONFIG' as const;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function buildGithubConfigFromEnv(): GithubConfig {
  const raw: GithubConfigRaw = {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: process.env.GITHUB_INSTALLATION_ID,
    token: process.env.GH_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    apiUrl: process.env.GITHUB_API_URL,
    baseUrl: process.env.GITHUB_BASE_URL,
  };

  const appId = asString(raw.appId);
  const privateKey = asString(raw.privateKey);
  const installationId = asString(raw.installationId);
  const token = asString(raw.token);
  const webhookSecret = asString(raw.webhookSecret);
  const apiUrl = asString(raw.apiUrl);
  const baseUrl = asString(raw.baseUrl);

  const appCredsPresent = !!(appId && privateKey && installationId);
  const enabled = appCredsPresent || !!token;

  const cfg: GithubConfig = { enabled };
  if (appCredsPresent) cfg.app = { appId, privateKey, installationId } as { appId: string; privateKey: string; installationId: string };
  if (token) cfg.token = token;
  if (webhookSecret) cfg.webhookSecret = webhookSecret;
  if (apiUrl) cfg.apiUrl = apiUrl;
  if (baseUrl) cfg.baseUrl = baseUrl;

  return cfg;
}

