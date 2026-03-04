<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { renderMarkdown } from '../utils/markdown';
import { parseDualLayerResponse } from '../utils/textParser';
import { useLongPress } from '../composables/useGestures';
import BranchSwitcher from './BranchSwitcher.vue';

const props = defineProps({
  messages: {
    type: Array,
    required: true
  },
  currentRole: {
    type: Object,
    required: true
  },
  globalSettings: {
    type: Object,
    required: true
  },
  isStreaming: Boolean,
  isThinking: Boolean,
  activeMessageIndex: Number,
  ttsState: Object,
  memoryFunctions: Object,
  showSearch: Boolean,
  searchQuery: { type: String, default: '' },
  searchResults: { type: Array, default: () => [] },
  currentMatchIndex: { type: Number, default: 0 },
  branches: { type: Array, default: () => [] },
  currentBranchId: { type: String, default: 'branch-main' }
});

const emit = defineEmits([
  'toggle-select',
  'toggle-thinking',
  'start-edit',
  'delete-message',
  'regenerate',
  'play-tts',
  'update:search-query',
  'search-next',
  'search-prev',
  'close-search',
  'fork-at',
  'switch-branch',
  'rename-branch',
  'delete-branch',
  'send-suggestion',
  'open-diary',
  'set-reaction'
]);

const containerRef = ref(null);
const searchInputRef = ref(null);
const moreMenuIndex = ref(null);
const copyFeedbackIndex = ref(null);

// 💕 loveDark 飘动心形背景
let heartElements = [];
function createFloatingHearts() {
  removeFloatingHearts();
  const host = containerRef.value;
  if (!host) return;
  const chars = ['♡', '♥', '🌸', '✿', '·'];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div');
    el.className = 'floating-heart';
    el.textContent = chars[Math.floor(Math.random() * chars.length)];
    el.style.cssText = `
      --heart-x: ${Math.random() * 100}%;
      --heart-duration: ${4 + Math.random() * 5}s;
      --heart-delay: ${-Math.random() * 8}s;
      --heart-size: ${10 + Math.random() * 8}px;
    `;
    host.appendChild(el);
    heartElements.push(el);
  }
}
function removeFloatingHearts() {
  heartElements.forEach(el => el.remove());
  heartElements = [];
}

watch(() => props.globalSettings.rpTextStyle, (style) => {
  if (style === 'loveDark') {
    createFloatingHearts();
  } else {
    removeFloatingHearts();
  }
}, { immediate: true });

onMounted(() => {
  if (props.globalSettings.rpTextStyle === 'loveDark') {
    createFloatingHearts();
  }
});

onUnmounted(() => removeFloatingHearts());

// ⏰ 格式化时间戳
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatFullDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('zh-CN');
}

// 🌟 快捷对话建议（基于角色特征动态生成）
const quickSuggestions = computed(() => {
  const name = props.currentRole.name || 'AI';
  const prompt = (props.currentRole.systemPrompt || '').toLowerCase();
  // 根据角色关键词提供不同的对话起点
  if (prompt.includes('黑客') || prompt.includes('科技') || prompt.includes('赛博')) {
    return [`嘿 ${name}，给我讲讲你的世界`, '你最厉害的一次黑入是什么？', '教我一些黑客技巧吧'];
  } else if (prompt.includes('姐姐') || prompt.includes('温柔') || prompt.includes('照顾')) {
    return [`${name}，今天好累啊…`, '能陪我聊聊天吗？', '给我讲个睡前故事吧'];
  } else if (prompt.includes('冒险') || prompt.includes('勇者') || prompt.includes('魔法')) {
    return ['这里是哪里？我怎么会在这？', `${name}，前方有什么危险吗？`, '我们出发冒险吧！'];
  } else if (prompt.includes('恋') || prompt.includes('喜欢') || prompt.includes('心动')) {
    return [`${name}，你在想什么呢？`, '今天天气真好呢…', '一起去散步吧'];
  }
  return [`你好 ${name}！`, '给我讲讲你自己吧', '我们来聊点有趣的'];
});

