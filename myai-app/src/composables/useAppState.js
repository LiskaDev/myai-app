import { ref, reactive, computed, watch } from 'vue';
import { PRESET_ROLES, createNewRoleData } from './presets';
import {
    STORAGE_KEYS,
    DEFAULT_GLOBAL_SETTINGS,
    saveToStorage,
    loadFromStorage
} from '../utils/storage';

// 创建应用状态组合式函数
export function useAppState() {
    // ============== 响应式状态 ==============
    const globalSettings = reactive({ ...DEFAULT_GLOBAL_SETTINGS });
    const roleList = ref([]);
    const currentRoleId = ref(null);

    // UI 状态
    const showSidebar = ref(false);
    const showSettings = ref(false);
    const showImportModal = ref(false);
    const importJson = ref('');

    // 聊天状态
    const userInput = ref('');
    const isStreaming = ref(false);
    const isThinking = ref(false);
    const activeMessageIndex = ref(null);

    // Toast 消息
    const toast = reactive({
        show: false,
        message: '',
        type: 'info',
    });

    // 确认弹窗
    const confirmModal = reactive({
        show: false,
        title: '',
        message: '',
        isDangerous: false,
        onConfirm: null,
    });

    // 编辑弹窗
    const editModal = reactive({
        show: false,
        type: 'message',
        index: -1,
        originalContent: '',
    });

    // TTS 状态
    const ttsState = reactive({
        playingIndex: null,
        utterance: null,
    });
    const availableVoices = ref([]);

    // 中止控制器
    const abortController = ref(null);
    const isUserNearBottom = ref(true);

    // 记忆编辑状态
    const memoryEditState = reactive({
        editingIndex: null,
        editContent: '',
        refiningIndex: null,
        expandedIndex: null,
    });

    // ============== 计算属性 ==============
    const currentRole = computed(() => {
        const role = roleList.value.find(r => r.id === currentRoleId.value);
        return role || createNewRoleData();
    });

    // 获取当前角色的活跃分支
    function getActiveBranch(role) {
        if (!role || !role.branches || role.branches.length === 0) return null;
        return role.branches.find(b => b.id === role.activeBranchId) || role.branches[0];
    }

    const messages = computed({
        get: () => {
            const branch = getActiveBranch(currentRole.value);
            return branch ? branch.chatHistory : (currentRole.value.chatHistory || []);
        },
        set: (value) => {
            const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
            if (roleIndex !== -1) {
                const role = roleList.value[roleIndex];
                const branch = getActiveBranch(role);
                if (branch) {
                    branch.chatHistory = value;
                } else {
                    role.chatHistory = value;
                }
            }
        }
    });

    // ============== 方法 ==============
    // 🛡️ Toast timer 追踪，防止内存泄漏
    let toastTimerId = null;

    function showToast(message, type = 'info') {
        // 清除之前的 timer
        if (toastTimerId) {
            clearTimeout(toastTimerId);
        }

        toast.message = message;
        toast.type = type;
        toast.show = true;

        toastTimerId = setTimeout(() => {
            toast.show = false;
            toastTimerId = null;
        }, 2000);
    }

    // 提供清理函数
    function cleanupTimers() {
        if (toastTimerId) {
            clearTimeout(toastTimerId);
            toastTimerId = null;
        }
    }

    function showConfirmModal(titleOrOptions, message, onConfirm) {
        // 🛡️ 兼容两种调用方式：(options) 或 (title, message, callback)
        let options;
        if (typeof titleOrOptions === 'string') {
            options = { title: titleOrOptions, message, onConfirm };
        } else {
            options = titleOrOptions;
        }
        confirmModal.title = options.title || '确认';
        confirmModal.message = options.message || '';
        confirmModal.isDangerous = options.isDangerous || false;
        confirmModal.onConfirm = options.onConfirm || null;
        confirmModal.show = true;
    }

    function handleConfirm() {
        if (confirmModal.onConfirm) {
            confirmModal.onConfirm();
        }
        confirmModal.show = false;
    }

    function handleCancel() {
        confirmModal.show = false;
    }

    function saveData() {
        const success = saveToStorage(globalSettings, roleList.value, (msg) => showToast(msg, 'error'));
        if (!success) {
            showToast('⚠️ 数据保存失败！请导出备份后清理旧对话', 'error');
        }
    }

    function loadData() {
        const { globalSettings: savedGlobal, roleList: savedRoles, error } = loadFromStorage(
            (msg) => showToast(msg, 'error')
        );

        if (error) {
            roleList.value = [...PRESET_ROLES];
            currentRoleId.value = roleList.value[0].id;
            showToast('数据加载失败，已恢复默认设置', 'error');
            return;
        }

        if (savedGlobal) {
            Object.assign(globalSettings, savedGlobal);
        }

        if (savedRoles && savedRoles.length > 0) {
            roleList.value = savedRoles;

            // v4.5.2: 自动迁移旧数据 — 没有 branches 的角色自动创建主线分支
            for (const role of roleList.value) {
                if (!role.branches || role.branches.length === 0) {
                    role.branches = [{
                        id: 'branch-main',
                        name: '主线',
                        parentBranchId: null,
                        forkIndex: null,
                        chatHistory: role.chatHistory || [],
                        createdAt: Date.now(),
                    }];
                    role.activeBranchId = 'branch-main';
                }
            }

            // 恢复上次活跃的角色
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            const lastRoleId = session.currentRoleId;
            if (lastRoleId && savedRoles.find(r => r.id === lastRoleId)) {
                currentRoleId.value = lastRoleId;
            } else {
                currentRoleId.value = savedRoles[0].id;
            }
        } else {
            roleList.value = [...PRESET_ROLES];
            currentRoleId.value = roleList.value[0].id;
            saveData();
        }
    }

    function switchRole(roleId) {
        // 🛡️ 切换角色前中止正在进行的流式输出，防止消息写入错误角色
        if (isStreaming.value && abortController.value) {
            abortController.value.abort();
            abortController.value = null;
            isStreaming.value = false;
            isThinking.value = false;
        }
        currentRoleId.value = roleId;
        showSidebar.value = false;
        activeMessageIndex.value = null;
        // 保存当前会话状态
        try {
            const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
            session.currentRoleId = roleId;
            session.isGroupMode = false;
            session.currentGroupId = null;
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        } catch { /* ignore */ }
    }

    function createNewRole() {
        const newRole = createNewRoleData();
        roleList.value.push(newRole);
        currentRoleId.value = newRole.id;
        showSidebar.value = false;
        saveData();
        showToast('新角色已创建');
    }

    function deleteRole(roleId) {
        const index = roleList.value.findIndex(r => r.id === roleId);
        if (index !== -1 && roleList.value.length > 1) {
            roleList.value.splice(index, 1);
            if (currentRoleId.value === roleId) {
                currentRoleId.value = roleList.value[0].id;
            }
            saveData();
            showToast('角色已删除');
        }
    }

    function confirmDeleteRole(roleId) {
        const role = roleList.value.find(r => r.id === roleId);
        if (!role) return;

        showConfirmModal({
            title: '删除角色',
            message: `确定要删除角色 "${role.name}" 吗？\n所有聊天记录将被清除。`,
            isDangerous: true,
            onConfirm: () => deleteRole(roleId),
        });
    }

    function clearChat() {
        // 🛡️ AI 正在回复时禁止清空，防止幽灵消息
        if (isStreaming.value) {
            showToast('请等待 AI 回复完成后再清空', 'error');
            return;
        }
        showConfirmModal({
            title: '清空聊天',
            message: '确定要清空当前角色的聊天记录吗？\n此操作无法撤销。',
            isDangerous: true,
            onConfirm: () => {
                messages.value = [];
                showToast('聊天记录已清空');
            }
        });
    }

    function saveAndCloseSettings() {
        saveData();
        showSettings.value = false;
        showToast('设置已保存');
    }

    // 设置 watchers
    // 🛡️ 简单的 debounce 实现
    function debounce(fn, delay) {
        let timeoutId = null;
        return function (...args) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // 设置 watchers - 使用 debounce 减少频繁写入
    const debouncedSave = debounce(saveData, 500);

    // 🛡️ 多标签页同步：监听其他标签页的存储变化
    let storageListener = null;

    function setupWatchers() {
        watch(() => roleList.value, debouncedSave, { deep: true });
        watch(globalSettings, debouncedSave, { deep: true });

        // 🛡️ 监听 storage 事件（只在其他标签页修改时触发）
        storageListener = (event) => {
            if (event.key === 'myai_roles_v1' || event.key === 'myai_global_v1') {
                console.log('[Sync] 检测到其他标签页修改，重新加载数据');
                loadData();
                showToast('数据已从其他标签页同步', 'info');
            }
        };
        window.addEventListener('storage', storageListener);
    }

    // 🛡️ 清理存储监听器
    function cleanupStorageListener() {
        if (storageListener) {
            window.removeEventListener('storage', storageListener);
            storageListener = null;
        }
    }

    return {
        // 状态
        globalSettings,
        roleList,
        currentRoleId,
        currentRole,
        messages,
        showSidebar,
        showSettings,
        showImportModal,
        importJson,
        userInput,
        isStreaming,
        isThinking,
        activeMessageIndex,
        toast,
        confirmModal,
        editModal,
        ttsState,
        availableVoices,
        abortController,
        isUserNearBottom,
        memoryEditState,

        // 方法
        showToast,
        showConfirmModal,
        handleConfirm,
        handleCancel,
        saveData,
        loadData,
        switchRole,
        createNewRole,
        deleteRole,
        confirmDeleteRole,
        clearChat,
        saveAndCloseSettings,
        setupWatchers,
        cleanupTimers,
        cleanupStorageListener,
    };
}
