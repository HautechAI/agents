import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const host = process.env.STORYBOOK_SMOKE_HOST ?? '127.0.0.1';
const port = Number(process.env.STORYBOOK_SMOKE_PORT ?? '6006');
const url = process.env.STORYBOOK_SMOKE_URL ?? `http://${host}:${port}`;
const waitTimeoutMs = Number(process.env.STORYBOOK_SMOKE_WAIT_MS ?? '60000');
const pollIntervalMs = Number(process.env.STORYBOOK_SMOKE_POLL_MS ?? '500');
const defaultApiBase = 'http://127.0.0.1:3010';

let serverProcess;

const runCommand = (command, args, label) =>
  new Promise((resolve, reject) => {
    if (label) {
      console.log(label);
    }

    const child = spawn(command, args, { stdio: 'inherit' });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      const descriptor = code ?? signal ?? 'unknown';
      reject(new Error(`[storybook-smoke] ${command} exited with ${descriptor}`));
    });

    child.once('error', (error) => {
      reject(error);
    });
  });

const stopProcess = async (child) => {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5000);
  });
};

const handleSignal = (signal) => {
  void (async () => {
    console.log(`[storybook-smoke] received ${signal}, stopping server`);
    await stopProcess(serverProcess);
    process.exit(1);
  })();
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, () => handleSignal(signal));
});

const waitForServer = async () => {
  const deadline = Date.now() + waitTimeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (process.env.DEBUG_STORYBOOK_SMOKE === 'true') {
        console.debug('[storybook-smoke] waiting for server', error);
      }
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `[storybook-smoke] Storybook did not start within ${waitTimeoutMs}ms`,
  );
};

const runTestRunner = () =>
  new Promise((resolve, reject) => {
    const runner = spawn(
      'pnpm',
      [
        'exec',
        'test-storybook',
        '--config-dir',
        '.storybook',
        '--url',
        url,
        '--ci',
      ],
      { stdio: 'inherit' },
    );

    runner.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      const descriptor = code ?? signal ?? 'unknown';
      reject(new Error(`[storybook-smoke] test-runner exited with ${descriptor}`));
    });

    runner.once('error', (error) => {
      reject(error);
    });
  });

const ensureApiBaseUrl = () => {
  if (!process.env.VITE_API_BASE_URL) {
    process.env.VITE_API_BASE_URL = defaultApiBase;
    console.log(
      `[storybook-smoke] defaulting VITE_API_BASE_URL to ${process.env.VITE_API_BASE_URL}`,
    );
    return;
  }

  console.log(
    `[storybook-smoke] using VITE_API_BASE_URL=${process.env.VITE_API_BASE_URL}`,
  );
};

const main = async () => {
  ensureApiBaseUrl();
  await runCommand('pnpm', ['run', 'build-storybook'], '[storybook-smoke] building Storybook');

  console.log('[storybook-smoke] starting static server');
  serverProcess = spawn(
    'pnpm',
    [
      'exec',
      'http-server',
      'storybook-static',
      '--port',
      String(port),
      '--host',
      host,
      '--silent',
    ],
    { stdio: 'inherit' },
  );

  await waitForServer();
  console.log(`[storybook-smoke] running smoke tests via ${url}`);
  await runTestRunner();
};

main()
  .then(async () => {
    await stopProcess(serverProcess);
    console.log('[storybook-smoke] completed successfully');
  })
  .catch(async (error) => {
    console.error('[storybook-smoke] failed');
    console.error(error);
    await stopProcess(serverProcess);
    process.exit(1);
  });
