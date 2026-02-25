<script setup>
import { computed, ref, watch } from 'vue';
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
  memoryFunctions: Object
});

const emit = defineEmits([
  'toggle-select',
  'toggle-thinking',
  'start-edit',
  'delete-message',
  'regenerate',
  'play-tts'
]);

const containerRef = ref(null);

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
</script>

<template>
  <main ref="containerRef" class="flex-1 overflow-y-auto p-4 space-y-4" @click="handleChatAreaClick"
        :class="{ 'mode-immersive': globalSettings.immersiveMode }">

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
          <div class="message-bubble flex flex-col items-end">
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
          <div class="message-bubble flex flex-col items-start">
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
</style>
