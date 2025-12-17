#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HOST = process.env.STORYBOOK_SMOKE_HOST ?? '127.0.0.1';
const PORT = process.env.STORYBOOK_SMOKE_PORT ?? '7080';
const URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 60_000;

const env = {
  ...process.env,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:4173/api',
};

const BIN_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/.bin',
);

function ensureBin(name) {
  const extension = process.platform === 'win32' ? '.cmd' : '';
  const candidate = path.join(BIN_DIRECTORY, `${name}${extension}`);

  try {
    accessSync(candidate, fsConstants.X_OK);
    return candidate;
  } catch {
    throw new Error(`Unable to locate executable for ${name} at ${candidate}`);
  }
}

const storybookProcess = spawn(ensureBin('storybook'), ['dev', '--ci', '--host', HOST, '--port', PORT, '--no-open'], {
  env,
  stdio: 'inherit',
});

process.on('SIGINT', () => {
  void cleanup().finally(() => process.exit(1));
});

process.on('SIGTERM', () => {
  void cleanup().finally(() => process.exit(1));
});

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  try {
    await waitForServer();
    await runTests();
  } finally {
    await cleanup();
  }
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    if (storybookProcess.exitCode !== null) {
      throw new Error('Storybook dev server exited before becoming ready.');
    }

    try {
      const response = await fetch(URL, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore fetch errors until timeout expires
    }

    await sleep(1000);
  }

  throw new Error('Storybook dev server did not become ready within 60 seconds.');
}

async function runTests() {
  await new Promise((resolve, reject) => {
    const runner = spawn(
      ensureBin('test-storybook'),
      ['--ci', '--maxWorkers=2', '--testTimeout=60000', '--url', URL],
      { env, stdio: 'inherit' },
    );

    runner.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason =
        signal !== null
          ? `terminated by signal ${signal}`
          : `exited with code ${code}`;
      reject(new Error(`Storybook smoke tests failed: ${reason}`));
    });

    runner.on('error', (error) => {
      reject(error);
    });
  });
}

async function cleanup() {
  if (storybookProcess.exitCode !== null) {
    return;
  }

  storybookProcess.kill('SIGTERM');

  const exited = new Promise((resolve) => {
    storybookProcess.once('exit', () => resolve(true));
  });

  const timedOut = sleep(5_000).then(() => false);

  const completed = await Promise.race([exited, timedOut]);

  if (!completed && storybookProcess.exitCode === null) {
    storybookProcess.kill('SIGKILL');
  }
}
