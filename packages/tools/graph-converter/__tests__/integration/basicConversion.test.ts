import { promises as fs } from 'node:fs';
import path from 'node:path';
import { convertGraphs, type ConverterOptions } from '../../src/index.js';
import { createTempDir, noopLogger, writeJson, readFile } from '../test-helpers.js';

describe('convertGraphs (integration)', () => {
  it('converts a basic graph to YAML', async () => {
    const root = await createTempDir();

    await writeJson(path.join(root, 'graph.meta.json'), {
      name: 'main',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      format: 2,
    });

    await writeJson(path.join(root, 'nodes', 'node-a.json'), {
      id: 'node-a',
      template: 'template-a',
      config: { foo: 'bar' },
    });

    await writeJson(path.join(root, 'nodes', 'node-b.json'), {
      id: 'node-b',
      template: 'template-b',
    });

    await writeJson(path.join(root, 'edges', 'node-a-out__node-b-in.json'), {
      id: 'node-a-out__node-b-in',
      source: 'node-a',
      sourceHandle: 'out',
      target: 'node-b',
      targetHandle: 'in',
    });

    await writeJson(path.join(root, 'variables.json'), [
      { key: 'ENV', value: 'dev' },
    ]);

    const options: ConverterOptions = {
      root,
      patterns: [],
      inPlace: true,
      backupExt: null,
      dryRun: false,
      outputExt: '.yaml',
      atomic: false,
      validateOnly: false,
      schemaMigrate: false,
      strict: true,
    };

    const result = await convertGraphs(options, noopLogger);

    expect(result.ioErrors).toHaveLength(0);
    expect(result.validationErrors).toHaveLength(0);

    const metaYaml = await readFile(path.join(root, 'graph.meta.yaml'));
    expect(metaYaml).toContain('format: 2');

    const nodeYaml = await readFile(path.join(root, 'nodes', 'node-a.yaml'));
    expect(nodeYaml).toContain('template: template-a');
    expect(nodeYaml).toContain('foo: bar');

    const edgeYaml = await readFile(path.join(root, 'edges', 'node-a-out__node-b-in.yaml'));
    expect(edgeYaml).toContain('id: node-a-out__node-b-in');
    expect(edgeYaml).toContain('source: node-a');
    expect(edgeYaml).toContain('target: node-b');

    expect(await fileExists(path.join(root, 'nodes', 'node-a.json'))).toBe(true);
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
