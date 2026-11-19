import { isAdultContent } from './cms-parser';

/**
 * 片库分类的唯一数据来源：频道（电影 / 电视剧 / 动漫 / 综艺）、20 个标准类型、地区、年份。
 *
 * 不写死任何源站的分类 ID：每个源的 `?ac=list` 分类表在服务端按名称归类（classifyCategories），
 * 影片的类型再用它自己的 vod_class / type_name 标签判定（genresOf）。
 * 认不出来的就是认不出来——不猜、不硬凑。
 */

// —— 频道 ——

export type SectionId = 'movie' | 'tv' | 'anime' | 'variety' | 'short' | 'trailer' | 'commentary' | 'sports' | 'news';

export interface SectionDef {
  id: SectionId;
  name: string;
  path: string;
  /** 顶级分类名（去掉「片」后缀后精确匹配） */
  rootNames: string[];
  /**
   * 名称含这些词的分类不论挂在哪里都归这个频道（短剧、预告片、电影解说、体育…），
   * 不会混进电影 / 电视剧的正片里。
   */
  nameKeywords?: string[];
  /** 非正片频道：只在「分类」页「更多内容」里出现，不显示类型筛选 */
  special?: boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: 'movie', name: '电影', path: '/movies', rootNames: ['电影', '影片', '电影频道'] },
  { id: 'tv', name: '电视剧', path: '/tv', rootNames: ['电视剧', '连续剧', '剧集', '电视'] },
  { id: 'anime', name: '动漫', path: '/anime', rootNames: ['动漫', '番剧', '动漫频道', 'AI漫剧'] },
  { id: 'variety', name: '综艺', path: '/variety', rootNames: ['综艺', '综艺频道', '真人秀'] },
  // 短剧单独成频道：有的源放在顶级，有的挂在电视剧下面，统一按名称归到这里，不混进电视剧或电影
  { id: 'short', name: '短剧', path: '/shorts', rootNames: ['短剧', '短剧大全', '微短剧', '短剧频道'], nameKeywords: ['短剧'] },
  { id: 'trailer', name: '预告片', path: '/trailers', rootNames: ['预告', '预告片'], nameKeywords: ['预告'], special: true },
  { id: 'commentary', name: '电影解说', path: '/commentary', rootNames: ['解说', '电影解说'], nameKeywords: ['解说'], special: true },
  { id: 'sports', name: '体育', path: '/sports', rootNames: ['体育', '体育赛事', '赛事'], nameKeywords: ['体育', '赛事'], special: true },
  { id: 'news', name: '资讯花絮', path: '/news', rootNames: ['资讯', '新闻', '花絮'], nameKeywords: ['资讯', '新闻', '花絮', '演员'], special: true },
];

export function sectionById(id: string | null | undefined): SectionDef | undefined {
  return SECTIONS.find((s) => s.id === id);
}

// —— 类型 ——

export type GenreGroup = 'popular' | 'suspense' | 'more';

export interface GenreDef {
  id: string;
  slug: string;
  zh: string;
  en: string;
  /** 匹配用的中文标签（已去掉「片」后缀；精确匹配，不做子串匹配） */
  aliases: string[];
  description: string;
  group: GenreGroup;
}

export const ALL_GENRE = { slug: 'all', zh: '全部', en: 'All' } as const;

