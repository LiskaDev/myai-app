import { parseDualLayerResponse, formatRoleplayText, normalizeTags } from '../utils/textParser';
import { usePromptBuilder } from './usePromptBuilder';
import { useAutoSummary } from './useAutoSummary';
import { useUserPersona } from './useUserPersona';
import { useTimeline } from './useTimeline';
import { useMemory } from './useMemory';

// 🛡️ 超时配置（根据模型类型动态调整）
const FETCH_TIMEOUT_MS = 30000;          // 普通模型 30 秒
const REASONER_TIMEOUT_MS = 120000;      // Reasoner 模型 120 秒（思考阶段需要更长时间）

// 🛡️ 发送锁 - 防止快速点击重复发送
let isSending = false;

// 聊天功能组合式函数 - 纯前端直连 API 模式
export function useChat(appState) {
    const {
        globalSettings,
        currentRole,
        messages,
        userInput,
        isStreaming,
        isThinking,
        abortController,
        showToast,
        saveData,
    } = appState;

    // 导入拆分后的子模块
    const { constructPrompt } = usePromptBuilder(appState);
    const { checkAndTriggerSummary } = useAutoSummary(appState);
    const { checkAndTriggerTimeline } = useTimeline(appState);
    const { checkAndCompressMemories, checkAndTriggerMemorySystems } = useMemory(appState);

    // 发送消息
    async function sendMessage() {
        const input = userInput.value.trim();

        // 🛡️ 立即检查发送锁 - 在任何异步操作之前
        if (!input || isStreaming.value || isSending) return;

        // 🛡️ 立即加锁 - 防止疯狂点击
        isSending = true;

        if (!globalSettings.apiKey) {
            showToast('请先在设置中配置 API Key', 'error', {
                label: '去设置',
                callback: () => { appState.showSettings.value = true; },
            });
            isSending = false;
            return;
        }

        // 添加用户消息
        const msgTimestamp = Date.now();
        messages.value.push({
            role: 'user',
            content: input,
            timestamp: msgTimestamp,
        });
        // 🕐 记录用户上次活跃时间（供主动消息判断离开时长）
        // 在此处更新而非页面 load/unload，避免 F5 刷新把时间覆写为"现在"
        localStorage.setItem('myai_lastVisitTime', msgTimestamp.toString());
        userInput.value = '';

        // 🧠 用户画像：后台静默分析
        const { onUserMessageSent } = useUserPersona();
        onUserMessageSent(messages.value, {
            apiKey: globalSettings.apiKey,
            baseUrl: globalSettings.baseUrl,
            model: globalSettings.model,
            enableSmartAnalysis: globalSettings.enableSmartAnalysis,
        });

        isThinking.value = true;

        try {
            await chat(input);
            // 🧠 对话完成后检查是否需要自动摘要
            checkAndTriggerSummary();
            // 📅 检查是否需要分析剧情时间线
            checkAndTriggerTimeline();
            // 🗄️ 检查是否需要压缩旧记忆
            checkAndCompressMemories();
            // 🧠 v6.0: 检查是否需要触发章节摘要 / 认知卡更新
            checkAndTriggerMemorySystems(currentRole.value, messages.value);
        } catch (error) {
            if (error.name !== 'AbortError') {
                // 🛡️ 友好的错误提示
                const errorMsg = error.name === 'TimeoutError'
                    ? '请求超时，请检查网络连接'
                    : `错误: ${error.message}`;
                showToast(errorMsg, 'error');
            }
        } finally {
            isStreaming.value = false;
            isThinking.value = false;
            isSending = false; // 🛡️ 解锁
        }
    }

    // 核心聊天函数 - 直连 DeepSeek API
    // options.targetRoleId: 用于防止角色切换时的竞态条件
    async function chat(userMessage, options = {}) {
        const { targetRoleId = null } = options;
        const role = currentRole.value;
        const initialRoleId = role.id; // 🛡️ 快照当前角色 ID
        const apiMessages = constructPrompt();

        // 模型配置
        const model = globalSettings.model || 'deepseek-reasoner';
        const isReasoner = model.includes('reasoner') || model.includes('QwQ') || model.includes('DeepSeek-R1') || model.includes('Kimi');

        // 动态参数调整 & 安全锁 (Safety Locks)
        let effectiveTemperature = role.temperature || 1.0;
        let frequencyPenalty = 0;
        let effectiveMaxTokens = role.maxTokens || 2000;

        const responseLength = globalSettings.responseLength || 'normal';

        // v4.3.4: Model-Specific Prompt Injection (fixes V3 fake thinking & R1 verbosity)
        let modelSpecificPrompt = '';

        if (isReasoner) {
            // === 推理模型配置（R1 / QwQ / Kimi 等） ===
            modelSpecificPrompt = `\n\n[System Rule: Reasoning Model]
1. You may use <think> tags for internal reasoning.
2. CRITICAL PERFORMANCE: Do NOT repeat/summarize the persona or settings in <think>. Assume context is loaded.
3. Jump IMMEDIATELY to drafting the plot and character reaction.
4. IMPORTANT: Use <inner>character's internal monologue here</inner> tags for the character's thoughts and feelings.
5. Actions in *asterisks*, dialogue normally.
6. 【强制语言规则】你必须全程使用中文回复。所有对话、动作描写、内心独白必须是中文。角色偶尔可夹杂1-2个英文词汇作为口癖，但绝对不可以用英文写完整句子或段落。
Example format:
<think>brief strategy</think>
<inner>What the character is thinking...</inner>
*action* "dialogue"`;
        } else {
            // === 标准模型配置（V3 / Qwen / GLM 等） ===
            modelSpecificPrompt = `\n\n[System Rule: Standard Model]
1. DO NOT use <think> tags. DO NOT simulate AI reasoning.
2. IMPORTANT: Start with <inner>character's internal monologue</inner> for character thoughts.
3. Then write actions in *asterisks* and dialogue normally.
4. Never pretend to have a thinking process.
5. 【强制语言规则】你必须全程使用中文回复。所有对话、动作描写、内心独白必须是中文。角色偶尔可夹杂1-2个英文词汇作为口癖，但绝对不可以用英文写完整句子或段落。
Example format:
<inner>What the character is thinking...</inner>
*action* "dialogue"`;
        }

        // Step A: Inject Model-Specific + Length instructions into last user message
        if (apiMessages.length > 0) {
            const lastMsgIndex = apiMessages.length - 1;
            if (apiMessages[lastMsgIndex].role === 'user') {
                // 强效长度指令 (Strong Length Instructions)
                let lengthInstruction = '';
                let presencePenalty = 0;

                if (responseLength === 'short') {
                    lengthInstruction = "\n\n[严格执行：回复长度限制]\n你必须保持极简回复。严格不超过100中文字。只写核心对话和必要动作。删除一切冗余描写。\n[CRITICAL LENGTH RULE] Keep response under 100 Chinese characters. Dialogue only. Remove all filler. Short responses ONLY.";
                    effectiveMaxTokens = Math.min(effectiveMaxTokens, 500);
                    presencePenalty = 0.5; // 鼓励简短
                } else if (responseLength === 'normal') {
                    lengthInstruction = "\n\n[回复长度要求]\n写2-3段，150-300字左右，包含动作描写和对话，不要太短也不要太长。\n[LENGTH RULE] Write 2-3 paragraphs (150-300 Chinese characters). Include action and dialogue.";
                } else if (responseLength === 'long') {
                    lengthInstruction = "\n\n[严格执行：长文模式]\n你必须写出沉浸式长篇叙事，至少300中文字以上。包含：感官描写（视觉、听觉、嗅觉）、内心独白、环境氛围、详细动作。严格禁止写少于200字的回复。\n[CRITICAL LENGTH RULE] You MUST write an immersive, slow-burn narrative (300+ Chinese characters minimum). Include sensory details, inner monologue, environment. Responses under 200 characters are FORBIDDEN.";
                    effectiveMaxTokens = Math.max(effectiveMaxTokens, 4000);
                    frequencyPenalty = 0.3; // 防止长文重复
                } else if (responseLength === 'auto') {
                    // v6.1: 场景感知动态长度 — AI 根据剧情节奏自行判断
                    lengthInstruction = "\n\n[回复长度规则：场景感知]\n根据当前场景类型动态调整回复长度：\n- 日常对话/闲聊：100字以内，简洁有力\n- 情绪转折/冲突：200字以内，动作带情绪\n- 高潮/关键场景：300字以内，句子变短，节奏加快\n你必须自行判断当前属于哪种场景，严格控制字数上限。\n[LENGTH RULE: Scene-Aware] Dynamically adjust length by scene type: casual talk ≤100 chars, emotional turns ≤200, climax ≤300. Judge the scene type yourself.";
                }

                apiMessages[lastMsgIndex].content += modelSpecificPrompt + lengthInstruction;
            }
        }

        // Step B: Smart Parameter Adjustment (Safety Locks)
        if (responseLength === 'long') {
            frequencyPenalty = 0.5; // Force vocabulary expansion
            if (isReasoner) {
                effectiveTemperature = 0.7; // Prevent logic collapse for R1
            } else {
                effectiveTemperature = 1.0; // v4.3: Balanced creativity for V3
            }
        } else if (responseLength === 'short') {
            effectiveTemperature = Math.min(effectiveTemperature, 0.9);
        }
        // 'auto' 模式：保持用户设置的参数，不做调整

        // 创建 AbortController - 🛡️ 组合用户中止和超时信号
        abortController.value = new AbortController();

        // 🛡️ 创建超时信号（根据模型类型动态设置超时时间）
        const timeoutMs = isReasoner ? REASONER_TIMEOUT_MS : FETCH_TIMEOUT_MS;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);

        // 🛡️ 组合信号：用户手动中止 或 超时自动中止
        // AbortSignal.any() 在旧浏览器(iOS 16, Chrome <116)不可用，需 fallback
        let combinedSignal;
        if (typeof AbortSignal.any === 'function') {
            combinedSignal = AbortSignal.any([
                abortController.value.signal,
                timeoutSignal
            ]);
        } else {
            // Fallback: 手动转发超时信号到 abortController
            const ctrl = abortController.value;
            combinedSignal = ctrl.signal;
            timeoutSignal.addEventListener('abort', () => {
                if (!ctrl.signal.aborted) ctrl.abort(timeoutSignal.reason);
            });
        }

        // 构建 API URL（🛡️ Bug#11: 防止用户误粘贴完整 endpoint 导致 /chat/completions/chat/completions）
        const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com')
            .replace(/\/$/, '')
            .replace(/\/chat\/completions$/, '');
        const apiUrl = `${baseUrl}/chat/completions`;

        // 直接调用 DeepSeek API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${globalSettings.apiKey}`,
            },
            body: JSON.stringify({
                model: model,
                messages: apiMessages,
                temperature: effectiveTemperature,
                max_tokens: effectiveMaxTokens,
                frequency_penalty: frequencyPenalty,
                stream: true,
                stream_options: { include_usage: true },
            }),
            signal: combinedSignal, // 🛡️ 使用组合信号
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 错误 ${response.status}: ${errorText}`);
        }

        isThinking.value = false;
        isStreaming.value = true;

        // 🛡️ 竞态条件检查：验证角色是否已切换
        const expectedRoleId = targetRoleId || initialRoleId;
        if (currentRole.value.id !== expectedRoleId) {
            console.warn('[useChat] 角色已切换，中止旧响应');
            abortController.value?.abort();
            return;
        }

        // 添加助手消息占位
        const assistantMessage = {
            role: 'assistant',
            content: '',
            thinking: '',
            thinkingComplete: false,
            timestamp: Date.now(),
        };
        messages.value.push(assistantMessage);
        const msgIndex = messages.value.length - 1;

        // 读取流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';
        let fullThinking = '';
        let tokenUsage = null;

        while (true) {
            // 🛡️ 每次循环检查角色是否变化
            if (currentRole.value.id !== expectedRoleId) {
                console.warn('[useChat] 流式传输中角色已切换，中止');
                abortController.value?.abort();
                break;
            }

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
                        messages.value[msgIndex].thinking = fullThinking;
                    }

                    if (delta) {
                        fullContent += delta;

                        // 🛡️ 关键修复：在流式期间也更新 rawContent
                        messages.value[msgIndex].rawContent = fullContent;

                        const parsed = parseDualLayerResponse(fullContent);

                        // Handle reasoning from content (V3 model fake thinking)
                        if (parsed.reasoning && !fullThinking) {
                            messages.value[msgIndex].thinking = parsed.reasoning;
                        }

                        // CRITICAL: Check if </think> just closed to mark thinkingComplete
                        // 🛡️ v5.3.1: 容错匹配标签变体（</think >、</ think>、</Think> 等）
                        if (/<\s*\/\s*think\s*>/i.test(fullContent)) {
                            messages.value[msgIndex].thinkingComplete = true;
                        }

                        // CRITICAL FIX: Do NOT fallback to fullContent!
                        messages.value[msgIndex].content = parsed.content;
                        messages.value[msgIndex].inner = parsed.inner;
                    }

                    // v5.9: 捕获 token 用量
                    if (json.usage) {
                        tokenUsage = json.usage;
                    }
                } catch (e) {
                    // 记录流式解析错误（仅开发模式详细日志）
                    if (import.meta.env.DEV) {
                        console.debug('[Stream] Parse error:', e.message);
                    }
                }
            }
        }

        // 完成后标记思考完成并保存原始内容（用于编辑）
        if (messages.value[msgIndex].thinking) {
            messages.value[msgIndex].thinkingComplete = true;
        }

        // 保存原始内容用于 Director Mode 编辑
        messages.value[msgIndex].rawContent = fullContent;

        // v5.9: 保存 token 用量
        if (tokenUsage) {
            messages.value[msgIndex].tokens = {
                prompt: tokenUsage.prompt_tokens || 0,
                completion: tokenUsage.completion_tokens || 0,
                total: tokenUsage.total_tokens || 0,
            };
        }

        // 🛡️ v5.9.3: 流式完成后最终清理 — 确保 content 永远没有 <think>/<inner> 残留
        const finalParsed = parseDualLayerResponse(fullContent);
        if (finalParsed.content) {
            messages.value[msgIndex].content = finalParsed.content;
        } else if (fullContent) {
            // fallback: 手动清理（🛡️ 先正规化标签变体，再用 i 旗处理大小写）
            let fallback = normalizeTags(fullContent)
                .replace(/<think>[\s\S]*$/gi, '')
                .replace(/<inner>[\s\S]*$/gi, '')
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
                .replace(/<\/?expr:\w+>/gi, '')
                .trim();
            messages.value[msgIndex].content = fallback
                ? formatRoleplayText(fallback)
                : '(内容生成中断，请重试)';
        }
        if (finalParsed.inner) {
            messages.value[msgIndex].inner = finalParsed.inner;
        }

        saveData();
    }

    // 停止生成
    function stopGeneration() {
        if (abortController.value) {
            abortController.value.abort();
            abortController.value = null;
        }
        isStreaming.value = false;
        isThinking.value = false;
        showToast('生成已停止');
    }

    // 重新生成消息
    function regenerateMessage(index) {
        // 🛡️ 流式输出时禁止重写，防止双流冲突
        if (isStreaming.value) {
            showToast('请等待当前回复完成', 'error');
            return;
        }
        if (index < 0 || index >= messages.value.length) return;

        const msg = messages.value[index];
        if (msg.role !== 'assistant') return;

        // 🛡️ 保存当前角色 ID 快照，防止竞态条件
        const targetRoleId = currentRole.value.id;

        // 删除当前消息及之后的所有消息
        messages.value.splice(index);

        // 获取最后一条用户消息作为上下文
        const lastUserMsg = messages.value.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            isThinking.value = true;
            // 🛡️ 传递角色 ID 用于验证
            chat(lastUserMsg.content, { targetRoleId }).catch(e => {
                if (e.name !== 'AbortError') {
                    showToast(`重新生成失败: ${e.message}`, 'error');
                }
            }).finally(() => {
                isStreaming.value = false;
                isThinking.value = false;
            });
        }
    }

    // 删除消息（支持撤销）
    function deleteMessage(index) {
        // 🛡️ 流式输出时禁止删除正在写入的最后一条消息
        if (isStreaming.value && index === messages.value.length - 1) {
            showToast('正在生成中，无法删除', 'error');
            return;
        }
        if (index >= 0 && index < messages.value.length) {
            const deleted = messages.value.splice(index, 1)[0];
            saveData();
            showToast('消息已删除', 'info', {
                label: '撤销',
                callback: () => {
                    messages.value.splice(index, 0, deleted);
                    saveData();
                },
            });
        }
    }

    // 处理 Shift+Enter
    function handleShiftEnter(event) {
        if (event.shiftKey && event.key === 'Enter') {
            return; // 允许换行
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    }

    return {
        constructPrompt,
        sendMessage,
        chat,
        stopGeneration,
        regenerateMessage,
        deleteMessage,
        handleShiftEnter,
    };
}
