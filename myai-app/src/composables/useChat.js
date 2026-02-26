import { parseDualLayerResponse, formatRoleplayText } from '../utils/textParser';
import { usePromptBuilder } from './usePromptBuilder';
import { useAutoSummary } from './useAutoSummary';
import { useUserPersona } from './useUserPersona';
import { useTimeline } from './useTimeline';
import { useMemory } from './useMemory';

// 🛡️ 超时配置
const FETCH_TIMEOUT_MS = 30000; // 30秒超时

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
    const { checkAndCompressMemories } = useMemory(appState);

    // 发送消息
    async function sendMessage() {
        const input = userInput.value.trim();

        // 🛡️ 立即检查发送锁 - 在任何异步操作之前
        if (!input || isStreaming.value || isSending) return;

        // 🛡️ 立即加锁 - 防止疯狂点击
        isSending = true;

        if (!globalSettings.apiKey) {
            showToast('请先在设置中配置 API Key', 'error');
            isSending = false;
            return;
        }

        // 添加用户消息
        messages.value.push({
            role: 'user',
            content: input,
        });
        userInput.value = '';

        // 🧠 用户画像：后台静默分析
        const { onUserMessageSent } = useUserPersona();
        onUserMessageSent(messages.value, {
            apiKey: globalSettings.apiKey,
            baseUrl: globalSettings.baseUrl,
            model: globalSettings.model,
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
        const isReasoner = model.includes('reasoner');

        // 动态参数调整 & 安全锁 (Safety Locks)
        let effectiveTemperature = role.temperature || 1.0;
        let frequencyPenalty = 0;
        let effectiveMaxTokens = role.maxTokens || 2000;

        const responseLength = globalSettings.responseLength || 'normal';

        // v4.3.4: Model-Specific Prompt Injection (fixes V3 fake thinking & R1 verbosity)
        let modelSpecificPrompt = '';

        if (isReasoner) {
            // === R1 Configuration ===
            // Anti-verbosity: Tell R1 not to repeat persona in <think>
            modelSpecificPrompt = `\n\n[System Rule: DeepSeek-R1 Mode]
1. Output logic traces in <think> tags.
2. CRITICAL PERFORMANCE: Do NOT repeat/summarize the persona or settings in <think>. Assume context is loaded.
3. Jump IMMEDIATELY to drafting the plot and character reaction.
4. IMPORTANT: Use <inner>character's internal monologue here</inner> tags for the character's thoughts and feelings.
5. Actions in *asterisks*, dialogue normally.
Example format:
<think>brief strategy</think>
<inner>What the character is thinking...</inner>
*action* "dialogue"`;
        } else {
            // === V3 Configuration ===
            // Explicitly forbid V3 from mimicking R1's <think> tags
            modelSpecificPrompt = `\n\n[System Rule: DeepSeek-V3 Mode]
1. DO NOT use <think> tags. DO NOT simulate AI reasoning.
2. IMPORTANT: Start with <inner>character's internal monologue</inner> for character thoughts.
3. Then write actions in *asterisks* and dialogue normally.
4. Never pretend to have a thinking process.
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
                    lengthInstruction = "\n\n[SYSTEM COMMAND: EXTREME BREVITY MODE]\n- Keep response under 100 words.\n- Focus strictly on dialogue.\n- Remove filler words.\n- NO elaborate descriptions.";
                    effectiveMaxTokens = Math.min(effectiveMaxTokens, 500);
                    presencePenalty = 0.5; // 鼓励简短
                } else if (responseLength === 'long') {
                    lengthInstruction = "\n\n[SYSTEM COMMAND: IMMERSIVE NOVEL MODE]\n- Ignore brevity constraints.\n- Write a slow-burn, detailed narrative (>400 words).\n- Describe sensory details (sight, sound, smell).\n- Focus on inner monologue and environmental atmosphere.";
                    effectiveMaxTokens = Math.max(effectiveMaxTokens, 4000);
                    frequencyPenalty = 0.3; // 防止长文重复
                }
                // 'auto' 模式：不添加任何长度指令，让 AI 自己决定

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

        // 🛡️ 创建超时信号（30秒）
        const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

        // 🛡️ 组合信号：用户手动中止 或 超时自动中止
        const combinedSignal = AbortSignal.any([
            abortController.value.signal,
            timeoutSignal
        ]);

        // 构建 API URL
        const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
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
        };
        messages.value.push(assistantMessage);
        const msgIndex = messages.value.length - 1;

        // 读取流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';
        let fullThinking = '';

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
                        if (fullContent.includes('</think>')) {
                            messages.value[msgIndex].thinkingComplete = true;
                        }

                        // CRITICAL FIX: Do NOT fallback to fullContent!
                        messages.value[msgIndex].content = parsed.content;
                        messages.value[msgIndex].inner = parsed.inner;
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

        // v5.4 FIX: Stream fallback - if content is empty but we have raw content
        if (!messages.value[msgIndex].content && fullContent) {
            let fallback = fullContent
                .replace(/<think>[\s\S]*$/, '')  // Remove unclosed <think>
                .replace(/<inner>[\s\S]*$/, '')  // Remove unclosed <inner>
                .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove complete <think>
                .replace(/<inner>[\s\S]*?<\/inner>/g, '') // Remove complete <inner>
                .trim();

            if (fallback) {
                messages.value[msgIndex].content = formatRoleplayText(fallback);
            } else {
                messages.value[msgIndex].content = '(内容生成中断，请重试)';
            }
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

    // 删除消息
    function deleteMessage(index) {
        if (index >= 0 && index < messages.value.length) {
            messages.value.splice(index, 1);
            saveData();
            showToast('消息已删除');
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
