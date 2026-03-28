<script setup>
/**
 * 📖 WorldBookSettings.vue — 世界书管理 UI
 * 条目增删改查、开关、tag 式关键词输入、导入导出
 */
import { ref, computed, onMounted, watch } from 'vue';
import WorldBookExtractor from './WorldBookExtractor.vue';
import {
    createEntry,
    loadWorldBook,
    saveWorldBook,
    exportWorldBook,
    importWorldBook,
} from '../../composables/promptModules/worldBook.js';

const props = defineProps({
    currentRole: Object,
    globalSettings: Object,
});
const emit = defineEmits(['show-toast']);

// ── 状态 ──
const entries = ref([]);
const editingEntry = ref(null);     // 当前编辑中的条目（null = 列表模式）
const keywordInput = ref('');       // Tag 输入框的临时文本
const importFileRef = ref(null);    // 文件输入 ref
const showExtractor = ref(false);   // AI 提取器弹窗

// ── 加载/保存 ──
function load() {
    entries.value = loadWorldBook(props.currentRole?.id);
}
function save() {
    saveWorldBook(props.currentRole?.id, entries.value);
}

onMounted(load);
watch(() => props.currentRole?.id, load);

// 条目计数
const enabledCount = computed(() => entries.value.filter(e => e.enabled).length);

// ── 条目操作 ──
function addEntry() {
    const entry = createEntry();
    editingEntry.value = entry;
    keywordInput.value = '';
}

function editEntry(entry) {
    editingEntry.value = { ...entry, keywords: [...entry.keywords] };
    keywordInput.value = '';
}

function saveEntry() {
    const e = editingEntry.value;
    if (!e.name.trim() && !e.content.trim()) {
        emit('show-toast', '请至少填写名称或内容', 'error');
        return;
    }
    const idx = entries.value.findIndex(x => x.id === e.id);
    if (idx >= 0) {
        entries.value[idx] = e;
    } else {
        entries.value.push(e);
    }
    editingEntry.value = null;
    save();

    // 本地 BM25 — 不需要远程同步
}

function cancelEdit() {
    editingEntry.value = null;
}

function deleteEntry(id) {
    entries.value = entries.value.filter(e => e.id !== id);
    save();
    emit('show-toast', '条目已删除', 'info');


}

function toggleEntry(entry) {
    entry.enabled = !entry.enabled;
    save();
}

// ── Tag 式关键词输入 ──
function addKeyword() {
    const kw = keywordInput.value.trim();
    if (!kw || !editingEntry.value) return;
    // 支持逗号/空格批量添加
    const newKeywords = kw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
    for (const k of newKeywords) {
        if (!editingEntry.value.keywords.includes(k)) {
            editingEntry.value.keywords.push(k);
        }
    }
    keywordInput.value = '';
}

function removeKeyword(index) {
    editingEntry.value?.keywords.splice(index, 1);
}

function handleKeywordKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        addKeyword();
    }
    // Backspace 删最后一个 tag
    if (e.key === 'Backspace' && !keywordInput.value && editingEntry.value?.keywords.length) {
        editingEntry.value.keywords.pop();
    }
}

// ── 导入/导出 ──
function handleExport() {
    if (entries.value.length === 0) {
        emit('show-toast', '世界书为空，没有可导出的内容', 'error');
        return;
    }
    exportWorldBook(entries.value, props.currentRole?.name || 'worldbook');
    emit('show-toast', '世界书已导出 ✓', 'success');
}

function triggerImport() {
    importFileRef.value?.click();
}

