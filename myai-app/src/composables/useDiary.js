import { ref } from 'vue';
import { STORAGE_KEYS } from '../utils/storage';
import { detectRejection } from './modelAdapter.js';
import { useUserPersona } from './useUserPersona.js';

/**
 * 角色私密日记 composable
 * 生成、存储、读取角色日记
 */

/** 日记生成被 AI 拒绝时的占位内容（比静默失败更好的体验） */
function generatePlaceholderDiary(roleName) {
    return `今天……有些事情让我一时不知道该怎么说。\n也许明天会好一些。\n——${roleName}`;
}

/**
 * 将日记正文首行的AI假日期替换为真实日期，保留天气/心情描述
 * 例："11月8日 阴转小雨 ☁️🌧️" → "6月21日 阴转小雨 ☁️🌧️"
 * 只处理第一行，不影响正文其他内容
 * @param {string} content - 日记正文
 * @param {string} isoDateString - 真实创建时间的 ISO 字符串
 */
function replaceFakeDateWithReal(content, isoDateString) {
    if (!content || !isoDateString) return content;
    const lines = content.split('\n');

    // Bug 2: 先去除第一行中的 Markdown 粗体/斜体标记（** 或 *）
    // 否则 "**7月16日 晴**" 无法被后续正则匹配到日期
    let firstLine = lines[0].trim().replace(/\*/g, '');

    const match = firstLine.match(/^(\d{1,2}月\d{1,2}日)(.*)/);
    if (match) {
        // match[1] = AI假日期, match[2] = 天气/心情描述（含前导空格）
        const realDate = new Date(isoDateString);
        const realDateStr = `${realDate.getMonth() + 1}月${realDate.getDate()}日`;
        lines[0] = realDateStr + match[2];
    } else {
        // 不匹配日期格式时，也保留去星号后的首行
        lines[0] = firstLine;
    }
    return lines.join('\n');
}

/**
 * 组装角色自身的人设信息（性格/外貌/说话风格/关系，含性别等线索），
 * 供日记生成时注入 system prompt，避免 AI 凭空猜测角色/用户性别
 */
