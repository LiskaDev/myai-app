<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAppState } from '../composables/useAppState';
import AvatarCropper from './AvatarCropper.vue';
import RoleBasicSettings from './settings/RoleBasicSettings.vue';
import CharacterDepthSettings from './settings/CharacterDepthSettings.vue';
import MemoryManager from './settings/MemoryManager.vue';
import UserPersonaSettings from './settings/UserPersonaSettings.vue';
import WorldBookSettings from './settings/WorldBookSettings.vue';

// ===== 通用设置所需的模型列表 =====
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
  { group: '🌐 OpenRouter · Google', models: [
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: '顶配推理，百万上下文' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '速度与质量均衡' },
    { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', desc: '最新旗舰预览版' },
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', desc: '极速轻量预览版' },
  ]},
  { group: '🌐 OpenRouter · Anthropic', models: [
    { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', desc: '顶配智能，旗舰级创作' },
    { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', desc: '强大均衡，推荐首选' },
    { value: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', desc: '延伸思考，深度推理' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', desc: '经典高质量，稳定可靠' },
    { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', desc: '极速轻量，最高性价比' },
  ]},
];

const props = defineProps({
  globalSettings: Object,
  currentRole: Object,
  availableVoices: Array,
  roleList: Array,
  importJson: String,
  memoryEditState: Object,
  isGroupMode: Boolean,
  currentGroup: Object,
  participants: Array,
  initialTab: String,
  promptPreviewData: Array,
});

const emit = defineEmits([
  'close',
  'save-data',
  'load-data',
  'export-data',
  'import-data',
  'show-import-modal',
  'clear-all-data',
  'add-manual-memory',
  'remove-manual-memory',
  'start-edit-memory',
  'save-edit-memory',
  'cancel-edit-memory',
  'toggle-memory-expand',
  'refine-memory',
  'show-toast',
  'request-prompt-preview'
]);

// ===== 通用设置的状态 =====
const appState = useAppState();
const storageUsage = computed(() => appState.storageUsage);
const storageColor = computed(() => {
  if (storageUsage.value.percent >= 80) return 'red';
  if (storageUsage.value.percent >= 60) return 'yellow';
  return 'green';
});
const useCustomModel = ref(false);
const useCustomBaseUrl = ref(false);

// ===== 模型选择器下拉状态 =====
const modelPickerOpen = ref(false);
const bgModelPickerOpen = ref(false);
const modelPickerRef = ref(null);
const bgModelPickerRef = ref(null);

function modelLabel(value) {
  if (!value) return '🔄 跟随主模型';
  for (const g of MODEL_PRESETS) {
    for (const m of g.models) {
      if (m.value === value) return m.label;
    }
  }
  return value;
}

function handleDocClick(e) {
  if (modelPickerRef.value && !modelPickerRef.value.contains(e.target)) {
    modelPickerOpen.value = false;
  }
  if (bgModelPickerRef.value && !bgModelPickerRef.value.contains(e.target)) {
    bgModelPickerOpen.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', handleDocClick, true);
  if (props.appState && typeof props.appState.refreshStorageUsage === 'function') {
    props.appState.refreshStorageUsage();
  }
});
onBeforeUnmount(() => document.removeEventListener('click', handleDocClick, true));

// 用户头像
const userFileInputRef = ref(null);
const isUserAvatarProcessing = ref(false);
const userCropperSrc = ref(null);
function triggerUserFilePicker() { userFileInputRef.value?.click(); }
async function handleUserFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { emit('show-toast', '图片不能超过 10MB', 'error'); return; }
  isUserAvatarProcessing.value = true;
  try {
    userCropperSrc.value = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('读取失败'));
      reader.readAsDataURL(file);
    });
  } catch (err) {
    emit('show-toast', '图片读取失败: ' + err.message, 'error');
  } finally {
    isUserAvatarProcessing.value = false;
    event.target.value = '';
  }
}
function onUserCropConfirm(dataUrl) { props.globalSettings.userAvatar = dataUrl; userCropperSrc.value = null; emit('show-toast', '头像已更新 ✓', 'success'); }
function onUserCropCancel() { userCropperSrc.value = null; }
function clearUserAvatar() { props.globalSettings.userAvatar = ''; }

// ===== 顶部 Tab =====
const TABS = props.isGroupMode
  ? [
      { id: 'general', icon: '⚙️', label: '通用' },
      { id: 'group',   icon: '👥', label: '群聊' },
      { id: 'timeline',icon: '📅', label: '时间线' },
      { id: 'persona', icon: '👤', label: '画像' },
      { id: 'data',    icon: '💾', label: '数据' },
    ]
  : [
      { id: 'role',    icon: '🎭', label: '角色' },
      { id: 'memory',  icon: '🧠', label: '记忆' },
      { id: 'timeline',icon: '📅', label: '时间线' },
      { id: 'persona', icon: '👤', label: '画像' },
      { id: 'general', icon: '⚙️', label: '通用' },
      { id: 'data',    icon: '💾', label: '数据' },
      { id: 'memory-status', icon: '📊', label: '状态' },
      { id: 'prompt-preview', icon: '🔍', label: 'Prompt' },
    ];

// 支持从外部指定初始 Tab（如「去设置」按钮直接跳转到通用 Tab）
const defaultTab = props.isGroupMode ? 'general' : (props.initialTab || 'role');
const activeTab = ref(defaultTab);

// 角色 Tab 的左侧二级导航
const ROLE_SECTIONS = [
  { id: 'basic',    icon: '📋', label: '基础设定' },
  { id: 'depth',    icon: '✨', label: '人设深度' },
  { id: 'worldbook',icon: '📖', label: '世界书' },
];
const activeRoleSection = ref('basic');

// 记忆 Tab 的左侧二级导航
const MEMORY_SECTIONS = [
  { id: 'status',  icon: '💫', label: '角色状态' },
  { id: 'window',  icon: '🪟', label: '记忆窗口' },
  { id: 'card',    icon: '🧠', label: '认知卡' },
  { id: 'chapter', icon: '📖', label: '章节摘要' },
  { id: 'manual',  icon: '📌', label: '永久记忆' },
];
const activeMemorySection = ref('status');

// 通用 Tab 的左侧二级导航
const GENERAL_SECTIONS = [
  { id: 'api',     icon: '🔗', label: 'API 配置' },
  { id: 'display', icon: '🎨', label: '显示与交互' },
  { id: 'advanced',icon: '⚙️', label: '高级设置' },
];
const activeGeneralSection = ref('api');

// 时间线
const timelineSource = computed(() => {
  if (props.isGroupMode) return props.currentGroup?.timeline || [];
  return props.currentRole?.timeline || [];
});

function clearTimelineData() {
  if (props.isGroupMode && props.currentGroup) {
    props.currentGroup.timeline = [];
    props.currentGroup.timelineAnalyzedCount = 0;
  } else if (props.currentRole) {
    props.currentRole.timeline = [];
    // 退回一个触发区间，让下次发消息后很快重新触发分析
    const userMsgCount = (props.currentRole.chatHistory || []).filter(m => m.role === 'user').length;
    props.currentRole.timelineAnalyzedCount = Math.max(0, userMsgCount - 15);
  }
  emit('save-data');
}

function removeTimelineItem(idx) {
  if (props.isGroupMode && props.currentGroup?.timeline) props.currentGroup.timeline.splice(idx, 1);
  else if (props.currentRole?.timeline) props.currentRole.timeline.splice(idx, 1);
}

const editingTimelineIdx = ref(-1);
const editingTimelineText = ref('');

function startEditTimeline(idx) {
  editingTimelineIdx.value = idx;
  editingTimelineText.value = timelineSource.value[idx]?.event || '';
}
function saveTimelineEdit() {
  const idx = editingTimelineIdx.value;
  if (idx >= 0 && editingTimelineText.value.trim() && timelineSource.value[idx]) {
    timelineSource.value[idx].event = editingTimelineText.value.trim();
  }
  editingTimelineIdx.value = -1;
  editingTimelineText.value = '';
}
function cancelTimelineEdit() {
  editingTimelineIdx.value = -1;
  editingTimelineText.value = '';
}

// 点击遮罩关闭
function handleOverlayClick(e) {
  if (e.target === e.currentTarget) emit('close');
}

// ===== Spec-01: 记忆状态 Tab =====
function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function memoryStatusIcon(hasData, lastUpdated) {
  if (!hasData) return '⭕';
  if (!lastUpdated) return '✅';
  const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 7 ? '⚠️' : '✅';
}

