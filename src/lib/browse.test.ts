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
  it('uses a dedicated genre category first, then the section root with tag checking', () => {
    const plan = planScan(CATS, { section: 'movie', genre: 'sci-fi' })!;
    expect(plan.streams).toEqual([
      { t: '9', checkGenre: false },
      { t: '1', checkGenre: true, fallbackToAll: true },
    ]);
    expect(plan.sectionIds).not.toContain('20'); // 预告片不属于常规片库
    expect(plan.sectionIds).not.toContain('13'); // 电视剧分类不混入电影
  });

  it('falls back to the root with tag checking when the source has no category for the genre', () => {
    const plan = planScan(CATS, { section: 'movie', genre: 'mystery' })!;
    expect(plan.streams).toEqual([{ t: '1', checkGenre: true, fallbackToAll: true }]);
  });

  it('returns null when the source has no such section', () => {
    expect(planScan(CATS, { section: 'variety' })).toBeNull();
  });
});

describe('scanSource', () => {
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
    const { fetchPage, calls } = fakeFetcher({ '1': pages });
    const first = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 100, maxPages: 2 });
    expect(first.items).toHaveLength(4);
    expect(first.next).toEqual({ s: 0, p: 3 });
    const second = await scanSource(SOURCE, plan, filters, first.next!, fetchPage, { want: 100, maxPages: 10 });
    expect(second.items).toHaveLength(6);
    expect(second.next).toBeNull();
    expect(calls).toEqual(['1:1', '1:2', '1:3', '1:4', '1:5']);
  });

  it('falls back to the site-wide list when the root category returns nothing', async () => {
    const filters: BrowseFilters = { section: 'movie' };
    const plan = planScan(CATS, filters)!;
    const { fetchPage, calls } = fakeFetcher({ all: [[vod(1, 6), vod(2, 13), vod(3, 20)]] });
    const res = await scanSource(SOURCE, plan, filters, { s: 0, p: 1 }, fetchPage, { want: 50, maxPages: 5 });
    expect(calls).toEqual(['1:1', 'all:1']);
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
