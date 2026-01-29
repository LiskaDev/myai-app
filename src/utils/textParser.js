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

/**
 * v5.3: 移除所有 <inner> 标签并提取内容
 * 支持多个 <inner> 标签
 */
function extractAllInnerTags(text) {
    let content = text;
    let allInner = [];

    // 循环处理所有 <inner> 标签
    while (true) {
        const innerStart = content.indexOf('<inner>');
        const innerEnd = content.indexOf('</inner>');

        if (innerStart === -1) {
            // 没有更多 <inner> 标签
            break;
        }

        if (innerEnd === -1) {
            // <inner> 未闭合 - 提取到末尾
            allInner.push(content.substring(innerStart + 7).trim());
            content = content.substring(0, innerStart).trim();
            break;
        }

        if (innerStart < innerEnd) {
            // 正常情况：提取内容并从原文中移除
            const innerContent = content.substring(innerStart + 7, innerEnd);
            allInner.push(innerContent.trim());
            content = content.substring(0, innerStart) + content.substring(innerEnd + 8);
        } else {
            // 异常情况：</inner> 在 <inner> 之前，跳过这个
            content = content.substring(innerEnd + 8);
        }
    }

    return {
        content: content.trim(),
        inner: allInner.length > 0 ? allInner.join('\n') : null,
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
    if (!rawText) return { reasoning: null, inner: null, content: "" };

    let reasoning = null;
    let inner = null;
    let content = rawText; // 初始文本

    // === 第一道关卡：R1 思考卫兵 ===
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');

    if (thinkStart !== -1) {
        if (thinkEnd === -1) {
            // [状态：思考未闭合] -> ☢️ 全线阻断
            return {
                reasoning: content.substring(thinkStart + 7).trim(),
                inner: null,
                content: "" // 静默
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
            content: "" // 静默
        };
    }

    // === 通关：剩余的才是正文 ===
    // 正文样式处理：应用完整的 formatRoleplayText
    if (content) {
        content = formatRoleplayText(content);
    }

    return {
        reasoning: reasoning,
        inner: inner,
        content: content
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
