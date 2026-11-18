/** 智能电视浏览器 / 电视 App（三星 Tizen、LG webOS 等） */
export function isTvDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Tizen|SMART-TV|SmartTV|Web0S|webOS|HbbTV|NetCast|BRAVIA|AFT[A-Z]/i.test(navigator.userAgent);
}

/** 遥控器「返回」键（Tizen 10009，webOS 461） */
export function isBackKey(e: KeyboardEvent): boolean {
  return e.keyCode === 10009 || e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack';
}
