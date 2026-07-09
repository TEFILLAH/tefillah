/**
 * Bible module — asset loader.
 *
 * Bundled .bible assets are copied out of the APK (or fetched from the dev
 * server in development) by expo-asset, then read + JSON.parsed on demand.
 * Only ONE parsed translation is kept in memory at a time — a parsed Bible is
 * tens of MB of JS objects, so switching versions evicts the previous one.
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { getVersionMeta } from './registry';
import type { BibleData } from './types';

let cache: { id: string; data: BibleData } | null = null;

export async function loadBible(id: string): Promise<BibleData> {
  if (cache && cache.id === id) return cache.data;

  const meta = getVersionMeta(id);
  if (!meta) throw new Error(`Unknown Bible version: ${id}`);

  const asset = Asset.fromModule(meta.module());
  // downloadAsync is a no-op when already available locally; it guarantees a
  // readable file:// localUri in both dev (metro server) and release (APK).
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const raw = await FileSystem.readAsStringAsync(uri);
  const data = JSON.parse(raw) as BibleData;

  if (!Array.isArray(data.books) || data.books.length !== 66) {
    throw new Error(`Bible asset ${id} is malformed (${data?.books?.length ?? 0} books)`);
  }

  cache = { id, data };
  return data;
}

export function clearBibleCache(): void {
  cache = null;
}
