'use client';

import { useState } from 'react';
import { exportFavoritesText, importFavoritesText, useFavorites } from '@/lib/favorites';
import { copyToClipboard } from '@/lib/clipboard';
import { SectionTitle } from './settings-shared';
import { useToast } from './toast';
import { useQuery } from '@tanstack/react-query';
import { api, STATUS_QUERY_KEY } from '@/lib/client-api';

/** 设置 → 数据 → 收藏导入导出：在不同网址/设备之间搬运 Cookie 收藏 */
export function FavoritesIoPanel() {
  const { favorites } = useFavorites();
  const { toast } = useToast();
  const [text, setText] = useState('');
  // 部署者在 .env 的 DEFAULT_FAVORITES 预置的收藏：只有点按钮才导入，不会自动加给任何人
  const { data: status } = useQuery({ queryKey: STATUS_QUERY_KEY, queryFn: () => api.status() });
  const defaultFavorites = status?.defaultFavorites ?? null;

  const doImportDefault = () => {
    if (!defaultFavorites) return;
    const r = importFavoritesText(defaultFavorites);
    if (!r.ok) {
      toast(r.reason === 'full' ? '合并后超出 Cookie 容量，请先在首页移除部分收藏' : '默认收藏数据有误，请检查 .env 中的 DEFAULT_FAVORITES', 'warning');
      return;
    }
    toast(r.added > 0 ? `已导入 ${r.added} 部默认收藏，共 ${r.total} 部` : '默认收藏都已在收藏中', 'success');
  };

  const doExport = async () => {
    const data = exportFavoritesText();
    if (!data) {
      toast('还没有收藏可导出', 'info');
      return;
    }
    setText(data);
    const ok = await copyToClipboard(data).catch(() => false);
    toast(ok ? `已复制 ${favorites.length} 部收藏，到另一端粘贴导入即可` : '已显示在下方文本框，请手动复制', ok ? 'success' : 'info');
  };

  const doImport = () => {
    const r = importFavoritesText(text);
    if (!r.ok) {
      toast(
        r.reason === 'full' ? '合并后超出 Cookie 容量，请先在首页移除部分收藏' : '无法识别的收藏数据，请粘贴完整的 ltv_fav_0=… 内容',
        'warning'
      );
      return;
    }
    toast(r.added > 0 ? `已导入 ${r.added} 部，共 ${r.total} 部收藏` : '这些影片都已在收藏中', 'success');
    setText('');
  };

  return (
    <div className="space-y-3">
      <SectionTitle title="收藏导入导出" hint={`当前 ${favorites.length} 部收藏 · 导入会与现有收藏合并`} />
      <textarea
        className="input w-full h-40 font-mono text-xs"
        placeholder={'粘贴收藏数据，例如：\nltv_fav_0=W3si...\nltv_fav_1=ODNk...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" onClick={doImport} disabled={!text.trim()}>
          导入收藏
        </button>
        <button className="btn-ghost btn-sm" onClick={doExport}>
          导出 / 复制我的收藏
        </button>
        {defaultFavorites && (
          <button className="btn-ghost btn-sm" onClick={doImportDefault} title="导入站点预置（DEFAULT_FAVORITES）的收藏">
            导入默认收藏
          </button>
        )}
      </div>
      <p className="text-[11px] text-faint leading-relaxed">
        收藏保存在各个网址自己的 Cookie 中（例如 localhost 和正式网址互不相通）。在旧网址点「导出」，
        到新网址粘贴后点「导入」即可同步。
      </p>
    </div>
  );
}
