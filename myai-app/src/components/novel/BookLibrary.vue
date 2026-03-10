<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  bookList: { type: Array, default: () => [] },
});

const emit = defineEmits(['select-book', 'import', 'delete-book', 'export-book', 'import-book']);

const openMenuId = ref(null);
const confirmDeleteId = ref(null);

function toggleMenu(e, bookId) {
  e.stopPropagation();
  const next = openMenuId.value === bookId ? null : bookId;
  openMenuId.value = next;
  if (!next) confirmDeleteId.value = null;
}

function closeMenu() {
  openMenuId.value = null;
  confirmDeleteId.value = null;
}

function onDelete(bookId) {
  confirmDeleteId.value = bookId;
}

function confirmDelete(bookId) {
  closeMenu();
  emit('delete-book', bookId);
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function saveCount(book) {
  return (book.saves || []).filter(Boolean).length;
}

function latestSave(book) {
  const saves = (book.saves || []).filter(Boolean);
  if (!saves.length) return null;
  return saves.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
}

function bookTags(book) {
  return (book.worldEntries || []).slice(0, 4).map(e => e.name).filter(Boolean);
}
</script>

<template>
  <div class="book-library">
    <!-- Empty State -->
    <div v-if="bookList.length === 0" class="empty-state">
      <div class="empty-icon">📚</div>
      <div class="empty-title">书库空空如也</div>
      <div class="empty-sub">导入一本小说，开启你的冒险之旅</div>
      <button class="import-btn-main" @click="$emit('import')">
        <span>＋</span> 导入新书
      </button>
    </div>

    <!-- Book Grid -->
    <template v-else>
      <div class="library-header">
        <span class="library-label">📚 我的书库</span>
        <button class="import-btn-sm" @click="$emit('import')">＋ 导入新书</button>
      </div>
      <div class="book-grid" @click="closeMenu">
        <div
          v-for="book in bookList"
          :key="book.id"
          class="book-card"
          @click="$emit('select-book', book)"
        >
          <div class="book-cover">{{ book.coverEmoji || '📖' }}</div>
          <div class="book-info">
            <div class="book-title">{{ book.title }}</div>
            <div class="book-meta">
              <span>{{ saveCount(book) }}/4 存档</span>
              <span v-if="latestSave(book)"> · {{ latestSave(book).chapterTitle || '未命名' }}</span>
            </div>
            <div v-if="bookTags(book).length" class="book-tags">
              <span v-for="tag in bookTags(book)" :key="tag" class="book-tag">{{ tag }}</span>
              <span v-if="(book.worldEntries||[]).length > 4" class="book-tag-more">+{{ (book.worldEntries||[]).length - 4 }}</span>
            </div>
            <div v-else class="book-date">{{ formatDate(book.createdAt) }}</div>
          </div>

          <!-- ⋯ 菜单触发按钮 -->
          <button
            class="book-menu-btn"
            :class="{ active: openMenuId === book.id }"
            @click.stop="toggleMenu($event, book.id)"
            title="更多操作"
          >⋯</button>

          <!-- 下拉菜单 -->
          <div v-if="openMenuId === book.id" class="book-menu-dropdown" @click.stop>
            <template v-if="confirmDeleteId !== book.id">
              <button class="menu-item" @click.stop="$emit('export-book', book.id); closeMenu()">
                <span>📥</span> 导出存档
              </button>
              <button class="menu-item" @click.stop="$emit('import-book', book.id); closeMenu()">
                <span>📤</span> 导入存档
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item danger" @click.stop="onDelete(book.id)">
                <span>🗑️</span> 删除这本书
              </button>
            </template>
            <template v-else>
              <div class="menu-confirm-text">确定要删除吗？</div>
              <div class="menu-confirm-actions">
                <button class="menu-confirm-yes" @click.stop="confirmDelete(book.id)">删除</button>
                <button class="menu-confirm-no" @click.stop="confirmDeleteId = null">取消</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.book-library {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 0 40px;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  gap: 12px;
  text-align: center;
}

.empty-icon {
  font-size: 52px;
  filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.3));
  margin-bottom: 4px;
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 1px;
}

.empty-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.5px;
}

.import-btn-main {
  margin-top: 16px;
  padding: 12px 32px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(59, 130, 246, 0.8));
  border: none;
  border-radius: 24px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.import-btn-main:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.35);
}

/* ── Library Header ── */
.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.library-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 1px;
}

.import-btn-sm {
  padding: 7px 18px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 20px;
  color: rgba(192, 132, 252, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
}

.import-btn-sm:hover {
  background: rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.5);
}

/* ── Book Grid ── */
.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* ── Book Card ── */
.book-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: cardIn 0.4s ease-out both;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.book-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(139, 92, 246, 0.35);
  box-shadow:
    0 10px 32px rgba(139, 92, 246, 0.14),
    0 0 0 1px rgba(139, 92, 246, 0.18);
}

.book-cover {
  font-size: 44px;
  margin-bottom: 14px;
  filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.2));
  line-height: 1;
}

.book-info {
  text-align: center;
  width: 100%;
}

.book-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
  letter-spacing: 0.3px;
}

.book-date {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.25);
}

.book-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  margin-top: 6px;
}

.book-tag {
  padding: 2px 7px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 8px;
  font-size: 10px;
  color: rgba(192, 132, 252, 0.75);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-tag-more {
  padding: 2px 7px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.25);
}

.book-menu-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0;
  letter-spacing: -1px;
  line-height: 1;
}

.book-card:hover .book-menu-btn,
.book-menu-btn.active {
  opacity: 1;
}

.book-menu-btn:hover,
.book-menu-btn.active {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
  color: rgba(192, 132, 252, 0.9);
}

.book-menu-dropdown {
  position: absolute;
  top: 38px;
  right: 8px;
  background: rgba(20, 15, 40, 0.97);
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 10px;
  padding: 4px 0;
  min-width: 140px;
  z-index: 50;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  animation: menuIn 0.12s ease-out;
}

@keyframes menuIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.menu-item:hover {
  background: rgba(139, 92, 246, 0.15);
  color: rgba(255, 255, 255, 0.95);
}

.menu-item.danger { color: rgba(248, 113, 113, 0.8); }
.menu-item.danger:hover { background: rgba(239, 68, 68, 0.15); color: #f87171; }

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 4px 0;
}

.menu-confirm-text {
  padding: 8px 14px 4px;
  font-size: 12px;
  color: rgba(248, 113, 113, 0.85);
  text-align: center;
}

.menu-confirm-actions {
  display: flex;
  gap: 6px;
  padding: 4px 10px 8px;
}

.menu-confirm-yes {
  flex: 1;
  padding: 5px 0;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  color: #f87171;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.menu-confirm-yes:hover { background: rgba(239, 68, 68, 0.35); }

.menu-confirm-no {
  flex: 1;
  padding: 5px 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.menu-confirm-no:hover { background: rgba(255, 255, 255, 0.1); }

@media (max-width: 640px) {
  .book-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .book-card {
    padding: 20px 10px 16px;
  }
  .book-cover {
    font-size: 36px;
  }
  .book-title {
    font-size: 13px;
  }
}
</style>
