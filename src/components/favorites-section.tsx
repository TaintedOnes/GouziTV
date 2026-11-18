'use client';

import { useEffect } from 'react';
import type { SearchResultItem } from '@/lib/types';
import { favoriteToSearchItem, refreshFavoritesExpiry, removeFavorite, useFavorites } from '@/lib/favorites';
import { DoubanCard } from './video-card';
import { EmptyState } from './states';
import { Icon } from './icon';
import { useToast } from './toast';

/** 首页「收藏」：展示存于 Cookie 的收藏影片，点击打开详情弹窗 */
export function FavoritesSection({ onOpen }: { onOpen: (item: SearchResultItem) => void }) {
  const { favorites } = useFavorites();
  const { toast } = useToast();

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
              onClick={() => onOpen(favoriteToSearchItem(f))}
            />
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
