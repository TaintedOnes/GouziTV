const TV_FLAG_KEY = 'gouzi_tv';

/**
 * 智能电视浏览器 / 电视 App（三星 Tizen、LG webOS 等）。
 * 除 UA 外，GouziTV 的 Tizen App 打开网站时会带 ?tv=1，记到 localStorage，
 * 以免个别机型 UA 不含 Tizen 字样时识别失败。
 */
export function isTvDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Tizen|SMART-TV|SmartTV|Web0S|webOS|HbbTV|NetCast|BRAVIA|AFT[A-Z]/i.test(navigator.userAgent)) return true;
  try {
    if (new URLSearchParams(location.search).get('tv') === '1') localStorage.setItem(TV_FLAG_KEY, '1');
    return localStorage.getItem(TV_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** 遥控器「返回」键（Tizen 10009，webOS 461） */
export function isBackKey(e: KeyboardEvent): boolean {
  return e.keyCode === 10009 || e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack';
}

/** 电视全屏：页面自己把播放器铺满屏幕，不依赖播放器库与 Fullscreen API */
export const TV_FULLSCREEN_CLASS = 'tv-fullscreen';
