import { normalizeTitle } from './cms-parser';
import {
  genresOf,
  isAdultCategoryName,
  itemRegions,
  parseYear,
  regionMatches,
  regionsOf,
  type ClassifiedCategory,
  type SectionId,
} from './genres';
import type { SearchResultItem } from './types';

/**
 * 片库浏览的核心逻辑（纯函数，服务端路由与单元测试共用）。
 *
 * 苹果 CMS 的列表接口只支持按分类（t）和页码（pg）取数据，不支持按地区、年份、标签筛选。
 * 所以筛选在服务端逐页进行：按「扫描计划」顺序翻页，只留下真正满足全部条件的影片，
 * 返回游标让下一次请求从断点继续。前端据此显示「已扫描到第几页 / 是否扫完」，
 * 不会把一页的局部结果当作完整片库。
 */

export interface BrowseFilters {
  section: SectionId;
  /** 类型 id；缺省 = 全部 */
  genre?: string;
  /** 地区 slug；缺省 = 全部 */
  region?: string;
  yearMin?: number;
  yearMax?: number;
}

export interface BrowseItem extends SearchResultItem {
  typeId?: string;
  genres: string[];
  regions: string[];
  yearNum?: number;
}

/** 一条扫描线：按某个分类（或全站）逐页翻 */
export interface ScanStream {
  /** 分类 id；null = 不带 t 的全站最新列表 */
  t: string | null;
  /** 该线上的影片还需要用自己的标签核对类型（专属类型分类不需要） */
  checkGenre: boolean;
  /** 根分类不带出子分类时，回退为全站列表 + 分类过滤 */
  fallbackToAll?: boolean;
}

export interface ScanPlan {
  streams: ScanStream[];
  /** 该频道（含子分类）全部分类 id，用于过滤全站列表 */
  sectionIds: string[];
  /** 专属类型分类 id → 命中即算该类型 */
  genreIds: string[];
  /** 分类 id → 分类名对应的地区（国产剧 → cn），影片自身没有地区字段时使用 */
  categoryRegions: Record<string, string>;
}

/** 源站分类表 + 筛选条件 → 扫描计划；该源没有这个频道时返回 null */
export function planScan(categories: ClassifiedCategory[], filters: BrowseFilters): ScanPlan | null {
  const inSection = categories.filter((c) => c.section === filters.section && !c.excluded);
  if (inSection.length === 0) return null;
  const sectionIds = inSection.map((c) => c.id);
  const sectionIdSet = new Set(sectionIds);
  // 频道根：父级不在本频道内的分类（通常就是「电影」这一个顶级分类）
  const roots = inSection.filter((c) => !sectionIdSet.has(c.pid));
  const genreIds = filters.genre ? inSection.filter((c) => c.genre === filters.genre).map((c) => c.id) : [];

  const categoryRegions: Record<string, string> = {};
  for (const c of inSection) if (c.region) categoryRegions[c.id] = c.region;

  const streams: ScanStream[] = [];
  // 1) 源站自带该类型分类（如「科幻片」）：先扫它，最准也最省请求
  for (const id of genreIds) streams.push({ t: id, checkGenre: false });
  // 1b) 只按地区筛选时，源站自带的地区分类（如「韩国剧」）同理先扫；地区仍逐条核对
  if (!filters.genre && filters.region) {
    for (const c of inSection) {
      if (c.region && regionMatches(filters.region, [c.region]) && !roots.includes(c)) streams.push({ t: c.id, checkGenre: false });
    }
  }
  // 根分类可能只返回直接归档的影片，不包含动作片 / 国产剧 / 国产动漫等子分类。
  // 每个频道都明确扫描子分类，不能把非空的根分类当作完整片库。
  for (const c of inSection) {
    if (roots.includes(c) || streams.some((s) => s.t === c.id)) continue;
    streams.push({ t: c.id, checkGenre: Boolean(filters.genre) });
  }
  // 2) 再扫频道根，用影片自己的 vod_class 找出其余分类里同样属于该类型的片子
  //    （一部「动作, 科幻」的片子可能被源站放在动作片下）
  for (const root of roots) {
    if (genreIds.includes(root.id)) continue;
    streams.push({ t: root.id, checkGenre: Boolean(filters.genre), fallbackToAll: true });
  }
  return { streams, sectionIds, genreIds, categoryRegions };
}

