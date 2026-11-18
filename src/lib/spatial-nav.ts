/**
 * 空间导航核心算法（纯函数，便于单元测试）：
 * 给定当前元素与候选元素的屏幕矩形，选出某个方向上「最自然」的下一个焦点。
 *
 * 规则（与 Android TV / Google TV 的焦点搜索思路一致）：
 * - 只考虑整体位于该方向上的元素（中心越过当前中心，且远端越过当前远端）；
 * - 上 / 下：先找最近的一「行」（主方向间距最小，容差 ROW_TOLERANCE），
 *   行内优先与当前元素水平重叠的，其次起始边（左边）最接近的——
 *   从搜索框这类宽元素往下会落到下一行最左边，而不是正中间；
 * - 左 / 右：优先同一行（垂直方向有重叠）里最近的；同行没有时才跨行，
 *   按「主方向距离 + 2×交叉方向距离」挑最近的。这一步保证侧栏（如播放页
 *   右侧剧集栏）总能从左侧控件到达，不会出现「哪个方向都过不去」的死角。
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface NavCandidate<T> {
  item: T;
  rect: Rect;
}

const ROW_TOLERANCE = 24;
/** 相邻控件常有 1~2px 交叠：主方向允许的最大回退 */
const OVERLAP_TOLERANCE = 8;

const cx = (r: Rect) => (r.left + r.right) / 2;
const cy = (r: Rect) => (r.top + r.bottom) / 2;

function inDirection(a: Rect, b: Rect, dir: Direction): boolean {
  switch (dir) {
    case 'right':
      return cx(b) > cx(a) + 1 && b.right > a.right;
    case 'left':
      return cx(b) < cx(a) - 1 && b.left < a.left;
    case 'down':
      return cy(b) > cy(a) + 1 && b.bottom > a.bottom;
    case 'up':
      return cy(b) < cy(a) - 1 && b.top < a.top;
  }
}

/** 主方向间距（可为小负数，表示轻微交叠） */
function mainGap(a: Rect, b: Rect, dir: Direction): number {
  switch (dir) {
    case 'right':
      return b.left - a.right;
    case 'left':
      return a.left - b.right;
    case 'down':
      return b.top - a.bottom;
    case 'up':
      return a.top - b.bottom;
  }
}

/** 交叉方向间距：区间有重叠为 0 */
function crossGap(a: Rect, b: Rect, dir: Direction): number {
  return dir === 'left' || dir === 'right'
    ? Math.max(0, b.top - a.bottom, a.top - b.bottom)
    : Math.max(0, b.left - a.right, a.left - b.right);
}

function startDistance(a: Rect, b: Rect, dir: Direction): number {
  return dir === 'left' || dir === 'right' ? Math.abs(b.top - a.top) : Math.abs(b.left - a.left);
}

export function pickNext<T>(current: Rect, candidates: NavCandidate<T>[], dir: Direction): T | null {
  const scored = [];
  for (const c of candidates) {
    if (!inDirection(current, c.rect, dir)) continue;
    const main = mainGap(current, c.rect, dir);
    if (main < -OVERLAP_TOLERANCE && crossGap(current, c.rect, dir) === 0) {
      // 与当前元素大面积重叠（如嵌套在同一张卡片里）：不算「在该方向上」
      continue;
    }
    scored.push({
      c,
      main: Math.max(main, 0),
      cross: crossGap(current, c.rect, dir),
      start: startDistance(current, c.rect, dir),
    });
  }
  if (scored.length === 0) return null;

  if (dir === 'left' || dir === 'right') {
    const sameRow = scored.filter((s) => s.cross === 0);
    if (sameRow.length > 0) {
      sameRow.sort((p, q) => p.main - q.main || p.start - q.start);
      return sameRow[0].c.item;
    }
    scored.sort((p, q) => p.main + p.cross * 2 - (q.main + q.cross * 2) || p.start - q.start);
    return scored[0].c.item;
  }

  const nearest = Math.min(...scored.map((s) => s.main));
  const row = scored.filter((s) => s.main <= nearest + ROW_TOLERANCE);
  row.sort((p, q) => p.cross - q.cross || p.start - q.start);
  return row[0].c.item;
}

/** 文本类输入框（左右键用于移动光标）。复选框、单选框等不在此列——它们不能吞掉方向键 */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'password', 'tel', 'number']);

export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(((el as HTMLInputElement).getAttribute('type') || '').toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}
