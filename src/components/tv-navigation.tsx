'use client';

import { useEffect } from 'react';
import { isBackKey, isTvDevice } from '@/lib/tv';

/**
 * 电视遥控器方向键导航（空间导航）。
 * 三星 Tizen 打开外部网页时不会自动用方向键移动焦点，这里按屏幕位置
 * 找到对应方向上最近的可聚焦元素并聚焦；返回键 = 浏览器后退。
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), video';

type Dir = 'up' | 'down' | 'left' | 'right';
const KEY_DIR: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const CODE_DIR: Record<number, Dir> = { 38: 'up', 40: 'down', 37: 'left', 39: 'right' };

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

function candidates(): HTMLElement[] {
  // 打开的弹窗（aria-modal）内优先，避免焦点跑到背景
  const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  const scope: ParentNode = modals.length ? modals[modals.length - 1] : document;
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[data-tv-skip]') && visible(el));
}

function move(dir: Dir): boolean {
  const all = candidates();
  if (all.length === 0) return false;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !all.includes(cur)) {
    // 没有焦点：聚焦视口内第一个元素
    const first = all.find((el) => el.getBoundingClientRect().top >= 0) ?? all[0];
    first.focus();
    return true;
  }
  const a = cur.getBoundingClientRect();
  const horizontal = dir === 'left' || dir === 'right';
  // 两段式选择（与电视系统一致）：先找方向上「最近的一行/一列」，再在其中挑交叉方向最近的
  const scored: { el: HTMLElement; main: number; cross: number }[] = [];
  for (const el of all) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect();
    let main: number;
    if (dir === 'right') main = b.left - a.right;
    else if (dir === 'left') main = a.left - b.right;
    else if (dir === 'down') main = b.top - a.bottom;
    else main = a.top - b.bottom;
    // 允许少量重叠（相邻按钮常有 1-2px 交叠），但必须整体位于该方向
    if (main < -Math.min(8, (horizontal ? a.width : a.height) / 2)) continue;
    // 交叉方向距离：区间有重叠记 0，否则为两区间的间隙
    const cross = horizontal
      ? Math.max(0, b.top - a.bottom, a.top - b.bottom)
      : Math.max(0, b.left - a.right, a.left - b.right);
    // 左右移动只在同一行内进行（交叉方向必须重叠），避免跳到页面另一处
    if (horizontal && cross > 0) continue;
    scored.push({ el, main: Math.max(main, 0), cross });
  }
  if (scored.length === 0) return false;
  const nearestMain = Math.min(...scored.map((s) => s.main));
  const band = scored.filter((s) => s.main <= nearestMain + 24);
  // 同样对齐时按「起始边」距离挑：从搜索框这种宽元素往下，落到下一行最左侧（收藏），而不是正中间那个
  const startOf = (r: DOMRect) => (horizontal ? r.top : r.left);
  const as = startOf(a);
  band.sort(
    (p, q) =>
      p.cross - q.cross ||
      Math.abs(startOf(p.el.getBoundingClientRect()) - as) - Math.abs(startOf(q.el.getBoundingClientRect()) - as)
  );
  const best = band[0].el;
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  return true;
}

/** 播放器处于全屏/网页全屏时，方向键归播放器（快进、音量），页面不再移动焦点 */
function playerFullscreen(): boolean {
  return Boolean(document.querySelector('.art-fullscreen, .art-fullscreen-web, html.tv-fullscreen'));
}

export function TvNavigation() {
  useEffect(() => {
    const root = document.documentElement;
    // 电视上始终显示醒目的焦点框；电脑上用方向键/Tab 时显示，动鼠标后隐藏
    if (isTvDevice()) root.classList.add('kbd-nav', 'tv');
    const onPointer = () => {
      if (!isTvDevice()) root.classList.remove('kbd-nav');
    };
    window.addEventListener('mousedown', onPointer);

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isBackKey(e)) {
        if (playerFullscreen()) return;
        e.preventDefault();
        const modalClose = document.querySelector<HTMLElement>('[aria-modal="true"] [aria-label="关闭"]');
        if (modalClose) modalClose.click();
        else history.back();
        return;
      }
      const dir = KEY_DIR[e.key] ?? CODE_DIR[e.keyCode];
      if (e.key === 'Tab') root.classList.add('kbd-nav');
      if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
      root.classList.add('kbd-nav');
      if (playerFullscreen()) return;
      const t = e.target as HTMLElement;
      // 文本框里左右键用于移动光标，上下键才离开
      const typing = t.matches?.('input, textarea, select, [contenteditable="true"]');
      if (typing && (dir === 'left' || dir === 'right')) return;
      if (move(dir)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, []);
  return null;
}
