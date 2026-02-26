/**
 * 🧪 useRelationship.js 单元测试
 * 关系矩阵 CRUD、好感度转文字、Prompt注入
 */

import { describe, it, expect } from 'vitest';
import {
    matrixKey,
    clampAffinity,
    affinityToText,
    initMatrix,
    getAffinity,
    setAffinity,
    syncMatrix,
    buildRelationshipHint,
    AFFINITY_MIN,
    AFFINITY_MAX,
} from '../src/composables/useRelationship';

describe('useRelationship - matrixKey', () => {
    it('生成正确的键名', () => {
        expect(matrixKey('a', 'b')).toBe('a→b');
        expect(matrixKey('role-1', 'director')).toBe('role-1→director');
    });
});

describe('useRelationship - clampAffinity', () => {
    it('正常范围内直接返回', () => {
        expect(clampAffinity(50)).toBe(50);
        expect(clampAffinity(0)).toBe(0);
        expect(clampAffinity(-50)).toBe(-50);
    });

    it('超出范围被 clamp', () => {
        expect(clampAffinity(150)).toBe(AFFINITY_MAX);
        expect(clampAffinity(-200)).toBe(AFFINITY_MIN);
    });

    it('四舍五入小数', () => {
        expect(clampAffinity(33.7)).toBe(34);
        expect(clampAffinity(-10.2)).toBe(-10);
    });
});

describe('useRelationship - affinityToText', () => {
    it('各区间返回正确描述', () => {
        expect(affinityToText(-100)).toBe('极度厌恶');
        expect(affinityToText(-60)).toBe('极度厌恶');
        expect(affinityToText(-59)).toBe('反感');
        expect(affinityToText(-30)).toBe('反感');
        expect(affinityToText(-29)).toBe('有些不满');
        expect(affinityToText(-10)).toBe('有些不满');
        expect(affinityToText(0)).toBe('中立');
        expect(affinityToText(5)).toBe('中立');
        expect(affinityToText(10)).toBe('有些好感');
        expect(affinityToText(29)).toBe('有些好感');
        expect(affinityToText(30)).toBe('友好');
        expect(affinityToText(59)).toBe('友好');
        expect(affinityToText(60)).toBe('非常亲密');
        expect(affinityToText(100)).toBe('非常亲密');
    });

    it('超出范围值也正确处理', () => {
        expect(affinityToText(200)).toBe('非常亲密');
        expect(affinityToText(-200)).toBe('极度厌恶');
    });
});

describe('useRelationship - initMatrix', () => {
    it('2个角色生成完整矩阵', () => {
        const matrix = initMatrix(['r1', 'r2']);
        // r1→r2, r1→director, r2→r1, r2→director, director→r1, director→r2
        expect(Object.keys(matrix).length).toBe(6);
        expect(matrix['r1→r2']).toBe(0);
        expect(matrix['r1→director']).toBe(0);
        expect(matrix['r2→r1']).toBe(0);
        expect(matrix['director→r1']).toBe(0);
    });

    it('3个角色生成完整矩阵', () => {
        const matrix = initMatrix(['a', 'b', 'c']);
        // 4 entities (a, b, c, director), 4*3 = 12 pairs
        expect(Object.keys(matrix).length).toBe(12);
    });

    it('自身不出现在矩阵中', () => {
        const matrix = initMatrix(['r1', 'r2']);
        expect(matrix['r1→r1']).toBeUndefined();
        expect(matrix['r2→r2']).toBeUndefined();
        expect(matrix['director→director']).toBeUndefined();
    });
});

describe('useRelationship - getAffinity / setAffinity', () => {
    it('读取默认值 0', () => {
        const matrix = initMatrix(['r1', 'r2']);
        expect(getAffinity(matrix, 'r1', 'r2')).toBe(0);
    });

    it('设置并读取正确值', () => {
        const matrix = initMatrix(['r1', 'r2']);
        setAffinity(matrix, 'r1', 'r2', 75);
        expect(getAffinity(matrix, 'r1', 'r2')).toBe(75);
    });

    it('设置值被 clamp', () => {
        const matrix = initMatrix(['r1', 'r2']);
        setAffinity(matrix, 'r1', 'r2', 150);
        expect(getAffinity(matrix, 'r1', 'r2')).toBe(100);

        setAffinity(matrix, 'r1', 'r2', -200);
        expect(getAffinity(matrix, 'r1', 'r2')).toBe(-100);
    });

    it('null 矩阵不崩溃', () => {
        expect(getAffinity(null, 'r1', 'r2')).toBe(0);
        expect(() => setAffinity(null, 'r1', 'r2', 10)).not.toThrow();
    });

    it('不存在的键返回 0', () => {
        const matrix = initMatrix(['r1', 'r2']);
        expect(getAffinity(matrix, 'noexist', 'r2')).toBe(0);
    });
});

describe('useRelationship - syncMatrix', () => {
    it('新增成员生成新键', () => {
        const matrix = initMatrix(['r1', 'r2']);
        setAffinity(matrix, 'r1', 'r2', 50);

        const synced = syncMatrix(matrix, ['r1', 'r2', 'r3']);
        // 4 entities * 3 = 12 pairs
        expect(Object.keys(synced).length).toBe(12);
        // 保留旧值
        expect(synced['r1→r2']).toBe(50);
        // 新关系默认 0
        expect(synced['r1→r3']).toBe(0);
        expect(synced['r3→r1']).toBe(0);
    });

    it('删除成员清理旧键', () => {
        const matrix = initMatrix(['r1', 'r2', 'r3']);
        setAffinity(matrix, 'r1', 'r3', 80);

        const synced = syncMatrix(matrix, ['r1', 'r2']);
        // 3 entities * 2 = 6 pairs
        expect(Object.keys(synced).length).toBe(6);
        expect(synced['r1→r3']).toBeUndefined();
    });
});

describe('useRelationship - buildRelationshipHint', () => {
    it('全中立返回空字符串', () => {
        const matrix = initMatrix(['r1', 'r2']);
        const hint = buildRelationshipHint('r1', matrix, [
            { id: 'r1', name: 'Alice' },
            { id: 'r2', name: 'Bob' },
        ]);
        expect(hint).toBe('');
    });

    it('有好感度变化时生成提示', () => {
        const matrix = initMatrix(['r1', 'r2']);
        setAffinity(matrix, 'r1', 'r2', 60);
        setAffinity(matrix, 'r1', 'director', -30);

        const hint = buildRelationshipHint('r1', matrix, [
            { id: 'r1', name: 'Alice' },
            { id: 'r2', name: 'Bob' },
        ]);

        expect(hint).toContain('[Relationship Dynamics');
        expect(hint).toContain('Bob');
        expect(hint).toContain('非常亲密');
        expect(hint).toContain('导演');
        expect(hint).toContain('反感');
    });

    it('null 矩阵返回空字符串', () => {
        const hint = buildRelationshipHint('r1', null, []);
        expect(hint).toBe('');
    });
});
