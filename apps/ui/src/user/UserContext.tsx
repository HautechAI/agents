import React, { createContext, useContext, useMemo } from 'react';

type User = {
  name: string;
  email: string;
  avatarUrl?: string;
};

type UserContextType = { user: User | null };

const Ctx = createContext<UserContextType>({ user: null });

export function UserProvider({ children }: { children: React.ReactNode }) {
  // For now, provide a mock user. If a real auth hook appears, swap this.
  const value = useMemo<UserContextType>(() => ({ user: { name: 'Casey Quinn', email: 'casey@example.com' } }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() {
  return useContext(Ctx);
}

