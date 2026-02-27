<script setup>
import { ref, computed } from 'vue';
import GlobalSettings from './settings/GlobalSettings.vue';
import RoleBasicSettings from './settings/RoleBasicSettings.vue';
import RoleAdvancedSettings from './settings/RoleAdvancedSettings.vue';
import CharacterDepthSettings from './settings/CharacterDepthSettings.vue';
import MemoryManager from './settings/MemoryManager.vue';
import UserPersonaSettings from './settings/UserPersonaSettings.vue';

const props = defineProps({
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

const emit = defineEmits([
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
  'refine-memory',
  'show-toast'
]);

// Tab 系统
const TABS = props.isGroupMode
  ? [
      { id: 'general', icon: '⚙️', label: '通用' },
      { id: 'group', icon: '👥', label: '群聊' },
      { id: 'timeline', icon: '📅', label: '时间线' },
      { id: 'persona', icon: '👤', label: '画像' },
      { id: 'data', icon: '💾', label: '数据' },
    ]
  : [
      { id: 'role', icon: '🎭', label: '角色' },
      { id: 'memory', icon: '🧠', label: '记忆' },
      { id: 'timeline', icon: '📅', label: '时间线' },
      { id: 'persona', icon: '👤', label: '画像' },
      { id: 'general', icon: '⚙️', label: '通用' },
      { id: 'data', icon: '💾', label: '数据' },
    ];

const activeTab = ref(props.isGroupMode ? 'general' : 'role');

// 时间线数据源：群聊用 group.timeline，单聊用 role.timeline
const timelineSource = computed(() => {
  if (props.isGroupMode) return props.currentGroup?.timeline || [];
  return props.currentRole?.timeline || [];
});

function clearTimelineData() {
  if (props.isGroupMode && props.currentGroup) {
    props.currentGroup.timeline = [];
  } else if (props.currentRole) {
    props.currentRole.timeline = [];
  }
}

function removeTimelineItem(idx) {
  if (props.isGroupMode && props.currentGroup?.timeline) {
    props.currentGroup.timeline.splice(idx, 1);
  } else if (props.currentRole?.timeline) {
    props.currentRole.timeline.splice(idx, 1);
  }
}
</script>

<template>
  <div class="settings-panel fixed inset-0 glass-strong bg-glass-dark z-50 flex flex-col">
    <!-- 设置头部 -->
    <header class="glass-strong bg-glass-dark px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0">
      <h2 class="font-bold text-lg text-shadow">⚙️ 设置</h2>
      <button @click="$emit('close')" class="p-2 rounded-full hover:bg-white/10 transition">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </header>

    <!-- Tab 栏 -->
    <nav class="settings-tab-bar flex-shrink-0">
      <button v-for="tab in TABS" :key="tab.id"
              @click="activeTab = tab.id"
              class="settings-tab" :class="{ active: activeTab === tab.id }">
        <span class="settings-tab-icon">{{ tab.icon }}</span>
        <span class="settings-tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- Tab 内容 -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">

      <!-- ========== 角色 Tab ========== -->
      <template v-if="activeTab === 'role' && !isGroupMode">
        <RoleBasicSettings :currentRole="currentRole" :globalSettings="globalSettings" @show-toast="(msg, type) => emit('show-toast', msg, type)" />
        <RoleAdvancedSettings :currentRole="currentRole" :availableVoices="availableVoices" />
        <CharacterDepthSettings :currentRole="currentRole" />
      </template>

      <!-- ========== 记忆 Tab ========== -->
      <template v-if="activeTab === 'memory' && !isGroupMode">
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

      <!-- ========== 通用 Tab ========== -->
      <template v-if="activeTab === 'general'">
        <GlobalSettings :globalSettings="globalSettings" />
      </template>

      <!-- ========== 用户画像 Tab ========== -->
      <template v-if="activeTab === 'persona'">
        <UserPersonaSettings />
      </template>

      <!-- ========== 时间线 Tab ========== -->
      <template v-if="activeTab === 'timeline'">
        <section class="space-y-4">
          <div class="flex items-center justify-between px-1">
            <h3 class="font-semibold text-gray-300 flex items-center text-shadow">
              <span class="mr-2">📅</span> 剧情时间线
              <span v-if="timelineSource?.length" class="ml-2 text-xs font-normal text-gray-500">
                {{ timelineSource.length }} 条事件
              </span>
            </h3>
            <button v-if="timelineSource?.length"
                    @click="clearTimelineData(); emit('show-toast', '时间线已清空', 'info')"
                    class="text-xs text-red-400/60 hover:text-red-400 transition">
              清空全部
            </button>
          </div>

          <p class="text-xs text-gray-500 px-1 leading-relaxed">
            每 15 轮对话后，AI 会自动提取关键剧情事件，帮助角色保持故事连贯性。
          </p>

          <!-- 时间线列表 -->
          <div v-if="timelineSource?.length" class="space-y-2">
            <div v-for="(event, idx) in timelineSource" :key="idx"
                 class="glass bg-glass-message rounded-xl px-4 py-3 flex items-start gap-3 group">
              <span class="flex-shrink-0 mt-0.5 text-sm">
                {{ event.importance === 'high' ? '⚡' : event.importance === 'medium' ? '📌' : '·' }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-200 leading-relaxed">{{ event.event }}</div>
                <div class="text-xs text-gray-600 mt-1" v-if="event.timestamp">
                  {{ new Date(event.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                </div>
              </div>
              <button @click="removeTimelineItem(idx)" class="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-red-500/20 transition flex-shrink-0" title="删除">
                <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="text-center py-8">
            <div class="text-3xl mb-2">📅</div>
            <div class="text-sm text-gray-500">还没有时间线事件</div>
            <div class="text-xs text-gray-600 mt-1">多聊几轮后 AI 会自动提取关键剧情</div>
          </div>
        </section>
      </template>

      <!-- ========== 群聊 Tab ========== -->
      <template v-if="activeTab === 'group' && isGroupMode && currentGroup">
        <section class="space-y-4">
          <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
            <span class="mr-2">👥</span> 群聊信息
          </h3>
          <div class="glass bg-glass-message rounded-2xl p-4 space-y-3">
            <div>
              <label class="block text-sm text-gray-400 mb-1">群聊名称</label>
              <div class="text-gray-100 text-base font-medium">{{ currentGroup.name }}</div>
            </div>
            <div v-if="currentGroup.description">
              <label class="block text-sm text-gray-400 mb-1">群聊描述</label>
              <div class="text-gray-300 text-sm leading-relaxed">{{ currentGroup.description }}</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm text-gray-400 mb-1">🧠 模型</label>
                <div class="text-gray-200 text-sm">{{ currentGroup.model || '跟随全局' }}</div>
              </div>
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

        <!-- 群聊角色人设预览 -->
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

      <!-- ========== 数据 Tab ========== -->
      <template v-if="activeTab === 'data'">
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
      </template>
    </div>
  </div>
</template>

<style scoped>
.settings-tab-bar {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  padding: 0 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.settings-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 8px 8px;
  border: none;
  background: none;
  color: rgba(160, 160, 180, 0.6);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  white-space: nowrap;
  min-width: 56px;
}
.settings-tab::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.2s ease;
}
.settings-tab.active {
  color: rgba(220, 220, 240, 0.95);
}
.settings-tab.active::after {
  background: rgba(99, 102, 241, 0.8);
}
.settings-tab:hover:not(.active) {
  color: rgba(200, 200, 220, 0.8);
}
.settings-tab-icon {
  font-size: 1.1rem;
}
.settings-tab-label {
  font-size: 0.65rem;
  font-weight: 500;
}
</style>
