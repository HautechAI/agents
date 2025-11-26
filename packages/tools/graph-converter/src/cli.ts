#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { convertGraphs, type ConverterOptions } from './index.js';
import { createLogger } from './log.js';

interface CliOptions {
  root?: string;
  files?: string[];
  inPlace?: boolean;
  backup?: string | boolean;
  dryRun?: boolean;
  outputExt?: string;
  atomic?: boolean;
  validateOnly?: boolean;
  schemaMigrate?: boolean;
  strict?: boolean;
  verbose?: boolean;
}

async function main(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name('graph-converter')
    .description('Convert graph JSON documents to YAML')
    .option('--root <path>', 'Graph repository root', process.cwd())
    .option('--files <patterns...>', 'Space separated glob patterns')
    .option('--in-place', 'Write YAML next to each JSON file')
    .option('--backup [ext]', 'Backup original JSON to <file>.json<ext> (defaults to .bak)')
    .option('--dry-run', 'Simulate conversion without writing outputs')
    .option('--output-ext <ext>', 'YAML extension', '.yaml')
    .option('--atomic', 'Enable atomic temp writes')
    .option('--validate-only', 'Validate without producing YAML output')
    .option('--schema-migrate', 'Apply schema migrations before validation')
    .option('--strict', 'Enable strict Ajv validation')
    .option('--verbose', 'Enable verbose logging');

  program.parse(argv);
  const opts = program.opts<CliOptions>();

  const root = path.resolve(opts.root ?? process.cwd());
  const patterns = Array.isArray(opts.files) ? opts.files : [];
  const backupExt = resolveBackup(opts.backup);
  const logger = createLogger(Boolean(opts.verbose));

  const options: ConverterOptions = {
    root,
    patterns,
    inPlace: Boolean(opts.inPlace),
    backupExt,
    dryRun: Boolean(opts.dryRun),
    outputExt: opts.outputExt ?? '.yaml',
    atomic: opts.atomic ?? false,
    validateOnly: Boolean(opts.validateOnly),
    schemaMigrate: Boolean(opts.schemaMigrate),
    strict: Boolean(opts.strict),
  };

  try {
    const result = await convertGraphs(options, logger);

    for (const skipped of result.skipped) {
      logger.warn(`Skipped unsupported file: ${skipped}`);
    }

    if (result.ioErrors.length) {
      for (const err of result.ioErrors) logger.error(err);
      return 2;
    }
    if (result.validationErrors.length) {
      for (const err of result.validationErrors) logger.error(err);
      return 1;
    }

    logger.info(`Converted ${result.converted.length} file(s).`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Unexpected failure: ${message}`);
    return 2;
  }
}

function resolveBackup(value: string | boolean | undefined): string | null {
  if (value === undefined) return null;
  if (value === false) return null;
  if (value === true) return '.bak';
  return value;
}

main(process.argv).then((code) => {
  process.exitCode = code;
});
