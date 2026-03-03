/**
 * 🎭 一句话生成角色 (One-Click Role Generator)
 * 
 * 用户输入一句自然语言描述，调用 LLM 生成完整角色人设 JSON。
 * 返回的字段与 createNewRoleData() 数据模型对齐。
 */

const GENERATE_TIMEOUT_MS = 30000;

/**
 * 构建角色生成的 Prompt
 * @param {string} description 用户的角色描述
 * @returns {string} 发给 LLM 的完整 Prompt
 */
export function buildGeneratePrompt(description) {
    return `你是一个专业的角色设计师。根据下方描述，为 AI 角色扮演游戏创建一个详细的角色设定。

严格要求：
1. 只返回一个 JSON 对象，不带任何多余文字、markdown 标记或解释
2. 所有字段必须是中文
3. systemPrompt 是最重要的字段，要包含完整的角色身份、性格特征、行为模式

用户描述：${description}

JSON 格式：
{
  "name": "角色名字",
  "systemPrompt": "完整角色人设：身份、性格特征、行为习惯、说话特点（200字内）",
  "speakingStyle": "说话风格/口癖描述（30字内）",
  "appearance": "外貌特征（50字内）",
  "secret": "角色内心的秘密或隐藏动机（30字内）",
  "worldLogic": "故事发生的世界观设定（30字内）",
  "relationship": "与用户的初始关系（20字内）",
  "firstMessage": "角色的开场白，要符合角色性格（50字内）",
  "styleGuide": "AI 写作风格指导（30字内）"
}`;
}

/**
 * 从 LLM 返回的文本中提取 JSON
 * 容错处理：支持裸 JSON、```json 包裹、带前后缀文字
 * @param {string} text LLM 返回的原始文本
 * @returns {object} 解析后的 JSON 对象
 */
export function extractJSON(text) {
    // 策略 1: 尝试直接解析
    try {
        return JSON.parse(text.trim());
    } catch {
        // 继续尝试其他策略
    }

    // 策略 2: 移除 ```json ... ``` 包裹
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch {
            // 继续
        }
    }

    // 策略 3: 通过括号计数找到第一个完整 { ... } 块（比贪婪正则更精确）
    let braceDepth = 0;
    let startIdx = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (braceDepth === 0) startIdx = i;
            braceDepth++;
        } else if (text[i] === '}') {
            braceDepth--;
            if (braceDepth === 0 && startIdx !== -1) {
                try {
                    return JSON.parse(text.slice(startIdx, i + 1));
                } catch {
                    startIdx = -1; // 当前块解析失败，尝试找下一个 {
                }
            }
        }
    }

    throw new Error('无法从 AI 回复中提取有效 JSON');
}

/**
 * 验证并补全角色数据字段
 * 确保所有必要字段都存在，缺失的用空字符串填充
 * @param {object} data LLM 返回的角色数据
 * @returns {object} 补全后的角色数据
 */
export function sanitizeRoleData(data) {
    const fields = [
        'name', 'systemPrompt', 'speakingStyle', 'appearance',
        'secret', 'worldLogic', 'relationship', 'firstMessage', 'styleGuide'
    ];

    const result = {};
    for (const field of fields) {
        result[field] = typeof data[field] === 'string' ? data[field].trim() : '';
    }

    // name 不能为空
    if (!result.name) {
        result.name = '新角色';
    }

    return result;
}

/**
 * 调用 LLM 生成角色数据
 * @param {string} description 用户的自然语言描述
 * @param {object} apiConfig { baseUrl, apiKey, model? }
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function generateRoleFromDescription(description, apiConfig, externalSignal) {
    if (!description || !description.trim()) {
        return { success: false, error: '请输入角色描述' };
    }

    if (!apiConfig.apiKey) {
        return { success: false, error: '请先在设置中配置 API Key' };
    }

    const prompt = buildGeneratePrompt(description.trim());
    const baseUrl = (apiConfig.baseUrl || 'https://api.deepseek.com')
        .replace(/\/$/, '').replace(/\/chat\/completions$/, '');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

        // 如果有外部信号，监听它来中止内部控制器
        if (externalSignal) {
            if (externalSignal.aborted) {
                clearTimeout(timeoutId);
                return { success: false, error: '已取消' };
            }
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',  // 用便宜快速的模型
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.7,  // 给予创意空间
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`API 错误 ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('AI 返回了空内容');
        }

        const rawData = extractJSON(content);
        const roleData = sanitizeRoleData(rawData);

        return { success: true, data: roleData };
    } catch (error) {
        if (error.name === 'AbortError') {
            return { success: false, error: '已取消' };
        }
        return { success: false, error: error.message || '生成失败，请重试' };
    }
}
