import { ref, computed } from 'vue';
import { loadUserPersona, saveUserPersona } from '../utils/storage.js';

/**
 * 全局用户画像 composable（单例）
 * 自动分析用户聊天记录，提取长期偏好/性格/事实，注入到所有角色的 prompt 中
 */
let _instance = null;

export function useUserPersona() {
    if (_instance) return _instance;

    const persona = ref(loadUserPersona());

    // ==================== 计算属性 ====================

    const traits = computed(() => persona.value.traits);

    const traitsByCategory = computed(() => {
        const map = {};
        for (const t of persona.value.traits) {
            if (!map[t.category]) map[t.category] = [];
            map[t.category].push(t);
        }
        return map;
    });

    // 用于注入 Prompt 的纯文本摘要
    const personaSummaryForPrompt = computed(() => {
        if (persona.value.traits.length === 0) return '';

        const categoryLabels = {
            preference: '偏好', personality: '性格',
            fact: '事实', style: '风格', boundary: '雷区',
        };

        const lines = persona.value.traits.map(t => {
            const label = categoryLabels[t.category] || t.category;
            return `- [${label}] ${t.content}`;
        });

        return (
            '\n\n【关于与你对话的用户的情报】\n' +
            '在长期接触中，你观察到了以下关于该用户的信息：\n' +
            lines.join('\n') +
            '\n你必须将这些信息作为对话的基础认知：\n' +
            '1. 偏好/风格：主动迎合用户的喜好，往他们喜欢的方向发展剧情\n' +
            '2. 性格：理解用户的沟通风格，匹配他们的节奏和语气\n' +
            '3. 雷区：严格禁止涉及任何雷区内容，即使剧情需要也绝不触碰\n' +
            '4. 事实：自然地在对话中体现你记住了这些信息（如用户的职业、喜好等）'
        );
    });

    // ==================== 分析函数 ====================

    async function analyzeChatHistory(messages, apiConfig) {
        const recentMessages = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-15);

        if (recentMessages.length < 3) return;

        const existingTraitsText =
            persona.value.traits.length > 0
                ? persona.value.traits.map(t => `[${t.category}] ${t.content}`).join('\n')
                : '（暂无已有记录）';

        const analysisPrompt = `你是一个专业的用户偏好分析师，服务于一个 AI 角色扮演平台。
请分析以下用户与 AI 角色的对话记录，提取关于【用户本人】的长期有价值的情报。

【已有画像记录（提取时必须去重，不得与以下内容语义重复）】
${existingTraitsText}

【黑名单——绝对不提取以下内容】
- 用户扮演的角色的行为、台词、性格（这是虚构的，不代表用户本人）
- 对话中的剧情决定、场景描述
- 短暂动作（如"我刚吃饭"、"今天很累"）
- 日常寒暄和礼貌用语

【白名单——必须提取以下类型】
- 长期客观事实（职业、地区、年龄段等）
- 稳定偏好（喜欢/讨厌某类题材、风格、内容）
- 性格底色（用户在多条消息中稳定体现出的特质）
- 角色扮演风格偏好（偏好的剧情走向、互动方式）
- 明确表达的雷区或不适（重要！必须提取）

【待分析的对话记录】
${recentMessages.map(m => `${m.role === 'user' ? '用户' : 'AI'}：${(m.rawContent || m.content || '').substring(0, 200)}`).join('\n')}

【输出要求】
如果没有新的、不重复的白名单信息，返回：{"new_traits": []}
如果有，请严格按以下 JSON 格式返回，不要输出任何其他内容：
{
  "new_traits": [
    {
      "category": "preference",
      "content": "具体描述，使用第三人称，15字以内"
    }
  ]
}
category 只能是以下五种之一：preference / personality / fact / style / boundary`;

        try {
            const baseUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');

            // 使用便宜的模型做分析
            const model = apiConfig.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (apiConfig.model || 'deepseek-chat');

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 500,
                    temperature: 0.3,
                    messages: [{ role: 'user', content: analysisPrompt }],
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) return;

            const data = await response.json();
            const rawText = data.choices?.[0]?.message?.content || '';

            const cleanedText = rawText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            const parsed = JSON.parse(cleanedText);
            const newTraits = parsed?.new_traits;

            if (!Array.isArray(newTraits) || newTraits.length === 0) return;

            const validCategories = ['preference', 'personality', 'fact', 'style', 'boundary'];
            const toAdd = newTraits
                .filter(t => t.content && validCategories.includes(t.category))
                .map(t => ({
                    id: crypto.randomUUID(),
                    category: t.category,
                    content: t.content.trim(),
                    createdAt: new Date().toISOString(),
                    source: 'auto',
                }));

            if (toAdd.length === 0) return;

            persona.value.traits = [...persona.value.traits, ...toAdd];
            persona.value.messageCountSinceLastAnalysis = 0;
            saveUserPersona(persona.value);

            // v5.9: 检查是否需要精炼
            const MAX_TRAITS = 20;
            if (persona.value.traits.length > MAX_TRAITS) {
                await consolidateTraits(apiConfig);
            }
        } catch {
            // 静默失败
            persona.value.messageCountSinceLastAnalysis = 0;
        }
    }

    /**
     * v5.9: AI 智能精炼画像
     * 当 traits 数量超过上限时，使用 AI 合并语义重复、淘汰过时、精简列表
     * boundary（雷区）类型永远不会被删除
     */
    async function consolidateTraits(apiConfig) {
        const currentTraits = persona.value.traits;
        const boundaries = currentTraits.filter(t => t.category === 'boundary');
        const others = currentTraits.filter(t => t.category !== 'boundary');

        if (others.length <= 12) return; // 无需精炼

        const consolidatePrompt = `你是用户画像精炼专家。以下是对一个用户的长期观察记录，请将它们合并精炼。

当前画像条目（按时间排列，越后面越新）：
${others.map((t, i) => `${i + 1}. [${t.category}] ${t.content}`).join('\n')}

要求：
1. 合并语义重复的条目（如"喜欢猫"和"养了一只猫"→"养了猫，爱猫"）
2. 如果存在矛盾（新旧偏好冲突），保留更新的那个（序号更大的更新）
3. 保留真正有长期价值的特征，删除琐碎/临时性的
4. 精简到最多 12 条
5. 保持原有 category 分类（preference/personality/fact/style）
6. 内容用第三人称，每条 15 字以内

严格按 JSON 格式输出：{"refined": [{"category": "...", "content": "..."}]}`;

        try {
            const baseUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const model = apiConfig.model?.includes('reasoner')
                ? 'deepseek-chat'
                : (apiConfig.model || 'deepseek-chat');

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 600,
                    temperature: 0.2,
                    messages: [{ role: 'user', content: consolidatePrompt }],
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) return;

            const data = await response.json();
            const rawText = data.choices?.[0]?.message?.content || '';
            const cleanedText = rawText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            const parsed = JSON.parse(cleanedText);
            const refined = parsed?.refined;

            if (!Array.isArray(refined) || refined.length === 0) return;

            const validCategories = ['preference', 'personality', 'fact', 'style'];
            const refinedTraits = refined
                .filter(t => t.content && validCategories.includes(t.category))
                .map(t => ({
                    id: crypto.randomUUID(),
                    category: t.category,
                    content: t.content.trim(),
                    createdAt: new Date().toISOString(),
                    source: 'consolidated',
                }));

            if (refinedTraits.length === 0) return;

            // boundary 原封不动保留 + 精炼后的其他 traits
            persona.value.traits = [...boundaries, ...refinedTraits];
            saveUserPersona(persona.value);

            console.log(`[UserPersona] ✨ 画像已精炼：${others.length} → ${refinedTraits.length} 条（+ ${boundaries.length} 条雷区）`);
        } catch (error) {
            console.warn('[UserPersona] 精炼失败:', error.message);
        }
    }

    // ==================== 触发计数 ====================

    function onUserMessageSent(messages, apiConfig) {
        persona.value.messageCountSinceLastAnalysis += 1;
        saveUserPersona(persona.value);

        if (persona.value.messageCountSinceLastAnalysis >= 8) {
            analyzeChatHistory(messages, apiConfig).catch(() => { });
        }
    }

    // ==================== CRUD ====================

    function addTrait({ category, content }) {
        if (!content?.trim()) return;
        const validCategories = ['preference', 'personality', 'fact', 'style', 'boundary'];
        if (!validCategories.includes(category)) return;

        persona.value.traits.push({
            id: crypto.randomUUID(),
            category,
            content: content.trim(),
            createdAt: new Date().toISOString(),
            source: 'manual',
        });
        saveUserPersona(persona.value);
    }

    function removeTrait(id) {
        persona.value.traits = persona.value.traits.filter(t => t.id !== id);
        saveUserPersona(persona.value);
    }

    function clearAllTraits() {
        persona.value.traits = [];
        persona.value.messageCountSinceLastAnalysis = 0;
        saveUserPersona(persona.value);
    }

    _instance = {
        persona,
        traits,
        traitsByCategory,
        personaSummaryForPrompt,
        onUserMessageSent,
        addTrait,
        removeTrait,
        clearAllTraits,
    };

    return _instance;
}
