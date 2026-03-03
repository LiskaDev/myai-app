/**
 * 📖 对话导出为故事 (Story Exporter)
 *
 * 将对话记录整理为精美排版的 HTML 故事文档。
 * 支持两种模式：直接导出 / AI 润色导出。
 */

// ============== 颜色映射 ==============
const ROLE_COLORS = [
    '#818cf8', '#f472b6', '#34d399', '#fbbf24',
    '#60a5fa', '#a78bfa', '#fb923c', '#2dd4bf',
];

/**
 * 从消息中提取干净文本（处理 HTML 转义问题）
 * 优先使用 rawContent，fallback 到 content 并做 decode
 */
export function extractCleanContent(msg) {
    let text = msg.rawContent || msg.content || '';

    // 如果来自 content 且包含 HTML 标签/转义，做清理
    if (!msg.rawContent && text) {
        // 循环解码 HTML entities
        for (let i = 0; i < 10; i++) {
            const next = text
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            if (next === text) break;
            text = next;
        }
        // 去掉所有 rp-* span 标签（保留内部文字）
        text = text.replace(/<span class="rp-[^"]*"[^>]*>/g, '').replace(/<\/span>/g, '');
        // 去掉 <br> / <br/>
        text = text.replace(/<br\s*\/?>/g, '\n');
    }

    // 去掉 <think>...</think> 内容
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    // 去掉 <expr:xxx> 标签
    text = text.replace(/<expr:[^>]*>/g, '');

    return text.trim();
}

/**
 * 将干净文本格式化为故事 HTML 片段
 * 处理 *动作*、<inner> 内心、"对话" 等
 */
export function formatStorySegment(text, roleName, roleColor) {
    let html = escapeHtml(text);

    // 提取 <inner> 标签并格式化
    // 注意：escapeHtml 会将 < 变为 &lt;，所以需要先处理原始文本
    // 这里我们用原始文本重新处理
    let rawText = text;

    // 提取 inner 内容
    const innerMatches = [];
    rawText = rawText.replace(/<inner>([\s\S]*?)<\/inner>/g, (_, content) => {
        innerMatches.push(content.trim());
        return '';
    });

    // 现在重新 escape 干净的文本
    html = escapeHtml(rawText.trim());

    // 格式化 *动作* → 斜体灰紫色
    html = html.replace(/\*([^*]+)\*/g,
        '<em style="color:#94a3b8;font-style:italic;">$1</em>');

    // 格式化 "对话" → 正常白色
    html = html.replace(/"([^"]+)"/g, '"$1"');
    html = html.replace(/"([^"]+)"/g, '"$1"');

    // 换行
    html = html.replace(/\n/g, '<br>');

    // 添加内心独白
    let innerHtml = '';
    if (innerMatches.length > 0) {
        innerHtml = innerMatches.map(inner =>
            `<div class="inner-thought">💭 ${escapeHtml(inner)}</div>`
        ).join('');
    }

    return { html, innerHtml };
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 构建完整的故事 HTML 文档
 * @param {Array} messages 消息列表
 * @param {object} storyInfo { title, roleName, roleAvatar, roleColor?, isGroup, participants? }
 * @param {object} options { storyContent? } 如果有 AI 润色内容则使用
 * @returns {string} 完整 HTML 文档
 */
export function buildStoryHTML(messages, storyInfo, options = {}) {
    const {
        title = '我们的故事',
        roleName = '角色',
        isGroup = false,
        participants = [],
    } = storyInfo;

    const dateStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // 如果有 AI 润色内容，直接包装
    if (options.storyContent) {
        return wrapInHTMLDocument(title, roleName, dateStr, `
            <div class="story-text" style="line-height:2;font-size:1.05rem;color:#e0dce8;">
                ${escapeHtml(options.storyContent).replace(/\n/g, '<br>')}
            </div>
        `);
    }

    // 直接导出模式：逐条消息格式化
    const segments = [];
    let msgCount = 0;

    for (const msg of messages) {
        // 跳过系统消息和分隔线
        if (msg.role === 'system' || msg.type === 'day-separator') {
            if (msg.type === 'day-separator') {
                segments.push(`<div class="day-sep">── ${escapeHtml(msg.content || '')} ──</div>`);
            }
            continue;
        }
        if (msg.role === 'pass') continue;

        const content = extractCleanContent(msg);
        if (!content) continue;

        // 确定角色名和颜色
        let name, color;
        if (msg.role === 'user' || msg.role === 'director') {
            name = msg.role === 'director' ? '旁白' : '我';
            color = msg.role === 'director' ? '#6b7280' : '#60a5fa';
        } else if (msg.role === 'assistant') {
            if (isGroup && msg.roleName) {
                name = msg.roleName;
                const idx = participants.findIndex(p => p.name === msg.roleName);
                color = idx >= 0 ? ROLE_COLORS[idx % ROLE_COLORS.length] : ROLE_COLORS[0];
            } else {
                name = roleName;
                color = storyInfo.roleColor || ROLE_COLORS[0];
            }
        } else {
            name = msg.roleName || msg.role;
            color = '#9ca3af';
        }

        const { html, innerHtml } = formatStorySegment(content, name, color);

        segments.push(`
            <div class="msg-block">
                <span class="role-name" style="color:${color};">${escapeHtml(name)}</span>
                <div class="msg-content">${html}</div>
                ${innerHtml}
            </div>
        `);

        msgCount++;
        // 每 12 条消息插入呼吸间隔
        if (msgCount % 12 === 0) {
            segments.push('<div class="breath">· · ·</div>');
        }
    }

    return wrapInHTMLDocument(title, roleName, dateStr, segments.join('\n'));
}

