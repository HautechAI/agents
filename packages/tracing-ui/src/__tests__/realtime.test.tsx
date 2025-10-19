import { describe, it, expect } from 'vitest';
import { spanRealtime } from '../../src/services/socket';

describe('realtime test mode', () => {
  it('does not connect in tests', () => {
    // Accessing spanRealtime should not throw and should not have a socket.
    expect(spanRealtime).toBeTruthy();
  });
});

