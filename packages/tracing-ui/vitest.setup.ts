import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import { expect, vi } from 'vitest';
// @ts-ignore - matchers is module namespace; cast to any for extend
expect.extend(matchers as any);

// Mock Monaco editor to avoid jsdom/React DOM focus issues
vi.mock('@monaco-editor/react', () => {
  return {
    default: ({ value, defaultLanguage, height }: any) => {
      const text = typeof value === 'string' ? value : value != null ? JSON.stringify(value) : '';
      return React.createElement(
        'div',
        { 'data-testid': 'mock-monaco', 'data-lang': defaultLanguage, style: { height: height || '200px' } },
        text,
      );
    },
  };
});

// Ensure global constructors exist for React DOM instanceof checks during teardown
try {
  const g: any = globalThis as any;
  if (typeof g.Node === 'undefined' && typeof window !== 'undefined') g.Node = (window as any).Node;
  if (typeof g.Element === 'undefined' && typeof window !== 'undefined') g.Element = (window as any).Element;
  if (typeof g.Document === 'undefined' && typeof window !== 'undefined') g.Document = (window as any).Document;
} catch {
  // ignore
}

// Lightweight mock for @agyn/ui components used in tests to avoid cross-package JSX runtime issues
vi.mock('@agyn/ui', async () => {
  const React = await import('react');
  const Table = (props: any) => React.createElement('table', { ...props });
  const Thead = (props: any) => React.createElement('thead', { ...props });
  const Tbody = (props: any) => React.createElement('tbody', { ...props });
  const Tr = (props: any) => React.createElement('tr', { ...props });
  const Th = (props: any) => React.createElement('th', { ...props });
  const Td = (props: any) => React.createElement('td', { ...props });
  const Button = ({ children, ...rest }: any) => React.createElement('button', { ...rest }, children);
  return { Table, Thead, Tbody, Tr, Th, Td, Button } as any;
});
