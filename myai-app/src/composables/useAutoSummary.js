import {
    buildSummaryPrompt,
    shouldTriggerSummary,
    getMessageRanges,
} from '../utils/summary';
import { acquireBackgroundLock, releaseBackgroundLock, isBackgroundLocked } from './useTimeline';
import { useBackgroundTasks } from './useBackgroundTasks';

// 🧠 摘要也使用共享后台锁，防止与时间线分析并发

/**
 * 自动摘要 Composable - 在对话达到阈值时自动压缩历史消息
 */
export function useAutoSummary(appState) {
    const {
        globalSettings,
        currentRole,
        messages,
        showToast,
        saveData,
    } = appState;

    /**
     * 检查并触发自动摘要
     */
    function checkAndTriggerSummary() {
        // 🛡️ 后台智能分析开关
        if (!globalSettings.enableSmartAnalysis) return;

        const role = currentRole.value;
        const existingSummary = role.autoSummary || role.storySummary || '';
        const summarizedUpTo = role.summarizedUpTo || 0;

        if (shouldTriggerSummary(messages.value, existingSummary, summarizedUpTo) && !isBackgroundLocked()) {
            // 异步执行摘要，不阻塞用户操作
            generateAutoSummary().catch(err => {
                console.warn('[Summary] 自动摘要失败:', err.message);
            });
        }
    }

    /**
     * 生成自动摘要
     * v5.9: 不再删除旧消息，改为追踪 summarizedUpTo 索引
     */
    async function generateAutoSummary() {
        if (!acquireBackgroundLock()) return;
        const bgTask = useBackgroundTasks().trackTask('自动摘要');

        try {
            const role = currentRole.value;
            const summarizedUpTo = role.summarizedUpTo || 0;
            const { toSummarize, newSummarizedUpTo } = getMessageRanges(messages.value, summarizedUpTo);

            if (toSummarize.length === 0) {
                releaseBackgroundLock();
                return;
            }

            console.log(`[Summary] 正在压缩 ${toSummarize.length} 条消息（索引 ${summarizedUpTo} → ${newSummarizedUpTo}）...`);

            const existingSummary = role.autoSummary || '';
            const summaryPrompt = buildSummaryPrompt(toSummarize, role, existingSummary);

            // 构建摘要请求
            const baseUrl = (globalSettings.bgBaseUrl || globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const apiKey = globalSettings.bgApiKey || globalSettings.apiKey;
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: globalSettings.bgModel || globalSettings.model || 'deepseek-chat',
                    messages: [{ role: 'user', content: summaryPrompt }],
                    max_tokens: 500,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) {
                throw new Error(`摘要请求失败: ${response.status}`);
            }

            const data = await response.json();
            const newSummary = data.choices?.[0]?.message?.content?.trim();

            if (newSummary) {
                // 更新角色的自动摘要
                role.autoSummary = newSummary;

                // v5.9: 不删消息！只更新索引
                role.summarizedUpTo = newSummarizedUpTo;

                console.log(`[Summary] 摘要完成，已压缩到索引 ${newSummarizedUpTo}，全部 ${messages.value.length} 条消息保留`);
                showToast('💾 对话记忆已自动压缩', 'info');

                // 保存数据
                if (saveData) saveData();
            }
        } catch (error) {
            showToast('摘要生成失败，请稍后重试', 'error');
        } finally {
            bgTask.done();
            releaseBackgroundLock();
        }
    }

    return {
        checkAndTriggerSummary,
        generateAutoSummary,
    };
}
