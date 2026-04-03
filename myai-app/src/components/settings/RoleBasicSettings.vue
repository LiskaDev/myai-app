<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { generateRoleFromDescription } from '../../composables/useRoleGenerator';
import { WRITING_STYLE_PRESETS } from '../../composables/presets';
import AvatarCropper from '../AvatarCropper.vue';

const props = defineProps({
  currentRole: Object,
  globalSettings: Object
});

const emit = defineEmits(['show-toast', 'ai-role-generated']);

// AI 生成
const aiDescription = ref('');
const isGenerating = ref(false);
const abortControllerRef = ref(null);

async function handleGenerate() {
  if (!aiDescription.value.trim() || isGenerating.value) return;
  isGenerating.value = true;
  const controller = new AbortController();
  abortControllerRef.value = controller;
  const result = await generateRoleFromDescription(aiDescription.value, {
    baseUrl: props.globalSettings?.baseUrl,
    apiKey: props.globalSettings?.apiKey,
  }, controller.signal);
  abortControllerRef.value = null;
  isGenerating.value = false;
  if (controller.signal.aborted) return;
  if (result.success) {
    const fields = ['name', 'systemPrompt', 'speakingStyle', 'appearance', 'secret', 'worldLogic', 'relationship', 'firstMessage', 'styleGuide', 'mesExample', 'authorNote'];
    for (const field of fields) {
      if (result.data[field]) props.currentRole[field] = result.data[field];
    }
    aiDescription.value = '';
    emit('show-toast', '✨ 角色生成成功！可自由修改各字段', 'info');
  } else {
    if (!result.error?.includes('AbortError') && !result.error?.includes('中止')) {
      emit('show-toast', result.error || '生成失败，请重试', 'error');
    }
  }
}

function cancelGeneration() {
  if (abortControllerRef.value) {
    abortControllerRef.value.abort();
    abortControllerRef.value = null;
    isGenerating.value = false;
  }
}

onBeforeUnmount(() => cancelGeneration());
defineExpose({ cancelGeneration });

// 头像上传
const fileInputRef = ref(null);
const isAvatarProcessing = ref(false);
const cropperSrc = ref(null);

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { emit('show-toast', '图片不能超过 10MB', 'error'); return; }
  isAvatarProcessing.value = true;
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
    isAvatarProcessing.value = false;
    event.target.value = '';
  }
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
  <!-- 头像裁剪器 -->
  <AvatarCropper
    v-if="cropperSrc"
    :image-src="cropperSrc"
    @confirm="onCropConfirm"
    @cancel="onCropCancel"
  />

  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-secondary flex items-center text-shadow">
      <span class="mr-2">🎭</span> {{ currentRole.name || '新角色' }}
      <span class="ml-auto text-xs font-normal text-gray-500 bg-secondary/20 px-2 py-0.5 rounded-full">基础设置</span>
    </h3>

    <div class="space-y-4">

      <!-- ✨ AI 一键生成 -->
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
          <button @click="handleGenerate" :disabled="isGenerating || !aiDescription.trim()" class="ai-gen-btn">
            <span v-if="isGenerating" class="ai-gen-spinner"></span>
            <span v-else>✨ 生成</span>
          </button>
        </div>
      </div>

      <!-- 🖼️ 角色头像 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base">🖼️</span>
          <label class="text-sm text-gray-200 font-medium">角色头像</label>
        </div>
        <div class="flex items-center gap-4">
          <!-- 头像预览 / 点击上传 -->
          <div class="avatar-picker" @click="triggerFilePicker" :class="{ 'opacity-70': isAvatarProcessing }">
            <img v-if="currentRole.avatar" :src="currentRole.avatar" class="w-full h-full object-cover rounded-full" />
            <div v-else class="avatar-picker-empty">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <span class="text-[10px] text-gray-500 mt-1">点击上传</span>
            </div>
            <div v-if="isAvatarProcessing" class="avatar-picker-loading">
              <div class="avatar-spinner"></div>
            </div>
          </div>
          <!-- 右侧：URL输入 + 清除 -->
          <div class="flex-1 space-y-2">
            <input v-model="currentRole.avatar" type="text" placeholder="或粘贴图片 URL..."
                   class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-secondary transition text-shadow-light text-sm">
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500">点击头像或粘贴 URL</span>
              <button v-if="currentRole.avatar" @click="clearAvatar" class="text-xs text-red-400 hover:text-red-300 transition ml-auto">清除头像</button>
            </div>
          </div>
        </div>
        <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelect">
      </div>

      <!-- 📛 角色名称 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">📛</span>
          <label class="text-sm text-gray-200 font-medium">角色名称</label>
        </div>
        <input v-model="currentRole.name" type="text" placeholder="例如：温柔姐姐、赛博黑客..."
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition text-shadow-light">
      </div>

      <!-- 💫 角色性格与背景 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">💫</span>
          <label class="text-sm text-gray-200 font-medium">角色性格与背景</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">定义角色的核心人格：TA 是谁？性格如何？有什么特点？</div>
          </div>
        </div>
        <textarea v-model="currentRole.systemPrompt" rows="5"
                  placeholder="例如：你是一个来自2077年的赛博黑客，性格酷炫，说话简短有力..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
      </div>

      <!-- 📝 对话示例 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">📝</span>
          <label class="text-sm text-gray-200 font-medium">对话示例</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">直接粘贴 1-3 段对话示例，格式自由。AI 会模仿这些示例的语调和说话风格来回复。✨ AI 一键生成时会自动补全此字段。</div>
          </div>
        </div>
        <textarea v-model="currentRole.mesExample" rows="4"
                  placeholder="我：*轻轻推了推她的肩膀*&#10;角色：*猛地抬头，眼眶有些红* 「……你干嘛突然吓我」&#10;&#10;我：算了，走吧。&#10;角色：*跟上来，保持着半步的距离* 「去哪？」"
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light text-sm"></textarea>
        <p class="text-xs text-gray-500 mt-1">直接粘贴对话内容即可，格式自由，空行分隔不同段落</p>
      </div>

      <!-- 📋 补充指令/作者备注 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">📋</span>
          <label class="text-sm text-gray-200 font-medium">补充指令 / 作者备注</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">每轮对话末尾都会注入，承载绝对不能被 AI 遗忘的底层铁律。字数越精简越有效。✨ AI 一键生成时会自动补全。</div>
          </div>
        </div>
        <textarea v-model="currentRole.authorNote" rows="3"
                  placeholder="例如：禁止主动提出分别；战斗场景必须描写实际伤亡；永远不主动提及过去的恋情。"
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-amber-500/40 transition resize-none text-shadow-light"></textarea>
        <p class="text-xs text-gray-500 mt-1">此处内容以最高优先级注入每轮对话末尾，用于不可妥协的行为约束</p>
      </div>

      <!-- 💬 开场白 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">💬</span>
          <label class="text-sm text-gray-200 font-medium">开场白</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">角色说的第一句话，用于开启对话</div>
          </div>
        </div>
        <textarea v-model="currentRole.firstMessage" rows="2"
                  placeholder="例如：你好，旅行者。在这个数字世界里，没有什么是我无法破解的..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-secondary transition resize-none text-shadow-light"></textarea>
      </div>

      <!-- 🎨 写作风格 -->
      <div class="basic-field">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base">🎨</span>
          <label class="text-sm text-gray-200 font-medium">写作风格</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300 text-xs">❓</span>
            <div class="tooltip-content">选择一种写作风格模板，AI 会自动调整回复的节奏、语言和氛围</div>
          </div>
        </div>
        <div class="writing-style-grid">
          <button class="writing-style-option" :class="{ active: !currentRole.writingStyle }" @click="currentRole.writingStyle = ''">
            <span class="ws-icon">✨</span><span class="ws-label">默认</span>
          </button>
          <button v-for="preset in WRITING_STYLE_PRESETS" :key="preset.id"
                  class="writing-style-option" :class="{ active: currentRole.writingStyle === preset.id }"
                  @click="currentRole.writingStyle = preset.id" :title="preset.description">
            <span class="ws-icon">{{ preset.icon }}</span><span class="ws-label">{{ preset.label }}</span>
          </button>
        </div>
        <p v-if="currentRole.writingStyle" class="text-xs text-gray-500 mt-1.5">
          {{ WRITING_STYLE_PRESETS.find(s => s.id === currentRole.writingStyle)?.description }}
        </p>
      </div>

      <!-- 引导提示 -->
      <div v-if="!currentRole.systemPrompt?.trim()" class="text-center py-2">
        <p class="text-xs text-gray-500 italic">💡 不知道怎么填？试试最上方的 <span class="text-amber-400">✨ AI 一键生成</span></p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.basic-field {
  padding: 12px;
  background: var(--brush);
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}
.basic-field:hover { background: var(--paper-warm); border-color: var(--border-accent); }
.basic-field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent); }

