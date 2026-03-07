<script setup>
/**
 * NovelMode.vue — 小说冒险模式主界面
 * 视觉设计来自 novel-mode.html，功能接入真实 API 流式调用
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { streamChat, parseStateFromResponse, extractNarrative, buildNovelSystemPrompt, callChat } from '../../utils/novelUtils.js';
import BookSettings from './BookSettings.vue';

const props = defineProps({
  book:           { type: Object, required: true },
  save:           { type: Object, default: null },  // null = new game
  slotIndex:      { type: Number, default: 0 },
  globalSettings: { type: Object, required: true },
});

const emit = defineEmits(['exit', 'save-book', 'delete-save']);

// ── 书籍/存档状态 ──
const currentState      = ref(props.save?.state || {});
const messages          = ref(props.save?.messages ? [...props.save.messages] : []);
const chapterTitle      = ref(props.save?.chapterTitle || '');
const chapterSummaries  = ref(props.save?.chapterSummaries ? [...props.save.chapterSummaries] : []);
const isNewGame         = !props.save;

// ── 小说显示块 ──
// blocks = [{ type: 'narr'|'player', text, events }]
const displayBlocks = ref([]);

// ── UI 状态 ──
const isStreaming    = ref(false);
const streamingText  = ref('');
const userInput      = ref('');
const suggestions    = ref([]);
const showSidebar    = ref(false);
const showSettings   = ref(false);
const showSaveModal  = ref(false);
const novelAreaRef   = ref(null);
const inputRef       = ref(null);
const abortCtrl      = ref(null);
const toast          = ref({ show: false, msg: '' });
let toastTimer       = null;

// ── STATE 侧边栏 ──
const stateStats    = computed(() => currentState.value?.stats || {});
const stateItems    = computed(() => currentState.value?.items || []);
const stateNpcs     = computed(() => currentState.value?.npcs  || []);
const stateLocation = computed(() => currentState.value?.location || null);
const stateQuests   = computed(() => currentState.value?.quests || []);

// ── API 设置 ──
const apiSettings = computed(() => ({
  baseUrl: props.globalSettings.baseUrl || 'https://api.deepseek.com',
  apiKey:  props.globalSettings.apiKey || '',
  model:   props.globalSettings.model  || 'deepseek-chat',
}));

// ── 初始化消息历史 → 显示块 ──
function rebuildDisplayBlocks() {
  const blocks = [];
  for (const msg of messages.value) {
    if (msg.role === 'user') {
      blocks.push({ type: 'player', text: msg.content });
    } else if (msg.role === 'assistant') {
      const narr = extractNarrative(msg.content);
      const st   = parseStateFromResponse(msg.content);
      blocks.push({
        type: 'narr',
        text: narr,
        events: st?.events || [],
      });
    }
    // skip system messages in display
  }
  displayBlocks.value = blocks;
}

// ── 系统提示词 ──
function getSystemPrompt() {
  return buildNovelSystemPrompt(props.book, {
    chapterSummaries: chapterSummaries.value,
  });
}

// ── 滑动窗口：按字符数截取最近的消息（避免超上下文窗口）──
const MSG_CHAR_LIMIT = 8000;

function buildMessageWindow(allMessages) {
  const filtered = allMessages.filter(m => m.role === 'user' || m.role === 'assistant');
  let charCount = 0;
  const window = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    charCount += (filtered[i].content || '').length;
    if (charCount > MSG_CHAR_LIMIT && window.length > 0) break;
    window.unshift(filtered[i]);
  }
  return window;
}

// ── API messages 构造（使用滑动窗口）──
function buildApiMessages(userText) {
  const windowMsgs = buildMessageWindow(messages.value);
  const apiMsgs = [
    { role: 'system', content: getSystemPrompt() },
    ...windowMsgs,
  ];
  if (userText) {
    apiMsgs.push({ role: 'user', content: userText });
  }
  return apiMsgs;
}

// ── 开始新游戏（生成初始场景）──
async function initNewGame() {
  if (!apiSettings.value.apiKey) {
    showToast('请先配置 API Key');
    return;
  }
  isStreaming.value  = true;
  streamingText.value = '';

  const sysPrompt = getSystemPrompt();
  const promptMessages = [
    { role: 'system', content: sysPrompt },
    {
      role: 'user',
      content: '请生成开场叙事，介绍主角所处的世界与初始状态，并在末尾附带完整的 STATE JSON。叙事应当引人入胜，为冒险奠定基础。',
    },
  ];

  try {
    abortCtrl.value = new AbortController();
    let fullText = '';
    await streamChat(
      promptMessages,
      apiSettings.value,
      (delta, full) => {
        streamingText.value = full;
        fullText = full;
        scrollToBottom();
      },
      abortCtrl.value.signal,
    );

    await finalizeResponse(fullText, null);
  } catch (err) {
    if (err.name !== 'AbortError') showToast(`生成失败: ${err.message}`);
    displayBlocks.value.pop(); // remove streaming block if any
  } finally {
    isStreaming.value  = false;
    streamingText.value = '';
    scrollToBottom();
  }
}

// ── 发送玩家行动 ──
async function sendAction() {
  const text = userInput.value.trim();
  if (!text || isStreaming.value) return;
  if (!apiSettings.value.apiKey) {
    showToast('请先配置 API Key');
    return;
  }

  // 1. 显示玩家行动块
  displayBlocks.value.push({ type: 'player', text });
  messages.value.push({ role: 'user', content: text });
  userInput.value = '';
  resetInputHeight();
  scrollToBottom();

  // 2. 开始流式生成
  isStreaming.value   = true;
  streamingText.value = '';

  const apiMsgs = buildApiMessages(null); // user msg already pushed

  try {
    abortCtrl.value = new AbortController();
    let fullText = '';
    await streamChat(
      apiMsgs,
      apiSettings.value,
      (delta, full) => {
        streamingText.value = full;
        fullText = full;
        scrollToBottom();
      },
      abortCtrl.value.signal,
    );

    await finalizeResponse(fullText, text);
  } catch (err) {
    if (err.name !== 'AbortError') showToast(`生成失败: ${err.message}`);
    isStreaming.value = false;
    streamingText.value = '';
  } finally {
    isStreaming.value = false;
    streamingText.value = '';
    scrollToBottom();
  }
}

async function finalizeResponse(fullText, _userText) {
  const narrative = extractNarrative(fullText);
  const newState  = parseStateFromResponse(fullText);

  // Push narr block
  displayBlocks.value.push({
    type: 'narr',
    text: narrative,
    events: newState?.events || [],
  });

  // Push to message history (store full with STATE for context)
  messages.value.push({ role: 'assistant', content: fullText });

  // Update STATE
  if (newState) {
    currentState.value = newState;
    if (newState.suggestions?.length) suggestions.value = newState.suggestions;
    if (newState.chapterTitle) chapterTitle.value = newState.chapterTitle;
  }

  // Auto-save
  await autoSave();

  // ── 章节摘要触发（后台静默，不阻塞玩家输入）──
  const assistantCount = messages.value.filter(m => m.role === 'assistant').length;
  const SUMMARY_INTERVAL = 20;
  if (assistantCount > 0 && assistantCount % SUMMARY_INTERVAL === 0) {
    triggerChapterSummary();
  }
}

// ── 自动存档 ──
async function autoSave() {
  emit('save-book', {
    slotIndex: props.slotIndex,
    saveData: {
      slotIndex: props.slotIndex,
      label: `存档${props.slotIndex + 1}`,
      updatedAt: Date.now(),
      chapterTitle: chapterTitle.value,
      state: currentState.value,
      messages: messages.value,
      chapterSummaries: chapterSummaries.value,
    },
  });
}

// ── 章节摘要生成（后台非流式，不阻塞 UI）──
async function triggerChapterSummary() {
  try {
    // 取滑动窗口外的旧消息作为摘要材料
    const windowMsgs = buildMessageWindow(messages.value);
    const windowFirstIdx = messages.value.indexOf(windowMsgs[0]);
    if (windowFirstIdx <= 0) return; // 没有窗口外的旧消息，无需摘要

    const oldMessages = messages.value.slice(0, windowFirstIdx)
      .filter(m => m.role === 'user' || m.role === 'assistant');
    if (oldMessages.length < 4) return; // 太短不值得摘要

    // 取最近 20 条旧消息的叙事文本
    const recentOld = oldMessages.slice(-20)
      .map(m => {
        if (m.role === 'user') return `[玩家行动] ${m.content}`;
        return extractNarrative(m.content).slice(0, 300);
      })
      .join('\n');

    const summaryPrompt = [
      { role: 'system', content: `你是一个小说章节摘要生成器。请用 2-4 句话概括以下叙事内容的核心事件和变化，保留重要人名、地名、变故。用第三人称客观叙述，不加任何标题或格式。` },
      { role: 'user', content: recentOld },
    ];

    const summary = await callChat(summaryPrompt, apiSettings.value);
    if (summary?.trim()) {
      chapterSummaries.value.push({
        round: messages.value.filter(m => m.role === 'assistant').length,
        summary: summary.trim(),
        createdAt: Date.now(),
      });
      // 摘要生成后自动存档（持久化 chapterSummaries）
      await autoSave();
    }
  } catch (err) {
    console.warn('[NovelMode] 章节摘要生成失败:', err.message);
    // 静默失败，不影响玩家体验
  }
}

// ── 手动存档弹窗 ──
async function openSaveModal() {
  await autoSave();
  showToast('已保存');
}

// ── 行动建议 ──
function useSuggestion(text) {
  userInput.value = text;
  nextTick(() => inputRef.value?.focus());
}

// ── 滚动 ──
async function scrollToBottom() {
  await nextTick();
  if (novelAreaRef.value) {
    novelAreaRef.value.scrollTop = novelAreaRef.value.scrollHeight;
  }
}

// ── textarea 自动高度 ──
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function resetInputHeight() {
  if (inputRef.value) inputRef.value.style.height = 'auto';
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAction();
  }
}

// ── Toast ──
function showToast(msg) {
  toast.value = { show: true, msg };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value.show = false; }, 2500);
}

// ── 书籍设置回调 ──
function handleBookUpdated(updates) {
  emit('save-book', { bookUpdates: updates });
  showSettings.value = false;
}

function handleDeleteBook() {
  if (confirm('确定删除整本书？此操作无法撤销！')) {
    emit('save-book', { deleteBook: true });
    emit('exit');
  }
}

// ── 初始化 ──
onMounted(async () => {
  if (messages.value.length > 0) {
    rebuildDisplayBlocks();
    await nextTick();
    scrollToBottom();
    // restore suggestions from last save
    const lastState = currentState.value;
    if (lastState?.suggestions) suggestions.value = lastState.suggestions;
  } else if (isNewGame) {
    await initNewGame();
  }
});

onUnmounted(() => {
  clearTimeout(toastTimer);
  abortCtrl.value?.abort();
});

// ── STATE 侧边栏：通用渲染 ──
function renderStatValue(stat) {
  // { value, max } → "value / max"
  if (stat.max !== undefined && stat.max !== null) return `${stat.value} / ${stat.max}`;
  return stat.value ?? '';
}

function npcDots(npc) {
  const rel = Math.max(-5, Math.min(5, npc.relation || 0));
  const abs = Math.abs(rel);
  const type = rel > 0 ? 'ally' : rel < 0 ? 'enemy' : 'neutral';
  return Array(5).fill(null).map((_, i) => ({ filled: i < abs, type }));
}
</script>

<template>
  <div class="novel-mode">
    <!-- ── 顶栏 ── -->
    <nav class="topbar">
      <button class="topbar-back" @click="$emit('exit')" title="返回书库">←</button>
      <div class="topbar-title">
        <span class="topbar-name">{{ book.title }}</span>
        <span class="topbar-chapter">{{ chapterTitle }}</span>
      </div>
      <div class="topbar-actions">
        <button class="top-btn" @click="openSaveModal" title="存档">🔖</button>
        <button class="top-btn" @click="showSettings = true" title="书籍设置">⚙</button>
      </div>
    </nav>

    <!-- ── 主体布局 ── -->
    <div class="layout">
      <!-- 侧边栏 -->
      <aside class="sidebar" :class="{ open: showSidebar }">
        <!-- 修为/通用 stats -->
        <div class="s-section" v-if="Object.keys(stateStats).length">
          <div class="s-title">状态</div>
          <template v-for="(stat, key) in stateStats" :key="key">
            <!-- has progress bar -->
            <div v-if="stat.progress !== undefined" class="realm-card">
              <div class="realm-name">{{ renderStatValue(stat) }}</div>
              <div class="realm-sub">{{ key }}</div>
              <div class="exp-bar">
                <div class="exp-fill" :style="{ width: stat.progress + '%' }"></div>
              </div>
            </div>
            <!-- has max (fraction) -->
            <div v-else-if="stat.max !== undefined" class="stat-row">
              <span class="sl">{{ key }}</span>
              <span class="sv">{{ stat.value }} / {{ stat.max }}</span>
            </div>
            <!-- plain value -->
            <div v-else class="stat-row">
              <span class="sl">{{ key }}</span>
              <span class="sv">{{ stat.value }}</span>
            </div>
          </template>
        </div>

        <!-- 持有物品 -->
        <div class="s-section" v-if="stateItems.length">
          <div class="s-title">持有</div>
          <div class="items-wrap">
            <span
              v-for="item in stateItems"
              :key="item.name"
              :class="['item-chip', item.rarity]"
            >{{ item.name }}{{ item.count && item.count > 1 ? ` ×${item.count}` : '' }}</span>
          </div>
        </div>

        <!-- NPC 关系 -->
        <div class="s-section" v-if="stateNpcs.length">
          <div class="s-title">关系</div>
          <div v-for="npc in stateNpcs" :key="npc.name" class="npc-item">
            <div class="npc-info">
              <span class="npc-name">{{ npc.name }}</span>
              <span class="npc-role">{{ npc.role }}</span>
            </div>
            <div class="rel-dots">
              <div
                v-for="(dot, di) in npcDots(npc)"
                :key="di"
                :class="['rdot', dot.filled && dot.type]"
              ></div>
            </div>
          </div>
        </div>

        <!-- 当前位置 -->
        <div class="s-section" v-if="stateLocation">
          <div class="s-title">当前</div>
          <div class="location-badge">
            <span class="loc-icon">🏮</span>
            <div class="loc-text">
              <span class="loc-main">{{ stateLocation.main }}</span>
              <span class="loc-sub">{{ stateLocation.sub }}</span>
            </div>
          </div>
        </div>

        <!-- 任务 -->
        <div class="s-section" v-if="stateQuests.length">
          <div class="s-title">任务</div>
          <div
            v-for="quest in stateQuests"
            :key="quest.text"
            :class="['quest-item', quest.active && 'active']"
          >
            <div class="quest-dot"></div>
            <span>{{ quest.text }}</span>
          </div>
        </div>

        <!-- Empty state hint -->
        <div v-if="!Object.keys(stateStats).length && !stateItems.length && !stateNpcs.length" class="sidebar-empty">
          <span>冒险开始后状态将显示在这里</span>
        </div>
      </aside>

      <!-- ── 中央内容 ── -->
      <main class="center">
        <div class="novel-area" ref="novelAreaRef">
          <div class="novel-inner">

            <!-- Chapter header if we have title -->
            <div v-if="chapterTitle" class="ch-header">
              <div class="ch-deco">
                <div class="ch-line"></div>
                <div class="ch-diamond"></div>
                <div class="ch-line r"></div>
              </div>
              <div class="ch-title">{{ chapterTitle }}</div>
            </div>

            <!-- Display blocks -->
            <template v-for="(block, idx) in displayBlocks" :key="idx">
              <!-- Narrative block -->
              <div v-if="block.type === 'narr'" class="narr-block">
                <template v-for="(para, pi) in block.text.split('\n\n').filter(Boolean)" :key="pi">
                  <p>{{ para }}</p>
                </template>
                <!-- Event tags -->
                <div v-if="block.events?.length" class="ev-tags">
                  <span
                    v-for="ev in block.events"
                    :key="ev.text"
                    :class="['ev-tag', ev.type]"
                  >{{ ev.text }}</span>
                </div>
              </div>

              <!-- Player action block -->
              <div v-else-if="block.type === 'player'" class="player-act">
                <div class="pa-label">▸ 你的行动</div>
                <div class="pa-text">{{ block.text }}</div>
              </div>
            </template>

            <!-- Streaming block -->
            <div v-if="isStreaming" class="narr-block streaming-block">
              <p>{{ extractNarrative(streamingText) || streamingText }}<span class="cursor"></span></p>
            </div>

            <!-- Generating indicator (before any text arrives) -->
            <div v-if="isStreaming && !streamingText" class="generating">
              <div class="gen-dots">
                <div class="gen-dot"></div>
                <div class="gen-dot"></div>
                <div class="gen-dot"></div>
              </div>
              <span>正在生成…</span>
            </div>

            <div style="height:24px"></div>
          </div>
        </div>

        <!-- ── 输入区 ── -->
        <div class="input-zone">
          <div class="input-inner">
            <!-- Action suggestions -->
            <div v-if="suggestions.length && !isStreaming" class="action-sugg">
              <button
                v-for="sugg in suggestions"
                :key="sugg"
                class="sugg-btn"
                @click="useSuggestion(sugg)"
              >{{ sugg }}</button>
            </div>

            <!-- Input row -->
            <div class="input-row">
              <textarea
                ref="inputRef"
                v-model="userInput"
                class="novel-input"
                placeholder="你打算做什么……"
                rows="1"
                :disabled="isStreaming"
                @input="autoResize($event.target)"
                @keydown="handleKeydown"
              ></textarea>
              <button
                v-if="!isStreaming"
                class="send-btn"
                :disabled="!userInput.trim()"
                @click="sendAction"
              >➤</button>
              <button v-else class="stop-btn-inline" @click="abortCtrl?.abort()">⏹</button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- ── 移动端底栏 ── -->
    <div class="mob-bar">
      <button :class="['mob-btn', showSidebar && 'active']" @click="showSidebar = !showSidebar">
        <span class="mob-icon">📊</span>
        <span>状态</span>
      </button>
      <button class="mob-btn active">
        <span class="mob-icon">📖</span>
        <span>小说</span>
      </button>
      <button class="mob-btn" @click="showToast('地图功能开发中')">
        <span class="mob-icon">🗺️</span>
        <span>地图</span>
      </button>
      <button class="mob-btn" @click="openSaveModal">
        <span class="mob-icon">🔖</span>
        <span>存档</span>
      </button>
    </div>

    <!-- ── Toast ── -->
    <div class="novel-toast" :class="{ visible: toast.show }">{{ toast.msg }}</div>

    <!-- ── 书籍设置 ── -->
    <BookSettings
      v-if="showSettings"
      :book="book"
      :global-settings="globalSettings"
      @close="showSettings = false"
      @book-updated="handleBookUpdated"
      @delete-book="handleDeleteBook"
      @delete-save="payload => $emit('delete-save', payload)"
    />
  </div>
</template>

<style scoped>
/* ── CSS 变量（仙侠墨风配色）── */
.novel-mode {
  --ink:       #ede0c8;
  --ink-mid:   #c4aa88;
  --ink-dim:   #7a6850;
  --ink-faint: #3a3028;
  --paper:     #080604;
  --paper-1:   #100c08;
  --paper-2:   #18120c;
  --paper-3:   #221a12;
  --gold:      #c8a84a;
  --gold-dim:  #7a6230;
  --gold-glow: rgba(200,168,74,0.15);
  --red:   #b03828;
  --jade:  #3a8a68;
  --jade-dim: #1e5040;
  --purple: #7060a0;
  --r: 8px;

  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Noto Serif SC', 'Source Han Serif CN', 'SimSun', serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Ambient background */
.novel-mode::before {
  content: '';
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse 70% 60% at 15% 90%, rgba(140,70,20,0.07) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 85% 10%, rgba(80,50,120,0.05) 0%, transparent 50%);
  pointer-events: none;
}

