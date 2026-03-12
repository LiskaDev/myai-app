/**
 * API 错误友好提示工具
 * 统一处理角色聊天 / 小说模式 / 助手三个场景的 API 错误
 */

/**
 * 根据 baseUrl 返回对应平台的充值页地址
 * @param {string} baseUrl
 * @returns {string}
 */
export function getRechargeUrl(baseUrl = '') {
  if (baseUrl.includes('deepseek.com'))  return 'https://platform.deepseek.com/top_up';
  if (baseUrl.includes('openai.com'))    return 'https://platform.openai.com/account/billing';
  if (baseUrl.includes('moonshot'))      return 'https://platform.moonshot.cn/console/account';
  if (baseUrl.includes('siliconflow'))   return 'https://cloud.siliconflow.cn/account/wallet';
  if (baseUrl.includes('zhipuai'))       return 'https://open.bigmodel.cn/finance/wallet';
  // 未知平台时返回空字符串
  return '';
}

/**
 * 将 API 异常映射为用户可读的中文提示
 * @param {Error|object} error
 * @returns {{ msg: string, isInsufficient: boolean }}
 *   msg            — 提示文本
 *   isInsufficient — 是否为余额不足（调用方可据此显示充值按钮）
 */
export function getFriendlyError(error) {
  const raw = error?.message || error?.error?.message || String(error || '');
  const s = raw.toLowerCase();

  if (s.includes('insufficient balance') || s.includes('402') || s.includes('insufficient_quota')) {
    return { msg: '💰 API 余额不足，请充值后再试', isInsufficient: true };
  }
  if (s.includes('invalid api key') || s.includes('unauthorized') || s.includes('401') || s.includes('authentication')) {
    return { msg: '🔑 API Key 无效，请在设置里检查是否填写正确', isInsufficient: false };
  }
  if (s.includes('rate limit') || s.includes('429') || s.includes('too many requests')) {
    return { msg: '⏳ 请求太频繁，请稍等几秒再试', isInsufficient: false };
  }
  if (s.includes('model not found') || (s.includes('404') && s.includes('model'))) {
    return { msg: '🤖 模型名称有误，请在设置里检查模型名称', isInsufficient: false };
  }
  if (s.includes('context length') || s.includes('maximum context') || s.includes('tokens')) {
    return { msg: '📄 对话内容太长，请清理一些历史记录后再试', isInsufficient: false };
  }
  if (s.includes('timeout') || s.includes('timed out') || error?.name === 'TimeoutError') {
    return { msg: '🌐 请求超时，请检查网络后重试', isInsufficient: false };
  }
  if (s.includes('failed to fetch') || s.includes('networkerror') || s.includes('econnrefused') || s.includes('network')) {
    return { msg: '🌐 网络连接失败，请检查网络后重试', isInsufficient: false };
  }
  if (/50[0-9]/.test(raw)) {
    return { msg: '🛠️ 服务器暂时故障，请稍后重试', isInsufficient: false };
  }
  // 兜底：截取原始消息前 50 字
  const excerpt = raw.slice(0, 50);
  return { msg: `❌ 请求失败（${excerpt}）`, isInsufficient: false };
}