// 🌟 回访欢迎
const returnMessage = computed(() => {
  const lastVisit = parseInt(localStorage.getItem('myai_lastVisitTime') || '0');
  if (!lastVisit) return null;
  const hours = Math.floor((Date.now() - lastVisit) / 3600000);
  if (hours < 2) return null;
  const name = props.currentRole.name || 'AI';
  if (hours < 24) return `🕐 已经过去 ${hours} 小时了，${name} 一直在等你`;
  const days = Math.floor(hours / 24);
  return `🕐 已经过去 ${days} 天了，${name} 一直在想你`;
});

// ⚠️ 注意：访问时间由 App.vue 的 visibilitychange/beforeunload 统一管理
// 不在这里写入，避免覆盖「上次离开时间」导致主动消息永远检测到 0 小时

defineExpose({
  get scrollTop() {
    return containerRef.value?.scrollTop || 0;
  },
  set scrollTop(value) {
    if (containerRef.value) {
      containerRef.value.scrollTop = value;
    }
  },
  get scrollHeight() {
    return containerRef.value?.scrollHeight || 0;
  }
});

const memoryHelpers = computed(() => {
  return props.memoryFunctions || {
    isMessagePinned: () => false,
    toggleMessagePin: () => {}
  };
});

// 长按手势：在移动端长按消息弹出操作菜单
const longPress = useLongPress((e, messageIndex) => {
  emit('toggle-select', messageIndex);
});

// 📋 复制消息文本（移动端长按菜单代替了原生复制）
function copyMessageText(msg, index) {
  // 从 rawContent 直接提取纯文本，保留换行格式
  const raw = msg.rawContent || msg.content || '';
  const cleanText = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')   // 去除完整 think 块
    .replace(/<think>[\s\S]*$/g, '')             // 去除未闭合 think
    .replace(/<inner>[\s\S]*?<\/inner>/g, '')    // 去除完整 inner 块
    .replace(/<inner>[\s\S]*$/g, '')             // 去除未闭合 inner
    .replace(/<[^>]+>/g, '')                     // 去除其他 HTML 标签
    .trim();
  navigator.clipboard.writeText(cleanText).then(
    () => {
      copyFeedbackIndex.value = index;
      setTimeout(() => { copyFeedbackIndex.value = null; }, 1200);
    },
    () => { /* fallback: do nothing on failure */ }
  );
}

// 🛡️ 智能消息折叠：当消息超过阈值时折叠旧消息
const MESSAGE_FOLD_THRESHOLD = 50; // 超过此数量时启用折叠
const MESSAGES_PER_PAGE = 20; // 每次加载的消息数

const showAllMessages = ref(false);
const visibleCount = ref(MESSAGE_FOLD_THRESHOLD);

// 重置状态当消息列表清空时
watch(() => props.messages.length, (newLen) => {
  if (newLen === 0) {
    showAllMessages.value = false;
    visibleCount.value = MESSAGE_FOLD_THRESHOLD;
  }
});

const shouldFold = computed(() => {
  return props.messages.length > MESSAGE_FOLD_THRESHOLD && !showAllMessages.value;
});

const hiddenCount = computed(() => {
  if (!shouldFold.value) return 0;
  return Math.max(0, props.messages.length - visibleCount.value);
});

const visibleMessages = computed(() => {
  if (!shouldFold.value) return props.messages;
  // 显示最后 N 条消息
  return props.messages.slice(-visibleCount.value);
});

// 加载更多消息
function loadMoreMessages() {
  visibleCount.value = Math.min(
    visibleCount.value + MESSAGES_PER_PAGE,
    props.messages.length
  );
  if (visibleCount.value >= props.messages.length) {
    showAllMessages.value = true;
  }
}