/* ── Topbar ── */
.topbar {
  position: relative; z-index: 10;
  height: 48px;
  background: rgba(8,6,4,0.96);
  border-bottom: 1px solid rgba(200,168,74,0.12);
  display: flex; align-items: center;
  padding: 0 14px; gap: 10px;
  flex-shrink: 0;
}

.topbar-back {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--ink-faint); border-radius: 6px;
  background: transparent; color: var(--ink-dim);
  cursor: pointer; font-size: 13px; transition: all 0.2s; flex-shrink: 0;
}
.topbar-back:hover { border-color: var(--gold-dim); color: var(--gold); }

.topbar-title { flex: 1; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.topbar-name  { font-size: 15px; color: var(--gold); letter-spacing: 2px; white-space: nowrap; }
.topbar-chapter { font-size: 11px; color: var(--ink-dim); letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.topbar-actions { display: flex; gap: 6px; flex-shrink: 0; }
.top-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--ink-faint); border-radius: 6px; background: transparent; color: var(--ink-dim); cursor: pointer; font-size: 12px; transition: all 0.2s; }
.top-btn:hover { border-color: var(--gold-dim); color: var(--gold); }

/* ── Layout ── */
.layout { flex: 1; display: flex; overflow: hidden; position: relative; z-index: 1; }