/** 单条影片是否满足全部筛选条件（缺少对应元数据 = 不满足，不猜） */
export function matchesFilters(item: BrowseItem, filters: BrowseFilters, plan: ScanPlan, stream: ScanStream): boolean {
  if (item.typeId && !plan.sectionIds.includes(item.typeId)) return false;
  if (!item.typeId && stream.t === null) return false;
  if (isAdultCategoryName(item.typeName)) return false;
  if (filters.genre && stream.checkGenre) {
    const byCategory = item.typeId ? plan.genreIds.includes(item.typeId) : false;
    if (!byCategory && !item.genres.includes(filters.genre)) return false;
  }
  if (filters.region && !regionMatches(filters.region, item.regions)) return false;
  if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
    if (item.yearNum === undefined) return false;
    if (filters.yearMin !== undefined && item.yearNum < filters.yearMin) return false;
    if (filters.yearMax !== undefined && item.yearNum > filters.yearMax) return false;
  }
  return true;
}

/** `?ac=videolist` 响应 → 浏览条目（带类型 / 地区 / 年份归一化结果） */
export function parseBrowseList(
  data: unknown,
  source: { key: string; name: string; url: string }
): { items: BrowseItem[]; pageCount: number; total: number } {
  if (!data || typeof data !== 'object') throw new Error('API返回的数据格式无效');
  const d = data as { list?: unknown; pagecount?: unknown; total?: unknown };
  if (d.list !== null && d.list !== undefined && !Array.isArray(d.list)) throw new Error('API返回的数据格式无效');
  const list = Array.isArray(d.list) ? d.list : [];
  const items = list
    .map((raw): BrowseItem | null => {
      const v = raw as Record<string, unknown>;
      const vodId = String(v.vod_id ?? '').trim();
      const name = String(v.vod_name ?? '').trim();
      if (!vodId || !name) return null;
      const typeName = s(v.type_name);
      const vodClass = s(v.vod_class);
      const area = s(v.vod_area);
      const year = s(v.vod_year) ?? (typeof v.vod_year === 'number' ? String(v.vod_year) : undefined);
      return {
        sourceKey: source.key,
        sourceName: source.name,
        sourceUrl: source.url,
        vodId,
        name,
        pic: s(v.vod_pic),
        typeName,
        typeId: v.type_id !== undefined && v.type_id !== null ? String(v.type_id) : undefined,
        year,
        yearNum: parseYear(year),
        area,
        remarks: s(v.vod_remarks),
        updateTime: typeof v.vod_time === 'number' ? String(v.vod_time) : s(v.vod_time),
        genres: genresOf({ vodClass, typeName }),
        regions: regionsOf(area),
      };
    })
    .filter((x): x is BrowseItem => x !== null);
  const pageCount = toInt(d.pagecount, 1);
  const total = toInt(d.total, items.length);
  return { items, pageCount, total };
}

function s(v: unknown): string | undefined {
  const t = typeof v === 'string' ? v.trim() : '';
  return t || undefined;
}

function toInt(v: unknown, dflt: number): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

// —— 扫描 ——

/** 游标：第几条扫描线、下一页页码、是否已回退为全站列表 */
export interface ScanCursor {
  s: number;
  p: number;
  all?: boolean;
}

export interface ScanResult {
  items: BrowseItem[];
  /** null = 该源已扫完 */
  next: ScanCursor | null;
  /** 本次请求实际翻过的页数 */
  pagesScanned: number;
  /** 当前扫描线的总页数（源站返回），用于显示进度 */
  pageCount?: number;
}

export type PageFetcher = (t: string | null, page: number) => Promise<unknown>;

