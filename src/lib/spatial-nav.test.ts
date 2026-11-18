import { describe, expect, it } from 'vitest';
import { isTextEntry, pickNext, type NavCandidate, type Rect } from './spatial-nav';

const r = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/**
 * 播放页（宽屏）布局复刻：左栏播放器 + 下方控制条，右栏剧集网格。
 *   [全屏][上一集][下一集][跳过标记] ......... [自动连播]   |  [倒序]
 *                                                          |  [1][2][3][4]
 *                                                          |  [5][6][7][8]
 * 播放器（不可聚焦）在控制条上方，与剧集栏同高。
 */
const fullscreen = r(16, 560, 60, 36);
const prev = r(84, 560, 70, 36);
const next = r(162, 560, 70, 36);
const skip = r(240, 560, 90, 36);
const autoplay = r(840, 560, 110, 36);
const order = r(1100, 20, 120, 32);
const ep = (i: number) => r(990 + (i % 4) * 70, 70 + Math.floor(i / 4) * 44, 64, 38);

const watchPage: NavCandidate<string>[] = [
  { item: 'fullscreen', rect: fullscreen },
  { item: 'prev', rect: prev },
  { item: 'next', rect: next },
  { item: 'skip', rect: skip },
  { item: 'autoplay', rect: autoplay },
  { item: 'order', rect: order },
  ...Array.from({ length: 8 }, (_, i) => ({ item: `ep${i + 1}`, rect: ep(i) })),
];
const from = (name: string) => watchPage.find((c) => c.item === name)!.rect;
const others = (name: string) => watchPage.filter((c) => c.item !== name);
const go = (name: string, dir: 'up' | 'down' | 'left' | 'right') => pickNext(from(name), others(name), dir);

describe('播放页：剧集 / 全屏 / 自动连播 之间自由移动', () => {
  it('控制条内左右移动', () => {
    expect(go('fullscreen', 'right')).toBe('prev');
    expect(go('skip', 'right')).toBe('autoplay');
    expect(go('autoplay', 'left')).toBe('skip');
  });

  it('自动连播不是死角：四个方向都有出路或合理停住', () => {
    // 向右没有同行控件时跨行进入右侧剧集栏
    expect(go('autoplay', 'right')).toMatch(/^ep/);
    expect(go('autoplay', 'up')).not.toBeNull();
  });

  it('剧集栏可以回到左侧控制条', () => {
    // 第一列最底行剧集向左：跨行回到左栏控件
    const left = go('ep5', 'left');
    expect(['autoplay', 'skip', 'next', 'prev', 'fullscreen']).toContain(left);
  });

  it('剧集网格内按行列移动', () => {
    expect(go('ep1', 'right')).toBe('ep2');
    expect(go('ep2', 'down')).toBe('ep6');
    expect(go('ep6', 'up')).toBe('ep2');
    expect(go('ep1', 'up')).toBe('order');
  });
});

describe('首页：宽元素往下落到下一行最左侧', () => {
  it('搜索框 ↓ 到「收藏」而不是中间的「推荐」', () => {
    const search = r(200, 100, 800, 48);
    const items: NavCandidate<string>[] = [
      { item: 'favorites', rect: r(200, 180, 80, 36) },
      { item: 'recommend', rect: r(290, 180, 80, 36) },
      { item: 'card1', rect: r(200, 240, 150, 220) },
    ];
    expect(pickNext(search, items, 'down')).toBe('favorites');
  });

  it('同一方向没有元素时返回 null（不乱跳）', () => {
    expect(pickNext(r(0, 0, 50, 50), [{ item: 'a', rect: r(100, 0, 50, 50) }], 'left')).toBeNull();
  });

  it('不选与当前元素大面积重叠的元素', () => {
    const card = r(0, 0, 200, 300);
    const removeBtn = r(170, 5, 25, 25);
    expect(pickNext(card, [{ item: 'x', rect: removeBtn }], 'right')).toBeNull();
  });
});

describe('isTextEntry：只有文本框才保留左右键', () => {
  const el = (tag: string, type?: string) =>
    ({ tagName: tag, getAttribute: (k: string) => (k === 'type' ? type ?? null : null) }) as unknown as Element;
  it('复选框不算文本框（原 bug：复选框吞掉左右键导致焦点卡住）', () => {
    expect(isTextEntry(el('INPUT', 'checkbox'))).toBe(false);
    expect(isTextEntry(el('INPUT', 'radio'))).toBe(false);
  });
  it('文本输入算', () => {
    expect(isTextEntry(el('INPUT'))).toBe(true);
    expect(isTextEntry(el('INPUT', 'search'))).toBe(true);
    expect(isTextEntry(el('TEXTAREA'))).toBe(true);
  });
});
