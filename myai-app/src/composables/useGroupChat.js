import { ref, computed } from 'vue';
import { generateUUID } from '../utils/uuid';
import { STORAGE_KEYS } from '../utils/storage';
import { parseDualLayerResponse, formatRoleplayText, normalizeTags } from '../utils/textParser';
import { WRITING_STYLE_PRESETS, WRITING_STYLE_BASE } from './presets';
import {
    initMatrix,
    syncMatrix,
    buildRelationshipHint,
    analyzeAndUpdate,
    getAffinity,
    setAffinity,
} from './useRelationship';
import { useUserPersona } from './useUserPersona';
import { acquireBackgroundLock, releaseBackgroundLock, isBackgroundLocked, buildTimelinePrompt, parseTimelineEvents } from './useTimeline';
import { useBackgroundTasks } from './useBackgroundTasks';
import { migrateRoleMemoryFields } from './presets';
import { useMemory } from './useMemory';

const FETCH_TIMEOUT_MS = 25000;          // 群聊普通模型 25s
const REASONER_TIMEOUT_MS = 50000;       // Reasoner 模型 50s

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
        saveData,
    } = appState;

    // ============== 群聊状态 ==============
    const groupChats = ref([]);
    const currentGroupId = ref(null);
    const isGroupMode = ref(false);
    const isGroupStreaming = ref(false);
    const currentSpeakingRole = ref(null); // 当前正在说话的角色名
    const groupAbortController = ref(null); // 保留兼容性，实际用 activeAbortControllers
    const activeAbortControllers = new Set(); // 🛡️ 并行请求用 Set 管理，避免单 ref 被覆盖
    let isMultiRoundStopped = false; // 🛡️ 多轮对话中途停止标志
    let isGroupSummarizing = false; // 防止重复触发群聊摘要
    let directorMsgCount = 0; // 用于跟踪记忆同步触发频率

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

    // 🛡️ 检测已删除的群成员
    const missingMembers = computed(() => {
        if (!currentGroup.value) return [];
        return currentGroup.value.participantIds.filter(
            id => !roleList.value.find(r => r.id === id)
        );
    });

    // ============== 存储 ==============
    function saveGroups() {
        try {
            localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groupChats.value));
        } catch (e) {
            const msg = (e.name === 'QuotaExceededError' || e.code === 22)
                ? '⚠️ 存储空间已满！请导出备份后清理旧群聊' : '保存群聊失败';
            showToast(msg, 'error');
        }
    }

    function loadGroups() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.GROUPS);
            if (saved) {
                groupChats.value = JSON.parse(saved);
            }
            // 🛡️ 加载时清理所有群聊中的幽灵成员
            let anyChanged = false;
            for (const group of groupChats.value) {
                const removed = group.participantIds.filter(id => !roleList.value.find(r => r.id === id));
                if (removed.length > 0) {
                    group.participantIds = group.participantIds.filter(id => roleList.value.find(r => r.id === id));
                    if (group.relationshipMatrix) {
                        group.relationshipMatrix = syncMatrix(group.relationshipMatrix, group.participantIds);
                    }
                    anyChanged = true;
                }
            }
            // 删除成员不足 2 人的群聊
            const beforeCount = groupChats.value.length;
            groupChats.value = groupChats.value.filter(g => g.participantIds.length >= 2);
            if (groupChats.value.length < beforeCount) {
                anyChanged = true;
            }
            if (anyChanged) {
                saveGroups();
            }

            // 恢复群聊会话状态
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            if (session.isGroupMode && session.currentGroupId) {
                const groupExists = groupChats.value.find(g => g.id === session.currentGroupId);
                if (groupExists) {
                    currentGroupId.value = session.currentGroupId;
                    isGroupMode.value = true;
                } else {
                    // 🛡️ 群聊已被清理，退出群聊模式
                    isGroupMode.value = false;
                    currentGroupId.value = null;
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
        // 🛡️ 切换时清理已删除的成员
        cleanupDeletedMembers(groupId);
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

    // 🛡️ 防御性清理：移除 participantIds 中已不存在于 roleList 的角色
    function cleanupDeletedMembers(groupId) {
        const group = groupChats.value.find(g => g.id === groupId);
        if (!group) return;

        const before = group.participantIds.length;
        const removed = group.participantIds.filter(id => !roleList.value.find(r => r.id === id));
        if (removed.length === 0) return;

        group.participantIds = group.participantIds.filter(id => roleList.value.find(r => r.id === id));

        // 同步关系矩阵
        if (group.relationshipMatrix) {
            group.relationshipMatrix = syncMatrix(group.relationshipMatrix, group.participantIds);
        }

        saveGroups();
        const removedNames = removed.length;
        showToast(`⚠️ 已自动移除 ${removedNames} 个已删除的群成员`, 'info');

        // 成员不足 2 人时警告
        if (group.participantIds.length < 2) {
            showToast('⚠️ 群聊有效成员不足 2 人，请编辑群聊添加成员', 'error');
        }
    }

    // ============== 发送消息 ==============
    function sendDirectorMessage(content) {
        if (!content.trim() || !currentGroup.value) return;

        // 🛡️ 流式输出时禁止发送，防止并发写入
        if (isGroupStreaming.value) {
            showToast('请等待角色回复完成', 'error');
            return;
        }

        const trimmed = content.trim();

        groupMessages.value.push({
            role: 'director',
            content: trimmed,
            timestamp: Date.now(),
        });

        saveGroups();

        // 🧠 用户画像：后台静默分析
        const { onUserMessageSent } = useUserPersona();
        onUserMessageSent(groupMessages.value, {
            apiKey: globalSettings.apiKey,
            baseUrl: globalSettings.baseUrl,
            model: globalSettings.model,
            enableSmartAnalysis: globalSettings.enableSmartAnalysis, // 🛡️ Bug#15: 尊重智能分析开关
        });

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

    // ============== 核心：继续一轮（半并行） ==============
    async function continueOneRound() {
        if (isGroupStreaming.value || !currentGroup.value) return;
        if (!globalSettings.apiKey) {
            showToast('请先在设置中配置 API Key', 'error');
            return;
        }

        const activeParticipants = [...participants.value];
        if (activeParticipants.length === 0) {
            showToast('群聊中没有有效角色，请编辑群聊重新添加成员', 'error');
            return;
        }
        if (activeParticipants.length < 2) {
            showToast('⚠️ 有效角色不足2人，部分角色可能已被删除，请编辑群聊', 'error');
        }

        // 洗牌：随机打乱发言顺序
        for (let i = activeParticipants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [activeParticipants[i], activeParticipants[j]] = [activeParticipants[j], activeParticipants[i]];
        }

        isGroupStreaming.value = true;

        // 🚀 半并行分批策略：
        // 2-3 个角色 → 全部并行，1 批完成
        // 4+ 个角色 → 分成 2 批，每批 Math.ceil(总数/2)
        const total = activeParticipants.length;
        const batchSize = total <= 3 ? total : Math.ceil(total / 2);
        const batches = [];
        for (let i = 0; i < total; i += batchSize) {
            batches.push(activeParticipants.slice(i, i + batchSize));
        }

        try {
            for (const batch of batches) {
                if (!isGroupStreaming.value) break;

                // 显示当前批次所有角色名
                currentSpeakingRole.value = batch.map(r => r.name).join('、');

                // 并行请求当前批次内所有角色
                const results = await Promise.allSettled(
                    batch.map(role => {
                        return generateRoleResponseSafe(role).then(() => ({ role, ok: true }))
                            .catch(error => {
                                if (error.name === 'AbortError') throw error;
                                const errorMsg = error.name === 'TimeoutError'
                                    ? `${role.name} 思考太久，先跳过啦~`
                                    : `${role.name} 走神了，先跳过~`;
                                showToast(errorMsg);
                                return { role, ok: false };
                            });
                    })
                );

                // Notify per-role completion (for sound effects, etc.)
                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value?.ok && onRoleComplete) {
                        onRoleComplete(result.value.role);
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                showToast(`错误: ${error.message}`, 'error');
            }
        } finally {
            isGroupStreaming.value = false;
            currentSpeakingRole.value = null;
            groupAbortController.value = null;
            activeAbortControllers.clear(); // 🛡️ 清空活跃控制器集合
            // 🛡️ v6.2: 错峰执行后台任务，避免同时发起多个 API 请求
            if (globalSettings.enableSmartAnalysis) {
                setTimeout(() => checkGroupSummary(), 0);
                setTimeout(() => checkAutoDirector(), 800);
                setTimeout(() => analyzeRelationships(), 1600);
                setTimeout(() => syncGroupEventsToMemory(), 2400);
                setTimeout(() => checkGroupTimeline(), 3200);
                // v6.0: 每个角色独立触发认知卡/章节摘要更新
                const { checkAndTriggerMemorySystems } = useMemory(appState);
                activeParticipants.forEach((role, idx) => {
                    setTimeout(() => {
                        migrateRoleMemoryFields(role); // 确保字段存在
                        checkAndTriggerMemorySystems(role, currentGroup.value?.chatHistory || []);
                    }, 4000 + idx * 800);
                });
            }
        }
    }

    // 🔄 连续多轮对话
    async function continueMultiRound(rounds) {
        // 🛡️ 防重入：已在流式输出中则忽略
        if (isGroupStreaming.value) {
            showToast('请等待当前回复完成', 'error');
            return;
        }
        isMultiRoundStopped = false; // 重置停止标志
        for (let i = 0; i < rounds; i++) {
            if (!currentGroup.value) break;
            if (isMultiRoundStopped) break; // 🛡️ 用户中途停止
            await continueOneRound();
            // 🛡️ 修复：原逻辑 isGroupStreaming 在 continueOneRound 结束后始终为 false
            // 改为检查专用停止标志
            if (isMultiRoundStopped) break;
            if (i < rounds - 1) {
                showToast(`✅ 第 ${i + 1}/${rounds} 轮完成`, 'info');
                // 短暂间隔让用户有机会干预
                await new Promise(r => setTimeout(r, 800));
            }
        }
        isMultiRoundStopped = false;
    }

    // 🛡️ 跳过当前角色（用户手动触发）
    function skipCurrentRole() {
        if (activeAbortControllers.size > 0) {
            activeAbortControllers.forEach(ctrl => ctrl.abort());
            showToast(`已跳过 ${currentSpeakingRole.value || '当前角色'}`);
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
            activeAbortControllers.clear(); // 🛡️ 清空活跃控制器集合
            checkGroupSummary();
        }
    }

    // 为单个角色生成回复
    async function generateRoleResponse(role) {
        const apiMessages = buildGroupPrompt(role);

        const group = currentGroup.value;
        const model = group?.model || globalSettings.model || 'deepseek-reasoner';
        const isReasoner = model.includes('reasoner') || model.includes('QwQ') || model.includes('DeepSeek-R1') || model.includes('Kimi');

        // v5.9.3: 模型特定提示注入 — 告诉 AI 使用 <inner>/<think> 标签
        let modelSpecificPrompt = '';
        if (isReasoner) {
            modelSpecificPrompt = `\n\n[System Rule: Reasoning Model]
1. You may use <think> tags for internal reasoning.
2. CRITICAL: Do NOT repeat/summarize the persona in <think>. Jump to drafting.
3. IMPORTANT: Use <inner>character's internal monologue here</inner> for thoughts.
4. Actions in *asterisks*, dialogue normally.
5. 你必须全程使用中文回复。
Example: <think>brief strategy</think><inner>What I'm thinking...</inner>*action* "dialogue"`;
        } else {
            modelSpecificPrompt = `\n\n[System Rule: Standard Model]
1. DO NOT use <think> tags. DO NOT simulate AI reasoning.
2. IMPORTANT: Start with <inner>character's internal monologue</inner> for thoughts.
3. Then write actions in *asterisks* and dialogue normally.
4. 你必须全程使用中文回复。
Example: <inner>What I'm thinking...</inner>*action* "dialogue"`;
        }

        // 注入到最后一条消息
        if (apiMessages.length > 0) {
            const lastIdx = apiMessages.length - 1;
            apiMessages[lastIdx].content += modelSpecificPrompt;
        }

        // v5.9: 回复长度统一使用全局设置
        const lengthSetting = globalSettings.responseLength || 'normal';
        const LENGTH_TO_TOKENS = { short: 500, normal: 2000, long: 4000, auto: 2000 };
        let maxTokens = LENGTH_TO_TOKENS[lengthSetting] || ((role.maxTokens > 0) ? role.maxTokens : 2000);

        // v5.9.3: 长度参数调优 — 与单聊一致
        let effectiveTemperature = role.temperature || 1.0;
        let frequencyPenalty = role.frequencyPenalty ?? 0;  // 读取角色配置的重复惩罚
        const effectiveTopP = role.topP ?? 1.0;  // 词汇多样性
        if (lengthSetting === 'long') {
            maxTokens = Math.max(maxTokens, 4000);
            frequencyPenalty = Math.max(frequencyPenalty, 0.5);
            effectiveTemperature = isReasoner ? 0.7 : 1.0;
        } else if (lengthSetting === 'short') {
            maxTokens = Math.min(maxTokens, 500);
            effectiveTemperature = Math.min(effectiveTemperature, 0.9);
        }

        // 🛡️ 每个角色独立创建 AbortController，注册到 Set 中防止并行时相互覆盖
        const localCtrl = new AbortController();
        activeAbortControllers.add(localCtrl);
        groupAbortController.value = localCtrl; // 保留兼容性
        // 🛡️ 根据模型类型动态设置超时
        const timeoutMs = isReasoner ? REASONER_TIMEOUT_MS : FETCH_TIMEOUT_MS;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        // 🛡️ AbortSignal.any 兼容性 fallback（iOS 16, Chrome <116）
        let combinedSignal;
        if (typeof AbortSignal.any === 'function') {
            combinedSignal = AbortSignal.any([
                localCtrl.signal,
                timeoutSignal,
            ]);
        } else {
            combinedSignal = localCtrl.signal;
            timeoutSignal.addEventListener('abort', () => {
                if (!localCtrl.signal.aborted) localCtrl.abort(timeoutSignal.reason);
            });
        }

        const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
            .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
        const apiUrl = `${baseUrl}/chat/completions`;

        const requestBody = {
            model: model,
            messages: apiMessages,
            temperature: effectiveTemperature,
            top_p: effectiveTopP,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
        };
        if (frequencyPenalty > 0 && !isReasoner) {
            requestBody.frequency_penalty = frequencyPenalty;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${globalSettings.apiKey}`,
            },
            body: JSON.stringify(requestBody),
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
        let tokenUsage = null;

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

                        // 🛡️ v5.3.1: 容错匹配标签变体
                        if (/<\s*\/\s*think\s*>/i.test(fullContent)) {
                            groupMessages.value[msgIndex].thinkingComplete = true;
                        }

                        groupMessages.value[msgIndex].content = parsed.content;
                        groupMessages.value[msgIndex].inner = parsed.inner;
                    }
                    // v5.9: 捕获 token 用量
                    if (json.usage) tokenUsage = json.usage;
                } catch (e) {
                    // Ignore parse errors in stream
                }
            }
        }

        // 完成后处理
        if (groupMessages.value[msgIndex].thinking) {
            groupMessages.value[msgIndex].thinkingComplete = true;
        }

        // v5.9: 保存 token 用量
        if (tokenUsage) {
            groupMessages.value[msgIndex].tokens = {
                prompt: tokenUsage.prompt_tokens || 0,
                completion: tokenUsage.completion_tokens || 0,
                total: tokenUsage.total_tokens || 0,
            };
        }

        groupMessages.value[msgIndex].rawContent = fullContent;

        // 🛡️ 请求完成，从活跃集合中移除
        activeAbortControllers.delete(localCtrl);

        // [PASS] 弃权机制 — 必须在 formatRoleplayText 之前检测，否则 [PASS] 会被转成 <span>
        // 🛡️ v5.3.1: 先正规化标签变体再清理
        const cleanForPass = normalizeTags(fullContent)
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
            .replace(/<\/?expr:\w+>/gi, '')
            .trim();
        if (/^\[?PASS\]?[。.，,\s]*$/i.test(cleanForPass)) {
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

        // 🛡️ v5.9.3: 流式完成后最终清理
        const finalParsed = parseDualLayerResponse(fullContent);
        if (finalParsed.content) {
            groupMessages.value[msgIndex].content = finalParsed.content;
        } else if (fullContent) {
            // 🛡️ v5.3.1: 先正规化标签变体，再用容错正则清理
            let fallback = normalizeTags(fullContent)
                .replace(/<think>[\s\S]*$/gi, '')
                .replace(/<inner>[\s\S]*$/gi, '')
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
                .replace(/<\/?expr:\w+>/gi, '')
                .trim();
            groupMessages.value[msgIndex].content = fallback
                ? formatRoleplayText(fallback)
                : '(内容生成中断，请重试)';
        }
        if (finalParsed.inner) {
            groupMessages.value[msgIndex].inner = finalParsed.inner;
        }

        saveGroups();
    }

    // 🛡️ generateRoleResponse 包装：捕获错误并清理占位消息
    async function generateRoleResponseSafe(role) {
        // 记录调用前的消息数量，用于定位可能插入的占位消息
        const msgCountBefore = groupMessages.value.length;
        try {
            await generateRoleResponse(role);
        } catch (error) {
            // 如果在 fetch 成功后才报错（占位消息已插入），清理掉它
            const lastMsg = groupMessages.value[groupMessages.value.length - 1];
            if (
                groupMessages.value.length > msgCountBefore &&
                lastMsg?.role === 'assistant' &&
                lastMsg?.roleId === role.id &&
                (!lastMsg.content || lastMsg.content.trim() === '')
            ) {
                groupMessages.value.splice(groupMessages.value.length - 1, 1);
                saveGroups();
            }
            throw error; // 继续向上传播，让 continueOneRound 处理
        }
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

            // 🛡️ 统一 API 路径（与 generateRoleResponse 一致，避免 /v1/v1 问题）
            const normalizedUrl = baseUrl.replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const response = await fetch(`${normalizedUrl}/chat/completions`, {
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
                signal: AbortSignal.timeout(20000), // 🛡️ 20s 超时，防止网络卡死时 isGroupStreaming 永远为 true
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
     * v5.9.1: 使用 summarizedUpTo 索引模式（与单聊一致，不再删除消息）
     */
    function checkGroupSummary() {
        const group = currentGroup.value;
        if (!group || isGroupSummarizing) return;

        // 取第一个参与角色的 memoryWindow 作为基准
        const firstRole = participants.value[0];
        const windowSize = firstRole?.memoryWindow || 15;
        const threshold = windowSize * 2;
        const summarizedUpTo = group.summarizedUpTo || 0;

        // 未摘要的消息数 >= 阈值时触发
        if (group.chatHistory.length - summarizedUpTo >= threshold) {
            generateGroupSummary().catch(err => {
                console.warn('[GroupSummary] 自动摘要失败:', err.message);
            });
        }
    }

    /**
     * 生成群聊自动摘要
     * v5.9.1: 不再删除旧消息，改为追踪 summarizedUpTo 索引（与单聊 useAutoSummary 一致）
     */
    async function generateGroupSummary() {
        if (isGroupSummarizing) return;
        isGroupSummarizing = true;
        const { trackTask } = useBackgroundTasks();
        const bgTask = trackTask('群聊摘要');

        try {
            const group = currentGroup.value;
            if (!group) return;

            const firstRole = participants.value[0];
            const windowSize = firstRole?.memoryWindow || 15;
            const summarizedUpTo = group.summarizedUpTo || 0;

            // 计算新的摘要范围：从上次摘要位置到保留窗口之前
            const newSummarizedUpTo = group.chatHistory.length - windowSize;
            if (newSummarizedUpTo <= summarizedUpTo) return;

            const toSummarize = group.chatHistory.slice(summarizedUpTo, newSummarizedUpTo);
            if (toSummarize.length === 0) return;

            console.log(`[GroupSummary] 正在压缩 ${toSummarize.length} 条群聊消息（索引 ${summarizedUpTo} → ${newSummarizedUpTo}）...`);

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
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
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
                // v5.9.1: 不删消息！只更新索引
                group.summarizedUpTo = newSummarizedUpTo;
                saveGroups();

                console.log(`[GroupSummary] 摘要完成，已压缩到索引 ${newSummarizedUpTo}，全部 ${group.chatHistory.length} 条消息保留`);
                showToast('💾 群聊记忆已自动压缩', 'info');
            }
        } catch (error) {
            bgTask.fail();
            console.warn('[GroupSummary] 摘要失败:', error.message);
        } finally {
            bgTask.done();
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
        // 🛡️ 防御性检查：部分角色可能已从角色列表中删除
        if (allParticipants.length === 0) return apiMessages;
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

        // v5.9: 回复长度统一使用全局设置
        const effectiveLength = globalSettings.responseLength || 'normal';

        let lengthGuidance;
        let frameworkLengthHint = '';
        if (effectiveLength === 'long') {
            lengthGuidance = '【严格执行：回复长度要求】你必须写出详细、丰富的长回复。每次回复至少4-6段（300字以上），包含：详细动作描写、表情变化、心理活动、环境互动和充分对话。严格禁止写少于200字的回复';
            frameworkLengthHint = '\n[CRITICAL LENGTH RULE] You MUST write LONG, DETAILED responses (300+ Chinese characters minimum). Include rich action descriptions, emotional details, and environment. Responses shorter than 200 characters are FORBIDDEN.';
        } else if (effectiveLength === 'normal') {
            lengthGuidance = '每次回复写2-3段，包含动作描写、表情或心理活动和对话，不要只写一两句话';
            frameworkLengthHint = '\nWrite moderately detailed responses (150-300 characters). Include actions and dialogue. Do NOT write just one short sentence.';
        } else if (effectiveLength === 'short') {
            lengthGuidance = '【严格执行：简洁回复】保持简短有力，每次回复不超过100字，1-2句话即可，群聊节奏要快';
            frameworkLengthHint = '\n[CRITICAL LENGTH RULE] Keep responses EXTREMELY SHORT (under 100 Chinese characters). 1-2 sentences maximum. Fast-paced group chat rhythm.';
        } else {
            // v6.1: auto 场景感知动态长度
            lengthGuidance = '根据场景类型动态调整回复长度：日常闲聊100字以内，情绪转折/冲突200字以内，高潮场景300字以内。自行判断当前场景类型';
            frameworkLengthHint = '\n[LENGTH RULE: Scene-Aware] Dynamically adjust length: casual talk ≤100 chars, emotional turns ≤200, climax ≤300. Judge the scene type yourself.';
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
你必须全程使用中文回复。严格使用角色名称原文「${targetRole.name}」，不可写错字。
[/ROLEPLAY FRAMEWORK]`,
        });

        // v6.1: 写作质量基础指令（所有风格共享）
        apiMessages.push({
            role: 'system',
            content: WRITING_STYLE_BASE,
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

        // v6.1: 注入写作风格模板（角色级别）
        if (targetRole.writingStyle) {
            const stylePreset = WRITING_STYLE_PRESETS.find(s => s.id === targetRole.writingStyle);
            if (stylePreset) {
                apiMessages.push({
                    role: 'system',
                    content: stylePreset.prompt,
                });
            }
        }

        // v6.0: 注入角色独立的认知卡（群聊视角隔离 — 每个角色各自的记忆）
        const card = targetRole.memoryCard;
        if (card && (card.userProfile || (card.keyEvents || []).length > 0 || card.relationshipStage)) {
            let cardText = `\n\n【你（${targetRole.name}）对用户的了解】\n`;
            if (card.userProfile) cardText += `关于用户：${card.userProfile}\n`;
            if (card.relationshipStage) cardText += `我们的关系：${card.relationshipStage}\n`;
            if (card.emotionalState) cardText += `用户当前状态：${card.emotionalState}\n`;
            if ((card.keyEvents || []).length > 0) cardText += `重要经历：${card.keyEvents.join('；')}\n`;
            if ((card.taboos || []).length > 0) cardText += `⚠️ 注意事项：${card.taboos.join('；')}\n`;
            apiMessages.push({ role: 'system', content: cardText });
        }

        // v6.0: 注入角色的章节摘要（如果有）
        const chapters = targetRole.chapterSummaries;
        if (chapters && chapters.length > 0) {
            const recentChapters = chapters.slice(-3); // 群聊只取 3 章，节省 token
            let chapText = '\n\n【剧情回顾】\n';
            recentChapters.forEach(c => {
                const prefix = c.isCondensed ? '远古回忆' : `第${c.chapterIndex}章`;
                chapText += `${prefix}：${c.summary}\n`;
            });
            apiMessages.push({ role: 'system', content: chapText });
        }

        // 注入群聊摘要（如果有）
        if (group.autoSummary) {
            apiMessages.push({
                role: 'system',
                content: `[群聊历史摘要]\n${group.autoSummary}\n[/群聊历史摘要]`,
            });
        }

        // 注入群聊剧情时间线（如果有）
        if (group.timeline?.length > 0) {
            const events = group.timeline
                .map(e => {
                    const imp = e.importance === 'high' ? '⚡' : (e.importance === 'medium' ? '📌' : '·');
                    return `${imp} ${e.event}`;
                })
                .join('\n');
            apiMessages.push({
                role: 'system',
                content: `[剧情时间线 - 故事中已发生的重要事件，请保持连贯]\n${events}`,
            });
        }

        // 上下文窗口：只取最近 N 条消息
        const windowSize = targetRole.memoryWindow || 15;
        const recentMessages = group.chatHistory.slice(-windowSize);

        // 关键：映射消息角色
        for (const msg of recentMessages) {
            // 🛡️ 跳过系统分隔线和弃权消息
            if (msg.type === 'day-separator') continue;
            if (msg.role === 'pass') continue;
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

        // v5.9: 用户画像注入（群聊也需要了解用户）
        const { personaSummaryForPrompt } = useUserPersona();
        if (personaSummaryForPrompt.value) {
            apiMessages.push({
                role: 'system',
                content: personaSummaryForPrompt.value,
            });
        }

        // v5.9: 最终位置长度强制 — 放在最后一条消息后面，AI 最容易遵守
        const finalLength = globalSettings.responseLength || 'normal';
        if (finalLength === 'long') {
            apiMessages.push({
                role: 'system',
                content: `[最终指令 - 严格执行] 你的回复必须至少300中文字，包含4-6段。写出详细的动作描写、表情变化、心理活动和对话。少于200字的回复是不可接受的。`,
            });
        } else if (finalLength === 'normal') {
            apiMessages.push({
                role: 'system',
                content: `[最终指令 - 回复长度] 你的回复需要2-3段，约200-400中文字。包含动作描写、心理活动和对话。不要只写一两句话就结束，每次回复都要有足够的内容和细节。`,
            });
        } else if (finalLength === 'short') {
            apiMessages.push({
                role: 'system',
                content: `[最终指令 - 简洁回复] 保持简短，不超过100中文字。1-2句话即可。`,
            });
        }

        // v6.1: 注入群聊动态风格指令（存储在群聊对象上，所有角色共享）
        const groupDirectives = (group.styleDirectives || []).filter(d => d && d.trim());
        if (groupDirectives.length > 0) {
            apiMessages.push({
                role: 'system',
                content: `[用户写作风格偏好 — 从下一条回复开始严格遵循]\n${groupDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
            });
        }

        return apiMessages;
    }

    // 停止生成
    function stopGroupGeneration() {
        // 🛡️ 中止所有并行中的请求
        activeAbortControllers.forEach(ctrl => ctrl.abort());
        activeAbortControllers.clear();
        groupAbortController.value = null;
        isGroupStreaming.value = false;
        currentSpeakingRole.value = null;
        isMultiRoundStopped = true; // 🛡️ 通知多轮循环停止
    }

    // 清空群聊记录
    function clearGroupChat() {
        if (!currentGroup.value) return;

        // 🛡️ AI 正在回复时禁止清空，防止幽灵消息
        if (isGroupStreaming.value) {
            showToast('请等待角色回复完成后再清空', 'error');
            return;
        }

        showConfirmModal({
            title: '清空群聊',
            message: `确定要清空 "${currentGroup.value.name}" 的所有聊天记录吗？\n此操作无法撤销。`,
            isDangerous: true,
            onConfirm: () => {
                currentGroup.value.chatHistory = [];
                // 🛡️ 重置摘要索引
                if (currentGroup.value.summarizedUpTo) {
                    currentGroup.value.summarizedUpTo = 0;
                }
                if (currentGroup.value.groupSummary) {
                    currentGroup.value.groupSummary = '';
                }
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
            // 🛡️ 流式输出时禁止删除正在写入的最后一条
            if (isGroupStreaming.value && index === groupMessages.value.length - 1) {
                showToast('正在生成中，无法删除', 'error');
                return;
            }
            groupMessages.value.splice(index, 1);
            // 🛡️ 调整摘要索引，防止偏移
            const group = currentGroup.value;
            if (group.summarizedUpTo && index < group.summarizedUpTo) {
                group.summarizedUpTo = Math.max(0, group.summarizedUpTo - 1);
            }
            saveGroups();
            showToast('消息已删除');
        }
    }

    // v5.9.3: 重写群聊消息
    async function regenerateGroupMessage(index) {
        if (!currentGroup.value) return;
        if (isGroupStreaming.value) {
            showToast('请等待当前生成完成', 'error');
            return;
        }
        const msg = groupMessages.value[index];
        if (!msg || msg.role !== 'assistant') {
            showToast('只能重写 AI 消息', 'error');
            return;
        }
        const roleId = msg.roleId;
        // 删除该消息
        groupMessages.value.splice(index, 1);
        saveGroups();
        // 重新让该角色发言
        await speakAsRole(roleId);
    }

    // 编辑群聊消息
    function editGroupMessage(index, newContent) {
        if (!currentGroup.value) return;
        if (index >= 0 && index < groupMessages.value.length) {
            const msg = groupMessages.value[index];
            msg.rawContent = newContent;
            // 🛡️ AI 消息通过解析器处理，确保 think/inner/expr 标签不泄露
            if (msg.role === 'assistant') {
                const parsed = parseDualLayerResponse(newContent);
                msg.content = parsed.content || newContent;
                if (parsed.inner) msg.inner = parsed.inner;
            } else {
                msg.content = newContent;
            }
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
        const { trackTask } = useBackgroundTasks();
        const bgTask = trackTask('关系分析');

        try {
            const updatedMatrix = await analyzeAndUpdate(
                recentMsgs,
                group.relationshipMatrix,
                participants.value,
                {
                    baseUrl: globalSettings.bgBaseUrl || globalSettings.baseUrl,
                    apiKey: globalSettings.bgApiKey || globalSettings.apiKey,
                    model: globalSettings.bgModel || globalSettings.model,
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
            bgTask.fail();
            console.warn('[Relationship] 更新失败:', error.message);
        } finally {
            bgTask.done();
        }
    }

    // 🔗 跨场景记忆同步：将群聊重要事件写入角色永久记忆
    async function syncGroupEventsToMemory() {
        directorMsgCount++;
        if (directorMsgCount % 6 !== 0) return; // 每 6 轮触发一次

        const group = currentGroup.value;
        if (!group || !globalSettings.apiKey) return;

        const recentMsgs = group.chatHistory.slice(-10);
        if (recentMsgs.filter(m => m.role === 'director' || m.role === 'assistant').length < 3) return;

        const roleNames = participants.value.map(r => r.name).join('、');
        const chatText = recentMsgs
            .map(m => {
                const speaker = m.role === 'director' ? '用户' : (m.roleName || '角色');
                return `${speaker}：${(m.rawContent || m.content || '').substring(0, 200)}`;
            })
            .join('\n');

        const prompt = `你是一个事件提取器，服务于 AI 角色扮演平台。

群聊成员：用户、${roleNames}

【待分析的对话片段】
${chatText}

【任务】
判断这段对话中是否发生了对某个角色而言具有长期记忆价值的重要事件。
重要事件的标准（满足其一即可）：
- 用户对某角色表达了明确的情感（表白、道歉、承诺、争吵）
- 某角色得知了关于用户的重要信息（秘密、身份、重大决定）
- 群聊中发生了不可逆的剧情转折

如果没有重要事件，返回：{"events": []}
如果有，严格按以下 JSON 格式返回，不含其他内容：
{
  "events": [
    {
      "roleNames": ["小明"],
      "memory": "[群聊记忆] 用户在群聊中向我表白，当时心跳加速。"
    }
  ]
}

注意：
- roleNames 只填写该事件直接相关的角色名
- memory 用角色第一人称书写，15-40字
- 最多提取 3 个事件`;

        const { trackTask } = useBackgroundTasks();
        const bgTask = trackTask('记忆同步');
        try {
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const model = globalSettings.model?.includes('reasoner')
                ? 'deepseek-chat' : (globalSettings.model || 'deepseek-chat');

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 300,
                    temperature: 0.2,
                    messages: [{ role: 'user', content: prompt }],
                }),
                signal: AbortSignal.timeout(20000),
            });

            if (!response.ok) return;

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || '';
            const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);

            if (!Array.isArray(parsed.events) || parsed.events.length === 0) return;

            let syncCount = 0;
            for (const event of parsed.events) {
                if (!Array.isArray(event.roleNames) || !event.memory) continue;

                for (const roleName of event.roleNames) {
                    const role = participants.value.find(r => r.name === roleName);
                    if (!role) continue;

                    // 初始化 manualMemories
                    if (!role.manualMemories) role.manualMemories = [];

                    // 去重：检查是否已有语义相似的记忆
                    const isDuplicate = role.manualMemories.some(
                        m => m.content && m.content.includes(event.memory.replace('[群聊记忆] ', '').substring(0, 10))
                    );
                    if (isDuplicate) continue;

                    role.manualMemories.push({
                        content: event.memory,
                        role: 'system',
                        timestamp: Date.now(),
                        source: 'group',
                        groupName: group.name || '群聊',
                    });
                    syncCount++;
                }
            }

            if (syncCount > 0) {
                saveData(); // 显式保存角色数据
                console.log(`[MemorySync] ✅ 已同步 ${syncCount} 条群聊记忆到角色数据`);
            }
            bgTask.done();
        } catch {
            bgTask.done(); // 静默失败
        }
    }

    // v5.2: 手动更新关系矩阵某条关系
    function updateAffinity(fromId, toId, value) {
        const group = currentGroup.value;
        if (!group || !group.relationshipMatrix) return;
        setAffinity(group.relationshipMatrix, fromId, toId, value);
        saveGroups();
    }

    // 📅 群聊剧情时间线分析
    let groupTimelineLastCount = 0;
    function checkGroupTimeline() {
        const group = currentGroup.value;
        if (!group) return;
        const dirMsgCount = group.chatHistory.filter(m => m.role === 'director').length;
        if (dirMsgCount - groupTimelineLastCount < 15) return;

        analyzeGroupTimeline().catch(err => {
            console.warn('[GroupTimeline] 分析失败:', err.message);
        });
    }

    async function analyzeGroupTimeline() {
        if (!acquireBackgroundLock()) return;
        const { trackTask } = useBackgroundTasks();
        const bgTask = trackTask('剧情时间线');
        try {
            const group = currentGroup.value;
            if (!group) return;
            const dirMsgCount = group.chatHistory.filter(m => m.role === 'director').length;

            const recentMsgs = group.chatHistory.slice(-20);
            const dialogueText = recentMsgs
                .filter(m => ['director', 'assistant'].includes(m.role))
                .map(m => {
                    const name = m.role === 'director' ? '导演' : (m.roleName || '角色');
                    return `${name}: ${m.rawContent || m.content || ''}`;
                })
                .join('\n');

            if (!dialogueText.trim()) { groupTimelineLastCount = dirMsgCount; return; }

            const existingEvents = (group.timeline || []).slice(-5).map(e => e.event).join('；');
            const prompt = buildTimelinePrompt(dialogueText, group.name, existingEvents);

            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 400,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) throw new Error(`API 错误 ${response.status}`);
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) { groupTimelineLastCount = dirMsgCount; return; }

            const newEvents = parseTimelineEvents(content);
            if (newEvents.length > 0) {
                if (!group.timeline) group.timeline = [];
                group.timeline.push(...newEvents);
                if (group.timeline.length > 30) group.timeline = group.timeline.slice(-30);
                saveGroups();
                console.log(`[GroupTimeline] 提取了 ${newEvents.length} 条新事件`);
            }
            groupTimelineLastCount = dirMsgCount;
        } finally {
            bgTask.done();
            releaseBackgroundLock();
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
        missingMembers,

        // 方法
        loadGroups,
        saveGroups,
        createGroupChat,
        deleteGroupChat,
        switchToGroup,
        exitGroupMode,
        sendDirectorMessage,
        continueOneRound,
        continueMultiRound,
        speakAsRole,
        stopGroupGeneration,
        skipCurrentRole,
        clearGroupChat,
        updateGroupChat,
        deleteGroupMessage,
        regenerateGroupMessage,
        editGroupMessage,
        injectWorldEvent,
        sendWhisper,
        generateDirectorEvent,
        setOnRoleComplete: (fn) => { onRoleComplete = fn; },
        // v5.2: 关系矩阵
        updateAffinity,
        analyzeRelationships,
    };
}
