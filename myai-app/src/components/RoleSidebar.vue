<script setup>
defineProps({
  roleList: Array,
  currentRoleId: [String, Number],
  showSidebar: Boolean
});

defineEmits([
  'switch-role',
  'create-role',
  'delete-role',
  'close',
  'avatar-error'
]);
</script>

<template>
  <!-- 侧边栏（角色列表） -->
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

      <!-- 角色列表 -->
      <div class="space-y-3">
        <div v-for="role in roleList" :key="role.id" @click="$emit('switch-role', role.id)"
             class="role-item p-3 rounded-lg cursor-pointer border border-white/10 relative"
             :class="{ 'active': role.id === currentRoleId }">
          <div class="flex items-center space-x-3">
            <div v-if="role.avatar" class="avatar">
              <img :src="role.avatar" alt="Role Avatar" class="w-full h-full rounded-full object-cover" @error="$emit('avatar-error', 'ai', role.id)">
            </div>
            <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sm truncate">{{ role.name }}</h3>
              <p class="text-xs text-gray-400 truncate">{{ role.chatHistory?.length || 0 }} 条对话</p>
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

      <!-- 添加新角色按钮 -->
      <div class="mt-4">
        <button @click="$emit('create-role')" class="w-full glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition border border-dashed border-white/20">
          ➕ 创建新角色
        </button>
      </div>
    </div>
  </div>

  <!-- 遮罩层 -->
  <div v-if="showSidebar" @click="$emit('close')" class="fixed inset-0 bg-black/50 z-20"></div>
</template>