// 计算原始索引（用于事件发出）
function getOriginalIndex(visibleIndex) {
  if (!shouldFold.value) return visibleIndex;
  return props.messages.length - visibleCount.value + visibleIndex;
}

function safeParseMessage(message) {
  const source = message?.rawContent || message?.content || '';
  let parsed = { reasoning: null, inner: null, content: '', expression: null };

  try {
    parsed = parseDualLayerResponse(source) || parsed;
  } catch (e) {
    console.warn('Parser error:', e);
    parsed = { reasoning: null, inner: null, content: '', expression: null };
  }

  // Use parser output, fallback to message.thinking for R1 reasoning_content
  const thought = (parsed.reasoning || message?.thinking || '').trim();
  const inner = (parsed.inner || message?.inner || '').trim();
  
  // CRITICAL: Do NOT fallback to source! The parser returns empty content 
  // intentionally during streaming to prevent flash/leak
  let bodyHtml = parsed.content;

  // 🛡️ 安全兜底：确保 <think> / <inner> / <expr> 标签永远不会泄露到显示层
  // v5.3.1: 同时处理 HTML 转义后的标签（formatRoleplayText 会把 < 转义成 &lt;）
  if (bodyHtml) {
    bodyHtml = bodyHtml
      // 原始标签（理论上不应该走到这里，但作为防线）
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .replace(/<inner>[\s\S]*?<\/inner>/gi, '')
      .replace(/<inner>[\s\S]*$/gi, '')
      .replace(/<\/think>/gi, '')
      .replace(/<\/inner>/gi, '')
      // HTML 转义后的标签（这才是实际会出现的形式）
      .replace(/&lt;\s*think\s*&gt;[\s\S]*?&lt;\s*\/\s*think\s*&gt;/gi, '')
      .replace(/&lt;\s*think\s*&gt;[\s\S]*$/gi, '')
      .replace(/&lt;\s*inner\s*&gt;[\s\S]*?&lt;\s*\/\s*inner\s*&gt;/gi, '')
      .replace(/&lt;\s*inner\s*&gt;[\s\S]*$/gi, '')
      .replace(/&lt;\s*\/?\s*think\s*&gt;/gi, '')
      .replace(/&lt;\s*\/?\s*inner\s*&gt;/gi, '')
      .replace(/&lt;expr:\w+&gt;/gi, '')
      .replace(/&lt;\/expr:\w+&gt;/gi, '')
      .trim();
  }

  return {
    thought,
    inner,
    bodyHtml,
    expression: parsed.expression,
    raw: source
  };
}

// 动态计算思考图标状态
function getReasoningStatus(message, index) {
  const raw = message?.rawContent || message?.content || '';
  const isLastMessage = index === props.messages.length - 1;

  // 🛡️ v5.3.1: 容错匹配标签变体（< think >、</Think> 等）
  const hasThinkOpen = /<\s*think\s*>/i.test(raw);
  const hasThinkClose = /<\s*\/\s*think\s*>/i.test(raw);

  // 状态 A: 正在思考 (有开头，没结尾) -> 显示 ✨
  if (hasThinkOpen && !hasThinkClose) {
    return { icon: '✨', isThinking: true };
  }

  // 状态 B: 思考完成 -> 立马显示 💡
  // Check message.thinkingComplete or if </think> is present
  if (message?.thinkingComplete || hasThinkClose || message?.thinking) {
    return { icon: '💡', isThinking: false };
  }

  return null; // 没有思考内容
}

// 🛡️ 解析缓存：避免重复解析非流式消息
const parseCache = new Map();

