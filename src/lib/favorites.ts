'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { SearchResultItem } from './types';

/**
 * 影片收藏：存放在持久 Cookie 中（而非 localStorage / IndexedDB）。
 *
 * - 单个 Cookie 上限约 4KB，且 Cookie 会随每个请求发给服务器（Node 默认请求头上限 16KB），
 *   因此数据以 base64url(JSON) 编码后切分到最多 MAX_CHUNKS 个 Cookie 中，总量约 11KB（约 40 部影片）；
 * - 浏览器把 Cookie 最长有效期限制在 400 天，每次打开站点都会重写一次以顺延有效期。
 */

const COOKIE_PREFIX = 'ltv_fav_';
const CHUNK_SIZE = 3800;
const MAX_CHUNKS = 3;
/** 400 天：Chrome 等浏览器允许的最长 Cookie 有效期 */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const CHANGE_EVENT = 'ltv-favorites-change';

export interface FavoriteItem {
  sourceKey: string;
  sourceName: string;
  vodId: string;
  name: string;
  pic?: string;
  sourceUrl?: string;
  year?: string;
  typeName?: string;
  /** 收藏时间（ms） */
  addedAt: number;
}

/** Cookie 中的紧凑格式（短键名节省空间） */
interface StoredFavorite {
  k: string;
  s: string;
  i: string;
  n: string;
  p?: string;
  u?: string;
  y?: string;
  c?: string;
  t: number;
}

export function favoriteId(item: { sourceKey: string; vodId: string }): string {
  return `${item.sourceKey}::${item.vodId}`;
}

function toStored(f: FavoriteItem): StoredFavorite {
  const s: StoredFavorite = { k: f.sourceKey, s: f.sourceName, i: f.vodId, n: f.name, t: f.addedAt };
  if (f.pic) s.p = f.pic;
  if (f.sourceUrl) s.u = f.sourceUrl;
  if (f.year) s.y = f.year;
  if (f.typeName) s.c = f.typeName;
  return s;
}

function fromStored(s: StoredFavorite): FavoriteItem | null {
  if (!s || typeof s.k !== 'string' || typeof s.i !== 'string' || typeof s.n !== 'string') return null;
  return {
    sourceKey: s.k,
    sourceName: typeof s.s === 'string' ? s.s : s.k,
    vodId: s.i,
    name: s.n,
    pic: s.p,
    sourceUrl: s.u,
    year: s.y,
    typeName: s.c,
    addedAt: typeof s.t === 'number' ? s.t : 0,
  };
}

function encode(list: FavoriteItem[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(list.map(toStored)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string): FavoriteItem[] {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => fromStored(s as StoredFavorite)).filter((f): f is FavoriteItem => f !== null);
  } catch {
    return [];
  }
}

function readCookies(): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof document === 'undefined') return map;
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map;
}

function readRaw(): string {
  const cookies = readCookies();
  let raw = '';
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const chunk = cookies.get(`${COOKIE_PREFIX}${i}`);
    if (chunk === undefined) break;
    raw += chunk;
  }
  return raw;
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

/** 写入收藏；超出 Cookie 容量时返回 false 且不改动现有数据 */
function writeFavorites(list: FavoriteItem[]): boolean {
  const raw = list.length > 0 ? encode(list) : '';
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += CHUNK_SIZE) chunks.push(raw.slice(i, i + CHUNK_SIZE));
  if (chunks.length > MAX_CHUNKS) return false;
  chunks.forEach((c, i) => setCookie(`${COOKIE_PREFIX}${i}`, c, MAX_AGE_SECONDS));
  for (let i = chunks.length; i < MAX_CHUNKS; i++) setCookie(`${COOKIE_PREFIX}${i}`, '', 0);
  cachedRaw = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

// —— useSyncExternalStore 快照缓存：Cookie 原文不变时返回同一个数组引用 ——
let cachedRaw: string | null = null;
let cachedList: FavoriteItem[] = [];
const EMPTY: FavoriteItem[] = [];

