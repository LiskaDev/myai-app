// localStorage 键名
export const STORAGE_KEYS = {
    GLOBAL: 'myai_global_v1',
    ROLES: 'myai_roles_v1',
    GROUPS: 'myai_groups_v1',
    SESSION: 'myai_session_v1',
    DIARIES: 'myai_diaries_v1',
};

// 默认全局设置
export const DEFAULT_GLOBAL_SETTINGS = {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-reasoner',
    userAvatar: '/wo.jpg',
    showLogic: true,
    showInner: true,
    autoPlayTTS: false,
    responseLength: 'normal',
    immersiveMode: false,
    rpTextStyle: 'clear',
    readingDensity: 'standard',
    motionLevel: 'soft',
    // v5.0: Custom style settings
    customStyle: {
        actionColor: '#a1a1aa',
        actionSymbol: '*',
        thoughtColor: '#78716c',
        thoughtSymbol: '♡',
        statusColor: '#6b7280',
        statusBracket: '[]',
        fontSize: 1.0,
        dialogueColor: '#e5e7eb',
        dialogueSymbol: '"'
    },
    // v5.1: Sound effects
    soundMuted: true,
    soundVolume: 0.2,
    // v5.9: Token display
    showTokens: false,
    // v6.0: 后台智能分析开关
    enableSmartAnalysis: true,
    // v6.1: 聊天字体大小
    chatFontSize: 1.0,
};

// 保存数据到 localStorage
export function saveToStorage(globalSettings, roleList, onError) {
    try {
        localStorage.setItem(STORAGE_KEYS.GLOBAL, JSON.stringify(globalSettings));
        localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roleList));
        return true;
    } catch (e) {
        const msg = (e.name === 'QuotaExceededError' || e.code === 22)
            ? '存储空间已满，请删除旧角色或清空长对话'
            : '保存数据失败';
        if (onError) onError(msg, e);
        return false;
    }
}

// 从 localStorage 加载数据
export function loadFromStorage(onError) {
    const result = {
        globalSettings: null,
        roleList: null,
        error: null,
    };

    try {
        const savedGlobal = localStorage.getItem(STORAGE_KEYS.GLOBAL);
        if (savedGlobal) {
            result.globalSettings = JSON.parse(savedGlobal);
        }

        const savedRoles = localStorage.getItem(STORAGE_KEYS.ROLES);
        if (savedRoles) {
            result.roleList = JSON.parse(savedRoles);
        }
    } catch (e) {
        if (onError) onError('加载数据失败，数据可能已损坏', e);
        result.error = e;
    }

    return result;
}

// 导出数据为 JSON
export function exportData(globalSettings, roleList) {
    const data = {
        version: '5.9',
        exportDate: new Date().toISOString(),
        globalSettings,
        roleList,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 导入数据
export function importData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!data.globalSettings || !data.roleList) {
            throw new Error('数据格式不正确');
        }
        return { success: true, data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ===== 用户画像存储 =====
const PERSONA_KEY = 'myai_user_persona_v1';
const PERSONA_MAX_TRAITS = 60;

export function loadUserPersona() {
    try {
        const raw = localStorage.getItem(PERSONA_KEY);
        if (!raw) return getDefaultPersona();
        return JSON.parse(raw);
    } catch {
        return getDefaultPersona();
    }
}

export function saveUserPersona(persona) {
    if (persona.traits.length > PERSONA_MAX_TRAITS) {
        persona.traits = persona.traits.slice(-PERSONA_MAX_TRAITS);
    }
    localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
}

// ===== 存储用量检测 =====
const STORAGE_TOTAL_KB = 5120; // 大多数浏览器 localStorage 限额 5MB

/**
 * 计算 localStorage 当前用量
 * @returns {{ usedKB: number, totalKB: number, percent: number, breakdown: Array<{key: string, label: string, sizeKB: number}> }}
 */
export function getStorageUsage() {
    const labels = {
        [STORAGE_KEYS.ROLES]: '角色数据',
        [STORAGE_KEYS.GLOBAL]: '全局设置',
        [STORAGE_KEYS.GROUPS]: '群聊数据',
        [STORAGE_KEYS.DIARIES]: '日记',
        [PERSONA_KEY]: '用户画像',
        [STORAGE_KEYS.SESSION]: '会话状态',
    };

    let totalBytes = 0;
    const breakdown = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || '';
        const sizeBytes = (key.length + value.length) * 2; // UTF-16 每字符 2 字节
        totalBytes += sizeBytes;

        // 只展示已知 key 的明细
        if (labels[key]) {
            breakdown.push({
                key,
                label: labels[key],
                sizeKB: Math.round(sizeBytes / 1024 * 10) / 10,
            });
        }
    }

    const usedKB = Math.round(totalBytes / 1024 * 10) / 10;
    const percent = Math.round(usedKB / STORAGE_TOTAL_KB * 100);

    // 按大小排序
    breakdown.sort((a, b) => b.sizeKB - a.sizeKB);

    return { usedKB, totalKB: STORAGE_TOTAL_KB, percent, breakdown };
}

function getDefaultPersona() {
    return {
        traits: [],
        messageCountSinceLastAnalysis: 0,
    };
}