/* ── Sidebar ── */
.sidebar {
  width: 200px; flex-shrink: 0;
  background: rgba(16,12,8,0.92);
  border-right: 1px solid rgba(200,168,74,0.08);
  overflow-y: auto; padding: 14px 10px;
  display: flex; flex-direction: column; gap: 14px;
}
.sidebar::-webkit-scrollbar { width: 2px; }
.sidebar::-webkit-scrollbar-thumb { background: var(--ink-faint); border-radius: 1px; }

.s-section { display: flex; flex-direction: column; gap: 7px; }
.s-title { font-size: 9px; letter-spacing: 3px; color: var(--gold-dim); text-transform: uppercase; padding-bottom: 5px; border-bottom: 1px solid rgba(200,168,74,0.1); }

.realm-card { background: linear-gradient(135deg,rgba(200,168,74,0.06),rgba(200,168,74,0.02)); border: 1px solid rgba(200,168,74,0.15); border-radius: var(--r); padding: 10px; text-align: center; }
.realm-name { font-size: 15px; color: var(--gold); letter-spacing: 2px; }
.realm-sub  { font-size: 10px; color: var(--ink-dim); margin-top: 2px; letter-spacing: 1px; }
.exp-bar    { margin-top: 8px; height: 2px; background: rgba(255,255,255,0.06); border-radius: 1px; overflow: hidden; }
.exp-fill   { height: 100%; background: linear-gradient(90deg,var(--gold-dim),var(--gold)); transition: width 0.8s ease; }

.stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 1px 0; }
.sl { color: var(--ink-dim); }
.sv { color: var(--ink); }

.items-wrap { display: flex; flex-wrap: wrap; gap: 3px; }
.item-chip { font-size: 9px; padding: 2px 7px; border-radius: 8px; border: 1px solid rgba(200,168,74,0.2); color: var(--ink-dim); }
.item-chip.rare { border-color: rgba(58,138,104,0.4); color: var(--jade); }
.item-chip.epic { border-color: rgba(112,96,160,0.5); color: #a090d0; }

.npc-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
.npc-item:last-child { border-bottom: none; }
.npc-info { display: flex; flex-direction: column; gap: 1px; }
.npc-name { font-size: 11px; color: var(--ink); }
.npc-role { font-size: 9px; color: var(--ink-dim); }
.rel-dots { display: flex; gap: 2px; align-items: center; }
.rdot { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.07); transition: background 0.3s; }
.rdot.ally { background: var(--jade); }
.rdot.enemy { background: var(--red); }
.rdot.neutral { background: var(--gold-dim); }

.location-badge { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(200,168,74,0.1); border-radius: 6px; padding: 7px 9px; }
.loc-icon { font-size: 14px; }
.loc-text { display: flex; flex-direction: column; gap: 1px; }
.loc-main { font-size: 11px; color: var(--ink); }
.loc-sub  { font-size: 9px; color: var(--ink-dim); }

