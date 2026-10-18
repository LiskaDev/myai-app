<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { generateRoleFromDescription } from '../../composables/useRoleGenerator';
import { WRITING_STYLE_PRESETS } from '../../composables/presets';
import AvatarCropper from '../AvatarCropper.vue';
import IconLine from '../IconLine.vue';

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

  <section class="basic-settings">
    <header class="bs-head">
      <h3 class="bs-title">{{ currentRole.name || '新角色' }}</h3>
      <span class="bs-badge">基础设定</span>
    </header>

    <!-- ✨ AI 一键生成 -->
    <div class="ai-gen-card">
      <div class="ai-gen-head">
        <IconLine emoji="✨" :size="15" class="ai-gen-icon" />
        <label class="ai-gen-label">AI 一键生成</label>
        <span class="ai-gen-desc">描述你想要的角色，AI 帮你填好一切</span>
      </div>
      <div class="ai-gen-row">
        <input
          v-model="aiDescription"
          type="text"
          :disabled="isGenerating"
          placeholder="例如：一个傲娇的赛博朋克黑客少女"
          class="bs-input"
          @keydown.enter.prevent="handleGenerate"
        >
        <button @click="handleGenerate" :disabled="isGenerating || !aiDescription.trim()" class="ai-gen-btn">
          <span v-if="isGenerating" class="ai-gen-spinner"></span>
          <template v-else>
            <IconLine emoji="✨" :size="14" />
            <span>生成</span>
          </template>
        </button>
      </div>
    </div>

    <!-- 角色头像 -->
    <div class="basic-field">
      <label class="bs-label">角色头像</label>
      <div class="flex items-center gap-4">
        <div class="avatar-picker" @click="triggerFilePicker" :class="{ 'opacity-70': isAvatarProcessing }">
          <img v-if="currentRole.avatar" :src="currentRole.avatar" class="w-full h-full object-cover" />
          <div v-else class="avatar-picker-empty">
            <IconLine emoji="🖼️" :size="20" />
            <span>点击上传</span>
          </div>
          <div v-if="isAvatarProcessing" class="avatar-picker-loading">
            <div class="avatar-spinner"></div>
          </div>
        </div>
        <div class="flex-1 space-y-2">
          <input v-model="currentRole.avatar" type="text" placeholder="或粘贴图片 URL..."
                 class="bs-input">
          <div class="flex items-center gap-3">
            <span class="bs-hint">点击头像或粘贴 URL</span>
            <button v-if="currentRole.avatar" @click="clearAvatar" class="bs-danger">清除头像</button>
          </div>
        </div>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelect">
    </div>

    <!-- 角色名称 -->
    <div class="basic-field">
      <label class="bs-label">角色名称</label>
      <input v-model="currentRole.name" type="text" placeholder="例如：温柔姐姐、赛博黑客..."
             class="bs-input">
    </div>

    <!-- 角色性格与背景 -->
    <div class="basic-field">
      <div class="bs-label-row">
        <label class="bs-label">角色性格与背景</label>
        <div class="tooltip-trigger">
          <span class="bs-help">?</span>
          <div class="tooltip-content">定义角色的核心人格：TA 是谁？性格如何？有什么特点？</div>
        </div>
      </div>
      <textarea v-model="currentRole.systemPrompt" rows="5"
                placeholder="例如：你是一个来自2077年的赛博黑客，性格酷炫，说话简短有力..."
                class="bs-textarea"></textarea>
    </div>

    <!-- 对话示例 -->
    <div class="basic-field">
      <div class="bs-label-row">
        <label class="bs-label">对话示例</label>
        <div class="tooltip-trigger">
          <span class="bs-help">?</span>
          <div class="tooltip-content">直接粘贴 1-3 段对话示例，格式自由。AI 会模仿这些示例的语调和说话风格来回复。✨ AI 一键生成时会自动补全此字段。</div>
        </div>
      </div>
      <textarea v-model="currentRole.mesExample" rows="4"
                placeholder="我：*轻轻推了推她的肩膀*&#10;角色：*猛地抬头，眼眶有些红* 「……你干嘛突然吓我」&#10;&#10;我：算了，走吧。&#10;角色：*跟上来，保持着半步的距离* 「去哪？」"
                class="bs-textarea"></textarea>
      <p class="bs-hint">直接粘贴对话内容即可，格式自由，空行分隔不同段落</p>
    </div>

    <!-- 补充指令 / 作者备注 -->
    <div class="basic-field">
      <div class="bs-label-row">
        <label class="bs-label">补充指令 / 作者备注</label>
        <div class="tooltip-trigger">
          <span class="bs-help">?</span>
          <div class="tooltip-content">每轮对话末尾都会注入，承载绝对不能被 AI 遗忘的底层铁律。字数越精简越有效。✨ AI 一键生成时会自动补全。</div>
        </div>
      </div>
      <textarea v-model="currentRole.authorNote" rows="3"
                placeholder="例如：禁止主动提出分别；战斗场景必须描写实际伤亡；永远不主动提及过去的恋情。"
                class="bs-textarea"></textarea>
      <p class="bs-hint">此处内容以最高优先级注入每轮对话末尾，用于不可妥协的行为约束</p>
    </div>

    <!-- 开场白 -->
    <div class="basic-field">
      <div class="bs-label-row">
        <label class="bs-label">开场白</label>
        <div class="tooltip-trigger">
          <span class="bs-help">?</span>
          <div class="tooltip-content">角色说的第一句话，用于开启对话</div>
        </div>
      </div>
      <textarea v-model="currentRole.firstMessage" rows="2"
                placeholder="例如：你好，旅行者。在这个数字世界里，没有什么是我无法破解的..."
                class="bs-textarea"></textarea>
    </div>

    <!-- 写作风格 -->
    <div class="basic-field">
      <div class="bs-label-row">
        <label class="bs-label">写作风格</label>
        <div class="tooltip-trigger">
          <span class="bs-help">?</span>
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
      <p v-if="currentRole.writingStyle" class="bs-hint mt-1.5">
        {{ WRITING_STYLE_PRESETS.find(s => s.id === currentRole.writingStyle)?.description }}
      </p>
    </div>

    <!-- 引导提示 -->
    <div v-if="!currentRole.systemPrompt?.trim()" class="bs-empty-hint">
      <p class="text-xs">不知道怎么填？试试最上方的「AI 一键生成」</p>
    </div>
  </section>
