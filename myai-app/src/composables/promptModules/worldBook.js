/**
 * 📖 worldBook.js — 世界书 / Lorebook 系统
 * 负责：条目管理、关键词匹配、localStorage 存储、SillyTavern 兼容导入导出
 */

import { generateUUID } from '../../utils/uuid.js';

// ─────────────────────────────────────────────
// 1. 数据结构
// ─────────────────────────────────────────────

/**
 * 创建一条新的世界书条目
 * @param {Object} overrides - 覆盖默认值
 * @returns {Object} 世界书条目
 */
export function createEntry(overrides = {}) {
    return {
        id: generateUUID(),
        name: '',              // 条目名称（如"蒙德城"）
        keywords: [],          // 触发关键词数组
        content: '',           // 注入的 lore 内容
        enabled: true,         // 是否启用
        priority: 50,          // 优先级（0-100，越大越先注入）
        position: 'before_char', // 注入位置：'before_char' | 'after_char'
        ...overrides,
    };
}


// ─────────────────────────────────────────────
// 2. 关键词匹配引擎
// ─────────────────────────────────────────────

/**
 * 粗估文本 token 数（中文 1 字 ≈ 1.5 token，英文 1 词 ≈ 1 token）
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
    if (!text) return 0;
    // 统计中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    // 统计英文单词数（非中文部分按空格分词）
    const nonChinese = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '');
    const englishWords = nonChinese.trim().split(/\s+/).filter(Boolean).length;
    return Math.ceil(chineseChars * 1.5 + englishWords);
}

/**
 * 获取被激活的世界书条目
 * @param {Array} messages - 对话消息数组
 * @param {Array} lorebook - 世界书条目数组
 * @param {Object} options
 * @param {number} options.maxTokens  - 最大 token 预算（默认 1500）
 * @param {number} options.scanDepth  - 扫描最近消息数（默认 10）
 * @returns {{ before: string[], after: string[] }} 按 position 分组的激活内容
 */
export function getActiveLoreEntries(messages, lorebook, options = {}) {
    const { maxTokens = 1500, scanDepth = 10 } = options;
    const result = { before: [], after: [] };

    if (!lorebook || lorebook.length === 0 || !messages || messages.length === 0) {
        return result;
    }

    // 1. 拼接最近 N 条消息作为扫描文本
    const recentMessages = messages.slice(-scanDepth);
    const scanText = recentMessages
        .map(m => (m.rawContent || m.content || '').toLowerCase())
        .join('\n');

    if (!scanText.trim()) return result;

    // 2. 找出所有被关键词命中的已启用条目
    const matched = [];
    for (const entry of lorebook) {
        if (!entry.enabled || !entry.content || !entry.keywords || entry.keywords.length === 0) {
            continue;
        }
        const hit = entry.keywords.some(kw => {
            const keyword = (kw || '').trim().toLowerCase();
            return keyword.length > 0 && scanText.includes(keyword);
        });
        if (hit) {
            matched.push(entry);
        }
    }

    // 3. 按 priority 降序排列（相同优先级按 name 排序保持稳定）
    matched.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (a.name || '').localeCompare(b.name || '');
    });

    // 4. 累计 token，超出预算截止
    let usedTokens = 0;
    for (const entry of matched) {
        const entryTokens = estimateTokens(entry.content);
        if (usedTokens + entryTokens > maxTokens && result.before.length + result.after.length > 0) {
            break; // 至少保留第一条命中的，之后超预算才截止
        }
        usedTokens += entryTokens;

        const pos = entry.position === 'after_char' ? 'after' : 'before';
        result[pos].push(entry.content);
    }

    return result;
}


// ─────────────────────────────────────────────
// 3. localStorage 存储
// ─────────────────────────────────────────────

const WORLDBOOK_KEY_PREFIX = 'myai_worldbook_';

/**
 * 加载角色的世界书
 * @param {string} roleId
 * @returns {Array} 世界书条目数组
 */
export function loadWorldBook(roleId) {
    if (!roleId) return [];
    try {
        const raw = localStorage.getItem(WORLDBOOK_KEY_PREFIX + roleId);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/**
 * 保存角色的世界书
 * @param {string} roleId
 * @param {Array} entries
 */
export function saveWorldBook(roleId, entries) {
    if (!roleId) return;
    try {
        localStorage.setItem(WORLDBOOK_KEY_PREFIX + roleId, JSON.stringify(entries));
    } catch (e) {
        console.warn('[WorldBook] 保存失败:', e.message);
    }
}


// ─────────────────────────────────────────────
// 4. 导入 / 导出（兼容 SillyTavern）
// ─────────────────────────────────────────────

/**
 * 导出世界书为 JSON 下载
 * @param {Array} entries - 世界书条目
 * @param {string} roleName - 角色名（用于文件名）
 */
export function exportWorldBook(entries, roleName = 'worldbook') {
    const data = {
        type: 'myai_worldbook',
        version: '1.0',
        exportDate: new Date().toISOString(),
        entries,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worldbook-${roleName}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 导入世界书 JSON，兼容 SillyTavern lorebook 格式
 * @param {string} jsonString - JSON 字符串
 * @returns {{ success: boolean, entries?: Array, error?: string }}
 */
export function importWorldBook(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        // 格式 1: MyAI 原生格式
        if (data.type === 'myai_worldbook' && Array.isArray(data.entries)) {
            return { success: true, entries: data.entries.map(e => createEntry(e)) };
        }

        // 格式 2: 纯数组（必须在 SillyTavern 格式之前检查，
        //          因为 Array.prototype.entries 是内置方法，会让 `if (data.entries)` 误判）
        if (Array.isArray(data)) {
            return { success: true, entries: data.map(e => createEntry(e)) };
        }

        // 格式 3: SillyTavern lorebook 格式（entries 对象或数组）
        if (data.entries) {
            const stEntries = Array.isArray(data.entries)
                ? data.entries
                : Object.values(data.entries);

            const mapped = stEntries.map(e => createEntry({
                name: e.comment || e.name || '',
                keywords: Array.isArray(e.key) ? e.key : (e.key || e.keys || '').split(',').map(k => k.trim()).filter(Boolean),
                content: e.content || '',
                enabled: !e.disable,
                priority: e.order ?? e.priority ?? 50,
                position: e.position === 1 ? 'after_char' : 'before_char',
            }));

            return { success: true, entries: mapped };
        }

        return { success: false, error: '无法识别的世界书格式' };
    } catch (e) {
        return { success: false, error: `JSON 解析失败: ${e.message}` };
    }
}
