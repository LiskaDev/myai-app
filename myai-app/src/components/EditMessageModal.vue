<script setup>
defineProps({
  editModal: Object
});

defineEmits(['save', 'cancel']);
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('cancel')"></div>
    <div class="relative glass bg-glass-dark rounded-2xl max-w-lg w-full p-6 border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
      <header class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-white text-shadow">✏️ 编辑消息</h3>
        <button @click="$emit('cancel')" class="text-gray-400 hover:text-white transition">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </header>
      <div class="flex-1 overflow-y-auto mb-4">
        <p class="text-sm text-gray-400 mb-2">修改此消息内容：</p>
        <textarea v-model="editModal.originalContent"
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg p-3 outline-none border border-white/10 focus:border-primary transition resize-none"
                  placeholder="输入消息内容..." style="min-height: 150px;"></textarea>
      </div>
      <div class="flex justify-end space-x-3">
        <button @click="$emit('cancel')" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
        <button @click="$emit('save')" class="px-4 py-2 rounded-lg bg-primary hover:bg-indigo-600 text-white transition shadow-lg">保存修改</button>
      </div>
    </div>
  </div>
</template>