/**
 * 包装为完整 HTML 文档
 */
function wrapInHTMLDocument(title, roleName, dateStr, bodyContent) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — ${escapeHtml(roleName)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body {
    background:#0d0f14;
    color:#e8e4d9;
    font-family:'Noto Serif SC', 'Georgia', 'Times New Roman', serif;
    line-height:1.9;
    min-height:100vh;
    -webkit-font-smoothing:antialiased;
}
.container {
    max-width:680px;
    margin:0 auto;
    padding:64px 32px 80px;
}
/* Cover */
.cover {
    text-align:center;
    margin-bottom:64px;
    padding:48px 0 40px;
    border-bottom:1px solid rgba(232,228,217,0.08);
}
.cover-deco {
    width:80px;
    height:1px;
    margin:0 auto 28px;
    background:linear-gradient(90deg,transparent,rgba(232,228,217,0.4),transparent);
}
.cover h1 {
    font-size:1.75rem;
    font-weight:700;
    color:#f5f0e8;
    margin-bottom:10px;
    letter-spacing:3px;
    line-height:1.4;
}
.cover .sub {
    font-size:0.8rem;
    color:rgba(232,228,217,0.35);
    margin-top:16px;
    letter-spacing:1px;
}
/* Messages */
.msg-block {
    margin-bottom:32px;
    padding-left:16px;
    border-left:2px solid rgba(232,228,217,0.06);
    transition:border-color 0.3s;
}
.msg-block:hover {
    border-left-color:rgba(232,228,217,0.15);
}
.role-name {
    font-size:0.78rem;
    font-weight:600;
    letter-spacing:1.5px;
    display:block;
    margin-bottom:8px;
    opacity:0.85;
}
.msg-content {
    font-size:1.02rem;
    line-height:2;
    color:#ddd8cc;
}
.msg-content em {
    color:#94a3b8;
    font-style:italic;
}
/* Day separator */
.day-sep {
    text-align:center;
    color:rgba(232,228,217,0.2);
    font-size:0.8rem;
    margin:48px 0;
    letter-spacing:6px;
}
/* Breathing gap */
.breath {
    text-align:center;
    color:rgba(232,228,217,0.12);
    font-size:0.9rem;
    margin:48px 0;
    letter-spacing:12px;
}
/* AI polished story text */
.story-text {
    text-indent:2em;
    color:#ddd8cc;
}
.story-text br + br { content:''; display:block; margin-top:1em; }
/* Inner thought */
.inner-thought {
    margin:10px 0;
    padding:10px 16px;
    border-left:2px solid rgba(148,163,184,0.2);
    color:rgba(148,163,184,0.65);
    font-style:italic;
    font-size:0.92em;
    line-height:1.7;
}
/* Footer */
.footer {
    text-align:center;
    margin-top:64px;
    padding-top:32px;
    border-top:1px solid rgba(232,228,217,0.06);
    color:rgba(232,228,217,0.18);
    font-size:0.72rem;
    letter-spacing:0.5px;
}
.footer a {
    color:rgba(232,228,217,0.3);
    text-decoration:none;
    border-bottom:1px solid rgba(232,228,217,0.1);
    transition:color 0.2s;
}
.footer a:hover { color:rgba(232,228,217,0.5); }
/* Mobile */
@media (max-width: 640px) {
    .container { padding:40px 20px 60px; }
    .cover h1 { font-size:1.4rem; }
    .msg-block { padding-left:12px; }
}
/* Print */
@media print {
    body { background:#fff; color:#1a1a1a; }
    .msg-content { color:#333; }
    .msg-block { border-left-color:#ddd; }
}
</style>
</head>
<body>
<div class="container">
    <div class="cover">
        <div class="cover-deco"></div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">${escapeHtml(dateStr)}</div>
    </div>
    ${bodyContent}
    <div class="footer">
        由 <a href="https://github.com/LiskaDev/myai-app" target="_blank">MyAI-RolePlay</a> 生成
    </div>
</div>
</body>
</html>`;
}

/**
 * 构建 AI 润色的 Prompt
 */
export function buildPolishPrompt(messages, roleName) {
    const dialogueLines = [];
    for (const msg of messages) {
        if (msg.role === 'system' || msg.type === 'day-separator' || msg.role === 'pass') continue;
        const content = extractCleanContent(msg);
        if (!content) continue;
        const name = msg.role === 'user' ? '「我」' : (msg.roleName || roleName);
        dialogueLines.push(`${name}: ${content}`);
    }
    // 限制长度避免 token 爆炸
    const truncated = dialogueLines.slice(-60).join('\n');

    return `你是一位小说家。请将以下角色扮演对话改写为第三人称小说叙述。

要求：
1. 保留所有关键剧情、对话和情感，不得删减内容
2. 将第一人称「我」转为第三人称（可用"他/她"或自然称呼）
3. 将 *动作* 描写融入叙事，增加文学性的环境描写和心理描写
4. 保持原对话的情感张力和节奏
5. 直接输出纯文本小说内容，不要添加标题、章节号或任何格式标记

对话记录：
${truncated}`;
}

/**
 * 调用 LLM 润色故事
 */
export async function polishStory(messages, roleName, apiConfig) {
    const prompt = buildPolishPrompt(messages, roleName);
    const baseUrl = (apiConfig.baseUrl || 'https://api.deepseek.com')
        .replace(/\/$/, '').replace(/\/chat\/completions$/, '');

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4000,
            temperature: 0.8,
        }),
    });

    if (!response.ok) {
        throw new Error(`API 错误 ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * 触发浏览器下载 HTML 文件
 */
export function downloadHTML(htmlContent, fileName) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
