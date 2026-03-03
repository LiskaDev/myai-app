import { ref } from 'vue';
import { STORAGE_KEYS } from '../utils/storage';

/**
 * 角色私密日记 composable
 * 生成、存储、读取角色日记
 */
export function useDiary(appState) {
    const { globalSettings, showToast } = appState;
    const isGenerating = ref(false);
    const diaries = ref([]);

    // ============== 存储 ==============
    function loadDiaries() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.DIARIES);
            if (saved) diaries.value = JSON.parse(saved);
        } catch (e) {
            console.warn('加载日记失败', e);
        }
    }

    function saveDiaries() {
        try {
            localStorage.setItem(STORAGE_KEYS.DIARIES, JSON.stringify(diaries.value));
        } catch (e) {
            showToast?.('存储空间已满，无法保存日记');
        }
    }

    // ============== 获取日记 ==============
    function getDiariesForRole(roleId) {
        return diaries.value
            .filter(d => d.roleId === roleId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    function getUnreadDiaries() {
        return diaries.value.filter(d => !d.read);
    }

    function markAsRead(diaryId) {
        const diary = diaries.value.find(d => d.id === diaryId);
        if (diary) {
            diary.read = true;
            saveDiaries();
        }
    }

    function markAllAsRead() {
        diaries.value.forEach(d => { d.read = true; });
        saveDiaries();
    }

    // ============== 生成日记 ==============
    async function generateDiary(role, messages, options = {}) {
        if (isGenerating.value) return null;
        if (!globalSettings.apiKey) {
            showToast?.('请先设置 API Key');
            return null;
        }
        if (!messages || messages.length < 3) {
            showToast?.('对话太短，至少需要 3 条消息才能生成日记');
            return null;
        }

        isGenerating.value = true;

        try {
            // 取最近 30 条消息作为日记素材
            const recentMessages = messages.slice(-30);
            const chatContext = recentMessages.map(m => {
                const speaker = m.role === 'user' ? '用户' : (m.roleName || role.name);
                const content = (m.rawContent || m.content || '').substring(0, 300);
                return `[${speaker}]: ${content}`;
            }).join('\n');

            const userName = options.userName || '用户';
            const isGroup = options.isGroup || false;
            const groupName = options.groupName || '';

            // 📜 日记链：用摘要延续故事线（省 token + 保持长期连贯）
            let prevDiaryContext = '';
            const prevDiaries = diaries.value
                .filter(d => d.roleId === role.id && (isGroup ? d.groupId === options.groupId : !d.groupId))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            if (prevDiaries.length > 0) {
                const prev = prevDiaries[0];
                // 优先用摘要，没有则用内容前100字
                const context = prev.summary || prev.content.slice(0, 100);
                prevDiaryContext = `\n\n【从第一天到上次的故事摘要（请延续）】\n「${context}」`;
            }

            let prompt;
            if (isGroup) {
                prompt = `你是"${role.name}"。以下是今天在群聊"${groupName}"中发生的对话：

${chatContext}${prevDiaryContext}

请以【${role.name}】的第一人称视角，用写私密日记的口吻，总结今天在群里发生的事情，对群里每个人的看法变化，以及你内心真实的感受。
要求：
- 不超过 200 字
- 写得像真正的私密日记，有情感波动
- 可以吐槽、暗恋、吃醋、开心等真实情绪
- 如果上一篇日记中有未完成的目标或计划，请提及进展
- 不要用"作为AI"这类破坏沉浸的词
- 以日期开头，如"X月X日 晴"
- 最后另起一行写 【摘要】从第一天到今天的整体故事线概括（不超过50字，用于下次日记延续）`;
            } else {
                prompt = `你是"${role.name}"。以下是今天你和"${userName}"之间的对话：

${chatContext}${prevDiaryContext}

请以【${role.name}】的第一人称视角，用写私密日记的口吻，总结今天发生的事情以及你对【${userName}】看法的改变。
要求：
- 不超过 200 字
- 写得像真正的私密日记，有情感波动
- 可以吐槽、暗恋、害羞、开心等真实情绪
- 如果上一篇日记中有未完成的目标或计划，请提及进展
- 不要用"作为AI"这类破坏沉浸的词
- 以日期开头，如"X月X日 晴"
- 最后另起一行写 【摘要】从第一天到今天的整体故事线概括（不超过50字，用于下次日记延续）`;
            }

            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const apiUrl = `${baseUrl}/chat/completions`;

            // 使用便宜的模型生成日记
            const model = globalSettings.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (globalSettings.model || 'deepseek-chat');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: `你是一个角色扮演大师。请以"${role.name}"的身份写一篇私密日记。` },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.9,
                    max_tokens: 500,
                    stream: false,
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                throw new Error(`API 错误 ${response.status}`);
            }

            const data = await response.json();
            const rawDiary = data.choices?.[0]?.message?.content?.trim();

            if (!rawDiary) {
                throw new Error('日记内容为空');
            }

            // 📜 解析摘要：从 AI 返回中分离日记正文和【摘要】
            let diaryContent = rawDiary;
            let summary = null;
            const summaryMatch = rawDiary.match(/【摘要】(.+)/s);
            if (summaryMatch) {
                summary = summaryMatch[1].trim().slice(0, 80); // 限制摘要长度
                diaryContent = rawDiary.replace(/\n*【摘要】.+/s, '').trim();
            }

            // 保存日记
            const entry = {
                id: `diary_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                roleId: role.id,
                roleName: role.name,
                roleAvatar: role.avatar || null,
                date: new Date().toISOString(),
                content: diaryContent,
                summary: summary, // 📜 滚动摘要
                read: false,
                groupId: options.groupId || null,
                groupName: groupName || null,
            };

            diaries.value.push(entry);
            saveDiaries();
            showToast?.(`📔 ${role.name}的日记已生成`);
            return entry;

        } catch (e) {
            console.error('生成日记失败:', e);
            showToast?.(`日记生成失败: ${e.message}`);
            return null;
        } finally {
            isGenerating.value = false;
        }
    }

    // 删除日记
    function deleteDiary(diaryId) {
        diaries.value = diaries.value.filter(d => d.id !== diaryId);
        saveDiaries();
    }

    return {
        diaries,
        isGenerating,
        loadDiaries,
        generateDiary,
        getDiariesForRole,
        getUnreadDiaries,
        markAsRead,
        markAllAsRead,
        deleteDiary,
    };
}
