import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';

// Access private via any for lightweight test without changing API
const logger = new LoggerService() as any;

describe('LoggerService.serialize', () => {
  it('expands Error objects', () => {
    const err = new Error('boom');
    const json = logger.serialize([err]);
    const parsed = JSON.parse(json)[0];
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('boom');
    expect(typeof parsed.stack).toBe('string');
  });

  it('handles circular refs and redacts tokens', () => {
    const o: any = { accessToken: 'SECRET_TOKEN', nested: {} };
    o.self = o; // circular
    o.nested.password = 'pw';
    const json = logger.serialize([o]);
    const parsed = JSON.parse(json)[0];
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.nested.password).toBe('[REDACTED]');
    expect(parsed.self).toBe('[Circular]');
  });

  it('includes error cause if present', () => {
    const cause = new Error('root');
    const err = new Error('outer', { cause });
    const parsed = JSON.parse(logger.serialize([err]))[0];
    expect(parsed.cause.name).toBe('Error');
    expect(parsed.cause.message).toBe('root');
  });
});
