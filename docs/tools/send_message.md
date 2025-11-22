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

- Requires `ctx.threadId`; loads `Thread.channel` via `MessagingService` and validates the Slack-only descriptor.
- `MessagingService` resolves the Slack bot token using the descriptor’s `meta.bot_token_ref` and `VaultService`, then delegates to `SlackAdapter`.
- Returns a JSON envelope: `{ ok, channelMessageId?, threadId?, error? }`.
- Logs adapter identifiers; does not log full text.

Slack-only descriptor and token resolution

- `SlackTrigger` writes the descriptor on ingress only when `identifiers.channel` is present: `{ type: 'slack', version: number, identifiers: { channel, thread_ts? }, meta?: { bot_token_ref?, ... } }`.
- For Vault-backed configurations, `SlackTrigger` copies the `bot_token` reference into `meta.bot_token_ref`. Static token values are not persisted.
- `MessagingService` resolves `meta.bot_token_ref` with the `VaultService` (expecting tokens that start with `xoxb-`). Missing references yield deterministic `missing_bot_token_ref` errors.

Migration

- Add `Thread.channel` (Json?).
- `SlackTrigger` populates the descriptor on ingress for new threads when channel is present; skips otherwise.
