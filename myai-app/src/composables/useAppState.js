import { ref, reactive, computed, watch } from 'vue';
import { PRESET_ROLES, createNewRoleData } from './presets';
import {
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

    const messages = computed({
        get: () => currentRole.value.chatHistory || [],
        set: (value) => {
            const roleIndex = roleList.value.findIndex(r => r.id === currentRoleId.value);
            if (roleIndex !== -1) {
                roleList.value[roleIndex].chatHistory = value;
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

    function showConfirmModal(options) {
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
        saveToStorage(globalSettings, roleList.value, (msg) => showToast(msg, 'error'));
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
