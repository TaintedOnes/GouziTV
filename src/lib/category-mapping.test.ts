import { describe, expect, it } from 'vitest';
import {
  categoryRegionOf,
  classifyCategories,
  itemRegions,
  regionMatches,
  regionsOf,
  type CmsCategory,
} from './genres';
import { planScan } from './browse';

/**
 * 运行时分类映射：三个虚构源，分类 id、父子层级、命名各不相同。
 * 这里的 id 都是编的——目的是证明映射只靠名称和层级，不依赖任何源的具体编号。
 */
const cat = (id: number, pid: number, name: string): CmsCategory => ({ id: String(id), pid: String(pid), name });

// 源 A：电影父级 100，类型从 101 起；解说、预告片、体育、短剧都在顶级
const SOURCE_A = [
  cat(100, 0, '电影片'), cat(101, 100, '动作片'), cat(102, 100, '喜剧片'), cat(103, 100, '恐怖片'), cat(104, 100, '科幻片'),
  cat(105, 100, '爱情片'), cat(106, 100, '剧情片'), cat(107, 100, '战争片'), cat(108, 100, '记录片'), cat(109, 100, '伦理片'),
  cat(110, 100, '动画片'), cat(111, 100, '福利'),
  cat(200, 0, '连续剧'), cat(201, 200, '国产剧'), cat(202, 200, '欧美剧'), cat(203, 200, '香港剧'), cat(204, 200, '韩国剧'),
  cat(205, 200, '台湾剧'), cat(206, 200, '日本剧'), cat(207, 200, '海外剧'), cat(208, 200, '泰国剧'),
  cat(300, 0, '动漫片'), cat(301, 300, '国产动漫'), cat(302, 300, '日韩动漫'), cat(303, 300, '欧美动漫'), cat(304, 300, '港台动漫'), cat(305, 300, '海外动漫'),
  cat(400, 0, '综艺片'), cat(401, 400, '大陆综艺'), cat(402, 400, '港台综艺'), cat(403, 400, '日韩综艺'), cat(404, 400, '欧美综艺'),
  cat(500, 0, '电影解说'), cat(501, 0, '预告片'), cat(502, 0, '体育赛事'), cat(503, 0, '短剧大全'), cat(504, 503, 'AI漫剧'),
];

// 源 B：电影父级 7，编号完全不同；没有动画片分类；纪录片写法不同；短剧挂在电视剧下面
const SOURCE_B = [
  cat(7, 0, '电影'), cat(70, 7, '动作片'), cat(71, 7, '喜剧片'), cat(72, 7, '爱情片'), cat(73, 7, '科幻片'), cat(74, 7, '恐怖片'),
  cat(75, 7, '剧情片'), cat(76, 7, '战争片'), cat(77, 7, '纪录片'), cat(78, 7, '理论片'),
  cat(8, 0, '电视剧'), cat(80, 8, '国产剧'), cat(81, 8, '短剧'),
  cat(9, 0, '动漫'), cat(90, 9, '日韩动漫'),
];

// 源 C：预告片是电影的子分类；有解说、体育、AI漫剧这类没见过的顶级分类
const SOURCE_C = [
  cat(1, 0, '电影'), cat(11, 1, '动作片'), cat(12, 1, '动画片'), cat(13, 1, '预告片'), cat(14, 1, '纪录片'),
  cat(2, 0, '电视剧'), cat(21, 2, '韩国剧'),
  cat(30, 0, '电影解说'), cat(31, 0, '体育'), cat(32, 0, '短剧'), cat(33, 0, 'AI漫剧'),
];

const byId = (list: CmsCategory[]) => Object.fromEntries(classifyCategories(list).map((c) => [c.id, c]));

