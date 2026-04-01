import { ref, reactive, computed, watch } from 'vue';
import { PRESET_ROLES, createNewRoleData, migrateRoleMemoryFields } from './presets';
import { releaseBackgroundLock } from './useTimeline';
import {
    STORAGE_KEYS,
    DEFAULT_GLOBAL_SETTINGS,
    saveToStorage,
    loadFromStorage,
    getStorageUsage,
} from '../utils/storage';
import { syncMatrix } from './useRelationship';

let _appStateInstance = null;

// 创建应用状态组合式函数
export function useAppState() {
    if (_appStateInstance) return _appStateInstance;

    // ============== 响应式状态 ==============
    const globalSettings = reactive({ ...DEFAULT_GLOBAL_SETTINGS });
    const roleList = ref([]);
    const currentRoleId = ref(null);

    // UI 状态
    const showSidebar = ref(false);
    const showSettings = ref(false);
    const settingsInitialTab = ref('');
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

    // 存储用量追踪
    const storageUsage = reactive({ usedKB: 0, totalKB: 5120, percent: 0, breakdown: [] });

    // 初始加载状态（IDB 是异步的，加载完成前显示 loading）
    const isLoadingData = ref(true);

    function refreshStorageUsage() {
        const usage = getStorageUsage();
        Object.assign(storageUsage, usage);
    }

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

    function showToast(message, type = 'info', action = null) {
        // 清除之前的 timer
        if (toastTimerId) {
            clearTimeout(toastTimerId);
        }

        toast.message = message;
        toast.type = type;
        toast.action = action; // { label: '去设置', callback: () => {} }
        toast.show = true;

        toastTimerId = setTimeout(() => {
            toast.show = false;
            toast.action = null;
            toastTimerId = null;
        }, action ? 5000 : 2000); // 有 action 时显示更久
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

    // saveData 保持同步签名（调用方无需修改），内部 fire-and-forget 异步写 IDB
    function saveData() {
        // onError 在 saveToStorage 内部触发，这里只处理未预期的 reject
        saveToStorage(globalSettings, roleList.value, (msg) => showToast(msg, 'error'))
            .then(() => { refreshStorageUsage(); })
            .catch(() => showToast('⚠️ 数据保存异常，请刷新重试', 'error'));
    }

    async function loadData() {
        isLoadingData.value = true;
        const { globalSettings: savedGlobal, roleList: savedRoles, error } = await loadFromStorage(
            (msg) => showToast(msg, 'error')
        );

        if (error) {
            roleList.value = [...PRESET_ROLES];
            currentRoleId.value = roleList.value[0].id;
            showToast('数据加载失败，已恢复默认设置', 'error');
            isLoadingData.value = false;
            return;
        }

        if (savedGlobal) {
            Object.assign(globalSettings, savedGlobal);
            const validDensities = new Set(['compact', 'standard', 'cozy']);
            if (!validDensities.has(globalSettings.readingDensity)) {
                globalSettings.readingDensity = 'standard';
            }
            const validMotionLevels = new Set(['off', 'soft', 'expressive']);
            if (!validMotionLevels.has(globalSettings.motionLevel)) {
                globalSettings.motionLevel = 'soft';
            }
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

                // v5.9.2: 迁移旧消息 — 补全 rawContent 以恢复 inner thoughts 显示
                const history = role.chatHistory || [];
                for (const msg of history) {
                    if (msg.role === 'assistant' && !msg.rawContent && msg.content) {
                        // 如果有 inner 字段，重建 rawContent
                        if (msg.inner) {
                            msg.rawContent = `<inner>${msg.inner}</inner>\n${msg.content}`;
                        } else {
                            msg.rawContent = msg.content;
                        }
                    }
                }
                // 同样处理分支中的消息
                if (role.branches) {
                    for (const branch of role.branches) {
                        for (const msg of (branch.chatHistory || [])) {
                            if (msg.role === 'assistant' && !msg.rawContent && msg.content) {
                                if (msg.inner) {
                                    msg.rawContent = `<inner>${msg.inner}</inner>\n${msg.content}`;
                                } else {
                                    msg.rawContent = msg.content;
                                }
                            }
                        }
                    }
                }

                // v6.0: 迁移记忆系统字段（memoryCard + chapterSummaries）
                migrateRoleMemoryFields(role);
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
        isLoadingData.value = false;
    }

    function switchRole(roleId) {
        // 🛡️ 切换角色前中止正在进行的流式输出，防止消息写入错误角色
        if (isStreaming.value && abortController.value) {
            abortController.value.abort();
            abortController.value = null;
            isStreaming.value = false;
            isThinking.value = false;

            // 🛡️ 清理孤立消息：中止流式时移除空的 assistant 占位 + 对应的 user 消息
            const msgs = messages.value;
            if (msgs.length > 0) {
                const last = msgs[msgs.length - 1];
                if (last.role === 'assistant' && (!last.content || last.content.trim() === '')) {
                    msgs.pop(); // 移除空 assistant 占位
                    // 移除对应的 user 消息（如果存在）
                    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
                        msgs.pop();
                    }
                }
            }
        }
        // 释放后台锁：防止上一个角色的任务卡住新角色的后台任务
        releaseBackgroundLock();

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

            // 🛡️ 同步清理群聊中的幽灵成员
            try {
                const savedGroups = localStorage.getItem(STORAGE_KEYS.GROUPS);
                if (savedGroups) {
                    const groups = JSON.parse(savedGroups);
                    let groupsChanged = false;
                    const removedGroupNames = [];

                    for (let i = groups.length - 1; i >= 0; i--) {
                        const group = groups[i];
                        const hadRole = group.participantIds.includes(roleId);
                        if (!hadRole) continue;

                        // 移除被删角色
                        group.participantIds = group.participantIds.filter(id => id !== roleId);
                        groupsChanged = true;

                        // 同步关系矩阵
                        if (group.relationshipMatrix) {
                            group.relationshipMatrix = syncMatrix(group.relationshipMatrix, group.participantIds);
                        }

                        // 成员不足 2 人 → 删除整个群聊
                        if (group.participantIds.length < 2) {
                            removedGroupNames.push(group.name);
                            groups.splice(i, 1);
                        }
                    }

                    if (groupsChanged) {
                        localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
                    }
                    if (removedGroupNames.length > 0) {
                        showToast(`群聊「${removedGroupNames.join('、')}」因成员不足已自动删除`);
                    }
                }
            } catch (e) {
                console.warn('[deleteRole] 清理群聊失败:', e);
            }

            showToast('角色已删除');
        }
    }

    function confirmDeleteRole(roleId) {
        const role = roleList.value.find(r => r.id === roleId);
        if (!role) return;

        // 🛡️ 检查该角色参与了哪些群聊，在确认弹框中提示
        let groupWarning = '';
        try {
            const savedGroups = localStorage.getItem(STORAGE_KEYS.GROUPS);
            if (savedGroups) {
                const groups = JSON.parse(savedGroups);
                const affectedGroups = groups.filter(g => g.participantIds.includes(roleId));
                if (affectedGroups.length > 0) {
                    const names = affectedGroups.map(g => `"${g.name}"`).join('、');
                    const willDelete = affectedGroups.filter(
                        g => g.participantIds.filter(id => id !== roleId).length < 2
                    );
                    groupWarning = `\n\n⚠️ 该角色参与了 ${affectedGroups.length} 个群聊：${names}。`;
                    if (willDelete.length > 0) {
                        groupWarning += `\n其中 ${willDelete.map(g => `"${g.name}"`).join('、')} 将因成员不足自动删除。`;
                    }
                }
            }
        } catch { /* ignore */ }

        showConfirmModal({
            title: '删除角色',
            message: `确定要删除角色 "${role.name}" 吗？\n所有聊天记录将被清除。${groupWarning}`,
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
                // v6.0: 清空聊天时重置记忆系统
                const role = currentRole.value;
                if (role) {
                    role.chapterSummaries = [];
                    role.memoryCard = {
                        updatedAt: 0, userProfile: '', keyEvents: [],
                        relationshipStage: '', emotionalState: '', taboos: [], lastTone: '',
                    };
                    role.autoSummary = '';
                    role.summarizedUpTo = 0;
                    role._lastCardMessageCount = 0;
                    role.timelineAnalyzedCount = 0;
                    role.vectorMemories = [];
                }
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

    function setupWatchers() {
        watch(() => roleList.value, debouncedSave, { deep: true });
        watch(globalSettings, debouncedSave, { deep: true });
    }

    const appStateObj = {
        // 状态
        globalSettings,
        roleList,
        currentRoleId,
        currentRole,
        messages,
        isLoadingData,
        showSidebar,
        showSettings,
        settingsInitialTab,
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
        storageUsage,

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
        refreshStorageUsage,
    };

    _appStateInstance = appStateObj;
    return appStateObj;
}
