import { ref, computed } from 'vue';
import { generateUUID } from '../utils/uuid';
import { STORAGE_KEYS } from '../utils/storage';
import { parseDualLayerResponse, formatRoleplayText } from '../utils/textParser';
import {
    initMatrix,
    syncMatrix,
    buildRelationshipHint,
    analyzeAndUpdate,
    getAffinity,
    setAffinity,
} from './useRelationship';

const FETCH_TIMEOUT_MS = 60000; // 群聊超时 60s（多角色需要更长时间）

// Callback for per-role completion (e.g. sound effects)
let onRoleComplete = null;

/**
 * 群聊核心组合式函数
 */
export function useGroupChat(appState) {
    const {
        globalSettings,
        roleList,
        showToast,
        showSidebar,
        showConfirmModal,
    } = appState;

    // ============== 群聊状态 ==============
    const groupChats = ref([]);
    const currentGroupId = ref(null);
    const isGroupMode = ref(false);
    const isGroupStreaming = ref(false);
    const currentSpeakingRole = ref(null); // 当前正在说话的角色名
    const groupAbortController = ref(null);
    let isGroupSummarizing = false; // 防止重复触发群聊摘要
    const subconsciousThoughts = ref({}); // { [roleId]: { thought, roleName, timestamp } }

    // 当前群聊
    const currentGroup = computed(() => {
        return groupChats.value.find(g => g.id === currentGroupId.value) || null;
    });

    // 当前群聊消息
    const groupMessages = computed({
        get: () => currentGroup.value?.chatHistory || [],
        set: (value) => {
            const group = groupChats.value.find(g => g.id === currentGroupId.value);
            if (group) {
                group.chatHistory = value;
            }
        }
    });

    // 获取参与角色的完整信息
    const participants = computed(() => {
        if (!currentGroup.value) return [];
        return currentGroup.value.participantIds
            .map(id => roleList.value.find(r => r.id === id))
            .filter(Boolean);
    });

    // ============== 存储 ==============
    function saveGroups() {
        try {
            localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groupChats.value));
        } catch (e) {
            const msg = (e.name === 'QuotaExceededError' || e.code === 22)
                ? '存储空间已满' : '保存群聊失败';
            showToast(msg, 'error');
        }
    }

    function loadGroups() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.GROUPS);
            if (saved) {
                groupChats.value = JSON.parse(saved);
            }
            // 恢复群聊会话状态
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            if (session.isGroupMode && session.currentGroupId) {
                const groupExists = groupChats.value.find(g => g.id === session.currentGroupId);
                if (groupExists) {
                    currentGroupId.value = session.currentGroupId;
                    isGroupMode.value = true;
                }
            }
        } catch (e) {
            showToast('加载群聊数据失败', 'error');
        }
    }

    // ============== 群聊管理 ==============
    function createGroupChat(name, participantIds, description = '') {
        if (participantIds.length < 2) {
            showToast('至少需要选择 2 个角色', 'error');
            return null;
        }

        const group = {
            id: generateUUID(),
            name: name || '群聊',
            description: description || '',
            genre: '',        // 剧本基调：校园恋爱/搞笑日常/废土生存 等
            model: '',       // 空 = 用全局设置
            responseLength: '',  // 空 = 跟随角色设置, short/normal/long/novel
            participantIds,
            chatHistory: [],
            relationshipMatrix: initMatrix(participantIds),  // v5.2: 关系矩阵
            roundCount: 0,                // 潜意识轮次计数
            subconsciousThoughts: {},     // { [roleId]: { thought, roleName, timestamp } }
            createdAt: new Date().toISOString(),
        };

        groupChats.value.push(group);
        saveGroups();
        showToast(`群聊"${group.name}"已创建`);
        return group;
    }

    function deleteGroupChat(groupId) {
        const group = groupChats.value.find(g => g.id === groupId);
        if (!group) return;

        showConfirmModal({
            title: '删除群聊',
            message: `确定要删除群聊 "${group.name}" 吗？\n所有聊天记录将被清除。`,
            isDangerous: true,
            onConfirm: () => {
                const index = groupChats.value.findIndex(g => g.id === groupId);
                if (index !== -1) {
                    groupChats.value.splice(index, 1);
                    if (currentGroupId.value === groupId) {
                        isGroupMode.value = false;
                        currentGroupId.value = null;
                    }
                    saveGroups();
                    showToast('群聊已删除');
                }
            },
        });
    }

    function switchToGroup(groupId) {
        currentGroupId.value = groupId;
        isGroupMode.value = true;
        showSidebar.value = false;
        // 保存群聊会话状态
        try {
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            session.isGroupMode = true;
            session.currentGroupId = groupId;
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        } catch { /* ignore */ }
    }

    function exitGroupMode() {
        isGroupMode.value = false;
        currentGroupId.value = null;
        // 清除群聊会话状态
        try {
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            session.isGroupMode = false;
            session.currentGroupId = null;
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        } catch { /* ignore */ }
    }

    // ============== 发送消息 ==============
    function sendDirectorMessage(content) {
        if (!content.trim() || !currentGroup.value) return;

        const trimmed = content.trim();

        groupMessages.value.push({
            role: 'director',
            content: trimmed,
            timestamp: Date.now(),
        });

        saveGroups();

        // @ 提及解析：如果导演消息中 @了某角色，自动让该角色回复
        const mentionMatch = trimmed.match(/@(\S+)/);
        if (mentionMatch) {
            const mentionedName = mentionMatch[1];
            const mentionedRole = participants.value.find(
                r => r.name === mentionedName
            );
            if (mentionedRole) {
                speakAsRole(mentionedRole.id);
                return;
            }
        }

        // 没有 @ 提及 → 自动触发全员一轮
        continueOneRound();
    }

    // ============== 核心：继续一轮 ==============
    async function continueOneRound() {
        if (isGroupStreaming.value || !currentGroup.value) return;
        if (!globalSettings.apiKey) {
            showToast('请先在设置中配置 API Key', 'error');
            return;
        }

        const activeParticipants = [...participants.value];
        if (activeParticipants.length === 0) {
            showToast('群聊中没有有效角色', 'error');
            return;
        }

        // 洗牌：随机打乱发言顺序
        for (let i = activeParticipants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [activeParticipants[i], activeParticipants[j]] = [activeParticipants[j], activeParticipants[i]];
        }

        isGroupStreaming.value = true;

        try {
            for (const role of activeParticipants) {
                currentSpeakingRole.value = role.name;

                await generateRoleResponse(role);

                // Notify per-role completion (for sound effects, etc.)
                if (onRoleComplete) onRoleComplete(role);

                // 检查是否被中止
                if (!isGroupStreaming.value) break;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                const errorMsg = error.name === 'TimeoutError'
                    ? '请求超时，请检查网络' : `错误: ${error.message}`;
                showToast(errorMsg, 'error');
            }
        } finally {
            isGroupStreaming.value = false;
            currentSpeakingRole.value = null;
            groupAbortController.value = null;
            // 一轮结束后检查是否需要自动总结
            checkGroupSummary();
            // 检查是否所有角色都 PASS 了（剧情卡壳，触发影子导演）
            checkAutoDirector();
            // v5.2: 一轮结束后分析对话更新关系矩阵
            analyzeRelationships();
            // v5.3: 潜意识思想生成（每 3 轮）
            generateSubconsciousThoughts();
        }
    }

    // 让单个角色发言（💬 按钮）
    async function speakAsRole(roleId) {
        if (isGroupStreaming.value || !currentGroup.value) return;
        if (!globalSettings.apiKey) {
            showToast('请先在设置中配置 API Key', 'error');
            return;
        }

        const role = participants.value.find(r => r.id === roleId);
        if (!role) {
            showToast('角色未找到', 'error');
            return;
        }

        isGroupStreaming.value = true;
        currentSpeakingRole.value = role.name;

        try {
            await generateRoleResponse(role);
        } catch (error) {
            if (error.name !== 'AbortError') {
                const errorMsg = error.name === 'TimeoutError'
                    ? '请求超时，请检查网络' : `错误: ${error.message}`;
                showToast(errorMsg, 'error');
            }
        } finally {
            isGroupStreaming.value = false;
            currentSpeakingRole.value = null;
            groupAbortController.value = null;
            checkGroupSummary();
        }
    }

    // 为单个角色生成回复
    async function generateRoleResponse(role) {
        const apiMessages = buildGroupPrompt(role);

        const group = currentGroup.value;
        const model = group?.model || globalSettings.model || 'deepseek-reasoner';
        const isReasoner = model.includes('reasoner');

        // 回复长度优先级：群聊设置 > 角色设置 > 默认
        const lengthSetting = group?.responseLength || '';
        const LENGTH_TO_TOKENS = { short: 500, normal: 1000, long: 2000, novel: 4000 };
        const maxTokens = lengthSetting && LENGTH_TO_TOKENS[lengthSetting]
            ? LENGTH_TO_TOKENS[lengthSetting]
            : (role.maxTokens || 2000);

        // 创建 AbortController
        groupAbortController.value = new AbortController();
        const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
        const combinedSignal = AbortSignal.any([
            groupAbortController.value.signal,
            timeoutSignal,
        ]);

        const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
        const apiUrl = `${baseUrl}/chat/completions`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${globalSettings.apiKey}`,
            },
            body: JSON.stringify({
                model: model,
                messages: apiMessages,
                temperature: role.temperature || 1.0,
                max_tokens: maxTokens,
                stream: true,
            }),
            signal: combinedSignal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 错误 ${response.status}: ${errorText}`);
        }

        // 添加占位消息
        const assistantMessage = {
            role: 'assistant',
            roleId: role.id,
            roleName: role.name,
            avatar: role.avatar || '',
            content: '',
            rawContent: '',
            thinking: '',
            thinkingComplete: false,
            timestamp: Date.now(),
        };
        groupMessages.value.push(assistantMessage);
        const msgIndex = groupMessages.value.length - 1;

        // 流式读取
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';
        let fullThinking = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                const data = trimmedLine.slice(6);
                if (data === '[DONE]') break;

                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta?.content;
                    const reasoningDelta = json.choices?.[0]?.delta?.reasoning_content;

                    if (reasoningDelta) {
                        fullThinking += reasoningDelta;
                        groupMessages.value[msgIndex].thinking = fullThinking;
                    }

                    if (delta) {
                        fullContent += delta;
                        groupMessages.value[msgIndex].rawContent = fullContent;

                        const parsed = parseDualLayerResponse(fullContent);

                        if (parsed.reasoning && !fullThinking) {
                            groupMessages.value[msgIndex].thinking = parsed.reasoning;
                        }

                        if (fullContent.includes('</think>')) {
                            groupMessages.value[msgIndex].thinkingComplete = true;
                        }

                        groupMessages.value[msgIndex].content = parsed.content;
                        groupMessages.value[msgIndex].inner = parsed.inner;
                    }
                } catch (e) {
                    // Ignore parse errors in stream
                }
            }
        }

        // 完成后处理
        if (groupMessages.value[msgIndex].thinking) {
            groupMessages.value[msgIndex].thinkingComplete = true;
        }

        groupMessages.value[msgIndex].rawContent = fullContent;

        // [PASS] 弃权机制：如果角色回复了 [PASS]，删掉占位消息
        const cleanContent = fullContent
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<inner>[\s\S]*?<\/inner>/g, '')
            .trim();
        if (cleanContent === '[PASS]' || cleanContent === 'PASS') {
            // 转为 pass 类型消息（UI 会折叠显示）
            groupMessages.value[msgIndex] = {
                role: 'pass',
                roleId: role.id,
                roleName: role.name,
                avatar: role.avatar || '',
                timestamp: Date.now(),
            };
            saveGroups();
            return;
        }

        // Fallback
        if (!groupMessages.value[msgIndex].content && fullContent) {
            let fallback = fullContent
                .replace(/<think>[\s\S]*$/, '')
                .replace(/<inner>[\s\S]*$/, '')
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<inner>[\s\S]*?<\/inner>/g, '')
                .trim();

            groupMessages.value[msgIndex].content = fallback
                ? formatRoleplayText(fallback)
                : '(内容生成中断，请重试)';
        }

        saveGroups();
    }

    // ============== AI 影子导演 (Shadow Director) ==============

    /**
     * 检查最近一轮是否所有角色都 PASS 了（剧情卡壳）
     * 如果是，自动触发影子导演生成情境事件
     */
    function checkAutoDirector() {
        const group = currentGroup.value;
        if (!group || group.chatHistory.length < 2) return;

        const participantCount = group.participantIds.length;
        if (participantCount === 0) return;

        // 取最后 N 条（N = 参与者数量），检查是否全是 pass
        const tail = group.chatHistory.slice(-participantCount);
        const allPass = tail.length === participantCount &&
            tail.every(m => m.role === 'pass');

        if (allPass) {
            generateDirectorEvent();
        }
    }

    /**
     * AI 影子导演：读取近期对话 + genre，生成一个符合剧情的情境事件
     * 返回后自动注入为 world-event
     */
    async function generateDirectorEvent(forceGenerate = false) {
        const group = currentGroup.value;
        if (!group || isGroupStreaming.value) return;
        if (!globalSettings.apiKey) {
            showToast('请先配置 API Key', 'error');
            return;
        }

        const allParticipants = participants.value;
        const participantNames = allParticipants.map(r => r.name).join('\u3001');
        const genreText = group.genre || '自由发挥';
        const descText = group.description || '无特定主题';

        // 取最近的对话历史用于上下文
        const recentChat = group.chatHistory
            .filter(m => ['director', 'assistant', 'world-event', 'pass'].includes(m.role))
            .slice(-15)
            .map(m => {
                if (m.role === 'director') return `[\u5bfc\u6f14]: ${m.content}`;
                if (m.role === 'assistant') return `[${m.roleName}]: ${m.content}`;
                if (m.role === 'world-event') return `[\u4e16\u754c\u4e8b\u4ef6]: ${m.content}`;
                if (m.role === 'pass') return `[${m.roleName} \u9009\u62e9\u4e86\u8df3\u8fc7]`;
                return '';
            })
            .filter(Boolean)
            .join('\n');

        const baseRules = `严格规则：
1. 绝对不能破坏当前的剧本基调（如果在谈恋爱，不要出现科幻或恐怖元素）
2. 事件必须与刚刚讨论的话题、或某个角色的发言有弱关联
3. 不要太夸张，可以是：一个动作、一个环境变化、一个路人的出现、一个巧合、一个意外的声音
4. 以第三人称旁白的形式输出，语言生动、简洁（不超过80字）
5. 不要用引号包裹整个输出`;

        const nullRule = forceGenerate
            ? `\n6. 【重要】导演已手动请求生成事件！你 **绝对不允许** 回复 NULL！无论如何都必须生成一个有趣的突发事件！这是强制命令！`
            : `\n6. 如果你觉得当前对话正处于高潮或不需要干预，请只回复 NULL`;

        const directorSystemPrompt = `你现在是这个群聊的"影子导演"（DM/主持人）。
你的职责是根据当前对话上下文，生成一个微小但能推动剧情、制造话题或改变氛围的突发事件。

当前群聊信息：
- 群聊名称：${group.name}
- 剧本基调：${genreText}
- 群聊主题：${descText}
- 参与角色：${participantNames}

${baseRules}${nullRule}`;

        const userPrompt = `\u6700\u8fd1\u7684\u5bf9\u8bdd\u8bb0\u5f55\uff1a
${recentChat || '\uff08\u6682\u65e0\u5bf9\u8bdd\u8bb0\u5f55\uff09'}

\u8bf7\u6839\u636e\u4ee5\u4e0a\u5bf9\u8bdd\u548c\u5267\u672c\u57fa\u8c03\u201c${genreText}\u201d\uff0c\u751f\u6210\u4e00\u4e2a\u6070\u5230\u597d\u5904\u7684\u7a81\u53d1\u4e8b\u4ef6\u3002`;

        try {
            isGroupStreaming.value = true;
            currentSpeakingRole.value = '\ud83c\udfac \u5f71\u5b50\u5bfc\u6f14';

            const model = group.model || globalSettings.model || 'deepseek-chat';
            const baseUrl = globalSettings.baseUrl || 'https://api.deepseek.com';

            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: directorSystemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 200,
                    temperature: 0.9,
                }),
            });

            if (!response.ok) {
                throw new Error(`API \u9519\u8bef: ${response.status}`);
            }

            const data = await response.json();
            let eventText = data.choices?.[0]?.message?.content?.trim();

            // When forceGenerate, skip NULL check — user explicitly wants an event
            if (!forceGenerate && (!eventText || eventText === 'NULL' || eventText.toUpperCase() === 'NULL')) {
                showToast('\ud83c\udfac \u5f71\u5b50\u5bfc\u6f14\u5224\u65ad\uff1a\u5f53\u524d\u5267\u60c5\u53d1\u5c55\u826f\u597d\uff0c\u65e0\u9700\u5e72\u9884', 'info');
                return;
            }

            // If forceGenerate but AI still returned NULL/empty, generate a fallback
            if (!eventText || eventText.toUpperCase() === 'NULL') {
                eventText = '\u4e0d\u77e5\u4ece\u54ea\u91cc\u4f20\u6765\u4e00\u58f0\u6e05\u810e\u7684\u58f0\u54cd\uff0c\u6240\u6709\u4eba\u90fd\u4e0d\u7ea6\u800c\u540c\u5730\u505c\u4e0b\u4e86\u52a8\u4f5c\uff0c\u9762\u9762\u76f8\u89d1\u3002';
            }

            // 注入为世界事件
            const eventMsg = {
                role: 'world-event',
                content: eventText,
                timestamp: Date.now(),
                source: 'ai-director',
            };

            group.chatHistory.push(eventMsg);
            saveGroups();
            showToast('\ud83c\udfac \u5f71\u5b50\u5bfc\u6f14\u6ce8\u5165\u4e86\u4e00\u4e2a\u60c5\u5883\u4e8b\u4ef6\uff01');

        } catch (error) {
            showToast(`\u5f71\u5b50\u5bfc\u6f14\u51fa\u9519: ${error.message}`, 'error');
        } finally {
            isGroupStreaming.value = false;
            currentSpeakingRole.value = null;
        }
    }


    // ============== 群聊自动摘要 ==============

    /**
     * 检查是否需要触发群聊自动摘要
     * 当 chatHistory 长度超过 memoryWindow * 2 时触发
     */
    function checkGroupSummary() {
        const group = currentGroup.value;
        if (!group || isGroupSummarizing) return;

        // 取第一个参与角色的 memoryWindow 作为基准
        const firstRole = participants.value[0];
        const windowSize = firstRole?.memoryWindow || 15;
        const threshold = windowSize * 2;

        if (group.chatHistory.length >= threshold) {
            generateGroupSummary().catch(err => {
                console.warn('[GroupSummary] 自动摘要失败:', err.message);
            });
        }
    }

    /**
     * 生成群聊自动摘要
     * 将超出窗口的消息压缩成摘要，只保留最近 N 条
     */
    async function generateGroupSummary() {
        if (isGroupSummarizing) return;
        isGroupSummarizing = true;

        try {
            const group = currentGroup.value;
            if (!group) return;

            const firstRole = participants.value[0];
            const windowSize = firstRole?.memoryWindow || 15;

            if (group.chatHistory.length <= windowSize) return;

            // 分割：需要压缩的 vs 保留的
            const splitIndex = group.chatHistory.length - windowSize;
            const toSummarize = group.chatHistory.slice(0, splitIndex);
            const toKeep = group.chatHistory.slice(splitIndex);

            if (toSummarize.length === 0) return;

            console.log(`[GroupSummary] 正在压缩 ${toSummarize.length} 条群聊消息...`);

            // 构建摘要 prompt
            const dialogueText = toSummarize.map(msg => {
                const speaker = msg.role === 'director' ? '导演'
                    : (msg.roleName || '未知');
                const content = (msg.rawContent || msg.content || '').slice(0, 300);
                return `${speaker}: ${content}`;
            }).join('\n');

            const existingSummary = group.autoSummary || '';
            const participantNames = participants.value.map(r => r.name).join('、');

            const summaryPrompt = `你是一个群聊记录摘要助手。请将以下群聊对话压缩成简洁的叙事摘要。

${existingSummary ? `【已有历史摘要】\n${existingSummary}\n\n` : ''}【群聊名称】${group.name}
【参与角色】${participantNames}
【需要压缩的新对话】
${dialogueText}

【摘要要求】
1. 第三人称叙述，概括群聊中发生的关键事件
2. 保留重要的互动和关系变化
3. 记录讨论的关键话题和结论
4. 控制在 200 字以内
5. 如果有已有摘要，将新内容整合进去，保持连贯

请直接输出摘要，不要加任何前缀或解释：`;

            // 使用便宜的模型做摘要
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: summaryPrompt }],
                    max_tokens: 500,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) {
                throw new Error(`摘要请求失败: ${response.status}`);
            }

            const data = await response.json();
            const newSummary = data.choices?.[0]?.message?.content?.trim();

            if (newSummary) {
                group.autoSummary = newSummary;
                group.chatHistory = toKeep;
                saveGroups();

                console.log(`[GroupSummary] 摘要完成，保留 ${toKeep.length} 条消息`);
                showToast('💾 群聊记忆已自动压缩', 'info');
            }
        } catch (error) {
            console.warn('[GroupSummary] 摘要失败:', error.message);
        } finally {
            isGroupSummarizing = false;
        }
    }

    /**
     * 构建群聊 Prompt
     * 关键：将 director → user, 其他 AI → user（带名字前缀）
     */
    function buildGroupPrompt(targetRole) {
        const apiMessages = [];
        const group = currentGroup.value;
        if (!group) return apiMessages;

        // 获取所有参与角色的名字
        const allParticipants = participants.value;
        const otherNames = allParticipants
            .filter(r => r.id !== targetRole.id)
            .map(r => r.name)
            .join('、');

        // System Prompt: 角色设定 + 群聊环境
        const topicLine = group.description
            ? `\n群聊主题/背景：${group.description}`
            : '';
        const genreLine = group.genre
            ? `\n剧本基调：${group.genre}`
            : '';

        // 根据 responseLength 语义设置动态调整回复长度指导
        const effectiveLength = group.responseLength || '';

        let lengthGuidance;
        let frameworkLengthHint = '';
        if (effectiveLength === 'novel') {
            lengthGuidance = '【重要：回复长度要求】你必须写出详细、丰富的长回复。每次回复至少写4-6段（300字以上），包含：详细的动作描写、表情变化、心理活动、环境互动和对话。禁止只写一两句话';
            frameworkLengthHint = '\nIMPORTANT: Write LONG, DETAILED responses (at least 300+ characters). Include actions, emotions, descriptions. Short replies are NOT acceptable.';
        } else if (effectiveLength === 'long') {
            lengthGuidance = '【重要：回复长度要求】每次回复请写2-4段（150字以上），包含动作描写、表情或心理活动和对话，不要只写一两句简短的话';
            frameworkLengthHint = '\nIMPORTANT: Write moderately detailed responses (at least 150+ characters). Include actions and dialogue. Do NOT write just one short sentence.';
        } else if (effectiveLength === 'normal') {
            lengthGuidance = '每次回复写1-2段，包含一些动作或表情描写';
        } else if (effectiveLength === 'short') {
            lengthGuidance = '简洁有力，不要长篇大论（群聊节奏要快）';
        } else {
            // 跟随角色设置 / 默认：不添加特别强的长度约束
            lengthGuidance = '根据剧情需要，自然地回复，不要太长也不要太短';
        }

        // 从角色设定中提取性格关键词用于强化提醒
        const personalitySummary = targetRole.systemPrompt
            ? targetRole.systemPrompt.slice(0, 200)
            : '';

        const personalityReminder = personalitySummary
            ? `\n6. 【性格强化】你必须始终体现「${targetRole.name}」的核心性格特征。绝对不能变成一个温和、友善的通用角色。你的每一句话、每一个动作都要符合你的人设`
            : '';

        const groupContext = `[群聊模式] 你现在在群聊"${group.name}"中。${topicLine}${genreLine}
群聊成员：${allParticipants.map(r => r.name).join('、')}。
你是「${targetRole.name}」。其他角色：${otherNames}。
用户是导演/主持人，负责引导话题。

注意事项：
1. 始终以「${targetRole.name}」的身份和语气回复
2. 你可以回应其他角色的发言，也可以主动发起新话题
3. 保持对话自然，像真正的群聊一样
4. ${lengthGuidance}
5. 如果当前话题与你无关，或者你没什么想补充的，请直接只回复 [PASS]（不要加任何其他内容）${personalityReminder}`;

        // Roleplay framework
        apiMessages.push({
            role: 'system',
            content: `[ROLEPLAY FRAMEWORK - GROUP CHAT MODE]
You are participating in a multi-character group chat. Stay in character as "${targetRole.name}" at ALL times.
Never break character. Use *asterisks* for actions, "quotes" for dialogue.${frameworkLengthHint}
Your personality and speaking style MUST be consistent with your character settings. Do NOT become generic or polite if your character is not.
Begin EVERY reply with an expression tag: <expr:EMOTION> (joy/sad/angry/blush/surprise/scared/smirk/neutral)
[/ROLEPLAY FRAMEWORK]`,
        });

        // 角色本身的 system prompt
        if (targetRole.systemPrompt) {
            apiMessages.push({
                role: 'system',
                content: `[CHARACTER DEFINITION - ${targetRole.name}]\n${targetRole.systemPrompt}\n[/CHARACTER DEFINITION]\n\n重要：以上是你的核心人设，你的所有回复都必须严格符合这个性格设定。`,
            });
        }

        // 群聊环境
        apiMessages.push({
            role: 'system',
            content: groupContext,
        });

        // 注入角色深度字段
        if (targetRole.styleGuide) {
            apiMessages.push({ role: 'system', content: `[风格指导] ${targetRole.styleGuide}` });
        }
        if (targetRole.appearance) {
            apiMessages.push({ role: 'system', content: `[Appearance] ${targetRole.appearance}` });
        }
        // v5.2: 注入关系矩阵提示
        if (group.relationshipMatrix) {
            const relationHint = buildRelationshipHint(
                targetRole.id,
                group.relationshipMatrix,
                allParticipants
            );
            if (relationHint) {
                apiMessages.push({
                    role: 'system',
                    content: relationHint,
                });
            }
        }

        if (targetRole.speakingStyle) {
            apiMessages.push({ role: 'system', content: `[Style] ${targetRole.speakingStyle}` });
        }

        // 注入群聊摘要（如果有）
        if (group.autoSummary) {
            apiMessages.push({
                role: 'system',
                content: `[群聊历史摘要]\n${group.autoSummary}\n[/群聊历史摘要]`,
            });
        }

        // 上下文窗口：只取最近 N 条消息
        const windowSize = targetRole.memoryWindow || 15;
        const recentMessages = group.chatHistory.slice(-windowSize);

        // 关键：映射消息角色
        for (const msg of recentMessages) {
            if (msg.role === 'director') {
                // 导演消息 → user
                apiMessages.push({
                    role: 'user',
                    content: `[导演]: ${msg.content}`,
                });
            } else if (msg.role === 'world-event') {
                // 世界事件 → system（所有角色都能感知）
                apiMessages.push({
                    role: 'system',
                    content: `[World Event] ${msg.content}`,
                });
            } else if (msg.role === 'whisper') {
                // 悄悄话：仅目标角色可见，内联在对话流中
                if (msg.targetRoleId === targetRole.id) {
                    apiMessages.push({
                        role: 'user',
                        content: `[🤫 导演悄悄话 - 只有你能看到] ${msg.content}（请在下次回复中回应这条悄悄话的内容）`,
                    });
                }
                // 其他角色看不到悄悄话，跳过
            } else if (msg.role === 'assistant') {
                if (msg.roleId === targetRole.id) {
                    // 自己说的 → assistant（让 AI 知道这是自己之前说的）
                    apiMessages.push({
                        role: 'assistant',
                        content: msg.rawContent || msg.content,
                    });
                } else {
                    // 别的角色说的 → user（带名字前缀）
                    apiMessages.push({
                        role: 'user',
                        content: `[${msg.roleName || '角色'}]: ${msg.rawContent || msg.content}`,
                    });
                }
            }
        }

        return apiMessages;
    }

    // 停止生成
    function stopGroupGeneration() {
        groupAbortController.value?.abort();
        isGroupStreaming.value = false;
        currentSpeakingRole.value = null;
    }

    // 清空群聊记录
    function clearGroupChat() {
        if (!currentGroup.value) return;

        showConfirmModal({
            title: '清空群聊',
            message: `确定要清空 "${currentGroup.value.name}" 的所有聊天记录吗？\n此操作无法撤销。`,
            isDangerous: true,
            onConfirm: () => {
                currentGroup.value.chatHistory = [];
                saveGroups();
                showToast('群聊记录已清空');
            },
        });
    }

    // 编辑群聊（改名 + 增减成员）
    function updateGroupChat(groupId, newName, newParticipantIds, newDescription, newModel, newResponseLength, newGenre) {
        const group = groupChats.value.find(g => g.id === groupId);
        if (!group) return;

        if (newParticipantIds.length < 2) {
            showToast('至少需要 2 个角色', 'error');
            return;
        }

        group.name = newName || group.name;
        group.participantIds = newParticipantIds;
        if (newDescription !== undefined) group.description = newDescription;
        if (newModel !== undefined) group.model = newModel;
        if (newResponseLength !== undefined) group.responseLength = newResponseLength;
        if (newGenre !== undefined) group.genre = newGenre;
        // v5.2: 同步关系矩阵（增减成员时）
        if (group.relationshipMatrix) {
            group.relationshipMatrix = syncMatrix(group.relationshipMatrix, newParticipantIds);
        } else {
            group.relationshipMatrix = initMatrix(newParticipantIds);
        }
        saveGroups();
        showToast('群聊已更新');
    }

    // 删除群聊消息
    function deleteGroupMessage(index) {
        if (!currentGroup.value) return;
        if (index >= 0 && index < groupMessages.value.length) {
            groupMessages.value.splice(index, 1);
            saveGroups();
            showToast('消息已删除');
        }
    }

    // 编辑群聊消息
    function editGroupMessage(index, newContent) {
        if (!currentGroup.value) return;
        if (index >= 0 && index < groupMessages.value.length) {
            const msg = groupMessages.value[index];
            msg.content = newContent;
            msg.rawContent = newContent;
            saveGroups();
            showToast('消息已更新');
        }
    }

    // 注入世界事件
    function injectWorldEvent(eventText) {
        if (!currentGroup.value || !eventText?.trim()) return;

        const group = currentGroup.value;
        const eventMsg = {
            role: 'world-event',
            content: eventText.trim(),
            timestamp: Date.now(),
        };

        group.chatHistory.push(eventMsg);
        saveGroups();
        showToast(`🌍 世界事件已注入`, 'info');
    }

    // 发送悄悄话（仅目标角色可见）
    function sendWhisper(targetRoleId, content) {
        if (!currentGroup.value || !targetRoleId || !content?.trim()) return;

        const group = currentGroup.value;
        const role = appState.roleList.value.find(r => r.id === targetRoleId);

        const whisperMsg = {
            role: 'whisper',
            targetRoleId,
            targetRoleName: role?.name || '角色',
            content: content.trim(),
            timestamp: Date.now(),
        };

        group.chatHistory.push(whisperMsg);
        saveGroups();
        showToast(`🤫 悄悄话已发送给 ${role?.name || '角色'}`);

        // 自动触发目标角色回复悄悄话
        speakAsRole(targetRoleId);
    }

    // v5.2: 分析对话并更新关系矩阵
    async function analyzeRelationships() {
        const group = currentGroup.value;
        if (!group || !group.relationshipMatrix) return;
        if (!globalSettings.apiKey) return;

        const recentMsgs = group.chatHistory.slice(-15);
        if (recentMsgs.filter(m => m.role === 'assistant').length < 1) return;

        console.log('[Relationship] 开始分析对话...');

        try {
            const updatedMatrix = await analyzeAndUpdate(
                recentMsgs,
                group.relationshipMatrix,
                participants.value,
                {
                    baseUrl: globalSettings.baseUrl,
                    apiKey: globalSettings.apiKey,
                }
            );

            if (updatedMatrix) {
                group.relationshipMatrix = updatedMatrix;
                saveGroups();
                console.log('[Relationship] ✅ 关系矩阵已更新');
            } else {
                console.log('[Relationship] 本轮无明显关系变化');
            }
        } catch (error) {
            console.warn('[Relationship] 更新失败:', error.message);
        }
    }

    // v5.2: 手动更新关系矩阵某条关系
    function updateAffinity(fromId, toId, value) {
        const group = currentGroup.value;
        if (!group || !group.relationshipMatrix) return;
        setAffinity(group.relationshipMatrix, fromId, toId, value);
        saveGroups();
    }

    // v5.3: 潜意识思想生成
    async function generateSubconsciousThoughts() {
        const group = currentGroup.value;
        if (!group || !globalSettings.apiKey) return;

        // 递增轮次计数
        if (!group.roundCount) group.roundCount = 0;
        group.roundCount++;

        // 每 3 轮触发一次
        if (group.roundCount % 3 !== 0) return;

        const recentMsgs = group.chatHistory.slice(-20);
        if (recentMsgs.filter(m => m.role === 'assistant').length < 2) return;

        // 构建对话摘要（简短版，节约 token）
        const chatSummary = recentMsgs
            .filter(m => m.role === 'assistant' || m.role === 'director')
            .slice(-10)
            .map(m => {
                const name = m.roleName || '导演';
                const content = (m.rawContent || m.content || '')
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/<inner>[\s\S]*?<\/inner>/g, '')
                    .replace(/<expr:\w+>/gi, '')
                    .trim()
                    .slice(0, 100);
                return `${name}: ${content}`;
            })
            .join('\n');

        const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
        const apiUrl = `${baseUrl}/chat/completions`;

        console.log('[Subconscious] 🧠 开始生成潜意识想法...');

        // 为每个角色并行请求
        const promises = participants.value.map(async (role) => {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${globalSettings.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [{
                            role: 'system',
                            content: `你是一个角色扮演分析师。根据对话内容，写出"${role.name}"此刻内心真正的、不加掩饰的想法。\n要求：\n- 仅一句话，不超过25个字\n- 体现"表里不一"：可以与表面表现完全相反\n- 用第一人称（"我"）\n- 不要加引号或标点解释\n角色设定：${(role.systemPrompt || role.description || '').slice(0, 200)}`
                        }, {
                            role: 'user',
                            content: `最近对话：\n${chatSummary}\n\n${role.name}此刻心里真正想的是：`
                        }],
                        max_tokens: 80,
                        temperature: 1.2,
                        stream: false,
                    }),
                    signal: AbortSignal.timeout(15000),
                });

                if (!response.ok) return null;
                const data = await response.json();
                const thought = data.choices?.[0]?.message?.content?.trim();
                if (!thought) return null;

                return { roleId: role.id, roleName: role.name, thought, avatar: role.avatar || '', timestamp: Date.now() };
            } catch (e) {
                console.warn(`[Subconscious] ${role.name} 生成失败:`, e.message);
                return null;
            }
        });

        const results = await Promise.allSettled(promises);
        const newThoughts = {};
        let hasNew = false;

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const { roleId, roleName, thought, avatar, timestamp } = result.value;
                newThoughts[roleId] = { thought, roleName, avatar, timestamp };
                hasNew = true;
                console.log(`[Subconscious] 💭 ${roleName}: ${thought}`);
            }
        }

        if (hasNew) {
            // 更新响应式状态（触发 UI）
            subconsciousThoughts.value = { ...newThoughts };
            // 持久化到 group 数据
            if (!group.subconsciousThoughts) group.subconsciousThoughts = {};
            Object.assign(group.subconsciousThoughts, newThoughts);
            saveGroups();
        }
    }

    return {
        // 状态
        groupChats,
        currentGroupId,
        isGroupMode,
        isGroupStreaming,
        currentSpeakingRole,
        currentGroup,
        groupMessages,
        participants,

        // 方法
        loadGroups,
        saveGroups,
        createGroupChat,
        deleteGroupChat,
        switchToGroup,
        exitGroupMode,
        sendDirectorMessage,
        continueOneRound,
        speakAsRole,
        stopGroupGeneration,
        clearGroupChat,
        updateGroupChat,
        deleteGroupMessage,
        editGroupMessage,
        injectWorldEvent,
        sendWhisper,
        generateDirectorEvent,
        setOnRoleComplete: (fn) => { onRoleComplete = fn; },
        // v5.2: 关系矩阵
        updateAffinity,
        analyzeRelationships,
        // v5.3: 潜意识思想
        subconsciousThoughts,
    };
}
