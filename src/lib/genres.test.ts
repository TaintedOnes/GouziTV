import { describe, expect, it } from 'vitest';
import {
  GENRES,
  GENRE_GROUPS,
  PRIMARY_GENRE_SLUGS,
  classifyCategories,
  genreBySlug,
  genreOfTag,
  genresOf,
  parseCategoryList,
  parseYear,
  regionsOf,
  yearOptions,
  yearRange,
} from './genres';

describe('genre registry', () => {
  it('lists every genre from the spec table once, with unique ids and slugs', () => {
    // 规格表：全部电影 + 19 个具体类型
    expect(GENRES.map((g) => g.slug).sort()).toEqual(
      [
        'action', 'comedy', 'romance', 'sci-fi', 'horror', 'drama', 'war', 'documentary', 'animation', 'thriller',
        'mystery', 'crime', 'adventure', 'fantasy', 'family', 'history', 'music', 'biography', 'sports',
      ].sort()
    );
    expect(new Set(GENRES.map((g) => g.id)).size).toBe(GENRES.length);
    for (const g of GENRES) {
      expect(g.zh).toBeTruthy();
      expect(g.description).toBeTruthy();
      expect(GENRE_GROUPS.some((grp) => grp.id === g.group)).toBe(true);
    }
    for (const slug of PRIMARY_GENRE_SLUGS) expect(genreBySlug(slug)).toBeDefined();
  });

  it('no alias is shared by two genres', () => {
    const seen = new Map<string, string>();
    for (const g of GENRES)
      for (const a of g.aliases) {
        expect(seen.get(a), `${a} in ${g.id} and ${seen.get(a)}`).toBeUndefined();
        seen.set(a, g.id);
      }
  });
});

describe('genre normalization', () => {
  it.each([
    ['动作片', 'action'], ['喜剧片', 'comedy'], ['爱情片', 'romance'], ['科幻片', 'sci-fi'], ['恐怖片', 'horror'],
    ['剧情片', 'drama'], ['战争片', 'war'], ['纪录片', 'documentary'], ['记录片', 'documentary'], ['动画片', 'animation'],
    ['惊悚', 'thriller'], ['悬疑', 'mystery'], ['犯罪', 'crime'], ['冒险', 'adventure'], ['奇幻', 'fantasy'], ['魔幻', 'fantasy'],
  ])('%s → %s', (tag, id) => {
    expect(genreOfTag(tag)).toBe(id);
  });

  it('does not guess from partial matches', () => {
    expect(genreOfTag('国产剧')).toBeUndefined();
    expect(genreOfTag('动作冒险')).toBeUndefined();
    expect(genreOfTag('片')).toBeUndefined();
    expect(genreOfTag('')).toBeUndefined();
  });

  it('gives a multi-genre film every matching genre', () => {
    expect(genresOf({ vodClass: '动作,科幻,冒险' }).sort()).toEqual(['action', 'adventure', 'sci-fi']);
    expect(genresOf({ vodClass: '剧情 / 悬疑、犯罪', typeName: '剧情片' }).sort()).toEqual(['crime', 'drama', 'mystery']);
    expect(genresOf({ vodClass: '', typeName: '国产剧' })).toEqual([]);
    expect(genresOf({})).toEqual([]);
  });
});

describe('regions', () => {
  it('normalizes aliases', () => {
    expect(regionsOf('大陆')).toEqual(['cn']);
    expect(regionsOf('中国香港')).toEqual(['hk']);
    expect(regionsOf('美国,英国').sort()).toEqual(['uk', 'us']);
    expect(regionsOf('法国')).toEqual(['other']);
  });
  it('does not assign broad or missing areas', () => {
    expect(regionsOf('华语')).toEqual([]);
    expect(regionsOf('')).toEqual([]);
    expect(regionsOf(undefined)).toEqual([]);
  });
});

describe('years', () => {
  it('builds options from the given current year', () => {
    expect(yearOptions(2031).map((o) => o.value)).toEqual(['2031', '2030', '2029', '2028', 'older']);
    expect(yearRange('older', 2031)).toEqual({ min: undefined, max: 2027 });
    expect(yearRange('2030', 2031)).toEqual({ min: 2030, max: 2030 });
    expect(yearRange('1999', 2031)).toBeUndefined();
  });
  it('parses messy year fields', () => {
    expect(parseYear('2024')).toBe(2024);
    expect(parseYear('2024-05-01')).toBe(2024);
    expect(parseYear('0')).toBeUndefined();
    expect(parseYear(undefined)).toBeUndefined();
  });
});

