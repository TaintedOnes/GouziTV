'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isBackKey, isTvDevice } from '@/lib/tv';
import { isTextEntry, pickTvTarget, type Direction } from '@/lib/spatial-nav';

/**
 * 全站遥控器 / 方向键导航（唯一的方向键焦点管理者）。
 *
 * - 方向键：按屏幕位置移动焦点（算法见 lib/spatial-nav.ts）；
 * - OK / Enter：激活当前焦点；复选框、开关类控件由这里补上 Enter 切换（原生只认空格）；
 * - 返回：关闭弹窗，否则后退；
 * - 播放器全屏时方向键 / OK 归播放器（快进、音量、暂停），这里不处理；
 * - 不规则布局可在元素（或其祖先）上声明 data-nav-up / -down / -left / -right="CSS 选择器"
 *   显式指定目标；data-tv-skip 让元素不参与方向键导航（鼠标仍可点）。
 */

const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="switch"], [role="tab"]';

const KEY_DIR: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const CODE_DIR: Record<number, Direction> = { 38: 'up', 40: 'down', 37: 'left', 39: 'right' };

function usable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('[data-tv-skip], [inert], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
}

/** 当前导航范围：最上层打开的弹窗（aria-modal）优先，焦点不会跑到背景页面 */
function scope(): ParentNode {
  const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  return modals.length ? modals[modals.length - 1] : document;
}

function candidates(): HTMLElement[] {
  return Array.from(scope().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(usable);
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  // 电视上把焦点项滚到中间附近，四周的内容都看得见；电脑上只做最小滚动
  el.scrollIntoView({ block: isTvDevice() ? 'center' : 'nearest', inline: 'nearest', behavior: 'smooth' });
}

/** 播放器处于全屏 / 网页全屏时，方向键归播放器（快进、音量），页面不再移动焦点 */
function playerFullscreen(): boolean {
  return Boolean(document.querySelector('.art-fullscreen, .art-fullscreen-web, html.tv-fullscreen'));
}

/** 显式导航关系：data-nav-<dir> 写在元素或其祖先上 */
function explicitTarget(from: HTMLElement, dir: Direction): HTMLElement | null {
  const host = from.closest<HTMLElement>(`[data-nav-${dir}]`);
  const selector = host?.getAttribute(`data-nav-${dir}`);
  if (!selector) return null;
  try {
    const all = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(usable);
    return all[0] ?? null;
  } catch {
    return null;
  }
}

/** data-autofocus 可以写在控件本身，也可以写在容器上（取容器内第一个可用控件） */
function autofocusTarget(): HTMLElement | null {
  for (const host of Array.from(document.querySelectorAll<HTMLElement>('[data-autofocus]'))) {
    if (host.matches(FOCUSABLE) && usable(host)) return host;
    const inner = Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE)).find(usable);
    if (inner) return inner;
  }
  return null;
}

/**
 * 返回时还原焦点：带 data-focus-key 的元素（海报卡片）获得焦点时，按「页面地址」记下它；
 * 回到同一地址（从详情 / 播放页后退）时等数据渲染出来，再把焦点放回那张卡片。
 */
const FOCUS_STORE_PREFIX = 'gouzi_focus:';

function pageKey(): string {
  return FOCUS_STORE_PREFIX + location.pathname + location.search;
}

function rememberFocus(el: HTMLElement) {
  const host = el.closest<HTMLElement>('[data-focus-key]');
  if (!host) return;
  try {
    sessionStorage.setItem(pageKey(), host.getAttribute('data-focus-key') || '');
  } catch {
    /* 隐私模式：放弃记忆 */
  }
}

function savedFocusKey(): string | null {
  try {
    return sessionStorage.getItem(pageKey());
  } catch {
    return null;
  }
}

function findByFocusKey(key: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-focus-key]'))) {
    if (el.getAttribute('data-focus-key') === key && usable(el)) return el;
  }
  return null;
}

/** 左右跨行的边界：顶栏、侧栏各成一块，其余是主内容 */
function zoneOf(el: HTMLElement): Element | null {
  return el.closest('header, [data-nav-region]');
}

/** 导航区域：写在容器上的 data-nav-region；不在任何区域内的属于主内容 */
function navRegion(el: HTMLElement): string {
  return el.closest('[data-nav-region]')?.getAttribute('data-nav-region') ?? 'main';
}

// 焦点因重新渲染丢失（元素被替换 / 删除）时，从上一次焦点的位置继续导航
let lastRect: DOMRect | null = null;
/** 进入电视侧栏前的内容焦点，按「右」离开侧栏时回到这里 */
let lastMainFocus: HTMLElement | null = null;

