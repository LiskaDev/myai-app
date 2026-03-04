<script setup>
import { ref } from 'vue';
import AvatarCropper from '../AvatarCropper.vue';

const props = defineProps({
  currentRole: Object,
  availableVoices: Array
});

const emit = defineEmits(['show-toast']);

const fileInputRef = ref(null);
const isProcessing = ref(false);
const cropperSrc = ref(null);  // 有值时显示裁剪器

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    emit('show-toast', '图片不能超过 10MB', 'error');
    return;
  }

  isProcessing.value = true;
  try {
    // 读取文件后弹出裁剪器
    cropperSrc.value = await readFile(file);
  } catch (err) {
    emit('show-toast', '图片读取失败: ' + err.message, 'error');
  } finally {
    isProcessing.value = false;
    event.target.value = '';
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function onCropConfirm(dataUrl) {
  props.currentRole.avatar = dataUrl;
  cropperSrc.value = null;
  emit('show-toast', '头像已更新 ✓', 'success');
}

function onCropCancel() {
  cropperSrc.value = null;
}

function clearAvatar() {
  props.currentRole.avatar = '';
}
</script>


<template>
  <!-- 头像裁剪器弹层 -->
  <AvatarCropper
    v-if="cropperSrc"
    :image-src="cropperSrc"
    @confirm="onCropConfirm"
    @cancel="onCropCancel"
  />

  <section class="w-full glass bg-glass-message rounded-xl overflow-hidden">
    <details class="advanced-panel min-w-0">
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
        <!-- 头像选择 -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">🖼️ AI 头像</label>
          <div class="flex items-center gap-4">
            <!-- 头像预览/点击区域 -->
            <div class="avatar-picker" @click="triggerFilePicker" :class="{ 'processing': isProcessing }">
              <img v-if="currentRole.avatar" :src="currentRole.avatar" class="w-full h-full object-cover rounded-full" />
              <div v-else class="avatar-picker-empty">
                <svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span class="text-xs text-gray-500 mt-1">点击选择</span>
              </div>
              <!-- 加载动画 -->
              <div v-if="isProcessing" class="avatar-picker-loading">
                <div class="spinner"></div>
              </div>
            </div>
            <!-- 右侧操作 -->
            <div class="flex-1 space-y-2">
              <input v-model="currentRole.avatar" type="text" placeholder="或粘贴图片 URL..."
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
              <button v-if="currentRole.avatar" @click="clearAvatar" 
                      class="text-xs text-red-400 hover:text-red-300 transition">
                清除头像
              </button>
            </div>
          </div>
          <!-- 隐藏的 file input -->
          <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelect">
        </div>

        <!-- 背景 URL -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">🌆 背景图片 URL</label>
          <input v-model="currentRole.background" type="text" placeholder="https://example.com/background.jpg"
                 class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
        </div>

        <!-- 写作风格 / 对话规则 -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">✍️ 写作风格 / 对话规则</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">
                控制 AI 的写作风格和行为规则。例如：语气温柔、不打破第四面墙、不谈AI技术等
              </div>
            </div>
          </div>
          <textarea v-model="currentRole.styleGuide" rows="2" 
                    placeholder="例如：语气温柔关怀 / 不打破第四面墙 / 不谈现实AI技术..."
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
        </div>

        <!-- 剧情摘要 -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">📜 剧情摘要</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">
                手动摘要会优先于自动摘要。留空则使用系统自动生成的摘要
              </div>
            </div>
          </div>
          <textarea v-model="currentRole.storySummary" rows="2" 
                    :placeholder="currentRole.autoSummary ? '已有自动摘要，手动输入将覆盖自动摘要...' : '例如：昨天你们一起去了咖啡厅，TA 不小心说漏了自己的秘密...'"
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
          <p v-if="currentRole.autoSummary && !currentRole.storySummary" class="text-xs text-gray-500 mt-1 line-clamp-2">
            📝 自动摘要：{{ currentRole.autoSummary.substring(0, 100) }}{{ currentRole.autoSummary.length > 100 ? '...' : '' }}
          </p>
        </div>

        <!-- Temperature (创造力) -->
        <div>
          <div class="flex justify-between text-sm mb-1">
            <label class="text-gray-400">🎛️ 创造力（随机性）</label>
            <span class="text-primary font-mono">{{ (currentRole.temperature || 1.0).toFixed(1) }}</span>
          </div>
          <input v-model.number="currentRole.temperature" type="range" min="0" max="2" step="0.1"
                 class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>精确 0.0</span>
            <span>平衡 1.0</span>
            <span>创意 2.0</span>
          </div>
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
.advanced-panel {
  width: 100%;
}

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

/* Avatar Picker */
.avatar-picker {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s ease;
  background: rgba(255, 255, 255, 0.04);
}

.avatar-picker:hover {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.08);
}

.avatar-picker:active {
  transform: scale(0.95);
}

.avatar-picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.avatar-picker-loading {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
