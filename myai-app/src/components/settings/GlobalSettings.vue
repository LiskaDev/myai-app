<script setup>
import { ref } from 'vue';

const props = defineProps({
  globalSettings: Object
});

const userFileInputRef = ref(null);
const isUserAvatarProcessing = ref(false);

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
      <div>
        <label class="block text-sm text-gray-300 mb-1">Base URL</label>
        <input v-model="globalSettings.baseUrl" type="text" placeholder="https://api.deepseek.com"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
      </div>

      <div>
        <label class="block text-sm text-gray-300 mb-1">API Key</label>
        <input v-model="globalSettings.apiKey" type="password" placeholder="sk-..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
      </div>

      <div>
        <label class="block text-sm text-gray-300 mb-1">Model Name</label>
        <input v-model="globalSettings.model" type="text" placeholder="deepseek-reasoner"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
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

      <!-- 文字风格选择 -->
      <div class="pt-3 mt-3 border-t border-white/10">
        <label class="block text-sm text-gray-300 mb-2">🎨 Roleplay Text Style (角色扮演文字风格)</label>
        <select v-model="globalSettings.rpTextStyle"
                class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition">
          <option value="simple">Simple (简约符号)</option>
          <option value="moonlight">Moonlight (月光夜曲)</option>
          <option value="dreamy">Dreamy (梦幻浪漫)</option>
          <option value="crystal">Crystal (清透水晶)</option>
          <option value="custom">Custom (自定义)</option>
        </select>
        <p class="text-xs text-gray-400 mt-1">*动作* (思绪) [状态] "对话" 的显示样式</p>
      </div>

      <!-- 自定义风格面板 -->
      <div v-if="globalSettings.rpTextStyle === 'custom'" class="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 space-y-4">
        <p class="text-xs text-gray-400 mb-2">🌨️ 自定义设置</p>

        <!-- 动作颜色 + 符号 -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 w-20">*动作*</label>
          <input type="color" v-model="globalSettings.customStyle.actionColor"
                 class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
          <input type="text" v-model="globalSettings.customStyle.actionSymbol" maxlength="2" placeholder="*"
                 class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
        </div>

        <!-- 思绪颜色 + 符号 -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 w-20">(思绪)</label>
          <input type="color" v-model="globalSettings.customStyle.thoughtColor"
                 class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
          <input type="text" v-model="globalSettings.customStyle.thoughtSymbol" maxlength="2" placeholder="♡"
                 class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
        </div>

        <!-- 状态颜色 + 括号 -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 w-20">[状态]</label>
          <input type="color" v-model="globalSettings.customStyle.statusColor"
                 class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
          <input type="text" v-model="globalSettings.customStyle.statusBracket" maxlength="2" placeholder="[]"
                 class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
        </div>

        <!-- 对话颜色 + 符号 -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 w-20">"对话"</label>
          <input type="color" v-model="globalSettings.customStyle.dialogueColor"
                 class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent">
          <input type="text" v-model="globalSettings.customStyle.dialogueSymbol" maxlength="2" placeholder='"'
                 class="w-12 text-center glass-light bg-glass-light text-gray-100 rounded px-2 py-1 text-sm border border-white/10">
        </div>

        <!-- 字体大小 -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 w-20">字体大小</label>
          <input type="range" v-model.number="globalSettings.customStyle.fontSize"
                 min="0.8" max="1.4" step="0.05"
                 class="flex-1 h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
          <span class="text-xs text-gray-400 w-10 text-right">{{ (globalSettings.customStyle.fontSize || 1).toFixed(2) }}</span>
        </div>

        <!-- 重置按钮 -->
        <button @click="resetCustomStyle"
                class="w-full mt-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 text-xs hover:bg-white/10 transition">
          🔄 重置为默认
        </button>
      </div>
    </div>
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
</style>
