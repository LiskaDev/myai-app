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
            '\n请在符合你当前角色设定的前提下，在未来的对话中自然地、不经意地体现出你了解这些信息，' +
            '将其作为对话的隐含背景。如有"雷区"类型的条目，请严格避免涉及相关内容。'
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
        } catch {
            // 静默失败
            persona.value.messageCountSinceLastAnalysis = 0;
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
