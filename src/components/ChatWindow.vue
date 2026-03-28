<script setup>
import { computed, ref, watch } from 'vue';
import { renderMarkdown } from '../utils/markdown';
import { parseDualLayerResponse, getCustomStyleVars } from '../utils/textParser';

const props = defineProps({
  messages: { type: Array, required: true },
  currentRole: { type: Object, required: true },
  globalSettings: { type: Object, required: true },
  isStreaming: Boolean,
  isThinking: Boolean,
  activeMessageIndex: Number,
  ttsState: Object,
  memoryFunctions: Object
});

const emit = defineEmits([
  'toggle-select', 'toggle-thinking', 'start-edit',
  'delete-message', 'regenerate', 'play-tts'
]);

const containerRef = ref(null);

defineExpose({
  get scrollTop() { return containerRef.value?.scrollTop || 0; },
  set scrollTop(value) { if (containerRef.value) containerRef.value.scrollTop = value; },
  get scrollHeight() { return containerRef.value?.scrollHeight || 0; }
});

const memoryHelpers = computed(() => props.memoryFunctions || {
  isMessagePinned: () => false, toggleMessagePin: () => {}
});

const MESSAGE_FOLD_THRESHOLD = 50;
const MESSAGES_PER_PAGE = 20;
const showAllMessages = ref(false);
const visibleCount = ref(MESSAGE_FOLD_THRESHOLD);

watch(() => props.messages.length, (newLen) => {
  if (newLen === 0) { showAllMessages.value = false; visibleCount.value = MESSAGE_FOLD_THRESHOLD; }
});

const shouldFold = computed(() => props.messages.length > MESSAGE_FOLD_THRESHOLD && !showAllMessages.value);
const hiddenCount = computed(() => shouldFold.value ? Math.max(0, props.messages.length - visibleCount.value) : 0);
const visibleMessages = computed(() => shouldFold.value ? props.messages.slice(-visibleCount.value) : props.messages);

function loadMoreMessages() {
  visibleCount.value = Math.min(visibleCount.value + MESSAGES_PER_PAGE, props.messages.length);
  if (visibleCount.value >= props.messages.length) showAllMessages.value = true;
}

function getOriginalIndex(visibleIndex) {
  return shouldFold.value ? props.messages.length - visibleCount.value + visibleIndex : visibleIndex;
}

function safeParseMessage(message) {
  const source = message?.rawContent || message?.content || '';
  let parsed = { reasoning: null, inner: null, content: '' };
  try { parsed = parseDualLayerResponse(source) || parsed; } catch (e) { console.warn('Parser error:', e); }
  return {
    thought: (parsed.reasoning || message?.thinking || '').trim(),
    inner: (parsed.inner || message?.inner || '').trim(),
    bodyHtml: parsed.content,
    raw: source
  };
}

function getReasoningStatus(message) {
  const raw = message?.rawContent || message?.content || '';
  if (raw.includes('<think>') && !raw.includes('</think>')) return { icon: '✨', isThinking: true };
  if (message?.thinkingComplete || raw.includes('</think>') || message?.thinking) return { icon: '💡', isThinking: false };
  return null;
}

const parseCache = new Map();
const parsedMessages = computed(() => {
  return visibleMessages.value.map((msg, visibleIndex) => {
    const originalIndex = getOriginalIndex(visibleIndex);
    const isLastMessage = originalIndex === props.messages.length - 1;
    const source = msg?.rawContent || msg?.content || '';
    if (isLastMessage && props.isStreaming) return safeParseMessage(msg);
    const cacheKey = `${originalIndex}-${source.length}-${source.slice(-50)}`;
    if (parseCache.has(cacheKey)) return parseCache.get(cacheKey);
    const parsed = safeParseMessage(msg);
    parseCache.set(cacheKey, parsed);
    if (parseCache.size > 200) parseCache.delete(parseCache.keys().next().value);
    return parsed;
  });
});

function handleChatAreaClick(event) {
  if (event.target === event.currentTarget) emit('toggle-select', null);
}
</script>

