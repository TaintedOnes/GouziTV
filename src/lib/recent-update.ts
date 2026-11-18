/**
 * 「新」标记：源站最后更新时间（CMS 的 vod_time）在最近 N 天内。
 *
 * vod_time 常见格式：
 * - "2026-11-17 10:23:45"（国内采集站，按北京时间 UTC+8 解释）
 * - Unix 秒数 / 毫秒数
 */

export const RECENT_UPDATE_DAYS = 2;

export function parseCmsTime(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{9,13}$/.test(v)) {
    const n = Number(v);
    return v.length >= 13 ? n : n * 1000;
  }
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  // 北京时间 → UTC
  const ms = Date.UTC(+y, +mo - 1, +d, +h - 8, +mi, +s);
  return Number.isFinite(ms) ? ms : null;
}

export function isRecentlyUpdated(
  value: string | undefined,
  now: number = Date.now(),
  days: number = RECENT_UPDATE_DAYS
): boolean {
  const t = parseCmsTime(value);
  if (t === null) return false;
  // 源站时间略超前（时区/时钟误差）也算新
  return now - t <= days * 24 * 60 * 60 * 1000 && t - now <= 24 * 60 * 60 * 1000;
}

/** 卡片 / 详情里显示的徽章文字 */
export const NEW_BADGE_CLASS = 'tag bg-red-500 text-white font-semibold';
