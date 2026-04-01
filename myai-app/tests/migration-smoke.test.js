/**
 * 🧪 migration-smoke.test.js
 * 迁移冒烟测试 — 验证本次三项改动的核心行为：
 *   1. 世界书 Supabase → 本地 Orama BM25
 *   2. 记忆检索 /api/ → Orama BM25（useMemory.js）
 *   3. /api/ 已删除（无残留调用）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock @orama/orama ───────────────────────────────────────────────────────
vi.mock('@orama/orama', async () => ({
    create: vi.fn(async () => ({ _docs: [] })),
    insert: vi.fn(async (db, doc) => { db._docs.push(doc); }),
    search: vi.fn(async (db, opts) => {
        const limit = opts?.limit ?? db._docs.length;
        return { hits: db._docs.slice(0, limit).map(doc => ({ document: doc, score: 1 })) };
    }),
}));

import {
    semanticSearch,
    syncEntryToSupabase,
    deleteEntryFromSupabase,
    getActiveLoreEntriesHybrid,
    createEntry,
} from '../src/composables/promptModules/worldBook.js';

import { retrieveRelevantMemories } from '../src/composables/useMemory.js';

// ═══════════════════════════════════════════════════════════════════════
// 1. 世界书 Supabase 函数已变成无副作用的 no-op stub
// ═══════════════════════════════════════════════════════════════════════
describe('[迁移1] 世界书 Supabase 函数 → no-op stub', () => {
    it('syncEntryToSupabase 存在且返回 { success: true }，不发网络请求', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        const result = await syncEntryToSupabase('role-1', { id: 'e1' });
        expect(result).toEqual({ success: true });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('deleteEntryFromSupabase 存在且返回 { success: true }，不发网络请求', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        const result = await deleteEntryFromSupabase('role-1', 'e1');
        expect(result).toEqual({ success: true });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('semanticSearch 返回空数组，不发网络请求', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        const result = await semanticSearch('查询文本', 'role-1');
        expect(result).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. 世界书 BM25 混合检索（getActiveLoreEntriesHybrid）
// ═══════════════════════════════════════════════════════════════════════
describe('[迁移1] getActiveLoreEntriesHybrid — 本地 BM25', () => {
    const makeMessages = (texts) => texts.map(t => ({ role: 'user', content: t }));

    it('无记录时返回空', async () => {
        const result = await getActiveLoreEntriesHybrid(makeMessages(['你好']), [], 'role-1');
        expect(result.before).toEqual([]);
        expect(result.after).toEqual([]);
    });

    it('关键词命中优先于语义搜索', async () => {
        const lorebook = [
            createEntry({ name: '蒙德城', keywords: ['蒙德'], content: '蒙德是风之城' }),
        ];
        const result = await getActiveLoreEntriesHybrid(
            makeMessages(['我去蒙德城探险']),
            lorebook,
            'role-1',
            { semanticEnabled: true, topK: 3 }
        );
        // 关键词命中的条目内容必须出现在结果中
        const allEntries = [...result.before, ...result.after];
        expect(allEntries.some(e => e === '蒙德是风之城')).toBe(true);
    });

    it('语义搜索不发网络请求（fetch 不被调用）', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        const lorebook = [
            createEntry({ name: '烟雨', keywords: [], content: '烟雨是江南风格的地点' }),
        ];
        await getActiveLoreEntriesHybrid(
            makeMessages(['我想去看看那个地方']),
            lorebook,
            'role-1',
            { semanticEnabled: true, topK: 3 }
        );
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. 记忆检索 — 不调用 /api/memory-search
// ═══════════════════════════════════════════════════════════════════════
describe('[迁移2] retrieveRelevantMemories — 不发网络请求', () => {
    beforeEach(() => localStorage.clear());

    it('有记忆时不调用 fetch', () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        const memories = [
            { content: '她讨厌下雨天', importance: 4 },
            { content: '她喜欢草莓大福', importance: 3 },
        ];
        retrieveRelevantMemories(memories, '今天下雨了');
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('无记忆时不调用 fetch', () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
        retrieveRelevantMemories([], '今天下雨了');
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. /api/ 目录已删除（源码中无残留调用）
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('[迁移3] /api/ 目录已删除，源码无残留调用', () => {
    it('/api/ 目录不存在', () => {
        expect(fs.existsSync(path.join(ROOT, 'api'))).toBe(false);
    });

    it('src/ 中没有 fetch(\'/api/ 调用', () => {
        const hits = [];
        function scan(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'node_modules') {
                    scan(full);
                } else if (entry.isFile() && /\.(js|vue|ts)$/.test(entry.name)) {
                    const content = fs.readFileSync(full, 'utf8');
                    // 查找形如 fetch('/api/memory 或 fetch('/api/worldbook 的调用
                    const matches = content.match(/fetch\(['"`]\/api\/(memory|worldbook)/g);
                    if (matches) hits.push({ file: full, matches });
                }
            }
        }
        scan(path.join(ROOT, 'src'));
        expect(hits).toEqual([]);
    });
});