const memoryStatusCards = computed(() => {
  const role = props.currentRole || {};
  const chapters = role.chapterSummaries || [];
  const card = role.memoryCard || {};
  const timeline = role.timeline || [];
  const vectors = role.vectorMemories || [];

  // 用户画像
  let persona = null;
  try { persona = JSON.parse(localStorage.getItem('myai_user_persona_v1') || 'null'); } catch {}
  const personaTraits = persona?.traits || [];

  return [
    {
      icon: '📚', label: '章节摘要',
      status: chapters.length > 0
        ? `共 ${chapters.length} 章 · 最近归档：${formatTime(chapters.slice(-1)[0]?.createdAt)}`
        : '暂无归档',
      statusIcon: memoryStatusIcon(chapters.length > 0, chapters.slice(-1)[0]?.createdAt),
    },
    {
      icon: '🧠', label: '认知卡',
      status: (card.keyEvents?.length > 0 || card.userProfile)
        ? `已记录 ${card.keyEvents?.length || 0} 条关键事件 · 更新于 ${formatTime(card.updatedAt)}`
        : '尚未生成',
      statusIcon: memoryStatusIcon(card.keyEvents?.length > 0 || !!card.userProfile, card.updatedAt),
    },
    {
      icon: '📅', label: '时间线',
      status: timeline.length > 0
        ? `共 ${timeline.length} 条事件 · 已分析 ${role.timelineAnalyzedCount || 0} 条消息`
        : '尚未生成',
      statusIcon: memoryStatusIcon(timeline.length > 0, timeline.slice(-1)[0]?.timestamp),
    },
    {
      icon: '💾', label: '关键词记忆',
      status: vectors.length > 0
        ? `共 ${vectors.length} 条关键词记忆`
        : '尚未生成',
      statusIcon: memoryStatusIcon(vectors.length > 0, null),
    },
    {
      icon: '👤', label: '用户画像',
      status: personaTraits.length > 0
        ? `共 ${personaTraits.length} 条用户特征 · 分析于 ${formatTime(persona?.lastAnalyzedAt)}`
        : '尚未分析',
      statusIcon: memoryStatusIcon(personaTraits.length > 0, persona?.lastAnalyzedAt),
    },
  ];
});

// ===== Spec-02: Prompt 预览 =====
const promptExpandedMap = ref({});
const isPromptLoading = ref(false);

function togglePromptBlock(idx) {
  promptExpandedMap.value[idx] = !promptExpandedMap.value[idx];
}

function requestPromptPreview() {
  isPromptLoading.value = true;
  promptExpandedMap.value = {};
  emit('request-prompt-preview');
  // 等 props.promptPreviewData 被父组件更新后自动渲染
  setTimeout(() => { isPromptLoading.value = false; }, 500);
}

function promptRoleTag(role) {
  if (role === 'system') return { label: 'system', cls: 'prompt-tag-system' };
  if (role === 'user') return { label: 'user', cls: 'prompt-tag-user' };
  return { label: 'assistant', cls: 'prompt-tag-assistant' };
}

const promptTokenEstimate = computed(() => {
  if (!props.promptPreviewData?.length) return null;
  const totalChars = props.promptPreviewData.reduce((s, m) => s + (m.content?.length || 0), 0);
  return { count: props.promptPreviewData.length, tokens: Math.round(totalChars / 2) };
});
</script>

