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
const cropperSrc = ref(null);

function triggerFilePicker() { fileInputRef.value?.click(); }

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { emit('show-toast', '图片不能超过 10MB', 'error'); return; }
  isProcessing.value = true;
  try {
    cropperSrc.value = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  } catch (err) {
    emit('show-toast', '图片读取失败: ' + err.message, 'error');
  } finally {
    isProcessing.value = false;
    event.target.value = '';
  }
}

function onCropConfirm(dataUrl) { props.currentRole.avatar = dataUrl; cropperSrc.value = null; emit('show-toast', '头像已更新 ✓', 'success'); }
function onCropCancel() { cropperSrc.value = null; }
function clearAvatar() { props.currentRole.avatar = ''; }

// 背景图片本地选择
const bgFileInputRef = ref(null);
function triggerBgFilePicker() { bgFileInputRef.value?.click(); }
async function handleBgFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { emit('show-toast', '背景图片不能超过 20MB', 'error'); return; }
  try {
    props.currentRole.background = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
    emit('show-toast', '背景图片已更新 ✓', 'success');
  } catch (err) {
    emit('show-toast', '图片读取失败: ' + err.message, 'error');
  } finally {
    event.target.value = '';
  }
}
</script>

<template>
  <AvatarCropper v-if="cropperSrc" :image-src="cropperSrc" @confirm="onCropConfirm" @cancel="onCropCancel" />

  <section class="w-full glass bg-glass-message rounded-xl overflow-hidden">
    <details class="advanced-panel min-w-0">
      <summary class="p-4 cursor-pointer select-none flex items-center justify-between hover:bg-white/5 transition">
        <div class="flex items-center gap-2">
          <span class="text-base">🔧</span>
          <h3 class="font-semibold text-gray-400 text-shadow">高级设置</h3>
          <span class="text-xs text-gray-500">背景、对话规则、参数调节...</span>
        </div>
        <svg class="w-5 h-5 text-gray-500 transform transition-transform duration-200 details-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </summary>

      <div class="p-4 pt-0 space-y-5 border-t border-white/5">

        <!-- 🌆 背景图片 -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">🌆 背景图片</label>
          <div class="flex gap-2">
            <input v-model="currentRole.background" type="text" placeholder="https://example.com/background.jpg"
                   class="flex-1 glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
            <button @click="triggerBgFilePicker" class="bg-pick-btn" title="从本地选择图片">
              📁
            </button>
          </div>
          <p class="text-xs text-gray-600 mt-1">填入图片链接，或点击 📁 从本地选择图片作为聊天背景</p>
          <input ref="bgFileInputRef" type="file" accept="image/*" class="hidden" @change="handleBgFileSelect">
        </div>

        <!-- ✍️ 写作风格 / 对话规则 -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">✍️ 写作风格 / 对话规则</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">控制 AI 的写作风格和行为规则。例如：语气温柔、不打破第四面墙、不谈AI技术等</div>
            </div>
          </div>
          <textarea v-model="currentRole.styleGuide" rows="2"
                    placeholder="例如：语气温柔关怀 / 不打破第四面墙 / 不谈现实AI技术..."
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
        </div>

        <!-- 📜 剧情摘要 -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <label class="text-sm text-gray-400">📜 剧情摘要</label>
            <div class="tooltip-trigger relative group ml-auto">
              <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
              <div class="tooltip-content">手动摘要会优先于自动摘要。留空则使用系统自动生成的摘要</div>
            </div>
          </div>
          <textarea v-model="currentRole.storySummary" rows="2"
                    :placeholder="currentRole.autoSummary ? '已有自动摘要，手动输入将覆盖自动摘要...' : '例如：昨天你们一起去了咖啡厅，TA 不小心说漏了自己的秘密...'"
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition resize-none text-shadow-light text-sm"></textarea>
          <p v-if="currentRole.autoSummary && !currentRole.storySummary" class="text-xs text-gray-500 mt-1 line-clamp-2">
            📝 自动摘要：{{ currentRole.autoSummary.substring(0, 100) }}{{ currentRole.autoSummary.length > 100 ? '...' : '' }}
          </p>
        </div>

        <!-- 参数调节 -->
        <div class="space-y-4 pt-2 border-t border-white/5">
          <p class="text-xs text-gray-500">以下参数调节 AI 的回复特性，不熟悉可保持默认</p>

          <!-- 创意程度（Temperature） -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <div>
                <label class="text-gray-300">🎲 创意程度</label>
                <p class="text-xs text-gray-500 mt-0.5">越高 AI 回复越有创意，越低越稳定保守</p>
              </div>
              <span class="text-primary font-mono self-start">{{ (currentRole.temperature ?? 1.0).toFixed(1) }}</span>
            </div>
            <input v-model.number="currentRole.temperature" type="range" min="0" max="2" step="0.1"
                   class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
            <div class="flex justify-between text-xs text-gray-600 mt-1">
              <span>0 · 保守稳定</span><span>1 · 均衡</span><span>2 · 天马行空</span>
            </div>
          </div>

          <!-- 词汇多样性（Top P） -->
          <div v-if="currentRole.topP !== undefined">
            <div class="flex justify-between text-sm mb-1">
              <div>
                <label class="text-gray-300">🌈 词汇多样性</label>
                <p class="text-xs text-gray-500 mt-0.5">控制 AI 每次选词的范围，越高用词越丰富多变</p>
              </div>
              <span class="text-primary font-mono self-start">{{ (currentRole.topP ?? 1.0).toFixed(2) }}</span>
            </div>
            <input v-model.number="currentRole.topP" type="range" min="0" max="1" step="0.05"
                   class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
            <div class="flex justify-between text-xs text-gray-600 mt-1">
              <span>0 · 单一保守</span><span>1 · 丰富多样</span>
            </div>
          </div>

          <!-- 单次最大字数（Max Tokens） -->
          <div v-if="currentRole.maxTokens !== undefined">
            <div class="flex justify-between text-sm mb-1">
              <div>
                <label class="text-gray-300">📏 单次最大字数</label>
                <p class="text-xs text-gray-500 mt-0.5">限制 AI 每次回复的最大长度，0 表示不限制</p>
              </div>
              <span class="text-primary font-mono self-start">{{ currentRole.maxTokens || '不限' }}</span>
            </div>
            <input v-model.number="currentRole.maxTokens" type="range" min="0" max="4096" step="128"
                   class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
            <div class="flex justify-between text-xs text-gray-600 mt-1">
              <span>0 · 不限</span><span>4096 · 最大</span>
            </div>
          </div>

          <!-- 重复惩罚（Frequency Penalty） -->
          <div v-if="currentRole.frequencyPenalty !== undefined">
            <div class="flex justify-between text-sm mb-1">
              <div>
                <label class="text-gray-300">🔁 重复惩罚</label>
                <p class="text-xs text-gray-500 mt-0.5">越高 AI 越不会重复使用同样的词句</p>
              </div>
              <span class="text-primary font-mono self-start">{{ (currentRole.frequencyPenalty ?? 0).toFixed(1) }}</span>
            </div>
            <input v-model.number="currentRole.frequencyPenalty" type="range" min="0" max="2" step="0.1"
                   class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
            <div class="flex justify-between text-xs text-gray-600 mt-1">
              <span>0 · 允许重复</span><span>2 · 严格避免</span>
            </div>
          </div>
        </div>

        <!-- 🔊 语音声线 -->
        <div class="pt-2 border-t border-white/5">
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
.advanced-panel { width: 100%; }
.advanced-panel summary { list-style: none; }
.advanced-panel summary::-webkit-details-marker { display: none; }
.advanced-panel[open] .details-arrow { transform: rotate(180deg); }
.advanced-panel[open] summary { border-bottom: 1px solid rgba(255,255,255,0.05); }

.tooltip-trigger { position: relative; }
.tooltip-content {
  position: absolute; right: 0; top: 100%; margin-top: 6px;
  padding: 8px 12px; min-width: 220px; max-width: 280px;
  background: rgba(15,15,25,0.95); backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
  font-size: 0.75rem; color: rgba(220,220,240,0.9); line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 100;
  opacity: 0; visibility: hidden; transform: translateY(-4px);
  transition: all 0.2s ease; pointer-events: none;
}
.tooltip-trigger:hover .tooltip-content { opacity: 1; visibility: visible; transform: translateY(0); }

.bg-pick-btn {
  flex-shrink: 0;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.bg-pick-btn:hover {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.25);
}
[data-theme="light"] .bg-pick-btn {
  background: var(--brush);
  border-color: var(--border);
}
[data-theme="light"] .bg-pick-btn:hover {
  background: var(--paper-warm);
  border-color: var(--border-accent);
}
</style>