function buildRolePersonaBlock(role) {
    const parts = [];
    if (role.systemPrompt) parts.push(`【${role.name}的性格与设定】\n${role.systemPrompt}`);
    if (role.appearance) parts.push(`【外貌】\n${role.appearance}`);
    if (role.speakingStyle) parts.push(`【说话风格】\n${role.speakingStyle}`);
    if (role.relationship) parts.push(`【与用户的关系】\n${role.relationship}`);
    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/**
 * 将最近的对话记录格式化为日记素材，供 AI 参考真实剧情
 */
function buildChatContext(role, messages, limit) {
    if (!messages || messages.length === 0) return '';
    return messages.slice(-limit).map(m => {
        const speaker = m.role === 'user' ? '用户' : (m.roleName || role.name);
        const content = (m.rawContent || m.content || '').substring(0, 300);
        return `[${speaker}]: ${content}`;
    }).join('\n');
}

export function useDiary(appState) {
    const { globalSettings, showToast } = appState;
    const { personaSummaryForPrompt } = useUserPersona();
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
            const chatContext = buildChatContext(role, messages, 30);

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

            // 使用主模型生成日记（属于角色扮演互动）
            const model = globalSettings.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (globalSettings.model || 'deepseek-chat');

            const systemPrompt = `你是一个角色扮演大师。请以"${role.name}"的身份写一篇私密日记。${buildRolePersonaBlock(role)}${personaSummaryForPrompt.value || ''}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
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
            const { rejected: diaryRejected } = detectRejection(rawDiary);
            if (diaryRejected) {
                throw new Error('AI 拒绝生成日记内容');
            }

            // 📜 解析摘要：从 AI 返回中分离日记正文和【摘要】
            let diaryContent = rawDiary;
            let summary = null;
            const summaryMatch = rawDiary.match(/【摘要】(.+)/s);
            if (summaryMatch) {
                summary = summaryMatch[1].trim().slice(0, 80); // 限制摘要长度
                diaryContent = rawDiary.replace(/\n*【摘要】.+/s, '').trim();
            }

            // 将 AI 生成的假日期替换为真实日期（保留天气/心情描述）
            const now = new Date().toISOString();
            diaryContent = replaceFakeDateWithReal(diaryContent, now);

            // 保存日记
            const entry = {
                id: `diary_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                roleId: role.id,
                roleName: role.name,
                roleAvatar: role.avatar || null,
                date: now,
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
            if (e.message?.includes('拒绝')) {
                // 生成占位日记，而非静默失败（玩家不会困惑日记消失了）
                console.warn('[Diary] AI 拒绝，生成占位日记');
                const placeholder = generatePlaceholderDiary(role.name);
                const entry = {
                    id: `diary_${Date.now()}_placeholder`,
                    roleId: role.id, roleName: role.name, roleAvatar: role.avatar || null,
                    date: new Date().toISOString(),
                    content: placeholder, summary: null, read: false,
                    groupId: options.groupId || null, groupName: options.groupName || null,
                };
                diaries.value.push(entry);
                saveDiaries();
                showToast?.(`📔 ${role.name}今天的日记有些短`);
                return entry;
            }
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

    /**
     * 💭 生成思念日记（用户长时间不在线时自动触发）
     * 不需要对话素材，基于角色性格和等待情绪生成
     */
    async function generateAbsenceDiary(role, hoursAway, messages = []) {
        if (isGenerating.value) return null;
        if (!globalSettings.apiKey) return null;

        const timeDesc = hoursAway < 24
            ? `${Math.floor(hoursAway)} 小时`
            : `${Math.floor(hoursAway / 24)} 天`;

        // 获取上一篇日记的摘要，保持故事线连贯
        const prevDiaries = diaries.value
            .filter(d => d.roleId === role.id && !d.groupId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        let prevContext = '';
        if (prevDiaries.length > 0) {
            const prev = prevDiaries[0];
            const ctx = prev.summary || prev.content.slice(0, 100);
            prevContext = `\n\n[之前的故事摘要（请延续这条感情线）]
「${ctx}」`;
        }

        // 最近 20 条对话记录，避免日记内容与已发生剧情脱节/矛盾（如角色已学会的事又被写成没学会）
        const chatContext = buildChatContext(role, messages, 20);
        const chatContextBlock = chatContext
            ? `\n\n[最近发生的真实剧情，日记内容不能与此矛盾]\n${chatContext}`
            : '';

        const prompt = `你是“${role.name}”。${chatContextBlock}${prevContext}

用户已经 ${timeDesc} 没有来找你了。请用第一人称写一篇私密日记，记录这段时间一个人等待的心情。
要求：
- 不超过 200 字
- 写得像真正的私密日记，有情感波动
- 可以带着小小的埋怨，但最终是期待对方回来
- 就象真的在独处时会写的日记，自言自语、发呼、小想象
- 以日期开头，如“X月X日 晴”
- 最后另起一行写 [摘要]从第一天到现在的整体故事线概括（不超过50字）`;

        isGenerating.value = true;
        try {
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const model = globalSettings.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (globalSettings.model || 'deepseek-chat');

            const systemPrompt = `你是一个角色扮演大师。请以“${role.name}”的身份写一篇私密日记，用户已经 ${timeDesc} 没有来找 ta 了。${buildRolePersonaBlock(role)}${personaSummaryForPrompt.value || ''}`;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.9,
                    max_tokens: 400,
                    stream: false,
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) throw new Error(`API 错误 ${response.status}`);

            const data = await response.json();
            const rawDiary = data.choices?.[0]?.message?.content?.trim();
            if (!rawDiary) throw new Error('日记内容为空');
            const { rejected: absenceRejected } = detectRejection(rawDiary);
            if (absenceRejected) throw new Error('AI 拒绝生成思念日记');

            let diaryContent = rawDiary;
            let summary = null;
            const summaryMatch = rawDiary.match(/\[摘要\]([\s\S]+)/);
            if (summaryMatch) {
                summary = summaryMatch[1].trim().slice(0, 80);
                diaryContent = rawDiary.replace(/\n*\[摘要\][\s\S]+/, '').trim();
            }

            // 将 AI 生成的假日期替换为真实日期（保留天气/心情描述）
            const now = new Date().toISOString();
            diaryContent = replaceFakeDateWithReal(diaryContent, now);

            const entry = {
                id: `diary_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                roleId: role.id,
                roleName: role.name,
                roleAvatar: role.avatar || null,
                date: now,
                content: diaryContent,
                summary,
                read: false,
                groupId: null,
                groupName: null,
                isAbsenceDiary: true, // 💭 标记为思念日记
            };

            diaries.value.push(entry);
            saveDiaries();
            return entry;
        } catch (e) {
            if (e.message?.includes('拒绝')) {
                console.warn('[思念日记] AI 拒绝，生成占位日记');
                const placeholder = generatePlaceholderDiary(role.name);
                const entry = {
                    id: `diary_${Date.now()}_placeholder`,
                    roleId: role.id, roleName: role.name, roleAvatar: role.avatar || null,
                    date: new Date().toISOString(),
                    content: placeholder, summary: null, read: false,
                    groupId: null, groupName: null, isAbsenceDiary: true,
                };
                diaries.value.push(entry);
                saveDiaries();
                return entry;
            }
            console.warn('[思念日记] 生成失败:', e.message);
            return null;
        } finally {
            isGenerating.value = false;
        }
    }

    return {
        diaries,
        isGenerating,
        loadDiaries,
        generateDiary,
        generateAbsenceDiary,
        getDiariesForRole,
        getUnreadDiaries,
        markAsRead,
        markAllAsRead,
        deleteDiary,
    };
}
