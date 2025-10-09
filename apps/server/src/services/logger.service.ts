// src/logger.service.ts

import { logger as obsLogger } from '@hautech/obs-sdk';

export class LoggerService {
  private obs() {
    // Obtain contextual logger (bound to active span if any)
    try {
      return obsLogger();
    } catch {
      // SDK not initialized yet
      return null;
    }
  }

  info(message: string, ...optionalParams: any[]) {
    console.info(`[INFO] ${message}`, ...optionalParams);
    this.obs()?.info(`${message}\n${this.serialize(optionalParams)}`);
  }

  debug(message: string, ...optionalParams: any[]) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
    this.obs()?.debug(`${message}\n${this.serialize(optionalParams)}`);
  }

  error(message: string, ...optionalParams: any[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
    this.obs()?.error(`${message}\n${this.serialize(optionalParams)}`);
  }

  private serialize(params: any[]) {
    const redactKeys = /token|api[_-]?key|authorization|password|secret/i;
    const seen = new WeakSet();
    const toSafe = (v: any): any => {
      if (v instanceof Error) {
        const cause = (v as any).cause;
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
          cause: cause instanceof Error
            ? { name: cause.name, message: cause.message, stack: cause.stack }
            : cause,
        };
      }
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
        if (Array.isArray(v)) return v.map(toSafe);
        const out: Record<string, any> = {} as any;
        for (const [k, val] of Object.entries(v as any)) {
          out[k] = redactKeys.test(k) ? '[REDACTED]' : toSafe(val);
        }
        return out;
      }
      return v;
    };
    try {
      return JSON.stringify(params.map(toSafe));
    } catch (err) {
      try { return String(params); } catch { return '[unserializable]'; }
    }
  }
}
