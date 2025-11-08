SendMessage tool

- Name: send_message
- Purpose: Send a message to the thread’s origin channel using the stored ChannelDescriptor.

Schema

```
{
  text: string;
  markdown?: boolean;
  broadcast?: boolean;
  attachments?: [{ type: 'file' | 'link'; url?: string; name?: string }];
}
```

Behavior

- Requires ctx.threadId; loads Thread.channel and validates the descriptor.
- Uses adapter registry to route to the correct channel.
- Returns a JSON envelope: `{ ok, channelMessageId?, threadId?, error?, rateLimited?, retryAfterMs? }`.
- Logs adapter type and identifiers; does not log full text.

Slack adapter

- Configured via `SLACK_BOT_TOKEN` env or `SLACK_BOT_TOKEN_REF` (Vault ref).
- Supports thread replies via `thread_ts`.
- Ephemeral messages when `ephemeralUser` is provided by descriptor.
- Handles rate limits (429) with a single backoff retry.

Migration

- Add `Thread.channel` (Json?) and `Thread.channelVersion` (Int?).
- `SlackTrigger` populates the descriptor on ingress for new threads.

