<script setup>
/**
 * ✨ WorldBookExtractor.vue — 世界书 AI 提取器
 * TXT 文件上传 → 分块 → AI 提取 → 预览审核 → 批量保存
 */
import { ref, computed, watch } from 'vue';
import { createEntry, saveWorldBook, loadWorldBook, syncEntryToSupabase } from '../../composables/promptModules/worldBook.js';

const props = defineProps({
    characterId: String,
    show: Boolean,
    globalSettings: Object,
});
const emit = defineEmits(['close', 'saved', 'show-toast']);

// ── 阶段控制 ──
const PHASE = { UPLOAD: 'upload', EXTRACTING: 'extracting', PREVIEW: 'preview' };
const phase = ref(PHASE.UPLOAD);

// ── 文件上传 ──
const fileText = ref('');
const fileName = ref('');
const isDragging = ref(false);
const fileInputRef = ref(null);

// ── 分块 ──
const CHUNK_SIZE = 8000;
const chunks = ref([]);
const totalChars = computed(() => fileText.value.length);
const estimatedCost = computed(() => {
    // DeepSeek V3 ¥0.27/百万 input token, 中文 1 字 ≈ 1.5 token
    const tokens = totalChars.value * 1.5;
    return (tokens / 1_000_000 * 0.27).toFixed(3);
});

// ── 提取状态 ──
const extractedEntries = ref([]);
const currentChunkIndex = ref(0);
const isPaused = ref(false);
const isStopped = ref(false);
const failedChunks = ref([]);     // 失败块的索引
const extractionAbort = ref(null); // AbortController

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

