<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'reopen-card'])

const LIBRARY_KEY = 'myai_card_library_v1'
const entries = ref(JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'))

function deleteEntry(id) {
  entries.value = entries.value.filter(e => e.id !== id)
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries.value))
}

function reopen(entry) {
  emit('reopen-card', entry)
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('zh-CN')
  } catch { return '' }
}
</script>

<template>
  <div class="clm-modal">
    <!-- Header -->
    <div class="clm-header">
      <h2 class="clm-title">🃏 我的卡片库</h2>
      <button class="clm-close" @click="$emit('close')">✕</button>
    </div>

    <!-- Empty state -->
    <div v-if="entries.length === 0" class="clm-empty">
      <div class="clm-empty-icon">🃏</div>
      <p>还没有保存的角色卡</p>
      <p class="clm-empty-sub">快去生成一张吧！</p>
    </div>

    <!-- Grid -->
    <div v-else class="clm-grid">
      <div v-for="entry in entries" :key="entry.id" class="clm-card">
        <div class="clm-thumb-wrap">
          <img :src="entry.thumbnailDataUrl" class="clm-thumb" :alt="entry.roleName" />
          <!-- Hover overlay -->
          <div class="clm-thumb-overlay">
            <button class="clm-btn-reopen" @click="reopen(entry)" title="重新打开">↗ 打开</button>
          </div>
        </div>
        <div class="clm-meta">
          <div class="clm-role-name">{{ entry.roleName }}</div>
          <div class="clm-date">{{ formatDate(entry.savedAt) }}</div>
          <div class="clm-template-tag">{{ entry.theme?.template || '?' }}</div>
        </div>
        <button class="clm-btn-delete" @click="deleteEntry(entry.id)" title="删除">🗑</button>
      </div>
    </div>
  </div>
</template>

<style>
.clm-modal {
  width: min(760px, 94vw);
  max-height: 85vh;
  background: #0e0e1f;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}

.clm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.clm-title {
  font-size: 18px;
  font-weight: 700;
  color: #f0eeff;
}

.clm-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.08);
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.clm-close:hover { background: rgba(255,255,255,0.15); color: #fff; }

.clm-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #4b5563;
  gap: 8px;
  font-size: 14px;
}
.clm-empty-icon { font-size: 48px; margin-bottom: 8px; }
.clm-empty-sub  { font-size: 12px; color: #374151; }

.clm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  padding: 20px;
  overflow-y: auto;
}

.clm-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 10px;
  transition: border-color 0.15s;
}
.clm-card:hover { border-color: rgba(99,102,241,0.35); }

.clm-thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 2/3;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a2e;
}

.clm-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.clm-thumb-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.clm-card:hover .clm-thumb-overlay { opacity: 1; }

.clm-btn-reopen {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.15);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.clm-btn-reopen:hover { background: rgba(99,102,241,0.4); }

.clm-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.clm-role-name {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clm-date {
  font-size: 11px;
  color: #4b5563;
}

.clm-template-tag {
  font-size: 10px;
  color: #6366f1;
  background: rgba(99,102,241,0.12);
  padding: 1px 7px;
  border-radius: 10px;
  width: fit-content;
}

.clm-btn-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(239,68,68,0.15);
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.clm-card:hover .clm-btn-delete { opacity: 1; }
.clm-btn-delete:hover { background: rgba(239,68,68,0.3); }
</style>