<template>
  <!-- 遮罩层 -->
  <div class="modal-overlay" @click="handleOverlayClick">
    <!-- 弹窗主体 -->
    <div class="modal-container">

      <!-- 弹窗头部 -->
      <header class="modal-header">
        <span class="modal-title">⚙️ 设置</span>
        <div class="modal-header-right">
          <span class="modal-save-hint">修改自动生效，无需手动保存</span>
          <button @click="$emit('close')" class="modal-close-btn">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Tab 栏 -->
      <nav class="modal-tabs">
        <button v-for="tab in TABS" :key="tab.id"
                class="modal-tab" :class="{ active: activeTab === tab.id }"
                @click="activeTab = tab.id">
          <span class="modal-tab-icon">{{ tab.icon }}</span>
          <span class="modal-tab-label">{{ tab.label }}</span>
        </button>
      </nav>

      <!-- 内容区：左侧导航 + 右侧内容 -->
      <div class="modal-body">

        <!-- ===== 角色 Tab ===== -->
        <template v-if="activeTab === 'role' && !isGroupMode">
          <!-- 左侧导航 -->
          <aside class="modal-sidebar">
            <p class="sidebar-section-label">角色设定</p>
            <button v-for="s in ROLE_SECTIONS" :key="s.id"
                    class="sidebar-item" :class="{ active: activeRoleSection === s.id }"
                    @click="activeRoleSection = s.id">
              <span class="sidebar-item-icon">{{ s.icon }}</span>
              {{ s.label }}
            </button>
            <p class="sidebar-section-label" style="margin-top:16px">参数</p>
            <button class="sidebar-item" :class="{ active: activeRoleSection === 'params' }"
                    @click="activeRoleSection = 'params'">
              <span class="sidebar-item-icon">🎛️</span> 高级参数
            </button>
          </aside>
          <!-- 右侧内容 -->
          <div class="modal-content">
            <RoleBasicSettings v-if="activeRoleSection === 'basic'"
              :currentRole="currentRole" :globalSettings="globalSettings"
              @show-toast="(msg, type) => emit('show-toast', msg, type)" />
            <CharacterDepthSettings v-else-if="activeRoleSection === 'depth'"
              :currentRole="currentRole" />
            <WorldBookSettings v-else-if="activeRoleSection === 'worldbook'"
              :currentRole="currentRole" :globalSettings="globalSettings"
              @show-toast="(msg, type) => emit('show-toast', msg, type)" />
            <div v-else-if="activeRoleSection === 'params'" class="params-section">
              <!-- 高级参数直接在这里展开，不折叠 -->
              <div class="section-title">🎛️ 高级参数调节</div>
              <p class="section-desc">以下参数调节 AI 的回复特性，不熟悉可保持默认</p>

              <div class="param-item">
                <div class="param-header">
                  <div>
                    <div class="param-name">🎲 创意程度</div>
                    <div class="param-desc">越高 AI 回复越有创意，越低越稳定保守</div>
                  </div>
                  <span class="param-value">{{ (currentRole.temperature ?? 1.0).toFixed(1) }}</span>
                </div>
                <input v-model.number="currentRole.temperature" type="range" min="0" max="2" step="0.1" class="param-slider">
                <div class="param-scale"><span>0 · 保守</span><span>1 · 均衡</span><span>2 · 天马行空</span></div>
              </div>

              <div class="param-item">
                <div class="param-header">
                  <div>
                    <div class="param-name">🌈 词汇多样性</div>
                    <div class="param-desc">控制 AI 每次选词的范围，越高用词越丰富多变</div>
                  </div>
                  <span class="param-value">{{ (currentRole.topP ?? 1.0).toFixed(2) }}</span>
                </div>
                <input v-model.number="currentRole.topP" type="range" min="0" max="1" step="0.05" class="param-slider">
                <div class="param-scale"><span>0 · 单一</span><span>1 · 丰富</span></div>
              </div>

              <div class="param-item">
                <div class="param-header">
                  <div>
                    <div class="param-name">📏 单次最大字数</div>
                    <div class="param-desc">限制 AI 每次回复的最大长度，0 表示不限制</div>
                  </div>
                  <span class="param-value">{{ currentRole.maxTokens || '不限' }}</span>
                </div>
                <input v-model.number="currentRole.maxTokens" type="range" min="0" max="4096" step="128" class="param-slider">
                <div class="param-scale"><span>0 · 不限</span><span>4096 · 最大</span></div>
              </div>

              <div class="param-item">
                <div class="param-header">
                  <div>
                    <div class="param-name">🔁 重复惩罚</div>
                    <div class="param-desc">越高 AI 越不会重复使用同样的词句</div>
                  </div>
                  <span class="param-value">{{ (currentRole.frequencyPenalty ?? 0).toFixed(1) }}</span>
                </div>
                <input v-model.number="currentRole.frequencyPenalty" type="range" min="0" max="2" step="0.1" class="param-slider">
                <div class="param-scale"><span>0 · 允许重复</span><span>2 · 严格避免</span></div>
              </div>

              <div class="param-item">
                <div class="param-header">
                  <div>
                    <div class="param-name">🔊 语音声线</div>
                    <div class="param-desc">与此角色对话时使用的 TTS 声音</div>
                  </div>
                </div>
                <select v-model="currentRole.ttsVoice" class="param-select">
                  <option value="">使用系统默认声音</option>
                  <option v-for="voice in availableVoices" :key="voice.name" :value="voice.name">
                    {{ voice.name }} ({{ voice.lang }})
                  </option>
                </select>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== 记忆 Tab ===== -->
        <template v-else-if="activeTab === 'memory' && !isGroupMode">
          <aside class="modal-sidebar">
            <p class="sidebar-section-label">记忆</p>
            <button v-for="s in MEMORY_SECTIONS" :key="s.id"
                    class="sidebar-item" :class="{ active: activeMemorySection === s.id }"
                    @click="activeMemorySection = s.id">
              <span class="sidebar-item-icon">{{ s.icon }}</span>
              {{ s.label }}
            </button>
          </aside>
          <div class="modal-content">
            <!-- 角色状态 -->
            <div v-if="activeMemorySection === 'status'" class="space-y-4">
              <div class="section-title">💫 与角色的当前状态</div>
              <p class="section-desc">AI 自动感知，每 20 条消息更新一次</p>
              <div class="status-grid">
                <div class="status-card">
                  <div class="status-card-label">情绪</div>
                  <div class="status-card-value" :class="currentRole.currentEmotion ? 'text-gray-200' : 'italic text-gray-600'">
                    {{ currentRole.currentEmotion || '尚未感知' }}
                  </div>
                </div>
                <div class="status-card">
                  <div class="status-card-label">关系阶段</div>
                  <div class="status-card-value" :class="currentRole.relationshipStage ? 'text-gray-200' : 'italic text-gray-600'">
                    {{ currentRole.relationshipStage || '尚未感知' }}
                  </div>
                </div>
                <div class="status-card" style="grid-column: span 2">
                  <div class="status-card-label">记住的事</div>
                  <div class="status-card-value" :class="currentRole.keyMoments?.length ? 'text-gray-200' : 'italic text-gray-600'">
                    {{ currentRole.keyMoments?.length ? currentRole.keyMoments.slice(-1)[0].text : '尚未感知' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 记忆窗口 -->
            <div v-else-if="activeMemorySection === 'window'" class="space-y-4">
              <div class="section-title">🪟 记忆窗口大小</div>
              <p class="section-desc">控制 AI 能记住的最近对话轮数，越大记忆越长，消耗 Token 越多</p>
              <div class="param-item">
                <div class="param-header">
                  <div class="param-name">窗口大小</div>
                  <span class="param-value">{{ currentRole.memoryWindow || 15 }} 轮</span>
                </div>
                <input v-model.number="currentRole.memoryWindow" type="range" min="5" max="30" step="1" class="param-slider">
                <div class="param-scale"><span>5轮 · 省 Token</span><span>30轮 · 长记忆</span></div>
              </div>
            </div>

            <!-- 认知卡 -->
            <div v-else-if="activeMemorySection === 'card'" class="space-y-4">
              <div class="section-title">🧠 认知卡 <span class="badge-auto">AI 自动维护</span></div>
              <p class="section-desc">AI 自动分析对话，建立对你的认知画像，通常需要 15 轮以上对话后开始生成</p>
              <template v-if="currentRole.memoryCard && (currentRole.memoryCard.userProfile || (currentRole.memoryCard.keyEvents || []).length > 0)">
                <div class="text-[10px] text-gray-500">上次更新：{{ currentRole.memoryCard.updatedAt ? new Date(currentRole.memoryCard.updatedAt).toLocaleString('zh-CN') : '未更新' }}</div>
                <div class="space-y-2">
                  <div v-if="currentRole.memoryCard.userProfile" class="card-field">
                    <span class="card-label">👤 用户画像</span>
                    <span class="card-value">{{ currentRole.memoryCard.userProfile }}</span>
                  </div>
                  <div v-if="currentRole.memoryCard.relationshipStage" class="card-field">
                    <span class="card-label">💕 关系阶段</span>
                    <span class="card-value">{{ currentRole.memoryCard.relationshipStage }}</span>
                  </div>
                  <div v-if="currentRole.memoryCard.emotionalState" class="card-field">
                    <span class="card-label">😊 情绪状态</span>
                    <span class="card-value">{{ currentRole.memoryCard.emotionalState }}</span>
                  </div>
                  <div v-if="(currentRole.memoryCard.keyEvents || []).length > 0" class="card-field">
                    <span class="card-label">⚡ 重大事件</span>
                    <ul class="card-events">
                      <li v-for="(evt, i) in currentRole.memoryCard.keyEvents" :key="i">{{ evt }}</li>
                    </ul>
                  </div>
                  <div v-if="currentRole.memoryCard.lastTone" class="card-field">
                    <span class="card-label">🎵 近期基调</span>
                    <span class="card-value">{{ currentRole.memoryCard.lastTone }}</span>
                  </div>
                </div>
              </template>
              <div v-else class="empty-state">
                <div class="empty-state-icon">🧠</div>
                <div class="empty-state-text">尚未生成认知卡</div>
                <div class="empty-state-hint">继续对话，AI 会自动分析建立认知</div>
              </div>
            </div>

            <!-- 章节摘要 -->
            <div v-else-if="activeMemorySection === 'chapter'" class="space-y-4">
              <div class="section-title">📖 剧情章节
                <span v-if="(currentRole.chapterSummaries || []).length" class="badge-count">{{ currentRole.chapterSummaries.length }} 章</span>
              </div>
              <p class="section-desc">对话超出记忆窗口后自动归档，每 15 条消息生成一章</p>
              <template v-if="(currentRole.chapterSummaries || []).length > 0">
                <div class="space-y-2">
                  <div v-for="(ch, i) in currentRole.chapterSummaries" :key="i" class="chapter-item">
                    <div class="chapter-header">
                      <span :class="ch.isCondensed ? 'text-purple-400' : 'text-emerald-400'">
                        {{ ch.isCondensed ? '🏛️ 远古回忆' : `📖 第${ch.chapterIndex}章` }}
                      </span>
                      <div class="flex items-center gap-2">
                        <span class="chapter-meta">{{ ch.messageCount }} 条消息</span>
                        <button @click="currentRole.chapterSummaries.splice(i, 1); emit('save-data')"
                                class="chapter-del-btn" title="删除此章节">✕</button>
                      </div>
                    </div>
                    <p class="chapter-body">{{ ch.summary }}</p>
                  </div>
                </div>
              </template>
              <div v-else class="empty-state">
                <div class="empty-state-icon">📖</div>
                <div class="empty-state-text">还没有章节摘要</div>
                <div class="empty-state-hint">对话足够长后会自动生成</div>
              </div>
            </div>

            <!-- 永久记忆 -->
            <div v-else-if="activeMemorySection === 'manual'" class="space-y-4">
              <div class="section-title">📌 永久记忆
                <span class="badge-count">{{ (currentRole.manualMemories || []).length }} 条</span>
              </div>
              <p class="section-desc">手动钉选的重要内容，AI 始终记得</p>
              <button @click="$emit('add-manual-memory')" class="add-memory-btn">➕ 新增自定义记忆</button>
              <div v-if="(currentRole.manualMemories || []).length > 0" class="space-y-3">
                <div v-for="(memory, mIndex) in currentRole.manualMemories" :key="mIndex" class="memory-item">
                  <template v-if="memoryEditState.editingIndex !== mIndex">
                    <div class="flex items-start gap-2">
                      <span class="flex-shrink-0 mt-0.5">{{ memory.role === 'user' ? '👤' : (memory.isCustom ? '📝' : '🎭') }}</span>
                      <div class="flex-1 min-w-0" @click="$emit('toggle-memory-expand', mIndex)">
                        <p class="text-gray-300 text-xs leading-relaxed"
                           :class="{ 'line-clamp-2': memoryEditState.expandedIndex !== mIndex }">
                          {{ memory.content || '(空记忆)' }}
                        </p>
                      </div>
                    </div>
                    <div class="memory-actions">
                      <button @click="$emit('refine-memory', mIndex)" class="mem-btn refine"
                              :disabled="memoryEditState.refiningIndex === mIndex || !memory.content">
                        <span :class="{ 'spinning': memoryEditState.refiningIndex === mIndex }">🪄</span>
                        {{ memoryEditState.refiningIndex === mIndex ? '精简中...' : '精简' }}
                      </button>
                      <button @click="$emit('start-edit-memory', mIndex)" class="mem-btn edit">✏️ 编辑</button>
                      <button @click="$emit('remove-manual-memory', mIndex)" class="mem-btn delete ml-auto">🗑️</button>
                    </div>
                  </template>
                  <template v-else>
                    <textarea v-model="memoryEditState.editContent" class="memory-edit-textarea" rows="3"
                              placeholder="输入记忆内容"></textarea>
                    <div class="flex gap-2 mt-2">
                      <button @click="$emit('save-edit-memory', mIndex)" class="mem-btn save">✅ 保存</button>
                      <button @click="$emit('cancel-edit-memory')" class="mem-btn cancel">❌ 取消</button>
                    </div>
                  </template>
                </div>
              </div>
              <div v-else class="empty-state">
                <div class="empty-state-icon">📌</div>
                <div class="empty-state-text">暂无永久记忆</div>
                <div class="empty-state-hint">点击消息旁的 📌 按钮添加，或使用上方按钮创建</div>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== 时间线 Tab ===== -->
        <template v-else-if="activeTab === 'timeline'">
          <div class="modal-content-full">
            <div class="timeline-layout">
              <!-- 左：事件列表 -->
              <div class="timeline-list">
                <div class="flex items-center justify-between mb-3">
                  <div class="section-title" style="margin:0">
                    📅 剧情时间线
                    <span v-if="timelineSource?.length" class="badge-count">{{ timelineSource.length }} 条</span>
                  </div>
                  <button v-if="timelineSource?.length" @click="clearTimelineData(); emit('show-toast', '时间线已清空', 'info')"
                          class="text-xs text-red-400/60 hover:text-red-400 transition">清空</button>
                </div>
                <p class="section-desc mb-3">每 15 轮对话后，AI 自动提取关键剧情事件</p>

                <div v-if="timelineSource?.length" class="space-y-2">
                  <div v-for="(event, idx) in timelineSource" :key="idx"
                       class="timeline-item group" :class="{ 'active': editingTimelineIdx === idx }"
                       @click="editingTimelineIdx !== idx && startEditTimeline(idx)">
                    <span class="timeline-icon">{{ event.importance === 'high' ? '⚡' : event.importance === 'medium' ? '📌' : '·' }}</span>
                    <div class="flex-1 min-w-0">
                      <div v-if="editingTimelineIdx !== idx" class="text-sm text-gray-200 leading-relaxed">{{ event.event }}</div>
                      <div v-else class="space-y-2">
                        <textarea v-model="editingTimelineText" class="timeline-edit-input" rows="2"
                                  @keydown.ctrl.enter="saveTimelineEdit" @keydown.esc="cancelTimelineEdit"></textarea>
                        <div class="flex gap-2">
                          <button @click.stop="saveTimelineEdit" class="mem-btn save">保存</button>
                          <button @click.stop="cancelTimelineEdit" class="mem-btn cancel">取消</button>
                        </div>
                      </div>
                      <div v-if="event.timestamp && editingTimelineIdx !== idx" class="text-xs text-gray-600 mt-0.5">
                        {{ new Date(event.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                      </div>
                    </div>
                    <button v-if="editingTimelineIdx !== idx" @click.stop="removeTimelineItem(idx)"
                            class="timeline-delete-btn opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                </div>

                <div v-else class="empty-state">
                  <div class="empty-state-icon">📅</div>
                  <div class="empty-state-text">还没有时间线事件</div>
                  <div class="empty-state-hint">多聊几轮后 AI 会自动提取关键剧情</div>
                </div>
              </div>

              <!-- 右：事件详情 -->
              <div class="timeline-detail">
                <div class="section-title" style="margin:0 0 12px">⚡ 事件详情</div>
                <template v-if="editingTimelineIdx >= 0 && timelineSource[editingTimelineIdx]">
                  <div class="timeline-detail-content">
                    <p class="text-sm text-gray-200 leading-relaxed mb-3">{{ timelineSource[editingTimelineIdx].event }}</p>
                    <div v-if="timelineSource[editingTimelineIdx].characters?.length" class="detail-row">
                      <span class="detail-label">关联角色</span>
                      <span class="detail-value">{{ timelineSource[editingTimelineIdx].characters.join('、') }}</span>
                    </div>
                    <div v-if="timelineSource[editingTimelineIdx].impact" class="detail-row">
                      <span class="detail-label">影响</span>
                      <span class="detail-value">{{ timelineSource[editingTimelineIdx].impact }}</span>
                    </div>
                    <div v-if="timelineSource[editingTimelineIdx].timestamp" class="detail-row">
                      <span class="detail-label">时间</span>
                      <span class="detail-value">{{ new Date(timelineSource[editingTimelineIdx].timestamp).toLocaleString('zh-CN') }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="text-gray-600 text-sm italic">点击左侧事件查看详情</div>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== 画像 Tab ===== -->
        <template v-else-if="activeTab === 'persona'">
          <div class="modal-content-full">
            <UserPersonaSettings />
          </div>
        </template>

        <!-- ===== 通用 Tab ===== -->
        <template v-else-if="activeTab === 'general'">
          <!-- 用户头像裁剪器 -->
          <AvatarCropper v-if="userCropperSrc" :image-src="userCropperSrc" @confirm="onUserCropConfirm" @cancel="onUserCropCancel" />
          <input ref="userFileInputRef" type="file" accept="image/*" class="hidden" @change="handleUserFileSelect">

          <aside class="modal-sidebar">
            <p class="sidebar-section-label">设置</p>
            <button v-for="s in GENERAL_SECTIONS" :key="s.id"
                    class="sidebar-item" :class="{ active: activeGeneralSection === s.id }"
                    @click="activeGeneralSection = s.id">
              <span class="sidebar-item-icon">{{ s.icon }}</span>
              {{ s.label }}
            </button>
          </aside>

          <div class="modal-content">

            <!-- ── API 配置 ── -->
            <div v-if="activeGeneralSection === 'api'" class="space-y-5">
              <div class="section-title">🔗 API 配置</div>

              <!-- 存储用量 -->
              <div>
                <div class="flex justify-between text-xs text-gray-400 mb-1">
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
                      <span>{{ item.label }}</span><span>{{ item.sizeKB }} KB</span>
                    </div>
                  </div>
                </details>
              </div>

              <!-- API 平台 -->
              <div class="api-field">
                <div class="api-field-header">
                  <label>🔗 API 平台</label>
                  <button @click="useCustomBaseUrl = !useCustomBaseUrl" class="toggle-mode-btn" :class="{ active: useCustomBaseUrl }">
                    {{ useCustomBaseUrl ? '📋 选预设' : '✏️ 手动输入' }}
                  </button>
                </div>
                <select v-if="!useCustomBaseUrl" v-model="globalSettings.baseUrl" class="api-input">
                  <option value="https://api.deepseek.com">🔥 DeepSeek 官方</option>
                  <option value="https://api.siliconflow.cn/v1">🚀 硅基流动 (SiliconFlow)</option>
                  <option value="https://openrouter.ai/api/v1">🌐 OpenRouter</option>
                </select>
                <input v-else v-model="globalSettings.baseUrl" type="text" placeholder="https://api.example.com/v1" class="api-input">
              </div>

              <!-- API Key -->
              <div class="api-field">
                <div class="api-field-header"><label>API Key</label></div>
                <input v-model="globalSettings.apiKey" type="password" placeholder="sk-..." class="api-input" :class="{ 'border-amber-500/40': !globalSettings.apiKey }">
                <p v-if="!globalSettings.apiKey" class="text-xs text-amber-400 mt-1">⚡ 填入 API Key 后即可开始对话</p>
              </div>

              <!-- 主模型 -->
              <div class="api-field">
                <div class="api-field-header">
                  <label>🧠 主模型</label>
                  <button @click="useCustomModel = !useCustomModel" class="toggle-mode-btn" :class="{ active: useCustomModel }">
                    {{ useCustomModel ? '📋 选预设' : '✏️ 手动输入' }}
                  </button>
                </div>
                <div v-if="!useCustomModel" class="model-picker-wrap" ref="modelPickerRef">
                  <button type="button" class="model-picker-trigger" @click="modelPickerOpen = !modelPickerOpen">
                    <span>{{ modelLabel(globalSettings.model) || '请选择模型…' }}</span>
                    <span class="model-picker-chevron" :class="{ open: modelPickerOpen }">▾</span>
                  </button>
                  <div v-show="modelPickerOpen" class="model-picker">
                    <template v-for="group in MODEL_PRESETS" :key="group.group">
                      <div class="model-picker-group">{{ group.group }}</div>
                      <div v-for="m in group.models" :key="m.value"
                           class="model-picker-item"
                           :class="{ active: globalSettings.model === m.value }"
                           @click="globalSettings.model = m.value; modelPickerOpen = false">
                        <span class="model-picker-label">{{ m.label }}</span>
                        <span class="model-picker-desc">{{ m.desc }}</span>
                      </div>
                    </template>
                  </div>
                </div>
                <input v-else v-model="globalSettings.model" type="text" placeholder="输入模型 ID" class="api-input">
                <p class="text-xs text-gray-500 mt-1">当前：{{ globalSettings.model || '未设置' }}</p>
                <details class="mt-1">
                  <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-400 select-none">🔑 哪个平台用哪个 Key？</summary>
                  <div class="mt-2 space-y-1.5 pl-3 border-l-2 border-white/8 text-xs text-gray-400 leading-relaxed">
                    <div><span class="text-gray-300">🔥 DeepSeek 官方</span> → <a href="https://platform.deepseek.com" target="_blank" class="text-indigo-400 hover:underline">platform.deepseek.com</a></div>
                    <div><span class="text-gray-300">🚀 硅基流动</span>（Qwen / DeepSeek / Kimi / GLM）→ <a href="https://cloud.siliconflow.cn" target="_blank" class="text-indigo-400 hover:underline">cloud.siliconflow.cn</a></div>
                    <div><span class="text-gray-300">🌐 OpenRouter</span>（Claude / Gemini / GPT）→ <a href="https://openrouter.ai/keys" target="_blank" class="text-indigo-400 hover:underline">openrouter.ai</a></div>
                    <div class="text-gray-500">💡 平台和 Key 要配套，混用会报 401</div>
                  </div>
                </details>
              </div>

              <!-- 后台模型 -->
              <div class="api-field">
                <div class="api-field-header">
                  <label>⚙️ 后台分析模型 <span class="text-gray-600 font-normal">（摘要/记忆/画像用）</span></label>
                </div>
                <div class="model-picker-wrap" ref="bgModelPickerRef">
                  <button type="button" class="model-picker-trigger" @click="bgModelPickerOpen = !bgModelPickerOpen">
                    <span>{{ modelLabel(globalSettings.bgModel) }}</span>
                    <span class="model-picker-chevron" :class="{ open: bgModelPickerOpen }">▾</span>
                  </button>
                  <div v-show="bgModelPickerOpen" class="model-picker">
                    <div class="model-picker-item"
                         :class="{ active: !globalSettings.bgModel }"
                         @click="globalSettings.bgModel = ''; bgModelPickerOpen = false">
                      <span class="model-picker-label">🔄 跟随主模型</span>
                      <span class="model-picker-desc">使用主模型配置</span>
                    </div>
                    <template v-for="group in MODEL_PRESETS" :key="'bg-'+group.group">
                      <div class="model-picker-group">{{ group.group }}</div>
                      <div v-for="m in group.models" :key="'bg-'+m.value"
                           class="model-picker-item"
                           :class="{ active: globalSettings.bgModel === m.value }"
                           @click="globalSettings.bgModel = m.value; bgModelPickerOpen = false">
                        <span class="model-picker-label">{{ m.label }}</span>
                        <span class="model-picker-desc">{{ m.desc }}</span>
                      </div>
                    </template>
                  </div>
                </div>
                <template v-if="globalSettings.bgModel">
                  <div class="pl-3 border-l-2 border-white/10 mt-2 space-y-2">
                    <div>
                      <label class="block text-xs text-gray-400 mb-1">后台 API 平台 <span class="text-gray-600">（留空跟随主设置）</span></label>
                      <select v-model="globalSettings.bgBaseUrl" class="api-input text-sm">
                        <option value="">🔄 跟随主设置</option>
                        <option value="https://api.deepseek.com">🔥 DeepSeek 官方</option>
                        <option value="https://api.siliconflow.cn/v1">🚀 硅基流动</option>
                        <option value="https://openrouter.ai/api/v1">🌐 OpenRouter</option>
                      </select>
                    </div>
                    <div v-if="globalSettings.bgBaseUrl">
                      <label class="block text-xs text-gray-400 mb-1">后台 API Key <span class="text-gray-600">（留空跟随主设置）</span></label>
                      <input v-model="globalSettings.bgApiKey" type="password" placeholder="留空则使用主 API Key" class="api-input text-sm">
                    </div>
                  </div>
                </template>
                <p class="text-xs text-gray-500 mt-1">{{ globalSettings.bgModel ? '后台任务使用独立模型配置' : '后台任务跟随主模型' }}</p>
              </div>
            </div>

            <!-- ── 显示与交互 ── -->
            <div v-else-if="activeGeneralSection === 'display'" class="space-y-5">
              <div class="section-title">🎨 显示与交互</div>

              <!-- 用户头像 -->
              <div>
                <label class="block text-sm text-gray-300 mb-2">👤 用户头像</label>
                <div class="flex items-center gap-4">
                  <div class="avatar-picker-sm" @click="triggerUserFilePicker">
                    <img v-if="globalSettings.userAvatar" :src="globalSettings.userAvatar" class="w-full h-full object-cover rounded-full" />
                    <div v-else class="flex flex-col items-center justify-content-center gap-1">
                      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      <span class="text-[10px] text-gray-500">上传</span>
                    </div>
                  </div>
                  <div class="flex-1 space-y-1.5">
                    <input v-model="globalSettings.userAvatar" type="text" placeholder="或粘贴图片 URL..." class="api-input text-sm">
                    <button v-if="globalSettings.userAvatar" @click="clearUserAvatar" class="text-xs text-red-400 hover:text-red-300 transition">清除头像</button>
                  </div>
                </div>
              </div>

              <!-- 输出长度 -->
              <div>
                <label class="block text-sm text-gray-300 mb-1.5">📝 输出长度偏好</label>
                <select v-model="globalSettings.responseLength" class="api-input">
                  <option value="auto">自动（AI 自行决定）</option>
                  <option value="short">简短（日常对话 50-150字）</option>
                  <option value="normal">标准（均衡模式 200-400字）</option>
                  <option value="long">详述（沉浸小说 400+字）</option>
                </select>
              </div>

              <!-- 开关组 -->
              <div class="space-y-1">
                <div class="toggle-row">
                  <div><div class="toggle-label">🔊 自动朗读</div><div class="toggle-desc">AI 回复完成后自动语音朗读</div></div>
                  <div class="toggle-switch" :class="{ active: globalSettings.autoPlayTTS }" @click="globalSettings.autoPlayTTS = !globalSettings.autoPlayTTS"></div>
                </div>
                <div v-if="!globalSettings.soundMuted" class="pl-4 pb-1">
                  <label class="text-xs text-gray-400">音量: {{ Math.round((globalSettings.soundVolume || 0.2) * 100) }}%</label>
                  <input type="range" min="0.05" max="0.5" step="0.05" :value="globalSettings.soundVolume || 0.2" @input="globalSettings.soundVolume = parseFloat($event.target.value)" class="w-full accent-purple-500 mt-1">
                </div>
                <div class="toggle-row">
                  <div><div class="toggle-label">🔧 显示推理过程</div><div class="toggle-desc">显示 DeepSeek R1 的底层思维链 (&lt;think&gt;)</div></div>
                  <div class="toggle-switch" :class="{ active: globalSettings.showLogic }" @click="globalSettings.showLogic = !globalSettings.showLogic"></div>
                </div>
                <div class="toggle-row">
                  <div><div class="toggle-label">💭 显示内心戏</div><div class="toggle-desc">显示角色的潜台词和心理活动 (&lt;inner&gt;)</div></div>
                  <div class="toggle-switch" :class="{ active: globalSettings.showInner }" @click="globalSettings.showInner = !globalSettings.showInner"></div>
                </div>
                <div class="toggle-row">
                  <div><div class="toggle-label">🪙 显示 Token 用量</div><div class="toggle-desc">在每条 AI 回复上显示 Token 用量</div></div>
                  <div class="toggle-switch" :class="{ active: globalSettings.showTokens }" @click="globalSettings.showTokens = !globalSettings.showTokens"></div>
                </div>
              </div>


              <!-- 亮度/深浅/粗细/字号滑块 -->
              <div class="space-y-3">
                <div v-for="slider in [
                  { label: '☀️ 聊天背景亮度', key: 'chatBgBrightness', min: 50, max: 150, step: 5, default: 100, unit: '%', left: '🌙', right: '☀️' },
                  { label: '✍️ 文字深浅',     key: 'chatTextBrightness', min: 50, max: 150, step: 5, default: 100, unit: '%', left: '淡', right: '深' },
                  { label: '𝐁 文字粗细',      key: 'chatFontWeight', min: -2, max: 3, step: 1, default: 0, unit: '', left: '细', right: '粗' },
                  { label: '🔤 字体大小',     key: 'chatFontSize', min: 0.8, max: 1.4, step: 0.05, default: 1.0, unit: '%', left: 'A', right: 'A' },
                ]" :key="slider.key">
                  <div class="flex justify-between items-center mb-0.5">
                    <label class="text-xs text-gray-400">{{ slider.label }}</label>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-gray-500">
                        {{ slider.key === 'chatFontSize'
                          ? Math.round((globalSettings[slider.key] || slider.default) * 100) + '%'
                          : slider.key === 'chatFontWeight'
                            ? ((globalSettings[slider.key] || 0) === 0 ? '默认' : ((globalSettings[slider.key] > 0 ? '+' : '') + globalSettings[slider.key]))
                            : (globalSettings[slider.key] || slider.default) + slider.unit }}
                      </span>
                      <button v-if="(globalSettings[slider.key] || slider.default) !== slider.default"
                              @click="globalSettings[slider.key] = slider.default"
                              class="text-[10px] text-gray-600 hover:text-gray-400 transition">重置</button>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-600">{{ slider.left }}</span>
                    <input type="range" :min="slider.min" :max="slider.max" :step="slider.step"
                           :value="globalSettings[slider.key] || slider.default"
                           @input="globalSettings[slider.key] = slider.key === 'chatFontSize' ? parseFloat($event.target.value) : parseInt($event.target.value)"
                           class="flex-1 accent-purple-500">
                    <span class="text-[10px] text-gray-600" :class="{ 'font-bold': slider.key === 'chatFontWeight' }">{{ slider.right }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── 高级设置 ── -->
            <div v-else-if="activeGeneralSection === 'advanced'" class="space-y-4">
              <div class="section-title">⚙️ 高级设置</div>

              <div class="toggle-row">
                <div>
                  <div class="toggle-label">{{ globalSettings.immersiveMode ? '🎭 沉浸模式' : '💬 自由模式' }}</div>
                  <div class="toggle-desc">{{ globalSettings.immersiveMode ? '隐藏思维标记，AI 绝不脱离角色' : '显示思考过程，可跳出角色讨论剧情' }}</div>
                </div>
                <div class="toggle-switch" :class="{ active: globalSettings.immersiveMode }" @click="globalSettings.immersiveMode = !globalSettings.immersiveMode"></div>
              </div>

              <div class="toggle-row">
                <div>
                  <div class="toggle-label">🧠 智能后台分析</div>
                  <div class="toggle-desc">自动生成摘要、分析关系、提取用户画像（额外消耗 Token）</div>
                </div>
                <div class="toggle-switch" :class="{ active: globalSettings.enableSmartAnalysis !== false }" @click="globalSettings.enableSmartAnalysis = !globalSettings.enableSmartAnalysis"></div>
              </div>
              <p v-if="!globalSettings.enableSmartAnalysis" class="text-xs" style="color:#f87171;">
                ⚠️ 已关闭：角色状态、剧情章节、认知卡、时间线将全部停止更新
              </p>

              <div class="toggle-row">
                <div>
                  <div class="toggle-label">🔊 音效</div>
                  <div class="toggle-desc">UI 交互音效和 AI 回复提示音</div>
                </div>
                <div class="toggle-switch" :class="{ active: !globalSettings.soundMuted }" @click="globalSettings.soundMuted = !globalSettings.soundMuted"></div>
              </div>
              <div v-if="!globalSettings.soundMuted" class="pl-4">
                <label class="text-xs text-gray-400">音量: {{ Math.round((globalSettings.soundVolume || 0.2) * 100) }}%</label>
                <input type="range" min="0.05" max="0.5" step="0.05" :value="globalSettings.soundVolume || 0.2" @input="globalSettings.soundVolume = parseFloat($event.target.value)" class="w-full accent-purple-500 mt-1">
              </div>
            </div>

          </div>
        </template>

        <!-- ===== 数据 Tab ===== -->
        <template v-else-if="activeTab === 'data'">
          <div class="modal-content-full">
            <div class="section-title">💾 数据备份与恢复</div>

            <!-- 存储用量 -->
            <div class="data-storage-bar mb-6">
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>💾 存储用量</span>
                <span>点击下方操作管理数据</span>
              </div>
            </div>

            <!-- 操作列表 -->
            <div class="space-y-3">
              <button @click="$emit('export-data')" class="data-action-row">
                <div class="data-action-icon">📤</div>
                <div class="data-action-info">
                  <div class="data-action-name">导出备份</div>
                  <div class="data-action-desc">将所有数据导出为 JSON 文件，包含角色设定、对话记录、记忆等</div>
                </div>
                <span class="data-action-arrow">›</span>
              </button>

              <button @click="$emit('show-import-modal')" class="data-action-row">
                <div class="data-action-icon">📥</div>
                <div class="data-action-info">
                  <div class="data-action-name">恢复数据</div>
                  <div class="data-action-desc">从之前导出的 JSON 文件恢复数据，将覆盖当前数据</div>
                </div>
                <span class="data-action-arrow">›</span>
              </button>

              <button @click="$emit('clear-all-data')" class="data-action-row danger">
                <div class="data-action-icon">🗑️</div>
                <div class="data-action-info">
                  <div class="data-action-name" style="color:#f87171">清除所有数据</div>
                  <div class="data-action-desc">⚠️ 此操作不可撤销！将永久删除所有对话记录、角色设定、记忆和用户画像。建议先导出备份。</div>
                </div>
                <span class="data-action-arrow" style="color:#f87171">›</span>
              </button>
            </div>
          </div>
        </template>

        <!-- ===== 记忆状态 Tab (Spec-01) ===== -->
        <template v-else-if="activeTab === 'memory-status' && !isGroupMode">
          <div class="modal-content-full">
            <div class="section-title">📊 记忆系统健康状态</div>
            <p class="section-desc">一览当前角色各记忆模块的运行情况（只读）</p>
            <div class="memory-status-list">
              <div v-for="(card, idx) in memoryStatusCards" :key="idx" class="memory-status-card">
                <div class="memory-status-left">
                  <span class="memory-status-icon">{{ card.icon }}</span>
                  <div>
                    <div class="memory-status-label">{{ card.label }}</div>
                    <div class="memory-status-value">{{ card.status }}</div>
                  </div>
                </div>
                <span class="memory-status-badge">{{ card.statusIcon }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== Prompt 预览 Tab (Spec-02) ===== -->
        <template v-else-if="activeTab === 'prompt-preview' && !isGroupMode">
          <div class="modal-content-full">
            <div class="section-title">🔍 Prompt 预览</div>
            <p class="section-desc">查看当前发送给 AI 的完整系统 prompt，用于调试和理解</p>

            <button @click="requestPromptPreview" class="prompt-generate-btn" :disabled="isPromptLoading">
              {{ isPromptLoading ? '⏳ 生成中...' : '🔄 生成预览' }}
            </button>

            <template v-if="promptPreviewData?.length">
              <div class="prompt-blocks">
                <div v-for="(msg, idx) in promptPreviewData" :key="idx"
                     class="prompt-block" @click="togglePromptBlock(idx)">
                  <div class="prompt-block-header">
                    <span class="prompt-role-tag" :class="promptRoleTag(msg.role).cls">
                      {{ promptRoleTag(msg.role).label }}
                    </span>
                    <span class="prompt-block-preview">{{ (msg.content || '').slice(0, 40) }}{{ (msg.content || '').length > 40 ? '…' : '' }}</span>
                    <span class="prompt-expand-icon">{{ promptExpandedMap[idx] ? '▼' : '▶' }}</span>
                  </div>
                  <div v-if="promptExpandedMap[idx]" class="prompt-block-body">
                    <pre class="prompt-content-pre">{{ msg.content }}</pre>
                  </div>
                </div>
              </div>
              <div v-if="promptTokenEstimate" class="prompt-token-footer">
                共 {{ promptTokenEstimate.count }} 条消息 · 估算约 {{ promptTokenEstimate.tokens.toLocaleString() }} tokens（字符数 ÷ 2）
              </div>
            </template>
            <div v-else-if="!isPromptLoading" class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <div class="empty-state-text">点击上方按钮生成当前 Prompt 预览</div>
            </div>
          </div>
        </template>

        <!-- ===== 群聊 Tab ===== -->
        <template v-else-if="activeTab === 'group' && isGroupMode && currentGroup">
          <div class="modal-content-full space-y-5">
            <div>
              <div class="section-title">👥 群聊信息</div>
              <div class="glass bg-glass-message rounded-xl p-4 space-y-3 mt-3">
                <div>
                  <div class="text-xs text-gray-500 mb-1">群聊名称</div>
                  <div class="text-gray-100 font-medium">{{ currentGroup.name }}</div>
                </div>
                <div v-if="currentGroup.description">
                  <div class="text-xs text-gray-500 mb-1">群聊描述</div>
                  <div class="text-gray-300 text-sm leading-relaxed">{{ currentGroup.description }}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 mb-2">参与角色（{{ participants?.length || 0 }} 人）</div>
                  <div class="flex flex-wrap gap-2">
                    <div v-for="p in participants" :key="p.id" class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5">
                      <div v-if="p.avatar" class="w-5 h-5 rounded-full overflow-hidden">
                        <img :src="p.avatar" class="w-full h-full object-cover" />
                      </div>
                      <div v-else class="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px]">🎭</div>
                      <span class="text-sm text-gray-200">{{ p.name }}</span>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-gray-500">群名和成员可在关闭设置后，通过聊天窗口顶部的 ✏️ 按钮修改。</p>
              </div>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 遮罩 ===== */
.modal-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: var(--overlay-bg);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
}

/* ===== 弹窗主体 ===== */
.modal-container {
  width: 100%; max-width: 860px;
  height: min(680px, calc(100vh - 40px));
  background: var(--paper-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 32px 80px var(--shadow-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
}
@media (max-width: 640px) {
  .modal-container {
    border-radius: 20px 20px 0 0;
    height: 92dvh;
    max-width: 100%;
  }
}

/* ===== 头部 ===== */
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 0;
  flex-shrink: 0;
}
.modal-title { font-size: 14px; font-weight: 600; color: var(--ink); }
.modal-header-right { display: flex; align-items: center; gap: 12px; }
.modal-save-hint { font-size: 11px; color: var(--ink-faint); }
.modal-close-btn {
  width: 26px; height: 26px; border-radius: 7px; border: none;
  background: var(--brush); color: var(--ink-faint);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.modal-close-btn:hover { background: var(--brush); color: var(--ink); }

/* ===== Tab 栏 ===== */
.modal-tabs {
  display: flex; padding: 12px 20px 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0; gap: 2px;
}
.modal-tab {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px 9px; border: none; background: transparent;
  color: var(--ink-faint); font-size: 12.5px; font-family: inherit;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
  position: relative; bottom: -1px; border-radius: 6px 6px 0 0;
}
.modal-tab:hover { color: var(--ink); }
.modal-tab.active {
  color: var(--ink); font-weight: 500;
  border: 1px solid var(--border);
  border-bottom-color: var(--paper-card);
  background: var(--brush);
}
.modal-tab-icon { font-size: 13px; }
.modal-tab-label { font-size: 12px; }
@media (max-width: 640px) {
  .modal-tabs {
    padding: 10px 12px 0;
    overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    gap: 0;
  }
  .modal-tabs::-webkit-scrollbar { display: none; }
  .modal-tab { padding: 6px 10px 8px; font-size: 11.5px; }
  .modal-tab-icon { font-size: 12px; }
  .modal-tab-label { font-size: 11px; }
}

/* ===== Body：左 + 右 ===== */
.modal-body {
  display: flex; flex: 1; overflow: hidden;
}
@media (max-width: 640px) {
  .modal-body { flex-direction: column; }
}

/* ===== 左侧导航 ===== */
.modal-sidebar {
  width: 160px; flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 16px 10px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
}
.sidebar-section-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-faint);
  padding: 2px 8px 6px;
}
.sidebar-item {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 10px; border-radius: 8px;
  border: none; background: transparent;
  color: var(--ink-faint); font-size: 12.5px;
  font-family: inherit; cursor: pointer; text-align: left;
  width: 100%; transition: all 0.15s;
}
.sidebar-item:hover { background: var(--brush); color: var(--ink); }
.sidebar-item.active { background: var(--brush); color: var(--accent); }
.sidebar-item-icon { font-size: 13px; flex-shrink: 0; }

/* 手机端：sidebar 变横向滚动 Tab 条 */
@media (max-width: 640px) {
  .modal-sidebar {
    width: 100%; flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 6px 10px;
    overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    gap: 4px; flex-shrink: 0;
  }
  .modal-sidebar::-webkit-scrollbar { display: none; }
  .sidebar-section-label { display: none; }
  .sidebar-item {
    width: auto; flex-shrink: 0;
    padding: 6px 12px;
    font-size: 12px;
    white-space: nowrap;
    border-radius: 20px;
    background: var(--brush);
  }
  .sidebar-item.active {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }
}

/* ===== 右侧内容 ===== */
.modal-content {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}
.modal-content::-webkit-scrollbar { width: 4px; }
.modal-content::-webkit-scrollbar-track { background: transparent; }
.modal-content::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
@media (max-width: 640px) {
  .modal-content { padding: 16px 16px 24px; }
}

/* 无左导航的全宽内容 */
.modal-content-full {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}
.modal-content-full::-webkit-scrollbar { width: 4px; }
.modal-content-full::-webkit-scrollbar-track { background: transparent; }
.modal-content-full::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
@media (max-width: 640px) {
  .modal-content-full { padding: 16px 16px 24px; }
}

/* ===== 通用内容样式 ===== */
.section-title {
  font-size: 13px; font-weight: 600;
  color: var(--ink); margin-bottom: 8px;
  display: flex; align-items: center; gap: 8px;
}
.section-desc { font-size: 11.5px; color: var(--ink-faint); margin-bottom: 16px; line-height: 1.5; }

.badge-auto {
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  background: var(--brush); color: var(--accent); font-weight: 500;
}
.badge-count {
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  background: var(--brush); color: var(--ink-faint); font-weight: 500;
}

/* ===== 角色状态卡片 ===== */
.status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.status-card {
  background: var(--brush); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px;
}
.status-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); margin-bottom: 6px; }
.status-card-value { font-size: 13px; line-height: 1.5; }

/* ===== 参数 ===== */
.params-section { space-y: 20px; }
.param-item { margin-bottom: 20px; }
.param-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.param-name { font-size: 13px; color: var(--ink); margin-bottom: 2px; }
.param-desc { font-size: 11px; color: var(--ink-faint); line-height: 1.4; }
.param-value { font-size: 13px; color: var(--accent); font-family: monospace; flex-shrink: 0; }
.param-slider {
  width: 100%; height: 3px; border-radius: 2px;
  background: var(--border); outline: none;
  -webkit-appearance: none; accent-color: var(--accent);
}
.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: var(--accent); cursor: pointer;
  box-shadow: 0 0 0 3px var(--brush);
}
.param-scale { display: flex; justify-content: space-between; font-size: 10px; color: var(--ink-faint); margin-top: 4px; }
.param-select {
  width: 100%; background: var(--paper-warm);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; color: var(--ink);
  font-size: 12.5px; font-family: inherit; outline: none; cursor: pointer;
}
.param-select:focus { border-color: var(--accent); }
.param-select option { background: var(--paper-card); color: var(--ink); }

/* ===== 认知卡 ===== */
.card-field { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; background: var(--brush); border-radius: 8px; border-left: 2px solid var(--border-accent); margin-bottom: 6px; }
.card-label { font-size: 10px; color: var(--ink-faint); font-weight: 500; }
.card-value { font-size: 12.5px; color: var(--ink-light); line-height: 1.5; }
.card-events { list-style: none; padding: 0; margin: 2px 0 0; }
.card-events li { font-size: 11.5px; color: var(--ink-light); padding: 1px 0; line-height: 1.4; }
.card-events li::before { content: '· '; color: var(--accent); }

/* ===== 章节 ===== */
.chapter-item { background: var(--brush); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }
.chapter-header { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 5px; }
.chapter-meta { color: var(--ink-faint); font-weight: 400; }
.chapter-body { font-size: 12px; color: var(--ink-light); line-height: 1.6; }
.chapter-del-btn { font-size: 10px; color: var(--ink-faint); background: none; border: none; cursor: pointer; padding: 0 2px; opacity: 0.4; transition: opacity 0.15s, color 0.15s; }
.chapter-del-btn:hover { opacity: 1; color: #f87171; }

/* ===== 永久记忆 ===== */
.add-memory-btn {
  width: 100%; padding: 9px;
  border: 1.5px dashed var(--border-accent); border-radius: 10px;
  background: transparent; color: var(--accent); font-size: 13px;
  cursor: pointer; transition: all 0.15s; margin-bottom: 12px;
}
.add-memory-btn:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }

.memory-item { background: var(--brush); border-radius: 10px; padding: 12px; margin-bottom: 8px; }
.memory-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.memory-edit-textarea {
  width: 100%; background: var(--brush); border: 1px solid var(--border-accent);
  border-radius: 8px; padding: 8px 10px; color: var(--ink); font-size: 12px;
  resize: vertical; font-family: inherit;
}
.memory-edit-textarea:focus { outline: none; border-color: var(--accent); }

.mem-btn {
  padding: 4px 8px; border-radius: 6px; font-size: 11px;
  border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  transition: all 0.15s;
}
.mem-btn.refine { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
.mem-btn.refine:hover { background: color-mix(in srgb, var(--accent) 35%, transparent); }
.mem-btn.edit { background: rgba(59,130,246,0.2); color: #60a5fa; }
.mem-btn.edit:hover { background: rgba(59,130,246,0.35); }
.mem-btn.save { background: rgba(34,197,94,0.2); color: #4ade80; }
.mem-btn.save:hover { background: rgba(34,197,94,0.35); }
.mem-btn.cancel { background: var(--brush); color: var(--ink-faint); }
.mem-btn.cancel:hover { background: var(--border); }
.mem-btn.delete { background: rgba(239,68,68,0.15); color: #f87171; }
.mem-btn.delete:hover { background: rgba(239,68,68,0.3); }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; display: inline-block; }
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* ===== 时间线双栏 ===== */
.timeline-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 100%; }
.timeline-list { overflow-y: auto; }
.timeline-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--brush); border: 1px solid var(--border);
  cursor: pointer; transition: all 0.15s; margin-bottom: 6px; position: relative;
}
.timeline-item:hover { background: var(--paper-warm); border-color: var(--border-accent); }
.timeline-item:hover .timeline-delete-btn { opacity: 1; }
.timeline-item.active { background: color-mix(in srgb, var(--accent) 10%, transparent); border-color: var(--border-accent); }
.timeline-icon { flex-shrink: 0; font-size: 13px; margin-top: 1px; }
.timeline-delete-btn {
  position: absolute; top: 8px; right: 8px;
  width: 18px; height: 18px; border-radius: 4px; border: none;
  background: rgba(239,68,68,0.2); color: #f87171; font-size: 10px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; opacity: 0;
}
.timeline-delete-btn:hover { background: rgba(239,68,68,0.4); }
.timeline-edit-input {
  width: 100%; background: var(--brush); border: 1px solid var(--border-accent);
  border-radius: 7px; padding: 6px 9px; color: var(--ink); font-size: 12px;
  resize: none; font-family: inherit;
}
.timeline-edit-input:focus { outline: none; border-color: var(--accent); }
.timeline-detail {
  background: var(--brush); border-radius: 12px;
  border: 1px solid var(--border); padding: 16px;
  height: fit-content;
}
.timeline-detail-content {}
.detail-row { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.detail-label { font-size: 10px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.06em; }
.detail-value { font-size: 12.5px; color: var(--ink-light); line-height: 1.5; }

/* ===== 空状态 ===== */
.empty-state { text-align: center; padding: 40px 20px; }
.empty-state-icon { font-size: 32px; margin-bottom: 10px; opacity: 0.5; }
.empty-state-text { font-size: 13px; color: var(--ink-faint); margin-bottom: 5px; }
.empty-state-hint { font-size: 11px; color: var(--ink-faint); opacity: 0.7; }

/* ===== 数据 Tab ===== */
.data-action-row {
  width: 100%; display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--brush); border: 1px solid var(--border);
  cursor: pointer; transition: all 0.15s; text-align: left;
}
.data-action-row:hover { background: var(--paper-warm); border-color: var(--border-accent); }
.data-action-row.danger:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.25); }
.data-action-icon { font-size: 22px; flex-shrink: 0; }
.data-action-info { flex: 1; }
.data-action-name { font-size: 13px; color: var(--ink); font-weight: 500; margin-bottom: 3px; }
.data-action-desc { font-size: 11.5px; color: var(--ink-faint); line-height: 1.5; }
.data-action-arrow { font-size: 18px; color: var(--ink-faint); flex-shrink: 0; }
/* ===== 通用 Tab 内联样式 ===== */
.api-field { display: flex; flex-direction: column; gap: 6px; }
.api-field-header { display: flex; justify-content: space-between; align-items: center; }
.api-field-header label { font-size: 13px; color: var(--ink); font-weight: 500; }
.api-input {
  width: 100%; background: var(--brush);
  border: 1px solid var(--border); border-radius: 9px;
  padding: 8px 11px; color: var(--ink);
  font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s;
}
.api-input:focus { border-color: var(--accent); }
/* select 元素不支持半透明背景（Windows 浏览器会透出系统底色），用实色 */
select.api-input { background: var(--paper-warm); }
select.api-input option { background: var(--paper-card); color: var(--ink); }
.toggle-mode-btn {
  font-size: 11px; padding: 3px 9px; border-radius: 20px; border: none;
  background: var(--brush); color: var(--ink-faint);
  cursor: pointer; transition: all 0.15s;
}
.toggle-mode-btn:hover { background: var(--border); }
.toggle-mode-btn.active { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }

/* ===== 模型滚动选择器 ===== */
.model-picker-wrap { position: relative; }
.model-picker-trigger {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: var(--brush); border: 1px solid var(--border);
  border-radius: 9px; padding: 8px 11px; color: var(--ink);
  font-size: 13px; font-family: inherit; cursor: pointer; text-align: left;
  transition: border-color 0.15s;
}
.model-picker-trigger:hover { border-color: var(--border-accent); }
.model-picker-chevron {
  font-size: 14px; color: var(--ink-faint);
  transition: transform 0.2s; flex-shrink: 0; margin-left: 6px;
}
.model-picker-chevron.open { transform: rotate(180deg); }
.model-picker {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
  max-height: 190px; overflow-y: auto;
  background: var(--paper-card);
  border: 1px solid var(--border);
  border-radius: 9px; padding: 3px 0;
  box-shadow: 0 8px 28px var(--shadow-lg);
}
.model-picker::-webkit-scrollbar { width: 4px; }
.model-picker::-webkit-scrollbar-track { background: transparent; }
.model-picker::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
.model-picker-group {
  font-size: 10px; color: var(--accent); font-weight: 700;
  padding: 7px 12px 2px; letter-spacing: 0.06em; user-select: none;
  text-transform: uppercase; opacity: 0.65;
}
.model-picker-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px; cursor: pointer; gap: 8px;
  transition: background 0.12s;
}
.model-picker-item:hover { background: var(--brush); }
.model-picker-item.active {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}
.model-picker-label {
  font-size: 12.5px; color: var(--ink);
  font-weight: 500; flex-shrink: 0;
}
.model-picker-desc {
  font-size: 11px; color: var(--ink-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 160px;
}

.toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.toggle-row:last-child { border-bottom: none; }
.toggle-label { font-size: 13px; color: var(--ink); margin-bottom: 2px; }
.toggle-desc { font-size: 11px; color: var(--ink-faint); }

.avatar-picker-sm {
  width: 56px; height: 56px; border-radius: 50%;
  border: 2px dashed var(--border); cursor: pointer; overflow: hidden;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: var(--brush); transition: all 0.15s;
}
.avatar-picker-sm:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }



