'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isTvDevice } from '@/lib/tv';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';

/**
 * 站点主导航（单一配置，三种形态）：
 * - 电脑：顶栏里的文字链接（Header 渲染 MainNavLinks）；
 * - 手机：底部标签栏 BottomNav；
 * - 电视：左侧边栏 TvSidebar，获得焦点时展开文字。
 */

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** 当前路径是否属于该项 */
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '首页', icon: 'home', match: (p) => p === '/' },
  { href: '/movies', label: '电影', icon: 'film', match: (p) => p === '/movies' || p.startsWith('/movies/') },
  { href: '/tv', label: '电视剧', icon: 'tv', match: (p) => p === '/tv' },
  { href: '/anime', label: '动漫', icon: 'sparkles', match: (p) => p === '/anime' },
  { href: '/variety', label: '综艺', icon: 'mic', match: (p) => p === '/variety' },
  { href: '/genres', label: '分类', icon: 'grid', match: (p) => p === '/genres' },
];

/** 搜索入口：回到首页并聚焦搜索框（首页读取 focus=search） */
export const SEARCH_HREF = '/?focus=search';

/** 手机底栏只放 5 个：首页、电影、分类、搜索、直播 */
const BOTTOM_ITEMS: NavItem[] = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[5],
  { href: SEARCH_HREF, label: '搜索', icon: 'search', match: () => false },
  { href: '/live', label: '直播', icon: 'bolt', match: (p) => p === '/live' },
];

export function useIsTv() {
  const [tv, setTv] = useState(false);
  useEffect(() => setTv(isTvDevice()), []);
  return tv;
}

export function MainNavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="频道" className={cn('main-nav items-center gap-0.5', className)}>
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap',
              active ? 'text-accent-hover bg-accent/15 font-medium' : 'text-muted hover:text-content hover:bg-hover/70'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const tv = useIsTv();
  const hidden = tv || pathname === '/watch';

  // 给 body 留出底栏高度（只在窄屏生效，见 globals.css）
  useEffect(() => {
    if (hidden) return;
    document.documentElement.classList.add('has-bottom-nav');
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, [hidden]);

  if (hidden) return null;
  return (
    <nav
      aria-label="底部导航"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line/60 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
        {BOTTOM_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] transition-colors',
                active ? 'text-accent-hover' : 'text-muted active:text-content'
              )}
            >
              <Icon name={item.icon} className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** 电视左侧边栏：平时只显示图标，焦点进入后展开文字（浮在内容之上，不挤动页面） */
export function TvSidebar() {
  const pathname = usePathname();
  const tv = useIsTv();
  if (!tv) return null;
  const items: NavItem[] = [...NAV_ITEMS, { href: SEARCH_HREF, label: '搜索', icon: 'search', match: () => false }];
  return (
    <nav aria-label="电视导航" className="tv-sidebar" data-nav-region="sidebar">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('tv-sidebar-item', active && 'is-active')}
          >
            <Icon name={item.icon} className="w-[1.2rem] h-[1.2rem] shrink-0" />
            <span className="tv-sidebar-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