</template>

<style scoped>
.basic-settings {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.bs-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 22px;
}
.bs-title {
  font-family: var(--font-serif-sc);
  font-size: 21px; font-weight: 600; letter-spacing: .03em;
  color: var(--ink); margin: 0;
}
.bs-badge {
  margin-left: auto;
  font-size: 11.5px; padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--paper-warm);
  color: var(--ink-faint); letter-spacing: .02em;
}

.bs-label {
  display: block;
  font-size: 12px; font-weight: 500; color: var(--ink-light);
  letter-spacing: .01em; margin-bottom: 8px;
}
.bs-label-row { display: flex; align-items: center; gap: 8px; }
.bs-label-row .bs-label { margin-bottom: 8px; }
.bs-label-row .tooltip-trigger { margin-left: auto; margin-bottom: 8px; }
.bs-hint { font-size: 11px; color: var(--ink-faint); line-height: 1.5; margin-top: 6px; }
.bs-danger {
  margin-left: auto; font-size: 11.5px; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 0;
}
.bs-danger:hover { color: var(--accent-strong); text-decoration: underline; }
.bs-help {
  width: 16px; height: 16px; display: grid; place-items: center;
  border-radius: 50%; border: 1px solid var(--border);
  font-size: 10px; color: var(--ink-faint); cursor: help;
  transition: all .18s ease;
}
.bs-help:hover { border-color: var(--accent); color: var(--accent); }

