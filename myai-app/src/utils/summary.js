/**
 * 🧠 智能摘要工具
 * 用于长对话的滚动压缩记忆
 */

// 摘要配置
export const SUMMARY_CONFIG = {
    // 触发摘要的消息数阈值
    TRIGGER_THRESHOLD: 20,
    // 保留的最新消息数（不压缩）
    KEEP_RECENT: 10,
    // 摘要最大长度（字符）
    MAX_SUMMARY_LENGTH: 800,
    // 摘要消耗的预估 token 数
    ESTIMATED_SUMMARY_TOKENS: 300,
};

/**
 * 构建摘要请求的提示词
 * @param {Array} messages - 要压缩的消息列表
 * @param {Object} role - 当前角色信息
 * @param {string} existingSummary - 已有的历史摘要
 * @returns {string} 完整的摘要提示词
 */
export function buildSummaryPrompt(messages, role, existingSummary = '') {
    const roleName = role?.name || '角色';
    const userName = '用户';

    // 将消息格式化为对话文本
    const dialogueText = messages.map(msg => {
        const speaker = msg.role === 'user' ? userName : roleName;
        // 只取内容的前 500 字符，避免太长
        const content = (msg.rawContent || msg.content || '').slice(0, 500);
        return `${speaker}: ${content}`;
    }).join('\n\n');

    const prompt = `你是一个专业的故事摘要助手。请将以下角色扮演对话压缩成简洁的叙事摘要。

${existingSummary ? `【已有历史摘要】\n${existingSummary}\n\n` : ''}【需要压缩的新对话】
${dialogueText}

【摘要要求】
1. 使用第三人称叙述（如"${userName}与${roleName}..."）
2. 保留关键情节转折和重要决策
3. 记录角色关系变化和情感发展
4. 提及重要物品、地点、人物
5. 控制在 200 字以内
6. 如果有已有历史摘要，将新内容整合进去

请直接输出摘要，不要加任何前缀或解释：`;

    return prompt;
}

/**
 * 检查是否需要触发摘要
 * @param {Array} messages - 当前消息列表
 * @param {string} existingSummary - 已有摘要
 * @param {number} summarizedUpTo - 已经摘要到的消息索引
 * @returns {boolean}
 */
export function shouldTriggerSummary(messages, existingSummary = '', summarizedUpTo = 0) {
    // v5.9: 只计算未被摘要的消息数
    const unsummarizedCount = messages.length - summarizedUpTo;
    const threshold = SUMMARY_CONFIG.TRIGGER_THRESHOLD;

    return unsummarizedCount >= threshold;
}

/**
 * 获取需要摘要的消息范围
 * v5.9: 不再删除消息，只返回需要摘要的部分
 * @param {Array} messages - 完整消息列表
 * @param {number} summarizedUpTo - 已经摘要到的消息索引
 * @returns {Object} { toSummarize: [], newSummarizedUpTo: number }
 */
export function getMessageRanges(messages, summarizedUpTo = 0) {
    const keepCount = SUMMARY_CONFIG.KEEP_RECENT;
    const endOfSummarize = messages.length - keepCount;

    if (endOfSummarize <= summarizedUpTo) {
        return {
            toSummarize: [],
            newSummarizedUpTo: summarizedUpTo,
        };
    }

    return {
        toSummarize: messages.slice(summarizedUpTo, endOfSummarize),
        newSummarizedUpTo: endOfSummarize,
    };
}

/**
 * 格式化摘要用于注入 prompt
 * @param {string} summary - 原始摘要
 * @returns {string} 格式化后的摘要
 */
export function formatSummaryForPrompt(summary) {
    if (!summary || !summary.trim()) return '';

    return `[故事进展摘要]
${summary.trim()}
[/故事进展摘要]`;
}

/**
 * 合并新摘要和旧摘要
 * 如果合并后太长，保留最新的部分
 * @param {string} oldSummary 
 * @param {string} newSummary 
 * @returns {string}
 */
export function mergeSummaries(oldSummary, newSummary) {
    if (!oldSummary) return newSummary;
    if (!newSummary) return oldSummary;

    const combined = `${oldSummary}\n\n${newSummary}`;

    // 如果合并后太长，只保留新摘要（下次会再压缩）
    if (combined.length > SUMMARY_CONFIG.MAX_SUMMARY_LENGTH) {
        return newSummary;
    }

    return combined;
}