describe('classifyCategories', () => {
  const sample = parseCategoryList({
    class: [
      { type_id: 1, type_pid: 0, type_name: '电影片' },
      { type_id: 2, type_pid: 0, type_name: '连续剧' },
      { type_id: 3, type_pid: 0, type_name: '综艺片' },
      { type_id: 4, type_pid: 0, type_name: '动漫片' },
      { type_id: 6, type_pid: 1, type_name: '动作片' },
      { type_id: 7, type_pid: 1, type_name: '喜剧片' },
      { type_id: 9, type_pid: 1, type_name: '科幻片' },
      { type_id: 20, type_pid: 1, type_name: '电影解说' },
      { type_id: 21, type_pid: 1, type_name: '伦理片' },
      { type_id: 13, type_pid: 2, type_name: '国产剧' },
      { type_id: 30, type_pid: 0, type_name: '预告片' },
      { type_id: 31, type_pid: 30, type_name: '电影预告' },
      { type_id: 40, type_pid: 0, type_name: '体育赛事' },
      { type_id: 50, type_pid: 0, type_name: '战争片' },
      { type_id: 60, type_pid: 1, type_name: '理论片' },
      { type_id: 61, type_pid: 0, type_name: '体育' },
      { type_id: 62, type_pid: 2, type_name: '短剧' },
      { type_id: 63, type_pid: 1, type_name: '记录片' },
    ],
  });
  const byId = Object.fromEntries(classifyCategories(sample).map((c) => [c.id, c]));

  it('recognises section roots and children', () => {
    expect(byId['1'].section).toBe('movie');
    expect(byId['2'].section).toBe('tv');
    expect(byId['3'].section).toBe('variety');
    expect(byId['4'].section).toBe('anime');
    expect(byId['13']).toMatchObject({ section: 'tv', genre: undefined });
    expect(byId['6']).toMatchObject({ section: 'movie', genre: 'action', excluded: false });
    expect(byId['9']).toMatchObject({ section: 'movie', genre: 'sci-fi' });
  });

  it('keeps adult categories out and gives trailers, commentary and sports their own channels', () => {
    expect(byId['20']).toMatchObject({ section: 'commentary', excluded: false }); // 电影解说
    expect(byId['21'].excluded).toBe(true); // 伦理片
    expect(byId['30']).toMatchObject({ section: 'trailer', excluded: false }); // 预告片
    expect(byId['31']).toMatchObject({ section: 'trailer', excluded: false }); // 电影预告
    expect(byId['40']).toMatchObject({ section: 'sports', excluded: false }); // 体育赛事
    expect(byId['60'].excluded).toBe(true); // 理论片
    expect(byId['61']).toMatchObject({ section: 'sports', excluded: false }); // 体育
    expect(byId['62']).toMatchObject({ section: 'short', excluded: false }); // 短剧单独成频道
    expect(byId['63']).toMatchObject({ section: 'movie', genre: 'documentary', excluded: false });
  });

  it('excludes adult labels and their descendants from every channel', () => {
    const categories = classifyCategories([
      { id: '1', pid: '0', name: '电影' },
      { id: '2', pid: '1', name: '成人专区' },
      { id: '3', pid: '2', name: '动作片' },
      { id: '4', pid: '0', name: '写真' },
      { id: '5', pid: '1', name: '日本无码' },
      { id: '6', pid: '0', name: 'Adult' },
      { id: '7', pid: '0', name: '演员访谈' },
      { id: '8', pid: '0', name: '直播' },
    ]);
    for (const c of categories.slice(1, 6)) {
      expect(c.excluded, c.name).toBe(true);
    }
    expect(categories[6].section).toBe('news');
    expect(categories[7].excluded).toBe(true);
  });

  it('treats a top-level genre category as a movie category', () => {
    expect(byId['50']).toMatchObject({ section: 'movie', genre: 'war' });
  });

  it('survives malformed lists and parent cycles', () => {
    expect(parseCategoryList(null)).toEqual([]);
    expect(parseCategoryList({ class: 'x' })).toEqual([]);
    const cyc = classifyCategories([
      { id: 'a', pid: 'b', name: '甲' },
      { id: 'b', pid: 'a', name: '乙' },
    ]);
    expect(cyc).toHaveLength(2);
  });
});
