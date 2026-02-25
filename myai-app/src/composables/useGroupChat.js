import { ref, computed } from 'vue';
import { generateUUID } from '../utils/uuid';
import { STORAGE_KEYS } from '../utils/storage';
import { parseDualLayerResponse, formatRoleplayText } from '../utils/textParser';

const FETCH_TIMEOUT_MS = 60000; // 群聊超时 60s（多角色需要更长时间）

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
            participantIds,
            chatHistory: [],
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

        const model = globalSettings.model || 'deepseek-reasoner';
        const isReasoner = model.includes('reasoner');

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
                max_tokens: role.maxTokens || 2000,
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
            groupMessages.value.splice(msgIndex, 1);
            saveGroups();
            return; // 静默跳过
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

        const groupContext = `[群聊模式] 你现在在群聊"${group.name}"中。${topicLine}
群聊成员：${allParticipants.map(r => r.name).join('、')}。
你是「${targetRole.name}」。其他角色：${otherNames}。
用户是导演/主持人，负责引导话题。

注意事项：
1. 始终以「${targetRole.name}」的身份和语气回复
2. 你可以回应其他角色的发言，也可以主动发起新话题
3. 保持对话自然，像真正的群聊一样
4. 简洁有力，不要长篇大论（群聊节奏要快）
5. 如果当前话题与你无关，或者你没什么想补充的，请直接只回复 [PASS]（不要加任何其他内容）`;

        // Roleplay framework
        apiMessages.push({
            role: 'system',
            content: `[ROLEPLAY FRAMEWORK - GROUP CHAT MODE]
You are participating in a multi-character group chat. Stay in character as "${targetRole.name}" at ALL times.
Never break character. Use *asterisks* for actions, "quotes" for dialogue.
[/ROLEPLAY FRAMEWORK]`,
        });

        // 角色本身的 system prompt
        if (targetRole.systemPrompt) {
            apiMessages.push({
                role: 'system',
                content: targetRole.systemPrompt,
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
    function updateGroupChat(groupId, newName, newParticipantIds, newDescription) {
        const group = groupChats.value.find(g => g.id === groupId);
        if (!group) return;

        if (newParticipantIds.length < 2) {
            showToast('至少需要 2 个角色', 'error');
            return;
        }

        group.name = newName || group.name;
        group.participantIds = newParticipantIds;
        if (newDescription !== undefined) group.description = newDescription;
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
    };
}
