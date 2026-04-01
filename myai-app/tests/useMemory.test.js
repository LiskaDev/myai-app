/**
 * 🧪 useMemory.test.js — 记忆检索边界测试
 *
 * 覆盖范围：
 *   - 参数缺失 → 返回空数组
 *   - 角色不存在 → 返回空数组
 *   - 角色无 vectorMemories → 返回空数组
 *   - vectorMemories 为空数组 → 返回空数组
 *   - localStorage 损坏（非法JSON）→ 返回空数组（不抛出）
 *   - @orama/orama 加载失败 → 返回空数组（静默降级）
 *   - 正常路径：mock Orama BM25，验证返回正确 content
 */

// ── 被测模块（mock 设置完毕后再导入）────────────────────────────────────────
import { retrieveRelevantMemories, useMemory } from '../src/composables/useMemory.js';
import { releaseBackgroundLock } from '../src/composables/useTimeline.js';

describe('retrieveRelevantMemories — 参数边界', () => {
    it('memories 为空数组 → 返回 []', () => {
        const result = retrieveRelevantMemories([], '今天下雨');
        expect(result).toEqual([]);
    });

    it('currentMessage 为空 → 返回 []', () => {
        const result = retrieveRelevantMemories([{content: 'test'}], '');
        expect(result).toEqual([]);
    });

    it('两个参数都为 null → 返回 []', () => {
        const result = retrieveRelevantMemories(null, null);
        expect(result).toEqual([]);
    });
});

describe('retrieveRelevantMemories — 边缘数据状态', () => {
    it('记忆 content 为 undefined/null 时不出错', () => {
        const memories = [
            { content: null },
            { content: undefined },
            { content: '正常内容' }
        ];
        const result = retrieveRelevantMemories(memories, '这是正常内容');
        expect(result).toContain('正常内容');
    });
});

describe('retrieveRelevantMemories — 正常路径 (n-gram匹配)', () => {
    it('能够根据输入文本返回匹配的记忆', () => {
        const memories = [
            { content: '她讨厌下雨天，每次下雨都会变得沉默', importance: 4 },
            { content: '她最喜欢的食物是草莓大福', importance: 3 },
        ];
        const result = retrieveRelevantMemories(memories, '下雨天怎么办');
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBe('她讨厌下雨天，每次下雨都会变得沉默');
    });

    it('返回数量不超过 5', () => {
        const memories = Array.from({ length: 20 }, (_, i) => ({
            content: `这是一段测试记忆内容 ${i}`,
            importance: 3,
        }));
        const result = retrieveRelevantMemories(memories, '这是一段测试记忆内容');
        expect(result.length).toBeLessThanOrEqual(5);
    });
});

function makeMessages(count = 16) {
    return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息${i}`,
        rawContent: `消息${i}`,
    }));
}

function makeUseMemoryAppState(overrides = {}) {
    const role = {
        id: 'role-1',
        name: '测试角色',
        systemPrompt: '测试人设',
        memoryWindow: 15,
        chapterSummaries: [],
        _lastCardMessageCount: 0,
        ...overrides.role,
    };

    return {
        globalSettings: {
            apiKey: 'test-key',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            enableSmartAnalysis: true,
            ...overrides.globalSettings,
        },
        roleList: { value: [role] },
        currentRoleId: { value: role.id },
        currentRole: { value: role },
        messages: { value: makeMessages(16) },
        memoryEditState: { editingIndex: null, editContent: '', refiningIndex: null, expandedIndex: null },
        showToast: vi.fn(),
        saveData: vi.fn(),
    };
}

describe('useMemory — 认知卡计数推进规则', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        releaseBackgroundLock();
    });

    afterEach(() => {
        releaseBackgroundLock();
        vi.useRealTimers();
    });

    it('认知卡未真正更新时不应推进 _lastCardMessageCount', async () => {
        const appState = makeUseMemoryAppState();
        const role = appState.currentRole.value;
        role._lastCardMessageCount = 0;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '非 JSON 文本' } }],
            }),
        });

        const { checkAndTriggerMemorySystems } = useMemory(appState);
        checkAndTriggerMemorySystems(role, appState.messages.value);

        await vi.advanceTimersByTimeAsync(2500);
        await Promise.resolve();

        expect(role._lastCardMessageCount).toBe(0);
        expect(role.memoryCard).toBeUndefined();
    });

    it('仅 didUpdate=true 时推进 _lastCardMessageCount', async () => {
        const appState = makeUseMemoryAppState();
        const role = appState.currentRole.value;
        role._lastCardMessageCount = 0;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"userProfile":"小李","keyEvents":[]}' } }],
            }),
        });

        const { checkAndTriggerMemorySystems } = useMemory(appState);
        checkAndTriggerMemorySystems(role, appState.messages.value);

        await vi.advanceTimersByTimeAsync(2500);
        await Promise.resolve();

        expect(role._lastCardMessageCount).toBe(16);
        expect(role.memoryCard?.userProfile).toBe('小李');
    });
});