/* 头像选择器 */
.avatar-picker {
  width: 68px; height: 68px;
  border-radius: 50%;
  border: 2px dashed var(--border);
  cursor: pointer; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative;
  transition: all 0.2s ease;
  background: var(--brush);
}
.avatar-picker:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.avatar-picker:active { transform: scale(0.95); }
.avatar-picker-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.avatar-picker-loading {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
}
.avatar-spinner {
  width: 20px; height: 20px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Tooltip */
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

/* AI 生成卡 */
.ai-gen-card {
  padding: 14px;
  background: linear-gradient(135deg, rgba(245,158,11,0.06), rgba(168,85,247,0.06));
  border-radius: 14px; border: 1px solid rgba(245,158,11,0.2);
  transition: all 0.3s ease; position: relative; overflow: hidden;
}
.ai-gen-card::before {
  content: ''; position: absolute; top: 0; left: -100%; width: 200%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(245,158,11,0.04), transparent);
  animation: ai-shimmer 3s ease-in-out infinite;
}
@keyframes ai-shimmer { 0% { transform: translateX(-50%); } 100% { transform: translateX(50%); } }
.ai-gen-card:hover { border-color: rgba(245,158,11,0.35); box-shadow: 0 0 20px rgba(245,158,11,0.08); }
.ai-gen-label {
  background: linear-gradient(135deg, #f59e0b, #a855f7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.ai-gen-btn {
  padding: 8px 18px;
  background: linear-gradient(135deg, rgba(245,158,11,0.8), rgba(168,85,247,0.8));
  color: white; border: none; border-radius: 10px;
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
  transition: all 0.25s ease; white-space: nowrap; min-width: 80px;
  display: flex; align-items: center; justify-content: center;
}
.ai-gen-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(245,158,11,0.3); }
.ai-gen-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-gen-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.7s linear infinite;
}

/* 写作风格 */
.writing-style-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.writing-style-option {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--brush);
  color: var(--ink-faint); font-size: 0.8rem;
  cursor: pointer; transition: all 0.25s ease; white-space: nowrap;
}
.writing-style-option:hover { border-color: var(--border-accent); background: var(--paper-warm); color: var(--ink); }
.writing-style-option.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--ink); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 15%, transparent); }
.ws-icon { font-size: 0.9rem; line-height: 1; }
.ws-label { font-weight: 500; }
</style>