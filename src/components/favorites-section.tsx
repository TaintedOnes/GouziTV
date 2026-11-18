'use client';

import { useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { SearchResultItem } from '@/lib/types';
import { favoriteToSearchItem, refreshFavoritesExpiry, removeFavorite, useFavorites, type FavoriteItem } from '@/lib/favorites';
import { api } from '@/lib/client-api';
import { resolveSource, useAppStore } from '@/lib/store';
import { isRecentlyUpdated, NEW_BADGE_CLASS } from '@/lib/recent-update';
import { DoubanCard } from './video-card';
import { EmptyState } from './states';
import { Icon } from './icon';
import { useToast } from './toast';

/**
 * 收藏里存的是收藏时的快照，没有最新更新时间：打开首页时逐个拉取详情（10 分钟缓存），
 * 读取源站的 vod_time 用于「新」标记。失败的条目静默跳过，不影响展示。
 */
function useLatestUpdateTimes(favorites: FavoriteItem[]) {
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const results = useQueries({
    queries: favorites.map((f) => {
      const source = resolveSource({ customAPIs, envSources }, f.sourceKey, { url: f.sourceUrl, name: f.sourceName });
      return {
        queryKey: ['favorite-update-time', f.sourceKey, f.vodId],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.detail(f.vodId, source!, signal),
        enabled: Boolean(source),
        staleTime: 10 * 60 * 1000,
        retry: false,
        select: (d: Awaited<ReturnType<typeof api.detail>>) => d.videoInfo?.updateTime,
      };
    }),
  });
  return {
    get: (f: FavoriteItem) => results[favorites.indexOf(f)]?.data as string | undefined,
  };
}

/** 首页「收藏」：展示存于 Cookie 的收藏影片，点击打开详情弹窗 */
export function FavoritesSection({ onOpen }: { onOpen: (item: SearchResultItem) => void }) {
  const { favorites } = useFavorites();
  const { toast } = useToast();
  const updateTimes = useLatestUpdateTimes(favorites);

  // 每次打开首页顺延 Cookie 有效期（浏览器上限 400 天）
  useEffect(() => refreshFavoritesExpiry(), []);

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon="search"
        title="还没有收藏的影片"
        description="搜索影片并打开详情，点击「收藏」即可加入这里"
        className="!py-16"
      />
    );
  }

  return (
    <section aria-label="我的收藏">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
        {favorites.map((f) => (
          <div key={`${f.sourceKey}::${f.vodId}`} className="relative group">
            <DoubanCard
              item={{ title: f.name, cover: f.pic ?? '' }}
              onClick={() => onOpen({ ...favoriteToSearchItem(f), updateTime: updateTimes.get(f) })}
            />
            {isRecentlyUpdated(updateTimes.get(f)) && (
              <span
                className={`${NEW_BADGE_CLASS} absolute top-1.5 left-1.5 pointer-events-none shadow`}
                title="最近 2 天内有更新"
              >
                新
              </span>
            )}
            <div className="px-2 -mt-1.5 pb-1 text-[11px] text-faint truncate" title={f.sourceName}>
              {[f.year, f.sourceName].filter(Boolean).join(' · ')}
            </div>
            <button
              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => {
                removeFavorite(f);
                toast(`已取消收藏「${f.name}」`, 'info');
              }}
              aria-label={`取消收藏 ${f.name}`}
              title="取消收藏"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-faint py-6">共 {favorites.length} 部收藏 · 保存在本浏览器的 Cookie 中</p>
    </section>
  );
}