describe('dynamic category mapping across sources with different ids', () => {
  it.each(['中国动漫', '国产动漫', '日韩动漫'])('recognizes standalone %s without an anime parent', (name) => {
    const mapped = classifyCategories([cat(900, 0, name)]);
    expect(mapped[0]).toMatchObject({ section: 'anime', excluded: false });
    expect(planScan(mapped, { section: 'anime' })?.sectionIds).toEqual(['900']);
  });

  it.each([
    ['action', ['101', '100?'], ['70', '7?'], ['11', '1?']],
    ['comedy', ['102', '100?'], ['71', '7?'], ['1?']],
    ['romance', ['105', '100?'], ['72', '7?'], ['1?']],
    ['sci-fi', ['104', '100?'], ['73', '7?'], ['1?']],
    ['horror', ['103', '100?'], ['74', '7?'], ['1?']],
    ['drama', ['106', '100?'], ['75', '7?'], ['1?']],
    ['war', ['107', '100?'], ['76', '7?'], ['1?']],
    ['documentary', ['108', '100?'], ['77', '7?'], ['14', '1?']],
    ['animation', ['110', '100?'], ['7?'], ['12', '1?']],
  ])('%s prioritizes dedicated categories and scans all other movie categories with tag checks', (genre, a, b, c) => {
    for (const [source, priority, ids] of [
      [SOURCE_A, a, ['100', '101', '102', '103', '104', '105', '106', '107', '108', '110']],
      [SOURCE_B, b, ['7', '70', '71', '72', '73', '74', '75', '76', '77']],
      [SOURCE_C, c, ['1', '11', '12', '14']],
    ] as const) {
      const plan = planScan(classifyCategories([...source]), { section: 'movie', genre })!;
      expect(plan.streams.filter((s) => !s.checkGenre).map((s) => s.t)).toEqual(priority.slice(0, -1));
      expect(`${plan.streams.at(-1)!.t}?`).toBe(priority.at(-1));
      expect(plan.streams.map((s) => s.t).sort()).toEqual([...ids].sort());
      expect(plan.streams.filter((s) => !plan.genreIds.includes(s.t!)).every((s) => s.checkGenre)).toBe(true);
    }
  });

  it('documentary accepts both 纪录片 and 记录片', () => {
    expect(byId(SOURCE_A)['108'].genre).toBe('documentary');
    expect(byId(SOURCE_B)['77'].genre).toBe('documentary');
  });

  it('a source without 动画片 falls back to tag matching inside movies only, never the anime channel', () => {
    const plan = planScan(classifyCategories(SOURCE_B), { section: 'movie', genre: 'animation' })!;
    expect(plan.streams.every((s) => s.checkGenre)).toBe(true);
    expect(plan.streams.map((s) => s.t)).toEqual(['70', '71', '72', '73', '74', '75', '76', '77', '7']);
    expect(plan.sectionIds).not.toContain('9');
    expect(plan.sectionIds).not.toContain('90');
  });

  it('metadata-only genres (mystery etc.) never get a category stream', () => {
    for (const list of [SOURCE_A, SOURCE_B, SOURCE_C]) {
      const streams = planScan(classifyCategories(list), { section: 'movie', genre: 'mystery' })!.streams;
      expect(streams.every((s) => s.checkGenre)).toBe(true);
    }
  });
});

