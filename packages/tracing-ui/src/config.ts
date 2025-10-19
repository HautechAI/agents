// Runtime configuration for the obs-ui library.
// Provider sets the serverUrl at runtime; services read it via getters.

import { isTest } from './utils/env';

let _serverUrl: string | null = null;

export function setServerUrl(url: string) {
  if (!url || typeof url !== 'string') throw new Error('ObsUi: serverUrl must be a non-empty string');
  _serverUrl = url.replace(/\/$/, ''); // trim trailing slash
}

export function getServerUrl(): string {
  if (_serverUrl) return _serverUrl;
  // In test environment, fall back to localhost to avoid provider boilerplate in unit tests
  if (isTest) return 'http://localhost:4319';
  throw new Error('ObsUi: serverUrl not configured. Wrap your app in <ObsUiProvider serverUrl={...} />');
}
