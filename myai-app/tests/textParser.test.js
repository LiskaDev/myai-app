/**
 * 🧪 textParser.js 单元测试
 * 测试解析器、HTML 转义、格式化
 */

import { describe, it, expect } from 'vitest';
import {
    parseDualLayerResponse,
    formatRoleplayText
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

    it('应该转义引号', () => {
        // 双引号会被转换为对话标记
        const input = "test 'single quote'";
        const result = formatRoleplayText(input);
        expect(result).toContain('&#39;');
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
