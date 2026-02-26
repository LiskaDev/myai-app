<script setup>
defineProps({
  currentRole: Object,
  memoryEditState: Object
});

defineEmits([
  'add-manual-memory',
  'remove-manual-memory',
  'start-edit-memory',
  'save-edit-memory',
  'cancel-edit-memory',
  'toggle-memory-expand',
  'refine-memory'
]);
</script>

<template>
  <!-- 记忆管理 -->
  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-amber-400 flex items-center text-shadow">
      <span class="mr-2">📌</span> 记忆管理
      <span class="ml-auto text-xs font-normal text-gray-500">🪄 消耗少量 Token</span>
    </h3>

    <div class="space-y-4">
      <!-- Memory Window Slider -->
      <div>
        <div class="flex justify-between text-sm mb-1">
          <label class="text-gray-300">记忆窗口大小</label>
          <span class="text-primary font-mono">{{ currentRole.memoryWindow || 15 }} 轮</span>
        </div>
        <input v-model.number="currentRole.memoryWindow" type="range" min="5" max="30" step="1"
               class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>5轮</span>
          <span>15轮</span>
          <span>30轮</span>
        </div>
      </div>

      <!-- Manual Memories Display -->
      <div class="pt-3 border-t border-white/10">
        <div class="flex justify-between items-center mb-3">
          <label class="text-sm text-gray-300">永久记忆</label>
          <span class="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full">
            {{ (currentRole.manualMemories || []).length }} 条
          </span>
        </div>

        <!-- Add New Memory Button -->
        <button @click="$emit('add-manual-memory')" class="memory-add-btn mb-3">
          ➕ 新增自定义记忆
        </button>

        <!-- Memory List -->
        <div v-if="(currentRole.manualMemories || []).length > 0" class="space-y-3 max-h-64 overflow-y-auto pr-1">
          <div v-for="(memory, mIndex) in currentRole.manualMemories" :key="mIndex" class="memory-item rounded-lg bg-white/5 p-3">
            <!-- View Mode -->
            <template v-if="memoryEditState.editingIndex !== mIndex">
              <div class="flex items-start gap-2">
                <!-- Role Icon -->
                <span class="flex-shrink-0 text-base mt-0.5">
                  {{ memory.source === 'group' ? '🔗' : (memory.role === 'user' ? '👤' : (memory.isCustom ? '📝' : '🎭')) }}
                </span>

                <!-- Content -->
                <div class="flex-1 min-w-0" @click="$emit('toggle-memory-expand', mIndex)">
                  <p class="text-gray-300 text-xs leading-relaxed memory-content-preview"
                     :class="{
                       'line-clamp-2': memoryEditState.expandedIndex !== mIndex,
                       'memory-content-expanded': memoryEditState.expandedIndex === mIndex
                     }">
                    {{ memory.content || '(空记忆)' }}
                  </p>
                  <span v-if="memory.source === 'group'" class="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                    来自群聊{{ memory.groupName ? '：' + memory.groupName : '' }}
                  </span>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                <!-- AI Refine Button -->
                <button @click="$emit('refine-memory', mIndex)" class="memory-action-btn refine"
                        :disabled="memoryEditState.refiningIndex === mIndex || !memory.content"
                        :title="memory.content && memory.content.length >= 20 ? 'AI 精简 (~消耗少量Token)' : '内容太短'">
                  <span :class="{ 'spinning': memoryEditState.refiningIndex === mIndex }">🪄</span>
                  {{ memoryEditState.refiningIndex === mIndex ? '精简中...' : '精简' }}
                </button>

                <!-- Edit Button -->
                <button @click="$emit('start-edit-memory', mIndex)" class="memory-action-btn edit">
                  ✏️ 编辑
                </button>

                <!-- Delete Button -->
                <button @click="$emit('remove-manual-memory', mIndex)" class="memory-action-btn delete ml-auto">
                  🗑️
                </button>
              </div>
            </template>

            <!-- Edit Mode -->
            <template v-else>
              <div class="space-y-2">
                <textarea v-model="memoryEditState.editContent" class="memory-edit-input"
                          placeholder="输入记忆内容，如：[设定] 用户是公司的幕后老板" rows="3"></textarea>

                <div class="flex items-center gap-2">
                  <button @click="$emit('save-edit-memory', mIndex)" class="memory-action-btn save">
                    ✅ 保存
                  </button>
                  <button @click="$emit('cancel-edit-memory')" class="memory-action-btn cancel">
                    ❌ 取消
                  </button>
                  <span class="text-xs text-gray-500 ml-auto">
                    {{ memoryEditState.editContent.length }} 字
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-6 bg-white/5 rounded-lg">
          <p class="text-gray-500 text-sm mb-1">📭 暂无永久记忆</p>
          <p class="text-gray-600 text-xs">点击消息的 📌 按钮添加，或使用上方按钮手动创建</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 记忆管理样式 */
.memory-edit-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  width: 100%;
  color: #e0e0e0;
  font-size: 0.8rem;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s ease;
}

.memory-edit-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.8);
}

.memory-action-btn {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  transition: all 0.2s ease;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.memory-action-btn.refine {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.memory-action-btn.refine:hover {
  background: rgba(139, 92, 246, 0.4);
}

.memory-action-btn.edit {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.memory-action-btn.edit:hover {
  background: rgba(59, 130, 246, 0.4);
}

.memory-action-btn.save {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.memory-action-btn.save:hover {
  background: rgba(34, 197, 94, 0.4);
}

.memory-action-btn.cancel {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.memory-action-btn.cancel:hover {
  background: rgba(107, 114, 128, 0.4);
}

.memory-action-btn.delete {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.memory-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.4);
}

.memory-add-btn {
  width: 100%;
  padding: 10px;
  border: 2px dashed rgba(139, 92, 246, 0.4);
  border-radius: 10px;
  background: transparent;
  color: #a78bfa;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.memory-add-btn:hover {
  border-color: rgba(139, 92, 246, 0.8);
  background: rgba(139, 92, 246, 0.1);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
  display: inline-block;
}

.memory-content-preview {
  cursor: pointer;
  transition: all 0.2s ease;
}

.memory-content-preview:hover {
  color: #fff;
}

.memory-content-expanded {
  white-space: pre-wrap;
  word-break: break-word;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.memory-item {
  transition: all 0.2s ease;
}

.memory-item:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
