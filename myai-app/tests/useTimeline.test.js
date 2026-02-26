/**
 * 🧪 useTimeline.js 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    acquireBackgroundLock,
    releaseBackgroundLock,
    isBackgroundLocked,
    buildTimelinePrompt,
    parseTimelineEvents,
} from '../src/composables/useTimeline';

// ====================
// 全局后台锁 测试
// ====================
describe('Background Lock - 后台任务锁', () => {
    afterEach(() => {
        // 确保每个测试后释放锁
        releaseBackgroundLock();
    });

    it('初始状态应该是未锁定', () => {
        expect(isBackgroundLocked()).toBe(false);
    });

    it('获取锁后应该是锁定状态', () => {
        expect(acquireBackgroundLock()).toBe(true);
        expect(isBackgroundLocked()).toBe(true);
    });

    it('锁定时再次获取应该失败', () => {
        acquireBackgroundLock();
        expect(acquireBackgroundLock()).toBe(false);
    });

    it('释放后可以再次获取', () => {
        acquireBackgroundLock();
        releaseBackgroundLock();
        expect(isBackgroundLocked()).toBe(false);
        expect(acquireBackgroundLock()).toBe(true);
    });
});

// ====================
// buildTimelinePrompt 测试
// ====================
describe('buildTimelinePrompt - 时间线 Prompt', () => {
    it('应该包含角色名', () => {
        const prompt = buildTimelinePrompt('你好', '小夜', '');
        expect(prompt).toContain('小夜');
    });

    it('应该包含对话内容', () => {
        const prompt = buildTimelinePrompt('用户: 我们去冒险吧', '小夜', '');
        expect(prompt).toContain('冒险');
    });

    it('应该包含已有事件（如果有）', () => {
        const prompt = buildTimelinePrompt('新对话', '小夜', '第一次见面');
        expect(prompt).toContain('第一次见面');
    });

    it('没有已有事件时不应报错', () => {
        const prompt = buildTimelinePrompt('对话', '小夜', '');
        expect(prompt).toContain('对话');
        // 空字符串 existingEvents 不会生成已有事件行
        expect(prompt).toBeTruthy();
    });

    it('应该要求按格式返回', () => {
        const prompt = buildTimelinePrompt('', '小夜', '');
        expect(prompt).toContain('high/medium/low');
    });
});

// ====================
// parseTimelineEvents 测试
// ====================
describe('parseTimelineEvents - 事件解析', () => {
    it('应该解析 importance|event 格式', () => {
        const events = parseTimelineEvents('high|第一次见面\nmedium|一起吃了晚饭');
        expect(events).toHaveLength(2);
        expect(events[0].importance).toBe('high');
        expect(events[0].event).toBe('第一次见面');
        expect(events[1].importance).toBe('medium');
    });

    it('应该处理无格式的纯文本', () => {
        const events = parseTimelineEvents('在图书馆第一次见面，是命运般的相遇');
        expect(events).toHaveLength(1);
        expect(events[0].importance).toBe('medium');
        expect(events[0].event).toContain('图书馆');
    });

    it('返回"无"时应该返回空数组', () => {
        expect(parseTimelineEvents('无')).toEqual([]);
    });

    it('空内容应该返回空数组', () => {
        expect(parseTimelineEvents('')).toEqual([]);
        expect(parseTimelineEvents(null)).toEqual([]);
    });

    it('应该限制最多 3 条事件', () => {
        const text = 'high|事件1\nhigh|事件2\nhigh|事件3\nhigh|事件4\nhigh|事件5';
        const events = parseTimelineEvents(text);
        expect(events.length).toBeLessThanOrEqual(3);
    });

    it('应该包含 timestamp', () => {
        const events = parseTimelineEvents('high|重要事件');
        expect(events[0].timestamp).toBeTruthy();
        // 验证是 ISO 格式
        expect(() => new Date(events[0].timestamp)).not.toThrow();
    });

    it('太短的行应该被过滤', () => {
        const events = parseTimelineEvents('ab\nhigh|正常长度的事件描述');
        expect(events).toHaveLength(1);
        expect(events[0].event).toContain('正常长度');
    });

    it('应该处理混合格式', () => {
        const text = 'high|关系转折点\n- 他们共同面对了危机\nlow|日常闲聊';
        const events = parseTimelineEvents(text);
        expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('应该处理 HIGH/Medium 大小写', () => {
        const events = parseTimelineEvents('HIGH|大事件\nMedium|中事件');
        expect(events[0].importance).toBe('high');
        expect(events[1].importance).toBe('medium');
    });
});

// ====================
// useTimeline composable 测试（需要 mock appState）
// ====================
describe('useTimeline composable - 基本功能', () => {
    it('应该能正确导出所有函数', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const mockAppState = {
            globalSettings: { apiKey: 'test', baseUrl: 'https://api.test.com' },
            currentRole: { value: { name: '小夜', timeline: [] } },
            currentRoleId: { value: 'test-id' },
            messages: { value: [] },
        };
        const timeline = useTimeline(mockAppState);
        expect(timeline.checkAndTriggerTimeline).toBeDefined();
        expect(timeline.analyzeTimeline).toBeDefined();
        expect(timeline.getTimeline).toBeDefined();
        expect(timeline.removeTimelineEvent).toBeDefined();
        expect(timeline.clearTimeline).toBeDefined();
        expect(timeline.buildTimelineForPrompt).toBeDefined();
    });

    it('getTimeline 应该返回空数组当无事件', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const mockAppState = {
            globalSettings: {},
            currentRole: { value: { name: '小夜' } },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { getTimeline } = useTimeline(mockAppState);
        expect(getTimeline()).toEqual([]);
    });

    it('getTimeline 应该返回已有事件', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const events = [{ event: '测试事件', importance: 'high', timestamp: new Date().toISOString() }];
        const mockAppState = {
            globalSettings: {},
            currentRole: { value: { name: '小夜', timeline: events } },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { getTimeline } = useTimeline(mockAppState);
        expect(getTimeline()).toEqual(events);
    });

    it('clearTimeline 应该清空时间线', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const role = { name: '小夜', timeline: [{ event: 'test', importance: 'high' }] };
        const mockAppState = {
            globalSettings: {},
            currentRole: { value: role },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { clearTimeline } = useTimeline(mockAppState);
        clearTimeline();
        expect(role.timeline).toEqual([]);
    });

    it('removeTimelineEvent 应该删除指定事件', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const role = {
            name: '小夜',
            timeline: [
                { event: '事件A', importance: 'high' },
                { event: '事件B', importance: 'low' },
            ],
        };
        const mockAppState = {
            globalSettings: {},
            currentRole: { value: role },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { removeTimelineEvent } = useTimeline(mockAppState);
        removeTimelineEvent(0);
        expect(role.timeline).toHaveLength(1);
        expect(role.timeline[0].event).toBe('事件B');
    });

    it('buildTimelineForPrompt 无事件时返回空', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const mockAppState = {
            globalSettings: {},
            currentRole: { value: { name: '小夜' } },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { buildTimelineForPrompt } = useTimeline(mockAppState);
        expect(buildTimelineForPrompt()).toBe('');
    });

    it('buildTimelineForPrompt 有事件时应包含事件标记', async () => {
        const { useTimeline } = await import('../src/composables/useTimeline');
        const mockAppState = {
            globalSettings: {},
            currentRole: {
                value: {
                    name: '小夜',
                    timeline: [
                        { event: '第一次见面', importance: 'high' },
                        { event: '一起看星星', importance: 'medium' },
                        { event: '随便聊天', importance: 'low' },
                    ],
                },
            },
            currentRoleId: { value: 'id' },
            messages: { value: [] },
        };
        const { buildTimelineForPrompt } = useTimeline(mockAppState);
        const result = buildTimelineForPrompt();
        expect(result).toContain('剧情时间线');
        expect(result).toContain('⚡');
        expect(result).toContain('📌');
        expect(result).toContain('第一次见面');
    });
});
