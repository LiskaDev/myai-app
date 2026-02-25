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
  memoryEditState: Object,
  isGroupMode: Boolean,
  currentGroup: Object,
  participants: Array,
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

        <!-- ========== 群聊模式：群聊信息 ========== -->
        <template v-if="isGroupMode && currentGroup">
          <section class="space-y-4">
            <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
              <span class="mr-2">👥</span> 群聊信息
            </h3>
            <div class="glass bg-glass-message rounded-2xl p-4 space-y-3">
              <div>
                <label class="block text-sm text-gray-400 mb-1">群聊名称</label>
                <div class="text-gray-100 text-base font-medium">{{ currentGroup.name }}</div>
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-2">参与角色（{{ participants?.length || 0 }} 人）</label>
                <div class="flex flex-wrap gap-2">
                  <div v-for="p in participants" :key="p.id"
                       class="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5">
                    <div v-if="p.avatar" class="w-6 h-6 rounded-full overflow-hidden">
                      <img :src="p.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-xs">🎭</div>
                    <span class="text-sm text-gray-200">{{ p.name }}</span>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-500 mt-2">💡 点击右上角 ✏️ 编辑按钮可修改群名和成员</p>
            </div>
          </section>

          <!-- 群聊中每个角色的人设预览 -->
          <section class="space-y-3">
            <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
              <span class="mr-2">🎭</span> 角色人设预览
            </h3>
            <div v-for="p in participants" :key="p.id"
                 class="glass bg-glass-message rounded-2xl p-4 space-y-2">
              <div class="flex items-center space-x-2">
                <div v-if="p.avatar" class="w-8 h-8 rounded-full overflow-hidden">
                  <img :src="p.avatar" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-sm">🎭</div>
                <span class="font-medium text-gray-100">{{ p.name }}</span>
              </div>
              <div class="text-sm text-gray-400 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                {{ p.systemPrompt || '（暂无人设描述）' }}
              </div>
            </div>
          </section>
        </template>

        <!-- ========== 单聊模式：角色设置 ========== -->
        <template v-else>
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
        </template>

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
