import { describe, expect, it } from 'vitest';
import { isRecentlyUpdated, parseCmsTime } from './recent-update';

// 2026-11-18 12:00:00 北京时间
const NOW = Date.UTC(2026, 10, 18, 4, 0, 0);

describe('parseCmsTime', () => {
  it('按北京时间解析 "YYYY-MM-DD HH:mm:ss"', () => {
    expect(parseCmsTime('2026-11-18 12:00:00')).toBe(NOW);
  });
  it('支持 Unix 秒与毫秒', () => {
    expect(parseCmsTime(String(NOW / 1000))).toBe(NOW);
    expect(parseCmsTime(String(NOW))).toBe(NOW);
  });
  it('无法识别的值返回 null', () => {
    expect(parseCmsTime(undefined)).toBeNull();
    expect(parseCmsTime('昨天')).toBeNull();
  });
});

describe('isRecentlyUpdated', () => {
  it('2 天内为新', () => {
    expect(isRecentlyUpdated('2026-11-18 08:00:00', NOW)).toBe(true);
    expect(isRecentlyUpdated('2026-11-16 12:00:00', NOW)).toBe(true);
  });
  it('超过 2 天不是新', () => {
    expect(isRecentlyUpdated('2026-11-16 11:59:59', NOW)).toBe(false);
    expect(isRecentlyUpdated('2025-01-01 00:00:00', NOW)).toBe(false);
  });
  it('缺失时间不是新', () => {
    expect(isRecentlyUpdated(undefined, NOW)).toBe(false);
  });
});