function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const result = importWorldBook(e.target.result);
        if (result.success) {
            // 合并而不是覆盖：避免误操作丢失现有条目
            entries.value.push(...result.entries);
            save();
            emit('show-toast', `成功导入 ${result.entries.length} 条世界书条目 ✓`, 'success');
        } else {
            emit('show-toast', `导入失败: ${result.error}`, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ── 语义搜索开关 ──
function toggleSemantic() {
    if (props.globalSettings) {
        props.globalSettings.semanticSearchEnabled = !props.globalSettings.semanticSearchEnabled;
    }
}

// ── 向量记忆开关 ──
function toggleVectorMemory() {
    if (!props.globalSettings) return;
    props.globalSettings.enableVectorMemory = !props.globalSettings.enableVectorMemory;
}
</script>

<template>
  <div class="space-y-4">

    <!-- 标题与操作 -->
    <div class="flex items-center justify-between">
      <div class="section-title" style="margin:0">
        📖 世界书
        <span v-if="entries.length" class="badge-count">{{ enabledCount }}/{{ entries.length }}</span>
      </div>
      <div class="flex gap-2">
        <button @click="triggerImport" class="wb-action-btn">📥 导入</button>
        <button @click="handleExport" class="wb-action-btn">📤 导出</button>
        <button @click="showExtractor = true" class="wb-action-btn ai">✨ AI生成</button>
        <button @click="addEntry" class="wb-action-btn primary">➕ 新增</button>
      </div>
    </div>
    <p class="section-desc">定义世界观设定（地点、物品、历史等），对话中提到关键词时自动注入到 AI 上下文</p>
    <input ref="importFileRef" type="file" accept=".json" class="hidden" @change="handleImportFile">

    <!-- 语义搜索开关 -->
    <div class="wb-semantic-toggle">
      <div class="wb-semantic-info">
        <span class="wb-semantic-label">🧠 语义搜索</span>
        <span class="wb-semantic-desc">除关键词匹配外，还通过本地 BM25 全文搜索自动发现相关的世界书条目（无需网络）</span>
      </div>
      <button @click="toggleSemantic" class="wb-toggle-switch" :class="{ on: globalSettings?.semanticSearchEnabled }">
        {{ globalSettings?.semanticSearchEnabled ? 'ON' : 'OFF' }}
      </button>
    </div>

    <!-- 向量记忆开关 -->
    <div class="wb-semantic-toggle">
      <div class="wb-semantic-info">
        <span class="wb-semantic-label">💾 向量记忆</span>
        <span class="wb-semantic-desc">章节归档后自动提取关键记忆，每次对话语义检索相关历史（需配置后端服务）</span>
      </div>
      <button @click="toggleVectorMemory" class="wb-toggle-switch" :class="{ on: globalSettings?.enableVectorMemory }">
        {{ globalSettings?.enableVectorMemory ? 'ON' : 'OFF' }}
      </button>
    </div>

    <!-- 编辑表单 -->
    <div v-if="editingEntry" class="wb-edit-form">
      <div class="wb-form-header">
        <span class="text-sm font-medium text-gray-200">{{ entries.some(e => e.id === editingEntry.id) ? '编辑条目' : '新建条目' }}</span>
        <button @click="cancelEdit" class="wb-close-btn">✕</button>
      </div>

      <!-- 名称 -->
      <div class="wb-field">
        <label>条目名称</label>
        <input v-model="editingEntry.name" type="text" placeholder="如：蒙德城、风之神殿" class="api-input">
      </div>

      <!-- 关键词 (Tag Input) -->
      <div class="wb-field">
        <label>触发关键词 <span class="text-gray-600 font-normal">（任一匹配即激活）</span></label>
        <div class="wb-tag-input-wrap">
          <span v-for="(kw, i) in editingEntry.keywords" :key="i" class="wb-tag">
            {{ kw }}
            <button @click="removeKeyword(i)" class="wb-tag-remove">×</button>
          </span>
          <input v-model="keywordInput"
                 type="text"
                 class="wb-tag-input"
                 placeholder="输入关键词，按回车添加…"
                 @keydown="handleKeywordKeydown"
                 @blur="addKeyword">
        </div>
      </div>

      <!-- 内容 -->
      <div class="wb-field">
        <label>Lore 内容 <span class="text-gray-600 font-normal">（注入到 AI 上下文的文本）</span></label>
        <textarea v-model="editingEntry.content" rows="5" class="api-input wb-textarea"
                  placeholder="描述这个世界设定的详细内容…"></textarea>
      </div>

      <!-- 优先级 + 位置 -->
      <div class="wb-row">
        <div class="wb-field flex-1">
          <label>优先级</label>
          <div class="param-header">
            <span class="param-value">{{ editingEntry.priority }}</span>
          </div>
          <input v-model.number="editingEntry.priority" type="range" min="0" max="100" step="5" class="param-slider">
          <div class="param-scale"><span>0 · 低</span><span>50 · 标准</span><span>100 · 高</span></div>
        </div>
        <div class="wb-field" style="min-width:140px">
          <label>注入位置</label>
          <select v-model="editingEntry.position" class="api-input">
            <option value="before_char">角色设定前</option>
            <option value="after_char">对话上下文前</option>
          </select>
        </div>
      </div>

      <!-- 保存/取消 -->
      <div class="flex gap-2 mt-2">
        <button @click="saveEntry" class="wb-save-btn">✅ 保存</button>
        <button @click="cancelEdit" class="wb-cancel-btn">取消</button>
      </div>
    </div>

    <!-- 条目列表 -->
    <template v-if="!editingEntry">
      <div v-if="entries.length > 0" class="space-y-2">
        <div v-for="entry in entries" :key="entry.id" class="wb-entry"
             :class="{ disabled: !entry.enabled }">
          <div class="wb-entry-main" @click="editEntry(entry)">
            <div class="wb-entry-header">
              <span class="wb-entry-name">{{ entry.name || '(未命名)' }}</span>
              <span class="wb-entry-priority" :class="entry.priority >= 70 ? 'high' : entry.priority >= 30 ? 'mid' : 'low'">
                P{{ entry.priority }}
              </span>
            </div>
            <div class="wb-entry-keywords">
              <span v-for="(kw, i) in entry.keywords.slice(0, 5)" :key="i" class="wb-keyword-pill">{{ kw }}</span>
              <span v-if="entry.keywords.length > 5" class="wb-keyword-more">+{{ entry.keywords.length - 5 }}</span>
            </div>
            <p class="wb-entry-preview">{{ entry.content?.slice(0, 80) }}{{ entry.content?.length > 80 ? '…' : '' }}</p>
          </div>
          <div class="wb-entry-actions">
            <button @click.stop="toggleEntry(entry)"
                    class="wb-toggle" :class="{ on: entry.enabled }"
                    :title="entry.enabled ? '点击禁用' : '点击启用'">
              {{ entry.enabled ? '✅' : '⬜' }}
            </button>
            <button @click.stop="deleteEntry(entry.id)" class="wb-delete-btn" title="删除">🗑️</button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-state-icon">📖</div>
        <div class="empty-state-text">还没有世界书条目</div>
        <div class="empty-state-hint">点击上方「新增」添加世界设定，或导入 SillyTavern 格式的 Lorebook</div>
      </div>
    </template>

    <!-- AI 提取器 -->
    <WorldBookExtractor
      :show="showExtractor"
      :characterId="currentRole?.id"
      :currentRole="currentRole"
      :globalSettings="globalSettings"
      @close="showExtractor = false"
      @saved="load()"
      @show-toast="(msg, type) => emit('show-toast', msg, type)" />
  </div>
</template>

<style scoped>
/* ── 操作按钮 ── */
.wb-action-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--brush);
  color: var(--ink-faint);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
}
.wb-action-btn:hover { background: var(--paper-warm); color: var(--ink); }
.wb-action-btn.primary { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); border-color: var(--border-accent); }
.wb-action-btn.primary:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }
.wb-action-btn.ai { background: rgba(168, 85, 247, 0.15); color: #c4b5fd; border-color: rgba(168, 85, 247, 0.25); }
.wb-action-btn.ai:hover { background: rgba(168, 85, 247, 0.25); }

/* ── 编辑表单 ── */
.wb-edit-form {
  background: var(--brush);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}
.wb-form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.wb-close-btn { background: none; border: none; color: var(--ink-faint); cursor: pointer; font-size: 16px; padding: 2px 6px; }
.wb-close-btn:hover { color: var(--ink); }
.wb-field { margin-bottom: 12px; }
.wb-field label { display: block; font-size: 12px; color: var(--ink-faint); margin-bottom: 4px; }
.wb-row { display: flex; gap: 12px; }
.wb-textarea { font-family: inherit; resize: vertical; min-height: 80px; line-height: 1.6; }

/* ── Tag Input ── */
.wb-tag-input-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  background: var(--brush);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-height: 36px;
  align-items: center;
  cursor: text;
  transition: border-color 0.15s;
}
.wb-tag-input-wrap:focus-within { border-color: var(--accent); }
.wb-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}
.wb-tag-remove {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 14px;
  padding: 0 1px;
  line-height: 1;
  opacity: 0.6;
}
.wb-tag-remove:hover { opacity: 1; color: #f87171; }
.wb-tag-input {
  flex: 1;
  min-width: 100px;
  background: none;
  border: none;
  outline: none;
  color: var(--ink);
  font-size: 13px;
  padding: 2px 0;
}
.wb-tag-input::placeholder { color: var(--ink-faint); }

/* ── 保存/取消按钮 ── */
.wb-save-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
  border: 1px solid var(--border-accent);
  cursor: pointer;
  transition: all 0.15s;
}
.wb-save-btn:hover { background: color-mix(in srgb, var(--accent) 30%, transparent); }
.wb-cancel-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--brush);
  color: var(--ink-faint);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
}
.wb-cancel-btn:hover { color: var(--ink); }