export const GENRES: GenreDef[] = [
  { id: 'action', slug: 'action', zh: '动作', en: 'Action', aliases: ['动作'], group: 'popular', description: '拳拳到肉的打斗、飞车与爆破场面。' },
  { id: 'comedy', slug: 'comedy', zh: '喜剧', en: 'Comedy', aliases: ['喜剧', '搞笑'], group: 'popular', description: '轻松好笑，适合放空的时候看。' },
  { id: 'romance', slug: 'romance', zh: '爱情', en: 'Romance', aliases: ['爱情'], group: 'popular', description: '相遇、心动与离合的故事。' },
  { id: 'sci-fi', slug: 'sci-fi', zh: '科幻', en: 'Science Fiction', aliases: ['科幻'], group: 'popular', description: '未来科技、太空与平行世界。' },
  { id: 'horror', slug: 'horror', zh: '恐怖', en: 'Horror', aliases: ['恐怖'], group: 'popular', description: '鬼怪、怪物与让人不敢关灯的故事。' },
  { id: 'drama', slug: 'drama', zh: '剧情', en: 'Drama', aliases: ['剧情'], group: 'popular', description: '以人物和情感为核心的故事片。' },
  { id: 'thriller', slug: 'thriller', zh: '惊悚', en: 'Thriller', aliases: ['惊悚'], group: 'suspense', description: '步步紧逼、心跳加速的紧张感。' },
  { id: 'mystery', slug: 'mystery', zh: '悬疑', en: 'Mystery', aliases: ['悬疑'], group: 'suspense', description: '谜团、反转与抽丝剥茧。' },
  { id: 'crime', slug: 'crime', zh: '犯罪', en: 'Crime', aliases: ['犯罪'], group: 'suspense', description: '警匪、黑帮与罪案故事。' },
  { id: 'adventure', slug: 'adventure', zh: '冒险', en: 'Adventure', aliases: ['冒险'], group: 'suspense', description: '探险、寻宝与远方的旅程。' },
  { id: 'fantasy', slug: 'fantasy', zh: '奇幻', en: 'Fantasy', aliases: ['奇幻', '魔幻'], group: 'suspense', description: '魔法、神话与异世界。' },
  { id: 'war', slug: 'war', zh: '战争', en: 'War', aliases: ['战争'], group: 'more', description: '战场、军人与时代洪流。' },
  { id: 'documentary', slug: 'documentary', zh: '纪录', en: 'Documentary', aliases: ['纪录', '记录'], group: 'more', description: '真实的人、事件与自然。' },
  { id: 'animation', slug: 'animation', zh: '动画', en: 'Animation', aliases: ['动画'], group: 'more', description: '动画电影，老少皆宜。' },
  { id: 'family', slug: 'family', zh: '家庭', en: 'Family', aliases: ['家庭'], group: 'more', description: '适合全家一起看的温情故事。' },
  { id: 'history', slug: 'history', zh: '历史', en: 'History', aliases: ['历史'], group: 'more', description: '历史事件与人物。' },
  { id: 'music', slug: 'music', zh: '音乐', en: 'Music', aliases: ['音乐', '歌舞'], group: 'more', description: '音乐人、歌舞与演出。' },
  { id: 'biography', slug: 'biography', zh: '传记', en: 'Biography', aliases: ['传记'], group: 'more', description: '真实人物的一生。' },
  { id: 'sports', slug: 'sports', zh: '运动', en: 'Sports', aliases: ['运动'], group: 'more', description: '赛场内外的拼搏故事。' },
];

export const GENRE_GROUPS: { id: GenreGroup; name: string }[] = [
  { id: 'popular', name: '热门类型' },
  { id: 'suspense', name: '悬疑与冒险' },
  { id: 'more', name: '其他类型' },
];

/** 筛选条上直接露出的类型（其余收进「更多」） */
export const PRIMARY_GENRE_SLUGS = ['action', 'comedy', 'romance', 'sci-fi', 'horror', 'drama', 'mystery', 'crime'];

export function genreBySlug(slug: string | null | undefined): GenreDef | undefined {
  return GENRES.find((g) => g.slug === slug);
}

