/**
 * 🧪 useBranch.js 单元测试
 * 测试分支管理：分叉、切换、重命名、删除
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, reactive, computed } from 'vue';

function createMockAppState() {
    const roleList = ref([
        {
            id: 'role-1',
            name: 'Test Role',
            systemPrompt: '',
            chatHistory: [],
            branches: [
                {
                    id: 'branch-main',
                    name: '主线',
                    parentBranchId: null,
                    forkIndex: null,
                    chatHistory: [
                        { role: 'user', content: 'msg1' },
                        { role: 'assistant', content: 'resp1' },
                        { role: 'user', content: 'msg2' },
                        { role: 'assistant', content: 'resp2' },
                        { role: 'user', content: 'msg3' },
                    ],
                    createdAt: Date.now(),
                }
            ],
            activeBranchId: 'branch-main',
        },
    ]);

    const currentRoleId = ref('role-1');

    return {
        roleList,
        currentRoleId,
        currentRole: computed(() => roleList.value.find(r => r.id === currentRoleId.value)),
        showToast: vi.fn(),
        saveData: vi.fn(),
    };
}

describe('useBranch - 分叉', () => {
    it('应该在指定消息处分叉', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        const newBranch = branch.forkAtMessage(2); // Fork at msg2

        expect(newBranch).toBeDefined();
        expect(newBranch.chatHistory.length).toBe(3); // msg1, resp1, msg2
        expect(newBranch.parentBranchId).toBe('branch-main');
        expect(newBranch.forkIndex).toBe(2);
        expect(appState.roleList.value[0].branches.length).toBe(2);
        expect(appState.roleList.value[0].activeBranchId).toBe(newBranch.id);
    });

    it('分叉应该深拷贝消息', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        const newBranch = branch.forkAtMessage(1);

        // 修改新分支不应影响原分支
        newBranch.chatHistory[0].content = 'modified';
        const mainBranch = appState.roleList.value[0].branches[0];
        expect(mainBranch.chatHistory[0].content).toBe('msg1');
    });

    it('无效索引不应该分叉', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        expect(branch.forkAtMessage(-1)).toBeNull();
        expect(branch.forkAtMessage(999)).toBeNull();
        expect(appState.roleList.value[0].branches.length).toBe(1);
    });
});

describe('useBranch - 切换', () => {
    it('应该切换到指定分支', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        // 先创建第二个分支
        const newBranch = branch.forkAtMessage(1);

        // 切换回主线
        branch.switchBranch('branch-main');
        expect(appState.roleList.value[0].activeBranchId).toBe('branch-main');

        // 切回新分支
        branch.switchBranch(newBranch.id);
        expect(appState.roleList.value[0].activeBranchId).toBe(newBranch.id);
    });

    it('不存在的分支不应切换', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        branch.switchBranch('nonexistent');
        expect(appState.showToast).toHaveBeenCalledWith('分支不存在', 'error');
    });
});

describe('useBranch - 重命名', () => {
    it('应该重命名分支', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        branch.renameBranch('branch-main', '告白线');
        expect(appState.roleList.value[0].branches[0].name).toBe('告白线');
    });

    it('空名称不应生效', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        branch.renameBranch('branch-main', '   ');
        expect(appState.roleList.value[0].branches[0].name).toBe('主线');
    });
});

describe('useBranch - 删除', () => {
    it('应该删除非主线分支', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        const newBranch = branch.forkAtMessage(2);
        expect(appState.roleList.value[0].branches.length).toBe(2);

        branch.deleteBranch(newBranch.id);
        expect(appState.roleList.value[0].branches.length).toBe(1);
        // 应该切回主线
        expect(appState.roleList.value[0].activeBranchId).toBe('branch-main');
    });

    it('主线分支不能删除', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        branch.deleteBranch('branch-main');
        expect(appState.showToast).toHaveBeenCalledWith('主线分支不能删除', 'error');
        expect(appState.roleList.value[0].branches.length).toBe(1);
    });
});

describe('useBranch - 计算属性', () => {
    it('branchList 应该返回所有分支', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        expect(branch.branchList.value.length).toBe(1);
        branch.forkAtMessage(0);
        expect(branch.branchList.value.length).toBe(2);
    });

    it('currentBranch 应该返回活跃分支', async () => {
        const appState = createMockAppState();
        const { useBranch } = await import('../src/composables/useBranch');
        const branch = useBranch(appState);

        expect(branch.currentBranch.value.id).toBe('branch-main');

        const newBranch = branch.forkAtMessage(1);
        expect(branch.currentBranch.value.id).toBe(newBranch.id);
    });
});