<template>
  <main ref="containerRef"
        class="chat-main"
        :class="{ 'mode-immersive': globalSettings.immersiveMode }"
        @click="handleChatAreaClick">

    <!-- 开场白 -->
    <div v-if="messages.length === 0 && currentRole.firstMessage" class="msg-row ai">
      <div v-if="currentRole.avatar" class="ai-ava">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="ai-ava ai-ava-placeholder">🎭</div>
      <div class="ai-body">
        <div class="ai-bubble">
          <div class="markdown-body message-content" v-html="renderMarkdown(currentRole.firstMessage)"></div>
        </div>
      </div>
    </div>

    <!-- 折叠提示 -->
    <div v-if="hiddenCount > 0" class="load-more-wrap">
      <button class="load-more-btn" @click="loadMoreMessages">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
        </svg>
        加载更多消息（{{ hiddenCount }} 条隐藏）
      </button>
    </div>

    <!-- 消息列表 -->
    <TransitionGroup name="message" tag="div">
      <template v-for="(msg, visibleIndex) in visibleMessages" :key="getOriginalIndex(visibleIndex)">

        <!-- 用户消息 -->
        <template v-if="msg.role === 'user'">
          <div class="msg-row user">
            <div class="message-wrapper">
              <div class="user-bubble"
                   :class="{ selected: activeMessageIndex === getOriginalIndex(visibleIndex) }"
                   @click.stop="$emit('toggle-select', getOriginalIndex(visibleIndex))">
                <div class="message-body message-content" v-html="renderMarkdown(msg.content || '')"></div>
              </div>
              <div class="message-toolbar" :class="{ active: activeMessageIndex === getOriginalIndex(visibleIndex) }">
                <div class="toolbar-inner">
                  <button class="toolbar-btn pin"
                          :class="{ pinned: memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) }"
                          @click.stop="memoryHelpers.toggleMessagePin(getOriginalIndex(visibleIndex))">
                    📌 {{ memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) ? '已记忆' : '记忆' }}
                  </button>
                  <button class="toolbar-btn" @click.stop="$emit('start-edit', getOriginalIndex(visibleIndex))">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    编辑
                  </button>
                  <button class="toolbar-btn delete" @click.stop="$emit('delete-message', getOriginalIndex(visibleIndex))">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    删除
                  </button>
                </div>
              </div>
            </div>
            <div v-if="globalSettings.userAvatar" class="user-ava">
              <img :src="globalSettings.userAvatar" alt="User Avatar" class="w-full h-full rounded-full object-cover">
            </div>
            <div v-else class="user-ava user-ava-placeholder">👤</div>
          </div>
        </template>

        <!-- AI消息 -->
        <template v-else-if="msg.role === 'assistant'">
          <div class="msg-row ai">
            <div v-if="currentRole.avatar" class="ai-ava">
              <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
            </div>
            <div v-else class="ai-ava ai-ava-placeholder">🎭</div>

            <div class="ai-body">
              <!-- 推理过程 -->
              <details v-if="globalSettings.showLogic && parsedMessages[visibleIndex]?.thought" class="reasoning-block">
                <summary>
                  <span class="reasoning-icon" :class="{ streaming: getReasoningStatus(msg)?.isThinking }">
                    {{ getReasoningStatus(msg)?.icon || '💡' }}
                  </span>
                </summary>
                <div class="reasoning-content">{{ parsedMessages[visibleIndex].thought }}</div>
              </details>

              <!-- 内心戏 -->
              <div v-if="globalSettings.showInner && parsedMessages[visibleIndex]?.inner" class="thought-cloud">
                <span class="thought-icon">💭</span>
                <span>{{ parsedMessages[visibleIndex].inner }}</span>
              </div>

              <!-- 主气泡 -->
              <div class="ai-bubble"
                   :class="{ selected: activeMessageIndex === getOriginalIndex(visibleIndex) }"
                   :style="getCustomStyleVars(globalSettings)"
                   @click.stop="$emit('toggle-select', getOriginalIndex(visibleIndex))">
                <div class="message-body vn-body message-content"
                     :class="{ 'typing-cursor': isStreaming && getOriginalIndex(visibleIndex) === messages.length - 1 }"
                     v-html="parsedMessages[visibleIndex]?.bodyHtml"></div>
              </div>

              <!-- 工具栏 -->
              <div class="message-toolbar" :class="{ active: activeMessageIndex === getOriginalIndex(visibleIndex) }">
                <div class="toolbar-inner">
                  <button class="toolbar-btn tts"
                          :class="{ playing: ttsState?.playingIndex === getOriginalIndex(visibleIndex) }"
                          @click.stop="$emit('play-tts', getOriginalIndex(visibleIndex), msg.rawContent || msg.content)">
                    <template v-if="ttsState?.playingIndex === getOriginalIndex(visibleIndex)">
                      <div class="tts-wave"><span></span><span></span><span></span><span></span></div>停止
                    </template>
                    <template v-else>🔊 朗读</template>
                  </button>
                  <button class="toolbar-btn pin"
                          :class="{ pinned: memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) }"
                          @click.stop="memoryHelpers.toggleMessagePin(getOriginalIndex(visibleIndex))">
                    📌 {{ memoryHelpers.isMessagePinned(getOriginalIndex(visibleIndex)) ? '已记忆' : '记忆' }}
                  </button>
                  <button class="toolbar-btn" @click.stop="$emit('start-edit', getOriginalIndex(visibleIndex))">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    编辑
                  </button>
                  <button class="toolbar-btn regenerate" @click.stop="$emit('regenerate', getOriginalIndex(visibleIndex))">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    重写
                  </button>
                  <button class="toolbar-btn delete" @click.stop="$emit('delete-message', getOriginalIndex(visibleIndex))">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

      </template>
    </TransitionGroup>

    <!-- 打字指示 -->
    <div v-if="isThinking" class="msg-row ai">
      <div v-if="currentRole.avatar" class="ai-ava">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="ai-ava ai-ava-placeholder">🎭</div>
      <div class="ai-body">
        <div class="typing-bubble">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>

    <div v-if="isStreaming && !isThinking && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant')"
         class="msg-row ai">
      <div v-if="currentRole.avatar" class="ai-ava">
        <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover">
      </div>
      <div v-else class="ai-ava ai-ava-placeholder">🎭</div>
      <div class="ai-body">
        <div class="typing-bubble">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>

  </main>
