/**
 * 🧩 contextAssembler.js — 上下文组装器
 * 负责：按优先级拼装所有模块输出、注入世界书、内容偏好、开场白、对话窗口
 */

/**
 * 组装最终的 apiMessages 数组
 * @param {Object} options
 * @param {Array}  options.coreBlocks    - P0+P1 核心身份块
 * @param {Array}  options.styleBlocks   - P2 风格参考块
 * @param {Array}  options.memoryBlocks  - P3 剧情参考块
 * @param {Object} [options.loreBlocks]  - 📖 世界书匹配结果 { before: string[], after: string[] }
 * @param {Array}  [options.vectorMemoryBlocks] - P3.5 向量记忆块（语义检索的相关历史记忆）
 * @param {Object} options.role          - 当前角色
 * @param {Array}  options.messages      - 全部消息数组（ref.value）
 * @returns {Array} 最终的 apiMessages
 */
export function assemblePrompt({ coreBlocks, styleBlocks, memoryBlocks, loreBlocks, vectorMemoryBlocks, role, messages }) {
    const apiMessages = [];

    // ── 1. P0+P1 核心身份（最高优先级，永远保留）──
    apiMessages.push(...coreBlocks);

    // ── 1.5 📖 世界书 Lore（before_char：在角色身份之后、风格参考之前）──
    if (loreBlocks?.before?.length) {
        apiMessages.push({
            role: 'system',
            content: `<world>\n${loreBlocks.before.join('\n\n')}\n</world>`,
        });
    }

    // ── 2. P2 风格参考 ──
    apiMessages.push(...styleBlocks);

    // ── 3. P3 剧情参考（token 紧张时优先裁剪这部分）──
    apiMessages.push(...memoryBlocks);

    // ── 3.5 P3.5 向量记忆（语义检索，相关历史记忆）──
    if (vectorMemoryBlocks?.length) {
        apiMessages.push({
            role: 'system',
            content: `[相关历史记忆 — 以下是与当前对话语义相关的重要历史事件，可作为背景参考]
${vectorMemoryBlocks.join('\n\n')}`,
        });
    }

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

    // ── 5.5 📖 世界书 Lore（after_char：在对话窗口之前，紧贴上下文）──
    if (loreBlocks?.after?.length) {
        apiMessages.push({
            role: 'system',
            content: `<world position="near_context">\n${loreBlocks.after.join('\n\n')}\n</world>`,
        });
    }

    // ── 6. 对话窗口（近期全文）──
    const windowSize = role.memoryWindow || 12;
    const recentMessages = messages.slice(-windowSize);
    const directives = (role.styleDirectives || []).filter(d => d && d.trim());

    for (let i = 0; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        if (msg.type === 'day-separator') continue;
        if (!['user', 'assistant', 'system'].includes(msg.role)) continue;

        // 紧贴最后一条 user 消息之前，再次强制提醒（提升遵循率）
        if (directives.length > 0 && msg.role === 'user' && i === recentMessages.length - 1) {
            apiMessages.push({
                role: 'system',
                content: `[⚠️ 立即执行 — 本次回复必须严格遵守以下每一条规则]\n${directives.map((d, j) => `${j + 1}. ${d}`).join('\n')}`,
            });
        }

        apiMessages.push({ role: msg.role, content: msg.content });
    }

    return apiMessages;
}
