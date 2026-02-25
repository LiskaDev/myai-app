<script setup>
defineProps({
  currentRole: Object,
  availableVoices: Array
});
</script>

<template>
  <section class="glass bg-glass-message rounded-xl overflow-hidden">
    <details class="advanced-panel">
      <summary class="p-4 cursor-pointer select-none flex items-center justify-between hover:bg-white/5 transition">
        <div class="flex items-center gap-2">
          <span class="text-base">🔧</span>
          <h3 class="font-semibold text-gray-400 text-shadow">高级设置</h3>
          <span class="text-xs text-gray-500">头像、背景、对话规则...</span>
        </div>
        <svg class="w-5 h-5 text-gray-500 transform transition-transform duration-200 details-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </summary>
      
      <div class="p-4 pt-0 space-y-4 border-t border-white/5">
        <!-- 头像 URL -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">🖼️ AI 头像 URL</label>
          <input v-model="currentRole.avatar" type="text" placeholder="https://example.com/avatar.jpg"
                 class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
        </div>

        <!-- 背景 URL -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">🌆 背景图片 URL</label>
          <input v-model="currentRole.background" type="text" placeholder="https://example.com/background.jpg"
                 class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
        </div>

        <!-- 对话规则 (原 Style Guide) -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">🚫 对话规则 / 禁区</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">
                设置角色不能聊的话题或必须遵守的规则
              </div>
            </div>
          </div>
          <textarea v-model="currentRole.styleGuide" rows="2" 
                    placeholder="例如：不能打破第四面墙，不能谈论现实世界的AI技术..."
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
        </div>

        <!-- 剧情摘要 -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">📜 剧情摘要</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">
                记录重要剧情发展，AI 会始终记住这些内容
              </div>
            </div>
          </div>
          <textarea v-model="currentRole.storySummary" rows="2" 
                    placeholder="例如：昨天你们一起去了咖啡厅，TA 不小心说漏了自己的秘密..."
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
        </div>

        <!-- TTS 声音选择 -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">🔊 语音声线</label>
          <select v-model="currentRole.ttsVoice"
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-sm">
            <option value="">使用系统默认声音</option>
            <option v-for="voice in availableVoices" :key="voice.name" :value="voice.name">
              {{ voice.name }} ({{ voice.lang }})
            </option>
          </select>
        </div>
      </div>
    </details>
  </section>
</template>

<style scoped>
/* v5.5: Collapsible Panel Styles */
.advanced-panel summary {
  list-style: none;
}

.advanced-panel summary::-webkit-details-marker {
  display: none;
}

.advanced-panel[open] .details-arrow {
  transform: rotate(180deg);
}

.advanced-panel[open] summary {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
