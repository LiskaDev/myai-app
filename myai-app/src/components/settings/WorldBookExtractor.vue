<script setup>
/**
 * ✨ WorldBookExtractor.vue — 世界书 AI 生成器（统一入口）
 * 三种模式：TXT 提取 / 主题生成 / 角色推导
 * 共用预览审核 → 批量保存
 */
import { ref, computed, watch } from 'vue';
import { createEntry, saveWorldBook, loadWorldBook } from '../../composables/promptModules/worldBook.js';

const props = defineProps({
    characterId: String,
    show: Boolean,
    globalSettings: Object,
    currentRole: Object,       // 3C 角色推导需要读取角色设定
});
const emit = defineEmits(['close', 'saved', 'show-toast']);

// ── 模式 ──
const MODE = { EXTRACT: 'extract', TOPIC: 'topic', ROLE: 'role' };
const activeMode = ref(null); // null = 模式选择页

// ── 阶段控制 ──
const PHASE = {
    MODE_SELECT: 'mode_select',
    INPUT: 'input',
    GENERATING: 'generating',
    PREVIEW: 'preview',
};
const phase = ref(PHASE.MODE_SELECT);

// ── 标题映射 ──
const MODAL_TITLES = {
    [PHASE.MODE_SELECT]: '✨ AI 世界书生成',
    extract: '📄 TXT 提取',
    topic: '🌍 主题生成',
    role: '🎭 角色推导',
};
const modalTitle = computed(() => {
    if (phase.value === PHASE.MODE_SELECT) return MODAL_TITLES[PHASE.MODE_SELECT];
    return MODAL_TITLES[activeMode.value] || '✨ AI 世界书生成';
});

// ── TXT 文件上传（模式A）──
const fileText = ref('');
const fileName = ref('');
const isDragging = ref(false);
const fileInputRef = ref(null);

// ── 分块 ──
const CHUNK_SIZE = 8000;
const chunks = ref([]);
const totalChars = computed(() => fileText.value.length);
const estimatedCost = computed(() => {
    const tokens = totalChars.value * 1.5;
    return (tokens / 1_000_000 * 0.27).toFixed(3);
});

// ── 主题生成（模式B）──
const topicInput = ref('');
const topicCount = ref(15);
const topicExtraContext = ref('');

// 类别勾选（主题模式）
const TOPIC_CATEGORIES = [
    { id: '地理', label: '🌍 地理', checked: true },
    { id: '种族', label: '👥 种族', checked: true },
    { id: '势力', label: '⚔️ 势力', checked: true },
    { id: '功法', label: '✨ 功法体系', checked: true },
    { id: '历史', label: '📜 历史事件', checked: true },
    { id: '人物', label: '👤 人物', checked: true },
    { id: '物品', label: '💎 物品', checked: true },
];
const topicCategories = ref(TOPIC_CATEGORIES.map(c => ({ ...c })));
const selectedTopicCategories = computed(() =>
    topicCategories.value.filter(c => c.checked).map(c => c.id)
);
function toggleTopicCategory(cat) { cat.checked = !cat.checked; }
function selectAllTopicCategories() { topicCategories.value.forEach(c => c.checked = true); }
function deselectAllTopicCategories() { topicCategories.value.forEach(c => c.checked = false); }
const isAllCatsSelected = computed(() => topicCategories.value.every(c => c.checked));
const isNoneCatsSelected = computed(() => topicCategories.value.every(c => !c.checked));

// ── 角色推导（模式C）──
const roleContextPreview = computed(() => {
    const r = props.currentRole;
    if (!r) return '';
    const fields = [
        r.name && `角色名：${r.name}`,
        r.background && `背景：${r.background}`,
        r.worldLogic && `世界规则：${r.worldLogic}`,
        r.appearance && `外貌：${r.appearance}`,
        r.speakingStyle && `说话方式：${r.speakingStyle}`,
        r.relationship && `关系：${r.relationship}`,
        r.contentPreferences && `内容偏好：${r.contentPreferences}`,
        r.secret && `隐藏设定：${r.secret}`,
        r.systemPrompt && `角色完整设定（节选）：${r.systemPrompt.slice(0, 2000)}${r.systemPrompt.length > 2000 ? '……（已截取）' : ''}`,
    ].filter(Boolean);
    return fields.join('\n\n');
});
const canDerive = computed(() => {
    const r = props.currentRole;
    return r && r.name && (r.background || r.worldLogic);
});

// ── 提取状态 ──
const extractedEntries = ref([]);
const currentChunkIndex = ref(0);
const isPaused = ref(false);
const isStopped = ref(false);
const failedChunks = ref([]);
const extractionAbort = ref(null);
const generatingError = ref('');
const expandedEntry = ref(null);   // 预览中展开查看全文的条目 name

// ── 预览选择 ──
const selectedIds = ref(new Set());
const collapsedCategories = ref(new Set());
const isSaving = ref(false);

// ── 分类映射 ──
const CATEGORY_LABELS = {
    '地理': '🌍 地理',
    '种族': '👥 种族',
    '势力': '⚔️ 势力',
    '功法': '✨ 功法/魔法',
    '物品': '💎 物品',
    '历史': '📜 历史',
    '人物': '👤 人物',
    '其他': '📋 其他',
};

// ── 计算属性 ──
const groupedEntries = computed(() => {
    const groups = {};
    for (const entry of extractedEntries.value) {
        const cat = entry.category || '其他';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(entry);
    }
    return groups;
});

