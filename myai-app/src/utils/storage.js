import { idbGet, idbPut, migrateFromLocalStorage } from './indexeddb.js';

// IndexedDB 键名（原 localStorage 主数据键，已迁移到 IDB）
const IDB_KEYS = {
    GLOBAL: 'myai_global_v1',
    ROLES:  'myai_roles_v1',
};

// localStorage 键名（小型辅助数据，继续用 localStorage）
export const STORAGE_KEYS = {
    GROUPS:  'myai_groups_v1',
    SESSION: 'myai_session_v1',
    DIARIES: 'myai_diaries_v1',
};

// 默认全局设置
export const DEFAULT_GLOBAL_SETTINGS = {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-reasoner',
    userAvatar: '/avatars/default_user.png',
    showLogic: true,
    showInner: true,
    autoPlayTTS: false,
    responseLength: 'normal',
    immersiveMode: true,
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
    // v6.x: 聊天行间距（1.2=紧凑, 1.6=默认, 2.2=宽松）
    chatLineHeight: 1.6,
    // v6.3: 聊天区亮度 & 文字深浅（50-150，100=无调整）
    chatBgBrightness: 100,
    chatTextBrightness: 100,
    chatFontWeight: 0,  // 字重微调: -2~+3, 0=不调整
    // v6.2: 后台任务专用模型（留空则使用主模型）
    bgModel: '',
    bgBaseUrl: '',
    bgApiKey: '',
    // v8.1: 世界书语义搜索开关
    semanticSearchEnabled: false,
    enableVectorMemory: false,
};

// 保存数据到 IndexedDB（异步，调用方无需 await）
export async function saveToStorage(globalSettings, roleList, onError) {
    try {
        await Promise.all([
            idbPut(IDB_KEYS.GLOBAL, globalSettings),
            idbPut(IDB_KEYS.ROLES, roleList),
        ]);
        return true;
    } catch (e) {
        console.error('[Storage] IDB 保存失败:', e);
        if (onError) onError('保存数据失败', e);
        return false;
    }
}

// 从 IndexedDB 加载数据（异步）
// 首次调用时自动将 localStorage 旧数据迁移到 IDB
export async function loadFromStorage(onError) {
    const result = { globalSettings: null, roleList: null, error: null };

    try {
        // 一次性迁移旧 localStorage 数据
        await migrateFromLocalStorage([IDB_KEYS.GLOBAL, IDB_KEYS.ROLES]);

        const [globalSettings, roleList] = await Promise.all([
            idbGet(IDB_KEYS.GLOBAL),
            idbGet(IDB_KEYS.ROLES),
        ]);

        result.globalSettings = globalSettings;
        result.roleList = roleList;
    } catch (e) {
        if (onError) onError('加载数据失败，数据可能已损坏', e);
        result.error = e;
    }

    return result;
}

// 导出数据为 JSON
export function exportData(globalSettings, roleList) {
    const data = {
        version: '7.0',
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
    const defaultPersona = getDefaultPersona();
    try {
        const raw = localStorage.getItem(PERSONA_KEY);
        if (!raw) return defaultPersona;
        const parsed = JSON.parse(raw);
        return {
            traits: parsed.traits || [],
            messageCountSinceLastAnalysis: parsed.messageCountSinceLastAnalysis || 0,
            lastAnalyzedAt: parsed.lastAnalyzedAt || null,
        };
    } catch {
        return defaultPersona;
    }
}

export function saveUserPersona(persona) {
    if (persona.traits.length > PERSONA_MAX_TRAITS) {
        persona.traits = persona.traits.slice(-PERSONA_MAX_TRAITS);
    }
    localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
}

// ===== 存储用量检测 =====
// 角色数据和全局设置已迁移到 IndexedDB（无容量上限）
// localStorage 仅存放辅助小数据，总量通常远低于 5MB
const STORAGE_TOTAL_KB = 5120;

/**
 * 计算当前 localStorage 用量（角色/设置数据已在 IDB，此处仅统计剩余 localStorage）
 * @returns {{ usedKB: number, totalKB: number, percent: number, breakdown: Array<{key: string, label: string, sizeKB: number}> }}
 */
export function getStorageUsage() {
    const labels = {
        [STORAGE_KEYS.GROUPS]:  '群聊数据',
        [STORAGE_KEYS.DIARIES]: '日记',
        [PERSONA_KEY]:          '用户画像',
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
