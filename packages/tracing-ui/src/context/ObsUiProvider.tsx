import React, { createContext, useContext, useMemo } from 'react';
import { setServerUrl } from '../config';

type ObsUiContextValue = {
  serverUrl: string;
};

const ObsUiContext = createContext<ObsUiContextValue | null>(null);

export function ObsUiProvider({ serverUrl, children }: { serverUrl: string; children: React.ReactNode }) {
  if (!serverUrl) throw new Error('ObsUiProvider requires serverUrl');
  // Sync to module-level config for non-React consumers (services).
  setServerUrl(serverUrl);

  const value = useMemo<ObsUiContextValue>(() => ({ serverUrl }), [serverUrl]);
  return <ObsUiContext.Provider value={value}>{children}</ObsUiContext.Provider>;
}

export function useObsUi() {
  const ctx = useContext(ObsUiContext);
  if (!ctx) throw new Error('useObsUi must be used within ObsUiProvider');
  return ctx;
}

