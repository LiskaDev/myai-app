/**
 * 🧪 validation.js 单元测试
 * 测试输入验证、URL 安全、原型污染检测
 */

import { describe, it, expect } from 'vitest';
import {
    sanitizeRoleName,
    isValidUrl,
    sanitizeUrl,
    hasDangerousKeys,
    safeAssign,
    INPUT_LIMITS,
} from '../src/utils/validation';

describe('sanitizeRoleName', () => {
    it('应该返回正常的角色名', () => {
        expect(sanitizeRoleName('测试角色')).toBe('测试角色');
        expect(sanitizeRoleName('Test Role')).toBe('Test Role');
    });

    it('应该处理空输入', () => {
        expect(sanitizeRoleName('')).toBe('新角色');
        expect(sanitizeRoleName(null)).toBe('新角色');
        expect(sanitizeRoleName(undefined)).toBe('新角色');
    });

    it('应该移除控制字符', () => {
        expect(sanitizeRoleName('test\x00name')).toBe('testname');
        expect(sanitizeRoleName('零\u200B宽')).toBe('零宽'); // 零宽空格
    });

    it('应该截断超长输入', () => {
        const longName = '😀'.repeat(100);
        const result = sanitizeRoleName(longName);
        expect(result.length).toBeLessThanOrEqual(INPUT_LIMITS.ROLE_NAME);
    });

    it('应该处理纯空白字符', () => {
        expect(sanitizeRoleName('   ')).toBe('新角色');
        expect(sanitizeRoleName('\t\n')).toBe('新角色');
    });
});

describe('isValidUrl', () => {
    it('应该接受 http/https URL', () => {
        expect(isValidUrl('https://example.com/image.jpg')).toBe(true);
        expect(isValidUrl('http://localhost:3000/avatar.png')).toBe(true);
    });

    it('应该接受 data URL (base64)', () => {
        expect(isValidUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    });

    it('应该拒绝 javascript: 协议', () => {
        expect(isValidUrl('javascript:alert(1)')).toBe(false);
        expect(isValidUrl('JAVASCRIPT:evil()')).toBe(false);
    });

    it('应该接受空值', () => {
        expect(isValidUrl('')).toBe(true);
        expect(isValidUrl(null)).toBe(true);
    });

    it('应该接受相对路径', () => {
        expect(isValidUrl('/images/avatar.jpg')).toBe(true);
        expect(isValidUrl('./local-file.png')).toBe(true);
    });
});

describe('sanitizeUrl', () => {
    it('应该返回正常 URL', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('应该移除 javascript: URL', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('应该截断超长 URL', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(3000);
        const result = sanitizeUrl(longUrl);
        expect(result.length).toBeLessThanOrEqual(INPUT_LIMITS.AVATAR_URL);
    });
});

describe('hasDangerousKeys', () => {
    it('应该检测危险属性名', () => {
        // 使用 Object.defineProperty 创建包含危险键的对象
        const obj1 = {};
        Object.defineProperty(obj1, '__proto__', { value: {}, enumerable: true });
        expect(hasDangerousKeys(obj1)).toBe(true);

        const obj2 = { constructor: {} };
        expect(hasDangerousKeys(obj2)).toBe(true);

        const obj3 = { prototype: {} };
        expect(hasDangerousKeys(obj3)).toBe(true);
    });

    it('应该检测嵌套危险属性', () => {
        const obj = { normal: { constructor: {} } };
        expect(hasDangerousKeys(obj)).toBe(true);
    });

    it('应该通过正常对象', () => {
        expect(hasDangerousKeys({ name: 'test', value: 123 })).toBe(false);
        expect(hasDangerousKeys(null)).toBe(false);
    });
});

describe('safeAssign', () => {
    it('应该正常合并对象', () => {
        const target = { a: 1 };
        const result = safeAssign(target, { b: 2 });
        expect(result).toEqual({ a: 1, b: 2 });
    });

    it('应该跳过危险属性', () => {
        const target = {};
        const source = {
            name: 'safe',
            constructor: () => { },
            prototype: {},
        };
        // 手动添加 __proto__ 属性
        Object.defineProperty(source, '__proto__', { value: { evil: true }, enumerable: true });

        const result = safeAssign(target, source);
        expect(result.name).toBe('safe');
        // constructor 和 prototype 应该被跳过
        expect(Object.keys(result)).not.toContain('constructor');
        expect(Object.keys(result)).not.toContain('prototype');
    });

    it('应该支持白名单模式', () => {
        const target = {};
        const source = { a: 1, b: 2, c: 3 };
        const result = safeAssign(target, source, ['a', 'b']);
        expect(result).toEqual({ a: 1, b: 2 });
        expect(result.c).toBeUndefined();
    });
});
