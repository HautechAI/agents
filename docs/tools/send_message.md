SendMessage tool

- Name: send_message
- Purpose: Send a message to the thread’s origin channel using the stored ChannelDescriptor.

Schema

```
{
  text: string;
  markdown?: boolean;
  broadcast?: boolean;
  correlationId?: string; // optional idempotency key
  attachments?: [{ type: 'file' | 'link'; url?: string; name?: string }];
}
```

Behavior

- Requires ctx.threadId; loads Thread.channel and validates the descriptor.
- Uses adapter registry to route to the correct channel.
- Returns a JSON envelope: `{ ok, channelMessageId?, threadId?, error?, rateLimited?, retryAfterMs? }`.
- Logs adapter type and identifiers; does not log full text.
- Supports an optional `correlationId` to avoid duplicate sends within a 10-minute TTL window.
  - If a duplicate `correlationId` is detected, returns `{ ok: false, error: 'duplicate_correlation_id' }`.
  - On adapter errors, the idempotency key is released to allow retry.

Slack adapter

- Configured via `SLACK_BOT_TOKEN` env or `SLACK_BOT_TOKEN_REF` (Vault ref).
- Supports thread replies via `thread_ts`.
- Ephemeral messages when `ephemeralUser` is provided by descriptor.
- Handles rate limits (429) with a single backoff retry.
- Attachment handling:
  - Link attachments are appended to the message text as formatted links.
  - File attachments are not supported in `send_message`; use a dedicated upload tool.

Migration

- Add `Thread.channel` (Json?) and `Thread.channelVersion` (Int?).
- `SlackTrigger` populates the descriptor on ingress for new threads.
