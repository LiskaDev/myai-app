<script setup>
import { ref, reactive } from 'vue';

const props = defineProps({
  book:           { type: Object, required: true },
  globalSettings: { type: Object, required: true },
});

const emit = defineEmits(['close', 'book-updated', 'delete-book', 'delete-save']);

const activeTab = ref('world'); // 'world' | 'style' | 'saves' | 'danger'

// ── 编辑状态 ──
const editingEntry = ref(null); // { index, entry }
const newEntry = reactive({ name: '', keywords: '', content: '', category: '其他' });
const showAddForm = ref(false);
const CATEGORIES = ['地理', '种族', '势力', '功法', '物品', '历史', '人物', '其他'];

// ── 风格/难度 ──
const STYLES = [
  { value: 'xianxia',    label: '仙侠修真' },
  { value: 'wuxia',      label: '武侠江湖' },
  { value: 'modern',     label: '现代都市' },
  { value: 'apocalypse', label: '末日废土' },
  { value: 'fantasy',    label: '西方奇幻' },
];
const localStyle      = ref(props.book.style || 'xianxia');
const localDifficulty = ref(props.book.difficulty ?? 1);

function saveStyleSettings() {
  emit('book-updated', { style: localStyle.value, difficulty: localDifficulty.value });
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

          <!-- Entry List -->
          <div class="entry-list">
            <div
              v-for="(entry, idx) in (book.worldEntries || [])"
              :key="entry.name + idx"
              class="entry-row"
            >
              <div class="entry-row-info">
                <span class="entry-cat">{{ entry.category || '其他' }}</span>
                <span class="entry-name">{{ entry.name }}</span>
              </div>
              <div class="entry-row-btns">
                <button class="icon-btn edit" @click="startEditEntry(idx)">✏</button>
                <button class="icon-btn del"  @click="deleteEntry(idx)">✕</button>
              </div>
            </div>
            <div v-if="!book.worldEntries?.length" class="empty-hint">暂无世界书条目</div>
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

          <button class="save-style-btn" @click="saveStyleSettings">保存设置</button>
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
              <button class="del-save-btn" @click="deleteSaveSlot(i)">删除</button>
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
.save-style-btn { padding: 10px 24px; background: rgba(200,168,74,0.15); border: 1px solid rgba(200,168,74,0.3); border-radius: 20px; color: #c8a84a; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.save-style-btn:hover { background: rgba(200,168,74,0.25); }

/* ── Saves Tab ── */
.save-slot-row { display: flex; align-items: center; justify-content: space-between; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.02); margin-bottom: 8px; }
.save-slot-empty { font-size: 12px; color: rgba(255,255,255,0.2); }
.save-slot-info { display: flex; flex-direction: column; gap: 2px; }
.save-slot-label { font-size: 12px; color: rgba(200,168,74,0.7); }
.save-slot-chapter { font-size: 14px; color: rgba(255,255,255,0.75); }
.save-slot-date { font-size: 11px; color: rgba(255,255,255,0.25); }
.del-save-btn { padding: 5px 14px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; color: #f87171; font-size: 11px; cursor: pointer; transition: all 0.2s; }
.del-save-btn:hover { background: rgba(239,68,68,0.18); }

/* ── Danger Tab ── */
.danger-warning { font-size: 13px; color: rgba(239,68,68,0.7); background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.delete-book-btn { padding: 12px 24px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; color: #f87171; font-size: 14px; cursor: pointer; width: 100%; transition: all 0.2s; letter-spacing: 0.5px; }
.delete-book-btn:hover { background: rgba(239,68,68,0.2); }
</style>