/**
 * 从游标处继续翻页，直到收集够 `want` 条、达到本次页数上限或扫完全部扫描线。
 * 单页失败直接抛出：调用方把该源标记为失败，游标不前进，下次可重试。
 */
export async function scanSource(
  source: { key: string; name: string; url: string },
  plan: ScanPlan,
  filters: BrowseFilters,
  cursor: ScanCursor,
  fetchPage: PageFetcher,
  opts: { want: number; maxPages: number; deadline?: number }
): Promise<ScanResult> {
  const items: BrowseItem[] = [];
  let { s: si, p: page } = cursor;
  let all = Boolean(cursor.all);
  let pagesScanned = 0;
  let pageCount: number | undefined;

  while (si < plan.streams.length) {
    if (items.length >= opts.want || pagesScanned >= opts.maxPages) break;
    if (opts.deadline && Date.now() > opts.deadline && pagesScanned > 0) break;
    const base = plan.streams[si];
    const stream: ScanStream = all ? { t: null, checkGenre: base.checkGenre } : base;
    const parsed = parseBrowseList(await fetchPage(stream.t, page), source);
    pagesScanned++;
    pageCount = parsed.pageCount;

    // 有的源按根分类查询不会带出子分类（返回空）：改用全站最新列表，再按本频道分类过滤
    if (page === 1 && !all && base.fallbackToAll && parsed.items.length === 0 && parsed.total === 0) {
      all = true;
      continue;
    }

    for (const item of parsed.items) {
      // 影片没写地区时，用所在分类的地区（如「韩国剧」）补上
      if (item.typeId && plan.categoryRegions[item.typeId]) {
        item.regions = itemRegions(item.area, plan.categoryRegions[item.typeId]);
      }
      if (matchesFilters(item, filters, plan, stream)) items.push(item);
    }

    if (page < parsed.pageCount && parsed.items.length > 0) {
      page++;
    } else {
      si++;
      page = 1;
      all = false;
    }
  }

  const next = si < plan.streams.length ? { s: si, p: page, ...(all ? { all: true } : {}) } : null;
  return { items, next, pagesScanned, pageCount };
}

// —— 跨源合并 ——

export interface BrowseCard {
  key: string;
  primary: BrowseItem;
  /** 同一部影片在其他源的条目（换源备用） */
  alternates: BrowseItem[];
}

/**
 * 保守去重：只有「归一化片名 + 年份 + 频道」完全一致才视为同一部；
 * 任一方缺年份就不合并（避免把同名翻拍 / 不同作品并在一起）。同源同 id 的重复直接丢弃。
 */
export function mergeCards(items: BrowseItem[], section: SectionId): BrowseCard[] {
  const seenIds = new Set<string>();
  const byIdentity = new Map<string, BrowseCard>();
  const cards: BrowseCard[] = [];
  for (const item of items) {
    const idKey = `${item.sourceKey}_${item.vodId}`;
    if (seenIds.has(idKey)) continue;
    seenIds.add(idKey);
    const title = normalizeTitle(item.name);
    const identity = title && item.yearNum ? `${section}|${title}|${item.yearNum}` : undefined;
    const existing = identity ? byIdentity.get(identity) : undefined;
    if (existing) {
      if (!existing.alternates.some((a) => a.sourceKey === item.sourceKey)) existing.alternates.push(item);
      continue;
    }
    const card: BrowseCard = { key: idKey, primary: item, alternates: [] };
    if (identity) byIdentity.set(identity, card);
    cards.push(card);
  }
  return cards;
}

// —— /api/browse 响应 ——

export interface BrowseSourceStatus {
  sourceKey: string;
  ok: boolean;
  error?: string;
  /** 该源没有这个频道的分类 */
  unsupported?: boolean;
  pagesScanned: number;
  done: boolean;
}

export interface BrowseApiResponse {
  items: BrowseItem[];
  cursors: Record<string, ScanCursor | null>;
  done: boolean;
  sources: BrowseSourceStatus[];
}
