/**
 * 🌍 世界书 (Lorebook) 系统
 * 
 * 这是什么？
 * ---------
 * 就像一本随身携带的百科全书。
 * 你可以在里面写各种世界设定（人物、地点、历史等），
 * 系统会根据对话内容，自动把相关的设定"翻出来"告诉 AI。
 * 
 * 省钱原理：
 * ---------
 * 假设你写了 100 个设定条目，但对话只提到了"霍格沃茨"，
 * 系统只会把"霍格沃茨"这一条发给 AI，其他 99 条不发。
 * 这样就不会浪费 Token 钱！
 * 
 * 使用流程：
 * ---------
 * 1. 创建条目：填写名称、触发词、简单描述
 * 2. AI 完善（可选）：点一下按钮，AI 帮你扩写成详细版
 * 3. 手动编辑（可选）：不满意就自己改
 * 4. 开始对话：系统自动匹配，只发送相关条目
 */

import { reactive, watch, computed } from 'vue';

// ============================================
// 📦 配置常量
// ============================================

// 这些是可以调整的设置
export const LOREBOOK_CONFIG = {
    // 每次对话最多注入多少 Token 的世界书内容
    // 设小一点更省钱，但 AI 知道的信息就少
    MAX_INJECTION_TOKENS: 800,

    // 扫描最近几轮对话来匹配关键词
    // 数字越大，匹配越准确，但也会稍微慢一点
    SCAN_DEPTH: 5,

    // 单个条目的最大字符数
    MAX_ENTRY_LENGTH: 2000,

    // 估算 Token 数的比例（中文大约 1.5-2 字符 = 1 Token）
    CHARS_PER_TOKEN: 1.5,
};

// ============================================
// 📖 世界书状态
// ============================================

// 创建一个空的世界书结构
function createEmptyLorebook() {
    return {
        // 是否启用世界书
        enabled: true,

        // 条目列表
        entries: [],

        // 元信息
        meta: {
            version: 1,
            createdAt: Date.now(),
            lastModified: Date.now(),
        }
    };
}

// 创建一个新条目
export function createNewEntry() {
    return {
        // 唯一标识符
        id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),

        // 条目名称（给人看的，比如"伏地魔"）
        name: '',

        // 触发词列表（对话里出现这些词就会触发）
        // 例如：['伏地魔', '黑魔王', '神秘人', 'Voldemort']
        keywords: [],

        // 用户写的简单描述（可以很简短）
        userDraft: '',

        // 最终使用的内容（可能是用户自己写的，也可能是 AI 扩展后的）
        content: '',

        // 这个条目是否已被 AI 扩展过
        isExpanded: false,

        // 优先级（数字越大越优先）
        // 如果 Token 预算不够，会优先保留高优先级的
        priority: 50,

        // 是否启用这个条目
        enabled: true,

        // 是否区分大小写（一般不需要）
        caseSensitive: false,
    };
}

// ============================================
// 🔧 核心函数
// ============================================

/**
 * 世界书 Composable
 * 
 * 这是 Vue 的"组合式函数"，把世界书相关的所有逻辑打包在一起。
 * 在组件里这样使用：
 * 
 *   import { useWorld } from '@/composables/useWorld'
 *   const { lorebook, addEntry, getTriggeredContent } = useWorld()
 */
