/**
 * 🌟 主动消息 composable
 * 用户离开 >2h 后回访时，角色主动发一条消息到聊天记录
 */
export function useActiveMessage(appState) {
    const { currentRole, messages, globalSettings, showToast } = appState;

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
        // 🧪 调试模式：localStorage.setItem('myai_debug_activeMsg', '1') 后单位变为分钟（2分钟/8分钟）
        const debugMode = !!localStorage.getItem('myai_debug_activeMsg');
        const unit = debugMode ? 60000 : 3600000; // 分钟 or 小时
        const threshold = debugMode ? 2 : 2;        // 触发阈值
        const absenceThreshold = debugMode ? 8 : 8; // 思念日记阈值

        const lastVisit = parseInt(localStorage.getItem('myai_lastVisitTime') || '0');
        if (!lastVisit) {
            console.log('[主动消息] 首次访问，记录时间');
            localStorage.setItem('myai_lastVisitTime', now.toString());
            return false;
        }

        const hoursAway = (now - lastVisit) / unit;
        console.log(`[主动消息] 距上次访问 ${hoursAway.toFixed(2)} ${debugMode ? '分钟' : '小时'}${debugMode ? ' 【调试模式】' : ''}`);
        if (hoursAway < threshold) {
            console.log(`[主动消息] 离开不足 ${threshold} ${debugMode ? '分钟' : '小时'}，跳过`);
            return false;
        }

        // 2. 防重复：每个角色每次回访只触发一次（调试模式下每分钟可重触发）
        const dedupeKey = debugMode
            ? `${new Date().toDateString()}_${new Date().getHours()}h${new Date().getMinutes()}m`
            : new Date().toDateString();
        const todayKey = `myai_activeMsg_${roleId}_${dedupeKey}`;
        if (localStorage.getItem(todayKey)) {
            console.log('[主动消息] 今日已触发过，跳过');
            return false;
        }

        // 3. 需要有聊天记录（空聊天不触发，让欢迎屏展示）
        const msgs = messages.value;  // 分支感知版
        console.log(`[主动消息] 聊天记录条数: ${msgs?.length ?? 'null'}`);
        if (!msgs || msgs.length === 0) {
            console.log('[主动消息] 无聊天记录，跳过');
            return false;
        }

        console.log(`[\u4e3b\u52a8\u6d88\u606f] 离开 ${hoursAway.toFixed(1)} 小时，角色: ${currentRole.value.name}，开始处理...`);

        // 💭 Step 0: 如果离开超过 8 小时，先自动生成一篇思念日记
        // 防重复：每个角色每天只生成一次
        if (hoursAway >= absenceThreshold && diary && globalSettings.apiKey) {
            const absenceKey = `myai_absenceDiary_${roleId}_${dedupeKey}`;
            if (!localStorage.getItem(absenceKey)) {
                const absenceEntry = await diary.generateAbsenceDiary(currentRole.value, hoursAway);
                if (absenceEntry) {
                    localStorage.setItem(absenceKey, '1');
                    console.log(`[思念日记] 已为 ${currentRole.value.name} 生成思念日记`);
                }
            }
        }

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

        // 5. 插入到聊天记录（防重复：如果最后一条已经是主动消息就跳过）
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.isActiveMessage) {
            console.log('[主动消息] 最后一条已是主动消息，跳过插入');
            localStorage.setItem(todayKey, '1');
            localStorage.setItem('myai_lastVisitTime', now.toString());
            return false;
        }
        msgs.push({
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
