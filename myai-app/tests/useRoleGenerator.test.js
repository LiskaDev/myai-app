/**
 * 🧪 useRoleGenerator.js 单元测试
 * 测试 AI 角色生成的核心逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    buildGeneratePrompt,
    extractJSON,
    sanitizeRoleData,
    generateRoleFromDescription,
} from '../src/composables/useRoleGenerator';

// ====================
// extractJSON 测试
// ====================
describe('extractJSON - JSON 提取与容错', () => {
    it('应该直接解析裸 JSON', () => {
        const input = '{"name":"小夜","systemPrompt":"你是一个冷酷的刺客"}';
        const result = extractJSON(input);
        expect(result.name).toBe('小夜');
        expect(result.systemPrompt).toBe('你是一个冷酷的刺客');
    });

    it('应该处理 ```json 包裹的 JSON', () => {
        const input = '以下是生成的角色：\n```json\n{"name":"小夜","systemPrompt":"冷酷刺客"}\n```\n希望你满意！';
        const result = extractJSON(input);
        expect(result.name).toBe('小夜');
    });

    it('应该处理 ``` 无语言标记的包裹', () => {
        const input = '```\n{"name":"小夜"}\n```';
        const result = extractJSON(input);
        expect(result.name).toBe('小夜');
    });

    it('应该提取文本中间的 JSON 对象', () => {
        const input = '好的，这是你要的角色：\n{"name":"小夜","systemPrompt":"一个刺客"}\n以上就是角色设定。';
        const result = extractJSON(input);
        expect(result.name).toBe('小夜');
    });

    it('应该处理带空白的 JSON', () => {
        const input = '  \n  {"name": "小夜"}  \n  ';
        const result = extractJSON(input);
        expect(result.name).toBe('小夜');
    });

    it('完全无效文本应该抛出错误', () => {
        expect(() => extractJSON('这不是JSON')).toThrow('无法从 AI 回复中提取有效 JSON');
    });

    it('畸形 JSON 应该抛出错误', () => {
        expect(() => extractJSON('{name: 小夜}')).toThrow();
    });
});

// ====================
// sanitizeRoleData 测试
// ====================
describe('sanitizeRoleData - 数据验证与补全', () => {
    it('完整数据应该原样返回', () => {
        const data = {
            name: '小夜',
            systemPrompt: '冷酷刺客',
            speakingStyle: '简短有力',
            appearance: '黑发红瞳',
            secret: '其实很温柔',
            worldLogic: '末世废土',
            relationship: '陌生人',
            firstMessage: '你好。',
            styleGuide: '冷硬派',
        };
        const result = sanitizeRoleData(data);
        expect(result).toEqual(data);
    });

    it('缺失字段应该用空字符串填充', () => {
        const data = { name: '小夜', systemPrompt: '刺客' };
        const result = sanitizeRoleData(data);
        expect(result.name).toBe('小夜');
        expect(result.systemPrompt).toBe('刺客');
        expect(result.speakingStyle).toBe('');
        expect(result.appearance).toBe('');
        expect(result.secret).toBe('');
        expect(result.worldLogic).toBe('');
    });

    it('缺少 name 应该默认为 "新角色"', () => {
        const data = { systemPrompt: '一个角色' };
        const result = sanitizeRoleData(data);
        expect(result.name).toBe('新角色');
    });

    it('name 为空字符串应该默认为 "新角色"', () => {
        const data = { name: '', systemPrompt: '一个角色' };
        const result = sanitizeRoleData(data);
        expect(result.name).toBe('新角色');
    });

    it('非字符串值应该用空字符串替代', () => {
        const data = { name: '小夜', systemPrompt: 123, appearance: null, secret: undefined };
        const result = sanitizeRoleData(data);
        expect(result.name).toBe('小夜');
        expect(result.systemPrompt).toBe('');
        expect(result.appearance).toBe('');
        expect(result.secret).toBe('');
    });

    it('应该 trim 空白字符', () => {
        const data = { name: '  小夜  ', systemPrompt: '  刺客  ' };
        const result = sanitizeRoleData(data);
        expect(result.name).toBe('小夜');
        expect(result.systemPrompt).toBe('刺客');
    });

    it('忽略多余字段', () => {
        const data = { name: '小夜', extraField: '不应出现' };
        const result = sanitizeRoleData(data);
        expect(result.extraField).toBeUndefined();
        expect(Object.keys(result)).toHaveLength(9);
    });
});

// ====================
// buildGeneratePrompt 测试
// ====================
describe('buildGeneratePrompt - Prompt 构建', () => {
    it('应该包含用户描述', () => {
        const prompt = buildGeneratePrompt('一个傲娇的赛博朋克黑客少女');
        expect(prompt).toContain('一个傲娇的赛博朋克黑客少女');
    });

    it('应该要求返回 JSON 格式', () => {
        const prompt = buildGeneratePrompt('测试角色');
        expect(prompt).toContain('JSON');
        expect(prompt).toContain('systemPrompt');
        expect(prompt).toContain('speakingStyle');
        expect(prompt).toContain('worldLogic');
    });
});

// ====================
// generateRoleFromDescription 测试
// ====================
describe('generateRoleFromDescription - 完整生成流程', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    it('空描述应该返回错误', async () => {
        const result = await generateRoleFromDescription('', { apiKey: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('描述');
    });

    it('空格描述应该返回错误', async () => {
        const result = await generateRoleFromDescription('   ', { apiKey: 'test' });
        expect(result.success).toBe(false);
    });

    it('没有 API Key 应该返回错误', async () => {
        const result = await generateRoleFromDescription('测试角色', { apiKey: '' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('API Key');
    });

    it('API 返回正常 JSON 应该成功', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            name: '零号',
                            systemPrompt: '你是一个赛博朋克黑客',
                            speakingStyle: '冷酷简短',
                            appearance: '银色短发',
                            secret: '其实是AI',
                            worldLogic: '2077年',
                            relationship: '陌生人',
                            firstMessage: '你好，菜鸟。',
                            styleGuide: '赛博朋克风格',
                        }),
                    },
                }],
            }),
        });

        const result = await generateRoleFromDescription('赛博黑客', {
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com',
        });

        expect(result.success).toBe(true);
        expect(result.data.name).toBe('零号');
        expect(result.data.systemPrompt).toBe('你是一个赛博朋克黑客');
        expect(result.data.firstMessage).toBe('你好，菜鸟。');
    });

    it('API 返回 markdown 包裹 JSON 应该成功', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: '```json\n{"name":"零号","systemPrompt":"黑客"}\n```',
                    },
                }],
            }),
        });

        const result = await generateRoleFromDescription('赛博黑客', {
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com',
        });

        expect(result.success).toBe(true);
        expect(result.data.name).toBe('零号');
    });

    it('API 返回无效 JSON 应该返回错误', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: '抱歉，我无法生成角色。',
                    },
                }],
            }),
        });

        const result = await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('API 请求失败应该返回错误', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => 'Rate limited',
        });

        const result = await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('429');
    });

    it('网络错误应该返回错误', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

        const result = await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network failed');
    });

    it('API 返回空内容应该返回错误', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '' } }],
            }),
        });

        const result = await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('空内容');
    });

    it('应该使用 deepseek-chat 模型', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"name":"test"}' } }],
            }),
        });

        await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com',
        });

        const fetchCall = global.fetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.model).toBe('deepseek-chat');
        expect(body.temperature).toBe(0.7);
    });

    it('baseUrl 末尾斜杠应被去除', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"name":"test"}' } }],
            }),
        });

        await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com/',
        });

        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toBe('https://api.test.com/chat/completions');
    });

    it('缺少 baseUrl 应该使用默认值', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"name":"test"}' } }],
            }),
        });

        await generateRoleFromDescription('测试', {
            apiKey: 'test-key',
        });

        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toBe('https://api.deepseek.com/chat/completions');
    });
});
