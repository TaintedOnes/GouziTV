'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, removeHistory, upsertHistory, type HistoryEntry } from '@/lib/db';
import { resolveSource, useAppStore } from '@/lib/store';
import { buildWatchUrl, formatRelativeTime } from '@/lib/utils';
import { DoubanCard } from './video-card';
import { EmptyState } from './states';
import { Icon } from './icon';
import { useToast } from './toast';

/** 首页「历史」最多展示的条数（完整记录在顶栏「观看历史」面板里） */
const HOME_HISTORY_LIMIT = 36;

/**
 * 首页「历史」：最近观看的影片海报墙，点开直接从上次的集数与进度继续播放。
 * 数据与顶栏「观看历史」面板相同（IndexedDB 的 history 表），随播放实时更新。
 */
export function HistorySection() {
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(HOME_HISTORY_LIMIT).toArray());

  if (history === undefined) return null;
  if (history.length === 0) {
    return (
      <EmptyState
        icon="search"
        title="还没有观看记录"
        description="播放过的影片会出现在这里，点开即可从上次的进度继续观看"
        className="!py-16"
      />
    );
  }

  return (
    <section aria-label="观看历史">
      <div data-autofocus className="poster-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
        {history.map((item) => (
          <HistoryCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function HistoryCard({ item }: { item: HistoryEntry }) {
  const router = useRouter();
  const { toast } = useToast();
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);

  const percent =
    item.duration > 0 && item.playbackPosition > 10
      ? Math.min(100, Math.round((item.playbackPosition / item.duration) * 100))
      : 0;
  const episodeLabel = item.totalEpisodes > 1 ? `看到第 ${item.episodeIndex + 1} 集` : '';

  const open = () => {
    const source = resolveSource({ customAPIs, envSources }, item.sourceKey);
    // 置顶为最近观看
    upsertHistory({ ...item, timestamp: Date.now() }).catch(() => {});
    router.push(
      buildWatchUrl({
        sourceKey: item.sourceKey,
        vodId: item.vodId,
        index: item.episodeIndex,
        title: item.title,
        sourceUrl: source?.url ?? item.sourceUrl,
        detail: source?.detail,
      })
    );
  };

  const remove = () => {
    void removeHistory(item.sourceKey, item.vodId).then(() => {
      toast('已删除该记录', 'info', {
        action: {
          label: '撤销',
          onClick: () => {
            void upsertHistory({
              sourceKey: item.sourceKey,
              sourceUrl: item.sourceUrl,
              vodId: item.vodId,
              title: item.title,
              pic: item.pic,
              episodeIndex: item.episodeIndex,
              totalEpisodes: item.totalEpisodes,
              playbackPosition: item.playbackPosition,
              duration: item.duration,
              timestamp: item.timestamp,
            });
          },
        },
      });
    });
  };

  return (
    <div className="relative group">
      <DoubanCard item={{ title: item.title, cover: item.pic ?? '' }} onClick={open} />
      {/* 观看进度条：贴在海报底边 */}
      {percent > 0 && (
        // 与海报同宽同高（2:3）的透明层，进度条贴在其底边，不依赖卡片标题区高度
        <div className="absolute inset-x-0 top-0 aspect-[2/3] pointer-events-none flex items-end p-1.5">
          <div className="h-1 w-full bg-black/60 rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <div className="px-2 -mt-1.5 pb-1 text-[11px] text-faint truncate" title={formatRelativeTime(item.timestamp)}>
        {[episodeLabel, formatRelativeTime(item.timestamp)].filter(Boolean).join(' · ')}
      </div>
      <button
        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        onClick={remove}
        aria-label={`删除观看记录 ${item.title}`}
        data-tv-skip
        title="删除记录"
      >
        <Icon name="close" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