.bs-input, .bs-textarea {
  width: 100%;
  padding: 11px 13px;
  font: inherit; font-size: 13.5px; line-height: 1.65;
  color: var(--ink);
  background: var(--paper-warm);
  border: 1px solid var(--border);
  border-radius: 11px;
  outline: none;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.bs-textarea { resize: vertical; min-height: 76px; }
.bs-input::placeholder, .bs-textarea::placeholder { color: var(--ink-faint); }
.bs-input:hover, .bs-textarea:hover { border-color: var(--border-strong); }
.bs-input:focus, .bs-textarea:focus {
  background: var(--paper-card);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.bs-input:disabled { opacity: .55; }

.basic-field {
  padding: 18px 0;
  border-top: 1px solid var(--border);
}
.basic-field:first-of-type { border-top: none; padding-top: 0; }
/* 聚焦时只让标签变色，不改变整块底色——保持「分隔线」而非「卡片」的观感 */
.basic-field:focus-within .bs-label { color: var(--accent); }

/* 头像选择器 */
.avatar-picker {
  width: 76px; height: 76px;
  border-radius: 20px;
  border: 1px dashed var(--border-strong);
  cursor: pointer; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative;
  transition: all 0.2s ease;
  background: var(--paper-warm);
}
.avatar-picker:hover { border-color: var(--accent); background: var(--accent-soft); }
.avatar-picker:active { transform: scale(0.97); }
.avatar-picker-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; font-size: 10px; color: var(--ink-faint);
}
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
  background: var(--paper-card);
  border: 1px solid var(--border); border-radius: 10px;
  font-size: 0.75rem; color: var(--ink-light); line-height: 1.6;
  box-shadow: 0 8px 24px -10px var(--shadow-lg); z-index: 100;
  opacity: 0; visibility: hidden; transform: translateY(-4px);
  transition: all 0.2s ease; pointer-events: none;
}
.tooltip-trigger:hover .tooltip-content { opacity: 1; visibility: visible; transform: translateY(0); }

/* AI 生成卡 */
.ai-gen-card {
  padding: 16px;
  margin-bottom: 4px;
  background: linear-gradient(180deg, var(--accent-soft), transparent 92%);
  border: 1px dashed color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 14px;
  transition: border-color .2s ease;
}
.ai-gen-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.ai-gen-head { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; }
.ai-gen-icon { color: var(--accent); }
.ai-gen-label {
  font-size: 12.5px; font-weight: 600; color: var(--ink);
  letter-spacing: .01em;
}
.ai-gen-desc { font-size: 11px; color: var(--ink-faint); margin-left: auto; }
.ai-gen-row { display: flex; gap: 9px; }
.ai-gen-row .bs-input { flex: 1; background: var(--paper-card); }
.ai-gen-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 40px; padding: 0 16px;
  background: var(--accent); color: #fff;
  border: none; border-radius: 11px;
  font-family: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  box-shadow: 0 8px 18px -10px var(--accent);
  transition: all 0.18s ease;
}
[data-theme="dark"] .ai-gen-btn { color: #17120f; }
.ai-gen-btn:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
.ai-gen-btn:active:not(:disabled) { transform: translateY(0) scale(.985); }
.ai-gen-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.ai-gen-spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: currentColor;
  border-radius: 50%; animation: spin 0.7s linear infinite;
}
@media (max-width: 640px) {
  .ai-gen-desc { display: none; }
  .ai-gen-row { flex-direction: column; }
  .ai-gen-row .bs-input { width: 100%; }
}

/* 写作风格 */
.writing-style-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.writing-style-option {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--paper-card);
  color: var(--ink-light); font-family: inherit; font-size: 12.5px;
  cursor: pointer; transition: all 0.18s ease; white-space: nowrap;
}
.writing-style-option:hover { border-color: var(--border-strong); color: var(--ink); }
.writing-style-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.ws-icon { font-size: 0.9rem; line-height: 1; }
.ws-label { font-weight: 500; }

.bs-empty-hint {
  padding: 14px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--ink-faint);
  margin-top: 6px;
}
</style>
