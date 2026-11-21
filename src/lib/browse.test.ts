import { describe, expect, it } from 'vitest';
import { classifyCategories } from './genres';
import { mergeCards, parseBrowseList, planScan, scanSource, type BrowseFilters, type BrowseItem } from './browse';

const SOURCE = { key: 'demo', name: '示例源', url: 'https://cms.example.test/api.php/provide/vod' };

const CATS = classifyCategories([
  { id: '1', pid: '0', name: '电影' },
  { id: '2', pid: '0', name: '电视剧' },
  { id: '6', pid: '1', name: '动作片' },
  { id: '9', pid: '1', name: '科幻片' },
  { id: '11', pid: '1', name: '剧情片' },
  { id: '20', pid: '1', name: '预告片' },
  { id: '13', pid: '2', name: '国产剧' },
]);

function vod(id: number, typeId: number, extra: Record<string, unknown> = {}) {
  return { vod_id: id, vod_name: `影片${id}`, type_id: typeId, type_name: '', vod_year: '2024', vod_area: '美国', ...extra };
}

/** 假源站：按 t + pg 返回固定页面 */
function fakeFetcher(pages: Record<string, unknown[][]>) {
  const calls: string[] = [];
  const fetchPage = async (t: string | null, page: number) => {
    const key = t ?? 'all';
    calls.push(`${key}:${page}`);
    const list = pages[key] ?? [];
    return { list: list[page - 1] ?? [], pagecount: list.length, total: list.flat().length };
  };
  return { fetchPage, calls };
}

describe('planScan', () => {
  it('uses a dedicated genre category first, then all other categories with tag checking', () => {
    const plan = planScan(CATS, { section: 'movie', genre: 'sci-fi' })!;
    expect(plan.streams).toEqual([
      { t: '9', checkGenre: false },
      { t: '6', checkGenre: true },
      { t: '11', checkGenre: true },
      { t: '1', checkGenre: true, fallbackToAll: true },
    ]);
    expect(plan.sectionIds).not.toContain('20'); // 预告片不属于常规片库
    expect(plan.sectionIds).not.toContain('13'); // 电视剧分类不混入电影
  });

  it('checks tags in every category when the source has no category for the genre', () => {
    const plan = planScan(CATS, { section: 'movie', genre: 'mystery' })!;
    expect(plan.streams).toEqual([
      { t: '6', checkGenre: true },
      { t: '9', checkGenre: true },
      { t: '11', checkGenre: true },
      { t: '1', checkGenre: true, fallbackToAll: true },
    ]);
  });

  it('returns null when the source has no such section', () => {
    expect(planScan(CATS, { section: 'variety' })).toBeNull();
  });
});

