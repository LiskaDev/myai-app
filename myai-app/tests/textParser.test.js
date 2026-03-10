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

    it('应该清理闭合标签 </expr:neutral>', () => {
        const result = extractExpression('*微笑*</expr:neutral>');
        expect(result.content).toBe('*微笑*');
        expect(result.expression).toBeNull();
    });

    it('应该同时清理开标签和闭标签', () => {
        const result = extractExpression('<expr:joy>*开心*</expr:joy>');
        expect(result.content).toBe('*开心*');
        expect(result.expression).toBe('joy');
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

// ========================================
// 🛡️ v5.3.1: 标签容错测试
// ========================================
describe('parseDualLayerResponse - 标签容错 (v5.3.1)', () => {
    it('应该处理 </think > (闭合标签空格变体)', () => {
        const input = '<think>这是思考</think >这是回答';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('这是思考');
        expect(result.content).toContain('这是回答');
    });

    it('应该处理 < /think> (斜杠前空格)', () => {
        const input = '<think>思考内容< /think>正文内容';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('思考内容');
        expect(result.content).toContain('正文内容');
    });

    it('应该处理 </Think> (大小写变体)', () => {
        const input = '<Think>思考过程</Think>回答内容';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('思考过程');
        expect(result.content).toContain('回答内容');
    });

    it('应该处理 < think > (开标签空格变体)', () => {
        const input = '< think >思考< /think >正文';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('思考');
        expect(result.content).toContain('正文');
    });

    it('应该处理 </inner > (内心戏闭合标签空格变体)', () => {
        const input = '<inner>内心独白</inner >正文';
        const result = parseDualLayerResponse(input);
        expect(result.inner).toBe('内心独白');
    });

    it('应该处理 < Inner > (内心戏大小写变体)', () => {
        const input = '正文 < Inner >心声</ Inner >';
        const result = parseDualLayerResponse(input);
        expect(result.inner).toBe('心声');
    });

    it('think 块内的 <expr:joy> 不应被误匹配为正文表情', () => {
        const input = '<think>需要加上<expr:joy>标签</think><expr:sad>*叹气*';
        const result = parseDualLayerResponse(input);
        // 表情应该从正文部分提取（sad），而不是 think 块内提到的（joy）
        expect(result.expression).toBe('sad');
        expect(result.reasoning).toContain('<expr:joy>');
    });

    it('完整场景：think + expr + inner + 正文（模拟真实 AI 输出）', () => {
        const input = '<think>用户说你好，我应该用<expr:joy>和<inner>来回应</think><expr:joy><inner>好开心遇到新朋友</inner>*微笑着挥手* "你好呀！"';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toContain('用户说你好');
        expect(result.expression).toBe('joy');
        expect(result.inner).toBe('好开心遇到新朋友');
        expect(result.content).toContain('rp-action');
        expect(result.content).toContain('rp-dialogue');
        expect(result.content).not.toContain('think');
        expect(result.content).not.toContain('inner');
        expect(result.content).not.toContain('expr');
    });

    it('完整场景 + 标签变体（模拟导致 bug 的 AI 输出）', () => {
        const input = '< think >用户打招呼，需要热情回应</ think ><expr:joy>< inner >新朋友来了！</ inner >*开心地* "你好！"';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toContain('用户打招呼');
        expect(result.expression).toBe('joy');
        expect(result.inner).toBe('新朋友来了！');
        expect(result.content).toContain('rp-dialogue');
        expect(result.content).not.toContain('think');
        expect(result.content).not.toContain('inner');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🐛 历史 Bug 回归测试（v6.2 修复）
// ─────────────────────────────────────────────────────────────────────────────
describe('parseDualLayerResponse - 回复塞入💡 bug 修复 (v6.2)', () => {

    it('[Bug A] 非R1模型在回复末尾意外加 </think> → 正文不能丢失', () => {
        // 模型输出整条回复 + 末尾意外追加 </think>，没有 <think> 开标签
        const input = '<inner>内心独白</inner>*指尖轻触剑柄*「难？」*翠绿眸子微眯*「精灵用三百年磨出这套剑术。」</think>';
        const result = parseDualLayerResponse(input);
        // reasoning 不应该拿走正文
        expect(result.reasoning).toBeFalsy();
        // 正文应该存在
        expect(result.content).toContain('指尖』'.replace('』', ''));
        expect(result.content).not.toContain('</think>');
        // inner 应该正常提取
        expect(result.inner).toBe('内心独白');
    });

    it('[Bug A] 无开标签 + </think> 后确实有内容 → 继续按 R1 省略开标签处理', () => {
        // R1 省略开标签的合法情况：</think> 后面有实际内容
        const input = '推理过程...\n分析完毕</think>\n*指尖轻触剑柄*「难吗？」';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toContain('推理过程');
        expect(result.content).toContain('指尖');
    });

    it('[Bug B] AI把 <inner>+对话 全写进 <think> 块，content不应为空', () => {
        // AI 输出：<think>推理...<inner>内心独白</inner>*动作* 「对话」</think>
        const input = '<think>用户问剑术难不难，我应该展现骄傲和严肃。<inner>他眼神认真。</inner>*指尖掠过剑刃*「精灵三百年的功底，不是儿戏。」</think>';
        const result = parseDualLayerResponse(input);
        // inner 应该从 reasoning 中被救援出来
        expect(result.inner).toBe('他眼神认真。');
        // 正文应该存在（对话被救援）
        expect(result.content).toContain('精灵');
        // reasoning 保留真正的思考部分
        expect(result.reasoning).toContain('用户问剑术');
    });

    it('[Bug B] think 块里只有 <inner>，没有额外正文 → inner 被救援', () => {
        const input = '<think>计划回复策略。<inner>这个问题很有趣。</inner></think>';
        const result = parseDualLayerResponse(input);
        expect(result.inner).toBe('这个问题很有趣。');
    });

    it('[选项B] AI 把动作/对话全塞进 <inner>（超过60字）→ 降级为正文显示', () => {
        // 常见错误：inner 里面包含完整的动作+对话，超过60字
        const overflowInner = '<inner>他问得真直接。*指尖沿着剑柄上的古老纹路轻轻摩挲，银发被晚风吹起几缕*「难？」*翠绿眸瞳在暮色里微微眯起*「精灵用三百年才把这套剑术磨到骨子里。每一个转身的弧度，每一次呼吸的节奏，都要和风的速度对齐。」</inner>';
        const result = parseDualLayerResponse(overflowInner);
        // inner 超过60字且正文为空 → 内容应移到正文，不再在💡里
        expect(result.inner).toBeNull();
        expect(result.content.length).toBeGreaterThan(0);
        // 正文应该包含动作描写
        expect(result.content).toContain('指尖');
    });

    it('[选项B] inner 短于60字 → 保留在💡不降级（正常情况）', () => {
        const shortInner = '<inner>他问得真直接，得让他明白这不是儿戏。</inner>*指尖轻触剑柄*「难吗？」';
        const result = parseDualLayerResponse(shortInner);
        // inner 短 → 保留在💡
        expect(result.inner).toContain('他问得真直接');
        // 正文也存在
        expect(result.content).toContain('指尖');
    });

    it('正常 think + inner + 正文格式不受影响', () => {
        const input = '<think>推理</think><inner>内心</inner>*动作*「对话」';
        const result = parseDualLayerResponse(input);
        expect(result.reasoning).toBe('推理');
        expect(result.inner).toBe('内心');
        expect(result.content).toContain('rp-action');
        expect(result.content).toContain('rp-dialogue');
    });
});
