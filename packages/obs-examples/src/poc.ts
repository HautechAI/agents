import {
  init,
  withSpan,
  withSystem,
  withThread,
  withAgent,
  withLLM,
  withToolCall,
  withSummarize,
  logger,
  LLMResponse,
} from '@hautech/obs-sdk';

async function main() {
  const endpoint = process.env.OBS_EXTENDED_ENDPOINT || 'http://localhost:4319';
  init({
    mode: 'extended',
    endpoints: { extended: endpoint },
    defaultAttributes: { service: 'poc-app' },
  });
  await withSystem({ label: 'startup', phase: 'init' }, async () => {
    // simulate initialization
    await new Promise((r) => setTimeout(r, 1000));
  });

  await withThread({ threadId: 'demo-thread' }, async () => {
    await withAgent({ agentName: 'demo-agent' }, async () => {
      // Simulate an LLM call
      const toolCallId = 'tc_weather_1';
      const llmResult = await withLLM({ context: [{ role: 'human', content: 'Hello' }] as any }, async () => {
        await new Promise((r) => setTimeout(r, 1500));
        const raw = { text: 'Hi there!' };
        return new LLMResponse({
          raw,
          content: 'Hi there! I will look up the weather.',
          toolCalls: [
            {
              id: toolCallId,
              name: 'weather',
              arguments: { city: 'NYC' },
            },
          ],
        });
      });

      // Simulate tool call with logging demo (5 logs, 500ms gaps)
  const weather = await withToolCall({ toolCallId, name: 'weather', input: { city: 'NYC' } }, async () => {
        const log = logger();
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        log.info('Starting weather lookup sequence');
        await sleep(500);
        log.debug('Fetching upstream provider data', { provider: 'demo-weather', attempt: 1 });
        await sleep(500);
        log.error('Intermittent provider warning (simulated)', { code: 'UPSTREAM_WARN', severity: 'low' });
        await sleep(500);
        log.debug('Retry succeeded, normalizing payload');
        await sleep(500);
        log.info('Completed weather lookup successfully');
        // Final simulated result
        return { tempC: 22 };
      });

      // Summarize context
      await withSummarize({ oldContext: JSON.stringify({ llmResult, weather }) }, async () => {
        await new Promise((r) => setTimeout(r, 800));
        return { summary: 'Exchanged greeting and fetched weather', newContext: { greeted: true, weather } };
      });
    });
  });
}

main().catch(console.error);
