import { describe, expect, it } from 'vitest';
import { pickTvTarget, type Rect, type ZonedCandidate } from './spatial-nav';

/**
 * 电视整页导航规则（与 1920×1080 下实际布局相同的几何）：
 * 左侧固定侧栏 7 项、顶栏右上角按钮、内容区 6 列海报网格。
 */
const HEADER = { zone: 'header' };
const SIDEBAR = { zone: 'sidebar' };
const MAIN = { zone: 'main' };

const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });

const sidebar: ZonedCandidate<string>[] = ['首页', '电影', '电视剧', '动漫', '综艺', '分类', '搜索'].map((name, i) => ({
  item: `side:${name}`,
  rect: r(60, 150 + i * 60, 50, 50),
  region: 'sidebar',
  zone: SIDEBAR,
  current: name === '电影',
}));

const header: ZonedCandidate<string>[] = [
  { item: 'header:search', rect: r(200, 20, 600, 40), region: 'main', zone: HEADER },
  { item: 'header:settings', rect: r(1800, 20, 40, 40), region: 'main', zone: HEADER },
];

/** 两行 6 列海报：第 1 行在 120-420，第 2 行在 460-760；scrolled 时整体下移出侧栏范围 */
function grid(offsetY = 0): ZonedCandidate<string>[] {
  const out: ZonedCandidate<string>[] = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 6; col++)
      out.push({
        item: `card:${row * 6 + col + 1}`,
        rect: r(200 + col * 280, 120 + row * 340 + offsetY, 250, 300),
        region: 'main',
        zone: MAIN,
      });
  return out;
}

const all = (g = grid()) => [...sidebar, ...header, ...g];
const at = (list: ZonedCandidate<string>[], item: string) => list.find((c) => c.item === item)!;
const move = (list: ZonedCandidate<string>[], from: string, dir: 'up' | 'down' | 'left' | 'right', lastMain?: string) => {
  const cur = at(list, from);
  return pickTvTarget(cur.rect, { region: cur.region, zone: cur.zone }, list.filter((c) => c !== cur), dir, lastMain);
};

describe('TV page navigation rules', () => {
  it('Down from a card goes to the card below, not into the denser sidebar', () => {
    expect(move(all(), 'card:1', 'down').next).toBe('card:7');
  });

  it('Up / Down inside the sidebar stays in the sidebar', () => {
    expect(move(all(), 'side:电影', 'down').next).toBe('side:电视剧');
    expect(move(all(), 'side:首页', 'up').next).toBeNull();
  });

  it('Right on the last card of a row stays put instead of jumping to the header', () => {
    expect(move(all(), 'card:6', 'right').next).toBeNull();
    expect(move(all(), 'card:12', 'right').next).toBeNull();
  });

  it('Left from the first column enters the sidebar on the current page item', () => {
    const res = move(all(), 'card:7', 'left');
    expect(res).toEqual({ next: 'side:电影', enteredSidebar: true });
  });

  it('Left still reaches the sidebar after the grid has scrolled below it', () => {
    const scrolled = all(grid(900));
    expect(move(scrolled, 'card:7', 'left').next).toBe('side:电影');
  });

  it('Right out of the sidebar returns to the card you came from', () => {
    expect(move(all(), 'side:动漫', 'right', 'card:7').next).toBe('card:7');
  });

  it('Up from the top row reaches the header', () => {
    expect(move(all(), 'card:1', 'up').next).toBe('header:search');
  });

  it('with nothing focused yet, any candidate can be chosen', () => {
    const list = all();
    expect(pickTvTarget(r(0, 0, 1, 1), null, list, 'right').next).not.toBeNull();
  });
});
