/**
 * 关系矩阵与好感度系统 (Relationship Matrix & Affinity)
 * 
 * 管理群聊中角色之间的好感度数值 (-100 ~ 100)
 * 包含：矩阵 CRUD、数值转文字、Prompt 注入、AI 分析更新
 */

const AFFINITY_MIN = -100;
const AFFINITY_MAX = 100;

// 好感度区间 → 自然语言描述
const AFFINITY_LEVELS = [
    { min: -100, max: -60, label: '极度厌恶', en: 'deeply hostile' },
    { min: -59, max: -30, label: '反感', en: 'hostile' },
    { min: -29, max: -10, label: '有些不满', en: 'slightly displeased' },
    { min: -9, max: 9, label: '中立', en: 'neutral' },
    { min: 10, max: 29, label: '有些好感', en: 'somewhat friendly' },
    { min: 30, max: 59, label: '友好', en: 'friendly' },
    { min: 60, max: 100, label: '非常亲密', en: 'very close/trusting' },
];

// v5.6: 动态关系标签
const DYNAMIC_LABELS = [
    'ally',      // 盟友
    'rival',     // 寿手
    'crush',     // 暗恋
    'mentor',    // 导师
    'protector', // 保护者
    'enemy',     // 敌人
    'partner',   // 搭档
    'family',    // 家人
];

/**
 * 生成矩阵键名
 */
function matrixKey(fromId, toId) {
    return `${fromId}→${toId}`;
}

/**
 * 将好感度数值 clamp 到合法范围
 */
function clampAffinity(value) {
    return Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(value)));
}

/**
 * 将好感度数值转为自然语言描述
 */
function affinityToText(value) {
    const clamped = clampAffinity(value);
    for (const level of AFFINITY_LEVELS) {
        if (clamped >= level.min && clamped <= level.max) {
            return level.label;
        }
    }
    return '中立';
}

/**
 * 初始化关系矩阵
 * 为所有角色对 + director 维度生成初始好感度
 */
function initMatrix(participantIds) {
    const matrix = {};
    const allIds = [...participantIds, 'director'];

    for (const fromId of allIds) {
        for (const toId of allIds) {
            if (fromId !== toId) {
                matrix[matrixKey(fromId, toId)] = 0;
            }
        }
    }

    return matrix;
}

/**
 * v5.6: 获取动态标签
 */
function getDynamic(matrix, fromId, toId) {
    if (!matrix) return '';
    return matrix[`dynamic_${matrixKey(fromId, toId)}`] || '';
}

/**
 * v5.6: 设置动态标签
 */
function setDynamic(matrix, fromId, toId, label) {
    if (!matrix) return;
    if (label && DYNAMIC_LABELS.includes(label)) {
        matrix[`dynamic_${matrixKey(fromId, toId)}`] = label;
    } else {
        delete matrix[`dynamic_${matrixKey(fromId, toId)}`];
    }
}

/**
 * v5.6: 获取共同秘密
 */
function getSharedSecret(matrix, id1, id2) {
    if (!matrix) return '';
    // 排序保证两个方向查询结果一致
    const key = [id1, id2].sort().join('_');
    return matrix[`secret_${key}`] || '';
}

/**
 * v5.6: 设置共同秘密
 */
function setSharedSecret(matrix, id1, id2, secret) {
    if (!matrix) return;
    const key = [id1, id2].sort().join('_');
    if (secret) {
        matrix[`secret_${key}`] = secret;
    } else {
        delete matrix[`secret_${key}`];
    }
}

/**
 * 读取好感度
 */
function getAffinity(matrix, fromId, toId) {
    if (!matrix) return 0;
    return matrix[matrixKey(fromId, toId)] ?? 0;
}

/**
 * 设置好感度（自动 clamp）
 */
function setAffinity(matrix, fromId, toId, value) {
    if (!matrix) return;
    matrix[matrixKey(fromId, toId)] = clampAffinity(value);
}

/**
 * 同步矩阵：当增减成员时更新矩阵键
 * - 新成员：与所有现有成员建立中立关系
 * - 移除成员：删除相关键
 */
function syncMatrix(matrix, newParticipantIds) {
    const allIds = [...newParticipantIds, 'director'];
    const updated = {};

    for (const fromId of allIds) {
        for (const toId of allIds) {
            if (fromId !== toId) {
                const key = matrixKey(fromId, toId);
                // 保留已有数值，新关系默认 0
                updated[key] = matrix[key] ?? 0;
            }
        }
    }

    return updated;
}

/**
 * 为某角色构建关系提示文本（注入 System Prompt）
 * @param {string} roleId 目标角色 ID
 * @param {object} matrix 关系矩阵  
 * @param {Array} allParticipants 所有参与角色 [{id, name}]
 * @returns {string} 关系提示文本，如果全是中立则返回空字符串
 */
function buildRelationshipHint(roleId, matrix, allParticipants) {
    if (!matrix || Object.keys(matrix).length === 0) return '';

    const hints = [];

    // 对其他角色的好感度 + 动态标签 + 共同秘密
    for (const other of allParticipants) {
        if (other.id === roleId) continue;
        const value = getAffinity(matrix, roleId, other.id);
        const dynamic = getDynamic(matrix, roleId, other.id);
        const secret = getSharedSecret(matrix, roleId, other.id);

        const parts = [];
        if (value !== 0) {
            const text = affinityToText(value);
            parts.push(`${text}(${value > 0 ? '+' : ''}${value})`);
        }
        if (dynamic) parts.push(`[关系:「${dynamic}」]`);
        if (secret) parts.push(`[共同秘密: ${secret}]`);

        if (parts.length > 0) {
            hints.push(`对「${other.name}」：${parts.join(' ')}`);
        }
    }

    // 对导演的信任度
    const directorValue = getAffinity(matrix, roleId, 'director');
    if (directorValue !== 0) {
        const text = affinityToText(directorValue);
        hints.push(`对导演/主持人：${text}(${directorValue > 0 ? '+' : ''}${directorValue})`);
    }

    if (hints.length === 0) return '';

    return `[Relationship Dynamics - 当前情感倾向]
${hints.join('\n')}
请让这些情感和关系动态自然地影响你的态度、用词和行为，但不要直接引用这些数值。
[/Relationship Dynamics]`;
}

