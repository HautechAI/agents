import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, parseVaultRef } from '../entities/containerProvider.entity';

describe('ContainerProviderEntity parseVaultRef', () => {
  it('parses valid refs', () => {
    expect(parseVaultRef('secret/github/GH_TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN' });
    expect(parseVaultRef('a/b/c/d')).toEqual({ mount: 'a', path: 'b/c', key: 'd' });
  });
  it('rejects invalid refs', () => {
    expect(() => parseVaultRef('')).toThrow();
    expect(() => parseVaultRef('/a/b')).toThrow();
    expect(() => parseVaultRef('a/b')).toThrow();
  });
});

