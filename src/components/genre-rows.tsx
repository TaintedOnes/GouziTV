'use client';

import Link from 'next/link';
import { GENRES, genreBySlug } from '@/lib/genres';
import type { SearchResultItem } from '@/lib/types';
import { browseHref, PosterCard, useBrowse } from './browse-view';
import { useInView } from './use-in-view';
import { useSelectedSources } from './use-selected-sources';
import { EmptyState } from './states';

/** 首页片库的行：最近更新 + 常见类型。每行滚到附近才请求，避免首屏同时打满源站 */
const ROWS: { genre?: string; title: string }[] = [
  { title: '最近更新' },
  { genre: 'action', title: '动作电影' },
  { genre: 'comedy', title: '喜剧电影' },
  { genre: 'sci-fi', title: '科幻电影' },
  { genre: 'romance', title: '爱情电影' },
  { genre: 'horror', title: '恐怖电影' },
  { genre: 'mystery', title: '悬疑电影' },
  { genre: 'animation', title: '动画电影' },
];

const ROW_LIMIT = 16;

export function GenreRows({ onOpen }: { onOpen: (item: SearchResultItem) => void }) {
  const sources = useSelectedSources();
  if (sources.length === 0) {
    return (
      <EmptyState
        icon="gear"
        title="还没有可用的点播源"
        description="在右上角「设置」里添加并勾选点播源后，这里会按类型列出影片"
        className="!py-16"
      />
    );
  }
  return (
    <div className="space-y-6" data-autofocus>
      {ROWS.map((row) => (
        <GenreRow key={row.genre ?? 'latest'} genre={row.genre} title={row.title} onOpen={onOpen} />
      ))}
      <section>
        <h2 className="text-base font-semibold text-content mb-2.5">更多电影分类</h2>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Link key={g.slug} href={`/movies/genre/${g.slug}`} className="px-3 py-1.5 rounded-full text-sm bg-chip text-muted hover:text-content hover:bg-hover">
              {g.zh}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function GenreRow({ genre, title, onOpen }: { genre?: string; title: string; onOpen: (item: SearchResultItem) => void }) {
  const { ref, inView } = useInView<HTMLElement>(true, 0);
  const browse = useBrowse('movie', { genre }, inView);
  const cards = browse.cards.slice(0, ROW_LIMIT);
  const finishedEmpty = Boolean(browse.data) && !browse.hasNextPage && cards.length === 0;
  const failedEmpty = browse.isError && cards.length === 0;

  // 已检索完却没有影片：不显示空行（不放误导性的空栏目）
  if (finishedEmpty || failedEmpty) return <section ref={ref} hidden />;

  return (
    <section ref={ref} aria-label={title}>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold text-content">{title}</h2>
        <Link href={browseHref('movie', { genre })} className="text-xs text-accent hover:underline px-1 py-0.5 rounded">
          查看更多 ›
        </Link>
      </div>
      {genre && <p className="text-[11px] text-faint mb-1">{genreBySlug(genre)?.description}</p>}
      <div className="poster-row">
        {cards.length > 0
          ? cards.map((card) => <PosterCard key={card.key} card={card} onOpen={onOpen} />)
          : Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="card" aria-hidden>
                <div className="aspect-[2/3] bg-chip animate-pulse" />
                <div className="p-2">
                  <div className="h-3 bg-chip rounded animate-pulse" />
                </div>
              </div>
            ))}
      </div>
    </section>
  );
}