// ── 文件处理 ──
function handleFile(file) {
    if (!file || !file.name.endsWith('.txt')) {
        emit('show-toast', '请上传 .txt 文件', 'error');
        return;
    }
    fileName.value = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        fileText.value = e.target.result;
        chunks.value = splitIntoChunks(fileText.value, CHUNK_SIZE);
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
            // 在段落换行处切割
            const lastParagraph = text.lastIndexOf('\n\n', end);
            if (lastParagraph > pos + size * 0.5) {
                end = lastParagraph + 2;
            } else {
                // 退而求之次，找最后一个换行
                const lastNewline = text.lastIndexOf('\n', end);
                if (lastNewline > pos + size * 0.5) {
                    end = lastNewline + 1;
                }
                // 再退，找句号
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

    // 1. 去掉 <think>...</think> 推理内容
    let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. 去掉 markdown 代码块包裹
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // 3. 直接尝试解析
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* 继续尝试 */ }

    // 4. 在文本中找到第一个 [ ... ] 块（括号匹配）
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

// ── AI 提取 ──
const SYSTEM_PROMPT = `你是一个专业的小说设定提取助手。请从以下文本中提取所有出现的世界观设定，包括：地点、种族、势力、功法/魔法体系、重要物品、历史事件等。

重要规则：
- 忽略所有非正文内容：广告、水印、版权声明、译者注、章节标题、作者声明、平台推广、求票求收藏等
- 只提取故事内首次出现或有详细描写的设定，不要重复提取同一设定
- 人物角色不算世界设定（不要提取主角、配角等人物信息）

严格只返回 JSON 数组，不要任何解释文字，不要 markdown 代码块。
格式：
[{"name":"条目名","keywords":["词1","词2"],"content":"详细描述100-200字","category":"地理|种族|势力|功法|物品|历史|其他"}]
如果该段文本没有可提取的设定，返回空数组 []`;

async function startExtraction() {
    phase.value = PHASE.EXTRACTING;
    extractedEntries.value = [];
    currentChunkIndex.value = 0;
    isPaused.value = false;
    isStopped.value = false;
    failedChunks.value = [];

    await processChunks(0);
}

async function processChunks(startFrom) {
    const baseUrl = (props.globalSettings?.bgBaseUrl || props.globalSettings?.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const apiKey = props.globalSettings?.bgApiKey || props.globalSettings?.apiKey;
    const model = props.globalSettings?.bgModel || props.globalSettings?.model || 'deepseek-chat';

    if (!apiKey) {
        emit('show-toast', '请先在设置中配置 API Key', 'error');
        return;
    }

    for (let i = startFrom; i < chunks.value.length; i++) {
        if (isStopped.value) break;

        // 暂停等待
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
                        { role: 'system', content: SYSTEM_PROMPT },
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

            // 容错：提取 JSON 数组
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

        // 块间间隔
        if (i < chunks.value.length - 1 && !isStopped.value) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // 提取完成 → 去重 → 进入预览
    deduplicateEntries();
    phase.value = PHASE.PREVIEW;
    // 全选
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
    phase.value = PHASE.EXTRACTING;
    isPaused.value = false;
    isStopped.value = false;

    const baseUrl = (props.globalSettings?.bgBaseUrl || props.globalSettings?.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const apiKey = props.globalSettings?.bgApiKey || props.globalSettings?.apiKey;
    const model = props.globalSettings?.bgModel || props.globalSettings?.model || 'deepseek-chat';

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
                        { role: 'system', content: SYSTEM_PROMPT },
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

    // 语义搜索同步
    if (props.globalSettings?.semanticSearchEnabled && props.characterId) {
        for (const entry of newEntries) {
            try {
                await syncEntryToSupabase(props.characterId, entry);
            } catch { /* 静默 */ }
            await new Promise(r => setTimeout(r, 300));
        }
    }

    isSaving.value = false;
    emit('show-toast', `已保存 ${newEntries.length} 条世界书条目 ✓`, 'success');
    emit('saved');
    closeModal();
}

// ── 工具 ──
function closeModal() {
    phase.value = PHASE.UPLOAD;
    fileText.value = '';
    fileName.value = '';
    chunks.value = [];
    extractedEntries.value = [];
    selectedIds.value = new Set();
    failedChunks.value = [];
    emit('close');
}

function formatTime(chunks) {
    const minutes = Math.ceil(chunks * 3.5 / 60); // ~3.5s per chunk average
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
          <h3>✨ AI 世界书提取</h3>
          <button @click="closeModal" class="wbe-close">✕</button>
        </div>

        <!-- ═══ 阶段1：上传 ═══ -->
        <div v-if="phase === 'upload'" class="wbe-body">
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
            <button @click="startExtraction" class="wbe-btn primary">🚀 开始提取</button>
          </div>
        </div>

        <!-- ═══ 阶段2：提取中 ═══ -->
        <div v-else-if="phase === 'extracting'" class="wbe-body">
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
        </div>

        <!-- ═══ 阶段3：预览 ═══ -->
        <div v-else-if="phase === 'preview'" class="wbe-body">
          <div class="wbe-preview-header">
            <span class="wbe-preview-count">提取完成：{{ extractedEntries.length }} 条设定</span>
            <div class="wbe-select-actions">
              <button @click="selectAll" class="wbe-btn-sm">全选</button>
              <button @click="selectNone" class="wbe-btn-sm">全不选</button>
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
                     :class="{ selected: selectedIds.has(entry.name) }"
                     @click="toggleSelect(entry.name)">
                  <div class="wbe-check">{{ selectedIds.has(entry.name) ? '☑️' : '⬜' }}</div>
                  <div class="wbe-entry-info">
                    <div class="wbe-entry-title">{{ entry.name }}</div>
                    <div class="wbe-entry-kws">
                      <span v-for="kw in (entry.keywords || []).slice(0, 4)" :key="kw" class="wbe-kw-pill">{{ kw }}</span>
                    </div>
                    <div class="wbe-entry-desc">{{ (entry.content || '').slice(0, 60) }}{{ entry.content?.length > 60 ? '…' : '' }}</div>
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
.wbe-header h3 { margin: 0; font-size: 16px; color: #e5e7eb; font-weight: 600; }
.wbe-close {
  background: none; border: none; color: #71717a; cursor: pointer;
  font-size: 18px; padding: 2px 6px;
}
.wbe-close:hover { color: #d4d4d8; }
.wbe-body { padding: 20px; overflow-y: auto; flex: 1; }

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
</style>
