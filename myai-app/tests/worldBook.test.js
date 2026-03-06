/**
 * 🧪 worldBook.test.js — 世界书系统单元测试
 * 测试：关键词匹配、优先级排序、token 预算、position 分组、导入兼容性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createEntry,
    getActiveLoreEntries,
    importWorldBook,
} from '../src/composables/promptModules/worldBook.js';

// ── 辅助函数 ──
function makeMessages(contents) {
    return contents.map(c => ({ role: 'user', content: c }));
}

function makeLorebook(entries) {
    return entries.map(e => createEntry(e));
}

describe('worldBook - createEntry', () => {
    it('应该生成带默认值的条目', () => {
        const entry = createEntry();
        expect(entry.id).toBeTruthy();
        expect(entry.name).toBe('');
        expect(entry.keywords).toEqual([]);
        expect(entry.content).toBe('');
        expect(entry.enabled).toBe(true);
        expect(entry.priority).toBe(50);
        expect(entry.position).toBe('before_char');
    });

    it('应该支持覆盖默认值', () => {
        const entry = createEntry({ name: '蒙德城', priority: 80 });
        expect(entry.name).toBe('蒙德城');
        expect(entry.priority).toBe(80);
        expect(entry.enabled).toBe(true); // 未覆盖的保持默认
    });
});

describe('worldBook - getActiveLoreEntries', () => {
    it('空消息应该返回空结果', () => {
        const lorebook = makeLorebook([
            { name: '蒙德', keywords: ['蒙德'], content: '蒙德是风之城' },
        ]);
        const result = getActiveLoreEntries([], lorebook);
        expect(result.before).toEqual([]);
        expect(result.after).toEqual([]);
    });

    it('空世界书应该返回空结果', () => {
        const result = getActiveLoreEntries(makeMessages(['你好']), []);
        expect(result.before).toEqual([]);
        expect(result.after).toEqual([]);
    });

    it('关键词匹配应该激活条目', () => {
        const lorebook = makeLorebook([
            { name: '蒙德城', keywords: ['蒙德', '风之城'], content: '蒙德是风之城' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['我想去蒙德看看']), lorebook);
        expect(result.before).toEqual(['蒙德是风之城']);
    });

    it('关键词不匹配不应激活', () => {
        const lorebook = makeLorebook([
            { name: '蒙德城', keywords: ['蒙德'], content: '蒙德是风之城' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['璃月真漂亮']), lorebook);
        expect(result.before).toEqual([]);
    });

    it('关键词匹配应该不区分大小写', () => {
        const lorebook = makeLorebook([
            { name: 'Mondstadt', keywords: ['mondstadt'], content: 'City of Wind' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['Welcome to MONDSTADT!']), lorebook);
        expect(result.before).toEqual(['City of Wind']);
    });

    it('多关键词任一命中即可激活', () => {
        const lorebook = makeLorebook([
            { name: '风之神', keywords: ['巴巴托斯', '温迪', '风神'], content: '他是风之神' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['温迪在酒馆里唱歌']), lorebook);
        expect(result.before).toEqual(['他是风之神']);
    });

    it('未启用的条目不应被匹配', () => {
        const lorebook = makeLorebook([
            { name: '蒙德', keywords: ['蒙德'], content: '蒙德信息', enabled: false },
        ]);
        const result = getActiveLoreEntries(makeMessages(['蒙德之旅']), lorebook);
        expect(result.before).toEqual([]);
    });

    it('无 content 的条目不应被匹配', () => {
        const lorebook = makeLorebook([
            { name: '蒙德', keywords: ['蒙德'], content: '' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['蒙德之旅']), lorebook);
        expect(result.before).toEqual([]);
    });

    it('应该按 priority 降序排列', () => {
        const lorebook = makeLorebook([
            { name: '低优先', keywords: ['旅行'], content: '低优先内容', priority: 10 },
            { name: '高优先', keywords: ['旅行'], content: '高优先内容', priority: 90 },
            { name: '中优先', keywords: ['旅行'], content: '中优先内容', priority: 50 },
        ]);
        const result = getActiveLoreEntries(makeMessages(['去旅行']), lorebook);
        expect(result.before).toEqual(['高优先内容', '中优先内容', '低优先内容']);
    });

    it('应该按 position 分组', () => {
        const lorebook = makeLorebook([
            { name: '前置', keywords: ['龙'], content: '前置lore', position: 'before_char' },
            { name: '后置', keywords: ['龙'], content: '后置lore', position: 'after_char' },
        ]);
        const result = getActiveLoreEntries(makeMessages(['一条龙出现了']), lorebook);
        expect(result.before).toEqual(['前置lore']);
        expect(result.after).toEqual(['后置lore']);
    });

    it('超出 maxTokens 应该截止（但至少保留第一条）', () => {
        const longContent = '这是一段很长的内容。'.repeat(100); // ≈ 1000 中文字 ≈ 1500 token
        const lorebook = makeLorebook([
            { name: '长条目', keywords: ['测试'], content: longContent, priority: 90 },
            { name: '短条目', keywords: ['测试'], content: '短内容', priority: 10 },
        ]);
        const result = getActiveLoreEntries(makeMessages(['测试一下']), lorebook, { maxTokens: 100 });
        // 第一条超预算但仍保留（至少保留一条），第二条被截止
        expect(result.before.length).toBe(1);
        expect(result.before[0]).toBe(longContent);
    });

    it('scanDepth 应该限制扫描范围', () => {
        const messages = [
            { role: 'user', content: '蒙德真美' },    // 早期消息
            { role: 'assistant', content: '确实' },
            { role: 'user', content: '今天天气不错' }, // 最近消息
        ];
        const lorebook = makeLorebook([
            { name: '蒙德', keywords: ['蒙德'], content: '蒙德信息' },
        ]);
        // scanDepth=1 只扫最后1条消息，不会匹配到"蒙德"
        const result = getActiveLoreEntries(messages, lorebook, { scanDepth: 1 });
        expect(result.before).toEqual([]);

        // scanDepth=3 可以扫到
        const result2 = getActiveLoreEntries(messages, lorebook, { scanDepth: 3 });
        expect(result2.before).toEqual(['蒙德信息']);
    });

    it('应该同时扫描 rawContent', () => {
        const messages = [
            { role: 'assistant', content: '格式化后的内容', rawContent: '蒙德的风景真美' },
        ];
        const lorebook = makeLorebook([
            { name: '蒙德', keywords: ['蒙德'], content: '蒙德信息' },
        ]);
        const result = getActiveLoreEntries(messages, lorebook);
        expect(result.before).toEqual(['蒙德信息']);
    });
});

describe('worldBook - importWorldBook', () => {
    it('应该导入 MyAI 原生格式', () => {
        const json = JSON.stringify({
            type: 'myai_worldbook',
            entries: [{ name: '蒙德', keywords: ['蒙德'], content: '风之城' }],
        });
        const result = importWorldBook(json);
        expect(result.success).toBe(true);
        expect(result.entries.length).toBe(1);
        expect(result.entries[0].name).toBe('蒙德');
        expect(result.entries[0].id).toBeTruthy(); // 应该生成新 ID
    });

    it('应该导入 SillyTavern lorebook 格式', () => {
        const json = JSON.stringify({
            entries: {
                '0': { comment: '蒙德城', key: ['蒙德', '风之城'], content: '这是蒙德', disable: false, order: 80 },
                '1': { comment: '璃月', key: ['璃月'], content: '这是璃月', disable: true, order: 20 },
            },
        });
        const result = importWorldBook(json);
        expect(result.success).toBe(true);
        expect(result.entries.length).toBe(2);
        expect(result.entries[0].name).toBe('蒙德城');
        expect(result.entries[0].keywords).toEqual(['蒙德', '风之城']);
        expect(result.entries[0].priority).toBe(80);
        expect(result.entries[1].enabled).toBe(false); // disable: true → enabled: false
    });

    it('应该处理纯数组格式', () => {
        const json = JSON.stringify([
            { name: '测试', keywords: ['test'], content: '内容' },
        ]);
        const result = importWorldBook(json);
        expect(result.success).toBe(true);
        expect(result.entries.length).toBe(1);
    });

    it('无效 JSON 应该返回错误', () => {
        const result = importWorldBook('not json');
        expect(result.success).toBe(false);
        expect(result.error).toContain('JSON');
    });

    it('无法识别的格式应该返回错误', () => {
        const result = importWorldBook(JSON.stringify({ foo: 'bar' }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('无法识别');
    });

    it('SillyTavern key 为逗号分隔字符串时应正确拆分', () => {
        const json = JSON.stringify({
            entries: [
                { comment: '测试', key: '关键词A,关键词B', content: '内容' },
            ],
        });
        const result = importWorldBook(json);
        expect(result.success).toBe(true);
        expect(result.entries[0].keywords).toEqual(['关键词A', '关键词B']);
    });
});
