// localStorage 键名
export const STORAGE_KEYS = {
    GLOBAL: 'myai_global_v1',
    ROLES: 'myai_roles_v1',
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
    rpTextStyle: 'simple',
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
    }
};

// 保存数据到 localStorage
export function saveToStorage(globalSettings, roleList) {
    try {
        localStorage.setItem(STORAGE_KEYS.GLOBAL, JSON.stringify(globalSettings));
        localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roleList));
        return true;
    } catch (e) {
        console.error('保存数据失败:', e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            alert('⚠️ 存储空间已满！\n\n请执行以下操作之一：\n1. 删除一些旧角色\n2. 清空长对话记录\n3. 使用图片 URL 而不是上传图片');
        }
        return false;
    }
}

// 从 localStorage 加载数据
export function loadFromStorage() {
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
        console.error('加载数据失败:', e);
        result.error = e;
    }

    return result;
}

// 导出数据为 JSON
export function exportData(globalSettings, roleList) {
    const data = {
        version: '4.5.1',
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
