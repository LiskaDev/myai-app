/**
 * 🧠 memorySystem.js — P3 剧情参考
 * 负责：认知卡、章节摘要、故事摘要、动态状态、时间线、钉选记忆、用户画像
 */

import { formatSummaryForPrompt } from '../../utils/summary';

// ─── 辅助函数 ───

function getAffectionLevel(score) {
    if (score >= 90) return '非常亲密';
    if (score >= 70) return '亲密';
    if (score >= 50) return '友好';
    if (score >= 30) return '普通';
    return '疏远';
}

/**
 * 构建认知卡注入文本
 */
export function buildMemoryCardContext(role) {
    const card = role.memoryCard;
    if (!card) return '';
    const hasCard = card.userProfile || (card.keyEvents || []).length > 0 || card.relationshipStage;
    if (!hasCard) return '';

    let text = '\n\n【🔵 剧情参考 - 你对用户的了解，请结合以下信息理解用户，自然地体现在对话中】\n';
    if (card.userProfile) text += `关于用户：${card.userProfile}\n`;
    if (card.relationshipStage) text += `我们的关系：${card.relationshipStage}\n`;
    if (card.emotionalState) text += `用户当前状态：${card.emotionalState}\n`;
    if ((card.keyEvents || []).length > 0) text += `重要经历：${card.keyEvents.join('；')}\n`;
    if ((card.taboos || []).length > 0) text += `⚠️ 注意事项（绝不触碰）：${card.taboos.join('；')}\n`;
    if (card.lastTone) text += `近期对话基调：${card.lastTone}\n`;
    return text;
}

/**
 * 构建章节摘要注入文本（最近 5 章）
 */
export function buildChapterContext(role) {
    const chapters = role.chapterSummaries;
    if (!chapters || chapters.length === 0) return '';

    const recentChapters = chapters.slice(-5);
    let text = '\n\n【🔵 剧情参考 - 过往剧情回顾，请保持剧情连贯】\n';
    recentChapters.forEach(c => {
        const prefix = c.isCondensed ? '远古回忆' : `第${c.chapterIndex}章`;
        text += `${prefix}：${c.summary}\n`;
    });
    return text;
}

/**
 * 构建动态状态文本
 */
function buildDynamicStatus(role) {
    const now = Date.now();
    const daysSinceLast = role.lastChatTime
        ? Math.floor((now - role.lastChatTime) / (1000 * 60 * 60 * 24))
        : 0;

    let absenceNote = '';
    if (daysSinceLast >= 7) absenceNote = `（玩家已经${daysSinceLast}天没有登录）`;
    else if (daysSinceLast >= 3) absenceNote = `（玩家${daysSinceLast}天没来了）`;
    else if (daysSinceLast === 0) absenceNote = `（今天第一次开口）`;

    const score = role.affectionScore ?? 50;
    const affectionLevel = getAffectionLevel(score);
    const recentKeyMoment = role.keyMoments?.slice(-1)[0]?.text || null;

    const lines = [
        `情绪：${role.currentEmotion || '平静'}${absenceNote}`,
        `好感：${score}/100（${affectionLevel}）`,
        `关系阶段：${role.relationshipStage || '普通朋友'}`,
        recentKeyMoment ? `最近记住的事：${recentKeyMoment}` : null,
    ].filter(Boolean).join('\n');

    return `【🔵 剧情参考】[当前状态]\n${lines}\n[/当前状态]`;
}

/**
 * 构建 Step 3-6 所有记忆/剧情参考相关的 system 块
 * @param {Object} role - 当前角色数据
 * @param {string} timelineText - 时间线文本（由 useTimeline 外部提供）
 * @param {string|null} personaSummary - 用户画像文本（由 useUserPersona 外部提供）
 * @returns {Array} apiMessages 块
 */
export function buildMemoryContext(role, timelineText, personaSummary) {
    const blocks = [];

    // Step 3: 认知卡
    const memoryCardText = buildMemoryCardContext(role);
    if (memoryCardText) {
        blocks.push({ role: 'system', content: memoryCardText });
    }

    // Step 4: 章节摘要
    const chapterText = buildChapterContext(role);
    if (chapterText) {
        blocks.push({ role: 'system', content: chapterText });
    }

    // Step 5: 故事摘要
    const summary = role.storySummary || role.autoSummary || '';
    if (summary) {
        blocks.push({
            role: 'system',
            content: `【🔵 剧情参考 - 故事背景】\n${formatSummaryForPrompt(summary)}`,
        });
    }

    // Step 5.1: 当前状态
    blocks.push({ role: 'system', content: buildDynamicStatus(role) });

    // Step 5.5: 时间线
    if (timelineText) {
        blocks.push({
            role: 'system',
            content: `【🔵 剧情参考 - 时间线】\n${timelineText}`,
        });
    }

    // Step 6: 钉选记忆
    const allMemories = (role.manualMemories || []).filter(m => m.content && m.content.trim());
    const MAX_MEMORIES = 20;
    const manualMemories = allMemories.length > MAX_MEMORIES
        ? allMemories.slice(-MAX_MEMORIES)
        : allMemories;
    if (manualMemories.length > 0) {
        const memoryText = manualMemories
            .map((m, i) => {
                const roleLabel = m.source === 'group' ? '群聊' : (m.role === 'user' ? '用户' : '角色');
                const contentPreview = m.content.length > 300
                    ? m.content.substring(0, 300) + '...'
                    : m.content;
                return `${i + 1}. [${roleLabel}] ${contentPreview}`;
            })
            .join('\n');
        const omittedNote = allMemories.length > MAX_MEMORIES
            ? `\n（还有 ${allMemories.length - MAX_MEMORIES} 条更早的记忆已被压缩省略）`
            : '';
        blocks.push({
            role: 'system',
            content: `【🔵 剧情参考】[重要记忆 - 请始终记住以下内容]\n${memoryText}${omittedNote}`,
        });
    }

    // Step 8: 用户画像（放在记忆系统最末尾）
    if (personaSummary) {
        blocks.push({
            role: 'system',
            content: `【🔵 剧情参考 - 用户画像】\n${personaSummary}`,
        });
    }

    return blocks;
}
