import { describe, it, expect } from 'vitest';
import { EnforceRestrictionNode } from '../src/nodes/enforceRestriction.node';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

describe('EnforceRestrictionNode', () => {
  describe('with restrictOutput disabled', () => {
    it('returns empty object when restrictOutput is false', async () => {
      const node = new EnforceRestrictionNode({
        restrictOutput: false,
        restrictionMessage: 'You must call a tool',
        restrictionMaxInjections: 2,
      });

      const result = await node.action(
        {
          messages: [new AIMessage({ content: 'Hello' })],
          restrictionInjectionCount: 0,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result).toEqual({});
    });
  });

  describe('with restrictOutput enabled', () => {
    it('returns empty object when last message has tool calls', async () => {
      const node = new EnforceRestrictionNode({
        restrictOutput: true,
        restrictionMessage: 'You must call a tool',
        restrictionMaxInjections: 0,
      });

      const aiMessageWithTools = new AIMessage({
        content: 'I will call a tool',
        tool_calls: [
          {
            id: 'call_1',
            name: 'some_tool',
            args: {},
          },
        ],
      });

      const result = await node.action(
        {
          messages: [aiMessageWithTools],
          restrictionInjectionCount: 0,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result).toEqual({});
    });

    it('injects restriction message when AI tries to finish without tool calls (unlimited)', async () => {
      const restrictionMessage = 'You must call a tool before finishing';
      const node = new EnforceRestrictionNode({
        restrictOutput: true,
        restrictionMessage,
        restrictionMaxInjections: 0, // unlimited
      });

      const aiMessageWithoutTools = new AIMessage({
        content: 'Here is my final answer.',
      });

      const result = await node.action(
        {
          messages: [aiMessageWithoutTools],
          restrictionInjectionCount: 0,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result.messages?.method).toBe('append');
      expect(result.messages?.items).toHaveLength(1);
      expect(result.messages?.items[0]).toBeInstanceOf(SystemMessage);
      expect((result.messages?.items[0] as SystemMessage).content).toBe(restrictionMessage);
      expect(result.restrictionInjectionCount).toBe(1);
      expect(result.restrictionInjected).toBe(true);
    });

    it('injects restriction message up to max injections limit', async () => {
      const restrictionMessage = 'You must call a tool before finishing';
      const node = new EnforceRestrictionNode({
        restrictOutput: true,
        restrictionMessage,
        restrictionMaxInjections: 2,
      });

      const aiMessageWithoutTools = new AIMessage({
        content: 'Here is my final answer.',
      });

      // First injection
      const result1 = await node.action(
        {
          messages: [aiMessageWithoutTools],
          restrictionInjectionCount: 0,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result1.restrictionInjectionCount).toBe(1);
      expect(result1.restrictionInjected).toBe(true);

      // Second injection
      const result2 = await node.action(
        {
          messages: [aiMessageWithoutTools],
          restrictionInjectionCount: 1,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result2.restrictionInjectionCount).toBe(2);
      expect(result2.restrictionInjected).toBe(true);

      // Third attempt - should not inject (max reached)
      const result3 = await node.action(
        {
          messages: [aiMessageWithoutTools],
          restrictionInjectionCount: 2,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result3.restrictionInjected).toBe(false);
      expect(result3.restrictionInjectionCount).toBeUndefined();
    });

    it('handles undefined restrictionInjectionCount', async () => {
      const node = new EnforceRestrictionNode({
        restrictOutput: true,
        restrictionMessage: 'You must call a tool',
        restrictionMaxInjections: 1,
      });

      const result = await node.action(
        {
          messages: [new AIMessage({ content: 'Final answer' })],
          // restrictionInjectionCount is undefined
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result.restrictionInjectionCount).toBe(1);
      expect(result.restrictionInjected).toBe(true);
    });
  });

  describe('setOptions', () => {
    it('updates options', async () => {
      const node = new EnforceRestrictionNode({
        restrictOutput: false,
        restrictionMessage: 'Original message',
        restrictionMaxInjections: 1,
      });

      node.setOptions({
        restrictOutput: true,
        restrictionMessage: 'Updated message',
      });

      // Since options are private, we test behavior instead
      const result = await node.action(
        {
          messages: [new AIMessage({ content: 'Final answer' })],
          restrictionInjectionCount: 0,
        },
        { configurable: { thread_id: 'test' } }
      );

      expect(result).toMatchObject({
        restrictionInjected: true,
        messages: {
          method: 'append',
          items: [expect.objectContaining({ content: 'Updated message' })],
        },
      });
    });
  });
});