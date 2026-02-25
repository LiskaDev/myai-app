import {
    buildSummaryPrompt,
    shouldTriggerSummary,
    getMessageRanges,
} from '../utils/summary';

// 🧠 摘要状态 - 防止重复触发
let isSummarizing = false;

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
        const role = currentRole.value;
        const existingSummary = role.autoSummary || role.storySummary || '';

        if (shouldTriggerSummary(messages.value, existingSummary) && !isSummarizing) {
            // 异步执行摘要，不阻塞用户操作
            generateAutoSummary().catch(err => {
                console.warn('[Summary] 自动摘要失败:', err.message);
            });
        }
    }

    /**
     * 生成自动摘要
     */
    async function generateAutoSummary() {
        if (isSummarizing) return;
        isSummarizing = true;

        try {
            const role = currentRole.value;
            const { toSummarize, toKeep } = getMessageRanges(messages.value);

            if (toSummarize.length === 0) {
                isSummarizing = false;
                return;
            }

            console.log(`[Summary] 正在压缩 ${toSummarize.length} 条消息...`);

            const existingSummary = role.autoSummary || '';
            const summaryPrompt = buildSummaryPrompt(toSummarize, role, existingSummary);

            // 构建摘要请求
            const baseUrl = (globalSettings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globalSettings.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat', // 用便宜的模型做摘要
                    messages: [{ role: 'user', content: summaryPrompt }],
                    max_tokens: 500,
                    temperature: 0.3, // 低温度保证一致性
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

                // 压缩消息列表：只保留最近的消息
                messages.value = toKeep;

                console.log(`[Summary] 摘要完成，保留 ${toKeep.length} 条消息`);
                showToast('💾 对话记忆已自动压缩', 'info');

                // 保存数据
                if (saveData) saveData();
            }
        } catch (error) {
            showToast('摘要生成失败，请稍后重试', 'error');
        } finally {
            isSummarizing = false;
        }
    }

    return {
        checkAndTriggerSummary,
        generateAutoSummary,
    };
}
