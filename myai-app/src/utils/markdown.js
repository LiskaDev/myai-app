import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { extractImageTags } from './textParser';

// 禁用 GFM 删除线扩展：防止 AI 回复中的 ~~text~~ 被渲染成删除线
marked.use({
    extensions: [{
        name: 'del',
        level: 'inline',
        start(src) { return undefined; },  // 不匹配任何内容，等于禁用
    }]
});

marked.setOptions({
    breaks: true,
    gfm: true,
});

// 配置 DOMPurify - 严格的白名单模式
const PURIFY_CONFIG = {
    ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u',
        'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
        'a', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
        'img', 'div'  // v5.4: AI 生成图片
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'title', 'src', 'alt', 'loading'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    // 防止 javascript: 协议链接
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

// 渲染 Markdown - 增强版，支持动作描写
export function renderMarkdown(content) {
    if (!content) return '';

    // v5.4: 先提取 <image:> 标签并替换为 <img> HTML
    const { content: imageProcessed } = extractImageTags(content);

    // 处理自定义格式 *动作描写* -> <span class="action-text">动作描写</span>
    let processed = imageProcessed.replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, '<span class="action-text">*$1*</span>');

    // 然后用 marked 解析 Markdown
    const rawHtml = marked.parse(processed);

    // 🛡️ 关键安全措施：使用 DOMPurify 清洗 HTML 输出
    return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
}

// 解析双层响应格式 (think + inner + content)
export function parseDualLayerResponse(text) {
    const result = {
        thinking: '',
        thinkingComplete: false,
        inner: '',
        content: '',
        rawContent: text, // 保留原始内容用于编辑
    };

    if (!text) return result;

    // Extract <think>...</think>
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
        result.thinking = thinkMatch[1].trim();
        result.thinkingComplete = true;
        text = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    } else if (text.includes('<think>')) {
        // Incomplete thinking (still streaming)
        const thinkStart = text.indexOf('<think>');
        result.thinking = text.slice(thinkStart + 7).trim();
        result.thinkingComplete = false;
        text = text.slice(0, thinkStart).trim();
    }

    // Extract <inner>...</inner>
    const innerMatch = text.match(/<inner>([\s\S]*?)<\/inner>/);
    if (innerMatch) {
        result.inner = innerMatch[1].trim();
        text = text.replace(/<inner>[\s\S]*?<\/inner>/, '').trim();
    }

    result.content = text;
    return result;
}

// 解析视觉小说格式消息 (用于细粒度渲染)
export function parseMessage(content) {
    if (!content) return [];

    const segments = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 检测动作描写 (*action* 或 「action」)
        if (/^\*[^*]+\*$/.test(trimmed) || /^「[^」]+」$/.test(trimmed)) {
            segments.push({ type: 'action', text: trimmed.slice(1, -1) });
        }
        // 检测对话 ("dialogue" 或 「dialogue」)
        else if (/^["「][^"」]+["」]$/.test(trimmed)) {
            segments.push({ type: 'dialogue', text: trimmed });
        }
        // 普通文本
        else {
            segments.push({ type: 'text', text: trimmed });
        }
    }

    return segments;
}
