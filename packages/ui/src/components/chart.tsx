"use client";

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';

// Minimal chart container that just provides the responsive parent. Consumers compose with Recharts primitives.
export function ChartContainer({ children, height = 240 }: { children: React.ReactNode; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* children should be a Recharts chart */}
        {children as any}
      </ResponsiveContainer>
    </div>
  );
}

