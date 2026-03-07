/**
 * Prompt 构建器 - 负责组装发送给 API 的消息列表
 * v7.0: 模块化架构 — 拆分为 coreIdentity / styleSystem / memorySystem / contextAssembler
 * v8.0: + worldBook 世界书模块（关键词匹配）
 * v8.1: + 语义搜索混合匹配（Supabase pgvector）
 */

import { computed } from 'vue';
import { useUserPersona } from './useUserPersona';
import { useTimeline } from './useTimeline';
import { buildCoreIdentity } from './promptModules/coreIdentity.js';
import { buildStyleInstructions } from './promptModules/styleSystem.js';
import { buildMemoryContext, buildMemoryCardContext, buildChapterContext } from './promptModules/memorySystem.js';
import { getActiveLoreEntries, getActiveLoreEntriesHybrid, loadWorldBook } from './promptModules/worldBook.js';
import { assemblePrompt } from './promptModules/contextAssembler.js';
import { retrieveRelevantMemories } from './useMemory.js';

export function usePromptBuilder(appState) {
    const { currentRole, messages } = appState;

    // 📖 世界书缓存 — 角色切换时自动重新加载，而不是每次 constructPrompt() 都读 localStorage
    const cachedWorldBook = computed(() => loadWorldBook(currentRole.value?.id));

    async function constructPrompt() {
        const role = currentRole.value;
        const modelName = appState.globalSettings?.model || '';
        const immersive = appState.globalSettings?.immersiveMode ?? false;
        const semanticEnabled = appState.globalSettings?.semanticSearchEnabled ?? false;

        // ── P0 + P1：核心身份 ──
        const coreBlocks = buildCoreIdentity(role, modelName, immersive);

        // ── P1.5：📖 世界书匹配 ──
        let loreBlocks;
        if (semanticEnabled) {
            // 语义搜索 + 关键词混合匹配（异步）
            loreBlocks = await getActiveLoreEntriesHybrid(
                messages.value, cachedWorldBook.value, role.id
            );
        } else {
            // 纯关键词匹配（同步，Phase 1 行为）
            loreBlocks = getActiveLoreEntries(messages.value, cachedWorldBook.value);
        }

        // ── P2：风格参考 ──
        const styleBlocks = buildStyleInstructions(role, messages.value);

        // ── P3：剧情参考（需要外部依赖的数据在这里获取）──
        const { buildTimelineForPrompt } = useTimeline(appState);
        const timelineText = buildTimelineForPrompt();
        const { personaSummaryForPrompt } = useUserPersona();
        const personaSummary = personaSummaryForPrompt.value || null;

        const memoryBlocks = buildMemoryContext(role, timelineText, personaSummary);

        // ── P3.5：向量记忆检索（enableVectorMemory 开关控制，失败静默降级）──
        const latestUserMsg = messages.value.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
        const vectorMemories = (appState.globalSettings?.enableVectorMemory && latestUserMsg)
            ? await retrieveRelevantMemories(role.id, latestUserMsg)
            : [];

        // ── 组装最终 apiMessages ──
        return assemblePrompt({
            coreBlocks,
            styleBlocks,
            memoryBlocks,
            loreBlocks,
            vectorMemoryBlocks: vectorMemories,
            role,
            messages: messages.value,
        });
    }

    return { constructPrompt, buildMemoryCardContext, buildChapterContext };
}