/* ===== 📱 手机端适配 ===== */
@media (max-width: 640px) {
  /* 遮罩：从底部弹出 */
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  /* 弹窗：全宽 + 顶部圆角 + 92dvh 高 */
  .modal-container {
    max-width: 100%;
    width: 100%;
    height: 92dvh;
    border-radius: 20px 20px 0 0;
  }

  /* Header 紧凑 */
  .modal-header {
    padding: 14px 16px 0;
  }
  .modal-save-hint { display: none; }

  /* Tab 栏可横向滚动 */
  .modal-tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding: 10px 12px 0;
    -webkit-overflow-scrolling: touch;
  }
  .modal-tabs::-webkit-scrollbar { display: none; }
  .modal-tab { flex-shrink: 0; padding: 6px 10px 8px; }
  .modal-tab-label { font-size: 11px; }

  /* Body 改为纵向：sidebar 在上，内容在下 */
  .modal-body { flex-direction: column; }

  /* Sidebar → 横向可滚动标签行 */
  .modal-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 8px 12px;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
    gap: 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .modal-sidebar::-webkit-scrollbar { display: none; }
  .sidebar-section-label { display: none; }
  .sidebar-item {
    width: auto;
    flex-shrink: 0;
    padding: 5px 13px;
    border-radius: 20px;
    background: var(--brush);
    border: 1px solid var(--border);
    font-size: 12px;
    white-space: nowrap;
    color: var(--ink-faint);
  }
  .sidebar-item.active {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border-color: var(--border-accent);
    color: var(--accent);
  }

  /* 内容区：缩减内边距 */
  .modal-content { padding: 16px 14px; }
  .modal-content-full { padding: 16px 14px; }

  /* 时间线：单列 + 隐藏右侧详情 */
  .timeline-layout {
    grid-template-columns: 1fr;
    height: auto;
    gap: 0;
  }
  .timeline-detail { display: none; }

  /* 角色状态卡片：保持两列但紧凑 */
  .status-grid { gap: 8px; }
  .status-card { padding: 10px 12px; }


  /* 参数滑块标签字号 */
  .param-scale { font-size: 9px; }
  .section-desc { font-size: 11px; }

  /* API 字段 */
  .api-input { font-size: 14px; } /* 防止 iOS 自动放大 */

  /* 数据操作行 */
  .data-action-row { padding: 12px 12px; gap: 10px; }
  .data-action-icon { font-size: 18px; }
  .data-action-desc { display: none; } /* 手机上只显示标题 */

  /* 记忆操作按钮 */
  .memory-actions { flex-wrap: wrap; }
  .add-memory-btn { font-size: 12px; }
}

