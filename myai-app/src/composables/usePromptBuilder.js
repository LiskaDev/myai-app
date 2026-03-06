/**
 * Prompt 构建器 - 负责组装发送给 API 的消息列表
 * v7.0: 模块化架构 — 拆分为 coreIdentity / styleSystem / memorySystem / contextAssembler
 * v8.0: + worldBook 世界书模块
 */

import { computed } from 'vue';
import { useUserPersona } from './useUserPersona';
import { useTimeline } from './useTimeline';
import { buildCoreIdentity } from './promptModules/coreIdentity.js';
import { buildStyleInstructions } from './promptModules/styleSystem.js';
import { buildMemoryContext, buildMemoryCardContext, buildChapterContext } from './promptModules/memorySystem.js';
import { getActiveLoreEntries, loadWorldBook } from './promptModules/worldBook.js';
import { assemblePrompt } from './promptModules/contextAssembler.js';

export function usePromptBuilder(appState) {
    const { currentRole, messages } = appState;

    // 📖 世界书缓存 — 角色切换时自动重新加载，而不是每次 constructPrompt() 都读 localStorage
    const cachedWorldBook = computed(() => loadWorldBook(currentRole.value?.id));

    function constructPrompt() {
        const role = currentRole.value;
        const modelName = appState.globalSettings?.model || '';
        const immersive = appState.globalSettings?.immersiveMode ?? false;

        // ── P0 + P1：核心身份 ──
        const coreBlocks = buildCoreIdentity(role, modelName, immersive);

        // ── P1.5：📖 世界书匹配 ──
        const loreBlocks = getActiveLoreEntries(messages.value, cachedWorldBook.value);

        // ── P2：风格参考 ──
        const styleBlocks = buildStyleInstructions(role, messages.value);

        // ── P3：剧情参考（需要外部依赖的数据在这里获取）──
        const { buildTimelineForPrompt } = useTimeline(appState);
        const timelineText = buildTimelineForPrompt();
        const { personaSummaryForPrompt } = useUserPersona();
        const personaSummary = personaSummaryForPrompt.value || null;

        const memoryBlocks = buildMemoryContext(role, timelineText, personaSummary);

        // ── 组装最终 apiMessages ──
        return assemblePrompt({
            coreBlocks,
            styleBlocks,
            memoryBlocks,
            loreBlocks,
            role,
            messages: messages.value,
        });
    }

    return { constructPrompt, buildMemoryCardContext, buildChapterContext };
}
