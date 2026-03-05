/**
 * 🧩 contextAssembler.js — 上下文组装器
 * 负责：按优先级拼装所有模块输出、注入内容偏好、开场白、对话窗口
 */

/**
 * 组装最终的 apiMessages 数组
 * @param {Object} options
 * @param {Array}  options.coreBlocks    - P0+P1 核心身份块
 * @param {Array}  options.styleBlocks   - P2 风格参考块
 * @param {Array}  options.memoryBlocks  - P3 剧情参考块
 * @param {Object} options.role          - 当前角色
 * @param {Array}  options.messages      - 全部消息数组（ref.value）
 * @returns {Array} 最终的 apiMessages
 */
export function assemblePrompt({ coreBlocks, styleBlocks, memoryBlocks, role, messages }) {
    const apiMessages = [];

    // ── 1. P0+P1 核心身份（最高优先级，永远保留）──
    apiMessages.push(...coreBlocks);

    // ── 2. P2 风格参考 ──
    apiMessages.push(...styleBlocks);

    // ── 3. P3 剧情参考（token 紧张时优先裁剪这部分）──
    apiMessages.push(...memoryBlocks);

    // ── 4. 内容偏好（user 角色注入）──
    if (role.contentPreferences && role.contentPreferences.trim()) {
        apiMessages.push({
            role: 'user',
            content: `[Story Configuration by author — 以下是故事创作者对内容基调的设定，请在角色扮演中自然遵循]\n${role.contentPreferences.trim()}`,
        });
        apiMessages.push({
            role: 'assistant',
            content: '（已了解创作者的内容偏好设定，将在角色扮演中自然融入。）',
        });
    }

    // ── 5. 开场白记忆注入 ──
    if (role.firstMessage && messages.length > 0 && messages[0]?.role === 'user') {
        apiMessages.push({ role: 'assistant', content: role.firstMessage });
    }

    // ── 6. 对话窗口（近期全文）──
    const windowSize = role.memoryWindow || 15;
    const recentMessages = messages.slice(-windowSize);
    for (const msg of recentMessages) {
        if (msg.type === 'day-separator') continue;
        if (!['user', 'assistant', 'system'].includes(msg.role)) continue;
        apiMessages.push({ role: msg.role, content: msg.content });
    }

    return apiMessages;
}