describe('scanSource', () => {
  it.each([
    ['movie', '电影片', '动作片', '剧情片'],
    ['tv', '连续剧', '国产剧', '韩国剧'],
  ] as const)('loads every %s subcategory and direct parent titles across page-budget boundaries', async (section, root, child, nested) => {
    const categories = classifyCategories([
      { id: '100', pid: '0', name: root },
      { id: '101', pid: '100', name: child },
      { id: '102', pid: '101', name: nested },
      { id: '103', pid: '100', name: '预告片' },
      { id: '104', pid: '100', name: '伦理片' },
    ]);
    const filters: BrowseFilters = { section };
    const plan = planScan(categories, filters)!;
    const { fetchPage, calls } = fakeFetcher({
      '100': [[vod(1, 100)]],
      '101': [[vod(2, 101)]],
      '102': [[vod(3, 102)]],
    });
    const first = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 1 });
    expect(first.items.map((i) => i.vodId)).toEqual(['2']);
    expect(first.next).not.toBeNull();
    const rest = await scanSource(SOURCE, plan, filters, first.next!, fetchPage, { want: 50, maxPages: 10 });
    expect(rest.items.map((i) => i.vodId)).toEqual(['3', '1']);
    expect(rest.next).toBeNull();
    expect(calls).toEqual(['101:1', '102:1', '100:1']);
  });

  it('finds tagged movie genres in other subcategories when the parent does not aggregate them', async () => {
    const filters: BrowseFilters = { section: 'movie', genre: 'sci-fi', region: 'us', yearMin: 2024 };
    const { fetchPage } = fakeFetcher({
      '9': [[vod(1, 9)]],
      '6': [[vod(2, 6, { vod_class: '动作,科幻' }), vod(3, 6, { vod_class: '动作' })]],
      '11': [[vod(4, 11, { vod_class: '科幻', vod_area: '日本' }), vod(5, 11, { vod_class: '科幻', vod_year: '2020' })]],
      '1': [[vod(6, 1, { vod_class: '剧情' })]],
    });
    const result = await scanSource(SOURCE, planScan(CATS, filters)!, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 10 });
    expect(result.items.map((i) => i.vodId)).toEqual(['1', '2']);
  });

  it('checks TV titles own region even outside the matching regional subcategory', async () => {
    const categories = classifyCategories([
      { id: '2', pid: '0', name: '连续剧' },
      { id: '13', pid: '2', name: '国产剧' },
      { id: '14', pid: '2', name: '韩国剧' },
    ]);
    const filters: BrowseFilters = { section: 'tv', region: 'kr' };
    const { fetchPage, calls } = fakeFetcher({
      '14': [[vod(1, 14, { vod_area: '' })]],
      '13': [[vod(2, 13, { vod_area: '韩国' }), vod(3, 13, { vod_area: '' })]],
      '2': [[vod(4, 2, { vod_area: '美国' })]],
    });
    const result = await scanSource(SOURCE, planScan(categories, filters)!, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 10 });
    expect(calls).toEqual(['14:1', '13:1', '2:1']);
    expect(result.items.map((i) => i.vodId)).toEqual(['1', '2']);
  });

  it('loads Chinese anime children even when the anime root has its own nonempty list', async () => {
    const categories = classifyCategories([
      { id: '4', pid: '0', name: '动漫片' },
      { id: '29', pid: '4', name: '中国动漫' },
      { id: '30', pid: '4', name: '日韩动漫' },
    ]);
    const { fetchPage, calls } = fakeFetcher({
      '4': [[vod(1, 4)]],
      '29': [[vod(2, 29, { vod_name: '凡人修仙传', vod_area: '' })]],
      '30': [[vod(3, 30, { vod_area: '日本' })]],
    });
    const filters: BrowseFilters = { section: 'anime' };
    const result = await scanSource(SOURCE, planScan(categories, filters)!, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 10 });
    expect(calls).toEqual(['29:1', '30:1', '4:1']);
    expect(result.items.map((item) => item.vodId)).toEqual(['2', '3', '1']);
    expect(result.items[0].regions).toEqual(['cn']);
    expect(result.next).toBeNull();
  });

  it('still checks genre tags when scanning anime subcategories', async () => {
    const categories = classifyCategories([
      { id: '4', pid: '0', name: '动漫片' },
      { id: '29', pid: '4', name: '国产动漫' },
    ]);
    const { fetchPage } = fakeFetcher({
      '4': [[vod(1, 4)]],
      '29': [[vod(2, 29, { vod_class: '奇幻' }), vod(3, 29, { vod_class: '喜剧' })]],
    });
    const filters: BrowseFilters = { section: 'anime', genre: 'fantasy' };
    const result = await scanSource(SOURCE, planScan(categories, filters)!, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 10 });
    expect(result.items.map((item) => item.vodId)).toEqual(['2']);
  });

  it('never returns adult categories, including via the site-wide fallback', async () => {
    const categories = classifyCategories([
      { id: '1', pid: '0', name: '电影' },
      { id: '6', pid: '1', name: '动作片' },
      { id: '21', pid: '1', name: '伦理片' },
    ]);
    {
      const filters = { section: 'movie' as const };
      const plan = planScan(categories, filters)!;
      const { fetchPage } = fakeFetcher({ all: [[vod(1, 6), vod(2, 21, { type_name: '伦理片' }), vod(3, 6, { type_name: '伦理片' })]] });
      const res = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 5 });
      expect(res.items.map((i) => i.vodId)).toEqual(['1']);
    }
  });

  it('only returns films that really match genre, region and year', async () => {
    const filters: BrowseFilters = { section: 'movie', genre: 'sci-fi', region: 'us', yearMin: 2024, yearMax: 2024 };
    const plan = planScan(CATS, filters)!;
    const { fetchPage } = fakeFetcher({
      '9': [[vod(1, 9), vod(2, 9, { vod_area: '日本' }), vod(3, 9, { vod_year: '2020' })]],
      '1': [[
        vod(4, 6, { vod_class: '动作,科幻' }), // 放在动作片里的科幻片：要找出来
        vod(5, 6, { vod_class: '动作' }), // 不是科幻：不能出现
        vod(6, 11, { vod_area: '' }), // 无地区：不猜
        vod(7, 20, { vod_class: '科幻' }), // 预告片：排除
      ]],
    });
    const res = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 10 });
    expect(res.items.map((i) => i.vodId)).toEqual(['1', '4']);
    expect(res.next).toBeNull();
  });

  it('stops at the page budget and resumes from the cursor', async () => {
    const filters: BrowseFilters = { section: 'movie' };
    const plan = planScan(CATS, filters)!;
    const pages = Array.from({ length: 5 }, (_, p) => [vod(p * 10 + 1, 6), vod(p * 10 + 2, 9)]);
    const { fetchPage, calls } = fakeFetcher({ '6': pages });
    const first = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 100, maxPages: 2 });
    expect(first.items).toHaveLength(4);
    expect(first.next).toEqual({ s: 0, p: 3 });
    const second = await scanSource(SOURCE, plan, filters, first.next!, fetchPage, { want: 100, maxPages: 10 });
    expect(second.items).toHaveLength(6);
    expect(second.next).toBeNull();
    expect(calls).toEqual(['6:1', '6:2', '6:3', '6:4', '6:5', '9:1', '11:1', '1:1', 'all:1']);
  });

  it('falls back to the site-wide list when the root category returns nothing', async () => {
    const filters: BrowseFilters = { section: 'movie' };
    const plan = planScan(CATS, filters)!;
    const { fetchPage, calls } = fakeFetcher({ all: [[vod(1, 6), vod(2, 13), vod(3, 20)]] });
    const res = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 5 });
    expect(calls).toEqual(['6:1', '9:1', '11:1', '1:1', 'all:1']);
    expect(res.items.map((i) => i.vodId)).toEqual(['1']); // 电视剧和预告片被过滤
  });

  it('propagates fetch errors so the caller can mark the source failed', async () => {
    const plan = planScan(CATS, { section: 'movie' })!;
    await expect(
      scanSource(SOURCE, plan, { section: 'movie' }, { s: 0, p: 1 }, async () => { throw new Error('HTTP 502'); }, { want: 5, maxPages: 2 })
    ).rejects.toThrow('HTTP 502');
  });
});