/* ── 条目列表 ── */
.wb-entry {
  display: flex;
  align-items: stretch;
  background: var(--brush);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.15s;
}
.wb-entry:hover { background: var(--paper-warm); border-color: var(--border-accent); }
.wb-entry.disabled { opacity: 0.45; }
.wb-entry-main {
  flex: 1;
  padding: 10px 12px;
  cursor: pointer;
  min-width: 0;
}
.wb-entry-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.wb-entry-name { font-size: 13px; font-weight: 500; color: var(--ink); }
.wb-entry-priority {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}
.wb-entry-priority.high { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.wb-entry-priority.mid { background: rgba(234, 179, 8, 0.12); color: #fde68a; }
.wb-entry-priority.low { background: var(--brush); color: var(--ink-faint); }
.wb-entry-keywords { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px; }
.wb-keyword-pill {
  font-size: 10px;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  border-radius: 3px;
}
.wb-keyword-more { font-size: 10px; color: var(--ink-faint); align-self: center; }
.wb-entry-preview {
  font-size: 11px;
  color: var(--ink-faint);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wb-entry-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  border-left: 1px solid var(--border);
}
.wb-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 2px;
  transition: transform 0.15s;
}
.wb-toggle:hover { transform: scale(1.15); }
.wb-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px;
  opacity: 0.4;
  transition: opacity 0.15s;
}
.wb-delete-btn:hover { opacity: 1; }

/* ── 语义搜索开关 ── */
.wb-semantic-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--brush);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.wb-semantic-info { display: flex; flex-direction: column; gap: 2px; }
.wb-semantic-label { font-size: 13px; font-weight: 500; color: var(--ink); }
.wb-semantic-desc { font-size: 11px; color: var(--ink-faint); line-height: 1.4; }
.wb-toggle-switch {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border: 1px solid var(--border);
  background: var(--brush);
  color: var(--ink-faint);
  cursor: pointer;
  transition: all 0.2s;
}
.wb-toggle-switch.on {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
}
.wb-toggle-switch:hover { transform: scale(1.05); }
</style>
