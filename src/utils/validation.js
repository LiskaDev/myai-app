/**
 * 🛡️ 输入验证工具
 * 防止特殊字符攻击和超长输入
 */

// 最大长度限制
export const INPUT_LIMITS = {
    ROLE_NAME: 50,
    AVATAR_URL: 2000,
    SYSTEM_PROMPT: 10000,
    MESSAGE: 10000,
    STYLE_GUIDE: 2000,
    STORY_SUMMARY: 5000,
};

/**
 * 清理和验证角色名
 * 防止超长输入和隐藏字符
 */
export function sanitizeRoleName(name) {
    if (!name || typeof name !== 'string') return '新角色';

    // 移除控制字符和零宽字符
    let cleaned = name.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');

    // 限制长度
    if (cleaned.length > INPUT_LIMITS.ROLE_NAME) {
        cleaned = cleaned.slice(0, INPUT_LIMITS.ROLE_NAME);
    }

    // 如果清理后为空，返回默认值
    return cleaned.trim() || '新角色';
}

/**
 * 验证 URL 格式
 * 防止 javascript: 注入
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') return true; // 空值允许

    try {
        const parsed = new URL(url, window.location.origin);
        // 只允许 http, https, data (用于 base64 图片)
        return ['http:', 'https:', 'data:'].includes(parsed.protocol);
    } catch {
        // 可能是相对路径
        return !url.toLowerCase().includes('javascript:');
    }
}

/**
 * 清理 URL，移除危险协议
 */
export function sanitizeUrl(url) {
    if (!url) return '';

    const trimmed = url.trim();
    if (trimmed.toLowerCase().startsWith('javascript:')) {
        return '';
    }

    // 限制长度
    if (trimmed.length > INPUT_LIMITS.AVATAR_URL) {
        console.warn('[Validation] URL 过长，已截断');
        return trimmed.slice(0, INPUT_LIMITS.AVATAR_URL);
    }

    return trimmed;
}

/**
 * 检查对象是否有原型污染攻击
 */
export function hasDangerousKeys(obj) {
    if (!obj || typeof obj !== 'object') return false;

    const dangerous = ['__proto__', 'constructor', 'prototype'];
    const keys = Object.keys(obj);

    for (const key of keys) {
        if (dangerous.includes(key)) {
            console.warn('[Security] 检测到危险属性:', key);
            return true;
        }
        // 递归检查嵌套对象
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (hasDangerousKeys(obj[key])) return true;
        }
    }

    return false;
}

/**
 * 安全的对象合并（防止原型污染）
 */
export function safeAssign(target, source, allowedKeys = null) {
    if (!source || typeof source !== 'object') return target;

    for (const key of Object.keys(source)) {
        // 跳过危险属性
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            continue;
        }

        // 如果指定了白名单，只允许白名单内的键
        if (allowedKeys && !allowedKeys.includes(key)) {
            continue;
        }

        target[key] = source[key];
    }

    return target;
}

/**
 * 估算字符串的 localStorage 空间占用
 */
export function estimateStorageSize(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    // localStorage 使用 UTF-16，每个字符 2 字节
    return str.length * 2;
}

/**
 * 检查 localStorage 剩余空间
 */
export function checkStorageQuota() {
    try {
        const testKey = '__storage_test__';
        const testData = 'x'.repeat(1024 * 100); // 100KB 测试
        localStorage.setItem(testKey, testData);
        localStorage.removeItem(testKey);
        return { available: true, estimatedFree: 'unknown' };
    } catch (e) {
        return { available: false, error: e.message };
    }
}
