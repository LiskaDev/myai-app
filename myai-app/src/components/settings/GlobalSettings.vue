<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppState } from '../../composables/useAppState';
import AvatarCropper from '../AvatarCropper.vue';

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

const props = defineProps({ globalSettings: Object });
const emit = defineEmits(['show-toast']);

const appState = useAppState();
const storageUsage = computed(() => appState.storageUsage);
const storageColor = computed(() => 'green');

onMounted(() => {
  appState.refreshStorageUsage();
});

const useCustomModel = ref(false);
const useCustomBaseUrl = ref(false);

const isPresetModel = computed(() =>
  MODEL_PRESETS.some(g => g.models.some(m => m.value === props.globalSettings.model))
);

function toggleCustomModel() {
  useCustomModel.value = !useCustomModel.value;
}

// 用户头像
const userFileInputRef = ref(null);
const isUserAvatarProcessing = ref(false);
const cropperSrc = ref(null);

function triggerUserFilePicker() { userFileInputRef.value?.click(); }

async function handleUserFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { emit('show-toast', '图片不能超过 10MB', 'error'); return; }
  isUserAvatarProcessing.value = true;
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
    isUserAvatarProcessing.value = false;
    event.target.value = '';
  }
}

function onCropConfirm(dataUrl) { props.globalSettings.userAvatar = dataUrl; cropperSrc.value = null; emit('show-toast', '头像已更新 ✓', 'success'); }
function onCropCancel() { cropperSrc.value = null; }
function clearUserAvatar() { props.globalSettings.userAvatar = ''; }

function resetCustomStyle() {
  if (props.globalSettings?.customStyle) {
    props.globalSettings.customStyle = {
      actionColor: '#a1a1aa', actionSymbol: '*',
      thoughtColor: '#78716c', thoughtSymbol: '♡',
      statusColor: '#6b7280', statusBracket: '[]',
      fontSize: 1.0, dialogueColor: '#e5e7eb', dialogueSymbol: '"'
    };
  }
}
</script>

