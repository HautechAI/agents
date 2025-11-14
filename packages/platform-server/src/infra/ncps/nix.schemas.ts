import { z } from 'zod';

const ISO_DATETIME = z.string().datetime({ offset: true });
const HEX_7_TO_40 = /^[0-9a-f]{7,40}$/i;
const SAFE_SYSTEM = /^[A-Za-z0-9_.+-]+$/;

export const NixhubSearchResultSchema = z
  .object({
    name: z.string(),
    summary: z.string().nullish(),
    last_updated: ISO_DATETIME,
  })
  .strict();

export const NixhubSearchResponseSchema = z
  .object({
    query: z.string(),
    total_results: z.number().int().nonnegative(),
    results: z.array(NixhubSearchResultSchema),
  })
  .strict();

export type NixhubSearchResponse = z.infer<typeof NixhubSearchResponseSchema>;

export const NixhubPlatformSchema = z
  .object({
    system: z.string().regex(SAFE_SYSTEM).optional(),
    attribute_path: z.string().min(1).optional(),
    commit_hash: z.string().regex(HEX_7_TO_40).optional(),
  })
  .strict();

export const NixhubReleaseSchema = z
  .object({
    version: z.union([z.string(), z.number()]),
    last_updated: z.string().optional(),
    outputs_summary: z.string().optional(),
    platforms_summary: z.string().optional(),
    commit_hash: z.string().regex(HEX_7_TO_40).optional(),
    platforms: z.array(NixhubPlatformSchema).optional().default([]),
  })
  .strict();

export const NixhubPackageResponseSchema = z
  .object({
    name: z.string(),
    summary: z.string().optional(),
    releases: z.array(NixhubReleaseSchema),
  })
  .passthrough();

export type NixhubPackageResponse = z.infer<typeof NixhubPackageResponseSchema>;
export type NixhubRelease = z.infer<typeof NixhubReleaseSchema>;