/* 极窄设备（320px，旧 iPhone SE 等） */
@media (max-width: 360px) {
  .modal-tab { padding: 6px 8px 8px; gap: 3px; }
  .modal-tab-icon { font-size: 11px; }
  .modal-tab-label { font-size: 10px; }
}

/* ===== Spec-01: 记忆状态 Tab ===== */
.memory-status-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.memory-status-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: var(--brush); border: 1px solid var(--border);
  border-radius: 10px; transition: border-color 0.15s;
}
.memory-status-card:hover { border-color: var(--border-accent); }
.memory-status-left { display: flex; align-items: center; gap: 12px; }
.memory-status-icon { font-size: 22px; flex-shrink: 0; }
.memory-status-label { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
.memory-status-value { font-size: 12px; color: var(--ink-light); line-height: 1.4; }
.memory-status-badge { font-size: 18px; flex-shrink: 0; }

/* ===== Spec-02: Prompt 预览 Tab ===== */
.prompt-generate-btn {
  display: block; margin: 12px 0; padding: 8px 20px; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent); border: 1px solid var(--border-accent);
}
.prompt-generate-btn:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }
.prompt-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.prompt-blocks { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.prompt-block {
  background: var(--brush); border: 1px solid var(--border); border-radius: 8px;
  cursor: pointer; transition: border-color 0.15s; overflow: hidden;
}
.prompt-block:hover { border-color: var(--border-accent); }
.prompt-block-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
}
.prompt-role-tag {
  flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 2px 8px;
  border-radius: 4px; letter-spacing: 0.3px; text-transform: uppercase;
}
.prompt-tag-system { background: rgba(99, 102, 241, 0.18); color: var(--accent); }
.prompt-tag-user { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.prompt-tag-assistant { background: rgba(156, 163, 175, 0.12); color: var(--ink-light); }
.prompt-block-preview {
  flex: 1; min-width: 0; font-size: 12px; color: var(--ink-light);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.prompt-expand-icon { flex-shrink: 0; font-size: 10px; color: var(--ink-faint); }
.prompt-block-body { padding: 0 12px 12px; border-top: 1px solid var(--border); }
.prompt-content-pre {
  font-size: 12px; color: var(--ink); line-height: 1.65;
  white-space: pre-wrap; word-break: break-all; max-height: 300px;
  overflow-y: auto; margin: 8px 0 0; font-family: 'Menlo', 'Consolas', monospace;
}
.prompt-token-footer {
  text-align: center; font-size: 12px; color: var(--ink-light);
  margin-top: 12px; padding: 8px 0; border-top: 1px solid var(--border);
}
</style>