<template>
  <AvatarCropper v-if="cropperSrc" :image-src="cropperSrc" @confirm="onCropConfirm" @cancel="onCropCancel" />

  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-primary flex items-center text-shadow">
      <span class="mr-2">🌐</span> 全局设置
    </h3>

    <div class="space-y-4">

      <!-- 📊 存储用量 -->
      <div class="setting-row">
        <div class="w-full">
          <div class="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>💾 辅助数据(localStorage)</span>
            <span>{{ storageUsage.usedKB }} KB（角色/设置已存 IndexedDB，无上限）</span>
          </div>
          <div class="storage-bar-track">
            <div class="storage-bar-fill" :class="storageColor" :style="{ width: Math.min(storageUsage.percent, 100) + '%' }"></div>
          </div>
          <details v-if="storageUsage.breakdown?.length" class="mt-1">
            <summary class="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">各模块明细</summary>
            <div class="mt-1 space-y-0.5">
              <div v-for="item in storageUsage.breakdown" :key="item.key" class="flex justify-between text-[10px] text-gray-500">
                <span>{{ item.label }}</span><span>{{ item.sizeKB }} KB</span>
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- 🔗 API 平台 -->
      <div class="setting-row flex-col items-start gap-2">
        <div class="flex items-center justify-between w-full">
          <label class="text-sm text-gray-300">🔗 API 平台</label>
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

      <!-- API Key -->
      <div class="setting-row flex-col items-start gap-1.5">
        <label class="text-sm text-gray-300">API Key</label>
        <input v-model="globalSettings.apiKey" type="password" placeholder="sk-..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light"
               :class="{ 'api-key-highlight': !globalSettings.apiKey }">
        <p v-if="!globalSettings.apiKey" class="text-xs text-amber-400">⚡ 填入 API Key 后即可开始对话</p>
      </div>

      <!-- 🧠 主模型 -->
      <div class="setting-row flex-col items-start gap-1.5">
        <div class="flex items-center justify-between w-full">
          <label class="text-sm text-gray-300">🧠 主模型</label>
          <button @click="toggleCustomModel" class="text-xs px-2 py-0.5 rounded-full transition"
                  :class="useCustomModel ? 'bg-primary/20 text-primary' : 'bg-white/5 text-gray-400 hover:text-gray-300'">
            {{ useCustomModel ? '📋 选预设' : '✏️ 手动输入' }}
          </button>
        </div>
        <select v-if="!useCustomModel" v-model="globalSettings.model"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <template v-for="group in MODEL_PRESETS" :key="group.group">
            <optgroup :label="group.group">
              <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }} — {{ m.desc }}</option>
            </optgroup>
          </template>
        </select>
        <input v-else v-model="globalSettings.model" type="text" placeholder="输入模型 ID，如 Qwen/Qwen2.5-72B-Instruct"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
        <p class="text-xs text-gray-500">当前：{{ globalSettings.model || '未设置' }}</p>
        <details class="w-full">
          <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-400 select-none">🔑 哪个平台用哪个 Key？</summary>
          <div class="mt-2 space-y-1.5 pl-3 border-l-2 border-white/8 text-xs text-gray-400 leading-relaxed">
            <div><span class="text-gray-300">🔥 DeepSeek 官方</span> → <a href="https://platform.deepseek.com" target="_blank" class="text-indigo-400 hover:underline">platform.deepseek.com</a></div>
            <div><span class="text-gray-300">🚀 硅基流动</span>（Qwen / DeepSeek / Kimi / GLM）→ <a href="https://cloud.siliconflow.cn" target="_blank" class="text-indigo-400 hover:underline">cloud.siliconflow.cn</a></div>
            <div><span class="text-gray-300">🌐 OpenRouter</span>（Claude / Gemini / GPT）→ <a href="https://openrouter.ai/keys" target="_blank" class="text-indigo-400 hover:underline">openrouter.ai</a>，模型 ID 手动输入</div>
            <div class="text-gray-500">💡 API 平台 和 Key 要配套，混用会报 401</div>
          </div>
        </details>
      </div>

      <!-- ⚙️ 后台模型（摘要/记忆/画像分析用） -->
      <div class="setting-row flex-col items-start gap-1.5">
        <label class="text-sm text-gray-300">⚙️ 后台分析模型 <span class="text-xs text-gray-500">（摘要/记忆/画像分析用）</span></label>
        <select v-model="globalSettings.bgModel"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <option value="">🔄 跟随主模型</option>
          <template v-for="group in MODEL_PRESETS" :key="'bg-'+group.group">
            <optgroup :label="group.group">
              <option v-for="m in group.models" :key="'bg-'+m.value" :value="m.value">{{ m.label }} — {{ m.desc }}</option>
            </optgroup>
          </template>
        </select>

        <!-- 选了后台模型才显示独立平台和密钥 -->
        <template v-if="globalSettings.bgModel">
          <div class="w-full space-y-2 pl-3 border-l-2 border-white/10 mt-1">
            <div>
              <label class="block text-xs text-gray-400 mb-1">后台 API 平台 <span class="text-gray-600">（留空跟随主设置）</span></label>
              <select v-model="globalSettings.bgBaseUrl"
                      class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-2 py-1.5 text-sm outline-none border border-white/10 focus:border-primary transition">
                <option value="">🔄 跟随主设置</option>
                <option value="https://api.deepseek.com">🔥 DeepSeek 官方</option>
                <option value="https://api.siliconflow.cn/v1">🚀 硅基流动</option>
                <option value="https://openrouter.ai/api/v1">🌐 OpenRouter</option>
              </select>
            </div>
            <!-- 选了独立平台才显示密钥 -->
            <div v-if="globalSettings.bgBaseUrl">
              <label class="block text-xs text-gray-400 mb-1">后台 API Key <span class="text-gray-600">（留空跟随主设置）</span></label>
              <input v-model="globalSettings.bgApiKey" type="password" placeholder="留空则使用主 API Key"
                     class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-2 py-1.5 text-sm outline-none border border-white/10 focus:border-primary transition">
            </div>
          </div>
          <p class="text-xs text-gray-500">后台任务使用独立模型配置</p>
        </template>
        <p v-else class="text-xs text-gray-500">后台任务跟随主模型</p>
      </div>

      <!-- 👤 用户头像 -->
      <div class="setting-row flex-col items-start gap-2">
        <label class="text-sm text-gray-300">👤 用户头像</label>
        <div class="flex items-center gap-4 w-full">
          <div class="user-avatar-picker" @click="triggerUserFilePicker" :class="{ 'processing': isUserAvatarProcessing }">
            <img v-if="globalSettings.userAvatar" :src="globalSettings.userAvatar" class="w-full h-full object-cover rounded-full" />
            <div v-else class="user-avatar-picker-empty">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <span class="text-xs text-gray-500">选择</span>
            </div>
            <div v-if="isUserAvatarProcessing" class="user-avatar-loading"><div class="user-avatar-spinner"></div></div>
          </div>
          <div class="flex-1 space-y-2">
            <input v-model="globalSettings.userAvatar" type="text" placeholder="或粘贴图片 URL..."
                   class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light text-sm">
            <button v-if="globalSettings.userAvatar" @click="clearUserAvatar" class="text-xs text-red-400 hover:text-red-300 transition">清除头像</button>
          </div>
        </div>
        <input ref="userFileInputRef" type="file" accept="image/*" class="hidden" @change="handleUserFileSelect">
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-white/10 pt-2">
        <p class="text-xs text-gray-500 mb-3">显示与交互</p>
      </div>

      <!-- 🔊 自动朗读 -->
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm text-gray-300">🔊 自动朗读</label>
          <p class="text-xs text-gray-500">AI 回复完成后自动语音朗读</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.autoPlayTTS }"
             @click="globalSettings.autoPlayTTS = !globalSettings.autoPlayTTS"></div>
      </div>

      <!-- 📝 输出长度偏好 -->
      <div>
        <label class="block text-sm text-gray-300 mb-2">📝 输出长度偏好</label>
        <select v-model="globalSettings.responseLength"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <option value="auto">自动（AI 自行决定）</option>
          <option value="short">简短（日常对话 50-150字）</option>
          <option value="normal">标准（均衡模式 200-400字）</option>
          <option value="long">详述（沉浸小说 400+字）</option>
        </select>
        <p class="text-xs text-gray-500 mt-1">控制 AI 回复的详细程度和篇幅</p>
      </div>

      <!-- 🔧 显示推理过程 -->
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm text-gray-300">🔧 显示推理过程</label>
          <p class="text-xs text-gray-500">显示 DeepSeek R1 的底层思维链 (&lt;think&gt;)</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.showLogic }"
             @click="globalSettings.showLogic = !globalSettings.showLogic"></div>
      </div>

      <!-- 💭 显示内心戏 -->
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm text-gray-300">💭 显示内心戏</label>
          <p class="text-xs text-gray-500">显示角色的潜台词和心理活动 (&lt;inner&gt;)</p>
        </div>
        <div class="toggle-switch" :class="{ 'active': globalSettings.showInner }"
             @click="globalSettings.showInner = !globalSettings.showInner"></div>
      </div>

      <!-- ⚙️ 高级设置（折叠） -->
      <details class="pt-2 border-t border-white/10">
        <summary class="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition select-none py-1">⚙️ 高级设置</summary>
        <div class="mt-3 space-y-4">

          <!-- 🎭 沉浸模式（只在这里有，角色Tab不重复） -->
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-gray-300">{{ globalSettings.immersiveMode ? '🎭 沉浸模式' : '💬 自由模式' }}</label>
              <p class="text-xs text-gray-500">{{ globalSettings.immersiveMode ? '隐藏思维标记，AI 绝不脱离角色' : '显示思考过程，可跳出角色讨论剧情' }}</p>
            </div>
            <div class="toggle-switch" :class="{ 'active': globalSettings.immersiveMode }"
                 @click="globalSettings.immersiveMode = !globalSettings.immersiveMode"></div>
          </div>

          <!-- 🔊 音效 -->
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-gray-300">🔊 音效</label>
              <p class="text-xs text-gray-500">UI 交互音效和 AI 回复提示音</p>
            </div>
            <div class="toggle-switch" :class="{ 'active': !globalSettings.soundMuted }"
                 @click="globalSettings.soundMuted = !globalSettings.soundMuted"></div>
          </div>
          <div v-if="!globalSettings.soundMuted">
            <label class="block text-xs text-gray-400 mb-1">音量: {{ Math.round((globalSettings.soundVolume || 0.2) * 100) }}%</label>
            <input type="range" min="0.05" max="0.5" step="0.05"
                   :value="globalSettings.soundVolume || 0.2"
                   @input="globalSettings.soundVolume = parseFloat($event.target.value)"
                   class="w-full accent-primary" />
          </div>

          <!-- 🪙 Token 用量 -->
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-gray-300">🪙 显示 Token 用量</label>
              <p class="text-xs text-gray-500">在每条 AI 回复上显示 Token 用量</p>
            </div>
            <div class="toggle-switch" :class="{ 'active': globalSettings.showTokens }"
                 @click="globalSettings.showTokens = !globalSettings.showTokens"></div>
          </div>

          <!-- 🧠 智能后台分析 -->
          <div class="flex items-center justify-between">
            <div>
              <label class="block text-sm text-gray-300">🧠 智能后台分析</label>
              <p class="text-xs text-gray-500">自动生成摘要、分析关系、提取用户画像（额外消耗 Token）</p>
            </div>
            <div class="toggle-switch" :class="{ 'active': globalSettings.enableSmartAnalysis !== false }"
                 @click="globalSettings.enableSmartAnalysis = !globalSettings.enableSmartAnalysis"></div>
          </div>
          <p v-if="!globalSettings.enableSmartAnalysis" class="text-xs" style="color: #f87171;">
            ⚠️ 已关闭：角色状态、剧情章节、认知卡、时间线将全部停止更新
          </p>

          <!-- 亮度/深浅/粗细/字号滑块 -->
          <div>
            <!-- 聊天区亮度 -->
            <div class="mt-3">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-400">☀️ 聊天背景亮度</label>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">{{ globalSettings.chatBgBrightness || 100 }}%</span>
                  <button v-if="(globalSettings.chatBgBrightness || 100) !== 100" @click="globalSettings.chatBgBrightness = 100" class="text-[10px] text-gray-500 hover:text-gray-300 transition">重置</button>
                </div>
              </div>
              <p class="text-[10px] text-gray-600 mb-1">调节聊天区域背景的明暗程度</p>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-600">🌙</span>
                <input type="range" min="50" max="150" step="5"
                       :value="globalSettings.chatBgBrightness || 100"
                       @input="globalSettings.chatBgBrightness = parseInt($event.target.value)"
                       class="flex-1 accent-primary" />
                <span class="text-[10px] text-gray-600">☀️</span>
              </div>
            </div>

            <!-- 文字深浅 -->
            <div class="mt-2">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-400">✍️ 文字深浅</label>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">{{ globalSettings.chatTextBrightness || 100 }}%</span>
                  <button v-if="(globalSettings.chatTextBrightness || 100) !== 100" @click="globalSettings.chatTextBrightness = 100" class="text-[10px] text-gray-500 hover:text-gray-300 transition">重置</button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-600">淡</span>
                <input type="range" min="50" max="150" step="5"
                       :value="globalSettings.chatTextBrightness || 100"
                       @input="globalSettings.chatTextBrightness = parseInt($event.target.value)"
                       class="flex-1 accent-primary" />
                <span class="text-[10px] text-gray-600">深</span>
              </div>
            </div>

            <!-- 文字粗细 -->
            <div class="mt-2">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-400">𝐁 文字粗细</label>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">{{ (globalSettings.chatFontWeight || 0) === 0 ? '默认' : ((globalSettings.chatFontWeight > 0 ? '+' : '') + globalSettings.chatFontWeight) }}</span>
                  <button v-if="(globalSettings.chatFontWeight || 0) !== 0" @click="globalSettings.chatFontWeight = 0" class="text-[10px] text-gray-500 hover:text-gray-300 transition">重置</button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-600">细</span>
                <input type="range" min="-2" max="3" step="1"
                       :value="globalSettings.chatFontWeight || 0"
                       @input="globalSettings.chatFontWeight = parseInt($event.target.value)"
                       class="flex-1 accent-primary" />
                <span class="text-[10px] text-gray-600 font-bold">粗</span>
              </div>
            </div>

            <!-- 字体大小 -->
            <div class="mt-2">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-400">🔤 聊天字体大小</label>
                <span class="text-xs text-gray-500">{{ Math.round((globalSettings.chatFontSize || 1.0) * 100) }}%</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-600">A</span>
                <input type="range" min="0.8" max="1.4" step="0.05"
                       :value="globalSettings.chatFontSize || 1.0"
                       @input="globalSettings.chatFontSize = parseFloat($event.target.value)"
                       class="flex-1 accent-primary" />
                <span class="text-[10px] text-gray-600 font-bold">A</span>
              </div>
            </div>
          </div>

        </div>
      </details>

    </div>

    <!-- 免责声明 -->
    <p class="text-[11px] text-gray-600 text-center mt-4 leading-relaxed">
      本工具仅提供对话界面，AI 内容由第三方 API 生成，用户需遵守相关法律法规和 API 服务商的使用条款。
    </p>
  </section>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  padding: 2px 0;
}

.user-avatar-picker {
  width: 64px; height: 64px;
  border-radius: 50%; border: 2px dashed var(--border);
  cursor: pointer; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative;
  transition: all 0.2s ease; background: var(--brush);
}
.user-avatar-picker:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.user-avatar-picker:active { transform: scale(0.95); }
.user-avatar-picker-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.user-avatar-loading {
  position: absolute; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
}
.user-avatar-spinner {
  width: 20px; height: 20px;
  border: 2px solid rgba(255,255,255,0.2); border-top-color: white;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>