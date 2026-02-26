/**
 * v5.3 终极解析器：双重流式卫兵 + 完整文本格式化
 * 
 * 解决问题:
 * 1. 符号替换而非添加：去除原始标记符号，只显示自定义符号
 * 2. 所有 <inner> 标签都从正文中移除并提取
 * 3. 正确的分行显示
 * 
 * 使用 indexOf + substring 而非正则，更稳定不会卡死。
 */

// ========================================
// v5.2: 表情标签系统 (Expression Avatar)
// ========================================

// 允许的情绪列表
const VALID_EXPRESSIONS = ['joy', 'sad', 'angry', 'blush', 'surprise', 'scared', 'smirk', 'neutral'];

// AI 自创词 → 最近匹配映射
const EXPRESSION_FALLBACK = {
    happy: 'joy', excited: 'joy', cheerful: 'joy', delighted: 'joy', laugh: 'joy',
    crying: 'sad', depressed: 'sad', melancholy: 'sad', sorrow: 'sad', upset: 'sad',
    furious: 'angry', rage: 'angry', irritated: 'angry', mad: 'angry', annoyed: 'angry',
    shy: 'blush', embarrassed: 'blush', flustered: 'blush', bashful: 'blush',
    shocked: 'surprise', amazed: 'surprise', stunned: 'surprise', astonished: 'surprise',
    afraid: 'scared', terrified: 'scared', nervous: 'scared', anxious: 'scared', fear: 'scared',
    sly: 'smirk', teasing: 'smirk', mischievous: 'smirk', playful: 'smirk', cunning: 'smirk',
    calm: 'neutral', confused: 'neutral', thinking: 'neutral', serious: 'neutral',
};

/**
 * 提取 <expr:emotion> 标签
 * 流式安全：未完整的 <expr... 残片会被静默隐藏
 * 返回: { content: string, expression: string|null }
 */
export function extractExpression(text) {
    if (!text) return { content: text, expression: null };

    // 1. 尝试匹配完整标签 <expr:word>
    const fullMatch = text.match(/<expr:(\w+)>/i);
    if (fullMatch) {
        const rawEmotion = fullMatch[1].toLowerCase();
        // 校验 → 映射 → 兜底
        let expression = 'neutral';
        if (VALID_EXPRESSIONS.includes(rawEmotion)) {
            expression = rawEmotion;
        } else if (EXPRESSION_FALLBACK[rawEmotion]) {
            expression = EXPRESSION_FALLBACK[rawEmotion];
        }
        // 从正文移除标签
        const content = text.replace(/<expr:\w+>/gi, '').trim();
        return { content, expression };
    }

    // 2. 流式安全：隐藏残缺的 <expr... 片段（还在传输中）
    //    匹配: <e, <ex, <exp, <expr, <expr:, <expr:jo 等
    const partialMatch = text.match(/<e(?:x(?:p(?:r(?::(?:\w*)?)?)?)?)?$/i);
    if (partialMatch) {
        const content = text.substring(0, partialMatch.index).trim();
        return { content, expression: null };
    }

    return { content: text, expression: null };
}

/**
 * v5.4: 提取第一个 <inner> 标签到内心戏框
 * 后续 <inner> 标签去除标签，内容保留在正文中（以思绪样式显示）
 */
function extractAllInnerTags(text) {
    let content = text;
    let firstInner = null;
    let isFirst = true;

    // 循环处理所有 <inner> 标签
    while (true) {
        const innerStart = content.indexOf('<inner>');
        const innerEnd = content.indexOf('</inner>');

        if (innerStart === -1) {
            // 没有更多 <inner> 标签
            break;
        }

        if (innerEnd === -1) {
            // <inner> 未闭合 - 流式输出中
            const innerText = content.substring(innerStart + 7).trim();
            if (isFirst) {
                firstInner = innerText;
                content = content.substring(0, innerStart).trim();
            } else {
                // 后续未闭合的内心戏：保留文字在正文
                content = content.substring(0, innerStart) + '(' + innerText + ')';
            }
            break;
        }

        if (innerStart < innerEnd) {
            const innerText = content.substring(innerStart + 7, innerEnd).trim();
            if (isFirst) {
                // 第一个：提取到内心戏框，从正文移除
                firstInner = innerText;
                content = content.substring(0, innerStart) + content.substring(innerEnd + 8);
                isFirst = false;
            } else {
                // 后续的：去标签，内容包裹为 (思绪) 格式保留在正文
                content = content.substring(0, innerStart) + '(' + innerText + ')' + content.substring(innerEnd + 8);
            }
        } else {
            // 异常情况：</inner> 在 <inner> 之前，跳过
            content = content.substring(innerEnd + 8);
        }
    }

    return {
        content: content.trim(),
        inner: firstInner,
        hasUnclosed: text.indexOf('<inner>') !== -1 && text.indexOf('</inner>') === -1
    };
}

/**
 * v5.3 FIX: 
 * 1. Strip original markers from output (user wants replacement, not addition)
 * 2. Process dialogue FIRST before inserting any span tags
 * Order: HTML Escape -> Dialogue -> Status -> Thought -> Action -> Newlines
 */