const selectedCount = computed(() => selectedIds.value.size);
const isAllSelected = computed(() => extractedEntries.value.length > 0 && selectedIds.value.size === extractedEntries.value.length);
const isNoneSelected = computed(() => selectedIds.value.size === 0);

// ── 模式选择 ──
function selectMode(mode) {
    activeMode.value = mode;
    phase.value = PHASE.INPUT;
}

function backToModeSelect() {
    activeMode.value = null;
    phase.value = PHASE.MODE_SELECT;
    // 清理各模式的输入状态
    fileText.value = '';
    fileName.value = '';
    chunks.value = [];
    topicInput.value = '';
    topicExtraContext.value = '';
    generatingError.value = '';
}

// ══════════════════════════════════════════════
// TXT 文件处理（模式A 专用）
// ══════════════════════════════════════════════

function handleFile(file) {
    if (!file || !file.name.endsWith('.txt')) {
        emit('show-toast', '请上传 .txt 文件', 'error');
        return;
    }
    fileName.value = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const garbledRatio = (text.match(/\uFFFD/g) || []).length / Math.max(text.length, 1);
        if (garbledRatio > 0.05) {
            const gbkReader = new FileReader();
            gbkReader.onload = (e2) => {
                fileText.value = e2.target.result;
                chunks.value = splitIntoChunks(fileText.value, CHUNK_SIZE);
            };
            gbkReader.readAsText(file, 'GBK');
        } else {
            fileText.value = text;
            chunks.value = splitIntoChunks(text, CHUNK_SIZE);
        }
    };
    reader.readAsText(file, 'utf-8');
}

function handleFileDrop(e) {
    e.preventDefault();
    isDragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
}

function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
}

function triggerFileInput() {
    fileInputRef.value?.click();
}

// ── 智能分块 ──
function splitIntoChunks(text, size) {
    const result = [];
    let pos = 0;
    while (pos < text.length) {
        let end = Math.min(pos + size, text.length);
        if (end < text.length) {
            const lastParagraph = text.lastIndexOf('\n\n', end);
            if (lastParagraph > pos + size * 0.5) {
                end = lastParagraph + 2;
            } else {
                const lastNewline = text.lastIndexOf('\n', end);
                if (lastNewline > pos + size * 0.5) {
                    end = lastNewline + 1;
                }
                else {
                    const lastSentence = Math.max(
                        text.lastIndexOf('。', end),
                        text.lastIndexOf('.', end),
                        text.lastIndexOf('！', end),
                        text.lastIndexOf('？', end),
                    );
                    if (lastSentence > pos + size * 0.3) {
                        end = lastSentence + 1;
                    }
                }
            }
        }
        result.push(text.slice(pos, end));
        pos = end;
    }
    return result;
}

/**
 * 健壮的 JSON 数组提取 — 处理各种 AI 输出格式
 * 1. 去掉 <think> 推理标签
 * 2. 去掉 markdown 代码块
 * 3. 在自由文本中找到 [...] JSON 数组
 */
function extractJsonArray(raw) {
    if (!raw || !raw.trim()) return [];

    let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* 继续尝试 */ }

    const startIdx = text.indexOf('[');
    if (startIdx === -1) return [];

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '[') depth++;
        if (text[i] === ']') depth--;
        if (depth === 0) { endIdx = i; break; }
    }

    if (endIdx === -1) return [];

    try {
        const parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {
        console.warn('[Extractor] JSON 解析失败:', e.message, '\n原始内容:', text.slice(0, 200));
    }

    return [];
}

// ══════════════════════════════════════════════
// System Prompts
// ══════════════════════════════════════════════

const EXTRACT_SYSTEM_PROMPT = `你是一个专业的小说设定提取助手。请从以下文本中提取所有出现的世界观设定，包括：地点、种族、势力、功法/魔法体系、重要物品、历史事件等。

重要规则：
- 忽略所有非正文内容：广告、水印、版权声明、译者注、章节标题、作者声明、平台推广、求票求收藏等
- 只提取故事内首次出现或有详细描写的设定，不要重复提取同一设定
- 人物角色不算世界设定（不要提取主角、配角等人物信息）

严格只返回 JSON 数组，不要任何解释文字，不要 markdown 代码块。
格式：
[{"name":"条目名","keywords":["词1","词2"],"content":"详细描述100-200字","category":"地理|种族|势力|功法|物品|历史|其他"}]
如果该段文本没有可提取的设定，返回空数组 []`;

const TOPIC_SYSTEM_PROMPT = `你是一个专业的世界观架构师。用户给出一个主题，请围绕该主题构建一套完整的世界观设定。

生成规则：
- 只生成用户指定的类别，不要生成未要求的类别
- 每个条目要有层次和细节，不要泛泛而谈
- 条目之间必须有内在联系，构成一个逻辑自洽的世界观体系
- 关键词要覆盖该条目在故事中可能出现的多种称呼
- content 字段的描述要具体生动，150-250字

严格只返回 JSON 数组，不要任何解释文字，不要 markdown 代码块。
格式：
[{"name":"条目名","keywords":["词1","词2"],"content":"详细描述150-250字","category":"地理|种族|势力|功法|物品|历史|人物|其他"}]`;