export function getFavorites(): FavoriteItem[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = raw ? decode(raw) : [];
  }
  return cachedList;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // 其它标签页修改后切回本页时同步一次（Cookie 没有跨标签变更事件）
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('focus', onChange);
  };
}

export type AddFavoriteResult = 'added' | 'exists' | 'full';

export function addFavorite(item: SearchResultItem): AddFavoriteResult {
  const list = getFavorites();
  const id = favoriteId(item);
  if (list.some((f) => favoriteId(f) === id)) return 'exists';
  const next: FavoriteItem = {
    sourceKey: item.sourceKey,
    sourceName: item.sourceName,
    vodId: item.vodId,
    name: item.name,
    pic: item.pic,
    sourceUrl: item.sourceUrl,
    year: item.year,
    typeName: item.typeName,
    addedAt: Date.now(),
  };
  return writeFavorites([next, ...list]) ? 'added' : 'full';
}

export function removeFavorite(item: { sourceKey: string; vodId: string }): void {
  const id = favoriteId(item);
  writeFavorites(getFavorites().filter((f) => favoriteId(f) !== id));
}

/** 重写一次 Cookie 以顺延 400 天有效期（打开首页时调用） */
export function refreshFavoritesExpiry(): void {
  const list = getFavorites();
  if (list.length > 0) writeFavorites(list);
}

export function favoriteToSearchItem(f: FavoriteItem): SearchResultItem {
  return {
    sourceKey: f.sourceKey,
    sourceName: f.sourceName,
    vodId: f.vodId,
    name: f.name,
    pic: f.pic,
    sourceUrl: f.sourceUrl,
    year: f.year,
    typeName: f.typeName,
  };
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getFavorites, () => EMPTY);
  const isFavorite = useCallback(
    (item: { sourceKey: string; vodId: string }) => favorites.some((f) => favoriteId(f) === favoriteId(item)),
    [favorites]
  );
  return { favorites, isFavorite };
}

/**
 * 导出为可粘贴文本：与浏览器里看到的 Cookie 相同格式（每行 ltv_fav_N=...），
 * 便于从开发者工具直接复制，也能原样导入到另一台设备/另一个网址。
 */
export function exportFavoritesText(): string {
  const raw = readRaw();
  if (!raw) return '';
  const lines: string[] = [];
  for (let i = 0; i * CHUNK_SIZE < raw.length; i++) {
    lines.push(`${COOKIE_PREFIX}${i}=${raw.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)}`);
  }
  return lines.join('\n');
}

export type ImportFavoritesResult =
  | { ok: true; added: number; total: number }
  | { ok: false; reason: 'invalid' | 'full' };

/**
 * 导入收藏，与现有收藏合并（同一源同一影片只保留一份）。
 * 接受：多行 / 分号分隔的 `ltv_fav_0=...` `ltv_fav_1=...`，或单独一段编码文本。
 */
export function importFavoritesText(text: string): ImportFavoritesResult {
  const input = text.trim();
  if (!input) return { ok: false, reason: 'invalid' };
  const parts = new Map<number, string>();
  const re = new RegExp(String.raw`${COOKIE_PREFIX}(\d+)\s*=\s*([A-Za-z0-9_\-%]+)`, 'g');
  for (const m of input.matchAll(re)) parts.set(Number(m[1]), decodeURIComponent(m[2]));
  let raw = '';
  if (parts.size > 0) {
    const max = Math.max(...parts.keys());
    for (let i = 0; i <= max; i++) {
      if (!parts.has(i)) return { ok: false, reason: 'invalid' };
      raw += parts.get(i);
    }
  } else {
    raw = input.replace(/\s+/g, '');
  }
  const incoming = decode(raw);
  if (incoming.length === 0) return { ok: false, reason: 'invalid' };

  const current = getFavorites();
  const seen = new Set(current.map(favoriteId));
  const added = incoming.filter((f) => !seen.has(favoriteId(f)) && seen.add(favoriteId(f)));
  const merged = [...current, ...added].sort((a, b) => b.addedAt - a.addedAt);
  if (!writeFavorites(merged)) return { ok: false, reason: 'full' };
  return { ok: true, added: added.length, total: merged.length };
}
