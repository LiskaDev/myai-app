<script setup>
import { ref, reactive, computed } from 'vue';
import ModelConfigPanel from './ModelConfigPanel.vue';

const props = defineProps({
  book:           { type: Object, required: true },
  globalSettings: { type: Object, required: true },
});

const emit = defineEmits(['close', 'book-updated', 'delete-book', 'delete-save', 'load-save']);

const activeTab = ref('world'); // 'world' | 'style' | 'saves' | 'danger'

// ── 编辑状态 ──
const editingEntry = ref(null); // { index, entry }
const newEntry = reactive({ name: '', keywords: '', content: '', category: '其他' });
const showAddForm = ref(false);
const CATEGORIES = ['地理', '种族', '势力', '功法', '物品', '历史', '人物', '其他'];

// ── 游玩模型配置 ──
const localNovelModel = ref(
  props.book.novelModel
    ? { ...props.book.novelModel }
    : { baseUrl: '', apiKey: '', model: '' }
);
const showModelPanel = ref(false);
const showModelKey   = ref(false);

function handleNovelModelSave(config) {
  localNovelModel.value = config;
  emit('book-updated', { novelModel: config });
}

// 当前实际生效来源：'book' | 'global' | 'none'
const effectiveSource = computed(() => {
  if (localNovelModel.value.apiKey) return 'book';
  if (props.globalSettings?.apiKey)  return 'global';
  return 'none';
});
function maskKey(key) {
  if (!key || key.length < 6) return key || '';
  return key.slice(0, 6) + '…' + key.slice(-4);
}

// ── 风格/难度/节奏 ──
const STYLES = [
  { value: 'xianxia',    label: '仙侠修真' },
  { value: 'wuxia',      label: '武侠江湖' },
  { value: 'modern',     label: '现代都市' },
  { value: 'apocalypse', label: '末日废土' },
  { value: 'fantasy',    label: '西方奇幻' },
];
const PACES = [
  { value: 'compact',   label: '简洁',  desc: '每轮约100字' },
  { value: 'auto',      label: 'Auto',  desc: '场景感知' },
  { value: 'standard',  label: '标准',  desc: '200-400字' },
  { value: 'immersive', label: '沉浸',  desc: '400-600字' },
];
const localStyle      = ref(props.book.style || 'xianxia');
const localDifficulty = ref(props.book.difficulty ?? 1);
const localPace       = ref(props.book.pace || 'auto');

function saveStyleSettings() {
  emit('book-updated', { style: localStyle.value, difficulty: localDifficulty.value, pace: localPace.value });
}

// ── 世界书操作 ──
function startEditEntry(index) {
  const e = props.book.worldEntries[index];
  editingEntry.value = {
    index,
    name: e.name || '',
    keywords: (e.keywords || []).join(', '),
    content: e.content || '',
    category: e.category || '其他',
  };
}

function saveEntry() {
  if (!editingEntry.value) return;
  const updated = [...props.book.worldEntries];
  updated[editingEntry.value.index] = {
    name: editingEntry.value.name,
    keywords: editingEntry.value.keywords.split(/[,，]+/).map(k => k.trim()).filter(Boolean),
    content: editingEntry.value.content,
    category: editingEntry.value.category,
  };
  emit('book-updated', { worldEntries: updated });
  editingEntry.value = null;
}

function deleteEntry(index) {
  if (!confirm('删除这条世界书条目？')) return;
  const updated = [...props.book.worldEntries];
  updated.splice(index, 1);
  emit('book-updated', { worldEntries: updated });
}

function addEntry() {
  if (!newEntry.name.trim()) return;
  const updated = [
    ...props.book.worldEntries,
    {
      name: newEntry.name.trim(),
      keywords: newEntry.keywords.split(/[,，]+/).map(k => k.trim()).filter(Boolean),
      content: newEntry.content.trim(),
      category: newEntry.category,
    },
  ];
  emit('book-updated', { worldEntries: updated });
  newEntry.name = '';
  newEntry.keywords = '';
  newEntry.content = '';
  newEntry.category = '其他';
  showAddForm.value = false;
}

// ── 世界书分组折叠 ──
const groupedEntries = computed(() => {
  const groups = {};
  for (const [i, entry] of (props.book.worldEntries || []).entries()) {
    const cat = entry.category || '其他';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ ...entry, _idx: i });
  }
  return groups;
});
const collapsedGroups = ref({});
function toggleGroup(cat) {
  // undefined/true = 折叠（默认），false = 展开
  const expanded = collapsedGroups.value[cat] === false;
  collapsedGroups.value = { ...collapsedGroups.value, [cat]: expanded ? undefined : false };
}

