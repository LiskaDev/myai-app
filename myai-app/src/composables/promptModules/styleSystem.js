/**
 * 🎨 styleSystem.js — P2 风格参考
 * 负责：写作基础、风格模板、用户反应学习、动态风格指令
 */

import { WRITING_STYLE_PRESETS, WRITING_STYLE_BASE } from '../presets';

/**
 * 构建 Step 0.5 + 2.5 + 4.5 + 6.5 风格相关的 system 块
 * @param {Object} role - 当前角色数据
 * @param {Array} allMessages - 所有消息（用于提取用户反应）
 * @returns {Array} apiMessages 块
 */
export function buildStyleInstructions(role, allMessages) {
    const blocks = [];

    // Step 0.5: 写作质量基础指令
    blocks.push({
        role: 'system',
        content: `【🟡 风格参考 - 写作质量基础】\n${WRITING_STYLE_BASE}`,
    });

    // Step 2.5: 写作风格模板
    if (role.writingStyle) {
        const stylePreset = WRITING_STYLE_PRESETS.find(s => s.id === role.writingStyle);
        if (stylePreset) {
            blocks.push({
                role: 'system',
                content: `【🟡 风格参考 - 写作风格模板】\n${stylePreset.prompt}`,
            });
        }
    }

    // Step 4.5: 用户反应风格学习
    const POSITIVE_REACTIONS = new Set(['❤️', '👍', '🔥']);
    const liked = allMessages
        .filter(m => m.role === 'assistant' && POSITIVE_REACTIONS.has(m.reaction))
        .slice(-3);
    const disliked = allMessages
        .filter(m => m.role === 'assistant' && m.reaction === '👎')
        .slice(-2);

    if (liked.length >= 2) {
        const samples = liked.map((m, i) => {
            const raw = m.rawContent || m.content || '';
            const cleaned = raw
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<inner>[\s\S]*?<\/inner>/g, '')
                .replace(/<expr:[^>]+>/g, '')
                .trim();
            return `${i + 1}. ${cleaned.slice(0, 100)}${cleaned.length > 100 ? '…' : ''}`;
        }).join('\n');
        blocks.push({
            role: 'system',
            content: `【🟡 风格参考】[User Style Preferences — the user especially enjoyed these responses, try to emulate this tone and style]\n${samples}`,
        });
    }

    if (disliked.length >= 1) {
        const avoidSamples = disliked.map((m, i) => {
            const raw = m.rawContent || m.content || '';
            const cleaned = raw
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<inner>[\s\S]*?<\/inner>/g, '')
                .replace(/<expr:[^>]+>/g, '')
                .trim();
            return `${i + 1}. ${cleaned.slice(0, 80)}…`;
        }).join('\n');
        blocks.push({
            role: 'system',
            content: `【🟡 风格参考】[User Dislikes — the user disliked these responses, avoid this style]\n${avoidSamples}`,
        });
    }

    // Step 6.5: 动态风格指令
    const directives = (role.styleDirectives || []).filter(d => d && d.trim());
    if (directives.length > 0) {
        blocks.push({
            role: 'system',
            content: `【🟡 风格参考 - 用户实时指令】[用户写作风格偏好 — 从下一条回复开始严格遵循]\n${directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
        });
    }

    return blocks;
}
