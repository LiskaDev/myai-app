/**
 * 🧪 storage.js 单元测试
 * 测试 localStorage 存取、导入导出
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    STORAGE_KEYS,
    DEFAULT_GLOBAL_SETTINGS,
    saveToStorage,
    loadFromStorage,
    importData,
} from '../src/utils/storage';

describe('STORAGE_KEYS', () => {
    it('应该包含所有必要的键名', () => {
        expect(STORAGE_KEYS.GLOBAL).toBe('myai_global_v1');
        expect(STORAGE_KEYS.ROLES).toBe('myai_roles_v1');
        expect(STORAGE_KEYS.GROUPS).toBe('myai_groups_v1');
        expect(STORAGE_KEYS.SESSION).toBe('myai_session_v1');
    });
});

describe('DEFAULT_GLOBAL_SETTINGS', () => {
    it('应该包含必要的默认值', () => {
        expect(DEFAULT_GLOBAL_SETTINGS.baseUrl).toBe('https://api.deepseek.com');
        expect(DEFAULT_GLOBAL_SETTINGS.model).toBe('deepseek-reasoner');
        expect(DEFAULT_GLOBAL_SETTINGS.apiKey).toBe('');
        expect(DEFAULT_GLOBAL_SETTINGS.showLogic).toBe(true);
        expect(DEFAULT_GLOBAL_SETTINGS.showInner).toBe(true);
        expect(DEFAULT_GLOBAL_SETTINGS.rpTextStyle).toBe('simple');
    });

    it('应该包含 customStyle 默认值', () => {
        expect(DEFAULT_GLOBAL_SETTINGS.customStyle).toBeDefined();
        expect(DEFAULT_GLOBAL_SETTINGS.customStyle.actionColor).toBe('#a1a1aa');
        expect(DEFAULT_GLOBAL_SETTINGS.customStyle.fontSize).toBe(1.0);
    });
});

describe('saveToStorage', () => {
    it('应该成功保存数据', () => {
        const settings = { apiKey: 'test-key', model: 'test-model' };
        const roles = [{ id: '1', name: 'Role1' }];

        const result = saveToStorage(settings, roles);

        expect(result).toBe(true);
        expect(localStorage.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.GLOBAL,
            JSON.stringify(settings)
        );
        expect(localStorage.setItem).toHaveBeenCalledWith(
            STORAGE_KEYS.ROLES,
            JSON.stringify(roles)
        );
    });

    it('存储空间满时应该调用 onError', () => {
        const onError = vi.fn();
        // 模拟 QuotaExceededError
        localStorage.setItem.mockImplementationOnce(() => {
            const err = new Error('Quota exceeded');
            err.name = 'QuotaExceededError';
            throw err;
        });

        const result = saveToStorage({}, [], onError);

        expect(result).toBe(false);
        expect(onError).toHaveBeenCalledWith(
            expect.stringContaining('存储空间'),
            expect.any(Error)
        );
    });

    it('其他错误时应该调用 onError', () => {
        const onError = vi.fn();
        localStorage.setItem.mockImplementationOnce(() => {
            throw new Error('Unknown error');
        });

        const result = saveToStorage({}, [], onError);

        expect(result).toBe(false);
        expect(onError).toHaveBeenCalledWith(
            expect.stringContaining('保存数据失败'),
            expect.any(Error)
        );
    });
});

describe('loadFromStorage', () => {
    it('无数据时应该返回 null', () => {
        const result = loadFromStorage();
        expect(result.globalSettings).toBeNull();
        expect(result.roleList).toBeNull();
        expect(result.error).toBeNull();
    });

    it('应该成功加载已保存的数据', () => {
        const settings = { apiKey: 'saved-key' };
        const roles = [{ id: '1', name: 'SavedRole' }];

        localStorage.getItem.mockImplementation((key) => {
            if (key === STORAGE_KEYS.GLOBAL) return JSON.stringify(settings);
            if (key === STORAGE_KEYS.ROLES) return JSON.stringify(roles);
            return null;
        });

        const result = loadFromStorage();

        expect(result.globalSettings).toEqual(settings);
        expect(result.roleList).toEqual(roles);
    });

    it('JSON 解析失败时应该调用 onError', () => {
        const onError = vi.fn();
        localStorage.getItem.mockReturnValue('{ invalid json');

        const result = loadFromStorage(onError);

        expect(result.error).toBeDefined();
        expect(onError).toHaveBeenCalledWith(
            expect.stringContaining('加载数据失败'),
            expect.any(Error)
        );
    });
});

describe('importData', () => {
    it('应该成功导入正确格式的数据', () => {
        const jsonStr = JSON.stringify({
            globalSettings: { apiKey: 'imported' },
            roleList: [{ id: '1', name: 'Imported' }],
        });

        const result = importData(jsonStr);

        expect(result.success).toBe(true);
        expect(result.data.globalSettings.apiKey).toBe('imported');
        expect(result.data.roleList[0].name).toBe('Imported');
    });

    it('缺少必要字段时应该返回失败', () => {
        const result = importData(JSON.stringify({ globalSettings: {} }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('数据格式不正确');
    });

    it('无效 JSON 应该返回失败', () => {
        const result = importData('not valid json');
        expect(result.success).toBe(false);
    });

    it('空字符串应该返回失败', () => {
        const result = importData('');
        expect(result.success).toBe(false);
    });
});