const ROLE_SYSTEM_PROMPT = `你是一个专业的世界观架构师。根据以下角色设定推导出该角色所处世界的完整世界观设定。

推导规则：
- 从角色背景和世界规则出发，补全世界观的所有维度
- 地理：角色可能活动的地点和区域
- 势力：角色涉及的组织、阵营
- 功法/魔法：角色使用或可能遇到的能力体系
- 物品：角色的装备或世界中的重要物品
- 历史：影响角色命运的历史事件
- 人物：与角色相关的重要 NPC
- 所有条目必须与角色有内在联系，构成一个逻辑自洽的世界观
- content 字段的描述要具体生动，150-250字

严格只返回 JSON 数组，不要任何解释文字，不要 markdown 代码块。
格式：
[{"name":"条目名","keywords":["词1","词2"],"content":"详细描述150-250字","category":"地理|种族|势力|功法|物品|历史|人物|其他"}]`;

// ══════════════════════════════════════════════
// API 调用工具
// ══════════════════════════════════════════════

function getApiConfig() {
    const baseUrl = (props.globalSettings?.bgBaseUrl || props.globalSettings?.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const apiKey = props.globalSettings?.bgApiKey || props.globalSettings?.apiKey;
    const model = props.globalSettings?.bgModel || props.globalSettings?.model || 'deepseek-chat';
    return { baseUrl, apiKey, model };
}

// ══════════════════════════════════════════════
// 统一生成入口
// ══════════════════════════════════════════════

async function startGeneration() {
    const { apiKey } = getApiConfig();
    if (!apiKey) {
        emit('show-toast', '请先在设置中配置 API Key', 'error');
        return;
    }

    phase.value = PHASE.GENERATING;
    extractedEntries.value = [];
    selectedIds.value = new Set();
    failedChunks.value = [];
    generatingError.value = '';
    isPaused.value = false;
    isStopped.value = false;

    if (activeMode.value === MODE.EXTRACT) {
        currentChunkIndex.value = 0;
        await processChunks(0);
    } else {
        await singleShotGenerate();
    }
}

// ── 单次 API 生成（主题 / 角色模式）──
async function singleShotGenerate() {
    const systemPrompt = activeMode.value === MODE.TOPIC
        ? TOPIC_SYSTEM_PROMPT
        : ROLE_SYSTEM_PROMPT;

    const userMessage = activeMode.value === MODE.TOPIC
        ? `主题：${topicInput.value}\n生成数量：${topicCount.value}条\n包含类别：${selectedTopicCategories.value.join('、')}\n请确保条目之间有内在联系，构成一个自洽的世界观。${topicExtraContext.value ? '\n补充说明：' + topicExtraContext.value : ''}`
        : `请根据以下角色设定推导世界观：\n\n${roleContextPreview.value}`;

    const { baseUrl, apiKey, model } = getApiConfig();

    try {
        const controller = new AbortController();
        extractionAbort.value = controller;

        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.7,
                max_tokens: 8000,
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`API ${res.status}: ${errBody.slice(0, 100)}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const entries = extractJsonArray(content);

        if (entries.length === 0) {
            generatingError.value = 'AI 返回了空结果，请尝试换个主题或补充更多细节';
            phase.value = PHASE.INPUT;
            return;
        }

        extractedEntries.value = entries;
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('[Generator] 生成失败:', err.message);
        generatingError.value = `生成失败: ${err.message}`;
        phase.value = PHASE.INPUT;
        return;
    }

    deduplicateEntries();
    phase.value = PHASE.PREVIEW;
    for (const e of extractedEntries.value) {
        selectedIds.value.add(e.name);
    }
}

// ── TXT 分块提取（模式A）──
async function processChunks(startFrom) {
    const { baseUrl, apiKey, model } = getApiConfig();

    for (let i = startFrom; i < chunks.value.length; i++) {
        if (isStopped.value) break;

        while (isPaused.value && !isStopped.value) {
            await new Promise(r => setTimeout(r, 200));
        }
        if (isStopped.value) break;

        currentChunkIndex.value = i;

        try {
            const controller = new AbortController();
            extractionAbort.value = controller;

            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
                        { role: 'user', content: `请提取以下文本中的世界观设定：\n\n${chunks.value[i]}` },
                    ],
                    temperature: 0.3,
                    max_tokens: 4000,
                }),
                signal: controller.signal,
            });

            if (!res.ok) throw new Error(`API ${res.status}`);

            const data = await res.json();
            let content = data.choices?.[0]?.message?.content || '';

            const entries = extractJsonArray(content);
            if (entries.length > 0) {
                for (const e of entries) {
                    e._chunkIndex = i;
                    extractedEntries.value.push(e);
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') break;
            console.warn(`[Extractor] 块 ${i} 失败:`, err.message);
            failedChunks.value.push(i);
        }

        if (i < chunks.value.length - 1 && !isStopped.value) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    deduplicateEntries();
    phase.value = PHASE.PREVIEW;
    for (const e of extractedEntries.value) {
        selectedIds.value.add(e.name);
    }
}

function pauseExtraction() { isPaused.value = true; }
function resumeExtraction() { isPaused.value = false; }
function stopExtraction() {
    isStopped.value = true;
    extractionAbort.value?.abort();
}

async function retryFailed() {
    if (failedChunks.value.length === 0) return;
    const retryIndices = [...failedChunks.value];
    failedChunks.value = [];
    phase.value = PHASE.GENERATING;
    isPaused.value = false;
    isStopped.value = false;

    const { baseUrl, apiKey, model } = getApiConfig();

    for (const i of retryIndices) {
        if (isStopped.value) break;
        currentChunkIndex.value = i;

        try {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
                        { role: 'user', content: `请提取以下文本中的世界观设定：\n\n${chunks.value[i]}` },
                    ],
                    temperature: 0.3, max_tokens: 4000,
                }),
            });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            let content = data.choices?.[0]?.message?.content || '';
            const entries = extractJsonArray(content);
            if (entries.length > 0) {
                for (const e of entries) { e._chunkIndex = i; extractedEntries.value.push(e); }
            }
        } catch (err) {
            failedChunks.value.push(i);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    deduplicateEntries();
    phase.value = PHASE.PREVIEW;
}

// ── 去重 ──
function deduplicateEntries() {
    const map = new Map();
    for (const e of extractedEntries.value) {
        const key = e.name?.trim();
        if (!key) continue;
        const existing = map.get(key);
        if (!existing || (e.content || '').length > (existing.content || '').length) {
            map.set(key, e);
        }
    }
    extractedEntries.value = Array.from(map.values());
}

// ── 选择操作 ──
function toggleSelect(name) {
    if (selectedIds.value.has(name)) {
        selectedIds.value.delete(name);
    } else {
        selectedIds.value.add(name);
    }
}

function selectAll() {
    for (const e of extractedEntries.value) selectedIds.value.add(e.name);
}

function selectNone() {
    selectedIds.value.clear();
}

function selectCategory(cat) {
    const entries = groupedEntries.value[cat] || [];
    const allSelected = entries.every(e => selectedIds.value.has(e.name));
    for (const e of entries) {
        if (allSelected) {
            selectedIds.value.delete(e.name);
        } else {
            selectedIds.value.add(e.name);
        }
    }
}

function toggleCategory(cat) {
    if (collapsedCategories.value.has(cat)) {
        collapsedCategories.value.delete(cat);
    } else {
        collapsedCategories.value.add(cat);
    }
}

// ── 保存 ──
async function saveSelected() {
    if (selectedCount.value === 0) return;
    isSaving.value = true;

    const existing = loadWorldBook(props.characterId);
    const newEntries = [];

    for (const raw of extractedEntries.value) {
        if (!selectedIds.value.has(raw.name)) continue;
        const entry = createEntry({
            name: raw.name || '',
            keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
            content: raw.content || '',
            priority: 50,
            position: 'before_char',
        });
        newEntries.push(entry);
    }

    const merged = [...existing, ...newEntries];
    saveWorldBook(props.characterId, merged);

    // 本地 BM25 搜索不需要同步索引，Orama 索引在搜索时实时构建

    isSaving.value = false;
    emit('show-toast', `已保存 ${newEntries.length} 条世界书条目 ✓`, 'success');
    emit('saved');
    closeModal();
}

// ── 工具 ──
function closeModal() {
    phase.value = PHASE.MODE_SELECT;
    activeMode.value = null;
    fileText.value = '';
    fileName.value = '';
    chunks.value = [];
    topicInput.value = '';
    topicExtraContext.value = '';
    extractedEntries.value = [];
    selectedIds.value = new Set();
    failedChunks.value = [];
    generatingError.value = '';
    isStopped.value = true;
    extractionAbort.value?.abort();
    emit('close');
}

function formatTime(chunks) {
    const minutes = Math.ceil(chunks * 3.5 / 60);
    return minutes < 1 ? '不到 1 分钟' : `约 ${minutes} 分钟`;
}

// 重置状态
watch(() => props.show, (v) => {
    if (!v) {
        isStopped.value = true;
        extractionAbort.value?.abort();
    }
});

const progressPercent = computed(() => {
    if (chunks.value.length === 0) return 0;
    return Math.round((currentChunkIndex.value + 1) / chunks.value.length * 100);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="wbe-overlay" @click.self="closeModal">
      <div class="wbe-modal">
        <!-- 标题 -->
        <div class="wbe-header">
          <div class="wbe-header-left">
            <button v-if="phase !== 'mode_select'"
                    @click="phase === 'input' ? backToModeSelect() : null"
                    class="wbe-back"
                    :class="{ disabled: phase !== 'input' }"
                    :disabled="phase !== 'input'"
                    title="返回模式选择">←</button>
            <h3>{{ modalTitle }}</h3>
          </div>
          <button @click="closeModal" class="wbe-close">✕</button>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 模式选择页                           -->
        <!-- ═══════════════════════════════════ -->
        <div v-if="phase === 'mode_select'" class="wbe-body">
          <p class="wbe-mode-desc">选择一种方式来生成世界书条目</p>
          <div class="wbe-mode-grid">
            <!-- TXT 提取 -->
            <div class="wbe-mode-card" @click="selectMode('extract')">
              <div class="wbe-mode-icon">📄</div>
              <div class="wbe-mode-title">TXT 文本提取</div>
              <div class="wbe-mode-hint">从小说/设定文档中<br>自动提取世界设定</div>
            </div>
            <!-- 主题生成 -->
            <div class="wbe-mode-card" @click="selectMode('topic')">
              <div class="wbe-mode-icon">🌍</div>
              <div class="wbe-mode-title">主题生成</div>
              <div class="wbe-mode-hint">输入主题关键词<br>一键生成完整世界观</div>
            </div>
            <!-- 角色推导 -->
            <div class="wbe-mode-card" :class="{ disabled: !canDerive }" @click="canDerive && selectMode('role')">
              <div class="wbe-mode-icon">🎭</div>
              <div class="wbe-mode-title">角色推导</div>
              <div class="wbe-mode-hint">从当前角色设定<br>自动推导配套世界观</div>
              <div v-if="!canDerive" class="wbe-mode-lock">需要先填写角色背景</div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 输入页 — TXT 模式                    -->
        <!-- ═══════════════════════════════════ -->
        <div v-else-if="phase === 'input' && activeMode === 'extract'" class="wbe-body">
          <!-- 拖拽区 -->
          <div class="wbe-drop-zone"
               :class="{ dragging: isDragging }"
               @dragover.prevent="isDragging = true"
               @dragleave="isDragging = false"
               @drop="handleFileDrop"
               @click="triggerFileInput">
            <template v-if="!fileText">
              <div class="wbe-drop-icon">📄</div>
              <p class="wbe-drop-text">拖拽 TXT 文件到这里，或点击选择</p>
              <p class="wbe-drop-hint">支持小说、世界观设定文档等</p>
            </template>
            <template v-else>
              <div class="wbe-file-info">
                <span class="wbe-file-name">📄 {{ fileName }}</span>
                <div class="wbe-file-stats">
                  <span>{{ (totalChars / 10000).toFixed(1) }} 万字</span>
                  <span>·</span>
                  <span>{{ chunks.length }} 块</span>
                  <span>·</span>
                  <span>预计 {{ formatTime(chunks.length) }}</span>
                  <span>·</span>
                  <span>≈ ¥{{ estimatedCost }}</span>
                </div>
                <p v-if="totalChars > 5_000_000" class="wbe-warning">⚠️ 文件超过 500 万字，提取时间较长</p>
              </div>
            </template>
          </div>
          <input ref="fileInputRef" type="file" accept=".txt" class="hidden" @change="handleFileInput">

          <div v-if="fileText" class="wbe-actions">
            <button @click="fileText = ''; fileName = ''; chunks = []" class="wbe-btn secondary">重新选择</button>
            <button @click="startGeneration" class="wbe-btn primary">🚀 开始提取</button>
          </div>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 输入页 — 主题模式                    -->
        <!-- ═══════════════════════════════════ -->
        <div v-else-if="phase === 'input' && activeMode === 'topic'" class="wbe-body">
          <div class="wbe-topic-form">
            <div class="wbe-field">
              <label>🌍 世界主题</label>
              <input v-model="topicInput" type="text" class="wbe-input"
                     placeholder="例如：东方修仙世界、赛博朋克都市、中世纪魔法学院…"
                     @keydown.enter="topicInput.trim() && startGeneration()">
            </div>

            <div class="wbe-field">
              <label>📊 生成条目数</label>
              <div class="wbe-count-row">
                <input v-model.number="topicCount" type="range" min="5" max="25" step="1" class="wbe-slider">
                <span class="wbe-count-value">{{ topicCount }} 条</span>
              </div>
            </div>

            <div class="wbe-field">
              <label>🏷️ 生成类别</label>
              <div class="wbe-cat-grid">
                <label v-for="cat in topicCategories" :key="cat.id" class="wbe-cat-check"
                       :class="{ checked: cat.checked }" @click.prevent="toggleTopicCategory(cat)">
                  <span class="wbe-cat-icon">{{ cat.checked ? '☑️' : '⬜' }}</span>
                  <span>{{ cat.label }}</span>
                </label>
              </div>
              <div class="wbe-cat-actions">
                <button @click="selectAllTopicCategories" class="wbe-btn-sm" :class="{ active: isAllCatsSelected }">全选</button>
                <button @click="deselectAllTopicCategories" class="wbe-btn-sm" :class="{ active: isNoneCatsSelected }">全不选</button>
              </div>
            </div>

            <div class="wbe-field">
              <label>📝 补充说明 <span class="wbe-optional">（可选）</span></label>
              <textarea v-model="topicExtraContext" class="wbe-textarea-input" rows="3"
                        placeholder="对世界观的补充要求，如：重点描写战斗体系、包含东方元素…"></textarea>
            </div>

            <div v-if="generatingError" class="wbe-error">⚠️ {{ generatingError }}</div>
          </div>

          <div class="wbe-actions">
            <button @click="backToModeSelect" class="wbe-btn secondary">← 返回</button>
            <button @click="startGeneration" :disabled="!topicInput.trim()" class="wbe-btn primary">🌍 开始生成</button>
          </div>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 输入页 — 角色推导模式                -->
        <!-- ═══════════════════════════════════ -->
        <div v-else-if="phase === 'input' && activeMode === 'role'" class="wbe-body">
          <div class="wbe-role-preview">
            <div class="wbe-role-header">
              <span class="wbe-role-avatar">🎭</span>
              <span class="wbe-role-name">{{ currentRole?.name || '未命名角色' }}</span>
            </div>
            <div class="wbe-role-fields">
              <div v-if="currentRole?.background" class="wbe-role-field">
                <span class="wbe-role-label">📋 背景</span>
                <p>{{ currentRole.background.slice(0, 200) }}{{ currentRole.background.length > 200 ? '…' : '' }}</p>
              </div>
              <div v-if="currentRole?.worldLogic" class="wbe-role-field">
                <span class="wbe-role-label">🌐 世界规则</span>
                <p>{{ currentRole.worldLogic.slice(0, 200) }}{{ currentRole.worldLogic.length > 200 ? '…' : '' }}</p>
              </div>
              <div v-if="currentRole?.secret" class="wbe-role-field">
                <span class="wbe-role-label">🔒 隐藏设定</span>
                <p>{{ currentRole.secret.slice(0, 150) }}{{ currentRole.secret.length > 150 ? '…' : '' }}</p>
              </div>
              <div v-if="currentRole?.appearance" class="wbe-role-field">
                <span class="wbe-role-label">👁️ 外貌</span>
                <p>{{ currentRole.appearance.slice(0, 100) }}{{ currentRole.appearance.length > 100 ? '…' : '' }}</p>
              </div>
              <div v-if="currentRole?.speakingStyle" class="wbe-role-field">
                <span class="wbe-role-label">💬 说话方式</span>
                <p>{{ currentRole.speakingStyle.slice(0, 100) }}{{ currentRole.speakingStyle.length > 100 ? '…' : '' }}</p>
              </div>
              <div v-if="currentRole?.systemPrompt" class="wbe-role-field">
                <span class="wbe-role-label">📝 完整设定（节选）</span>
                <p>{{ currentRole.systemPrompt.slice(0, 300) }}{{ currentRole.systemPrompt.length > 300 ? '…' : '' }}</p>
              </div>
            </div>
            <p class="wbe-role-note">AI 将基于以上设定推导出完整的世界观条目</p>

            <div v-if="generatingError" class="wbe-error">⚠️ {{ generatingError }}</div>
          </div>

          <div class="wbe-actions">
            <button @click="backToModeSelect" class="wbe-btn secondary">← 返回</button>
            <button @click="startGeneration" class="wbe-btn primary">🎭 开始推导</button>
          </div>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 生成中                              -->
        <!-- ═══════════════════════════════════ -->
        <div v-else-if="phase === 'generating'" class="wbe-body">
          <!-- TXT 模式：分块进度 -->
          <template v-if="activeMode === 'extract'">
            <div class="wbe-progress-section">
              <div class="wbe-progress-bar">
                <div class="wbe-progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
              <div class="wbe-progress-stats">
                <span>⏳ 处理第 {{ currentChunkIndex + 1 }}/{{ chunks.length }} 块</span>
                <span>已提取 {{ extractedEntries.length }} 条设定</span>
              </div>
              <div v-if="failedChunks.length" class="wbe-fail-note">
                ⚠️ {{ failedChunks.length }} 块失败
              </div>
            </div>
            <div class="wbe-extract-controls">
              <button v-if="!isPaused" @click="pauseExtraction" class="wbe-btn secondary">⏸️ 暂停</button>
              <button v-else @click="resumeExtraction" class="wbe-btn primary">▶️ 继续</button>
              <button @click="stopExtraction" class="wbe-btn danger">⏹️ 停止（保留已提取）</button>
            </div>
          </template>

          <!-- 主题 / 角色模式：loading spinner -->
          <template v-else>
            <div class="wbe-generating-spinner">
              <div class="wbe-spinner"></div>
              <p class="wbe-generating-text">
                {{ activeMode === 'topic' ? '🌍 AI 正在构建世界观…' : '🎭 AI 正在推导世界观…' }}
              </p>
              <p class="wbe-generating-hint">通常需要 10-30 秒，请耐心等待</p>
            </div>
          </template>
        </div>

        <!-- ═══════════════════════════════════ -->
        <!-- 预览（三种模式共用）                  -->
        <!-- ═══════════════════════════════════ -->
        <div v-else-if="phase === 'preview'" class="wbe-body">
          <div class="wbe-preview-header">
            <span class="wbe-preview-count">生成完成：{{ extractedEntries.length }} 条设定</span>
            <div class="wbe-select-actions">
              <button @click="selectAll" class="wbe-btn-sm" :class="{ active: isAllSelected }">全选</button>
              <button @click="selectNone" class="wbe-btn-sm" :class="{ active: isNoneSelected }">全不选</button>
            </div>
          </div>

          <div v-if="failedChunks.length" class="wbe-retry-bar">
            <span>⚠️ {{ failedChunks.length }} 块提取失败</span>
            <button @click="retryFailed" class="wbe-btn-sm primary">重试</button>
          </div>

          <div class="wbe-groups">
            <div v-for="(entries, cat) in groupedEntries" :key="cat" class="wbe-group">
              <div class="wbe-group-header" @click="toggleCategory(cat)">
                <span class="wbe-group-arrow">{{ collapsedCategories.has(cat) ? '▶' : '▼' }}</span>
                <span class="wbe-group-label">{{ CATEGORY_LABELS[cat] || cat }}</span>
                <span class="wbe-group-count">{{ entries.length }}</span>
                <button @click.stop="selectCategory(cat)" class="wbe-btn-sm" style="margin-left:auto">
                  切换选择
                </button>
              </div>
              <div v-if="!collapsedCategories.has(cat)" class="wbe-group-entries">
                <div v-for="entry in entries" :key="entry.name"
                     class="wbe-preview-entry"
                     :class="{ selected: selectedIds.has(entry.name) }">
                  <div class="wbe-check" @click="toggleSelect(entry.name)">{{ selectedIds.has(entry.name) ? '☑️' : '⬜' }}</div>
                  <div class="wbe-entry-info" @click="expandedEntry === entry.name ? expandedEntry = null : expandedEntry = entry.name">
                    <div class="wbe-entry-title">
                      {{ entry.name }}
                      <span class="wbe-expand-hint">{{ expandedEntry === entry.name ? '▼' : '▶' }}</span>
                    </div>
                    <div class="wbe-entry-kws">
                      <span v-for="kw in (entry.keywords || []).slice(0, 4)" :key="kw" class="wbe-kw-pill">{{ kw }}</span>
                    </div>
                    <div v-if="expandedEntry === entry.name" class="wbe-entry-full">{{ entry.content }}</div>
                    <div v-else class="wbe-entry-desc">{{ (entry.content || '').slice(0, 60) }}{{ entry.content?.length > 60 ? '…' : '' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="wbe-save-bar">
            <span>已选 {{ selectedCount }} 条</span>
            <button @click="saveSelected"
                    :disabled="selectedCount === 0 || isSaving"
                    class="wbe-btn primary">
              {{ isSaving ? '保存中...' : `💾 保存到世界书` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wbe-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.wbe-modal {
  background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; width: min(680px, 92vw); max-height: 85vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
.wbe-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07);
}
.wbe-header-left { display: flex; align-items: center; gap: 10px; }
.wbe-header h3 { margin: 0; font-size: 16px; color: #e5e7eb; font-weight: 600; }
.wbe-back {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: #a1a1aa; cursor: pointer; font-size: 14px; padding: 3px 8px;
  border-radius: 6px; transition: all 0.15s;
}
.wbe-back:hover:not(.disabled) { background: rgba(255,255,255,0.1); color: #d4d4d8; }
.wbe-back.disabled { opacity: 0.3; cursor: not-allowed; }
.wbe-close {
  background: none; border: none; color: #71717a; cursor: pointer;
  font-size: 18px; padding: 2px 6px;
}
.wbe-close:hover { color: #d4d4d8; }
.wbe-body { padding: 20px; overflow-y: auto; flex: 1; }

/* ── 模式选择 ── */
.wbe-mode-desc {
  text-align: center; color: #71717a; font-size: 13px; margin: 0 0 20px;
}
.wbe-mode-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
@media (max-width: 500px) {
  .wbe-mode-grid { grid-template-columns: 1fr; }
}
.wbe-mode-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 24px 16px; border-radius: 12px; cursor: pointer;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  transition: all 0.2s; text-align: center; position: relative;
}
.wbe-mode-card:hover {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.3);
  transform: translateY(-2px);
}
.wbe-mode-card.disabled {
  opacity: 0.45; cursor: not-allowed;
}
.wbe-mode-card.disabled:hover {
  background: rgba(255,255,255,0.03);
  border-color: rgba(255,255,255,0.08);
  transform: none;
}
.wbe-mode-icon { font-size: 36px; margin-bottom: 10px; }
.wbe-mode-title { font-size: 14px; font-weight: 600; color: #e5e7eb; margin-bottom: 6px; }
.wbe-mode-hint { font-size: 11px; color: #71717a; line-height: 1.5; }
.wbe-mode-lock {
  margin-top: 8px; font-size: 10px; color: #fbbf24;
  background: rgba(251,191,36,0.1); padding: 2px 8px; border-radius: 4px;
}

/* ── 拖拽区 ── */
.wbe-drop-zone {
  border: 2px dashed rgba(99,102,241,0.25); border-radius: 12px;
  padding: 40px 20px; text-align: center; cursor: pointer;
  transition: all 0.2s; background: rgba(99,102,241,0.04);
}
.wbe-drop-zone:hover, .wbe-drop-zone.dragging {
  border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.08);
}
.wbe-drop-icon { font-size: 40px; margin-bottom: 8px; }
.wbe-drop-text { color: #a1a1aa; font-size: 14px; margin: 0 0 4px; }
.wbe-drop-hint { color: #52525b; font-size: 12px; margin: 0; }
.wbe-file-info { text-align: center; }
.wbe-file-name { font-size: 15px; color: #e5e7eb; font-weight: 500; }
.wbe-file-stats {
  display: flex; gap: 6px; justify-content: center;
  margin-top: 8px; font-size: 13px; color: #a1a1aa;
}
.wbe-warning { color: #fbbf24; font-size: 12px; margin-top: 8px; }

/* ── 主题生成表单 ── */
.wbe-topic-form { display: flex; flex-direction: column; gap: 16px; }
.wbe-field label {
  display: block; font-size: 13px; color: #d4d4d8; font-weight: 500; margin-bottom: 6px;
}
.wbe-optional { color: #52525b; font-weight: 400; font-size: 11px; }
.wbe-input {
  width: 100%; padding: 10px 14px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  color: #e5e7eb; font-size: 14px; outline: none; transition: border-color 0.15s;
  box-sizing: border-box;
}
.wbe-input:focus { border-color: rgba(99,102,241,0.5); }
.wbe-input::placeholder { color: #52525b; }
.wbe-textarea-input {
  width: 100%; padding: 10px 14px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  color: #e5e7eb; font-size: 13px; outline: none; resize: vertical;
  font-family: inherit; line-height: 1.6; transition: border-color 0.15s;
  box-sizing: border-box;
}
.wbe-textarea-input:focus { border-color: rgba(99,102,241,0.5); }
.wbe-textarea-input::placeholder { color: #52525b; }
.wbe-count-row { display: flex; align-items: center; gap: 12px; }
.wbe-slider {
  flex: 1; accent-color: #6366f1; height: 4px;
}
.wbe-count-value {
  font-size: 14px; color: #a5b4fc; font-weight: 600; min-width: 50px; text-align: right;
}

/* ── 角色推导预览 ── */
.wbe-role-preview {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 16px;
}
.wbe-role-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.wbe-role-avatar { font-size: 28px; }
.wbe-role-name { font-size: 16px; font-weight: 600; color: #e5e7eb; }
.wbe-role-fields { display: flex; flex-direction: column; gap: 10px; }
.wbe-role-field {
  background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px 12px;
}
.wbe-role-label {
  font-size: 11px; color: #a5b4fc; font-weight: 500; display: block; margin-bottom: 4px;
}
.wbe-role-field p {
  margin: 0; font-size: 12px; color: #a1a1aa; line-height: 1.5;
}
.wbe-role-note {
  margin: 14px 0 0; font-size: 12px; color: #71717a; text-align: center; font-style: italic;
}

/* ── 错误提示 ── */
.wbe-error {
  padding: 10px 14px; background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.2); border-radius: 8px;
  font-size: 13px; color: #fca5a5; margin-top: 12px;
}

/* ── 按钮 ── */
.wbe-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.wbe-btn {
  padding: 8px 18px; border-radius: 8px; font-size: 13px;
  cursor: pointer; border: 1px solid rgba(255,255,255,0.1);
  transition: all 0.15s;
}
.wbe-btn.primary { background: rgba(99,102,241,0.2); color: #a5b4fc; border-color: rgba(99,102,241,0.3); }
.wbe-btn.primary:hover { background: rgba(99,102,241,0.3); }
.wbe-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
.wbe-btn.secondary { background: rgba(255,255,255,0.06); color: #a1a1aa; }
.wbe-btn.secondary:hover { background: rgba(255,255,255,0.1); }
.wbe-btn.danger { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.25); }
.wbe-btn.danger:hover { background: rgba(239,68,68,0.25); }
.wbe-btn-sm {
  padding: 3px 10px; border-radius: 5px; font-size: 11px;
  background: rgba(255,255,255,0.06); color: #a1a1aa;
  border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
  transition: all 0.15s;
}
.wbe-btn-sm:hover { background: rgba(255,255,255,0.1); color: #d4d4d8; }
.wbe-btn-sm.active { background: rgba(99,102,241,0.2); color: #a5b4fc; border-color: rgba(99,102,241,0.3); }
.wbe-btn-sm.primary { background: rgba(99,102,241,0.15); color: #a5b4fc; border-color: rgba(99,102,241,0.2); }

/* ── 进度 ── */
.wbe-progress-section { margin-bottom: 20px; }
.wbe-progress-bar {
  height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;
}
.wbe-progress-fill {
  height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 4px; transition: width 0.3s;
}
.wbe-progress-stats {
  display: flex; justify-content: space-between;
  margin-top: 8px; font-size: 13px; color: #a1a1aa;
}
.wbe-fail-note { margin-top: 6px; font-size: 12px; color: #fbbf24; }
.wbe-extract-controls { display: flex; gap: 10px; }

/* ── Loading spinner ── */
.wbe-generating-spinner {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px; gap: 16px;
}
.wbe-spinner {
  width: 40px; height: 40px; border: 3px solid rgba(99,102,241,0.15);
  border-top-color: #6366f1; border-radius: 50%;
  animation: wbe-spin 0.8s linear infinite;
}
@keyframes wbe-spin { to { transform: rotate(360deg); } }
.wbe-generating-text { font-size: 15px; color: #e5e7eb; font-weight: 500; }
.wbe-generating-hint { font-size: 12px; color: #71717a; }

/* ── 预览 ── */
.wbe-preview-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.wbe-preview-count { font-size: 14px; color: #e5e7eb; font-weight: 500; }
.wbe-select-actions { display: flex; gap: 6px; }
.wbe-retry-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.2); border-radius: 8px;
  margin-bottom: 12px; font-size: 12px; color: #fde68a;
}
.wbe-groups { display: flex; flex-direction: column; gap: 8px; }
.wbe-group {
  border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden;
}
.wbe-group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: rgba(255,255,255,0.03);
  cursor: pointer; font-size: 13px; color: #d4d4d8; user-select: none;
}
.wbe-group-header:hover { background: rgba(255,255,255,0.05); }
.wbe-group-arrow { font-size: 10px; color: #71717a; width: 14px; }
.wbe-group-label { font-weight: 500; }
.wbe-group-count {
  font-size: 11px; padding: 1px 6px; border-radius: 3px;
  background: rgba(99,102,241,0.12); color: #a5b4fc;
}
.wbe-group-entries { padding: 4px; }
.wbe-preview-entry {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.1s;
}
.wbe-preview-entry:hover { background: rgba(255,255,255,0.04); }
.wbe-preview-entry.selected { background: rgba(99,102,241,0.08); }
.wbe-check { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.wbe-entry-info { min-width: 0; flex: 1; }
.wbe-entry-title { font-size: 13px; color: #e5e7eb; font-weight: 500; }
.wbe-entry-kws { display: flex; flex-wrap: wrap; gap: 3px; margin: 3px 0; }
.wbe-kw-pill {
  font-size: 10px; padding: 1px 6px; border-radius: 3px;
  background: rgba(99,102,241,0.12); color: #a5b4fc;
}
.wbe-entry-desc { font-size: 11px; color: #71717a; line-height: 1.4; }
.wbe-save-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 16px; padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.07);
  font-size: 13px; color: #a1a1aa;
}

.hidden { display: none; }

/* ── 类别勾选 ── */
.wbe-cat-grid {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.wbe-cat-check {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: #a1a1aa; cursor: pointer; transition: all 0.15s; user-select: none;
}
.wbe-cat-check:hover { background: rgba(255,255,255,0.07); }
.wbe-cat-check.checked {
  background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.25); color: #c7d2fe;
}
.wbe-cat-icon { font-size: 13px; }
.wbe-cat-actions { display: flex; gap: 6px; margin-top: 6px; }

/* ── 预览展开 ── */
.wbe-expand-hint {
  font-size: 9px; color: #52525b; margin-left: 6px; transition: color 0.15s;
}
.wbe-entry-info:hover .wbe-expand-hint { color: #a1a1aa; }
.wbe-entry-full {
  font-size: 12px; color: #a1a1aa; line-height: 1.6;
  margin-top: 4px; padding: 8px 10px;
  background: rgba(255,255,255,0.03); border-radius: 6px;
  white-space: pre-wrap; word-break: break-word;
}
</style>