// ── 存档管理 ──
function deleteSaveSlot(slotIndex) {
  if (!confirm(`确定删除存档${slotIndex + 1}？此操作无法撤销。`)) return;
  // 单独 emit delete-save，由 App.vue 处理 IndexedDB 清理 + localStorage 更新
  emit('delete-save', { deleteSaveSlot: slotIndex });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
</script>

<template>
  <div class="book-settings-overlay" @click.self="$emit('close')">
    <div class="book-settings">
      <!-- Header -->
      <div class="bs-header">
        <div class="bs-title">{{ book.coverEmoji }} 书籍设置</div>
        <button class="bs-close" @click="$emit('close')">✕</button>
      </div>

      <!-- Tabs -->
      <div class="bs-tabs">
        <button :class="['bs-tab', activeTab === 'world' && 'active']"    @click="activeTab = 'world'">世界书</button>
        <button :class="['bs-tab', activeTab === 'style' && 'active']"    @click="activeTab = 'style'">风格难度</button>
        <button :class="['bs-tab', activeTab === 'model' && 'active']"    @click="activeTab = 'model'">游玩模型</button>
        <button :class="['bs-tab', activeTab === 'saves' && 'active']"    @click="activeTab = 'saves'">存档管理</button>
        <button :class="['bs-tab', activeTab === 'danger' && 'active', 'danger-tab']" @click="activeTab = 'danger'">危险区</button>
      </div>

      <div class="bs-body">
        <!-- ── 世界书 Tab ── -->
        <div v-if="activeTab === 'world'" class="tab-world">
          <div class="tab-header">
            <span class="tab-count">{{ book.worldEntries?.length || 0 }} 条设定</span>
            <button class="add-btn" @click="showAddForm = !showAddForm">＋ 添加</button>
          </div>

          <!-- Add Entry Form -->
          <div v-if="showAddForm" class="entry-form">
            <input v-model="newEntry.name" class="form-input" placeholder="条目名称*" />
            <input v-model="newEntry.keywords" class="form-input" placeholder="关键词（逗号分隔）" />
            <textarea v-model="newEntry.content" class="form-textarea" placeholder="详细描述" rows="3"></textarea>
            <select v-model="newEntry.category" class="form-select">
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <div class="form-btns">
              <button class="cancel-btn" @click="showAddForm = false">取消</button>
              <button class="save-btn" @click="addEntry">添加</button>
            </div>
          </div>

          <!-- Edit Entry Form -->
          <div v-if="editingEntry" class="entry-form">
            <input v-model="editingEntry.name" class="form-input" placeholder="条目名称*" />
            <input v-model="editingEntry.keywords" class="form-input" placeholder="关键词（逗号分隔）" />
            <textarea v-model="editingEntry.content" class="form-textarea" placeholder="详细描述" rows="4"></textarea>
            <select v-model="editingEntry.category" class="form-select">
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <div class="form-btns">
              <button class="cancel-btn" @click="editingEntry = null">取消</button>
              <button class="save-btn" @click="saveEntry">保存</button>
            </div>
          </div>

          <!-- Entry List (grouped) -->
          <div class="entry-groups">
            <div v-if="!book.worldEntries?.length" class="empty-hint">暂无世界书条目</div>
            <div
              v-for="(catEntries, cat) in groupedEntries"
              :key="cat"
              class="entry-group"
            >
              <div class="group-header" @click="toggleGroup(cat)">
                <span class="group-name">{{ cat }}</span>
                <span class="group-count">({{ catEntries.length }})</span>
                <span class="group-chevron">{{ collapsedGroups[cat] !== false ? '▶' : '▼' }}</span>
              </div>
              <template v-if="collapsedGroups[cat] === false">
                <div
                  v-for="entry in catEntries"
                  :key="entry.name + entry._idx"
                  class="entry-row"
                >
                  <div class="entry-row-info">
                    <span class="entry-name">{{ entry.name }}</span>
                  </div>
                  <div class="entry-row-btns">
                    <button class="icon-btn edit" @click="startEditEntry(entry._idx)">✏</button>
                    <button class="icon-btn del"  @click="deleteEntry(entry._idx)">✕</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- ── 风格难度 Tab ── -->
        <div v-else-if="activeTab === 'style'" class="tab-style">
          <div class="form-section">
            <label class="form-label">叙事风格</label>
            <select v-model="localStyle" class="form-select">
              <option v-for="s in STYLES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>

          <div class="form-section">
            <label class="form-label">游戏难度</label>
            <div class="difficulty-row">
              <button
                v-for="(label, val) in ['轻松', '普通', '硬核']"
                :key="val"
                :class="['diff-btn', localDifficulty === val && 'active']"
                @click="localDifficulty = val"
              >{{ label }}</button>
            </div>
            <div class="diff-desc">
              <span v-if="localDifficulty === 0">轻松：几乎不会失败，重在享受冒险故事</span>
              <span v-else-if="localDifficulty === 1">普通：合理的风险和奖惩，保持挑战性</span>
              <span v-else>硬核：高风险高回报，失败后果严重</span>
            </div>
          </div>

          <div class="form-section">
            <label class="form-label">叙事节奏</label>
            <div class="pace-grid">
              <button
                v-for="p in PACES"
                :key="p.value"
                :class="['pace-btn', localPace === p.value && 'active']"
                @click="localPace = p.value"
              >
                <span class="pace-name">{{ p.label }}</span>
                <span class="pace-desc">{{ p.desc }}</span>
              </button>
            </div>
          </div>

          <button class="save-style-btn" @click="saveStyleSettings">保存设置</button>
        </div>

        <!-- ── 游玩模型 Tab ── -->
        <div v-else-if="activeTab === 'model'" class="tab-model">

          <!-- 当前生效来源 banner -->
          <div :class="['model-source-status', 'source-' + effectiveSource]">
            <template v-if="effectiveSource === 'book'">
              ✅ 当前使用：书籍专属模型
            </template>
            <template v-else-if="effectiveSource === 'global'">
              🔗 当前使用：全局设置（回退）
              <span class="source-detail">{{ globalSettings.model || 'deepseek-chat' }} · {{ maskKey(globalSettings.apiKey) }}</span>
            </template>
            <template v-else>
              ⚠️ API Key 未配置，游戏将无法运行
            </template>
          </div>

          <div class="model-tab-hint">
            此处填写后优先级高于全局设置，留空则自动跟随全局。
          </div>

          <div class="form-section">
            <label class="form-label">Base URL</label>
            <input class="form-input" v-model="localNovelModel.baseUrl" placeholder="https://api.deepseek.com" autocomplete="off" />
          </div>

          <div class="form-section">
            <label class="form-label">API Key</label>
            <div class="model-key-row">
              <input
                :type="showModelKey ? 'text' : 'password'"
                class="form-input model-key-input"
                v-model="localNovelModel.apiKey"
                placeholder="sk-..."
                autocomplete="new-password"
              />
              <button class="model-eye-btn" @click="showModelKey = !showModelKey">{{ showModelKey ? '🙈' : '👁️' }}</button>
            </div>
          </div>

          <div class="form-section">
            <label class="form-label">模型名称</label>
            <input class="form-input" v-model="localNovelModel.model" placeholder="deepseek-chat" autocomplete="off" />
          </div>

          <div class="model-tab-btns">
            <button class="save-style-btn" @click="handleNovelModelSave(localNovelModel)">保存模型配置</button>
            <button v-if="localNovelModel.apiKey" class="clear-model-btn" @click="handleNovelModelSave({ baseUrl: '', apiKey: '', model: '' })">清除（跟随全局）</button>
          </div>
        </div>

        <!-- ── 存档管理 Tab ── -->
        <div v-else-if="activeTab === 'saves'" class="tab-saves">
          <div v-for="(save, i) in (book.saves || [])" :key="i" class="save-slot-row">
            <template v-if="save">
              <div class="save-slot-info">
                <div class="save-slot-label">{{ save.label || `存档${i+1}` }}</div>
                <div class="save-slot-chapter">{{ save.chapterTitle || '冒险中' }}</div>
                <div class="save-slot-date">{{ formatDate(save.updatedAt) }}</div>
              </div>
              <div class="save-slot-actions">
                <button class="load-save-btn" @click="emit('load-save', i)">读取</button>
                <button class="del-save-btn" @click="deleteSaveSlot(i)">删除</button>
              </div>
            </template>
            <template v-else>
              <div class="save-slot-empty">存档位 {{ i+1 }} — 空</div>
            </template>
          </div>
        </div>

        <!-- ── 危险区 Tab ── -->
        <div v-else-if="activeTab === 'danger'" class="tab-danger">
          <div class="danger-warning">⚠️ 以下操作不可撤销，请谨慎操作。</div>
          <button class="delete-book-btn" @click="$emit('delete-book')">
            🗑 删除整本书（含所有存档）
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-settings-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}

