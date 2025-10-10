import { describe, it, expect } from 'vitest';
import { GithubCloneRepoTool } from '../tools/github_clone_repo';
import { LoggerService } from '../services/logger.service';

const logger = new LoggerService();

describe('GithubCloneRepoTool token resolution', () => {
  it('prefers static token value', async () => {
    const tool = new GithubCloneRepoTool({ githubToken: 'FALLBACK' } as any, undefined, logger);
    await tool.setConfig({ token: { value: 'DIRECT', source: 'static' } });
    // @ts-ignore access private method via cast
    const t = await (tool as any).resolveToken();
    expect(t).toBe('DIRECT');
  });
});

