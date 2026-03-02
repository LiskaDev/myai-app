/**
 * 🧪 textParser.js 单元测试
 * 测试解析器、HTML 转义、格式化
 */

import { describe, it, expect } from 'vitest';
import {
    parseDualLayerResponse,
    formatRoleplayText,
    extractExpression
} from '../src/utils/textParser';

describe('parseDualLayerResponse', () => {
    it('应该解析普通内容', () => {
        const result = parseDualLayerResponse('Hello World');
        expect(result.content).toContain('Hello World');
        // 实际返回 null 而不是空字符串
        expect(result.reasoning).toBeFalsy();
        expect(result.inner).toBeFalsy();
    });

    it('应该提取 <think> 标签内容', () => {
        const input = '<think>这是思考过程</think>这是回答';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('这是思考过程');
        expect(result.content).toContain('这是回答');
    });

    it('应该提取 <inner> 标签内容', () => {
        const input = '回答内容 <inner>内心独白</inner>';
        const result = parseDualLayerResponse(input);
        expect(result.inner).toBe('内心独白');
    });

    it('应该处理未闭合的 <think> 标签（流式保护）', () => {
        const input = '<think>思考中...';
        const result = parseDualLayerResponse(input);
        // 未闭合时应该返回空内容
        expect(result.content).toBe('');
    });

    it('应该处理空输入', () => {
        expect(parseDualLayerResponse('')).toBeDefined();
        expect(parseDualLayerResponse(null)).toBeDefined();
        expect(parseDualLayerResponse(undefined)).toBeDefined();
    });
});

describe('formatRoleplayText - HTML 转义', () => {
    it('应该转义危险字符', () => {
        const input = '<script>alert("xss")</script>';
        const result = formatRoleplayText(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
    });

    it('应该格式化单引号对话', () => {
        // 单引号现在被视为对话标记
        const input = "test 'single quote'";
        const result = formatRoleplayText(input);
        expect(result).toContain('rp-dialogue');
    });

    it('应该转义反引号', () => {
        const input = 'code `example`';
        const result = formatRoleplayText(input);
        expect(result).toContain('&#96;');
    });

    it('应该处理空输入', () => {
        expect(formatRoleplayText('')).toBe('');
        expect(formatRoleplayText(null)).toBe('');
    });
});

describe('formatRoleplayText - 格式化标记', () => {
    it('应该格式化 *动作* 标记', () => {
        const input = '*微微一笑*';
        const result = formatRoleplayText(input);
        expect(result).toContain('rp-action');
    });

    it('应该格式化 "对话" 标记', () => {
        const input = '"你好"';
        const result = formatRoleplayText(input);
        expect(result).toContain('rp-dialogue');
    });

    it('应该格式化 (心理) 标记', () => {
        const input = '(心里想着)';
        const result = formatRoleplayText(input);
        expect(result).toContain('rp-thought');
    });

    it('应该格式化 [状态] 标记', () => {
        const input = '[开心]';
        const result = formatRoleplayText(input);
        expect(result).toContain('rp-status');
    });

    it('应该保留换行符', () => {
        const input = '第一行\n第二行';
        const result = formatRoleplayText(input);
        expect(result).toContain('<br>');
    });
});

describe('extractExpression - 表情标签提取', () => {
    it('应该提取完整的 <expr:emotion> 标签', () => {
        const result = extractExpression('<expr:joy>*微笑着* "你好"');
        expect(result.expression).toBe('joy');
        expect(result.content).toBe('*微笑着* "你好"');
    });

    it('支持所有8种有效情绪', () => {
        const emotions = ['joy', 'sad', 'angry', 'blush', 'surprise', 'scared', 'smirk', 'neutral'];
        for (const e of emotions) {
            const result = extractExpression(`<expr:${e}>test`);
            expect(result.expression).toBe(e);
        }
    });

    it('AI 自创词应映射到最近的有效情绪', () => {
        expect(extractExpression('<expr:happy>test').expression).toBe('joy');
        expect(extractExpression('<expr:furious>test').expression).toBe('angry');
        expect(extractExpression('<expr:shy>test').expression).toBe('blush');
        expect(extractExpression('<expr:terrified>test').expression).toBe('scared');
        expect(extractExpression('<expr:excited>test').expression).toBe('joy');
    });

    it('未知情绪应 fallback 为 neutral', () => {
        const result = extractExpression('<expr:whatisthis>test');
        expect(result.expression).toBe('neutral');
    });

    it('大小写不敏感', () => {
        expect(extractExpression('<expr:JOY>test').expression).toBe('joy');
        expect(extractExpression('<EXPR:SAD>test').expression).toBe('sad');
    });

    it('流式安全：隐藏残缺的 <expr', () => {
        expect(extractExpression('test<e').content).toBe('test');
        expect(extractExpression('test<ex').content).toBe('test');
        expect(extractExpression('test<exp').content).toBe('test');
        expect(extractExpression('test<expr').content).toBe('test');
        expect(extractExpression('test<expr:').content).toBe('test');
        expect(extractExpression('test<expr:jo').content).toBe('test');
    });

    it('流式残缺标签 expression 为 null', () => {
        expect(extractExpression('test<expr:jo').expression).toBeNull();
    });

    it('无标签时返回原内容', () => {
        const result = extractExpression('普通文本');
        expect(result.content).toBe('普通文本');
        expect(result.expression).toBeNull();
    });

    it('null/空输入不崩溃', () => {
        expect(extractExpression(null).expression).toBeNull();
        expect(extractExpression('').expression).toBeNull();
        expect(extractExpression(undefined).expression).toBeNull();
    });
});

describe('parseDualLayerResponse - expression 集成', () => {
    it('应该在返回值中包含 expression 字段', () => {
        const result = parseDualLayerResponse('<expr:angry>*拍桌子* "够了！"');
        expect(result.expression).toBe('angry');
        expect(result.content).not.toContain('expr');
    });

    it('无表情标签时 expression 为 null', () => {
        const result = parseDualLayerResponse('普通回复');
        expect(result.expression).toBeNull();
    });

    it('表情标签 + think 标签同时存在', () => {
        const result = parseDualLayerResponse('<expr:blush><think>思考中</think>*脸红了*');
        expect(result.expression).toBe('blush');
        expect(result.reasoning).toBe('思考中');
        expect(result.content).not.toContain('expr');
    });
});
