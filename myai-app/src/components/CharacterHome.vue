<template>
  <div class="character-home">
    <!-- 助手按鈕（相对于整个页面定位） -->
    <div class="home-top-actions">
      <button
        class="home-assistant-btn"
        :class="{ 'intro-glow': !assistantIntroSeen }"
        @click="$emit('open-assistant')"
        title="AI 助手"
      >✨ 助手</button>
    </div>

    <!-- 顶部标题区 -->
    <div class="home-header">
      <div class="home-logo">✨</div>
      <h1 class="home-title">MyAI RolePlay</h1>
      <p class="home-subtitle">选择一个角色，开始你的故事</p>
    </div>

    <!-- Tab 切换 -->
    <div class="home-tabs">
      <button :class="['home-tab', activeTab === 'role' && 'active']" @click="activeTab = 'role'">
        👤 角色
      </button>
      <button :class="['home-tab', activeTab === 'world' && 'active']" @click="switchToWorld">
        🌏 世界
      </button>
    </div>

    <!-- ── 角色 Tab ── -->
    <template v-if="activeTab === 'role'">
      <div class="home-grid">
        <div
          v-for="role in roleList"
          :key="role.id"
          class="role-card"
          @click="$emit('select-role', role.id)"
        >
          <div class="role-card-glow"></div>
          <div class="role-card-avatar">
            <img v-if="role.avatar" :src="role.avatar" :alt="role.name" @error="$event.target.style.display='none'" />
            <div v-else class="role-card-avatar-placeholder">🎭</div>
          </div>
          <div class="role-card-info">
            <h3 class="role-card-name">{{ role.name }}</h3>
            <p class="role-card-desc">{{ role.styleGuide || '点击开始对话' }}</p>
          </div>
          <div v-if="role.worldLogic" class="role-card-tag">
            {{ getWorldTag(role.worldLogic) }}
          </div>
          <div v-if="hasHistory(role)" class="role-card-badge" title="已有对话">💬</div>
        </div>
      </div>
    </template>

    <!-- ── 世界 Tab ── -->
    <template v-else>
      <div class="world-section">
        <!-- 世界 Tab 内导航标题 -->
        <div v-if="worldNav !== 'library'" class="world-nav-header">
          <button class="world-back-btn" @click="goBackInWorld">← 返回</button>
          <span class="world-nav-title">
            <span v-if="worldNav === 'import'">导入新书</span>
            <span v-else-if="worldNav === 'save-select' && selectedBook">
              {{ selectedBook.title }}
            </span>
          </span>
          <button
            v-if="worldNav === 'save-select' && selectedBook"
            class="world-settings-btn"
            @click="showBookSettings = true"
            title="书籍设置"
          >⚙</button>
        </div>

        <!-- 书库 -->
        <BookLibrary
          v-if="worldNav === 'library'"
          :book-list="novelStore.bookList.value"
          @select-book="onSelectBook"
          @import="worldNav = 'import'"
          @delete-book="onDeleteBook"
          @export-book="onExportBook"
          @import-book="onImportBookTrigger"
        />

        <!-- 导入 -->
        <BookImport
          v-else-if="worldNav === 'import'"
          :global-settings="globalSettings"
          @done="onImportDone"
          @cancel="worldNav = 'library'"
          @import-save="onImportSaveFile"
        />

        <!-- 存档选择 -->
        <SaveSelect
          v-else-if="worldNav === 'save-select' && selectedBook"
          :book="selectedBook"
          :global-settings="globalSettings"
          @select-save="onSelectSave"
          @back="worldNav = 'library'"
          @open-settings="$emit('open-settings')"
        />
      </div>
    </template>
  </div>

  <!-- 书籍设置面板（视图层覆盖）-->
  <BookSettings
    v-if="showBookSettings && selectedBook"
    :book="selectedBook"
    :global-settings="globalSettings"
    @close="showBookSettings = false"
    @book-updated="onBookSettingsUpdated"
    @delete-book="onBookSettingsDelete"
    @delete-save="onBookSettingsDeleteSave"
    @load-save="onBookSettingsLoadSave"
  />

  <!-- 隐藏文件输入（导入存档用）-->
  <input
    ref="importFileRef"
    type="file"
    accept=".json"
    style="display:none"
    @change="handleImportFile"
  />

  <!-- 导入/导出反馈 Toast -->
  <transition name="fade">
    <div v-if="importToast" class="import-toast">{{ importToast }}</div>
  </transition>

  <!-- 同名书籍冲突内联弹窗 -->
  <Teleport to="body">
    <div v-if="pendingBookConflict" class="ch-conflict-overlay" @click.self="conflictCancel">
      <div class="ch-conflict-box">
        <p class="ch-conflict-title">书库中已有《{{ pendingBookConflict.title }}》</p>
        <p class="ch-conflict-msg">请选择导入方式：</p>
        <div class="ch-conflict-btns">
          <button class="ch-btn-cancel" @click="conflictCancel">放弃</button>
          <button class="ch-btn-new" @click="conflictNew">新建一本</button>
          <button class="ch-btn-replace" @click="conflictReplace">覆盖现有</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import BookLibrary from './novel/BookLibrary.vue';
