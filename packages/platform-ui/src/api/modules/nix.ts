import { http } from '@/api/http';
import type { NixPackageDTO, ResolveResponse } from '@/api/types/nix';

export async function fetchPackages(query: string, signal?: AbortSignal): Promise<NixPackageDTO[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const res = await http.get<{ packages: NixPackageDTO[] }>(`/api/nix/packages`, { signal, params: { query: q } });
  return res.packages || [];
}

export async function fetchVersions(name: string, signal?: AbortSignal): Promise<string[]> {
  if (!name) return [];
  try {
    const res = await http.get<{ versions: string[] }>(`/api/nix/versions`, { signal, params: { name } });
    return res.versions || [];
  } catch (e: any) {
    if (e?.response?.status === 404) return [];
    throw e;
  }
}

export async function resolvePackage(name: string, version: string, signal?: AbortSignal): Promise<ResolveResponse> {
  if (!name || !version) throw new Error('resolvePackage: name and version required');
  const res = await http.get<ResolveResponse>(`/api/nix/resolve`, { signal, params: { name, version } });
  return res;
}

