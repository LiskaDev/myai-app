<script setup>
import { ref, computed } from 'vue';
import ModelConfigPanel from './ModelConfigPanel.vue';

const props = defineProps({
  book:           { type: Object, required: true },
  globalSettings: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['select-save', 'back', 'update-model']);

const gameModel      = ref(props.book.novelModel ? { ...props.book.novelModel } : { baseUrl: '', apiKey: '', model: '' });
const showModelPanel = ref(false);

function onModelSave(config) {
  gameModel.value = config;
  showModelPanel.value = false;
  emit('update-model', { novelModel: config });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const slots = computed(() => {
  return [0, 1, 2, 3].map(i => ({
    index: i,
    save: props.book.saves?.[i] || null,
  }));
});
</script>

<template>
  <div class="save-select">
    <div class="save-header">
      <div class="save-book-title">
        <span class="save-cover">{{ book.coverEmoji || '📖' }}</span>
        <span>{{ book.title }}</span>
      </div>
      <div class="save-subtitle">选择存档，开启冒险</div>
    </div>

    <div class="slot-list">
      <div
        v-for="slot in slots"
        :key="slot.index"
        :class="['slot-card', slot.save ? 'occupied' : 'empty']"
        @click="$emit('select-save', { slotIndex: slot.index, save: slot.save })"
      >
        <!-- Occupied Save -->
        <template v-if="slot.save">
          <div class="slot-label">{{ slot.save.label || `存档${slot.index + 1}` }}</div>
          <div class="slot-chapter">{{ slot.save.chapterTitle || '冒险中…' }}</div>
          <div class="slot-date">{{ formatDate(slot.save.updatedAt) }}</div>
          <div class="slot-continue">继续 →</div>
        </template>
        <!-- Empty Slot -->
        <template v-else>
          <div class="slot-empty-icon">＋</div>
          <div class="slot-empty-text">新建冒险</div>
          <div class="slot-empty-sub">存档位 {{ slot.index + 1 }}</div>
        </template>
      </div>
    </div>

    <!-- 游玩模型 -->
    <div class="model-bar">
      <span class="model-bar-label">游玩模型</span>
      <span class="model-bar-name">{{ gameModel.model || globalSettings.model || 'deepseek-chat（全局）' }}</span>
      <button class="model-bar-btn" @click="showModelPanel = !showModelPanel">⚙ 切换</button>
    </div>
    <ModelConfigPanel
      v-if="showModelPanel"
      :model-value="gameModel"
      @update:model-value="onModelSave"
      @close="showModelPanel = false"
    />

    <button class="back-btn" @click="$emit('back')">← 返回书库</button>
  </div>
</template>

<style scoped>
.save-select {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 0 0 40px;
}

.save-header {
  text-align: center;
  margin-bottom: 32px;
}

.save-book-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: rgba(255,255,255,0.88);
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.save-cover { font-size: 26px; line-height: 1; }

.save-subtitle {
  font-size: 13px;
  color: rgba(255,255,255,0.35);
  letter-spacing: 1px;
}

/* ── Slot List ── */
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 28px;
}

.slot-card {
  padding: 20px 24px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slot-card.occupied {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
}

.slot-card.occupied:hover {
  background: rgba(139,92,246,0.08);
  border-color: rgba(139,92,246,0.35);
  transform: translateX(4px);
  box-shadow: 0 4px 20px rgba(139,92,246,0.12);
}

.slot-card.empty {
  background: rgba(255,255,255,0.02);
  border: 1px dashed rgba(255,255,255,0.1);
  flex-direction: row;
  align-items: center;
  gap: 14px;
}

.slot-card.empty:hover {
  background: rgba(139,92,246,0.05);
  border-color: rgba(139,92,246,0.3);
  transform: translateX(4px);
}

.slot-label {
  font-size: 12px;
  color: rgba(192,132,252,0.7);
  letter-spacing: 1px;
  font-weight: 500;
}

.slot-chapter {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.5px;
}

.slot-date {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
}

.slot-continue {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(139,92,246,0.7);
  letter-spacing: 1px;
}

.slot-empty-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(139,92,246,0.1);
  border: 1px dashed rgba(139,92,246,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: rgba(139,92,246,0.6);
  flex-shrink: 0;
}

.slot-empty-text {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.5px;
}

.slot-empty-sub {
  font-size: 11px;
  color: rgba(255,255,255,0.25);
  margin-left: auto;
}

/* ── Back Button ── */
.back-btn {
  padding: 9px 22px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  color: rgba(255,255,255,0.45);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.back-btn:hover {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.65);
}

/* ── Model Bar ── */
.model-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
}
.model-bar-label {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.model-bar-name {
  font-size: 12px;
  color: rgba(200,168,74,0.75);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-bar-btn {
  padding: 4px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: rgba(255,255,255,0.45);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}
.model-bar-btn:hover {
  border-color: rgba(200,168,74,0.35);
  color: rgba(200,168,74,0.8);
}
</style>
