/**
 * 🧪 useStoryExporter.js 单元测试
 * 测试内容提取、HTML 生成、AI 润色 Prompt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    extractCleanContent,
    formatStorySegment,
    buildStoryHTML,
    buildPolishPrompt,
    polishStory,
    downloadHTML,
} from '../src/composables/useStoryExporter';

// ====================
// extractCleanContent 测试
// ====================
describe('extractCleanContent - 内容提取与清理', () => {
    it('优先使用 rawContent', () => {
        const msg = { rawContent: '原始内容', content: '<span class="rp-action">被格式化的</span>' };
        expect(extractCleanContent(msg)).toBe('原始内容');
    });

    it('rawContent 不存在时使用 content', () => {
        const msg = { content: '简单内容' };
        expect(extractCleanContent(msg)).toBe('简单内容');
    });

    it('应该清理 HTML 转义实体', () => {
        const msg = { content: '&lt;b&gt;bold&lt;/b&gt; &amp; more' };
        expect(extractCleanContent(msg)).toBe('<b>bold</b> & more');
    });

    it('应该清理多重转义的 HTML', () => {
        const msg = { content: '&amp;amp;lt;span&amp;amp;gt;text&amp;amp;lt;/span&amp;amp;gt;' };
        const result = extractCleanContent(msg);
        expect(result).not.toContain('&amp;');
    });

    it('应该去除 rp-* span 标签', () => {
        const msg = { content: '<span class="rp-action">动作</span>和<span class="rp-dialogue">对话</span>' };
        expect(extractCleanContent(msg)).toBe('动作和对话');
    });

    it('应该去除 <think> 标签及内容', () => {
        const msg = { rawContent: '<think>这是思考</think>*她微笑着*' };
        expect(extractCleanContent(msg)).toBe('*她微笑着*');
    });

    it('应该去除 <expr:xxx> 标签', () => {
        const msg = { rawContent: '<expr:joy>*开心地跳了起来*' };
        expect(extractCleanContent(msg)).toBe('*开心地跳了起来*');
    });

    it('空消息应该返回空字符串', () => {
        expect(extractCleanContent({})).toBe('');
        expect(extractCleanContent({ content: '' })).toBe('');
    });

    it('应该 trim 结果', () => {
        const msg = { rawContent: '  内容  ' };
        expect(extractCleanContent(msg)).toBe('内容');
    });
});

// ====================
// formatStorySegment 测试
// ====================
describe('formatStorySegment - 文本格式化', () => {
    it('应该将 *动作* 格式化为斜体', () => {
        const { html } = formatStorySegment('*微笑着说*', '小夜', '#818cf8');
        expect(html).toContain('<em');
        expect(html).toContain('微笑着说');
    });

    it('应该提取 <inner> 标签为内心独白', () => {
        const { innerHtml } = formatStorySegment('<inner>好紧张</inner>*她低声说*', '小夜', '#818cf8');
        expect(innerHtml).toContain('好紧张');
        expect(innerHtml).toContain('💭');
    });

    it('无 <inner> 时内心独白为空', () => {
        const { innerHtml } = formatStorySegment('普通文本', '小夜', '#818cf8');
        expect(innerHtml).toBe('');
    });
});

// ====================
// buildStoryHTML 测试
// ====================
describe('buildStoryHTML - HTML 文档生成', () => {
    const testMessages = [
        { role: 'user', content: '你好，小夜' },
        { role: 'assistant', rawContent: '*微微一笑* "你好，旅行者。"' },
        { role: 'user', content: '今天天气真好' },
        { role: 'assistant', rawContent: '*抬头看向窗外* "是啊，适合出去走走。"' },
    ];

    it('应该生成完整的 HTML 文档', () => {
        const html = buildStoryHTML(testMessages, {
            title: '测试故事',
            roleName: '小夜',
        });
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('测试故事');
        expect(html).toContain('小夜');
        expect(html).toContain('</html>');
    });

    it('应该包含 Noto Serif SC 字体', () => {
        const html = buildStoryHTML(testMessages, { roleName: '小夜' });
        expect(html).toContain('Noto Serif SC');
    });

    it('应该包含 MyAI-RolePlay 水印', () => {
        const html = buildStoryHTML(testMessages, { roleName: '小夜' });
        expect(html).toContain('MyAI-RolePlay');
    });

    it('应该跳过 system 消息', () => {
        const msgs = [
            { role: 'system', content: '系统提示' },
            { role: 'user', content: '你好' },
        ];
        const html = buildStoryHTML(msgs, { roleName: '小夜' });
        expect(html).not.toContain('系统提示');
        expect(html).toContain('你好');
    });

    it('应该处理日期分隔线', () => {
        const msgs = [
            { role: 'user', content: '你好' },
            { type: 'day-separator', role: 'system', content: '── 第 2 天 ──' },
            { role: 'user', content: '早上好' },
        ];
        const html = buildStoryHTML(msgs, { roleName: '小夜' });
        expect(html).toContain('第 2 天');
    });

    it('AI 润色模式应该使用 storyContent', () => {
        const html = buildStoryHTML([], { roleName: '小夜' }, {
            storyContent: '她微笑着看向窗外...',
        });
        expect(html).toContain('她微笑着看向窗外');
        expect(html).toContain('story-text');
    });

    it('空消息列表应该生成空文档（不崩溃）', () => {
        const html = buildStoryHTML([], { roleName: '小夜' });
        expect(html).toContain('<!DOCTYPE html>');
    });

    it('群聊模式应该显示角色名', () => {
        const msgs = [
            { role: 'assistant', rawContent: '你好！', roleName: '小夜' },
            { role: 'assistant', rawContent: '嗨~', roleName: '小白' },
        ];
        const html = buildStoryHTML(msgs, {
            roleName: '群聊',
            isGroup: true,
            participants: [{ name: '小夜' }, { name: '小白' }],
        });
        expect(html).toContain('小夜');
        expect(html).toContain('小白');
    });
});

// ====================
// buildPolishPrompt 测试
// ====================
describe('buildPolishPrompt - AI 润色 Prompt', () => {
    it('应该包含对话内容', () => {
        const msgs = [
            { role: 'user', content: '你好' },
            { role: 'assistant', rawContent: '你好啊' },
        ];
        const prompt = buildPolishPrompt(msgs, '小夜');
        expect(prompt).toContain('你好');
        expect(prompt).toContain('小夜');
    });

    it('应该要求保留所有剧情', () => {
        const prompt = buildPolishPrompt([], '小夜');
        expect(prompt).toContain('保留');
        expect(prompt).toContain('不得删减');
    });

    it('应该要求第三人称', () => {
        const prompt = buildPolishPrompt([], '小夜');
        expect(prompt).toContain('第三人称');
    });

    it('应该跳过系统消息', () => {
        const msgs = [
            { role: 'system', content: '不应出现' },
            { role: 'user', content: '你好' },
        ];
        const prompt = buildPolishPrompt(msgs, '小夜');
        expect(prompt).not.toContain('不应出现');
    });

    it('应该限制消息数量（最多 60 条）', () => {
        const msgs = Array.from({ length: 100 }, (_, i) => ({
            role: 'user', content: `消息${i}`,
        }));
        const prompt = buildPolishPrompt(msgs, '小夜');
        expect(prompt).not.toContain('消息0');
        expect(prompt).toContain('消息99');
    });
});

// ====================
// polishStory 测试
// ====================
describe('polishStory - AI 润色调用', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    it('成功时应该返回润色内容', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '月光洒在她的脸上...' } }],
            }),
        });

        const result = await polishStory(
            [{ role: 'user', content: '你好' }],
            '小夜',
            { apiKey: 'test', baseUrl: 'https://api.test.com' }
        );
        expect(result).toBe('月光洒在她的脸上...');
    });

    it('API 失败应该抛出错误', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(polishStory([], '小夜', { apiKey: 'test' }))
            .rejects.toThrow('500');
    });
});

// ====================
// downloadHTML 测试
// ====================
describe('downloadHTML - 文件下载', () => {
    it('应该创建并点击下载链接', () => {
        const createElementSpy = vi.spyOn(document, 'createElement');
        const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => { });
        const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => { });
        const revokeObjURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });

        const mockLink = {
            href: '', download: '', click: vi.fn(),
        };
        createElementSpy.mockReturnValue(mockLink);

        downloadHTML('<html></html>', 'test.html');

        expect(mockLink.download).toBe('test.html');
        expect(mockLink.click).toHaveBeenCalled();

        createElementSpy.mockRestore();
        appendChildSpy.mockRestore();
        removeChildSpy.mockRestore();
        revokeObjURL.mockRestore();
    });
});
