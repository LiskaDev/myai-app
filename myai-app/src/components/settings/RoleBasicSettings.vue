<script setup>
defineProps({
  currentRole: Object
});
</script>

<template>
  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-secondary flex items-center text-shadow">
      <span class="mr-2">🎭</span> {{ currentRole.name || '新角色' }}
      <span class="ml-auto text-xs font-normal text-gray-500 bg-secondary/20 px-2 py-0.5 rounded-full">基础设置</span>
    </h3>

    <div class="space-y-4">
      <!-- 角色名称 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">📛</span>
          <label class="text-sm text-gray-200 font-medium">角色名称</label>
        </div>
        <input v-model="currentRole.name" type="text" placeholder="例如：温柔姐姐、赛博黑客..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition text-shadow-light">
      </div>

      <!-- 角色性格 (原 System Prompt，改名更直观) -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">💫</span>
          <label class="text-sm text-gray-200 font-medium">角色性格与背景</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">
              定义角色的核心人格：TA 是谁？性格如何？有什么特点？
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.systemPrompt" rows="4" 
                  placeholder="例如：你是一个来自2077年的赛博黑客，性格酷炫，说话简短有力..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
      </div>

      <!-- 开场白 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">💬</span>
          <label class="text-sm text-gray-200 font-medium">开场白</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">
              角色说的第一句话，用于开启对话
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.firstMessage" rows="2" 
                  placeholder="例如：你好，旅行者。在这个数字世界里，没有什么是我无法破解的..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Basic Field Styling */
.basic-field {
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
}

.basic-field:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(139, 92, 246, 0.2);
}

.basic-field:focus-within {
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

/* v5.5: Tooltip Styles */
.tooltip-trigger {
  position: relative;
}

.tooltip-content {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  min-width: 220px;
  max-width: 280px;
  background: rgba(15, 15, 25, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 0.75rem;
  color: rgba(220, 220, 240, 0.9);
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: none;
}

.tooltip-trigger:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
</style>