// 使用 visibleMessages 而不是全部消息
const parsedMessages = computed(() => {
  return visibleMessages.value.map((msg, visibleIndex) => {
    const originalIndex = getOriginalIndex(visibleIndex);
    const isLastMessage = originalIndex === props.messages.length - 1;
    const source = msg?.rawContent || msg?.content || '';
    
    // 流式传输中的最后一条消息不缓存
    if (isLastMessage && props.isStreaming) {
      return safeParseMessage(msg);
    }
    
    // 使用原始索引作为缓存 key
    const cacheKey = `${originalIndex}-${source.length}-${source.slice(-50)}`;
    
    if (parseCache.has(cacheKey)) {
      return parseCache.get(cacheKey);
    }
    
    const parsed = safeParseMessage(msg);
    parseCache.set(cacheKey, parsed);
    
    // 限制缓存大小
    if (parseCache.size > 200) {
      const firstKey = parseCache.keys().next().value;
      parseCache.delete(firstKey);
    }
    
    return parsed;
  });
});

function handleChatAreaClick(event) {
  if (event.target === event.currentTarget) {
    emit('toggle-select', null);
  }
}

// 搜索框自动聚焦
watch(() => props.showSearch, (val) => {
  if (val) {
    nextTick(() => searchInputRef.value?.focus());
  }
});

