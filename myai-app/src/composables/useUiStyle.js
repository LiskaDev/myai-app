/**
 * useUiStyle — 界面风格（新版 / 原版）运行时切换。
 *
 * 风格值最终落到 <html data-ui-style="modern|classic">，
 * 原版样式集中在 styles/classic-theme.css，全部以
 * html[data-ui-style="classic"] 前缀覆盖，不影响新版。
 *
 * 同时写一份到 localStorage，让页面首帧就能拿到正确风格，
 * 避免从 IndexedDB 异步读取期间先闪一下新版。
 */
import { ref } from 'vue';

export const UI_STYLE_OPTIONS = [
  {
    id: 'modern',
    label: '新版',
    desc: '纸白 · 陶土，线性图标',
  },
  {
    id: 'classic',
    label: '原版',
    desc: '暖纸 · 深紫，Emoji 图标',
  },
];

const LS_KEY = 'myai_ui_style';

export const uiStyle = ref('modern');

export function normalizeUiStyle(value) {
  return value === 'classic' ? 'classic' : 'modern';
}

export function isClassicStyle() {
  return uiStyle.value === 'classic';
}

/** 首帧读取：只读 localStorage，不碰 IndexedDB */
export function readBootUiStyle() {
  try {
    return normalizeUiStyle(localStorage.getItem(LS_KEY));
  } catch {
    return 'modern';
  }
}

export function applyUiStyle(value, { persist = true } = {}) {
  const next = normalizeUiStyle(value);
  uiStyle.value = next;

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-style', next);
  }
  if (persist) {
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* 隐身模式等场景忽略 */
    }
  }
  return next;
}