</template>

<style scoped>
/* ── 聊天主区域 ── */
.chat-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: var(--paper);
  transition: background .3s;
  -webkit-overflow-scrolling: touch;
}
.chat-main::-webkit-scrollbar { width: 3px; }
.chat-main::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── 消息行 ── */
.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  animation: msgIn .28s cubic-bezier(.2,0,.3,1);
}
.msg-row.user { justify-content: flex-end; }
.msg-row.ai  { justify-content: flex-start; }

@keyframes msgIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── 头像 ── */
.ai-ava {
  width: 38px; height: 38px; border-radius: 50%;
  flex-shrink: 0; overflow: hidden; margin-top: 2px;
  border: 1.5px solid rgba(196,150,58,0.35);
  background: linear-gradient(135deg, #c4b8ae, #9e8478);
  transition: all .3s;
}
[data-theme="dark"] .ai-ava {
  background: linear-gradient(135deg, #a090e0, #6040c0);
  border-color: rgba(139,120,255,0.3);
  box-shadow: 0 0 8px rgba(139,120,255,0.2);
}
.ai-ava-placeholder {
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.user-ava {
  width: 34px; height: 34px; border-radius: 50%;
  flex-shrink: 0; overflow: hidden;
  border: 1.5px solid var(--border);
  background: linear-gradient(135deg, #b8a89a, #8b6f5e);
}
.user-ava-placeholder {
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}

/* ── AI消息体 ── */
.ai-body { flex: 1; min-width: 0; max-width: 80%; }

/* ── 气泡 ── */
.ai-bubble {
  background: var(--ai-bubble-bg);
  border: 1px solid var(--ai-bubble-border);
  border-radius: 4px 16px 16px 16px;
  padding: 14px 16px;
  font-family: 'Noto Serif SC', serif;
  font-size: 15px; line-height: 1.85;
  box-shadow: 0 1px 6px var(--shadow);
  cursor: pointer;
  transition: background .3s, border-color .3s, transform .2s;
  word-break: break-word;
}
.ai-bubble:hover { transform: translateY(-1px); }
.ai-bubble.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--brush), 0 4px 12px var(--shadow);
}

.user-bubble {
  background: var(--user-bubble-bg);
  color: var(--user-bubble-text);
  border-radius: 18px 4px 18px 18px;
  padding: 11px 15px;
  font-size: 15px; line-height: 1.65;
  box-shadow: 0 2px 10px var(--shadow-lg);
  cursor: pointer;
  transition: background .3s, color .3s, transform .2s;
  word-break: break-word;
}
.user-bubble:hover { transform: translateY(-1px); }
.user-bubble.selected { box-shadow: 0 0 0 2px var(--accent), 0 4px 12px var(--shadow-lg); }

/* ── 内心戏 ── */
.thought-cloud {
  background: var(--thought-bg);
  border-left: 2px solid var(--thought-border);
  border-radius: 0 10px 10px 0;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ink-faint);
  font-style: italic;
  line-height: 1.6;
  display: flex; gap: 7px; align-items: flex-start;
  transition: background .3s, border-color .3s, color .3s;
}
.thought-icon { font-size: 12px; flex-shrink: 0; opacity: .7; margin-top: 1px; }

/* ── 打字指示 ── */
.typing-bubble {
  display: flex; align-items: center; gap: 4px;
  padding: 12px 16px;
  background: var(--ai-bubble-bg);
  border: 1px solid var(--ai-bubble-border);
  border-radius: 4px 16px 16px 16px;
  width: fit-content;
  box-shadow: 0 1px 6px var(--shadow);
  transition: background .3s;
}
.typing-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--dot-color);
  animation: typingBounce 1.2s infinite;
}
.typing-dot:nth-child(2) { animation-delay: .2s; }
.typing-dot:nth-child(3) { animation-delay: .4s; }
@keyframes typingBounce {
  0%,60%,100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-5px); opacity: 1; }
}

