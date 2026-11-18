'use client';

import { useEffect } from 'react';

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
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
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
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    let main: number;
    let cross: number;
    if (dir === 'right') { main = b.left - a.right; cross = Math.abs(by - ay); if (bx <= ax) continue; }
    else if (dir === 'left') { main = a.left - b.right; cross = Math.abs(by - ay); if (bx >= ax) continue; }
    else if (dir === 'down') { main = b.top - a.bottom; cross = Math.abs(bx - ax); if (by <= ay) continue; }
    else { main = a.top - b.bottom; cross = Math.abs(bx - ax); if (by >= ay) continue; }
    const score = Math.max(main, 0) + cross * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return false;
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  return true;
}

export function TvNavigation() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 返回键（Tizen 10009）
      if (e.keyCode === 10009) {
        e.preventDefault();
        const modalClose = document.querySelector<HTMLElement>('[aria-modal="true"] [aria-label="关闭"]');
        if (modalClose) modalClose.click();
        else history.back();
        return;
      }
      const dir = KEY_DIR[e.key] ?? CODE_DIR[e.keyCode];
      // 播放器等已处理的按键（快进/音量/切集）不再移动焦点
      if (e.defaultPrevented) return;
      if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      // 文本框里左右键用于移动光标，上下键才离开
      const typing = t.matches?.('input, textarea, select, [contenteditable="true"]');
      if (typing && (dir === 'left' || dir === 'right')) return;
      if (move(dir)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
