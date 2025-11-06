import { httpJson } from '@/api/client';
import type { NixPackageDTO, ResolveResponse } from '@/api/types/nix';

export async function fetchPackages(query: string, signal?: AbortSignal): Promise<NixPackageDTO[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const res = await httpJson<{ packages: NixPackageDTO[] }>(`/api/nix/packages?query=${encodeURIComponent(q)}`, { signal });
  return res?.packages || [];
}

export async function fetchVersions(name: string, signal?: AbortSignal): Promise<string[]> {
  if (!name) return [];
  const res = await httpJson<{ versions: string[] }>(`/api/nix/versions?name=${encodeURIComponent(name)}`, { signal });
  return res?.versions || [];
}

export async function resolvePackage(name: string, version: string, signal?: AbortSignal): Promise<ResolveResponse> {
  if (!name || !version) throw new Error('resolvePackage: name and version required');
  const res = await httpJson<ResolveResponse>(`/api/nix/resolve?name=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}`, { signal });
  if (!res) throw new Error('resolvePackage: empty response');
  return res;
}
