/**
 * v5.3.1 终极解析器：双重流式卫兵 + 完整文本格式化
 *
 * 解决问题:
 * 1. 符号替换而非添加：去除原始标记符号，只显示自定义符号
 * 2. 所有 <inner> 标签都从正文中移除并提取
 * 3. 正确的分行显示
 * 4. 🛡️ 标签容错：AI 输出 </think > / < /think> / </Think> 等变体时不再卡死
 *
 * 使用 indexOf + substring（标签正规化后），稳定不会卡死。
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

// ========================================
// 🛡️ 标签容错正规化
// 修复 AI 输出 </think > 、</ think> 、<Think> 等变体导致解析失败
// ========================================
export function normalizeTags(text) {
    return text
        // Claude 的 <thinking> 标签 → 统一为 <think>（必须在 <think> 之前处理）
        .replace(/<\s*thinking\s*>/gi, '<think>')
        .replace(/<\s*\/\s*thinking\s*>/gi, '</think>')
        .replace(/<\s*think\s*>/gi, '<think>')
        .replace(/<\s*\/\s*think\s*>/gi, '</think>')
        .replace(/<\s*inner\s*>/gi, '<inner>')
        .replace(/<\s*\/\s*inner\s*>/gi, '</inner>');
}

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
        // 从正文移除标签（含开标签和闭标签）
        const content = text.replace(/<\/?expr:\w+>/gi, '').trim();
        return { content, expression };
    }

    // 2. 流式安全：隐藏残缺的 <expr... 片段（还在传输中）
    //    匹配: <e, <ex, <exp, <expr, <expr:, <expr:jo 等
    const partialMatch = text.match(/<e(?:x(?:p(?:r(?::(?:\w*)?)?)?)?)?$/i);
    if (partialMatch) {
        const content = text.substring(0, partialMatch.index).trim();
        return { content, expression: null };
    }

    // 3. 清理孤立的闭合标签 </expr:...>（AI 有时只输出闭合标签）
    const cleaned = text.replace(/<\/expr:\w+>/gi, '');
    if (cleaned !== text) {
        return { content: cleaned.trim(), expression: null };
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

    // Step 1: 先提取动作文本，避免动作里的引号被识别为对话
    const actionBlocks = [];
    html = html.replace(/\*([^*]+)\*/g, (_, actionText) => {
        const key = `<<ACTION_${actionBlocks.length}>>`;
        actionBlocks.push(actionText);
        return key;
    });

    // Step 2: 处理正文中的对话引号（动作文本已被占位排除）
    // v5.2: 不保留原始引号，让CSS的::before/::after显示自定义符号
    // 英文直引号
    html = html.replace(/&quot;([^&]*?)&quot;/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');
    html = html.replace(/&#39;([^&]*?)&#39;/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');
    // 中文弯引号 ""  ''
    html = html.replace(/\u201c([^\u201d]*?)\u201d/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');
    html = html.replace(/\u2018([^\u2019]*?)\u2019/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');
    // 直角引号 「」
    html = html.replace(/\u300c([^\u300d]*?)\u300d/g, '<<DIALOGUE_START>>$1<<DIALOGUE_END>>');

    // Step 3: Status/Prefix [...]  ->  <span class="rp-status">...</span>
    // v5.2: 去除方括号，只保留内容
    html = html.replace(/\[([^\]]+)\]/g, '<span class="rp-status">$1</span>');

    // Step 4: Thought/Feeling (...)  ->  <span class="rp-thought">...</span>
    // v5.2: 去除圆括号，只保留内容
    html = html.replace(/\(([^()]+)\)/g, '<span class="rp-thought">$1</span>');

    // Step 5: Convert dialogue placeholders to actual spans
    html = html.replace(/<<DIALOGUE_START>>/g, '<span class="rp-dialogue say">');
    html = html.replace(/<<DIALOGUE_END>>/g, '</span>');

    // Step 5.5: 还原动作文本
    html = html.replace(/<<ACTION_(\d+)>>/g, (_, idx) => {
        const actionText = actionBlocks[Number(idx)] ?? '';
        return `<span class="rp-action">${actionText}</span>`;
    });

    // Step 6: 无引号的纯对话行也标记为 say（只在渲染层加引号）
    html = html
        .split('\n')
        .map((line) => {
            const core = line.trim();
            if (!core) return line;
            if (core.includes('<span class="rp-dialogue')) return line;
            if (!core.includes('<span class="rp-')) {
                const leading = line.match(/^\s*/)?.[0] || '';
                const trailing = line.match(/\s*$/)?.[0] || '';
                return `${leading}<span class="rp-dialogue say">${core}</span>${trailing}`;
            }
            return line;
        })
        .join('\n');

    // Step 7: Convert line breaks — normalize paragraph spacing
    // 先把连续空行统一为段落间距，再处理单个换行
    html = html.replace(/\n{2,}/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

/**
 * 双重流式卫兵解析器 v5.3.1
 * 支持多个 <inner> 标签的提取
 * 🛡️ v5.3.1: 标签容错 + think 优先提取（避免 think 块内标签被误匹配）
 */
export function parseDualLayerResponse(rawText) {
    // 0. 安全兜底
    if (!rawText) return { reasoning: null, inner: null, content: "", expression: null };

    let reasoning = null;
    let inner = null;
    let expression = null;

    // 🛡️ 标签容错：统一 <think>/<inner> 标签格式
    // 修复 AI 输出 </think > 、</ think> 、<Think> 等变体导致解析失败的老 BUG
    let content = normalizeTags(rawText);

    // === 第一道关卡：R1 思考卫兵（优先于表情提取，避免 think 块内的标签被误匹配）===
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');

    if (thinkStart !== -1) {
        if (thinkEnd === -1 || thinkEnd < thinkStart) {
            // [状态：思考未闭合] -> ☢️ 全线阻断
            // 仍然尝试提取表情（用于流式头像显示）
            const exprResult = extractExpression(content);
            return {
                reasoning: content.substring(thinkStart + 7).trim(),
                inner: null,
                content: "", // 静默
                expression: exprResult.expression,
            };
        } else {
            // [状态：思考已闭合] -> ✅ 放行
            const thinkContent = content.substring(thinkStart + 7, thinkEnd);
            reasoning = thinkContent.trim();
            content = content.substring(0, thinkStart) + content.substring(thinkEnd + 8);
            content = content.trim();
        }
    } else if (thinkEnd !== -1) {
        // 🛡️ v6.1 FIX: 没有 <think> 但有 </think> — R1 模型有时省略开头标签
        // ⚠️ v6.2 FIX: 只有在 </think> 之后确实有内容时才认为前面是推理
        // 否则是 AI 意外在回复末尾追加了 </think>（非 R1 模型常见），直接清理标签
        const afterClose = content.substring(thinkEnd + 8).trim();
        if (afterClose.length > 0) {
            reasoning = content.substring(0, thinkEnd).trim();
            content = afterClose;
        } else {
            // </think> 后面没有内容：孤立关闭标签，清理掉，保留前面的内容作为正文
            content = content.substring(0, thinkEnd).trim();
        }
    }

    // 🛡️ 清理可能残留的孤立 </think> 标签
    content = content.replace(/<\/think>/gi, '').trim();


    // === 第零道关卡：表情标签提取（只从 think 之外的正文提取，更准确）===
    const exprResult = extractExpression(content);
    content = exprResult.content;
    expression = exprResult.expression;

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

    // 🔧 v6.2 选项B：inner 过长且正文为空时，降级把 inner 移到正文
    // 触发条件：正文空 + inner 字符数 > 60（超过1-2句内心独白的合理长度）
    // 原因：AI 误将动作/对话全塞进 <inner>，正文会是空白气泡
    if (!content && inner && inner.length > 60) {
        content = inner;
        inner = null;
    }

    // 🔧 v6.2 空载救援：AI 误将完整回复塞入 <think> 块时的 fallback
    // 触发条件：正文为空 + inner 未提取到 + reasoning 里含有 <inner> 标签
    // (<inner> 只出现在实际回复里，不会在真正的推理文字中)
    if (!content && !inner && reasoning && reasoning.indexOf('<inner>') !== -1) {
        const rescueResult = extractAllInnerTags(reasoning);
        if (rescueResult.inner) {
            inner = rescueResult.inner;
            const lastInnerClose = reasoning.lastIndexOf('</inner>');
            const afterLastInner = lastInnerClose >= 0
                ? reasoning.substring(lastInnerClose + 8).trim()
                : '';
            content = afterLastInner || '';
            // 截断 reasoning 到第一个 <inner> 之前，保留真正的推理文字
            const firstInnerStart = reasoning.indexOf('<inner>');
            reasoning = reasoning.substring(0, firstInnerStart).trim() || null;
        }
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
 * 🛡️ v5.3.1: 使用容错正则匹配标签变体
 */
export function stripThinkingTags(text) {
    if (!text) return '';
    let cleaned = normalizeTags(text);
    return cleaned
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
        .trim();
}