export function useWorld(appState = null) {

    // -----------------------------------------
    // 响应式状态
    // -----------------------------------------

    // 世界书主状态（会自动保存到 localStorage）
    const lorebook = reactive(loadFromStorage() || createEmptyLorebook());

    // 正在进行 AI 扩展的条目 ID
    const expandingEntryId = reactive({ value: null });

    // -----------------------------------------
    // 自动保存到 localStorage
    // -----------------------------------------

    watch(lorebook, (newValue) => {
        newValue.meta.lastModified = Date.now();
        saveToStorage(newValue);
    }, { deep: true });

    // -----------------------------------------
    // 条目管理函数
    // -----------------------------------------

    /**
     * 添加新条目
     */
    function addEntry() {
        const entry = createNewEntry();
        lorebook.entries.push(entry);
        return entry;
    }

    /**
     * 删除条目
     * @param {string} entryId - 要删除的条目 ID
     */
    function removeEntry(entryId) {
        const index = lorebook.entries.findIndex(e => e.id === entryId);
        if (index >= 0) {
            lorebook.entries.splice(index, 1);
        }
    }

    /**
     * 更新条目
     * @param {string} entryId - 条目 ID
     * @param {Object} updates - 要更新的字段
     */
    function updateEntry(entryId, updates) {
        const entry = lorebook.entries.find(e => e.id === entryId);
        if (entry) {
            Object.assign(entry, updates);
        }
    }

    /**
     * 添加关键词
     * @param {string} entryId - 条目 ID
     * @param {string} keyword - 新关键词
     */
    function addKeyword(entryId, keyword) {
        const entry = lorebook.entries.find(e => e.id === entryId);
        if (entry && keyword.trim() && !entry.keywords.includes(keyword.trim())) {
            entry.keywords.push(keyword.trim());
        }
    }

    /**
     * 移除关键词
     * @param {string} entryId - 条目 ID
     * @param {string} keyword - 要移除的关键词
     */
    function removeKeyword(entryId, keyword) {
        const entry = lorebook.entries.find(e => e.id === entryId);
        if (entry) {
            const idx = entry.keywords.indexOf(keyword);
            if (idx >= 0) entry.keywords.splice(idx, 1);
        }
    }

    // -----------------------------------------
    // AI 扩展功能
    // -----------------------------------------

    /**
     * 让 AI 帮忙扩展条目内容
     * 用户只需要写简单描述，AI 会补充成详细版本
     * 
     * @param {string} entryId - 条目 ID
     * @param {Object} options - 可选配置
     * @param {string} options.worldGenre - 世界类型（如"奇幻"、"科幻"）
     */
    async function expandEntryWithAI(entryId, options = {}) {
        const entry = lorebook.entries.find(e => e.id === entryId);
        if (!entry) return;

        // 检查是否有 API Key（从 appState 获取）
        const apiKey = appState?.globalSettings?.apiKey;
        if (!apiKey) {
            throw new Error('请先设置 API Key');
        }

        expandingEntryId.value = entryId;

        try {
            // 构建 AI 提示词
            const prompt = buildExpansionPrompt(entry, options);

            // 调用 API
            const baseUrl = (appState?.globalSettings?.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat', // 用便宜的模型
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500,
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            const expandedContent = data.choices?.[0]?.message?.content?.trim();

            if (expandedContent) {
                // 更新条目
                entry.content = expandedContent;
                entry.isExpanded = true;

                console.log(`[Lorebook] 条目「${entry.name}」已扩展`);
            }
        } catch (error) {
            console.error('[Lorebook] AI 扩展失败:', error);
            throw error;
        } finally {
            expandingEntryId.value = null;
        }
    }

    /**
     * 构建 AI 扩展提示词
     */
    function buildExpansionPrompt(entry, options = {}) {
        const worldGenre = options.worldGenre || '奇幻';
        const draft = entry.userDraft || entry.name;

        return `你是一位专业的世界观设计师。请基于以下简单描述，扩展成一段详细、生动的百科全书式介绍。

【条目名称】${entry.name}
【用户描述】${draft}
【世界类型】${worldGenre}

【扩展要求】
1. 字数在 150-300 字之间
2. 使用第三人称客观描述
3. 可以包含：历史背景、特征、与世界的关系、有趣的细节
4. 不要添加主观评价或情感色彩
5. 直接输出扩展内容，不要加任何前缀或解释

请输出扩展后的描述：`;
    }

    // -----------------------------------------
    // 关键词匹配与注入
    // -----------------------------------------

    /**
     * 检查文本中是否包含某个条目的触发词
     * 
     * @param {string} text - 要检查的文本
     * @param {Object} entry - 条目对象
     * @returns {boolean} - 是否匹配
     */
    function matchEntry(text, entry) {
        if (!entry.enabled || entry.keywords.length === 0) {
            return false;
        }

        // 根据是否区分大小写来处理
        const textToCheck = entry.caseSensitive ? text : text.toLowerCase();

        return entry.keywords.some(keyword => {
            const keywordToCheck = entry.caseSensitive ? keyword : keyword.toLowerCase();
            return textToCheck.includes(keywordToCheck);
        });
    }

    /**
     * 获取需要注入的条目
     * 这是核心的"省钱"功能！
     * 
     * @param {string} currentMessage - 当前用户输入
     * @param {Array} recentMessages - 最近几轮对话
     * @returns {Array} - 匹配到的条目列表
     */
    function getTriggeredEntries(currentMessage, recentMessages = []) {
        if (!lorebook.enabled) return [];

        // 把当前消息和最近几轮拼成一个大文本
        const scanDepth = LOREBOOK_CONFIG.SCAN_DEPTH;
        const recentTexts = recentMessages
            .slice(-scanDepth)
            .map(m => m.rawContent || m.content || '')
            .join(' ');

        const fullText = `${currentMessage} ${recentTexts}`;

        // 找出所有匹配的条目
        const matched = lorebook.entries.filter(entry => matchEntry(fullText, entry));

        // 按优先级排序（高优先级在前）
        matched.sort((a, b) => b.priority - a.priority);

        // Token 预算控制
        const maxTokens = LOREBOOK_CONFIG.MAX_INJECTION_TOKENS;
        const result = [];
        let totalTokens = 0;

        for (const entry of matched) {
            const content = entry.content || entry.userDraft || '';
            const entryTokens = estimateTokens(content);

            if (totalTokens + entryTokens <= maxTokens) {
                result.push(entry);
                totalTokens += entryTokens;
            } else {
                // 预算用完，停止添加
                console.log(`[Lorebook] Token 预算已满，跳过「${entry.name}」`);
                break;
            }
        }

        return result;
    }

    /**
     * 获取格式化后的注入内容
     * 这个字符串会被加到 System Prompt 里
     * 
     * @param {string} currentMessage - 当前用户输入
     * @param {Array} recentMessages - 最近几轮对话
     * @returns {string} - 格式化的世界书内容
     */
    function getInjectionContent(currentMessage, recentMessages = []) {
        const entries = getTriggeredEntries(currentMessage, recentMessages);

        if (entries.length === 0) return '';

        // 构建紧凑的格式
        let text = '[世界设定 - 以下是与当前对话相关的背景信息]\n';

        for (const entry of entries) {
            const content = entry.content || entry.userDraft || '';
            text += `\n【${entry.name}】\n${content}\n`;
        }

        text += '[/世界设定]\n';

        return text;
    }

    // -----------------------------------------
    // 统计信息
    // -----------------------------------------

    /**
     * 获取条目总数
     */
    const totalEntries = computed(() => lorebook.entries.length);

    /**
     * 获取已启用的条目数
     */
    const enabledEntries = computed(() =>
        lorebook.entries.filter(e => e.enabled).length
    );

    /**
     * 获取已扩展的条目数
     */
    const expandedEntries = computed(() =>
        lorebook.entries.filter(e => e.isExpanded).length
    );

    // -----------------------------------------
    // 辅助函数
    // -----------------------------------------

    /**
     * 估算文本的 Token 数
     * 这只是粗略估算，实际可能略有偏差
     */
    function estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / LOREBOOK_CONFIG.CHARS_PER_TOKEN);
    }

    /**
     * 保存到 localStorage
     */
    function saveToStorage(data) {
        try {
            localStorage.setItem('myai_lorebook_v1', JSON.stringify(data));
        } catch (e) {
            console.error('[Lorebook] 保存失败:', e);
        }
    }

    /**
     * 从 localStorage 加载
     */
    function loadFromStorage() {
        try {
            const saved = localStorage.getItem('myai_lorebook_v1');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('[Lorebook] 加载失败:', e);
        }
        return null;
    }

    /**
     * 重置世界书（清空所有条目）
     */
    function resetLorebook() {
        const empty = createEmptyLorebook();
        lorebook.enabled = empty.enabled;
        lorebook.entries = empty.entries;
        lorebook.meta = empty.meta;
    }

    /**
     * 导出世界书为 JSON
     */
    function exportLorebook() {
        return JSON.stringify(lorebook, null, 2);
    }

    /**
     * 导入世界书
     */
    function importLorebook(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error('格式不正确');
            }
            lorebook.enabled = data.enabled ?? true;
            lorebook.entries = data.entries;
            lorebook.meta = data.meta || createEmptyLorebook().meta;
            return true;
        } catch (e) {
            console.error('[Lorebook] 导入失败:', e);
            return false;
        }
    }

    // -----------------------------------------
    // 返回所有公开的函数和状态
    // -----------------------------------------

    return {
        // 状态
        lorebook,
        expandingEntryId,

        // 统计
        totalEntries,
        enabledEntries,
        expandedEntries,

        // 条目管理
        addEntry,
        removeEntry,
        updateEntry,
        addKeyword,
        removeKeyword,

        // AI 扩展
        expandEntryWithAI,

        // 注入功能
        getTriggeredEntries,
        getInjectionContent,

        // 导入导出
        exportLorebook,
        importLorebook,
        resetLorebook,

        // 辅助
        estimateTokens,
    };
}
