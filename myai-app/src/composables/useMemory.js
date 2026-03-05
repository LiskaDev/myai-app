import { acquireBackgroundLock, releaseBackgroundLock, isBackgroundLocked } from './useTimeline';
import { useBackgroundTasks } from './useBackgroundTasks';

// 章节摘要配置
const CHAPTER_TRIGGER_COUNT = 15;   // 每积累 15 条未归档消息触发
const MAX_CHAPTERS = 8;             // 最多保留 8 章，超出时最早的合并为远古摘要
const MEMORY_CARD_INTERVAL = 15;    // 每 15 条消息更新一次认知卡

// 记忆系统组合式函数
export function useMemory(appState) {
    const {
        globalSettings,
        roleList,
        currentRoleId,
        currentRole,
        messages,
        memoryEditState,
        showToast,
        saveData,
    } = appState;

    // 检查消息是否已被标记
    function isMessagePinned(messageIndex) {
        const msg = messages.value[messageIndex];
        if (!msg) return false;

        const manualMemories = currentRole.value.manualMemories || [];
        return manualMemories.some(m => m.content === msg.content && m.role === msg.role);
    }

    // 切换消息标记状态
    function toggleMessagePin(messageIndex) {
        const msg = messages.value[messageIndex];
        if (!msg) return;

        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        if (roleIndex === -1) return;

        const role = roleList.value[roleIndex];
        if (!role.manualMemories) {
            role.manualMemories = [];
        }

        const existingIndex = role.manualMemories.findIndex(
            m => m.content === msg.content && m.role === msg.role
        );

        if (existingIndex >= 0) {
            role.manualMemories.splice(existingIndex, 1);
            showToast('已取消记忆标记');
        } else {
            role.manualMemories.push({
                content: msg.content,
                role: msg.role,
                timestamp: Date.now(),
            });
            showToast('📌 已添加到永久记忆');
        }

        saveData();
    }

    // 删除手动记忆
    function removeManualMemory(memoryIndex) {
        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        if (roleIndex === -1) return;

        const role = roleList.value[roleIndex];
        if (role.manualMemories && memoryIndex >= 0 && memoryIndex < role.manualMemories.length) {
            role.manualMemories.splice(memoryIndex, 1);

            if (memoryEditState.editingIndex === memoryIndex) {
                memoryEditState.editingIndex = null;
                memoryEditState.editContent = '';
            }

            saveData();
            showToast('记忆已删除');
        }
    }

    // 添加新记忆
    function addManualMemory() {
        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        if (roleIndex === -1) return;

        const role = roleList.value[roleIndex];
        if (!role.manualMemories) {
            role.manualMemories = [];
        }

        role.manualMemories.unshift({
            content: '',
            role: 'system',
            timestamp: Date.now(),
            isCustom: true,
        });

        memoryEditState.editingIndex = 0;
        memoryEditState.editContent = '';
        saveData();
    }

    // 开始编辑记忆
    function startEditMemory(index) {
        const manualMemories = currentRole.value.manualMemories || [];
        if (index >= 0 && index < manualMemories.length) {
            memoryEditState.editingIndex = index;
            memoryEditState.editContent = manualMemories[index].content;
        }
    }

    // 保存编辑的记忆
    function saveEditMemory(index) {
        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        if (roleIndex === -1) return;

        const role = roleList.value[roleIndex];
        const content = memoryEditState.editContent.trim();

        if (!content) {
            if (role.manualMemories && index >= 0) {
                role.manualMemories.splice(index, 1);
                showToast('空记忆已移除');
            }
        } else if (role.manualMemories && index >= 0 && index < role.manualMemories.length) {
            role.manualMemories[index].content = content;
            role.manualMemories[index].lastModified = Date.now();
            showToast('记忆已保存');
        }

        memoryEditState.editingIndex = null;
        memoryEditState.editContent = '';
        saveData();
    }

    // 取消编辑
    function cancelEditMemory() {
        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        if (roleIndex !== -1) {
            const role = roleList.value[roleIndex];
            const index = memoryEditState.editingIndex;
            if (role.manualMemories && index >= 0 && index < role.manualMemories.length) {
                if (!role.manualMemories[index].content) {
                    role.manualMemories.splice(index, 1);
                }
            }
        }

        memoryEditState.editingIndex = null;
        memoryEditState.editContent = '';
    }

    // 切换记忆展开状态
    function toggleMemoryExpand(index) {
        if (memoryEditState.expandedIndex === index) {
            memoryEditState.expandedIndex = null;
        } else {
            memoryEditState.expandedIndex = index;
        }
    }

    // AI 精简记忆
    let isRefining = false;
    async function refineMemoryWithAI(index) {
        // 🛡️ 防止重复点击
        if (isRefining) {
            showToast('正在精简中，请稍候', 'error');
            return;
        }
        const manualMemories = currentRole.value.manualMemories || [];
        if (index < 0 || index >= manualMemories.length) return;

        const rawContent = manualMemories[index].content;
        if (!rawContent || rawContent.length < 20) {
            showToast('内容太短，无需精简', 'error');
            return;
        }

        if (!globalSettings.apiKey) {
            showToast('请先配置 API Key', 'error');
            return;
        }

        isRefining = true;

        memoryEditState.refiningIndex = index;

        try {
            const refinePrompt = `请将以下对话片段或文本重写为一段简练的、第三人称的事实陈述，保留核心剧情和设定，去除冗余修饰，50字以内。直接输出结果，不要有任何前缀说明。

输入文本：
${rawContent}`;

            // 构建 API URL
            const baseUrl = (globalSettings.bgBaseUrl || globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const apiKey = globalSettings.bgApiKey || globalSettings.apiKey;
            const apiUrl = `${baseUrl}/chat/completions`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: globalSettings.bgModel || globalSettings.model || 'deepseek-chat',
                    messages: [{ role: 'user', content: refinePrompt }],
                    temperature: 0.3,
                    max_tokens: 200,
                    stream: true,
                }),
                signal: AbortSignal.timeout(20000), // 🛡️ 20s 超时，防止网络卡死时 isRefining 锁永久占用
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let refinedContent = '';

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
                        if (delta) {
                            refinedContent += delta;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }

            refinedContent = refinedContent.trim();

            if (refinedContent) {
                memoryEditState.editingIndex = index;
                memoryEditState.editContent = refinedContent;
                showToast('✨ AI 精简完成，请确认保存');
            } else {
                showToast('AI 返回为空，请重试', 'error');
            }

        } catch (error) {
            showToast(`精简失败: ${error.message}`, 'error');
        } finally {
            memoryEditState.refiningIndex = null;
            isRefining = false;
        }
    }

    // 🗜️ 智能压缩：当记忆超过 20 条时，将最早的 10 条压缩为一条摘要
    const COMPRESS_THRESHOLD = 20;
    const COMPRESS_BATCH = 10;
    let isCompressing = false;

    async function compressOldMemories(roleId) {
        if (isCompressing) return;

        const roleIndex = roleList.value.findIndex(r => r.id === (roleId || currentRoleId.value));
        if (roleIndex === -1) return;

        const role = roleList.value[roleIndex];
        const memories = role.manualMemories || [];
        if (memories.length <= COMPRESS_THRESHOLD) return;

        if (!globalSettings.apiKey) return;

        isCompressing = true;

        try {
            // 取最早的 COMPRESS_BATCH 条
            const oldMemories = memories.slice(0, COMPRESS_BATCH);
            const memoryText = oldMemories
                .map((m, i) => `${i + 1}. ${m.content}`)
                .join('\n');

            const baseUrl = (globalSettings.bgBaseUrl || globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const model = globalSettings.bgModel || globalSettings.model || 'deepseek-chat';
            const apiKey = globalSettings.bgApiKey || globalSettings.apiKey;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 200,
                    temperature: 0.3,
                    messages: [{
                        role: 'user',
                        content: `请将以下${COMPRESS_BATCH}条角色记忆压缩成1-2条精炼的事实陈述，保留最重要的信息（关键事件、关系变化、承诺），丢弃琐碎细节。总共不超过80字。直接输出压缩后的内容，每条一行，不要编号。\n\n${memoryText}`,
                    }],
                }),
                signal: AbortSignal.timeout(20000),
            });

            if (!response.ok) return;

            const data = await response.json();
            const compressed = data.choices?.[0]?.message?.content?.trim();
            if (!compressed) return;

            // 用压缩摘要替换最早的 COMPRESS_BATCH 条
            const compressedEntries = compressed.split('\n').filter(l => l.trim()).map(line => ({
                content: `[历史摘要] ${line.trim()}`,
                role: 'system',
                timestamp: Date.now(),
                source: 'compressed',
                isCustom: true,
            }));

            // 移除旧的，插入压缩摘要到开头
            role.manualMemories = [...compressedEntries, ...memories.slice(COMPRESS_BATCH)];
            saveData();

            console.log(`[MemoryCompress] ✅ 压缩了 ${COMPRESS_BATCH} 条旧记忆 → ${compressedEntries.length} 条摘要`);
            showToast?.(`🗜️ 已自动压缩 ${COMPRESS_BATCH} 条旧记忆`);
        } catch {
            // 静默失败
        } finally {
            isCompressing = false;
        }
    }

    // 检查并触发压缩（供外部调用）
    function checkAndCompressMemories(roleId) {
        const role = roleList.value.find(r => r.id === (roleId || currentRoleId.value));
        if (role && (role.manualMemories || []).length > COMPRESS_THRESHOLD) {
            compressOldMemories(roleId).catch(() => { });
        }
    }

    // ================================================================
    // v6.0 三层记忆系统 — 章节摘要 + 认知卡
    // ================================================================

    let isUpdatingCard = false;
    let isGeneratingChapter = false;

    /**
     * 🗂️ 章节摘要：将窗口外的旧消息归档为章节摘要
     */
    async function triggerChapterSummary(role, messagesToSummarize) {
        if (isGeneratingChapter || !messagesToSummarize || messagesToSummarize.length < 5) return;
        if (!globalSettings.apiKey) return;
        if (!acquireBackgroundLock()) {
            console.log('[ChapterSummary] 后台繁忙，跳过');
            return;
        }

        isGeneratingChapter = true;
        const bgTask = useBackgroundTasks().trackTask('章节归档');

        try {
            // 格式化对话文本
            const dialogueText = messagesToSummarize
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => {
                    const name = m.role === 'user' ? '用户' : (role.name || '角色');
                    const content = (m.rawContent || m.content || '').slice(0, 500);
                    return `${name}: ${content}`;
                })
                .join('\n');

            if (!dialogueText.trim()) return;

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
                    max_tokens: 400,
                    temperature: 0.3,
                    messages: [{
                        role: 'user',
                        content: `请将以下对话压缩成一段200字以内的剧情摘要。
要求：保留关键情节、情感转折、重要约定、角色间关系变化，去掉闲聊细节。
用第三人称叙述，语气中立。
只返回摘要文本，不要任何额外说明。

对话内容：
${dialogueText}`,
                    }],
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const summary = data.choices?.[0]?.message?.content?.trim();
            if (!summary) return;

            // 追加新章节
            if (!role.chapterSummaries) role.chapterSummaries = [];
            role.chapterSummaries.push({
                chapterIndex: role.chapterSummaries.length + 1,
                createdAt: Date.now(),
                messageCount: messagesToSummarize.length,
                summary,
            });

            // 超过 MAX_CHAPTERS 章时，把最早的几章合并为「远古摘要」
            if (role.chapterSummaries.length > MAX_CHAPTERS) {
                const overflow = role.chapterSummaries.length - MAX_CHAPTERS;
                const oldChapters = role.chapterSummaries.slice(0, overflow + 1);
                const condensed = oldChapters.map(c => c.summary).join(' ');
                // 替换为一条合并摘要
                role.chapterSummaries = [
                    {
                        chapterIndex: 0,
                        createdAt: Date.now(),
                        messageCount: oldChapters.reduce((s, c) => s + c.messageCount, 0),
                        summary: `[远古回忆] ${condensed.slice(0, 300)}`,
                        isCondensed: true,
                    },
                    ...role.chapterSummaries.slice(overflow + 1),
                ];
                // 重新编号
                role.chapterSummaries.forEach((c, i) => c.chapterIndex = i + 1);
            }

            saveData();
            console.log(`[ChapterSummary] ✅ 已归档 ${messagesToSummarize.length} 条消息为第 ${role.chapterSummaries.length} 章`);
        } catch (err) {
            console.warn('[ChapterSummary] 归档失败:', err.message);
        } finally {
            bgTask.done();
            isGeneratingChapter = false;
            releaseBackgroundLock();
        }
    }

    /**
     * 🧠 认知卡更新：AI 自动维护角色对用户的结构化认知
     */
    async function triggerMemoryCardUpdate(role, recentMessages) {
        if (isUpdatingCard) return;
        if (!globalSettings.apiKey) return;
        if (!acquireBackgroundLock()) {
            console.log('[MemoryCard] 后台繁忙，10秒后重试...');
            setTimeout(() => {
                triggerMemoryCardUpdate(role, recentMessages).catch(() => { });
            }, 10000);
            return;
        }

        isUpdatingCard = true;
        const bgTask = useBackgroundTasks().trackTask('认知卡更新');

        try {
            // 格式化对话文本
            const dialogueText = recentMessages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => {
                    const name = m.role === 'user' ? '用户' : (role.name || '角色');
                    const content = (m.rawContent || m.content || '').slice(0, 300);
                    return `${name}: ${content}`;
                })
                .join('\n');

            if (!dialogueText.trim()) return;

            // 当前认知卡 JSON
            const currentCard = role.memoryCard || {};
            const hasCard = currentCard.userProfile || (currentCard.keyEvents || []).length > 0;
            const currentCardJSON = hasCard ? JSON.stringify(currentCard, null, 2) : '暂无';

            const baseUrl = (globalSettings.bgBaseUrl || globalSettings.baseUrl || 'https://api.deepseek.com')
                .replace(/\/$/, '').replace(/\/chat\/completions$/, '');
            const apiKey = globalSettings.bgApiKey || globalSettings.apiKey;
            // reasoner 模型不适合 JSON 结构化输出，强制降级到 deepseek-chat
            const rawModel = globalSettings.bgModel || globalSettings.model || 'deepseek-chat';
            const model = rawModel.includes('reasoner') ? 'deepseek-chat' : rawModel;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 500,
                    temperature: 0.3,
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个记忆管理系统。你的任务是维护角色对用户的认知卡。必须严格返回合法JSON，不得包含任何JSON以外的文字、注释或markdown代码块。',
                        },
                        {
                            role: 'user',
                            content: `角色名称：${role.name || '角色'}
角色人设简述：${(role.systemPrompt || '').slice(0, 200)}

当前认知卡（可能为空）：
${currentCardJSON}

最近对话记录：
${dialogueText}

请根据以上信息，返回更新后的完整认知卡JSON：
{
  "userProfile": "用户的基本信息，包括名字、性格、职业等已知信息",
  "keyEvents": ["按时间顺序列出重大事件，每项不超过30字，最多保留10条"],
  "relationshipStage": "当前关系阶段的一句话描述",
  "emotionalState": "用户当前的情绪状态",
  "taboos": ["敏感话题或禁忌列表"],
  "lastTone": "最近几轮对话的情感基调"
}`,
                        },
                    ],
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const aiResponse = (data.choices?.[0]?.message?.content || '').trim();

            // 安全的 JSON 解析
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // 校验基本字段存在
                    if (typeof parsed === 'object' && parsed !== null) {
                        role.memoryCard = {
                            userProfile: parsed.userProfile || '',
                            keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents.slice(0, 10) : [],
                            relationshipStage: parsed.relationshipStage || '',
                            emotionalState: parsed.emotionalState || '',
                            taboos: Array.isArray(parsed.taboos) ? parsed.taboos : [],
                            lastTone: parsed.lastTone || '',
                            updatedAt: Date.now(),
                        };
                        saveData();
                        console.log('[MemoryCard] ✅ 认知卡已更新');
                    }
                } catch (parseErr) {
                    console.warn('[MemoryCard] JSON 解析失败:', parseErr.message);
                }
            } else {
                console.warn('[MemoryCard] AI 返回无法提取 JSON:', aiResponse.slice(0, 100));
            }
        } catch (err) {
            console.warn('[MemoryCard] 更新失败:', err.message);
        } finally {
            bgTask.done();
            isUpdatingCard = false;
            releaseBackgroundLock();
        }
    }

    /**
     * 📡 主入口：AI 回复完成后调用，自动判断是否触发章节摘要 / 认知卡更新
     * @param {Object} role - 当前角色对象
     * @param {Array} allMessages - 完整消息列表
     */
    function checkAndTriggerMemorySystems(role, allMessages) {
        if (!role || !allMessages || allMessages.length < 5) return;
        if (!globalSettings.enableSmartAnalysis) return;

        const totalMessages = allMessages.length;
        const windowSize = role.memoryWindow || 15;

        // ---- 判断 1：是否需要生成章节摘要（含追赶循环）----
        scheduleChapterCatchUp(role, allMessages, windowSize);

        // ---- 判断 2：是否需要更新认知卡 ----
        const lastCardUpdate = role.memoryCard?.updatedAt || 0;
        const timeSinceUpdate = Date.now() - lastCardUpdate;
        const messagesSinceUpdate = totalMessages - (role._lastCardMessageCount || 0);

        if (messagesSinceUpdate >= MEMORY_CARD_INTERVAL || (timeSinceUpdate > 30 * 60 * 1000 && totalMessages > 5)) {
            // 🛡️ 不在这里推进计数器，等实际执行成功后再更新
            scheduleMemoryCardUpdate(role, allMessages, totalMessages);
        }
    }

    /**
     * 🗂️ 章节摘要追赶调度：锁忙时 10 秒后重试，归档完一批后检查是否还有积压
     */
    function scheduleChapterCatchUp(role, allMessages, windowSize) {
        const totalMessages = allMessages.length;
        const archivedCount = (role.chapterSummaries || [])
            .reduce((sum, c) => sum + c.messageCount, 0);
        const outsideWindow = Math.max(0, totalMessages - windowSize);
        const unarchived = outsideWindow - archivedCount;

        if (unarchived < CHAPTER_TRIGGER_COUNT) return; // 无积压

        if (isBackgroundLocked()) {
            console.log('[ChapterSummary] 后台繁忙，10秒后重试...');
            setTimeout(() => scheduleChapterCatchUp(role, allMessages, windowSize), 10000);
            return;
        }

        const start = archivedCount;
        const end = start + CHAPTER_TRIGGER_COUNT;
        const messagesToArchive = allMessages.slice(start, end);

        triggerChapterSummary(role, messagesToArchive)
            .then(() => {
                // 归档成功后检查是否还有积压，继续追赶
                const newArchived = (role.chapterSummaries || [])
                    .reduce((sum, c) => sum + c.messageCount, 0);
                const stillUnarchived = outsideWindow - newArchived;
                if (stillUnarchived >= CHAPTER_TRIGGER_COUNT) {
                    console.log(`[ChapterSummary] 还有 ${stillUnarchived} 条积压，5秒后继续归档...`);
                    setTimeout(() => scheduleChapterCatchUp(role, allMessages, windowSize), 5000);
                }
            })
            .catch(() => { });
    }

    /**
     * 🧠 认知卡调度：延迟 2 秒避免抢锁，锁忙时 10 秒后重试
     */
    function scheduleMemoryCardUpdate(role, allMessages, snapshotCount) {
        setTimeout(() => {
            if (isBackgroundLocked()) {
                console.log('[MemoryCard] 后台繁忙，10秒后重试...');
                setTimeout(() => scheduleMemoryCardUpdate(role, allMessages, snapshotCount), 10000);
                return;
            }
            const recent = allMessages.slice(-30);
            triggerMemoryCardUpdate(role, recent)
                .then(() => {
                    // 🛡️ 只有执行成功后才推进计数器
                    role._lastCardMessageCount = snapshotCount;
                })
                .catch(() => { });
        }, 2000);
    }

    return {
        isMessagePinned,
        toggleMessagePin,
        removeManualMemory,
        addManualMemory,
        startEditMemory,
        saveEditMemory,
        cancelEditMemory,
        toggleMemoryExpand,
        refineMemoryWithAI,
        checkAndCompressMemories,
        // v6.0 三层记忆
        triggerChapterSummary,
        triggerMemoryCardUpdate,
        checkAndTriggerMemorySystems,
    };
}