describe('parseBrowseList', () => {
  it('rejects malformed payloads and tolerates list: null', () => {
    expect(() => parseBrowseList('oops', SOURCE)).toThrow();
    expect(() => parseBrowseList({ list: {} }, SOURCE)).toThrow();
    expect(parseBrowseList({ list: null }, SOURCE).items).toEqual([]);
  });
  it('drops entries without id or name', () => {
    const r = parseBrowseList({ list: [{ vod_id: 1 }, { vod_name: 'x' }, vod(3, 6)], pagecount: '2' }, SOURCE);
    expect(r.items.map((i) => i.vodId)).toEqual(['3']);
    expect(r.pageCount).toBe(2);
  });
});

describe('mergeCards', () => {
  const item = (over: Partial<BrowseItem>): BrowseItem => ({
    sourceKey: 'a', sourceName: 'A', vodId: '1', name: '星际穿越', yearNum: 2014, genres: [], regions: [], ...over,
  });

  it('merges the same title + year across sources and keeps alternates', () => {
    const cards = mergeCards([item({}), item({ sourceKey: 'b', vodId: '9', name: '星际穿越 ' })], 'movie');
    expect(cards).toHaveLength(1);
    expect(cards[0].alternates.map((a) => a.sourceKey)).toEqual(['b']);
  });

  it('keeps remakes and entries without a year separate', () => {
    const cards = mergeCards(
      [item({ name: '狮子王', yearNum: 1994 }), item({ sourceKey: 'b', name: '狮子王', yearNum: 2019 }), item({ sourceKey: 'c', name: '狮子王', yearNum: undefined })],
      'movie'
    );
    expect(cards).toHaveLength(3);
  });

  it('drops exact duplicates from the same source', () => {
    expect(mergeCards([item({}), item({})], 'movie')).toHaveLength(1);
  });
});
