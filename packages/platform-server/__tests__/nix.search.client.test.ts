import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { NixSearchClient } from '../src/infra/nix/nixos-search.client';

describe('NixSearchClient', () => {
  afterEach(() => nock.cleanAll());

  it('maps nixpkgs channel to nixos backend alias and extracts commit hash', async () => {
    const scope = nock('https://search.nixos.org')
      .post('/backend/latest-44-nixos-unstable/_search')
      .reply(200, {
        hits: {
          hits: [
            {
              _index: 'nixos-44-unstable-1111111111111111111111111111111111111111',
              _score: 1,
              _source: {
                package_attr_name: 'pkgs.htop',
                package_pversion: '3.2.0',
                package_platforms: ['x86_64-linux'],
              },
            },
          ],
        },
      });

    const client = new NixSearchClient();
    const hits = await client.findByAttribute('nixpkgs-unstable', 'pkgs.htop', '3.2.0');
    expect(hits[0].commitHash).toBe('1111111111111111111111111111111111111111');
    scope.done();
  });
});
