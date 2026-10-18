/**
 * 🧪 useUiStyle — 界面风格切换
 * 覆盖：取值归一化 / 首帧读取 / 属性写入 / localStorage 镜像
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UI_STYLE_OPTIONS,
  normalizeUiStyle,
  readBootUiStyle,
  applyUiStyle,
  uiStyle,
} from '../src/composables/useUiStyle';

describe('useUiStyle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-style');
    applyUiStyle('modern');
  });

  it('只接受 modern / classic，其余一律回落到 modern', () => {
    expect(normalizeUiStyle('classic')).toBe('classic');
    expect(normalizeUiStyle('modern')).toBe('modern');
    expect(normalizeUiStyle(undefined)).toBe('modern');
    expect(normalizeUiStyle(null)).toBe('modern');
    expect(normalizeUiStyle('whatever')).toBe('modern');
  });

  it('暴露两个可选项且 id 合法', () => {
    expect(UI_STYLE_OPTIONS).toHaveLength(2);
    expect(UI_STYLE_OPTIONS.map(o => o.id)).toEqual(['modern', 'classic']);
  });

  it('applyUiStyle 写入 html 属性与 localStorage', () => {
    applyUiStyle('classic');
    expect(uiStyle.value).toBe('classic');
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('classic');
    expect(localStorage.getItem('myai_ui_style')).toBe('classic');
  });

  it('readBootUiStyle 读回已保存的风格', () => {
    applyUiStyle('classic');
    expect(readBootUiStyle()).toBe('classic');
  });

  it('没有存储记录时默认新版', () => {
    localStorage.clear();
    expect(readBootUiStyle()).toBe('modern');
  });

  it('localStorage 不可用时不应抛错', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => readBootUiStyle()).not.toThrow();
    expect(readBootUiStyle()).toBe('modern');
    spy.mockRestore();
  });
});