/* ── 折叠按钮 ── */
.load-more-wrap { display: flex; justify-content: center; }
.load-more-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 18px; border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--paper-warm); color: var(--ink-faint);
  font-family: 'Noto Sans SC', sans-serif; font-size: 13px;
  cursor: pointer; transition: all .15s;
}
.load-more-btn:active { background: var(--brush); }

/* ── 工具栏 ── */
.message-wrapper { position: relative; }
.message-toolbar {
  max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height .3s ease, opacity .2s ease, margin-top .3s ease;
  margin-top: 0;
}
.message-toolbar.active { max-height: 200px; overflow: visible; opacity: 1; margin-top: 8px; }

.toolbar-inner {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 8px 10px;
  background: var(--paper-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--shadow);
  transition: background .3s, border-color .3s;
}
.toolbar-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 8px;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 12px; color: var(--ink-faint);
  background: transparent; border: none; cursor: pointer;
  transition: all .15s;
}
.toolbar-btn:hover { background: var(--brush); color: var(--ink); }
.toolbar-btn:active { transform: scale(.92); }
.toolbar-btn.pin { color: var(--accent-gold); }
.toolbar-btn.pin.pinned { background: rgba(196,150,58,0.15); }
.toolbar-btn.delete:hover { background: rgba(192,112,112,0.15); color: #c07070; }
.toolbar-btn.regenerate:hover { background: rgba(100,180,100,0.15); color: #5a9e5a; }
.toolbar-btn.tts { color: var(--accent); }
.toolbar-btn.tts.playing { background: var(--brush); }

/* ── TTS波形 ── */
.tts-wave { display: flex; align-items: center; gap: 2px; height: 12px; }
.tts-wave span {
  width: 2px; height: 100%;
  background: var(--accent);
  animation: ttsWave .5s ease-in-out infinite;
}
.tts-wave span:nth-child(2) { animation-delay: .1s; }
.tts-wave span:nth-child(3) { animation-delay: .2s; }
.tts-wave span:nth-child(4) { animation-delay: .3s; }
@keyframes ttsWave {
  0%,100% { transform: scaleY(.5); }
  50% { transform: scaleY(1); }
}
</style>