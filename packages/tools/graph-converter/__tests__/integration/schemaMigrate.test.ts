import path from 'node:path';
import { convertGraphs, type ConverterOptions } from '../../src/index.js';
import { createTempDir, noopLogger, writeJson, readFile } from '../test-helpers.js';

describe('schema migration integration', () => {
  it('repairs missing ids and strips unknown fields', async () => {
    const root = await createTempDir();

    await writeJson(path.join(root, 'graph.meta.json'), {
      name: 'main',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      format: 2,
    });

    await writeJson(path.join(root, 'nodes', 'migrated%20node.json'), {
      template: 'template-a',
      config: { value: 1 },
      legacy: true,
    });

    await writeJson(path.join(root, 'nodes', 'other.json'), {
      id: 'other',
      template: 'template-b',
    });

    await writeJson(path.join(root, 'edges', 'legacy.json'), {
      source: 'migrated node',
      sourceHandle: 'out',
      target: 'other',
      targetHandle: 'in',
    });

    await writeJson(path.join(root, 'variables.json'), [
      { key: 1, value: 2 },
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
      schemaMigrate: true,
      strict: true,
    };

    const result = await convertGraphs(options, noopLogger);
    expect(result.ioErrors).toHaveLength(0);
    expect(result.validationErrors).toHaveLength(0);

    const nodeYaml = await readFile(path.join(root, 'nodes', 'migrated%20node.yaml'));
    expect(nodeYaml).toContain('id: migrated node');
    expect(nodeYaml).not.toContain('legacy');

    const edgeYaml = await readFile(path.join(root, 'edges', 'legacy.yaml'));
    expect(edgeYaml).toContain('id: migrated node-out__other-in');

    const variablesYaml = await readFile(path.join(root, 'variables.yaml'));
    expect(variablesYaml).toContain('- key: "1"');
    expect(variablesYaml).toContain('value: "2"');
  });
});