/** 标签切分：逗号、顿号、斜杠、空白等都可能出现 */
export function splitTags(s: string | undefined | null): string[] {
  if (!s) return [];
  return s
    .split(/[,，、/／|｜;；\s]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 「动作片」→「动作」；「科幻片」→「科幻」；单字「片」不处理 */
function stripPian(tag: string): string {
  return tag.length > 1 && tag.endsWith('片') ? tag.slice(0, -1) : tag;
}

const ALIAS_TO_GENRE = new Map<string, string>();
for (const g of GENRES) for (const a of g.aliases) ALIAS_TO_GENRE.set(a, g.id);

/** 单个标签 → 类型 id（精确匹配，认不出返回 undefined） */
export function genreOfTag(tag: string): string | undefined {
  return ALIAS_TO_GENRE.get(stripPian(tag.trim()));
}

/** 影片的全部类型：vod_class 与 type_name 的标签并集（一部片可以属于多个类型） */
export function genresOf(item: { vodClass?: string; typeName?: string }): string[] {
  const out = new Set<string>();
  for (const tag of [...splitTags(item.vodClass), ...splitTags(item.typeName)]) {
    const id = genreOfTag(tag);
    if (id) out.add(id);
  }
  return [...out];
}

// —— 地区 ——

export interface RegionDef {
  slug: string;
  zh: string;
  aliases: string[];
  /** 合并地区（欧美、日韩、港台）：源站只给到这一级时使用；筛选时也包含其下的具体国家 */
  includes?: string[];
}

export const REGIONS: RegionDef[] = [
  { slug: 'cn', zh: '中国大陆', aliases: ['中国大陆', '大陆', '内地', '中国', '国产', '中国内地'] },
  { slug: 'hk', zh: '香港', aliases: ['香港', '中国香港', '港'] },
  { slug: 'tw', zh: '台湾', aliases: ['台湾', '中国台湾', '台'] },
  { slug: 'us', zh: '美国', aliases: ['美国', '美'] },
  { slug: 'jp', zh: '日本', aliases: ['日本', '日'] },
  { slug: 'kr', zh: '韩国', aliases: ['韩国', '南韩', '韩'] },
  { slug: 'uk', zh: '英国', aliases: ['英国', '英'] },
  { slug: 'th', zh: '泰国', aliases: ['泰国', '泰'] },
];

/** 合并地区：源站分类或地区字段只写到「欧美 / 日韩 / 港台」时，不拆成某个具体国家 */
export const COMBINED_REGIONS: RegionDef[] = [
  { slug: 'west', zh: '欧美', aliases: ['欧美'], includes: ['us', 'uk'] },
  { slug: 'jpkr', zh: '日韩', aliases: ['日韩'], includes: ['jp', 'kr'] },
  { slug: 'hktw', zh: '港台', aliases: ['港台'], includes: ['hk', 'tw'] },
];
export const OTHER_REGION = { slug: 'other', zh: '其他' } as const;

/** 跨多个国家的笼统写法：无法确定具体地区，既不算美国也不算「其他」 */
const AMBIGUOUS_AREAS = new Set(['华语', '海外', '亚洲', '欧洲', '其它', '其他', '未知', '全球']);

const AREA_TO_REGION = new Map<string, string>();
for (const r of [...REGIONS, ...COMBINED_REGIONS]) for (const a of r.aliases) AREA_TO_REGION.set(a, r.slug);

/**
 * vod_area → 地区 slug 列表。
 * 无地区信息返回 []；有明确国家但不在列表里的归为 other；笼统写法（欧美）不归类。
 */
export function regionsOf(area: string | undefined | null): string[] {
  const out = new Set<string>();
  let hasSpecificUnknown = false;
  for (const tag of splitTags(area)) {
    const slug = AREA_TO_REGION.get(tag);
    if (slug) out.add(slug);
    else if (!AMBIGUOUS_AREAS.has(tag)) hasSpecificUnknown = true;
  }
  if (hasSpecificUnknown) out.add(OTHER_REGION.slug);
  return [...out];
}

export function regionBySlug(slug: string | null | undefined) {
  if (slug === OTHER_REGION.slug) return OTHER_REGION;
  return REGIONS.find((r) => r.slug === slug) ?? COMBINED_REGIONS.find((r) => r.slug === slug);
}

/**
 * 影片的地区是否满足筛选：
 * - 选具体国家（日本）：只认明确标为日本的，不认只写了「日韩」的；
 * - 选合并地区（日韩）：标为日韩、日本或韩国的都算。
 */
export function regionMatches(filter: string, itemRegions: string[]): boolean {
  if (itemRegions.includes(filter)) return true;
  const combined = COMBINED_REGIONS.find((r) => r.slug === filter);
  return Boolean(combined?.includes?.some((slug) => itemRegions.includes(slug)));
}

/** 分类名里的地区后缀：国产剧、韩国剧、日韩动漫、大陆综艺、欧美剧… */
const CATEGORY_REGION_SUFFIX = /(电视剧|连续剧|动漫|动画|综艺|电影|剧|片)$/u;
const CATEGORY_REGION_EXTRA: Record<string, string> = { 国产: 'cn' };

/**
 * 分类名 → 地区 slug（仅当名称明确时）。「海外剧」「华语片」等笼统名称返回 undefined。
 * 「日韩动漫」返回合并地区 jpkr，不拆成日本或韩国。
 */
export function categoryRegionOf(name: string): string | undefined {
  const n = name.trim();
  const stem = n.replace(CATEGORY_REGION_SUFFIX, '');
  if (!stem || stem === n) return undefined;
  return CATEGORY_REGION_EXTRA[stem] ?? AREA_TO_REGION.get(stem);
}

/**
 * 影片地区：优先用影片自己的地区字段；字段缺失或只有笼统写法时，才用所在分类的地区。
 */
export function itemRegions(area: string | undefined, categoryRegion: string | undefined): string[] {
  const own = regionsOf(area);
  if (own.length > 0) return own;
  return categoryRegion ? [categoryRegion] : [];
}

// —— 年份 ——

export interface YearOption {
  value: string;
  label: string;
  min?: number;
  max?: number;
}

/** 当年 / 前三年逐年列出，再往前归为「更早」。按传入的「今年」生成，不写死年份 */
export function yearOptions(currentYear = new Date().getFullYear()): YearOption[] {
  const opts: YearOption[] = [];
  for (let y = currentYear; y > currentYear - 4; y--) opts.push({ value: String(y), label: String(y), min: y, max: y });
  opts.push({ value: 'older', label: '更早', max: currentYear - 4 });
  return opts;
}

export function yearRange(value: string | null | undefined, currentYear = new Date().getFullYear()) {
  if (!value) return undefined;
  const opt = yearOptions(currentYear).find((o) => o.value === value);
  return opt ? { min: opt.min, max: opt.max } : undefined;
}

/** vod_year 可能是 "2024"、"2024-05-01"、"0" 或空 */
export function parseYear(v: string | number | undefined | null): number | undefined {
  const m = String(v ?? '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : undefined;
}

// —— 源站分类表归类 ——

export interface CmsCategory {
  id: string;
  pid: string;
  name: string;
}

export interface ClassifiedCategory extends CmsCategory {
  section?: SectionId;
  /** 分类本身就是某个类型（如「科幻片」） */
  genre?: string;
  /** 分类名明确对应的地区（国产剧 → cn，日韩动漫 → jpkr） */
  region?: string;
  /** 不进入点播片库的分类（成人、直播），子分类继承此标记 */
  excluded: boolean;
}

/** 成人或高风险分类：不进入任何频道（子分类一并排除） */
export function isAdultCategoryName(name: string | undefined): boolean {
  return isAdultContent(name) || Boolean(name && /成人|写真|理论|倫理|伦理|福利|adult/i.test(name));
}

// 成人分类与直播（这类源上多为成人直播录像）不进入点播片库。
function isExcludedName(name: string): boolean {
  return isAdultCategoryName(name) || name.includes('直播');
}

function sectionOfName(name: string): SectionId | undefined {
  const n = stripPian(name.trim());
  return SECTIONS.find((s) => s.rootNames.includes(n))?.id;
}

/** 名称带「短剧」「预告」「解说」等的分类不论挂在哪里都归对应频道，成人分类已先被排除 */
function sectionByKeyword(name: string): SectionId | undefined {
  return SECTIONS.find((s) => s.nameKeywords?.some((k) => name.includes(k)))?.id;
}

/**
 * 把一个源的 `?ac=list` 分类表归类到频道 / 类型。
 * - 顶级分类按名称认频道（电影、电视剧…），子分类继承父级频道；
 * - 名称本身是类型的（动作片、科幻片），记下 genre；没有父级时默认属于电影；
 * - 认不出频道的分类不归类（不会出现在任何频道里）。
 */
export function classifyCategories(list: CmsCategory[]): ClassifiedCategory[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const memo = new Map<string, ClassifiedCategory>();

  const classify = (c: CmsCategory, depth = 0): ClassifiedCategory => {
    const hit = memo.get(c.id);
    if (hit) return hit;
    const parent = c.pid && c.pid !== '0' && c.pid !== c.id ? byId.get(c.pid) : undefined;
    const parentInfo = parent && depth < 5 ? classify(parent, depth + 1) : undefined;
    const genre = genreOfTag(c.name);
    const excluded = isExcludedName(c.name) || Boolean(parentInfo?.excluded);
    const section = sectionByKeyword(c.name) ?? parentInfo?.section ?? sectionOfName(c.name) ?? (genre && !parent ? 'movie' : undefined);
    const region = categoryRegionOf(c.name) ?? parentInfo?.region;
    const out: ClassifiedCategory = { ...c, section, genre: section ? genre : undefined, region, excluded };
    memo.set(c.id, out);
    return out;
  };

  return list.map((c) => classify(c));
}

/** 解析 `?ac=list` 响应中的 class 数组（字段可能是数字或字符串） */
export function parseCategoryList(data: unknown): CmsCategory[] {
  const cls = (data as { class?: unknown })?.class;
  if (!Array.isArray(cls)) return [];
  return cls
    .map((c) => {
      const r = c as Record<string, unknown>;
      return { id: String(r.type_id ?? ''), pid: String(r.type_pid ?? '0'), name: String(r.type_name ?? '').trim() };
    })
    .filter((c) => c.id && c.name);
}