import BookImport  from './novel/BookImport.vue';
import SaveSelect  from './novel/SaveSelect.vue';
import BookSettings from './novel/BookSettings.vue';
import { useNovelStore } from '../composables/useNovelStore.js';
import { exportAllBookMessages } from '../composables/useNovelDB.js';

const props = defineProps({
  roleList:       { type: Array,  required: true },
  globalSettings: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['select-role', 'start-novel', 'open-settings', 'open-assistant']);

// 首次访问呼吸动效
const assistantIntroSeen = ref(!!localStorage.getItem('assistantIntroSeen'));

// ── Tab / 世界子导航 ──
const activeTab      = ref('role');
const worldNav       = ref('library');   // 'library' | 'import' | 'save-select'
const selectedBook   = ref(null);
const showBookSettings = ref(false);

// ── Novel Store ──
const novelStore = useNovelStore();
const importFileRef = ref(null);      // 隐藏文件输入
const importToast   = ref('');        // 简易反馈提示
let importToastTimer = null;

// 同名书籍冲突内联弹窗（替代 Chrome 可能拦截的 native confirm()）
const pendingBookConflict = ref(null); // { title, onReplace, onCreateNew }
function showBookConflict(title, onReplace, onCreateNew) {
  pendingBookConflict.value = { title, onReplace, onCreateNew };
}
function conflictReplace() { const cb = pendingBookConflict.value?.onReplace;   pendingBookConflict.value = null; cb?.(); }
function conflictNew()     { const cb = pendingBookConflict.value?.onCreateNew; pendingBookConflict.value = null; cb?.(); }
function conflictCancel()  { pendingBookConflict.value = null; }

function showImportToast(msg) {
  importToast.value = msg;
  clearTimeout(importToastTimer);
  importToastTimer = setTimeout(() => { importToast.value = ''; }, 3000);
}

onMounted(() => novelStore.loadBooks());

function switchToWorld() {
  activeTab.value = 'world';
  worldNav.value  = 'library';
  novelStore.loadBooks(); // 刷新
}

function goBackInWorld() {
  if (worldNav.value === 'import' || worldNav.value === 'save-select') {
    worldNav.value  = 'library';
    selectedBook.value = null;
  }
}

// ── 书库操作 ──
function onSelectBook(book) {
  // 从 store 读最新数据，确保 novelModel 等字段是最新状态
  novelStore.loadBooks();
  selectedBook.value = novelStore.getBook(book.id) || book;
  worldNav.value     = 'save-select';
}

async function onDeleteBook(bookId) {
  await novelStore.deleteBook(bookId);
}

// ── 导出存档 ──
async function onExportBook(bookId) {
  novelStore.loadBooks();
  const book = novelStore.getBook(bookId);
  if (!book) return;
  const slotMessages = await exportAllBookMessages(bookId);
  const msgMap = Object.fromEntries(slotMessages.map(m => [m.slotIndex, m.messages]));

  const exportData = {
    version: '1.0',
    exportedAt: Date.now(),
    bookMeta: {
      id:         book.id,
      title:      book.title,
      coverEmoji: book.coverEmoji,
      style:      book.style,
      difficulty: book.difficulty,
      createdAt:  book.createdAt,
    },
    worldEntries: book.worldEntries || [],
    saves: (book.saves || []).map((s, i) => {
      if (!s) return null;
      return { ...s, slotIndex: i, messages: msgMap[i] || [] };
    }).filter(Boolean),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${book.title.replace(/[\\/:*?"<>|]/g, '_')}_存档.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 导入存档（触发文件选择）──
function onImportBookTrigger() {
  importFileRef.value?.click();
}

async function handleImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';   // 允许重复选同一文件
  if (!file) return;

  let raw;
  try { raw = JSON.parse(await file.text()); } catch {
    showImportToast('❌ 文件解析失败，请确认是有效的 JSON 文件');
    return;
  }

  // 版本检测
  if (!raw.version || !raw.bookMeta || !Array.isArray(raw.saves)) {
    showImportToast('❌ 文件格式不兼容，请使用本应用导出的存档文件');
    return;
  }
  if (raw.version !== '1.0') {
    showImportToast(`❌ 存档版本（${raw.version}）不兼容，请更新应用后重试`);
    return;
  }

  // 同名书籍检测
  novelStore.loadBooks();
  const existing = novelStore.bookList.value.find(b => b.title === raw.bookMeta.title);

  if (existing) {
    showBookConflict(
      raw.bookMeta.title,
      async () => {
        await novelStore.replaceBook(existing, raw);
        novelStore.loadBooks();
        showImportToast(`✅ 已覆盖导入《${raw.bookMeta.title}》`);
      },
      async () => {
        const newBook = await novelStore.importAsNew(raw);
        novelStore.loadBooks();
        showImportToast(`✅ 已新建导入《${newBook.title}》`);
      },
    );
    return;
  } else {
    const newBook = await novelStore.importAsNew(raw);
    novelStore.loadBooks();
    showImportToast(`✅ 已导入《${newBook.title}》`);
  }
}

// ── 书籍设置（从存档选择页打开）──
async function onBookSettingsUpdated(updates) {
  if (!selectedBook.value) return;
  novelStore.updateBook(selectedBook.value.id, updates);
  novelStore.loadBooks();
  selectedBook.value = novelStore.getBook(selectedBook.value.id);
}

async function onBookSettingsDelete() {
  if (!selectedBook.value) return;
  await novelStore.deleteBook(selectedBook.value.id);
  showBookSettings.value = false;
  worldNav.value = 'library';
  selectedBook.value = null;
}

async function onBookSettingsDeleteSave({ deleteSaveSlot }) {
  if (!selectedBook.value) return;
  await novelStore.deleteSave(selectedBook.value.id, deleteSaveSlot);
  novelStore.loadBooks();
  selectedBook.value = novelStore.getBook(selectedBook.value.id);
}

function onBookSettingsLoadSave(slotIndex) {
  const book = selectedBook.value;
  if (!book) return;
  const save = book.saves?.[slotIndex];
  if (!save) return;
  showBookSettings.value = false;
  emit('start-novel', { book, slotIndex, save });
}

function onImportDone(book) {
  novelStore.loadBooks();
  const existing = novelStore.bookList.value.find(b => b.title === book.title);
  const doCreate = () => {
    novelStore.createBook({
      title:        book.title,
      coverEmoji:   book.coverEmoji,
      worldEntries: book.worldEntries,
      novelModel:   book.novelModel || null,
      style:        book.style    || 'xianxia',
      difficulty:   book.difficulty ?? 1,
    });
    novelStore.loadBooks();
    selectedBook.value = novelStore.bookList.value[novelStore.bookList.value.length - 1];
    worldNav.value = 'save-select';
  };
  if (existing) {
    showBookConflict(
      book.title,
      () => { novelStore.deleteBook(existing.id); doCreate(); },
      doCreate,
    );
  } else {
    doCreate();
  }
}

// 导入存档 JSON （来自 BookImport 上传区）
async function onImportSaveFile(raw) {
  novelStore.loadBooks();
  const existing = novelStore.bookList.value.find(b => b.title === raw.bookMeta.title);
  if (existing) {
    showBookConflict(
      raw.bookMeta.title,
      async () => {
        await novelStore.replaceBook(existing, raw);
        novelStore.loadBooks();
        showImportToast(`✅ 已覆盖导入《${raw.bookMeta.title}》`);
        worldNav.value = 'library';
      },
      async () => {
        const newBook = await novelStore.importAsNew(raw);
        novelStore.loadBooks();
        showImportToast(`✅ 已新建导入《${newBook.title}》`);
        worldNav.value = 'library';
      },
    );
    return;
  } else {
    const newBook = await novelStore.importAsNew(raw);
    novelStore.loadBooks();
    showImportToast(`✅ 已导入《${newBook.title}》`);
  }
  worldNav.value = 'library';
}

// ── 存档选择 ──
function onSelectSave({ slotIndex, save, roleConfig = null }) {
  const book = selectedBook.value;
  const hasBookKey = book?.novelModel?.apiKey;
  const hasGlobalKey = props.globalSettings?.apiKey;
  if (!hasBookKey && !hasGlobalKey) {
    showImportToast('⚠️ 请先在设置中填写 API Key');
    return;
  }
  emit('start-novel', { book, slotIndex, save, roleConfig });
}

function getWorldTag(worldLogic) {
  if (worldLogic.includes('怪物猎人') || worldLogic.includes('猎人世界')) return '🐉 怪猎';
  if (worldLogic.includes('生化') || worldLogic.includes('安布雷拉')) return '🧬 生化危机';
  if (worldLogic.includes('原神') || worldLogic.includes('提瓦特') || worldLogic.includes('蒙德')) return '🌀 原神';
  if (worldLogic.includes('写作') || worldLogic.includes('创意') || worldLogic.includes('灵感')) return '📝 创作';
  if (worldLogic.includes('异世界') || worldLogic.includes('魔法')) return '🗡️ 奇幻';
  if (worldLogic.includes('都市悬疑') || worldLogic.includes('侦探')) return '🔍 悬疑';
  if (worldLogic.includes('都市奇幻') || worldLogic.includes('超自然')) return '🔮 都市奇幻';
  if (worldLogic.includes('高中') || worldLogic.includes('日常')) return '🌸 日常';
  if (worldLogic.includes('科幻')) return '🚀 科幻';
  if (worldLogic.includes('历史') || worldLogic.includes('古代')) return '📜 历史';
  return '🌍 自定义';
}

function hasHistory(role) {
  // 检查主分支或 chatHistory 是否有消息
  const branch = (role.branches || []).find(b => b.id === role.activeBranchId);
  const msgs = branch?.chatHistory || role.chatHistory || [];
  return msgs.length > 0;
}
</script>

<style scoped>
/* ===== Tabs ===== */
.home-tabs {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 4px;
  margin-bottom: 28px;
  animation: fadeSlideUp 0.5s ease-out both;
  animation-delay: 0.05s;
}

.home-tab {
  flex: 1;
  padding: 8px 20px;
  border-radius: 20px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s;
  letter-spacing: 0.5px;
}

.home-tab.active {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.6), rgba(59, 130, 246, 0.5));
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.25);
}

.home-tab:not(.active):hover {
  color: rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.05);
}

/* ===== World Section ===== */
.world-section {
  width: 100%;
  max-width: 880px;
  animation: fadeSlideUp 0.4s ease-out both;
}

.world-nav-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.world-back-btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.world-back-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.world-nav-title {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
}

.world-settings-btn {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  transition: all 0.2s;
  flex-shrink: 0;
}
.world-settings-btn:hover {
  border-color: rgba(200, 168, 74, 0.4);
  color: rgba(200, 168, 74, 0.9);
}

.character-home {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding: 40px 24px 60px;
  background: linear-gradient(145deg, #0f0a1a 0%, #1a1030 35%, #12081f 70%, #0a0612 100%);
  animation: homeIn 0.5s ease-out;
}

@keyframes homeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

/* ===== Header ===== */
.home-header {
  text-align: center;
  margin-bottom: 40px;
  animation: fadeSlideUp 0.6s ease-out;
}

.home-top-actions {
  position: fixed;
  top: 16px;
  right: 20px;
  z-index: 110;
  display: flex;
  align-items: center;
  gap: 8px;
}

.home-assistant-btn {
  padding: 6px 14px;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  border: none;
  border-radius: 20px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
  letter-spacing: 0.3px;
  transition: opacity 0.2s;
}

.home-assistant-btn:hover { opacity: 0.85; }

.home-assistant-btn.intro-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4); }
  50%       { box-shadow: 0 0 0 8px rgba(124, 58, 237, 0); }
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.home-logo {
  font-size: 48px;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.5));
}