export function formatRoleplayText(text) {
    // 安全检查：确保text是字符串
    if (text === null || text === undefined || typeof text !== 'string') {
        return '';
    }

    // Step 0: HTML Escape to prevent XSS (preserve newlines)
    // 完整转义：包括引号和反引号以防止属性注入
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');

    // Step 1: v5.1 - Process dialogue quotes FIRST (before any spans are inserted)
    // Using placeholder markers to avoid regex collision
    // v5.2: 不保留原始引号，让CSS的::before/::after显示自定义符号
    html = html.replace(/&quot;([^&]*?)&quot;/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');
    html = html.replace(/"([^"]*?)"/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');

    // Step 2: Status/Prefix [...]  ->  <span class="rp-status">...</span>
    // v5.2: 去除方括号，只保留内容
    html = html.replace(/\[([^\]]+)\]/g, '<span class="rp-status">$1</span>');

    // Step 3: Thought/Feeling (...)  ->  <span class="rp-thought">...</span>
    // v5.2: 去除圆括号，只保留内容
    html = html.replace(/\(([^()]+)\)/g, '<span class="rp-thought">$1</span>');

    // Step 4: Action/Environment *...*  ->  <span class="rp-action">...</span>
    // v5.2: 去除星号，只保留内容
    html = html.replace(/\*([^*]+)\*/g, '<span class="rp-action">$1</span>');

    // Step 5: Convert dialogue placeholders to actual spans
    html = html.replace(/<<DIALOGUE_START>>/g, '<span class="rp-dialogue">');
    html = html.replace(/<<DIALOGUE_END>>/g, '</span>');

    // Step 6: Convert line breaks to <br> for proper display
    html = html.replace(/\n/g, '<br>');

    return html;
}

/**
 * 双重流式卫兵解析器 v5.3
 * 支持多个 <inner> 标签的提取
 */
export function parseDualLayerResponse(rawText) {
    // 0. 安全兜底
    if (!rawText) return { reasoning: null, inner: null, content: "", expression: null };

    let reasoning = null;
    let inner = null;
    let expression = null;
    let content = rawText; // 初始文本

    // === 第零道关卡：表情标签提取 ===
    const exprResult = extractExpression(content);
    content = exprResult.content;
    expression = exprResult.expression;

    // === 第一道关卡：R1 思考卫兵 ===
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');

    if (thinkStart !== -1) {
        if (thinkEnd === -1) {
            // [状态：思考未闭合] -> ☢️ 全线阻断
            return {
                reasoning: content.substring(thinkStart + 7).trim(),
                inner: null,
                content: "", // 静默
                expression,
            };
        } else {
            // [状态：思考已闭合] -> ✅ 放行
            const thinkContent = content.substring(thinkStart + 7, thinkEnd);
            reasoning = thinkContent.trim();
            content = content.substring(0, thinkStart) + content.substring(thinkEnd + 8);
            content = content.trim();
        }
    }

    // === 第二道关卡：内心戏卫兵 (v5.3: 支持多个) ===
    const innerResult = extractAllInnerTags(content);
    content = innerResult.content;
    inner = innerResult.inner;

    // 如果有未闭合的 <inner>，阻断正文输出
    if (innerResult.hasUnclosed) {
        return {
            reasoning: reasoning,
            inner: inner,
            content: "", // 静默
            expression,
        };
    }

    // === 通关：剩余的才是正文 ===
    // 正文样式处理：应用完整的 formatRoleplayText
    // v5.7 FIX: 检测已经被格式化的内容（包含 rp-action/rp-dialogue 等 span），
    // 跳过二次处理避免 HTML 转义导致标签显示为文字
    if (content) {
        if (content.includes('<span class="rp-') || content.includes('<span class=\\"rp-')) {
            // 已经是格式化后的 HTML，直接使用
            // 不做任何处理
        } else {
            content = formatRoleplayText(content);
        }
    }

    return {
        reasoning: reasoning,
        inner: inner,
        content: content,
        expression: expression,
    };
}

/**
 * Strip tags from content (for TTS - don't read AI reasoning)
 */
export function stripThinkingTags(text) {
    if (!text) return '';
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
        .trim();
}

/**
 * Get custom style CSS variables for :style binding
 */
export function getCustomStyleVars(globalSettings) {
    if (!globalSettings || globalSettings.rpTextStyle !== 'custom') return {};
    const cs = globalSettings.customStyle || {};
    return {
        '--rp-action-color': cs.actionColor || '#a1a1aa',
        '--rp-action-symbol': '"' + (cs.actionSymbol || '*') + '"',
        '--rp-thought-color': cs.thoughtColor || '#78716c',
        '--rp-thought-symbol': '"' + (cs.thoughtSymbol || '(') + '"',
        '--rp-status-color': cs.statusColor || '#6b7280',
        '--rp-status-open': '"' + (cs.statusBracket ? cs.statusBracket[0] : '[') + '"',
        '--rp-status-close': '"' + (cs.statusBracket ? cs.statusBracket[1] : ']') + '"',
        '--rp-font-scale': cs.fontSize || 1,
        '--rp-dialogue-color': cs.dialogueColor || '#e5e7eb',
        '--rp-dialogue-open': '"' + (cs.dialogueSymbol || '"') + '"',
        '--rp-dialogue-close': '"' + (cs.dialogueSymbol || '"') + '"'
    };
}
