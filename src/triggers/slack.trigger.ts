import Bolt from "@slack/bolt";
import { BaseTrigger } from "./base.trigger";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";

const isMessageEvent = (event: Bolt.KnownEventFromType<"message">): event is Bolt.types.GenericMessageEvent => {
  return event && event.type === "message";
};

// (Previously had SlackTriggerOptions with filter; removed for simplified constructor.)

/**
 * SlackTrigger
 * Starts a Socket Mode connection to Slack and relays inbound user messages
 * (non-bot, non-thread broadcast) to subscribers via `notify([text])`.
 */
export class SlackTrigger extends BaseTrigger {
  private app: Bolt.App | null = null;
  private started = false;
  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  /** Initialize the Slack Bolt App (idempotent). */
  private ensureApp() {
    if (this.app) return this.app;

    const app = new Bolt.App({
      token: this.config.slackBotToken,
      appToken: this.config.slackAppToken,
      socketMode: true,
      logLevel: Bolt.LogLevel ? Bolt.LogLevel.WARN : undefined,
    });

    // Register message listener
    app.event("message", async ({ event }) => {
      this.logger.debug("SlackTrigger received message");
      // We only care about 'message' events that have text and are not from bots
      if (isMessageEvent(event)) {
        try {
          if (!event.text) return;

          this.logger.debug("SlackTrigger received message", event);
          const thread = `${event.user}_${event.thread_ts ?? event.ts}`;
          await this.notify(thread, [
            {
              content: event.text,
              info: {
                user: event.user, //
                channel: event.channel,
                channel_type: event.channel_type,
                thread_ts: event.thread_ts ?? event.ts,
              },
            },
          ]);
        } catch (err) {
          this.logger.error("Error processing Slack message", err);
        }
      }
    });

    this.app = app;
    return app;
  }

  /** Start the socket mode connection (safe to call multiple times). */
  async start(): Promise<void> {
    if (this.started) return;
    const app = this.ensureApp();
    this.logger.info("Starting SlackTrigger (socket mode)...");
    await app.start();
    this.started = true;
    this.logger.info("SlackTrigger started");
  }

  /** Gracefully stop the Slack app. */
  async stop(): Promise<void> {
    if (!this.started || !this.app) return;
    try {
      // Bolt v4 doesn't expose a direct stop for socket mode; close underlying client if present.
      // @ts-ignore internal access fallback
      const sm = this.app.receiver?.client?.socketModeClient;
      if (sm && typeof sm.disconnect === "function") {
        await sm.disconnect();
      }
      this.logger.info("SlackTrigger stopped");
    } catch (err) {
      this.logger.error("Error stopping SlackTrigger", err);
    } finally {
      this.started = false;
    }
  }
}

// Usage example:
// const trigger = new SlackTrigger();
// await trigger.start();
// await trigger.subscribe(async (messages) => { console.log("Incoming Slack messages", messages); });
