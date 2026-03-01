/**
 * 🌟 主动消息 composable
 * 用户离开 >2h 后回访时，角色主动发一条消息到聊天记录
 */
export function useActiveMessage(appState) {
    const { currentRole, globalSettings, showToast } = appState;

    // 模板消息池（按风格分组）
    const TEMPLATES = {
        default: [
            '好久不见，我一直在这里等你 ✨',
            '你终于来了…我还以为你把我忘了 🥺',
            '嗯？你来了。*抬头看了你一眼* 😊',
        ],
        long: [
            '这些天没见到你，我都在想你过得怎么样了…下次别消失这么久好不好？💕',
            '你不在的时候，这里好安静啊。不过没关系，你回来就好了 ✨',
        ],
    };

    /**
     * 检查是否需要发送主动消息，如果需要则插入一条
     * @param {Object} diary - useDiary 实例，可选
     * @returns {boolean} 是否发送了主动消息
     */
    async function checkAndSend(diary = null) {
        if (!currentRole.value) return false;

        const roleId = currentRole.value.id;
        const now = Date.now();

        // 1. 检查离开时长
        const lastVisit = parseInt(localStorage.getItem('myai_lastVisitTime') || '0');
        if (!lastVisit) {
            localStorage.setItem('myai_lastVisitTime', now.toString());
            return false;
        }

        const hoursAway = (now - lastVisit) / 3600000;
        if (hoursAway < 2) return false;

        // 2. 防重复：每个角色每次回访只触发一次
        const todayKey = `myai_activeMsg_${roleId}_${new Date().toDateString()}`;
        if (localStorage.getItem(todayKey)) return false;

        // 3. 需要有聊天记录（空聊天不触发，让欢迎屏展示）
        const messages = currentRole.value.chatHistory;
        if (!messages || messages.length === 0) return false;

        // 4. 生成消息内容
        let content = '';
        const roleName = currentRole.value.name || 'AI';

        // 优先级 A: 有未读日记
        if (diary) {
            const unread = diary.getDiariesForRole(roleId).filter(d => !d.read);
            if (unread.length > 0) {
                const snippet = unread[0].content.slice(0, 40).replace(/\n/g, ' ');
                content = `📔 我写了一篇日记，等你来看哦…\n\n*「${snippet}…」*`;
            }
        }

        // 优先级 B: 用 API 生成角色语气的关怀消息
        if (!content && globalSettings.apiKey) {
            content = await generateActiveMessage(roleName, hoursAway);
        }

        // 优先级 C: 模板消息
        if (!content) {
            const pool = hoursAway > 24 ? TEMPLATES.long : TEMPLATES.default;
            content = pool[Math.floor(Math.random() * pool.length)];
        }

        // 5. 插入到聊天记录
        messages.push({
            role: 'assistant',
            content: content,
            rawContent: content,
            isActiveMessage: true,
            timestamp: now,
        });

        // 6. 标记已触发
        localStorage.setItem(todayKey, '1');
        // 更新访问时间
        localStorage.setItem('myai_lastVisitTime', now.toString());

        // 🛡️ 持久化：确保主动消息不会因刷新丢失
        if (appState.saveData) {
            appState.saveData();
        }

        return true;
    }

    /**
     * 用 API 生成角色语气的关怀消息
     */
    async function generateActiveMessage(roleName, hoursAway) {
        try {
            const role = currentRole.value;
            const timeDesc = hoursAway < 24
                ? `${Math.floor(hoursAway)} 小时`
                : `${Math.floor(hoursAway / 24)} 天`;

            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const model = globalSettings.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (globalSettings.model || 'deepseek-chat');

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'system',
                            content: `你是"${roleName}"。${role.systemPrompt ? '你的性格：' + role.systemPrompt.slice(0, 200) : ''}
${role.speakingStyle ? '说话风格：' + role.speakingStyle : ''}
${role.relationship ? '和用户的关系：' + role.relationship : ''}`
                        },
                        {
                            role: 'user',
                            content: `用户已经 ${timeDesc} 没来找你了，现在用户刚回来打开了对话。请以你的角色身份写一句主动关怀的话，像你真的等了 ta 很久一样。
要求：
- 不超过 50 个中文字
- 符合你的性格和说话风格
- 自然地使用 1-2 个 emoji
- 不要说"作为AI"这类话
- 直接写角色说的话，不要加引号`
                        }
                    ],
                    temperature: 1.0,
                    max_tokens: 100,
                    stream: false,
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) return '';

            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim() || '';
        } catch (e) {
            console.warn('[ActiveMessage] API 生成失败，使用模板', e.message);
            return '';
        }
    }

    return { checkAndSend };
}
