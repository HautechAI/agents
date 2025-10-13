import { describe, it, expect } from 'vitest';
import { emojiHash3, emojiAlphabet, emojiHash3Indexes } from '../utils/emojiId';

describe('emojiHash3', () => {
  it('is deterministic for same input', () => {
    const a = emojiHash3('thread-123');
    const b = emojiHash3('thread-123');
    expect(a).toBe(b);
  });

  it('produces exactly 3 emojis', () => {
    const out = emojiHash3('x');
    const idx = emojiHash3Indexes('x');
    expect(idx.length).toBe(3);
    expect(out).toBe(
      `${emojiAlphabet[idx[0]]}${emojiAlphabet[idx[1]]}${emojiAlphabet[idx[2]]}`
    );
  });

  it('indices are within alphabet bounds', () => {
    const inputs = ['a', 'b', 'longer input 123', '', '🚀mixed'];
    for (const s of inputs) {
      const idx = emojiHash3Indexes(s);
      for (const i of idx) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(emojiAlphabet.length);
      }
    }
  });
});