.home-title {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 8px;
  letter-spacing: 1px;
}

.home-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  letter-spacing: 2px;
}

/* ===== Card Grid ===== */
.home-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  max-width: 880px;
  width: 100%;
}

/* ===== Role Card ===== */
.role-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  animation: cardIn 0.5s ease-out both;
}

.role-card:nth-child(1) { animation-delay: 0.1s; }
.role-card:nth-child(2) { animation-delay: 0.15s; }
.role-card:nth-child(3) { animation-delay: 0.2s; }
.role-card:nth-child(4) { animation-delay: 0.25s; }
.role-card:nth-child(5) { animation-delay: 0.3s; }
.role-card:nth-child(6) { animation-delay: 0.35s; }
.role-card:nth-child(7) { animation-delay: 0.4s; }
.role-card:nth-child(8) { animation-delay: 0.45s; }

@keyframes cardIn {
  from { opacity: 0; transform: translateY(24px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.role-card:hover {
  transform: translateY(-6px);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow:
    0 12px 40px rgba(139, 92, 246, 0.15),
    0 0 0 1px rgba(139, 92, 246, 0.2);
}

.role-card:active {
  transform: translateY(-2px) scale(0.98);
}

/* Glow effect */
.role-card-glow {
  position: absolute;
  top: -60%;
  left: -20%;
  width: 140%;
  height: 100%;
  background: radial-gradient(ellipse, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.role-card:hover .role-card-glow {
  opacity: 1;
}

/* ===== Avatar ===== */
.role-card-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 14px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  transition: border-color 0.3s, box-shadow 0.3s;
  flex-shrink: 0;
}

.role-card:hover .role-card-avatar {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.25);
}

.role-card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.role-card-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
  font-size: 32px;
}

/* ===== Info ===== */
.role-card-info {
  text-align: center;
  flex: 1;
  min-height: 0;
}

.role-card-name {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  margin: 0 0 6px;
  letter-spacing: 0.5px;
}

.role-card-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== Tag ===== */
.role-card-tag {
  margin-top: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.2);
  font-size: 10px;
  color: rgba(192, 132, 252, 0.85);
  letter-spacing: 0.5px;
}

/* ===== Badge ===== */
.role-card-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 14px;
  opacity: 0.6;
}