// 搜索结果变化时滚动到当前匹配项
watch([() => props.currentMatchIndex, () => props.searchResults], () => {
  if (props.searchResults.length === 0) return;
  const targetMsgIndex = props.searchResults[props.currentMatchIndex];
  if (targetMsgIndex == null) return;
  nextTick(() => {
    const el = containerRef.value?.querySelector(`[data-msg-index="${targetMsgIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

function handleSearchKeydown(e) {
  if (e.key === 'Escape') {
    emit('close-search');
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      emit('search-prev');
    } else {
      emit('search-next');
    }
  }
}

function isSearchMatch(originalIndex) {
  return props.searchResults.includes(originalIndex);
}

function isCurrentMatch(originalIndex) {
  return props.searchResults[props.currentMatchIndex] === originalIndex;
}
</script>

<template>
  <main ref="containerRef" class="flex-1 overflow-y-scroll p-4 space-y-4" @click="handleChatAreaClick"
        :class="[
          'chat-style-' + (globalSettings.rpTextStyle || 'clear'),
          { 'mode-immersive': globalSettings.immersiveMode }
        ]">

    <!-- 搜索工具栏 -->
    <Transition name="search-bar">
      <div v-if="showSearch" class="search-bar">
        <div class="search-bar-inner">
          <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input ref="searchInputRef"
                 :value="searchQuery"
                 @input="$emit('update:search-query', $event.target.value)"
                 @keydown="handleSearchKeydown"
                 type="text"
                 placeholder="搜索消息..."
                 class="search-input" />
          <span v-if="searchQuery" class="search-count">
            {{ searchResults.length > 0 ? `${currentMatchIndex + 1}/${searchResults.length}` : '无结果' }}
          </span>
          <div class="search-nav" v-if="searchResults.length > 0">
            <button @click="$emit('search-prev')" class="search-nav-btn" title="上一个 (Shift+Enter)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
              </svg>
            </button>
            <button @click="$emit('search-next')" class="search-nav-btn" title="下一个 (Enter)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>
          <button @click="$emit('close-search')" class="search-nav-btn" title="关闭 (Esc)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    </Transition>

    <!-- 分支切换器 -->
    <BranchSwitcher
        :branches="branches"
        :current-branch-id="currentBranchId"
        @switch="$emit('switch-branch', $event)"
        @rename="(id, name) => $emit('rename-branch', id, name)"
        @delete="$emit('delete-branch', $event)"
    />

    <!-- 🌟 欢迎屏：第一次打开时的沉浸式引导 -->
    <div v-if="messages.length === 0" class="welcome-screen">
      <div class="welcome-card">
        <!-- 角色头像（大号 + 呼吸光环） -->
        <div class="welcome-avatar-wrapper">
          <div class="avatar-glow"></div>
          <div v-if="currentRole.avatar" class="welcome-avatar">
            <img :src="currentRole.avatar" alt="Role Avatar" class="w-full h-full rounded-full object-cover" @error="$event.target.style.display='none'">
          </div>
          <div v-else class="welcome-avatar welcome-avatar-placeholder">🎭</div>
        </div>

        <!-- 角色名 + 标签 -->
        <h2 class="welcome-name">{{ currentRole.name }}</h2>
        <p v-if="currentRole.styleGuide" class="welcome-tagline">{{ currentRole.styleGuide.slice(0, 50) }}</p>

        <!-- 开场白气泡 -->
        <div v-if="currentRole.firstMessage" class="welcome-bubble">
          <div class="markdown-body message-content" v-html="renderMarkdown(currentRole.firstMessage)"></div>
        </div>

        <!-- 快捷对话建议 -->
        <div class="welcome-suggestions">
          <button v-for="(s, i) in quickSuggestions" :key="i"
                  class="suggestion-btn"
                  @click="$emit('send-suggestion', s)">
            {{ s }}
          </button>
        </div>

        <!-- 🌟 回访欢迎横幅 -->
        <div v-if="returnMessage" class="return-banner mt-4">
          {{ returnMessage }}
        </div>
      </div>
    </div>

    <!-- 🛡️ 消息折叠提示 -->
    <div v-if="hiddenCount > 0" class="flex justify-center mb-4">
      <button @click="loadMoreMessages"
              class="glass bg-glass-light px-4 py-2 rounded-full text-sm text-gray-300 hover:bg-white/20 transition border border-white/10 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
        </svg>
        加载更多消息 ({{ hiddenCount }} 条隐藏)
      </button>
    </div>

    <!-- 消息列表 -->
    <TransitionGroup name="message" tag="div">
      <template v-for="(msg, visibleIndex) in visibleMessages" :key="getOriginalIndex(visibleIndex)">
        <template v-if="msg.role === 'user'">
          <div class="message-bubble flex flex-col items-end"
               v-memo="[msg.content, activeMessageIndex === getOriginalIndex(visibleIndex), isCurrentMatch(getOriginalIndex(visibleIndex)), searchResults.length]"
               :data-msg-index="getOriginalIndex(visibleIndex)"
               :class="{ 'search-match': isSearchMatch(getOriginalIndex(visibleIndex)), 'search-current': isCurrentMatch(getOriginalIndex(visibleIndex)) }"
               @touchstart="(e) => longPress.onTouchStart(e, getOriginalIndex(visibleIndex))"
               @touchend="longPress.onTouchEnd"
               @touchmove="longPress.onTouchMove">
            <div class="flex items-start justify-end space-x-3 space-x-reverse w-full">
              <div class="w-full max-w-[80%] message-wrapper">
                <div @click.stop="$emit('toggle-select', getOriginalIndex(visibleIndex))"
                     class="user-speech-bubble cursor-pointer"
                     :class="['style-' + (globalSettings.rpTextStyle || 'clear'), { 'selected': activeMessageIndex === getOriginalIndex(visibleIndex) }]">
                  <div class="message-body message-content text-sm whitespace-pre-wrap" v-html="renderMarkdown(msg.content || '')"></div>
                </div>

                <div class="message-toolbar" :class="{ 'active': activeMessageIndex === getOriginalIndex(visibleIndex) }">
                  <div class="toolbar-inner">
                    <button class="toolbar-btn pin"
                            :class="{ 'pinned': memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) }"
                            @click.stop="memoryHelpers.toggleMessagePin(getOriginalIndex(visibleIndex))">
                      📌 {{ memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) ? '已记忆' : '记忆' }}
                    </button>
                    <button class="toolbar-btn" @click.stop="$emit('start-edit', getOriginalIndex(visibleIndex))">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                      编辑
                    </button>
                    <button class="toolbar-btn delete" @click.stop="$emit('delete-message', getOriginalIndex(visibleIndex))">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                      删除
                    </button>
                    <button class="toolbar-btn" @click.stop="copyMessageText(msg); $emit('toggle-select', null)">
                      📋 复制
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="globalSettings.userAvatar" class="avatar flex-shrink-0">
                <img :src="globalSettings.userAvatar" alt="User Avatar" class="w-full h-full rounded-full object-cover" @error="$event.target.style.display='none'">
              </div>
              <div v-else class="avatar-placeholder avatar-user text-white flex-shrink-0">👤</div>
            </div>
          </div>
        </template>

        <template v-else-if="msg.role === 'assistant'">
          <div class="message-bubble flex flex-col items-start"
               v-memo="[parsedMessages[visibleIndex]?.bodyHtml, parsedMessages[visibleIndex]?.thought, parsedMessages[visibleIndex]?.inner, activeMessageIndex === getOriginalIndex(visibleIndex), isCurrentMatch(getOriginalIndex(visibleIndex)), isStreaming && getOriginalIndex(visibleIndex) === messages.length - 1, globalSettings.showLogic, globalSettings.showInner, globalSettings.showTokens, searchResults.length, msg.isActiveMessage, msg.reaction]"
               :data-msg-index="getOriginalIndex(visibleIndex)"
               :class="{ 'search-match': isSearchMatch(getOriginalIndex(visibleIndex)), 'search-current': isCurrentMatch(getOriginalIndex(visibleIndex)) }"
               @touchstart="(e) => longPress.onTouchStart(e, getOriginalIndex(visibleIndex))"
               @touchend="longPress.onTouchEnd"
               @touchmove="longPress.onTouchMove">
            <div class="flex items-start space-x-3 w-full">
              <div v-if="currentRole.avatar"
                   class="avatar flex-shrink-0 expr-avatar"
                   :class="[parsedMessages[visibleIndex]?.expression ? 'expr-' + parsedMessages[visibleIndex].expression : '',
                            getOriginalIndex(visibleIndex) === messages.length - 1 ? 'expr-latest' : '']">
                <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="$event.target.style.display='none'">
              </div>
              <div v-else
                   class="avatar-placeholder avatar-ai text-white flex-shrink-0 expr-avatar"
                   :class="[parsedMessages[visibleIndex]?.expression ? 'expr-' + parsedMessages[visibleIndex].expression : '',
                            getOriginalIndex(visibleIndex) === messages.length - 1 ? 'expr-latest' : '']">🎭</div>

              <div class="w-full max-w-[80%] message-wrapper">
                <div class="role-name-label">{{ currentRole.name }}</div>
                <!-- 🌟 主动消息标记 -->
                <div v-if="msg.isActiveMessage" 
                     class="active-message-badge"
                     :class="{ 'has-diary': (msg.content || '').includes('📔') }"
                     @click.stop="(msg.content || '').includes('📔') && $emit('open-diary')"
                     :title="(msg.content || '').includes('📔') ? '点击查看日记' : ''"
                >✨ 主动找你</div>
                <!-- Layer 0: R1 Reasoning (折叠图标: ✨ 思考中, 💡 思考完成) -->
                <details v-if="globalSettings.showLogic && parsedMessages[visibleIndex]?.thought" class="reasoning-block">
                  <summary>
                    <span class="reasoning-icon" :class="{ 'streaming': getReasoningStatus(msg, getOriginalIndex(visibleIndex))?.isThinking }">
                      {{ getReasoningStatus(msg, getOriginalIndex(visibleIndex))?.icon || '💡' }}
                    </span>
                  </summary>
                  <div class="reasoning-content">{{ parsedMessages[visibleIndex].thought }}</div>
                </details>

                <!-- Layer 2: Inner Thoughts Bubble - 按风格显示 -->
                <div v-if="globalSettings.showInner && parsedMessages[visibleIndex]?.inner"
                     class="inner-bubble"
                     :class="'inner-' + (globalSettings.rpTextStyle || 'clear')">
                  <span class="inner-icon">{{ ['loveDark','loveLight'].includes(globalSettings.rpTextStyle) ? '🌸' : '💭' }}</span>
                  <span class="inner-text">{{ parsedMessages[visibleIndex].inner }}</span>
                </div>

                <div @click.stop="msg.isActiveMessage && (msg.content || '').includes('📔') ? $emit('open-diary') : $emit('toggle-select', getOriginalIndex(visibleIndex))"
                     class="speech-bubble cursor-pointer"
                     :class="['style-' + globalSettings.rpTextStyle, { 'selected': activeMessageIndex === getOriginalIndex(visibleIndex), 'diary-clickable': msg.isActiveMessage && (msg.content || '').includes('📔') }]">
                  <div class="message-body vn-body message-content"
                       :class="{ 'typing-cursor': isStreaming && getOriginalIndex(visibleIndex) === messages.length - 1 }"
                       v-html="parsedMessages[visibleIndex]?.bodyHtml"></div>
                  <div v-if="globalSettings.showTokens && msg.tokens" class="token-badge">
                    🪙 {{ msg.tokens.total }}
                  </div>
                  <div v-if="msg.timestamp" class="msg-time" :title="formatFullDate(msg.timestamp)">
                    {{ formatTime(msg.timestamp) }}
                  </div>
                </div>

                <div class="message-toolbar" :class="{ 'active': activeMessageIndex === getOriginalIndex(visibleIndex) }">
                  <div class="toolbar-inner">
                    <button class="toolbar-btn" @click.stop="$emit('start-edit', getOriginalIndex(visibleIndex))">
                      ✏️ 编辑
                    </button>
                    <button class="toolbar-btn" @click.stop="copyMessageText(msg, getOriginalIndex(visibleIndex))">
                      {{ copyFeedbackIndex === getOriginalIndex(visibleIndex) ? '✅' : '📋' }} 复制
                    </button>
                    <button class="toolbar-btn regenerate" @click.stop="$emit('regenerate', getOriginalIndex(visibleIndex))">
                      🔄 重写
                    </button>
                    <!-- 😊 表情反应按钮组 -->
                    <div class="reaction-picker">
                      <template v-for="emoji in ['❤️','👍','🔥','👎']" :key="emoji">
                        <button
                          class="reaction-btn"
                          :class="{ 'active': msg.reaction === emoji }"
                          @click.stop="$emit('set-reaction', getOriginalIndex(visibleIndex), msg.reaction === emoji ? null : emoji)"
                          :title="emoji === '👎' ? '不喜欢这条' : '喜欢这条'"
                        >{{ emoji }}</button>
                      </template>
                    </div>
                    <button class="toolbar-btn more-btn" @click.stop="moreMenuIndex = moreMenuIndex === getOriginalIndex(visibleIndex) ? null : getOriginalIndex(visibleIndex)">
                      ···
                    </button>
                  </div>
                  <Transition name="dropdown">
                    <div v-if="moreMenuIndex === getOriginalIndex(visibleIndex)" class="more-menu" @click.stop>
                      <button class="more-menu-item" @click.stop="$emit('play-tts', getOriginalIndex(visibleIndex), msg.rawContent || msg.content); moreMenuIndex = null">
                        <span>🔊</span><span>朗读</span>
                      </button>
                      <button class="more-menu-item" :class="{ pinned: memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) }" @click.stop="memoryHelpers.toggleMessagePin(getOriginalIndex(visibleIndex)); moreMenuIndex = null">
                        <span>📌</span><span>{{ memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) ? '已记忆' : '记忆' }}</span>
                      </button>
                      <button class="more-menu-item" @click.stop="$emit('fork-at', getOriginalIndex(visibleIndex)); moreMenuIndex = null">
                        <span>🔀</span><span>分叉</span>
                      </button>
                      <div class="more-menu-divider"></div>
                      <button class="more-menu-item delete" @click.stop="$emit('delete-message', getOriginalIndex(visibleIndex)); moreMenuIndex = null">
                        <span>🗑️</span><span>删除</span>
                      </button>
                    </div>
                  </Transition>
                </div>
                <!-- 反应 pill（有反应时显示在气泡右下角） -->
                <div v-if="msg.reaction" class="reaction-pill" @click.stop="$emit('set-reaction', getOriginalIndex(visibleIndex), null)" title="点击取消">
                  {{ msg.reaction }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 🌅 天数分隔线 -->
        <template v-else-if="msg.type === 'day-separator'">
          <div class="day-separator">
            <div class="day-separator-line"></div>
            <span class="day-separator-label">{{ msg.content }}</span>
            <div class="day-separator-line"></div>
          </div>
        </template>
      </template>
    </TransitionGroup>

    <div v-if="isThinking" class="message-bubble flex items-start space-x-3">
      <div v-if="currentRole.avatar" class="avatar">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="$event.target.style.display='none'">
      </div>
      <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
      <div class="glass bg-glass-message rounded-2xl rounded-tl-sm px-4 py-3">
        <div class="typing-named-indicator">
          <span class="typing-name">{{ currentRole.name }} 正在思考</span>
          <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      </div>
    </div>

    <div v-if="isStreaming && !isThinking && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant')"
         class="flex items-start space-x-3">
      <div v-if="currentRole.avatar" class="avatar">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="$event.target.style.display='none'">
      </div>
      <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
      <div class="glass bg-glass-message rounded-2xl rounded-tl-sm px-4 py-3">
        <div class="typing-named-indicator">
          <span class="typing-name">{{ currentRole.name }} 正在输入</span>
          <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* 😊 表情反应 */
.reaction-picker {
  display: flex;
  align-items: center;
  gap: 1px;
}
.reaction-btn {
  font-size: 0.85rem;
  padding: 3px 4px;
  border-radius: 8px;
  line-height: 1;
  transition: transform 0.12s, background 0.12s;
  background: transparent;
  opacity: 0.55;
}
.reaction-btn:hover {
  transform: scale(1.25);
  background: rgba(255,255,255,0.1);
  opacity: 1;
}
.reaction-btn.active {
  background: rgba(99, 102, 241, 0.25);
  opacity: 1;
  transform: scale(1.15);
}
.reaction-pill {
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.reaction-pill:hover {
  background: rgba(255,255,255,0.14);
}

.tts-wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 12px;
}

.tts-wave span {
  width: 2px;
  height: 100%;
  background: #10b981;
  animation: ttsWave 0.5s ease-in-out infinite;
}

.tts-wave span:nth-child(2) {
  animation-delay: 0.1s;
}

.tts-wave span:nth-child(3) {
  animation-delay: 0.2s;
}

.tts-wave span:nth-child(4) {
  animation-delay: 0.3s;
}

@keyframes ttsWave {
  0%,
  100% {
    transform: scaleY(0.5);
  }
  50% {
    transform: scaleY(1);
  }
}

/* 搜索工具栏 */
.search-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 8px 12px;
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.search-bar-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 6px 12px;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e5e7eb;
  font-size: 14px;
  min-width: 0;
}

.search-input::placeholder {
  color: #6b7280;
}

.search-count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
  padding: 0 4px;
}

.search-nav {
  display: flex;
  gap: 2px;
}

.search-nav-btn {
  padding: 4px;
  border-radius: 6px;
  color: #9ca3af;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-nav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
}

/* 搜索匹配高亮 */
.search-match {
  position: relative;
}

.search-match::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  border: 2px solid rgba(234, 179, 8, 0.3);
  pointer-events: none;
}

.search-current::before {
  border-color: rgba(234, 179, 8, 0.8);
  box-shadow: 0 0 12px rgba(234, 179, 8, 0.25);
}

/* 搜索栏动画 */
.search-bar-enter-active,
.search-bar-leave-active {
  transition: all 0.2s ease;
}

.search-bar-enter-from,
.search-bar-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>

