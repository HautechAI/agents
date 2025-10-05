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
      // Provide rich mixed-role context (20 messages) to exercise IO tab rendering
      const richContext: any[] = [
        { role: 'system', content: 'You are a helpful assistant specializing in weather and reminders.' },
        { role: 'human', content: 'Hi assistant!' },
        { role: 'ai', content: 'Hello! How can I help you today?' },
        { role: 'human', content: 'What is the weather in NYC?' },
        { role: 'system', content: 'Ensure responses are concise.' },
        { role: 'human', content: 'Also, set a reminder to check humidity.' },
        { role: 'ai', content: 'I can fetch the weather and set a reminder. One moment.' },
        { role: 'tool', toolCallId: 'memory_lookup_1', content: 'No prior weather queries stored.' },
        { role: 'human', content: 'Add Brooklyn specifically.' },
        { role: 'ai', content: 'Got it. Will include Brooklyn specifics.' },
        { role: 'human', content: 'And include temperature in Celsius.' },
        { role: 'system', content: 'Do not include sensitive data.' },
        { role: 'human', content: 'What about sunrise time?' },
        { role: 'ai', content: 'I will retrieve current conditions and sunrise time.' },
        // Long multiline system guidance
        { role: 'system', content: 'Formatting Guidelines:\n- Provide temperature in Celsius and Fahrenheit\n- Include sunrise and sunset on separate lines\n- If UV index > 7, add a caution line\n- Keep overall response under 120 words' },
        // Long multiline human message (simulating user adding more detailed instructions)
        { role: 'human', content: 'Actually, could you also:\n1. Show humidity\n2. Show wind speed\n3. Provide a short recommendation about clothing\n4. Repeat the city name at the top\nThanks!' },
        // Long multiline AI planning style message
        { role: 'ai', content: 'Plan:\n- Fetch base weather (temp, humidity, wind)\n- Fetch astronomical data (sunrise/sunset)\n- Derive clothing recommendation from temperature + wind chill\n- Check UV index for safety notice\nProceeding with tool calls...' },
        // Markdown-rich human request
        { role: 'human', content: '# Detailed Weather Report Request\n\nPlease include:\n\n## Sections\n- **Current Conditions**\n- **Astronomy** (sunrise/sunset)\n- **Advisories** (UV, wind)\n\n## Format\n1. Start with a title line.\n2. Provide a bullet list summary.\n3. Add a short code block showing JSON of raw key metrics.\n\n```json\n{ "want": ["tempC", "tempF", "humidity", "windKph" ] }\n```\n\nThanks!' },
        // Markdown-rich AI acknowledgement with code fence
        { role: 'ai', content: 'Acknowledged. I will structure the response as requested.\n\n```pseudo\nsteps = [\n  "gather_weather()",\n  "compute_advisories()",\n  "format_markdown()"\n]\n```' },
        // Tool message simulating retrieval summary with markdown-like formatting (still plain content)
        { role: 'tool', toolCallId: 'weather_source_prefetch', content: 'Prefetch complete: sources=[noaa, open-meteo]\nlat=40.7128 lon=-74.0060' },
        { role: 'tool', toolCallId: 'prior_summary_1', content: 'Previous summary: greeting only.' },
        { role: 'human', content: 'Thanks!' },
        { role: 'ai', content: 'You are welcome. Proceeding with weather lookup.' },
        { role: 'human', content: 'Can you also estimate UV index?' },
        { role: 'system', content: 'If multiple tool calls needed, batch them.' },
        { role: 'human', content: 'Let me know if you need clarification.' },
      ];
      const llmResult = await withLLM({ context: richContext as any }, async () => {
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
