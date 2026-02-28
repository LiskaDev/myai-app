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
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const apiUrl = `${baseUrl}/chat/completions`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: refinePrompt }],
                    temperature: 0.3,
                    max_tokens: 200,
                    stream: true,
                }),
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

            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
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
    };
}