.book-settings {
  background: #13100c;
  border: 1px solid rgba(200,168,74,0.15);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bs-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(200,168,74,0.1);
  flex-shrink: 0;
}
.bs-title { font-size: 16px; color: #c8a84a; letter-spacing: 2px; }
.bs-close { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); cursor: pointer; font-size: 11px; transition: all 0.2s; }
.bs-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }

.bs-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid rgba(200,168,74,0.08);
  flex-shrink: 0; padding: 0 12px;
}
.bs-tab {
  padding: 10px 14px; background: transparent; border: none; border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.35); font-size: 12px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.5px;
  margin-bottom: -1px;
}
.bs-tab.active { color: #c8a84a; border-bottom-color: #c8a84a; }
.bs-tab.danger-tab.active { color: #f87171; border-bottom-color: #f87171; }
.bs-tab:hover { color: rgba(255,255,255,0.6); }

.bs-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.bs-body::-webkit-scrollbar { width: 3px; }
.bs-body::-webkit-scrollbar-thumb { background: rgba(200,168,74,0.2); border-radius: 2px; }

/* ── Tab Header ── */
.tab-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.tab-count { font-size: 12px; color: rgba(255,255,255,0.35); }
.add-btn { padding: 5px 14px; background: rgba(200,168,74,0.1); border: 1px solid rgba(200,168,74,0.25); border-radius: 12px; color: #c8a84a; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.add-btn:hover { background: rgba(200,168,74,0.18); }

/* ── Entry Form ── */
.entry-form { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; }
.form-input, .form-select {
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 8px 12px; color: rgba(255,255,255,0.8); font-size: 13px; outline: none; width: 100%; transition: border-color 0.2s;
}
.form-input:focus, .form-select:focus { border-color: rgba(200,168,74,0.4); }
.form-textarea { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; color: rgba(255,255,255,0.8); font-size: 13px; outline: none; width: 100%; resize: vertical; font-family: inherit; line-height: 1.6; transition: border-color 0.2s; }
.form-textarea:focus { border-color: rgba(200,168,74,0.4); }
.form-select option { background: #1a1208; }
.form-btns { display: flex; gap: 8px; justify-content: flex-end; }
.cancel-btn { padding: 6px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: rgba(255,255,255,0.45); font-size: 12px; cursor: pointer; }
.save-btn   { padding: 6px 16px; background: rgba(200,168,74,0.15); border: 1px solid rgba(200,168,74,0.3); border-radius: 12px; color: #c8a84a; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.save-btn:hover { background: rgba(200,168,74,0.25); }

/* ── Entry List ── */
.entry-list { display: flex; flex-direction: column; gap: 4px; }
.entry-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.02); }
.entry-row:hover { background: rgba(255,255,255,0.04); }
.entry-row-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.entry-cat  { padding: 1px 6px; background: rgba(200,168,74,0.1); border-radius: 6px; color: #c8a84a; font-size: 9px; flex-shrink: 0; }
.entry-name { font-size: 13px; color: rgba(255,255,255,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-row-btns { display: flex; gap: 4px; flex-shrink: 0; }
.icon-btn { width: 24px; height: 24px; border-radius: 6px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.3); font-size: 10px; cursor: pointer; transition: all 0.2s; }
.icon-btn.edit:hover { border-color: rgba(200,168,74,0.3); color: #c8a84a; }
.icon-btn.del:hover  { border-color: rgba(239,68,68,0.3); color: #f87171; }
.empty-hint { font-size: 12px; color: rgba(255,255,255,0.2); text-align: center; padding: 20px; }

/* ── Style Tab ── */
.form-section { margin-bottom: 20px; }
.form-label { display: block; font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 8px; letter-spacing: 0.5px; }
.difficulty-row { display: flex; gap: 8px; }
.diff-btn { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer; transition: all 0.2s; }
.diff-btn.active { background: rgba(200,168,74,0.12); border-color: rgba(200,168,74,0.35); color: #c8a84a; }
.diff-desc { margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.3); line-height: 1.6; min-height: 18px; }
.pace-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.pace-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.2s; }
.pace-btn.active { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4); color: #a78bfa; }
.pace-name { font-size: 13px; font-weight: 600; }
.pace-desc { font-size: 10px; color: inherit; opacity: 0.65; }
.save-style-btn { padding: 10px 24px; background: rgba(200,168,74,0.15); border: 1px solid rgba(200,168,74,0.3); border-radius: 20px; color: #c8a84a; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.save-style-btn:hover { background: rgba(200,168,74,0.25); }

/* ── 游玩模型配置 ── */
.model-row-bs {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 6px;
}
.model-name-bs {
  font-size: 12px; color: rgba(192,132,252,0.8); font-family: monospace;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.model-cfg-btn {
  padding: 3px 12px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25);
  border-radius: 8px; color: rgba(192,132,252,0.8); font-size: 11px; cursor: pointer;
  flex-shrink: 0; transition: all 0.2s;
}
.model-cfg-btn:hover { background: rgba(139,92,246,0.2); }
/* ── 游玩模型 Tab ── */
.tab-model { display: flex; flex-direction: column; gap: 4px; }
.model-tab-hint { font-size: 12px; color: rgba(255,255,255,0.3); margin-bottom: 4px; line-height: 1.6; }
.model-source-status {
  display: flex; flex-direction: column; gap: 3px;
  padding: 9px 13px; border-radius: 10px; font-size: 12px; margin-bottom: 10px;
}
.source-book   { background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25); color: rgba(110,231,183,0.95); }
.source-global { background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.2);  color: rgba(147,197,253,0.95); }
.source-none   { background: rgba(251,146,60,0.1); border: 1px solid rgba(251,146,60,0.25); color: rgba(253,186,116,0.95); }
.source-detail { font-size: 11px; opacity: 0.7; font-family: monospace; }
.model-key-row { display: flex; gap: 6px; }
.model-key-input { flex: 1; }
.model-eye-btn { padding: 0 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 13px; flex-shrink: 0; }
.model-tab-btns { display: flex; gap: 8px; margin-top: 8px; }
.clear-model-btn { padding: 10px 18px; background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.35); font-size: 13px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.5px; }
.clear-model-btn:hover { border-color: rgba(239,68,68,0.3); color: #f87171; }

/* ── Entry Groups ── */
.entry-groups { display: flex; flex-direction: column; gap: 2px; }
.group-header {
  display: flex; align-items: center; gap: 6px; padding: 7px 10px;
  cursor: pointer; border-radius: 8px; background: rgba(255,255,255,0.02);
  user-select: none; transition: background 0.15s;
}
.group-header:hover { background: rgba(255,255,255,0.05); }
.group-name { font-size: 12px; color: rgba(200,168,74,0.8); font-weight: 500; }
.group-count { font-size: 11px; color: rgba(255,255,255,0.3); }
.group-chevron { font-size: 8px; color: rgba(255,255,255,0.25); margin-left: auto; }

/* ── Saves Tab ── */
.save-slot-row { display: flex; align-items: center; justify-content: space-between; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.02); margin-bottom: 8px; }
.save-slot-empty { font-size: 12px; color: rgba(255,255,255,0.2); }
.save-slot-info { display: flex; flex-direction: column; gap: 2px; }
.save-slot-label { font-size: 12px; color: rgba(200,168,74,0.7); }
.save-slot-chapter { font-size: 14px; color: rgba(255,255,255,0.75); }
.save-slot-date { font-size: 11px; color: rgba(255,255,255,0.25); }
.save-slot-actions { display: flex; gap: 6px; flex-shrink: 0; }
.load-save-btn { padding: 5px 14px; background: rgba(200,168,74,0.08); border: 1px solid rgba(200,168,74,0.2); border-radius: 12px; color: var(--gold, #c8a84a); font-size: 11px; cursor: pointer; transition: all 0.2s; }
.load-save-btn:hover { background: rgba(200,168,74,0.18); }
.del-save-btn { padding: 5px 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; color: #f87171; font-size: 11px; cursor: pointer; transition: all 0.2s; }
.del-save-btn:hover { background: rgba(239,68,68,0.18); }

/* ── Danger Tab ── */
.danger-warning { font-size: 13px; color: rgba(239,68,68,0.7); background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.delete-book-btn { padding: 12px 24px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; color: #f87171; font-size: 14px; cursor: pointer; width: 100%; transition: all 0.2s; letter-spacing: 0.5px; }
.delete-book-btn:hover { background: rgba(239,68,68,0.2); }
</style>
