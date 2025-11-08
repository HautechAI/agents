SendMessage tool

- Name: send_message
- Purpose: Send a text message to the thread’s Slack channel using the stored descriptor.

Schema

```
{
  message: string;
}
```

Behavior

- Requires ctx.threadId; loads `Thread.channel` and validates the Slack-only descriptor.
- Uses SlackAdapter directly; no registry or multi-channel support in v1.
- Returns a JSON envelope: `{ ok, channelMessageId?, threadId?, error? }`.
- Logs adapter type and identifiers; does not log full text.

Slack-only descriptor and runtime token

- `SlackTrigger` writes the descriptor on ingress: `{ type: 'slack', version: number, identifiers: { channel, thread_ts? } }`.
- No tokens are persisted. `SlackTrigger` resolves its bot token at runtime and registers it per-thread.
- `SendMessage` looks up the runtime token for the current thread and passes it to `SlackAdapter`.

Migration

- Add `Thread.channel` (Json?).
- `SlackTrigger` populates the descriptor on ingress for new threads.
