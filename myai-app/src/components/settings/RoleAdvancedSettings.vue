<script setup>
import { ref } from 'vue';

const props = defineProps({
  currentRole: Object,
  availableVoices: Array
});

const fileInputRef = ref(null);
const isProcessing = ref(false);

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // 限制文件大小 5MB
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB');
    return;
  }

  isProcessing.value = true;
  try {
    const dataUrl = await compressImage(file, 256);
    props.currentRole.avatar = dataUrl;
  } catch (err) {
    alert('图片处理失败: ' + err.message);
  } finally {
    isProcessing.value = false;
    // 重置 input 以便重复选择同一文件
    event.target.value = '';
  }
}

function compressImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function clearAvatar() {
  props.currentRole.avatar = '';
}
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
