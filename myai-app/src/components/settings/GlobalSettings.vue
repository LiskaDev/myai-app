<script setup>
import { ref, computed } from 'vue';
import { useAppState } from '../../composables/useAppState';

// 模型预设列表（按平台分组）
const MODEL_PRESETS = [
    { group: '🔥 DeepSeek 官方', models: [
        { value: 'deepseek-reasoner', label: 'DeepSeek R1 (推理)', desc: '深度思考，适合复杂剧情' },
        { value: 'deepseek-chat', label: 'DeepSeek V3 (对话)', desc: '快速轻量，日常聊天' },
    ]},
    { group: '🚀 硅基流动 · Qwen', models: [
        { value: 'Qwen/QwQ-32B', label: 'QwQ-32B (推理)', desc: '阿里推理模型，深度思考' },
        { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B', desc: '大参数，高质量输出' },
        { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen2.5-32B', desc: '均衡性价比' },
        { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B', desc: '轻量快速，适合群聊' },
    ]},
    { group: '🚀 硅基流动 · DeepSeek', models: [
        { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', desc: '经硅基流动加速' },
        { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', desc: '经硅基流动加速' },
        { value: 'deepseek-ai/DeepSeek-R1-0528', label: 'DeepSeek R1-0528', desc: '最新版推理模型' },
    ]},
    { group: '🌙 硅基流动 · Kimi', models: [
        { value: 'Pro/moonshotai/Kimi-K2.5', label: 'Kimi K2.5 Pro (推理)', desc: '旗舰最强，深度思考' },
        { value: 'moonshotai/Kimi-K2-Thinking', label: 'Kimi K2 Thinking', desc: '标准推理，速度均衡' },
    ]},
    { group: '🚀 硅基流动 · 其他', models: [
        { value: 'Pro/zai-org/GLM-5', label: 'GLM-5', desc: '智谱最新旗舰' },
        { value: 'THUDM/GLM-4-32B-0414', label: 'GLM-4-32B', desc: '智谱清言' },
        { value: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', desc: 'Google 开源' },
        { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B', desc: 'Meta 开源' },
    ]},
];

const props = defineProps({
  globalSettings: Object
});

const appState = useAppState();
const storageUsage = computed(() => appState.storageUsage);

// 模型选择：是否使用自定义输入
const useCustomModel = ref(false);

// 检查当前模型是否在预设列表中
const isPresetModel = computed(() => {
    return MODEL_PRESETS.some(g => g.models.some(m => m.value === props.globalSettings.model));
});

// 切换到自定义模式
function toggleCustomModel() {
    useCustomModel.value = !useCustomModel.value;
    if (!useCustomModel.value && !isPresetModel.value) {
        // 如果切回预设但当前值不在列表里，不做处理（保持原值）
    }
}
const storageColor = computed(() => {
  if (storageUsage.value.percent >= 80) return 'red';
  if (storageUsage.value.percent >= 60) return 'yellow';
  return 'green';
});

const userFileInputRef = ref(null);
const isUserAvatarProcessing = ref(false);
const useCustomBaseUrl = ref(false);

function triggerUserFilePicker() {
  userFileInputRef.value?.click();
}

async function handleUserFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); return; }
  isUserAvatarProcessing.value = true;
  try {
    const dataUrl = await compressImage(file, 256);
    props.globalSettings.userAvatar = dataUrl;
  } catch (err) {
    alert('图片处理失败: ' + err.message);
  } finally {
    isUserAvatarProcessing.value = false;
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
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function clearUserAvatar() {
  props.globalSettings.userAvatar = '';
}

// Reset custom style to defaults
function resetCustomStyle() {
  if (props.globalSettings && props.globalSettings.customStyle) {
    props.globalSettings.customStyle = {
      actionColor: '#a1a1aa',
      actionSymbol: '*',
      thoughtColor: '#78716c',
      thoughtSymbol: '♡',
      statusColor: '#6b7280',
      statusBracket: '[]',
      fontSize: 1.0,
      dialogueColor: '#e5e7eb',
      dialogueSymbol: '"'
    };
  }
}
</script>

<template>
  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-primary flex items-center text-shadow">
      <span class="mr-2">🌐</span> 全局设置
    </h3>

    <div class="space-y-3">
      <!-- 📊 存储用量 -->
      <div class="mb-2">
        <div class="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>💾 存储用量</span>
          <span>{{ (storageUsage.usedKB / 1024).toFixed(1) }} MB / {{ (storageUsage.totalKB / 1024).toFixed(0) }} MB</span>
        </div>
        <div class="storage-bar-track">
          <div class="storage-bar-fill" :class="storageColor" :style="{ width: Math.min(storageUsage.percent, 100) + '%' }"></div>
        </div>
        <details v-if="storageUsage.breakdown?.length" class="mt-1">
          <summary class="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">各模块明细</summary>
          <div class="mt-1 space-y-0.5">
            <div v-for="item in storageUsage.breakdown" :key="item.key" class="flex justify-between text-[10px] text-gray-500">
              <span>{{ item.label }}</span>
              <span>{{ item.sizeKB }} KB</span>
            </div>
          </div>
        </details>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="block text-sm text-gray-300">🔗 API 平台</label>
          <button @click="useCustomBaseUrl = !useCustomBaseUrl" class="text-xs px-2 py-0.5 rounded-full transition"
                  :class="useCustomBaseUrl ? 'bg-primary/20 text-primary' : 'bg-white/5 text-gray-400 hover:text-gray-300'">
            {{ useCustomBaseUrl ? '📋 选预设' : '✏️ 手动输入' }}
          </button>
        </div>
        <select v-if="!useCustomBaseUrl" v-model="globalSettings.baseUrl"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <option value="https://api.deepseek.com">🔥 DeepSeek 官方</option>
          <option value="https://api.siliconflow.cn/v1">🚀 硅基流动 (SiliconFlow)</option>
          <option value="https://openrouter.ai/api/v1">🌐 OpenRouter</option>
        </select>
        <input v-else v-model="globalSettings.baseUrl" type="text" placeholder="https://api.example.com/v1"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
      </div>

      <div>
        <label class="block text-sm text-gray-300 mb-1">API Key</label>
        <input v-model="globalSettings.apiKey" type="password" placeholder="sk-..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light"
               :class="{ 'api-key-highlight': !globalSettings.apiKey }">
        <p v-if="!globalSettings.apiKey" class="text-xs text-amber-400 mt-1">⚡ 填入 API Key 后即可开始对话</p>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="block text-sm text-gray-300">🧠 模型选择</label>
          <button @click="toggleCustomModel" class="text-xs px-2 py-0.5 rounded-full transition"
                  :class="useCustomModel ? 'bg-primary/20 text-primary' : 'bg-white/5 text-gray-400 hover:text-gray-300'">
            {{ useCustomModel ? '📋 选预设' : '✏️ 手动输入' }}
          </button>
        </div>
        <!-- 预设选择模式 -->
        <select v-if="!useCustomModel" v-model="globalSettings.model"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition model-select">
          <template v-for="group in MODEL_PRESETS" :key="group.group">
            <optgroup :label="group.group">
              <option v-for="m in group.models" :key="m.value" :value="m.value">
                {{ m.label }} — {{ m.desc }}
              </option>
            </optgroup>
          </template>
        </select>
        <!-- 自定义输入模式 -->
        <input v-else v-model="globalSettings.model" type="text" placeholder="输入模型 ID，如 Qwen/Qwen2.5-72B-Instruct"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
        <p class="text-xs text-gray-500 mt-1">当前：{{ globalSettings.model || '未设置' }}</p>
      </div>

      <div>
        <label class="block text-sm text-gray-300 mb-2">👤 用户头像</label>
        <div class="flex items-center gap-4">
          <div class="user-avatar-picker" @click="triggerUserFilePicker" :class="{ 'processing': isUserAvatarProcessing }">
            <img v-if="globalSettings.userAvatar" :src="globalSettings.userAvatar" class="w-full h-full object-cover rounded-full" />
            <div v-else class="user-avatar-picker-empty">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <span class="text-xs text-gray-500">选择</span>
            </div>
            <div v-if="isUserAvatarProcessing" class="user-avatar-loading">
              <div class="user-avatar-spinner"></div>
            </div>
          </div>
          <div class="flex-1 space-y-2">
            <input v-model="globalSettings.userAvatar" type="text" placeholder="或粘贴图片 URL..."
                   class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
            <button v-if="globalSettings.userAvatar" @click="clearUserAvatar" class="text-xs text-red-400 hover:text-red-300 transition">清除头像</button>
          </div>
        </div>
        <input ref="userFileInputRef" type="file" accept="image/*" class="hidden" @change="handleUserFileSelect">
      </div>

      <!-- 自动朗读 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🔊 自动朗读 (Auto-Play TTS)</label>
          <p class="text-xs text-gray-400">AI 回复完成后自动语音朗读</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.autoPlayTTS }"
             @click="globalSettings.autoPlayTTS = !globalSettings.autoPlayTTS"></div>
      </div>

      <!-- 输出长度偏好 -->
      <div class="pt-3 mt-3 border-t border-white/10">
        <label class="block text-sm text-gray-300 mb-2">📝 输出长度偏好 (Response Length)</label>
        <select v-model="globalSettings.responseLength"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <option value="auto">Auto (AI 自己决定)</option>
          <option value="short">Concise (日常/短回复 50-150字)</option>
          <option value="normal">Standard (标准模式 200-400字)</option>
          <option value="long">Novel Mode (沉浸小说 400+字)</option>
        </select>
        <p class="text-xs text-gray-400 mt-1">控制 AI 回复的详细程度和篇幅</p>
      </div>

      <!-- 聊天字体大小 -->
      <div class="pt-3 mt-3 border-t border-white/10">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm text-gray-300">🔤 聊天字体大小</label>
          <span class="text-xs text-gray-400">{{ Math.round((globalSettings.chatFontSize || 1.0) * 100) }}%</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">A</span>
          <input type="range" min="0.8" max="1.4" step="0.05"
                 :value="globalSettings.chatFontSize || 1.0"
                 @input="globalSettings.chatFontSize = parseFloat($event.target.value)"
                 class="flex-1 accent-primary" />
          <span class="text-sm text-gray-400 font-bold">A</span>
        </div>
        <p class="text-xs text-gray-500 mt-1" :style="{ fontSize: ((globalSettings.chatFontSize || 1.0) * 14) + 'px' }">
          预览：这是一段示例文字，看看大小是否合适
        </p>
      </div>

      <!-- 显示推理过程 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🔧 Show AI Reasoning (显示推理过程)</label>
          <p class="text-xs text-gray-400">显示 DeepSeek R1 的底层思维链 (&lt;think&gt;)</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.showLogic }"
             @click="globalSettings.showLogic = !globalSettings.showLogic"></div>
      </div>

      <!-- 显示内心戏 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">💭 Show Inner Thoughts (显示内心戏)</label>
          <p class="text-xs text-gray-400">显示角色的潜台词和心理活动 (&lt;inner&gt;)</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.showInner }"
             @click="globalSettings.showInner = !globalSettings.showInner"></div>
      </div>

      <!-- ⚙️ 高级设置（默认折叠） -->
      <details class="pt-3 mt-3 border-t border-white/10">
        <summary class="cursor-pointer text-sm text-gray-300 hover:text-gray-100 transition select-none py-1">
          ⚙️ Advanced Settings (高级设置)
        </summary>
        <div class="mt-3 space-y-0">

      <!-- 沉浸模式 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🌙 Immersive Mode (沉浸模式)</label>
          <p class="text-xs text-gray-400">隐藏思维标记和状态提示，提供纯粹的阅读体验</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.immersiveMode }"
             @click="globalSettings.immersiveMode = !globalSettings.immersiveMode"></div>
      </div>

      <!-- 🔊 音效开关 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🔊 Sound Effects (音效)</label>
          <p class="text-xs text-gray-400">UI 交互音效和 AI 回复提示音</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': !globalSettings.soundMuted }"
             @click="globalSettings.soundMuted = !globalSettings.soundMuted"></div>
      </div>
      <div v-if="!globalSettings.soundMuted" class="mt-2">
        <label class="block text-xs text-gray-400 mb-1">音量: {{ Math.round((globalSettings.soundVolume || 0.2) * 100) }}%</label>
        <input type="range" min="0.05" max="0.5" step="0.05"
               :value="globalSettings.soundVolume || 0.2"
               @input="globalSettings.soundVolume = parseFloat($event.target.value)"
               class="w-full accent-primary" />
      </div>

      <!-- v5.9: Token 消耗量显示 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🪙 Show Token Count (Token 消耗)</label>
          <p class="text-xs text-gray-400">在每条 AI 回复上显示 Token 用量</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.showTokens }"
             @click="globalSettings.showTokens = !globalSettings.showTokens"></div>
      </div>

      <!-- 🧠 智能后台分析 -->
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
        <div>
          <label class="block text-sm text-gray-300">🧠 Smart Analysis (智能后台分析)</label>
          <p class="text-xs text-gray-400">自动生成摘要、分析关系、提取用户画像（额外消耗 token）</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.enableSmartAnalysis !== false }"
             @click="globalSettings.enableSmartAnalysis = !globalSettings.enableSmartAnalysis"></div>
      </div>

      <!-- 文字风格选择 -->
      <div class="pt-3 mt-3 border-t border-white/10">
        <label class="block text-sm text-gray-300 mb-2">🎨 文字风格 (Text Style)</label>
        <div class="style-card-grid">
          <div v-for="s in [
            { id: 'clear', name: '清澈·标准', desc: '深色·无衬线', color: '#6b9fff' },
            { id: 'misty', name: '烟雨·无气泡', desc: '深暖·衬线', color: '#c8a878' },
            { id: 'day', name: '烟雨·日间', desc: '浅色·衬线', color: '#8b7355' },
            { id: 'loveDark', name: '甜心·暗粉', desc: '深色·粉色调', color: '#ff6eb0' },
            { id: 'loveLight', name: '甜心·浅粉', desc: '浅色·衬线', color: '#e8699a' }
          ]" :key="s.id"
               class="style-card"
               :class="{ active: globalSettings.rpTextStyle === s.id }"
               :style="{ '--card-accent': s.color }"
               @click="globalSettings.rpTextStyle = s.id">
            <div class="style-card-dot" :style="{ background: s.color }"></div>
            <div class="style-card-name">{{ s.name }}</div>
            <div class="style-card-desc">{{ s.desc }}</div>
          </div>
        </div>
      </div>
      </div><!-- end mt-3 space-y-0 -->
      </details><!-- end advanced settings -->
    </div><!-- end space-y-3 -->
  </section>
</template>

<style scoped>
.user-avatar-picker {
  width: 64px;
  height: 64px;
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
.user-avatar-picker:hover {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.08);
}
.user-avatar-picker:active { transform: scale(0.95); }
.user-avatar-picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.user-avatar-loading {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.user-avatar-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.style-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.style-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}
.style-card:hover {
  border-color: var(--card-accent, rgba(255,255,255,0.2));
  background: rgba(255,255,255,0.06);
}
.style-card.active {
  border-color: var(--card-accent, #6b9fff);
  background: rgba(255,255,255,0.08);
  box-shadow: 0 0 12px color-mix(in srgb, var(--card-accent) 20%, transparent);
}
.style-card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 0 auto 6px;
}
.style-card-name {
  font-size: 12px;
  color: rgba(255,255,255,0.85);
  margin-bottom: 2px;
  letter-spacing: 1px;
}
.style-card-desc {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  letter-spacing: 0.5px;
}
</style>
