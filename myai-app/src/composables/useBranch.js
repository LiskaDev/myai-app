import { computed } from 'vue';
import { generateUUID } from '../utils/uuid';

/**
 * 分支管理 composable — 在任意消息处分叉、切换、重命名、删除分支
 */
export function useBranch(appState) {
    const { currentRole, roleList, currentRoleId, showToast, saveData, isStreaming } = appState;

    // 当前角色的所有分支
    const branchList = computed(() => {
        const role = currentRole.value;
        return role?.branches || [];
    });

    // 当前活跃分支
    const currentBranch = computed(() => {
        const role = currentRole.value;
        if (!role?.branches) return null;
        return role.branches.find(b => b.id === role.activeBranchId) || role.branches[0] || null;
    });

    /**
     * 在指定消息索引处分叉 — 复制 0~messageIndex 的消息到新分支
     */
    function forkAtMessage(messageIndex) {
        // 🛡️ 流式输出时禁止分叉，避免把空白的 AI 占位消息复制进新分支
        if (isStreaming.value) {
            showToast('请等待 AI 回复完成后再分叉', 'error');
            return null;
        }

        const role = getRoleRef();
        if (!role) return null;

        const sourceBranch = role.branches.find(b => b.id === role.activeBranchId);
        if (!sourceBranch) return null;

        if (messageIndex < 0 || messageIndex >= sourceBranch.chatHistory.length) {
            showToast('无法在此位置分叉', 'error');
            return null;
        }

        // 复制分叉点及之前的消息
        const forkedMessages = JSON.parse(JSON.stringify(
            sourceBranch.chatHistory.slice(0, messageIndex + 1)
        ));

        const branchId = `branch-${generateUUID().slice(0, 8)}`;
        const newBranch = {
            id: branchId,
            name: `分支 ${role.branches.length}`,
            parentBranchId: sourceBranch.id,
            forkIndex: messageIndex,
            chatHistory: forkedMessages,
            createdAt: Date.now(),
        };

        role.branches.push(newBranch);
        role.activeBranchId = branchId;
        saveData();
        showToast(`🔀 已分叉到「${newBranch.name}」`);
        return newBranch;
    }

    /**
     * 切换到指定分支
     */
    function switchBranch(branchId) {
        const role = getRoleRef();
        if (!role) return;

        const branch = role.branches.find(b => b.id === branchId);
        if (!branch) {
            showToast('分支不存在', 'error');
            return;
        }

        role.activeBranchId = branchId;
        saveData();
    }

    /**
     * 重命名分支
     */
    function renameBranch(branchId, newName) {
        const role = getRoleRef();
        if (!role) return;

        const branch = role.branches.find(b => b.id === branchId);
        if (branch && newName.trim()) {
            branch.name = newName.trim();
            saveData();
        }
    }

    /**
     * 删除分支（主线不可删除）
     */
    function deleteBranch(branchId) {
        const role = getRoleRef();
        if (!role) return;

        if (branchId === 'branch-main') {
            showToast('主线分支不能删除', 'error');
            return;
        }

        const index = role.branches.findIndex(b => b.id === branchId);
        if (index === -1) return;

        role.branches.splice(index, 1);

        // 如果删除的是当前活跃分支，优先切到有内容的分支
        if (role.activeBranchId === branchId) {
            // 优先找有聊天记录的分支，否则回到主线
            const branchWithContent = role.branches.find(b => b.chatHistory && b.chatHistory.length > 0);
            role.activeBranchId = branchWithContent ? branchWithContent.id : 'branch-main';
        }

        saveData();
        showToast('分支已删除');
    }

    // 获取当前角色的可变引用
    function getRoleRef() {
        const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
        return roleIndex !== -1 ? roleList.value[roleIndex] : null;
    }

    return {
        branchList,
        currentBranch,
        forkAtMessage,
        switchBranch,
        renameBranch,
        deleteBranch,
    };
}
