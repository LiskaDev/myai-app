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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── 模拟 @orama/orama（BM25 简化 mock）────────────────────────────────────
vi.mock('@orama/orama', async () => ({
    create: vi.fn(async () => ({ _docs: [] })),
    insert: vi.fn(async (db, doc) => { db._docs.push(doc); }),
    search: vi.fn(async (db, opts) => {
        const limit = opts?.limit ?? db._docs.length;
        return { hits: db._docs.slice(0, limit).map(doc => ({ document: doc, score: 1 })) };
    }),
}));

// ── 被测模块（mock 设置完毕后再导入）────────────────────────────────────────
import { retrieveRelevantMemories, useMemory } from '../src/composables/useMemory.js';
import { releaseBackgroundLock } from '../src/composables/useTimeline.js';

// ── 辅助：往 localStorage 写入角色数据 ────────────────────────────────────
function setRoles(roles) {
    localStorage.setItem('myai_roles_v1', JSON.stringify(roles));
}

function makeRole(overrides = {}) {
    return { id: 'role-1', name: '测试角色', ...overrides };
}

describe('retrieveRelevantMemories — 参数边界', () => {
    beforeEach(() => localStorage.clear());

    it('characterId 为空 → 返回 []', async () => {
        const result = await retrieveRelevantMemories('', '今天下雨');
        expect(result).toEqual([]);
    });

    it('currentMessage 为空 → 返回 []', async () => {
        const result = await retrieveRelevantMemories('role-1', '');
        expect(result).toEqual([]);
    });

    it('两个参数都为 null → 返回 []', async () => {
        const result = await retrieveRelevantMemories(null, null);
        expect(result).toEqual([]);
    });
});

describe('retrieveRelevantMemories — localStorage 状态', () => {
    beforeEach(() => localStorage.clear());

    it('localStorage 没有角色数据 → 返回 []', async () => {
        const result = await retrieveRelevantMemories('role-1', '今天下雨');
        expect(result).toEqual([]);
    });

    it('localStorage 内容是非法 JSON → 不抛出，返回 []', async () => {
        localStorage.setItem('myai_roles_v1', '{ broken json !!!');
        const result = await retrieveRelevantMemories('role-1', '今天下雨');
        expect(result).toEqual([]);
    });

    it('找不到对应 characterId 的角色 → 返回 []', async () => {
        setRoles([makeRole({ id: 'other-role' })]);
        const result = await retrieveRelevantMemories('role-1', '今天下雨');
        expect(result).toEqual([]);
    });

    it('角色存在但没有 vectorMemories 字段 → 返回 []', async () => {
        setRoles([makeRole()]);
        const result = await retrieveRelevantMemories('role-1', '今天下雨');
        expect(result).toEqual([]);
    });

    it('vectorMemories 是空数组 → 返回 []', async () => {
        setRoles([makeRole({ vectorMemories: [] })]);
        const result = await retrieveRelevantMemories('role-1', '今天下雨');
        expect(result).toEqual([]);
    });
});

describe('retrieveRelevantMemories — 正常路径（mock 模型）', () => {
    beforeEach(() => localStorage.clear());

    it('有记忆时返回非空数组，且每项是字符串', async () => {
        setRoles([makeRole({
            vectorMemories: [
                { content: '她讨厌下雨天，每次下雨都会变得沉默', importance: 4 },
                { content: '她最喜欢的食物是草莓大福', importance: 3 },
            ],
        })]);
        const result = await retrieveRelevantMemories('role-1', '今天下雨了');
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        result.forEach(item => expect(typeof item).toBe('string'));
    });

    it('返回数量不超过 5', async () => {
        setRoles([makeRole({
            vectorMemories: Array.from({ length: 20 }, (_, i) => ({
                content: `记忆内容 ${i}`,
                importance: 3,
            })),
        })]);
        const result = await retrieveRelevantMemories('role-1', '随便一句话');
        expect(result.length).toBeLessThanOrEqual(5);
    });

    it('记忆 content 包含 undefined/null 时不返回这些项', async () => {
        setRoles([makeRole({
            vectorMemories: [
                { content: null },
                { content: undefined },
                { content: '正常记忆内容' },
            ],
        })]);
        const result = await retrieveRelevantMemories('role-1', '随便一句话');
        result.forEach(item => expect(item).toBeTruthy());
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


