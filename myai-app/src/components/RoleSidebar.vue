<script setup>
import { ref, computed } from 'vue';
import { extractExpression } from '../utils/textParser';

const props = defineProps({
  roleList: Array,
  currentRoleId: [String, Number],
  showSidebar: Boolean,
  groupChats: { type: Array, default: () => [] },
  currentGroupId: { type: String, default: null },
  isGroupMode: { type: Boolean, default: false },
});

const EXPR_EMOJI = { joy: '😊', sadness: '😢', anger: '😠', surprise: '😲', fear: '😰', disgust: '😒', neutral: '😐', love: '🥰' };

// 🔍 侧边栏搜索
const sidebarSearch = ref('');
const filteredRoles = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  if (!q) return props.roleList;
  return props.roleList.filter(r => r.name.toLowerCase().includes(q));
});
const filteredGroups = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  if (!q) return props.groupChats;
  return props.groupChats.filter(g => g.name.toLowerCase().includes(q));
});

function getRoleMood(role) {
  const hist = role.chatHistory || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].role === 'assistant') {
      const { expression } = extractExpression(hist[i].rawContent || hist[i].content || '');
      return EXPR_EMOJI[expression] || '😊';
    }
  }
  return '💤';
}

defineEmits([
  'switch-role',
  'create-role',
  'ai-create-role',
  'delete-role',
  'close',
  'avatar-error',
  'switch-group',
  'delete-group',
  'create-group',
]);
</script>

<template>
  <!-- 侧边栏（角色列表 + 群聊） -->
  <div class="sidebar fixed inset-y-0 left-0 w-80 glass-strong bg-glass-dark z-30 border-r border-white/10 overflow-y-auto" :class="{ 'hidden': !showSidebar }">
    <div class="p-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg text-shadow">🎭 角色列表</h2>
        <button @click="$emit('close')" class="p-2 rounded-full hover:bg-white/10 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- 🔍 搜索框 -->
      <div class="mb-3">
        <input v-model="sidebarSearch" type="text" placeholder="🔍 搜索角色或群聊..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 text-sm outline-none border border-white/10 focus:border-primary transition" />
      </div>

      <!-- 角色列表 -->
      <div class="space-y-3">
        <div v-for="role in filteredRoles" :key="role.id" @click="$emit('switch-role', role.id)"
             class="role-item p-3 rounded-lg cursor-pointer border border-white/10 relative"
             :class="{ 'active': !isGroupMode && role.id === currentRoleId }">
          <div class="flex items-center space-x-3">
            <div class="relative flex-shrink-0">
              <div v-if="role.avatar" class="avatar">
                <img :src="role.avatar" alt="Role Avatar" class="w-full h-full rounded-full object-cover" @error="$emit('avatar-error', 'ai', role.id)">
              </div>
              <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
              <span class="mood-badge">{{ getRoleMood(role) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sm truncate">{{ role.name }}</h3>
              <p class="text-xs text-gray-400 truncate italic">
                {{ role.chatHistory?.length
                  ? (role.chatHistory[role.chatHistory.length - 1]?.content || '').replace(/<[^>]+>/g, '').slice(0, 25) + '…'
                  : (role.firstMessage || '点击开始对话').replace(/<[^>]+>/g, '').slice(0, 28)
                }}
              </p>
            </div>
            <!-- 删除按钮 -->
            <button @click.stop="$emit('delete-role', role.id)" class="delete-btn p-1 rounded-full hover:bg-red-500/20 transition" title="删除角色">
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <button @click="$emit('create-role')" class="w-full glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition border border-dashed border-white/20">
          ➕ 创建新角色
        </button>
        <button @click="$emit('ai-create-role')" class="w-full text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition border border-dashed border-white/20" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(168, 85, 247, 0.06));">
          ✨ AI 生成角色
        </button>
      </div>

      <!-- 群聊区域分隔 -->
      <div class="mt-6 mb-3 flex items-center space-x-2">
        <div class="flex-1 h-px bg-white/10"></div>
        <span class="text-xs text-gray-400 whitespace-nowrap">👥 群聊</span>
        <div class="flex-1 h-px bg-white/10"></div>
      </div>

      <!-- 群聊列表 -->
      <div class="space-y-3">
        <div v-for="group in filteredGroups" :key="group.id" @click="$emit('switch-group', group.id)"
             class="role-item p-3 rounded-lg cursor-pointer border border-white/10 relative"
             :class="{ 'active': isGroupMode && group.id === currentGroupId }">
          <div class="flex items-center space-x-3">
            <div class="avatar-placeholder avatar-ai text-white" style="background: linear-gradient(135deg, #6366f1, #ec4899);">👥</div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sm truncate">{{ group.name }}</h3>
              <p class="text-xs text-gray-400 truncate">{{ group.participantIds.length }} 位角色 · {{ group.chatHistory?.length || 0 }} 条消息</p>
            </div>
            <!-- 删除按钮 -->
            <button @click.stop="$emit('delete-group', group.id)" class="delete-btn p-1 rounded-full hover:bg-red-500/20 transition" title="删除群聊">
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="groupChats.length === 0" class="text-center text-xs text-gray-500 py-2">
          还没有群聊，点击下方创建
        </div>
      </div>

      <!-- 创建群聊按钮 -->
      <div class="mt-4">
        <button @click="$emit('create-group')" class="w-full text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition border border-dashed border-white/20" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.06));">
          👥 创建群聊
        </button>
      </div>
    </div>
  </div>

  <!-- 遮罩层 -->
  <div v-if="showSidebar" @click="$emit('close')" class="fixed inset-0 bg-black/50 z-20"></div>
</template>
