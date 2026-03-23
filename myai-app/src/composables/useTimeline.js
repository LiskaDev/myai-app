/**
 * 📅 剧情时间线记忆 (Plot Timeline)
 *
 * 每 15 轮对话后台分析关键事件，构建时间线。
 * 注入 Prompt 帮助 AI 保持故事连贯性。
 *
 * 数据结构：role.timeline = [
 *   { day: 1, event: "第一次见面", importance: "high", timestamp: ISO }
 * ]
 *
 * 与现有后台任务协调：加全局锁防止并发 LLM 调用。
 */

// ========== 全局后台分析锁 ==========
// 防止 useAutoSummary / useUserPersona / useTimeline 并发调用 LLM
let isBackgroundBusy = false;

export function acquireBackgroundLock() {
    if (isBackgroundBusy) return false;
    isBackgroundBusy = true;
    return true;
}

export function releaseBackgroundLock() {
    isBackgroundBusy = false;
}

export function isBackgroundLocked() {
    return isBackgroundBusy;
}

// ========== Timeline 常量 ==========
const TRIGGER_INTERVAL = 15; // 每 15 条用户消息触发一次
const MAX_TIMELINE_EVENTS = 30; // 最多保留 30 条事件
const TIMELINE_STORAGE_PREFIX = 'myai_timeline_';