.quest-item { display: flex; align-items: flex-start; gap: 5px; font-size: 10px; color: var(--ink-dim); line-height: 1.5; }
.quest-dot  { margin-top: 5px; width: 4px; height: 4px; border-radius: 50%; background: var(--gold-dim); flex-shrink: 0; }
.quest-item.active .quest-dot { background: var(--gold); }
.quest-item.active { color: var(--ink-mid); }

.sidebar-empty { font-size: 10px; color: var(--ink-faint); text-align: center; padding: 20px 0; line-height: 1.8; }

/* ── Center ── */
.center { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.novel-area { flex: 1; overflow-y: auto; padding: 20px 0 8px; scroll-behavior: smooth; }
.novel-area::-webkit-scrollbar { width: 3px; }
.novel-area::-webkit-scrollbar-thumb { background: var(--ink-faint); border-radius: 2px; }

.novel-inner { max-width: 660px; margin: 0 auto; padding: 0 24px; display: flex; flex-direction: column; }

/* Chapter header */
.ch-header { text-align: center; padding: 12px 0 20px; }
.ch-deco { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 8px; }
.ch-line { flex: 1; max-width: 60px; height: 1px; background: linear-gradient(90deg,transparent,var(--gold-dim)); }
.ch-line.r { background: linear-gradient(90deg,var(--gold-dim),transparent); }
.ch-diamond { width: 6px; height: 6px; border: 1px solid var(--gold-dim); transform: rotate(45deg); }
.ch-title { font-size: 18px; color: var(--gold); letter-spacing: 4px; }

/* Narrative */
.narr-block { padding: 8px 0; }
.narr-block p { font-size: 15px; line-height: 2.1; text-indent: 2em; letter-spacing: 0.3px; color: var(--ink); }
.narr-block p + p { margin-top: 4px; }

/* Player action */
.player-act { margin: 10px 0; padding: 10px 14px; background: rgba(200,168,74,0.04); border-left: 2px solid var(--gold-dim); border-radius: 0 6px 6px 0; }
.pa-label { font-size: 9px; letter-spacing: 3px; color: var(--gold-dim); margin-bottom: 4px; text-transform: uppercase; }
.pa-text  { font-size: 14px; color: var(--ink-mid); line-height: 1.7; }

/* Event tags */
.ev-tags { padding: 6px 0; display: flex; flex-wrap: wrap; gap: 5px; }
.ev-tag { font-size: 10px; padding: 2px 9px; border-radius: 10px; letter-spacing: 0.5px; }
.ev-tag.info    { background: rgba(200,168,74,0.1);  border: 1px solid rgba(200,168,74,0.25); color: var(--gold); }
.ev-tag.danger  { background: rgba(176,56,40,0.1);   border: 1px solid rgba(176,56,40,0.3);  color: #d06050; }
.ev-tag.obtain  { background: rgba(58,138,104,0.1);  border: 1px solid rgba(58,138,104,0.3); color: var(--jade); }
.ev-tag.mystery { background: rgba(112,96,160,0.1);  border: 1px solid rgba(112,96,160,0.3); color: #a090d0; }

/* Streaming cursor */
.cursor { display: inline-block; width: 1px; height: 1em; background: var(--gold); margin-left: 1px; vertical-align: text-bottom; animation: blink-cursor 0.8s step-end infinite; }

/* Generating dots */
.generating { display: flex; align-items: center; gap: 8px; padding: 10px 0; color: var(--ink-dim); font-size: 12px; letter-spacing: 1px; }
.gen-dots   { display: flex; gap: 3px; }
.gen-dot    { width: 3px; height: 3px; border-radius: 50%; background: var(--gold-dim); animation: blink 1.2s ease infinite; }
.gen-dot:nth-child(2) { animation-delay: 0.2s; }
.gen-dot:nth-child(3) { animation-delay: 0.4s; }

/* ── Input Zone ── */
.input-zone { border-top: 1px solid rgba(200,168,74,0.08); background: rgba(8,6,4,0.97); padding: 10px 0 12px; flex-shrink: 0; }
.input-inner { max-width: 660px; margin: 0 auto; padding: 0 24px; }

.action-sugg { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
.sugg-btn { font-size: 11px; padding: 4px 12px; border-radius: 12px; border: 1px solid rgba(200,168,74,0.2); background: rgba(200,168,74,0.04); color: var(--ink-dim); cursor: pointer; font-family: inherit; letter-spacing: 0.5px; transition: all 0.2s; white-space: nowrap; }
.sugg-btn:hover { border-color: var(--gold-dim); color: var(--ink-mid); background: rgba(200,168,74,0.08); }

.input-row { display: flex; align-items: flex-end; gap: 8px; }
.novel-input { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(200,168,74,0.15); border-radius: 10px; padding: 9px 14px; color: var(--ink); font-family: inherit; font-size: 14px; resize: none; outline: none; line-height: 1.7; transition: border-color 0.2s; max-height: 120px; overflow-y: auto; }
.novel-input:focus { border-color: rgba(200,168,74,0.4); }
.novel-input::placeholder { color: var(--ink-faint); font-size: 13px; }
.novel-input:disabled { opacity: 0.5; }

.send-btn { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg,var(--gold-dim),var(--gold)); border: none; color: var(--paper); cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
.send-btn:hover { transform: scale(1.05); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.stop-btn-inline { width: 38px; height: 38px; border-radius: 10px; background: rgba(176,56,40,0.2); border: 1px solid rgba(176,56,40,0.35); color: #d06050; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
.stop-btn-inline:hover { background: rgba(176,56,40,0.35); }

/* ── Mobile Bottom Bar ── */
.mob-bar { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 52px; background: rgba(8,6,4,0.97); border-top: 1px solid rgba(200,168,74,0.1); z-index: 20; }
.mob-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: transparent; border: none; color: var(--ink-dim); cursor: pointer; font-size: 11px; font-family: inherit; transition: color 0.2s; }
.mob-btn.active { color: var(--gold); }
.mob-icon { font-size: 16px; line-height: 1; }

/* ── Toast ── */
.novel-toast { position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%) translateY(10px); background: rgba(32,24,16,0.95); border: 1px solid rgba(200,168,74,0.3); color: var(--ink-mid); font-size: 12px; letter-spacing: 1px; padding: 7px 18px; border-radius: 20px; z-index: 300; opacity: 0; transition: all 0.3s; pointer-events: none; white-space: nowrap; }
.novel-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ── Animations ── */
@keyframes blink        { 0%,100%{opacity:0.3} 50%{opacity:1} }
@keyframes blink-cursor { 0%,100%{opacity:1} 50%{opacity:0} }

/* ── Mobile ── */
@media (max-width: 700px) {
  .sidebar { display: none; }
  .sidebar.open { display: flex; position: fixed; top: 48px; left: 0; bottom: 56px; z-index: 50; width: 190px; box-shadow: 4px 0 20px rgba(0,0,0,0.5); }
  .mob-bar { display: flex; }
  .input-zone { padding-bottom: 64px; }
  .novel-inner { padding: 0 16px; }
  .input-inner { padding: 0 12px; }
}
</style>