function move(dir: Direction): boolean {
  const all = candidates();
  if (all.length === 0) return false;
  const cur = document.activeElement as HTMLElement | null;
  const curValid = cur && cur !== document.body && all.includes(cur);

  if (curValid) {
    const explicit = explicitTarget(cur, dir);
    if (explicit && explicit !== cur) {
      focusEl(explicit);
      return true;
    }
  }

  const fromRect = curValid ? cur.getBoundingClientRect() : lastRect;
  if (!fromRect) {
    // 第一次按方向键：聚焦主内容区可见的第一个控件
    const first =
      all.find((el) => el.closest('main') && el.getBoundingClientRect().top >= 0) ??
      all.find((el) => el.getBoundingClientRect().top >= 0) ??
      all[0];
    focusEl(first);
    return true;
  }

  // 区域 / 侧栏规则见 lib/spatial-nav.ts 的 pickTvTarget
  const pool = all
    .filter((el) => el !== cur && !(curValid && (el.contains(cur) || cur.contains(el))))
    .map((el) => ({
      item: el,
      rect: el.getBoundingClientRect(),
      region: navRegion(el),
      zone: zoneOf(el),
      current: Boolean(el.getAttribute('aria-current')),
    }));
  const lastMain = lastMainFocus && lastMainFocus.isConnected && usable(lastMainFocus) ? lastMainFocus : null;
  const { next, enteredSidebar } = pickTvTarget(
    fromRect,
    curValid ? { region: navRegion(cur), zone: zoneOf(cur) } : null,
    pool,
    dir,
    lastMain
  );
  if (enteredSidebar && curValid) lastMainFocus = cur;
  if (!next) {
    if (!curValid && pool.length) {
      focusEl(pool[0].item);
      return true;
    }
    return false;
  }
  focusEl(next);
  return true;
}

/** Enter 激活：原生复选框 / 单选框只认空格，遥控器 OK 键发的是 Enter */
function activate(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    el.click();
    return true;
  }
  if (el.getAttribute('role') === 'switch' && el.tagName !== 'BUTTON') {
    el.click();
    return true;
  }
  return false;
}

export function TvNavigation() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    // 电视上始终显示醒目的焦点框；电脑上用方向键 / Tab 时显示，动鼠标后隐藏
    if (isTvDevice()) root.classList.add('kbd-nav', 'tv');
    const onPointer = () => {
      if (!isTvDevice()) root.classList.remove('kbd-nav');
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t && t !== document.body && t.getBoundingClientRect) {
        lastRect = t.getBoundingClientRect();
        if (typeof t.closest === 'function') rememberFocus(t);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;

      if (isBackKey(e)) {
        if (playerFullscreen()) return; // 播放器自己处理：退出全屏
        e.preventDefault();
        const modalClose = document.querySelector<HTMLElement>('[aria-modal="true"] [aria-label="关闭"]');
        if (modalClose) modalClose.click();
        else history.back();
        return;
      }

      if (e.key === 'Enter' && !playerFullscreen()) {
        if (activate(t)) e.preventDefault();
        return;
      }

      if (e.key === 'Tab') root.classList.add('kbd-nav');
      const dir = KEY_DIR[e.key] ?? CODE_DIR[e.keyCode];
      if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      root.classList.add('kbd-nav');
      if (playerFullscreen()) return;
      // 下拉框原生用上下键选项
      if (t.tagName === 'SELECT' && (dir === 'up' || dir === 'down')) return;
      // 文本框：左右键先移动光标，光标到头了再离开输入框
      if (isTextEntry(t) && (dir === 'left' || dir === 'right')) {
        const input = t as HTMLInputElement;
        const len = input.value?.length ?? 0;
        let atEdge = true;
        try {
          atEdge = dir === 'left' ? input.selectionStart === 0 : input.selectionEnd === len;
        } catch {
          /* number 等类型不支持 selection：直接离开 */
        }
        if (!atEdge) return;
      }
      if (move(dir)) e.preventDefault();
      // 电视上没有可去的方向也拦住默认滚动，避免整页跳动；电脑上保留滚动
      else if (isTvDevice()) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  // 切换页面后焦点落到合理位置：优先 data-autofocus，其次主内容区第一个控件
  useEffect(() => {
    if (!isTvDevice()) return;
    lastRect = null;
    lastMainFocus = null;
    // 1) 返回到之前浏览的页面：等卡片渲染出来（缓存数据通常立即可用，最多等 5 秒）再还原
    const saved = savedFocusKey();
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    let restored = false;
    if (saved) {
      const started = Date.now();
      const tryRestore = () => {
        const el = findByFocusKey(saved);
        if (el) {
          restored = true;
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          return;
        }
        if (Date.now() - started < 5000) restoreTimer = setTimeout(tryRestore, 150);
      };
      restoreTimer = setTimeout(tryRestore, 50);
    }
    // 2) 否则：优先 data-autofocus，其次主内容区第一个控件
    const timer = setTimeout(() => {
      if (restored) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const target =
        autofocusTarget() ??
        candidates().find((el) => el.closest('main')) ??
        null;
      if (target && usable(target)) focusEl(target);
    }, 400);
    return () => {
      clearTimeout(timer);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [pathname]);

  return null;
}