/* ===== 手机端适配 ===== */
@media (max-width: 640px) {
  .character-home {
    padding: 30px 16px 40px;
  }

  .home-header {
    margin-bottom: 28px;
  }

  .home-logo {
    font-size: 36px;
  }

  .home-title {
    font-size: 22px;
  }

  .home-subtitle {
    font-size: 12px;
  }

  .home-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .role-card {
    padding: 20px 12px 16px;
    border-radius: 16px;
  }

  .role-card-avatar {
    width: 60px;
    height: 60px;
    margin-bottom: 10px;
  }

  .role-card-name {
    font-size: 14px;
  }

  .role-card-desc {
    font-size: 10px;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .role-card-tag {
    font-size: 9px;
    padding: 2px 8px;
  }
}

/* 极窄设备 */
@media (max-width: 360px) {
  .home-grid {
    gap: 8px;
  }

  .role-card {
    padding: 16px 8px 12px;
  }

  .role-card-avatar {
    width: 50px;
    height: 50px;
  }
}

/* ── 导入/导出 Toast ── */
.import-toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 15, 40, 0.96);
  border: 1px solid rgba(139, 92, 246, 0.35);
  color: rgba(255, 255, 255, 0.88);
  font-size: 14px;
  padding: 10px 22px;
  border-radius: 24px;
  white-space: nowrap;
  z-index: 999;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── 书籍冲突弹窗 ── */
.ch-conflict-overlay { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; padding: 20px; }
.ch-conflict-box { background: #1e1b2e; border: 1px solid rgba(139,92,246,0.3); border-radius: 14px; padding: 24px; max-width: 320px; width: 100%; }
.ch-conflict-title { color: #e2d9f3; font-size: 15px; font-weight: 600; margin-bottom: 8px; }
.ch-conflict-msg { color: rgba(226,217,243,0.6); font-size: 13px; margin-bottom: 20px; }
.ch-conflict-btns { display: flex; gap: 8px; justify-content: flex-end; }
.ch-btn-cancel  { padding: 8px 14px; border-radius: 8px; background: rgba(255,255,255,0.08); color: rgba(226,217,243,0.6); border: none; cursor: pointer; font-size: 13px; }
.ch-btn-new     { padding: 8px 14px; border-radius: 8px; background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); cursor: pointer; font-size: 13px; }
.ch-btn-replace { padding: 8px 14px; border-radius: 8px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor: pointer; font-size: 13px; }
</style>
