/**
 * API 工具函数
 */

/**
 * 🛡️ Bug#11: 规范化 API base URL
 * 防止用户误粘贴完整 endpoint（如 .../v1/chat/completions）导致路径重复
 * @param {string} baseUrl - 用户配置的 base URL
 * @returns {string} 规范化后的 base URL（不含末尾斜杠和 endpoint 路径）
 */
export function normalizeBaseUrl(baseUrl) {
    return (baseUrl || 'https://api.deepseek.com')
        .replace(/\/$/, '')
        .replace(/\/chat\/completions$/, '');
}
