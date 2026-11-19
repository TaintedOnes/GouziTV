'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { mergeCards, type BrowseCard, type BrowseSourceStatus } from '@/lib/browse';
import {
  ALL_GENRE,
  COMBINED_REGIONS,
  GENRES,
  OTHER_REGION,
  PRIMARY_GENRE_SLUGS,
  REGIONS,
  genreBySlug,
  regionBySlug,
  sectionById,
  yearOptions,
  yearRange,
  type SectionId,
} from '@/lib/genres';
import { useAppStore } from '@/lib/store';
import { isTvDevice } from '@/lib/tv';
import { cn } from '@/lib/utils';
import type { SearchResultItem } from '@/lib/types';
import { DetailModal } from './detail-modal';
import { EmptyState, ErrorState } from './states';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { useSelectedSources } from './use-selected-sources';

export interface BrowseFiltersState {
  genre?: string;
  region?: string;
  year?: string;
}

/** 筛选条件 → 链接。电影的类型走 /movies/genre/<slug>，其余条件放在查询串里 */
export function browseHref(section: SectionId, f: BrowseFiltersState): string {
  const sec = sectionById(section)!;
  const sp = new URLSearchParams();
  let path = sec.path;
  if (f.genre && section === 'movie') path = `/movies/genre/${f.genre}`;
  else if (f.genre) sp.set('genre', f.genre);
  if (f.region) sp.set('region', f.region);
  if (f.year) sp.set('year', f.year);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** 浏览数据：游标分页（服务端逐页扫描 + 过滤） */
export function useBrowse(section: SectionId, f: BrowseFiltersState, enabled = true) {
  const sources = useSelectedSources();
  const range = yearRange(f.year);
  const query = useInfiniteQuery({
    queryKey: ['browse', section, f.genre ?? '', f.region ?? '', f.year ?? '', sources.map((s) => s.key).join(',')],
    queryFn: ({ pageParam, signal }) =>
      api.browse(
        {
          sources,
          section,
          genre: f.genre,
          region: f.region,
          yearMin: range?.min,
          yearMax: range?.max,
          cursors: pageParam,
        },
        signal
      ),
    initialPageParam: undefined as Record<string, { s: number; p: number; all?: boolean } | null> | undefined,
    getNextPageParam: (last) => (last.done ? undefined : last.cursors),
    enabled: enabled && sources.length > 0,
    // 从播放页返回时直接用缓存渲染：已加载的页、滚动位置和焦点都能还原
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const cards = useMemo(
    () => mergeCards(query.data?.pages.flatMap((p) => p.items) ?? [], section),
    [query.data, section]
  );
  const statuses = useMemo(() => {
    const map = new Map<string, BrowseSourceStatus & { pages: number }>();
    for (const page of query.data?.pages ?? [])
      for (const st of page.sources) {
        const prev = map.get(st.sourceKey);
        map.set(st.sourceKey, { ...st, pages: (prev?.pages ?? 0) + st.pagesScanned, ok: st.ok && (prev?.ok ?? true), error: st.error ?? prev?.error, unsupported: st.unsupported ?? prev?.unsupported });
      }
    return [...map.values()];
  }, [query.data]);

  return { ...query, cards, statuses, sources };
}

/** 读取 URL 中的筛选条件（非法值忽略） */
export function useUrlFilters(fixedGenre?: string): BrowseFiltersState {
  const sp = useSearchParams();
  const genre = fixedGenre ?? sp.get('genre') ?? undefined;
  const region = sp.get('region') ?? undefined;
  const year = sp.get('year') ?? undefined;
  return {
    genre: genreBySlug(genre) ? genre : undefined,
    region: regionBySlug(region) ? region : undefined,
    year: yearRange(year) ? year : undefined,
  };
}

export function BrowseView({ section, fixedGenre }: { section: SectionId; fixedGenre?: string }) {
  const sec = sectionById(section)!;
  const filters = useUrlFilters(fixedGenre);
  const genre = genreBySlug(filters.genre);
  const browse = useBrowse(section, filters);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ?? envSources.find((a) => a.key === key)?.name ?? key;

  // 一批扫描下来不足一屏（筛选很严格）：自动续扫几批，再交给「加载更多」
  const pageCount = browse.data?.pages.length ?? 0;
  useEffect(() => {
    if (browse.hasNextPage && !browse.isFetching && !browse.isError && browse.cards.length < 18 && pageCount > 0 && pageCount < 4) {
      void browse.fetchNextPage();
    }
  }, [browse, pageCount]);

  const title = genre ? `${genre.zh}${section === 'movie' ? '电影' : ` · ${sec.name}`}` : section === 'movie' ? '全部电影' : sec.name;
  const failed = browse.statuses.filter((s) => !s.ok);
  const unsupported = browse.statuses.filter((s) => s.unsupported);
  const scanned = browse.statuses.reduce((n, s) => n + s.pages, 0);
  const finished = Boolean(browse.data) && !browse.hasNextPage;
  // 全部源都失败：这不是「没有结果」，而是加载失败
  const allFailed = finished && browse.cards.length === 0 && browse.statuses.length > 0 && failed.length + unsupported.length === browse.statuses.length && failed.length > 0;

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 sm:pb-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-content">{title}</h1>
        {genre && <p className="text-sm text-muted mt-1">{genre.description}</p>}
      </div>

      <BrowseFilterBar section={section} filters={filters} />

      {browse.sources.length === 0 ? (
        <EmptyState
          icon="gear"
          title="还没有可用的点播源"
          description="请先在右上角「设置」里添加并勾选点播源，片库会从这些源里按分类浏览"
          className="!py-16"
        />
      ) : browse.isError && !browse.data ? (
        <ErrorState message={browse.error instanceof Error ? browse.error.message : '加载失败'} onRetry={() => void browse.refetch()} />
      ) : (
        <>
          <BrowseGrid cards={browse.cards} onOpen={setDetailItem} />

          {browse.isLoading && <GridSkeleton />}

          {allFailed && (
            <ErrorState message="所选点播源都没能加载，请稍后重试或在设置中检查点播源" onRetry={() => void browse.refetch()} />
          )}

          {finished && browse.cards.length === 0 && !allFailed && (
            <EmptyState
              icon="search"
              title="没有符合条件的影片"
              description={
                genre
                  ? `已检索完所选点播源，没有找到标注为「${genre.zh}」且符合其他条件的${sec.name}。部分源站不提供类型标签，这类影片无法按类型筛选。`
                  : '已检索完所选点播源，没有找到符合条件的影片，可以放宽地区或年份条件'
              }
              className="!py-16"
            />
          )}

          <div className="mt-5 flex flex-col items-center gap-2 text-xs text-faint">
            {browse.hasNextPage && (
              <button
                className="btn-ghost btn-sm"
                disabled={browse.isFetchingNextPage}
                onClick={() => void browse.fetchNextPage()}
              >
                {browse.isFetchingNextPage ? '正在加载…' : '加载更多'}
              </button>
            )}
            {browse.data && !allFailed && (
              <p>
                按源站更新时间排列 · 已检索 {scanned} 页
                {finished ? ` · 已全部加载，共 ${browse.cards.length} 部` : browse.cards.length ? ` · 已显示 ${browse.cards.length} 部` : ''}
              </p>
            )}
            {failed.length > 0 && (
              <p className="text-warning">
                {failed.length} 个源加载失败，本次不再从这些源加载：
                {failed.map((s) => `${sourceName(s.sourceKey)}（${s.error}）`).join('、')}
              </p>
            )}
            {unsupported.length > 0 && (
              <p>
                {unsupported.length} 个源没有「{sec.name}」分类：{unsupported.map((s) => sourceName(s.sourceKey)).join('、')}
              </p>
            )}
          </div>
        </>
      )}

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </main>
  );
}

// —— 筛选条 ——

function Chip({ href, active, children, autoFocus }: { href: string; active: boolean; children: React.ReactNode; autoFocus?: boolean }) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={active ? 'true' : undefined}
      data-autofocus={autoFocus ? '' : undefined}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap',
        active
          ? 'bg-accent/15 text-accent-hover ring-1 ring-inset ring-accent/25 font-medium'
          : 'text-muted hover:text-content hover:bg-hover/70'
      )}
    >
      {children}
    </Link>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-faint shrink-0 w-10 pt-2">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function BrowseFilterBar({ section, filters }: { section: SectionId; filters: BrowseFiltersState }) {
  const [moreGenres, setMoreGenres] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tv, setTv] = useState(false);
  useEffect(() => setTv(isTvDevice()), []);

  const href = (patch: Partial<BrowseFiltersState>) => browseHref(section, { ...filters, ...patch });
  const showAllGenres = tv || moreGenres || (filters.genre && !PRIMARY_GENRE_SLUGS.includes(filters.genre));
  const genreList = showAllGenres ? GENRES : GENRES.filter((g) => PRIMARY_GENRE_SLUGS.includes(g.slug));
  const years = yearOptions();
  const activeCount = (filters.region ? 1 : 0) + (filters.year ? 1 : 0);

  // 预告片、解说、体育等非正片频道：类型筛选没有意义，只保留地区和年份
  const showGenres = !sectionById(section)?.special;

  return (
    <div className="card p-3 mb-5 space-y-2">
      {showGenres && (
      <FilterRow label="类型">
        <Chip href={href({ genre: undefined })} active={!filters.genre} autoFocus={!filters.genre}>
          {ALL_GENRE.zh}
        </Chip>
        {genreList.map((g) => (
          <Chip key={g.slug} href={href({ genre: g.slug })} active={filters.genre === g.slug} autoFocus={filters.genre === g.slug}>
            {g.zh}
          </Chip>
        ))}
        {!tv && !showAllGenres && (
          <button
            type="button"
            className="px-3 py-1.5 rounded-full text-sm text-muted hover:text-content hover:bg-hover/70 inline-flex items-center gap-1"
            aria-expanded={false}
            onClick={() => setMoreGenres(true)}
          >
            更多 <Icon name="chevronDown" className="w-3.5 h-3.5" />
          </button>
        )}
      </FilterRow>
      )}

      {/* 手机上地区 / 年份收进「筛选」面板，避免首屏全是筛选条 */}
      <button
        type="button"
        className="sm:hidden w-full flex items-center justify-between rounded-lg bg-chip px-3 py-2 text-sm text-muted"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon name="filter" className="w-4 h-4" />
          地区与年份{activeCount ? `（已选 ${activeCount}）` : ''}
        </span>
        <Icon name="chevronDown" className={cn('w-4 h-4 transition-transform', panelOpen && 'rotate-180')} />
      </button>

      <div className={cn('space-y-2', !panelOpen && 'hidden sm:block')}>
        <FilterRow label="地区">
          <Chip href={href({ region: undefined })} active={!filters.region}>
            全部
          </Chip>
          {[...REGIONS, ...COMBINED_REGIONS, OTHER_REGION].map((r) => (
            <Chip key={r.slug} href={href({ region: r.slug })} active={filters.region === r.slug}>
              {r.zh}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="年份">
          <Chip href={href({ year: undefined })} active={!filters.year}>
            全部
          </Chip>
          {years.map((y) => (
            <Chip key={y.value} href={href({ year: y.value })} active={filters.year === y.value}>
              {y.label}
            </Chip>
          ))}
        </FilterRow>
      </div>
    </div>
  );
}

// —— 海报墙 ——

export function BrowseGrid({ cards, onOpen }: { cards: BrowseCard[]; onOpen: (item: SearchResultItem) => void }) {
  if (cards.length === 0) return null;
  return (
    <div className="poster-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
      {cards.map((card) => (
        <PosterCard key={card.key} card={card} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function PosterCard({ card, onOpen, className }: { card: BrowseCard; onOpen: (item: SearchResultItem) => void; className?: string }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const item = card.primary;
  const open = () => onOpen(item);
  const genreNames = item.genres
    .map((id) => GENRES.find((g) => g.id === id)?.zh)
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return (
    <div
      className={cn('card cursor-pointer hover:scale-[1.03] hover:shadow-md focus-visible:outline-none', className)}
      role="button"
      tabIndex={0}
      data-focus-key={card.key}
      aria-label={`${item.name}${item.yearNum ? `（${item.yearNum}）` : ''}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="relative aspect-[2/3] bg-chip">
        {item.pic && !imgFailed ? (
          <SmartImage
            url={item.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.name}
            className="w-full h-full object-cover"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs text-faint">{item.name}</div>
        )}
        {item.remarks && (
          <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate tag bg-black/70 text-white text-[10px]">
            {item.remarks}
          </span>
        )}
        {card.alternates.length > 0 && (
          <span className="absolute top-1.5 right-1.5 tag bg-black/70 text-white text-[10px]" title="多个点播源都有这部影片">
            {card.alternates.length + 1} 源
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-content truncate" title={item.name}>
          {item.name}
        </div>
        <div className="text-[11px] text-faint truncate">
          {[item.yearNum, genreNames].filter(Boolean).join(' · ') || item.typeName || ' '}
        </div>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="poster-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="card">
          <div className="aspect-[2/3] bg-chip animate-pulse" />
          <div className="p-2 space-y-1">
            <div className="h-3 bg-chip rounded animate-pulse" />
            <div className="h-2.5 w-1/2 bg-chip rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