// ========== Timeline Composable ==========
export function useTimeline(appState) {
    const {
        globalSettings,
        currentRole,
        currentRoleId,
        messages,
        saveData,
    } = appState;

    /**
     * 检查是否应该触发时间线分析
     * v5.9: 使用持久化计数器 + 锁冲突自动重试
     */
    function checkAndTriggerTimeline() {
        const role = currentRole.value;
        const msgs = messages.value;
        const userMsgCount = msgs.filter(m => m.role === 'user').length;
        const lastAnalyzed = role.timelineAnalyzedCount || 0;

        // 每 TRIGGER_INTERVAL 条用户消息触发
        if (userMsgCount - lastAnalyzed >= TRIGGER_INTERVAL) {
            if (isBackgroundLocked()) {
                // v5.9: 锁被占用（摘要正在运行），10秒后重试
                console.log('[Timeline] 后台繁忙，10秒后重试...');
                setTimeout(() => {
                    checkAndTriggerTimeline();
                }, 10000);
                return;
            }
            analyzeTimeline().catch(err => {
                console.warn('[Timeline] 分析失败:', err.message);
            });
        }
    }

    /**
     * 后台分析时间线事件
     */
    async function analyzeTimeline() {
        // 全局锁：防止和摘要/画像并发
        if (!acquireBackgroundLock()) {
            console.log('[Timeline] 后台繁忙，跳过本次分析');
            return;
        }

        try {
            const role = currentRole.value;
            const msgs = messages.value;
            const userMsgCount = msgs.filter(m => m.role === 'user').length;

            // 取最近 20 条消息用于分析
            const recentMsgs = msgs.slice(-20);
            const dialogueText = recentMsgs
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => {
                    const name = m.role === 'user' ? '用户' : (role.name || '角色');
                    return `${name}: ${m.rawContent || m.content || ''}`;
                })
                .join('\n');

            if (!dialogueText.trim()) {
                role.timelineAnalyzedCount = userMsgCount;
                if (saveData) saveData();
                return;
            }

            const existingTimeline = role.timeline || [];
            const existingEvents = existingTimeline
                .slice(-5)
                .map(e => e.event)
                .join('；');

            const prompt = buildTimelinePrompt(dialogueText, role.name, existingEvents);

            const baseUrl = (globalSettings.bgBaseUrl || globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const apiKey = globalSettings.bgApiKey || globalSettings.apiKey;
            const model = globalSettings.bgModel || globalSettings.model || 'deepseek-chat';

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 400,
                    temperature: 0.3,
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                throw new Error(`Timeline API 错误 ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();

            if (!content) {
                role.timelineAnalyzedCount = userMsgCount;
                if (saveData) saveData();
                return;
            }

            // 解析返回的事件列表
            const newEvents = parseTimelineEvents(content);

            if (newEvents.length > 0) {
                // 合并到角色数据
                if (!role.timeline) role.timeline = [];
                role.timeline.push(...newEvents);

                // 限制总数
                if (role.timeline.length > MAX_TIMELINE_EVENTS) {
                    role.timeline = role.timeline.slice(-MAX_TIMELINE_EVENTS);
                }

                console.log(`[Timeline] 提取了 ${newEvents.length} 条新事件，总计 ${role.timeline.length} 条`);
            }

            // v5.9: 持久化计数器（保存在 role 上，刷新不丢失）
            role.timelineAnalyzedCount = userMsgCount;
            if (saveData) saveData();

        } finally {
            releaseBackgroundLock();
        }
    }

    /**
     * 获取当前角色的时间线（用于 UI 显示）
     */
    function getTimeline() {
        return currentRole.value?.timeline || [];
    }

    /**
     * 删除一条时间线事件
     */
    function removeTimelineEvent(index) {
        const timeline = currentRole.value?.timeline;
        if (timeline && index >= 0 && index < timeline.length) {
            timeline.splice(index, 1);
        }
    }

    /**
     * 清空时间线
     */
    function clearTimeline() {
        if (currentRole.value) {
            currentRole.value.timeline = [];
        }
    }

    /**
     * 构建时间线注入 Prompt（给 usePromptBuilder 用）
     */
    function buildTimelineForPrompt() {
        const timeline = currentRole.value?.timeline;
        if (!timeline || timeline.length === 0) return '';

        const events = timeline
            .map((e, i) => {
                const imp = e.importance === 'high' ? '⚡' : (e.importance === 'medium' ? '📌' : '·');
                return `${imp} ${e.event}`;
            })
            .join('\n');

        return `[剧情时间线 - 故事中已发生的重要事件，请保持连贯]\n${events}`;
    }

    return {
        checkAndTriggerTimeline,
        analyzeTimeline,
        getTimeline,
        removeTimelineEvent,
        clearTimeline,
        buildTimelineForPrompt,
    };
}

// ========== Prompt & 解析工具 ==========

/**
 * 构建时间线分析 Prompt
 */
export function buildTimelinePrompt(dialogueText, roleName, existingEvents) {
    return `你是一位剧情分析师。分析以下角色扮演对话，提取1~3条关键剧情事件。

要求：
1. 只提取重要事件：关系转折、情感高潮、重大决定、新发现
2. 跳过日常闲聊和无意义对话
3. 如果对话中没有重要事件，返回"无"
4. 每条事件一行，格式：重要程度|事件描述
   重要程度：high/medium/low
5. 不要重复已有事件

角色名：${roleName}
${existingEvents ? `已有事件：${existingEvents}` : ''}

最近对话：
${dialogueText}`;
}

/**
 * 解析 LLM 返回的时间线事件
 */
export function parseTimelineEvents(text) {
    if (!text || text.includes('无') && text.length < 10) return [];

    const events = [];
    const lines = text.split('\n').filter(l => l.trim());

    for (const line of lines) {
        const cleaned = line.replace(/^[\d.)\-*·⚡📌\s]+/, '').trim();
        if (!cleaned || cleaned === '无') continue;

        // 尝试解析 "importance|event" 格式
        const pipeMatch = cleaned.match(/^(high|medium|low)\|(.+)/i);
        if (pipeMatch) {
            events.push({
                importance: pipeMatch[1].toLowerCase(),
                event: pipeMatch[2].trim(),
                timestamp: new Date().toISOString(),
            });
        } else if (cleaned.length > 5 && cleaned.length < 200) {
            // 无格式但有内容
            events.push({
                importance: 'medium',
                event: cleaned,
                timestamp: new Date().toISOString(),
            });
        }
    }

    return events.slice(0, 3); // 最多 3 条
}
