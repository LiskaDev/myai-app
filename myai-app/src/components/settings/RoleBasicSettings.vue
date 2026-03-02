<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { generateRoleFromDescription } from '../../composables/useRoleGenerator';
import { WRITING_STYLE_PRESETS } from '../../composables/presets';

const props = defineProps({
  currentRole: Object,
  globalSettings: Object
});

const emit = defineEmits(['show-toast', 'ai-role-generated']);

// AI 生成状态
const aiDescription = ref('');
const isGenerating = ref(false);
const abortControllerRef = ref(null);

async function handleGenerate() {
  if (!aiDescription.value.trim() || isGenerating.value) return;

  isGenerating.value = true;

  // 创建 AbortController 以支持取消
  const controller = new AbortController();
  abortControllerRef.value = controller;

  const result = await generateRoleFromDescription(aiDescription.value, {
    baseUrl: props.globalSettings?.baseUrl,
    apiKey: props.globalSettings?.apiKey,
  }, controller.signal);

  abortControllerRef.value = null;
  isGenerating.value = false;

  // 如果被取消了，静默返回
  if (controller.signal.aborted) return;

  if (result.success) {
    // 填充所有字段到当前角色
    const fields = [
      'name', 'systemPrompt', 'speakingStyle', 'appearance',
      'secret', 'worldLogic', 'relationship', 'firstMessage', 'styleGuide'
    ];
    for (const field of fields) {
      if (result.data[field]) {
        props.currentRole[field] = result.data[field];
      }
    }
    aiDescription.value = '';
    emit('show-toast', '✨ 角色生成成功！可自由修改各字段', 'info');
  } else {
    if (!result.error?.includes('AbortError') && !result.error?.includes('中止')) {
      emit('show-toast', result.error || '生成失败，请重试', 'error');
    }
  }
}

// 取消正在进行的生成
function cancelGeneration() {
  if (abortControllerRef.value) {
    abortControllerRef.value.abort();
    abortControllerRef.value = null;
    isGenerating.value = false;
  }
}

// 组件卸载时自动取消
onBeforeUnmount(() => {
  cancelGeneration();
});

// 暴露给父组件
defineExpose({ cancelGeneration });
</script>

<template>
  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-secondary flex items-center text-shadow">
      <span class="mr-2">🎭</span> {{ currentRole.name || '新角色' }}
      <span class="ml-auto text-xs font-normal text-gray-500 bg-secondary/20 px-2 py-0.5 rounded-full">基础设置</span>
    </h3>

    <div class="space-y-4">
      <!-- ✨ AI 一句话生成角色 -->
      <div class="ai-gen-card">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base">✨</span>
          <label class="text-sm font-medium ai-gen-label">AI 一键生成</label>
          <span class="ml-auto text-xs text-gray-500">描述你想要的角色，AI 帮你填好一切</span>
        </div>
        <div class="flex gap-2">
          <input 
            v-model="aiDescription"
            type="text"
            :disabled="isGenerating"
            placeholder="例如：一个傲娇的赛博朋克黑客少女"
            class="flex-1 glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-amber-500/50 transition text-shadow-light disabled:opacity-50"
            @keydown.enter.prevent="handleGenerate"
          >
          <button
            @click="handleGenerate"
            :disabled="isGenerating || !aiDescription.trim()"
            class="ai-gen-btn"
          >
            <span v-if="isGenerating" class="ai-gen-spinner"></span>
            <span v-else>✨ 生成</span>
          </button>
        </div>
      </div>

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

      <!-- 🎨 写作风格模板 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">🎨</span>
          <label class="text-sm text-gray-200 font-medium">写作风格</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">
              选择一种写作风格模板，AI 会自动调整回复的节奏、语言和氛围
            </div>
          </div>
        </div>
        <div class="writing-style-grid">
          <button class="writing-style-option"
                  :class="{ active: !currentRole.writingStyle }"
                  @click="currentRole.writingStyle = ''">
            <span class="ws-icon">✨</span>
            <span class="ws-label">默认</span>
          </button>
          <button v-for="preset in WRITING_STYLE_PRESETS" :key="preset.id"
                  class="writing-style-option"
                  :class="{ active: currentRole.writingStyle === preset.id }"
                  @click="currentRole.writingStyle = preset.id"
                  :title="preset.description">
            <span class="ws-icon">{{ preset.icon }}</span>
            <span class="ws-label">{{ preset.label }}</span>
          </button>
        </div>
        <p v-if="currentRole.writingStyle" class="text-xs text-gray-500 mt-1.5" style="padding-left: 2px;">
          {{ WRITING_STYLE_PRESETS.find(s => s.id === currentRole.writingStyle)?.description }}
        </p>
      </div>

      <!-- 💡 新角色引导提示 -->
      <div v-if="!currentRole.systemPrompt?.trim()" class="text-center py-2">
        <p class="text-xs text-gray-500 italic">💡 不知道怎么填？试试最上方的 <span class="text-amber-400">✨ AI 一键生成</span></p>
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

/* ✨ AI Generation Card */
.ai-gen-card {
  padding: 14px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(168, 85, 247, 0.06));
  border-radius: 14px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.ai-gen-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 200%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.04), transparent);
  animation: ai-shimmer 3s ease-in-out infinite;
}

@keyframes ai-shimmer {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(50%); }
}

.ai-gen-card:hover {
  border-color: rgba(245, 158, 11, 0.35);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.08);
}

.ai-gen-card:focus-within {
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
}

.ai-gen-label {
  background: linear-gradient(135deg, #f59e0b, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.ai-gen-btn {
  padding: 8px 18px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.8), rgba(168, 85, 247, 0.8));
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-gen-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
}

.ai-gen-btn:active:not(:disabled) {
  transform: translateY(0);
}

.ai-gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-gen-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ai-spin 0.7s linear infinite;
}

@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

/* 🎨 Writing Style Selector */
.writing-style-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.writing-style-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(200, 200, 220, 0.8);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.writing-style-option:hover {
  border-color: rgba(139, 92, 246, 0.3);
  background: rgba(139, 92, 246, 0.08);
  color: rgba(220, 220, 240, 1);
}

.writing-style-option.active {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.15);
  color: white;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.15);
}

.ws-icon {
  font-size: 0.9rem;
  line-height: 1;
}

.ws-label {
  font-weight: 500;
}
</style>
