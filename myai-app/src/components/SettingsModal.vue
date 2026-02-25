<script setup>
import GlobalSettings from './settings/GlobalSettings.vue';
import RoleBasicSettings from './settings/RoleBasicSettings.vue';
import RoleAdvancedSettings from './settings/RoleAdvancedSettings.vue';
import CharacterDepthSettings from './settings/CharacterDepthSettings.vue';
import ParameterSettings from './settings/ParameterSettings.vue';
import MemoryManager from './settings/MemoryManager.vue';

defineProps({
  globalSettings: Object,
  currentRole: Object,
  availableVoices: Array,
  roleList: Array,
  importJson: String,
  memoryEditState: Object
});

defineEmits([
  'close',
  'save-data',
  'load-data',
  'export-data',
  'import-data',
  'show-import-modal',
  'clear-all-data',
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
  <!-- 设置面板 - 全屏覆盖式 -->
  <div class="settings-panel fixed inset-0 glass-strong bg-glass-dark z-50 overflow-y-auto">
    <div class="min-h-full">
      <!-- 设置头部 -->
      <header class="glass-strong bg-glass-dark px-4 py-3 flex items-center justify-between border-b border-white/10 sticky top-0 z-10">
        <h2 class="font-bold text-lg text-shadow">⚙️ 设置</h2>
        <button @click="$emit('close')" class="p-2 rounded-full hover:bg-white/10 transition">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </header>

      <div class="p-4 space-y-6">
        <!-- 全局设置 -->
        <GlobalSettings :globalSettings="globalSettings" />

        <!-- 基础设置 -->
        <RoleBasicSettings :currentRole="currentRole" />

        <!-- 高级设置 -->
        <RoleAdvancedSettings :currentRole="currentRole" :availableVoices="availableVoices" />

        <!-- 角色深度设置 -->
        <CharacterDepthSettings :currentRole="currentRole" />

        <!-- 参数调整 -->
        <ParameterSettings :currentRole="currentRole" />

        <!-- 记忆管理 -->
        <MemoryManager
          :currentRole="currentRole"
          :memoryEditState="memoryEditState"
          @add-manual-memory="$emit('add-manual-memory')"
          @remove-manual-memory="$emit('remove-manual-memory', $event)"
          @start-edit-memory="$emit('start-edit-memory', $event)"
          @save-edit-memory="$emit('save-edit-memory', $event)"
          @cancel-edit-memory="$emit('cancel-edit-memory')"
          @toggle-memory-expand="$emit('toggle-memory-expand', $event)"
          @refine-memory="$emit('refine-memory', $event)"
        />

        <!-- 数据管理 -->
        <section class="space-y-3">
          <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
            <span class="mr-2">💾</span> 数据备份与恢复
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <button @click="$emit('export-data')"
                    class="glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition flex flex-col items-center justify-center space-y-1">
              <span class="text-xl">📥</span>
              <span class="text-sm">导出备份</span>
            </button>
            <button @click="$emit('show-import-modal')"
                    class="glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition flex flex-col items-center justify-center space-y-1">
              <span class="text-xl">📤</span>
              <span class="text-sm">恢复数据</span>
            </button>
          </div>

          <div class="pt-4 border-t border-white/10 mt-4">
            <button @click="$emit('clear-all-data')"
                    class="w-full glass bg-red-900/30 text-red-400 rounded-xl px-4 py-3 text-center hover:bg-red-900/50 transition">
              🗑️ 清除所有数据
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
