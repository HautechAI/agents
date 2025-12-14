import { describe, expect, it } from 'vitest';

import { normalizeEscapedNewlines } from '@/lib/utils';

describe('normalizeEscapedNewlines', () => {
  it('replaces literal escaped newlines with spaces', () => {
    expect(normalizeEscapedNewlines('hello\\nworld')).toBe('hello world');
  });

  it('preserves actual newline characters', () => {
    expect(normalizeEscapedNewlines('hello\nworld')).toBe('hello\nworld');
  });

  it('handles multiple escaped sequences', () => {
    expect(normalizeEscapedNewlines('a\\nb\\nc')).toBe('a b c');
  });
});