/**
 * AI 分析对话并更新好感度
 * 使用廉价模型分析最近对话中角色间关系的变化
 * 
 * @param {Array} recentMessages 最近的消息列表
 * @param {object} matrix 当前关系矩阵
 * @param {Array} participants 参与角色列表 [{id, name}]
 * @param {object} apiConfig {baseUrl, apiKey, model?}
 * @returns {object|null} 更新后的矩阵，失败返回 null
 */
async function analyzeAndUpdate(recentMessages, matrix, participants, apiConfig) {
    if (!recentMessages || recentMessages.length < 3) return null;
    if (!apiConfig.apiKey) return null;

    // 只取最近的 assistant 和 director 消息
    const relevantMsgs = recentMessages
        .filter(m => ['assistant', 'director'].includes(m.role))
        .slice(-10)
        .map(m => {
            if (m.role === 'director') return `[导演]: ${m.content}`;
            return `[${m.roleName}]: ${(m.rawContent || m.content || '').slice(0, 200)}`;
        })
        .filter(Boolean)
        .join('\n');

    if (!relevantMsgs) return null;

    // 构建角色名称映射
    const nameMap = {};
    for (const p of participants) {
        nameMap[p.name] = p.id;
    }
    const roleNames = participants.map(p => p.name).join('、');

    // 构建当前矩阵描述
    const currentState = [];
    const allIds = [...participants.map(p => p.id), 'director'];
    for (const fromId of allIds) {
        const fromName = fromId === 'director' ? '导演' :
            participants.find(p => p.id === fromId)?.name || fromId;
        for (const toId of allIds) {
            if (fromId === toId) continue;
            const toName = toId === 'director' ? '导演' :
                participants.find(p => p.id === toId)?.name || toId;
            const value = getAffinity(matrix, fromId, toId);
            currentState.push(`${fromName}→${toName}: ${value}`);
        }
    }

    const prompt = `你是一个角色关系分析器。请分析以下群聊对话，判断角色之间的好感度变化、动态关系标签和共同秘密。

参与角色：${roleNames}、导演

当前好感度矩阵（-100到30）：
${currentState.join('\n')}

最近对话：
${relevantMsgs}

请输出：
1. 好感度**变化量**（正数表示增加，负数表示降低，通常 ±1~10，极端 ±15）
2. 动态关系标签（可选，仅在关系明显时）：ally/rival/crush/mentor/protector/enemy/partner/family
3. 共同秘密（可选，仅在对话中显示两人有秘密时）

严格按以下 JSON 格式输出，不要加任何其他文字：
{"changes":[{"from":"角色名","to":"角色名","delta":数字,"dynamic":"标签或空","secret":"秘密或空"}]}

如果没有任何变化，输出：{"changes":[]}`;

    try {
        const baseUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            console.warn('[Relationship] API 错误:', response.status);
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content) return null;

        // 解析 JSON（允许被 ```json 包裹）
        const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const result = JSON.parse(jsonStr);

        if (!result.changes || !Array.isArray(result.changes)) return null;

        // 应用变化
        const updatedMatrix = { ...matrix };
        let anyChange = false;

        for (const change of result.changes) {
            if (!change.from || !change.to || typeof change.delta !== 'number') continue;
            if (Math.abs(change.delta) > 20) continue; // 安全限制：单次变化不超过 ±20

            const fromId = change.from === '导演' ? 'director' : nameMap[change.from];
            const toId = change.to === '导演' ? 'director' : nameMap[change.to];

            if (!fromId || !toId || fromId === toId) continue;

            const key = matrixKey(fromId, toId);
            const oldValue = updatedMatrix[key] ?? 0;
            updatedMatrix[key] = clampAffinity(oldValue + change.delta);
            anyChange = true;

            // v5.6: 处理动态标签
            if (change.dynamic && DYNAMIC_LABELS.includes(change.dynamic)) {
                updatedMatrix[`dynamic_${key}`] = change.dynamic;
            }
            // v5.6: 处理共同秘密
            if (change.secret && change.secret.length > 2) {
                const secretKey = [fromId, toId].sort().join('_');
                updatedMatrix[`secret_${secretKey}`] = change.secret;
            }

            console.log(`[Relationship] ${change.from}→${change.to}: ${oldValue} → ${updatedMatrix[key]} (${change.delta > 0 ? '+' : ''}${change.delta})${change.dynamic ? ` [${change.dynamic}]` : ''}`);
        }

        return anyChange ? updatedMatrix : null;

    } catch (error) {
        console.warn('[Relationship] 分析失败:', error.message);
        return null;
    }
}

export {
    AFFINITY_MIN,
    AFFINITY_MAX,
    AFFINITY_LEVELS,
    DYNAMIC_LABELS,
    matrixKey,
    clampAffinity,
    affinityToText,
    initMatrix,
    getAffinity,
    setAffinity,
    getDynamic,
    setDynamic,
    getSharedSecret,
    setSharedSecret,
    syncMatrix,
    buildRelationshipHint,
    analyzeAndUpdate,
};
