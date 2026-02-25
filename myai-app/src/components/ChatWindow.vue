<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { renderMarkdown } from '../utils/markdown';
import { parseDualLayerResponse, getCustomStyleVars } from '../utils/textParser';

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
  currentMatchIndex: { type: Number, default: 0 }
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
  'close-search'
]);

const containerRef = ref(null);
const searchInputRef = ref(null);

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
  let parsed = { reasoning: null, inner: null, content: '' };

  try {
    parsed = parseDualLayerResponse(source) || parsed;
  } catch (e) {
    console.warn('Parser error:', e);
    parsed = { reasoning: null, inner: null, content: '' };
  }

  // Use parser output, fallback to message.thinking for R1 reasoning_content
  const thought = (parsed.reasoning || message?.thinking || '').trim();
  const inner = (parsed.inner || message?.inner || '').trim();
  
  // CRITICAL: Do NOT fallback to source! The parser returns empty content 
  // intentionally during streaming to prevent flash/leak
  const bodyHtml = parsed.content;

  return {
    thought,
    inner,
    bodyHtml,
    raw: source
  };
}

// 动态计算思考图标状态
function getReasoningStatus(message, index) {
  const raw = message?.rawContent || message?.content || '';
  const isLastMessage = index === props.messages.length - 1;
  
  // 状态 A: 正在思考 (有开头，没结尾) -> 显示 ✨
  if (raw.includes('<think>') && !raw.includes('</think>')) {
    return { icon: '✨', isThinking: true };
  }
  
  // 状态 B: 思考完成 -> 立马显示 💡
  // Check message.thinkingComplete or if </think> is present
  if (message?.thinkingComplete || raw.includes('</think>') || message?.thinking) {
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
  <main ref="containerRef" class="flex-1 overflow-y-auto p-4 space-y-4" @click="handleChatAreaClick"
        :class="{ 'mode-immersive': globalSettings.immersiveMode }">

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

    <!-- 欢迎消息 / 开场白 -->
    <div v-if="messages.length === 0 && currentRole.firstMessage" class="message-bubble flex items-start space-x-3">
      <div v-if="currentRole.avatar" class="avatar">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
      <div class="max-w-[80%]">
        <div class="glass bg-glass-message rounded-2xl rounded-tl-sm px-4 py-3 text-gray-100 text-shadow-light">
          <div class="markdown-body message-content" v-html="renderMarkdown(currentRole.firstMessage)"></div>
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
               :data-msg-index="getOriginalIndex(visibleIndex)"
               :class="{ 'search-match': isSearchMatch(getOriginalIndex(visibleIndex)), 'search-current': isCurrentMatch(getOriginalIndex(visibleIndex)) }">
            <div class="flex items-start justify-end space-x-3 space-x-reverse w-full">
              <div class="max-w-[80%] message-wrapper">
                <div @click.stop="$emit('toggle-select', getOriginalIndex(visibleIndex))"
                     class="user-speech-bubble cursor-pointer"
                     :class="{ 'selected': activeMessageIndex === getOriginalIndex(visibleIndex) }">
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
                  </div>
                </div>
              </div>
              <div v-if="globalSettings.userAvatar" class="avatar flex-shrink-0">
                <img :src="globalSettings.userAvatar" alt="User Avatar" class="w-full h-full rounded-full object-cover">
              </div>
              <div v-else class="avatar-placeholder avatar-user text-white flex-shrink-0">👤</div>
            </div>
          </div>
        </template>

        <template v-else-if="msg.role === 'assistant'">
          <div class="message-bubble flex flex-col items-start"
               :data-msg-index="getOriginalIndex(visibleIndex)"
               :class="{ 'search-match': isSearchMatch(getOriginalIndex(visibleIndex)), 'search-current': isCurrentMatch(getOriginalIndex(visibleIndex)) }">
            <div class="flex items-start space-x-3 w-full">
              <div v-if="currentRole.avatar" class="avatar flex-shrink-0">
                <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
              </div>
              <div v-else class="avatar-placeholder avatar-ai text-white flex-shrink-0">🎭</div>

              <div class="max-w-[80%] message-wrapper">
                <!-- Layer 0: R1 Reasoning (折叠图标: ✨ 思考中, 💡 思考完成) -->
                <details v-if="globalSettings.showLogic && parsedMessages[visibleIndex]?.thought" class="reasoning-block">
                  <summary>
                    <span class="reasoning-icon" :class="{ 'streaming': getReasoningStatus(msg, getOriginalIndex(visibleIndex))?.isThinking }">
                      {{ getReasoningStatus(msg, getOriginalIndex(visibleIndex))?.icon || '💡' }}
                    </span>
                  </summary>
                  <div class="reasoning-content">{{ parsedMessages[visibleIndex].thought }}</div>
                </details>

                <!-- Layer 2: Thought Cloud (Character Inner Thoughts) - 云朵气泡 -->
                <div v-if="globalSettings.showInner && parsedMessages[visibleIndex]?.inner" class="thought-cloud">
                  {{ parsedMessages[visibleIndex].inner }}
                </div>

                <div @click.stop="$emit('toggle-select', getOriginalIndex(visibleIndex))"
                     class="speech-bubble cursor-pointer"
                     :class="['style-' + globalSettings.rpTextStyle, { 'selected': activeMessageIndex === getOriginalIndex(visibleIndex) }]"
                     :style="getCustomStyleVars(globalSettings)">
                  <div class="message-body vn-body message-content"
                       :class="{ 'typing-cursor': isStreaming && getOriginalIndex(visibleIndex) === messages.length - 1 }"
                       v-html="parsedMessages[visibleIndex]?.bodyHtml"></div>
                </div>

                <div class="message-toolbar" :class="{ 'active': activeMessageIndex === getOriginalIndex(visibleIndex) }">
                  <div class="toolbar-inner">
                    <button class="toolbar-btn tts"
                            :class="{ 'playing': ttsState?.playingIndex === getOriginalIndex(visibleIndex) }"
                            @click.stop="$emit('play-tts', getOriginalIndex(visibleIndex), msg.rawContent || msg.content)">
                      <template v-if="ttsState?.playingIndex === getOriginalIndex(visibleIndex)">
                        <div class="tts-wave">
                          <span></span><span></span><span></span><span></span>
                        </div>
                        停止
                      </template>
                      <template v-else>🔊 朗读</template>
                    </button>
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
                    <button class="toolbar-btn regenerate" @click.stop="$emit('regenerate', getOriginalIndex(visibleIndex))">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                      重写
                    </button>
                    <button class="toolbar-btn delete" @click.stop="$emit('delete-message', getOriginalIndex(visibleIndex))">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </TransitionGroup>

    <div v-if="isThinking" class="message-bubble flex items-start space-x-3">
      <div v-if="currentRole.avatar" class="avatar">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
      <div class="glass bg-glass-message rounded-2xl rounded-tl-sm px-4 py-3">
        <div class="typing-indicator">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    </div>

    <div v-if="isStreaming && !isThinking && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant')"
         class="flex items-start space-x-3">
      <div v-if="currentRole.avatar" class="avatar">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
      <div class="glass bg-glass-message rounded-2xl rounded-tl-sm px-4 py-3">
        <div class="flex space-x-1">
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
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
