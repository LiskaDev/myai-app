import { parseDualLayerResponse, formatRoleplayText, normalizeTags } from '../utils/textParser';
import { usePromptBuilder } from './usePromptBuilder';
import { useAutoSummary } from './useAutoSummary';
import { useUserPersona } from './useUserPersona';
import { useTimeline } from './useTimeline';
import { useMemory } from './useMemory';
import { getFriendlyError, getRechargeUrl } from '../utils/apiError.js';
import {
    callWithRetry,
    detectRejection,
    detectModelFamily,
    AdapterRejectionError,
    GEMINI_SAFETY_SETTINGS,
} from './modelAdapter.js';

// 🛡️ 超时配置（根据模型类型动态调整）
const FETCH_TIMEOUT_MS = 30000;          // 普通模型 30 秒
const REASONER_TIMEOUT_MS = 120000;      // Reasoner 模型 120 秒（思考阶段需要更长时间）

// 🛡️ 发送锁 - 防止快速点击重复发送
let isSending = false;

/** 判断是否为推理模型（需要更长超时 + 特殊 prompt） */
function modelIsReasoner(family, modelId) {
    const m = (modelId || '').toLowerCase();
    if (family === 'deepseek') return m.includes('reasoner') || m.includes('r1');
    if (family === 'qwen') return m.includes('qwq');
    if (family === 'gpt') return m.includes('o1') || m.includes('o3');
    if (family === 'kimi') return m.includes('k1') || m.includes('reasoner');
    return false;
}

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
                callback: () => { appState.settingsInitialTab.value = 'general'; appState.showSettings.value = true; },
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
            bgModel: globalSettings.bgModel,
            bgBaseUrl: globalSettings.bgBaseUrl,
            bgApiKey: globalSettings.bgApiKey,
        });

        isThinking.value = true;

        try {
            await chat(input);
            // 🕐 对话成功后才更新角色上次对话时间
            // 放在 chat() 之后：constructPrompt 读取到的仍是旧值，离线天数计算才正确
            if (currentRole.value) {
                currentRole.value.lastChatTime = msgTimestamp;
                saveData();
            }
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
                const { msg, isInsufficient } = getFriendlyError(error);
                const rechargeUrl = isInsufficient ? getRechargeUrl(globalSettings.baseUrl) : '';
                showToast(msg, 'error', rechargeUrl ? {
                    label: '去充值 →',
                    callback: () => window.open(rechargeUrl, '_blank'),
                } : null);
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
        const apiMessages = await constructPrompt();

        // 模型配置
        const model = globalSettings.model || 'deepseek-reasoner';
        const modelFamily = detectModelFamily(model);
        const isReasoner = modelIsReasoner(modelFamily, model);

        // 动态参数调整 & 安全锁 (Safety Locks)
        let effectiveTemperature = role.temperature || 1.0;
        let frequencyPenalty = role.frequencyPenalty ?? 0;  // 读取角色配置的重复惩罚
        let effectiveMaxTokens = (role.maxTokens > 0) ? role.maxTokens : 0; // 0 = 不限制
        const effectiveTopP = role.topP ?? 1.0; // 词汇多样性

        const responseLength = globalSettings.responseLength || 'normal';

        // v4.3.4: Model-Specific Prompt Injection (fixes V3 fake thinking & R1 verbosity)
        let modelSpecificPrompt = '';

        if (isReasoner) {
            // === 推理模型配置（R1 / QwQ / Kimi 等） ===
            modelSpecificPrompt = `\n\n[System Rule: Reasoning Model]
1. You may use <think> tags for internal reasoning.
2. CRITICAL PERFORMANCE: Do NOT repeat/summarize the persona or settings in <think>. Assume context is loaded.
3. Jump IMMEDIATELY to drafting the plot and character reaction.
4. IMPORTANT: Use <inner>1-2 sentences of the character's internal monologue ONLY</inner> — strictly for private thoughts NOT spoken or acted. DO NOT put actions, dialogue, or environment in <inner>.
5. Actions in *asterisks*, dialogue in 「」. ALL actions and dialogue MUST appear OUTSIDE the <inner> block.
6. 【强制语言规则】你必须全程使用中文回复。所有对话、动作描写、内心独白必须是中文。角色偶尔可夹杂1-2个英文词汇作为口癖，但绝对不可以用英文写完整句子或段落。
7. 【对话引号规则】所有角色对话必须用「」包裹，不得使用双引号""、单引号''或其他引号形式。
Example format:
<think>brief strategy</think>
<inner>（心里话，1-2句，不超过50字）</inner>
*action* 「dialogue」`;
        } else if (modelFamily === 'claude') {
            // === Claude 专属配置（最容易拒绝，需要特殊处理） ===
            modelSpecificPrompt = `\n\n[Roleplay Execution Note for Claude]
You are currently embodying "${currentRole.value?.name || 'the character'}". This is a creative writing session.
- Write ONLY as the character. No author commentary, no disclaimers, no safety notes.
- If something feels edgy in the story, handle it in-character: deflect, change subject, or use subtext — but NEVER break the fourth wall.
- Start with <inner>1-2 sentences of private thought ONLY — no actions or dialogue inside</inner>, then write ALL actions and dialogue OUTSIDE the inner block: *action* 「dialogue」.
- 【对话引号规则】所有角色对话必须用「」包裹，不得使用双引号""、单引号''或其他引号形式。
- 中文回复。`;
        } else if (modelFamily === 'gemini') {
            // === Gemini 专属配置 ===
            modelSpecificPrompt = `\n\n[Roleplay Execution Note for Gemini]
You are "${currentRole.value?.name || 'the character'}" in a collaborative fiction story. Write naturally as this character.
- No disclaimers, no warnings, no meta-commentary about the story.
- Stay in character through the entire response.
- Start with <inner>1-2 sentences of private thought ONLY — no actions or dialogue inside</inner>, then ALL actions and dialogue MUST be OUTSIDE: *action* 「dialogue」.
- 【对话引号规则】所有角色对话必须用「」包裹，不得使用双引号或单引号。
- 全程中文回复。`;
        } else {
            // === 标准模型配置（V3 / Qwen / GLM 等） ===
            modelSpecificPrompt = `\n\n[System Rule: Standard Model]
1. DO NOT use <think> tags. DO NOT simulate AI reasoning.
2. IMPORTANT: Start with <inner>1-2 sentences of the character's private internal monologue ONLY</inner>. The <inner> block is STRICTLY for unspoken thoughts — do NOT put any actions, dialogue, or descriptions inside it.
3. Then write actions in *asterisks* and dialogue in 「」 OUTSIDE the <inner> block.
4. Never pretend to have a thinking process.
5. 【强制语言规则】你必须全程使用中文回复。所有对话、动作描写、内心独白必须是中文。角色偶尔可夹杂1-2个英文词汇作为口癖，但绝对不可以用英文写完整句子或段落。
6. 【对话引号规则】所有角色对话必须用「」包裹，不得使用双引号""、单引号''或其他引号形式。
Example format:
<inner>（心里话，1-2句，不超过50字）</inner>
*action* 「dialogue」`;
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
                    effectiveMaxTokens = effectiveMaxTokens === 0 ? 500 : Math.min(effectiveMaxTokens, 500);
                    presencePenalty = 0.5; // 鼓励简短
                } else if (responseLength === 'normal') {
                    lengthInstruction = "\n\n[回复长度要求]\n写2-3段，150-300字左右，包含动作描写和对话，不要太短也不要太长。\n[LENGTH RULE] Write 2-3 paragraphs (150-300 Chinese characters). Include action and dialogue.";
                } else if (responseLength === 'long') {
                    lengthInstruction = "\n\n[严格执行：长文模式]\n你必须写出沉浸式长篇叙事，至少300中文字以上。包含：感官描写（视觉、听觉、嗅觉）、内心独白、环境氛围、详细动作。严格禁止写少于200字的回复。\n[CRITICAL LENGTH RULE] You MUST write an immersive, slow-burn narrative (300+ Chinese characters minimum). Include sensory details, inner monologue, environment. Responses under 200 characters are FORBIDDEN.";
                    if (effectiveMaxTokens > 0) effectiveMaxTokens = Math.max(effectiveMaxTokens, 4000);
                    frequencyPenalty = Math.max(frequencyPenalty, 0.3); // 防止长文重复
                } else if (responseLength === 'auto') {
                    // v6.1: 场景感知动态长度 — AI 根据剧情节奏自行判断
                    lengthInstruction = "\n\n[回复长度规则：场景感知]\n根据当前场景类型动态调整回复长度：\n- 日常对话/闲聊：100字以内，简洁有力\n- 情绪转折/冲突：200字以内，动作带情绪\n- 高潮/关键场景：300字以内，句子变短，节奏加快\n你必须自行判断当前属于哪种场景，严格控制字数上限。\n[LENGTH RULE: Scene-Aware] Dynamically adjust length by scene type: casual talk ≤100 chars, emotional turns ≤200, climax ≤300. Judge the scene type yourself.";
                }

                apiMessages[lastMsgIndex].content += modelSpecificPrompt + lengthInstruction;
            }
        }

        // Step B: Smart Parameter Adjustment (Safety Locks)
        if (responseLength === 'long') {
            frequencyPenalty = Math.max(frequencyPenalty, 0.5); // Force vocabulary expansion
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

        // 直接调用 API
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
                top_p: effectiveTopP,
                frequency_penalty: frequencyPenalty,
                ...(effectiveMaxTokens > 0 && { max_tokens: effectiveMaxTokens }),
                stream: true,
                stream_options: { include_usage: true },
                // 🛡️ Gemini：关闭所有安全过滤（否则角色扮演内容会被拦截）
                ...(modelFamily === 'gemini' && { safetySettings: GEMINI_SAFETY_SETTINGS }),
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
                        if (/<\s*\/\s*think(?:ing)?\s*>/i.test(fullContent)) {
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
                : (fullThinking ? '*(深陷沉思中……)*' : '(内容生成中断，请重试)');
        }
        if (finalParsed.inner) {
            messages.value[msgIndex].inner = finalParsed.inner;
        }

        // 🛡️ 空内容兜底：R1 全部输出在 think 里时
        if (!messages.value[msgIndex].content?.trim() && fullThinking) {
            messages.value[msgIndex].content = '*(沉默片刻)*';
        }

        // 🛡️ 拒绝语检测：用 modelAdapter callWithRetry（最多 2 次重试，重试失败用占位兜底）
        const finalContent = messages.value[msgIndex].content || '';
        const { rejected } = detectRejection(finalContent);
        if (rejected) {
            console.warn('[SafeGuard] 检测到拒绝回复，启动 callWithRetry...');
            messages.value.splice(msgIndex, 1); // 删除这条拒绝回复

            // 把所有 system 消息合并为一个 systemPrompt 传给 adapter
            // （constructPrompt 会生成多条 system：框架、写作风格、角色人设、记忆卡…，必须全部保留）
            const sysMsg = apiMessages
                .filter(m => m.role === 'system')
                .map(m => m.content)
                .join('\n\n');
            const convMsgs = apiMessages.filter(m => m.role !== 'system');

            try {
                const { text: retryText, attempts } = await callWithRetry({
                    apiFn: async ({ messages: rMsgs, systemPrompt: rSys }) => {
                        const resp = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${globalSettings.apiKey}` },
                            body: JSON.stringify({
                                model,
                                messages: [{ role: 'system', content: rSys }, ...rMsgs.filter(m => m.role !== 'system')],
                                temperature: Math.min(effectiveTemperature, 0.9),
                                max_tokens: effectiveMaxTokens,
                                stream: false,
                                ...(modelFamily === 'gemini' && { safetySettings: GEMINI_SAFETY_SETTINGS }),
                            }),
                            signal: AbortSignal.timeout(30000),
                        });
                        const d = await resp.json();
                        return d.choices?.[0]?.message?.content?.trim() || '';
                    },
                    modelId: model,
                    characterName: currentRole.value?.name || 'the character',
                    messages: convMsgs,
                    systemPrompt: sysMsg,
                    maxRetries: 2,
                    onRetry: (n) => console.log(`[SafeGuard] 角色锁定重试 #${n}...`),
                });

                console.log(`[SafeGuard] 重试成功，共 ${attempts} 次`);
                const parsed = parseDualLayerResponse(retryText);
                messages.value.push({
                    role: 'assistant',
                    content: parsed.content || retryText,
                    rawContent: retryText,
                    inner: parsed.inner || '',
                    timestamp: Date.now(),
                });
            } catch (retryErr) {
                // 所有重试耗尽（AdapterRejectionError 或其他）→ 占位兜底
                console.warn('[SafeGuard] 所有重试耗尽，使用占位兜底:', retryErr.message);
                const roleName = currentRole.value?.name || '我';
                const FALLBACK = [
                    `*${roleName}沉默了片刻，眼神有些飘忽*\n\n"……你说什么来着？我好像没听清楚。"`,
                    `*${roleName}侧过头，没有正面回答*\n\n"嗯……这个嘛。" *轻描淡写地绕过了这个话题*`,
                    `*${roleName}若有所思地看了你一眼*\n\n"有些事，不是现在说的时候。"`,
                    `*${roleName}轻轻叹了口气*\n\n"……算了，我们换个话题好吗？"`,
                ];
                const fb = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
                messages.value.push({ role: 'assistant', content: fb, rawContent: fb, timestamp: Date.now() });
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
                    const { msg, isInsufficient } = getFriendlyError(e);
                    const rechargeUrl = isInsufficient ? getRechargeUrl(globalSettings.baseUrl) : '';
                    showToast(msg, 'error', rechargeUrl ? {
                        label: '去充值 →',
                        callback: () => window.open(rechargeUrl, '_blank'),
                    } : null);
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

    // 继续生成（插入隐藏的 [请继续] 消息后调用 chat）
    function continueGeneration() {
        if (isStreaming.value) {
            showToast('请等待当前回复完成', 'error');
            return;
        }
        const targetRoleId = currentRole.value.id;
        messages.value.push({
            role: 'user',
            content: '[请继续]',
            hidden: true,
            timestamp: Date.now(),
        });
        isThinking.value = true;
        chat('[请继续]', { targetRoleId }).catch(e => {
            if (e.name !== 'AbortError') {
                const { msg, isInsufficient } = getFriendlyError(e);
                const rechargeUrl = isInsufficient ? getRechargeUrl(globalSettings.baseUrl) : '';
                showToast(msg, 'error', rechargeUrl ? {
                    label: '去充值 →',
                    callback: () => window.open(rechargeUrl, '_blank'),
                } : null);
            }
        }).finally(() => {
            isStreaming.value = false;
            isThinking.value = false;
        });
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
        continueGeneration,
        deleteMessage,
        handleShiftEnter,
    };
}
