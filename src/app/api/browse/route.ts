import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { cmsRequestHeaders } from '@/lib/cms-parser';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import { classifyCategories, parseCategoryList, sectionById, genreBySlug, regionBySlug, type ClassifiedCategory } from '@/lib/genres';
import { planScan, scanSource, type BrowseApiResponse, type BrowseFilters, type BrowseItem, type BrowseSourceStatus, type ScanCursor } from '@/lib/browse';
import type { SourceConfig } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * 片库浏览：POST { sources, filters, cursors? }
 *
 * - 每个源先取 `?ac=list` 分类表（缓存 6 小时），按名称归类出频道 / 类型分类；
 * - 再按扫描计划逐页取 `?ac=videolist`（每页缓存 10 分钟），在服务端按类型 / 地区 / 年份过滤；
 * - 返回本批结果和每个源的游标；前端「加载更多」时带回游标继续。
 * - 某个源失败：本次浏览不再扫它（游标置空），并在 sources 里报告，不会无限重试。
 *
 * 只请求调用方传入的源，地址经过 SSRF 校验，不是开放代理。
 */

const CATEGORY_TTL = 6 * 60 * 60 * 1000;
const PAGE_TTL = 10 * 60 * 1000;
const PAGE_TIMEOUT_MS = 7000;
const CALL_BUDGET_MS = 8000;
const MAX_PAGES_PER_SOURCE = 5;
const BATCH_TARGET = 24;
const MAX_SOURCES = 20;

interface BrowseBody {
  sources: SourceConfig[];
  section: string;
  genre?: string;
  region?: string;
  yearMin?: number;
  yearMax?: number;
  cursors?: Record<string, ScanCursor | null>;
}

function baseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

async function getJson(url: string): Promise<unknown> {
  const cached = getCache<unknown>(`browse-json:${url}`);
  if (cached !== undefined) return cached;
  const res = await fetchUpstream(url, { timeoutMs: PAGE_TIMEOUT_MS, headers: cmsRequestHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('源站返回的不是 JSON');
  }
  setCache(`browse-json:${url}`, data, url.includes('ac=list') ? CATEGORY_TTL : PAGE_TTL);
  return data;
}

async function categoriesOf(source: SourceConfig): Promise<ClassifiedCategory[]> {
  const key = `browse-cats:${baseUrl(source.url)}`;
  const hit = getCache<ClassifiedCategory[]>(key);
  if (hit) return hit;
  const list = parseCategoryList(await getJson(`${baseUrl(source.url)}?ac=list`));
  const classified = classifyCategories(list);
  setCache(key, classified, CATEGORY_TTL);
  return classified;
}

function parseBody(raw: unknown): { sources: SourceConfig[]; filters: BrowseFilters; cursors?: BrowseBody['cursors'] } | string {
  const body = raw as BrowseBody;
  if (!body || !Array.isArray(body.sources) || body.sources.length === 0) return '请至少选择一个点播源';
  const section = sectionById(body.section);
  if (!section) return '未知的频道';
  if (body.genre && !genreBySlug(body.genre)) return '未知的类型';
  if (body.region && !regionBySlug(body.region)) return '未知的地区';
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);
  const sources = body.sources
    .filter((s) => s && typeof s.key === 'string' && typeof s.url === 'string' && /^https?:\/\//.test(s.url) && !s.isAdult)
    .slice(0, MAX_SOURCES);
  if (sources.length === 0) return '没有可用的点播源';
  return {
    sources,
    filters: {
      section: section.id,
      genre: genreBySlug(body.genre)?.id,
      region: body.region || undefined,
      yearMin: num(body.yearMin),
      yearMax: num(body.yearMax),
    },
    cursors: body.cursors && typeof body.cursors === 'object' ? body.cursors : undefined,
  };
}

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
  const { sources, filters, cursors } = parsed;

  const deadline = Date.now() + CALL_BUDGET_MS;
  const active = sources.filter((s) => !cursors || cursors[s.key] !== null);
  const want = Math.max(8, Math.ceil(BATCH_TARGET / Math.max(1, active.length)));

  const results = await Promise.all(
    sources.map(async (source): Promise<{ status: BrowseSourceStatus; items: BrowseItem[]; next: ScanCursor | null }> => {
      const start = cursors ? cursors[source.key] : { s: 0, p: 1 };
      if (start === null) {
        return { status: { sourceKey: source.key, ok: true, pagesScanned: 0, done: true }, items: [], next: null };
      }
      const cursor: ScanCursor = start && typeof start === 'object' ? start : { s: 0, p: 1 };
      try {
        const verdict = await checkUpstreamAllowed(source.url);
        if (!verdict.ok) throw new Error(verdict.reason);
        const plan = planScan(await categoriesOf(source), filters);
        if (!plan || plan.streams.length === 0) {
          return {
            status: { sourceKey: source.key, ok: true, unsupported: true, pagesScanned: 0, done: true },
            items: [],
            next: null,
          };
        }
        const base = baseUrl(source.url);
        const result = await scanSource(
          source,
          plan,
          filters,
          cursor,
          (t, page) => getJson(`${base}?ac=videolist${t ? `&t=${encodeURIComponent(t)}` : ''}&pg=${page}`),
          { want, maxPages: MAX_PAGES_PER_SOURCE, deadline }
        );
        return {
          status: { sourceKey: source.key, ok: true, pagesScanned: result.pagesScanned, done: result.next === null },
          items: result.items,
          next: result.next,
        };
      } catch (err) {
        // 失败的源本次浏览不再重试，避免「加载更多」反复撞同一个坏源
        return {
          status: {
            sourceKey: source.key,
            ok: false,
            error: err instanceof Error ? err.message : '请求失败',
            pagesScanned: 0,
            done: true,
          },
          items: [],
          next: null,
        };
      }
    })
  );

  const nextCursors: Record<string, ScanCursor | null> = {};
  for (let i = 0; i < sources.length; i++) nextCursors[sources[i].key] = results[i].next;

  // 各源轮流取一条，保持每个源的原始顺序（源站按更新时间倒序），避免某个源霸屏
  const queues = results.map((r) => r.items);
  const items: BrowseItem[] = [];
  for (let round = 0; queues.some((q) => round < q.length); round++) {
    for (const q of queues) if (round < q.length) items.push(q[round]);
  }

  const payload: BrowseApiResponse = {
    items,
    cursors: nextCursors,
    done: Object.values(nextCursors).every((c) => c === null),
    sources: results.map((r) => r.status),
  };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