describe('excluded and special categories', () => {
  it('keeps adult categories out of every channel wherever they sit', () => {
    const a = byId(SOURCE_A);
    const b = byId(SOURCE_B);
    for (const x of [a['109'], a['111'], b['78']]) expect(x.excluded, x.name).toBe(true);
    for (const list of [SOURCE_A, SOURCE_B, SOURCE_C]) {
      const all = classifyCategories(list).filter((x) => x.excluded).map((x) => x.id);
      for (const section of ['movie', 'tv', 'anime', 'variety', 'short', 'trailer', 'commentary', 'sports', 'news'] as const) {
        const ids = planScan(classifyCategories(list), { section })?.sectionIds ?? [];
        expect(ids.filter((id) => all.includes(id)), section).toEqual([]);
      }
    }
  });

  it('gives trailers, commentary and sports their own channels, top-level or nested', () => {
    const a = byId(SOURCE_A);
    const c = byId(SOURCE_C);
    expect(a['500'].section).toBe('commentary');
    expect(a['501'].section).toBe('trailer'); // 顶级预告片
    expect(c['13'].section).toBe('trailer'); // 挂在电影下的预告片
    expect(a['502'].section).toBe('sports');
    expect(c['30'].section).toBe('commentary');
    expect(c['31'].section).toBe('sports');
    expect(planScan(classifyCategories(SOURCE_C), { section: 'movie' })!.sectionIds).not.toContain('13'); // 预告片不和正片混在一起
    expect(planScan(classifyCategories(SOURCE_C), { section: 'trailer' })!.streams).toEqual([{ t: '13', checkGenre: false, fallbackToAll: true }]);
    expect(planScan(classifyCategories(SOURCE_B), { section: 'trailer' })).toBeNull(); // 没有预告分类的源：不参与
  });

  it('puts short dramas in their own channel whether top-level or under TV', () => {
    expect(byId(SOURCE_A)['503']).toMatchObject({ section: 'short', excluded: false });
    expect(byId(SOURCE_B)['81']).toMatchObject({ section: 'short', excluded: false });
    expect(byId(SOURCE_C)['32']).toMatchObject({ section: 'short', excluded: false });
    expect(planScan(classifyCategories(SOURCE_B), { section: 'tv' })!.sectionIds).not.toContain('81');
  });

  it('a category under a short-drama parent (AI漫剧 under 短剧大全) joins the 短剧 channel', () => {
    expect(byId(SOURCE_A)['504']).toMatchObject({ section: 'short', excluded: false });
    expect(planScan(classifyCategories(SOURCE_A), { section: 'short' })!.sectionIds).toEqual(['503', '504']);
  });

  it('福利 under the movie parent stays out of movie browsing', () => {
    expect(byId(SOURCE_A)['111'].excluded).toBe(true);
    expect(planScan(classifyCategories(SOURCE_A), { section: 'movie' })!.sectionIds).not.toContain('111');
  });

  it('leaves unknown categories out of every channel', () => {
    expect(byId([cat(99, 0, '未知频道')])['99'].section).toBeUndefined();
  });
});

describe('regions from category names', () => {
  it.each([
    ['国产剧', 'cn'], ['香港剧', 'hk'], ['韩国剧', 'kr'], ['台湾剧', 'tw'], ['日本剧', 'jp'], ['泰国剧', 'th'],
    ['欧美剧', 'west'], ['大陆综艺', 'cn'], ['港台综艺', 'hktw'], ['日韩综艺', 'jpkr'], ['欧美综艺', 'west'],
    ['中国动漫', 'cn'], ['国产动漫', 'cn'], ['日韩动漫', 'jpkr'], ['欧美动漫', 'west'], ['港台动漫', 'hktw'],
  ])('%s → %s', (name, slug) => {
    expect(categoryRegionOf(name)).toBe(slug);
  });

  it('does not invent a region for vague or non-regional names', () => {
    for (const name of ['海外剧', '海外动漫', '动作片', '剧情片', '电视剧', '短剧', 'AI漫剧', '华语片']) {
      expect(categoryRegionOf(name), name).toBeUndefined();
    }
  });

  it("a title's own area wins over its category; combined stays combined", () => {
    expect(itemRegions('日本', 'jpkr')).toEqual(['jp']);
    expect(itemRegions('', 'jpkr')).toEqual(['jpkr']);
    expect(itemRegions(undefined, undefined)).toEqual([]);
    expect(regionsOf('欧美')).toEqual(['west']);
  });

  it('a specific-country filter does not match a combined-only title; the combined filter matches both', () => {
    expect(regionMatches('jp', ['jpkr'])).toBe(false);
    expect(regionMatches('jpkr', ['jpkr'])).toBe(true);
    expect(regionMatches('jpkr', ['jp'])).toBe(true);
    expect(regionMatches('west', ['us'])).toBe(true);
    expect(regionMatches('us', ['west'])).toBe(false);
  });

  it('a region-only TV filter scans matching regional categories first', () => {
    const streams = planScan(classifyCategories(SOURCE_A), { section: 'tv', region: 'kr' })!.streams;
    expect(streams[0]).toEqual({ t: '204', checkGenre: false });
    expect(streams.at(-1)).toMatchObject({ t: '200' });
    const anime = planScan(classifyCategories(SOURCE_A), { section: 'anime', region: 'jpkr' })!.streams;
    // 地区最终按影片自身字段核对，不能仅凭分类名排除其他子分类。
    expect(anime.map((s) => s.t)).toEqual(['302', '301', '303', '304', '305', '300']);
  });
});
