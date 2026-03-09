<script setup>
/**
 * NovelMode.vue — 小说冒险模式主界面
 * 视觉设计来自 novel-mode.html，功能接入真实 API 流式调用
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { streamChat, parseStateFromResponse, extractNarrative, buildNovelSystemPrompt, callChat } from '../../utils/novelUtils.js';
import BookSettings from './BookSettings.vue';
import { saveNovelMessages, loadNovelMessages } from '../../composables/useNovelDB.js';

const props = defineProps({
  book:           { type: Object, required: true },
  save:           { type: Object, default: null },  // null = new game
  slotIndex:      { type: Number, default: 0 },
  globalSettings: { type: Object, required: true },
  roleConfig:     { type: Object, default: null },
});

const emit = defineEmits(['exit', 'save-book', 'delete-save', 'load-save']);

// ── 书籍/存档状态 ──
const currentState      = ref(props.save?.state || {});
const messages          = ref([]);  // 始终从 IndexedDB 异步加载，props.save 中无 messages 字段
const chapterTitle      = ref(props.save?.chapterTitle || '');
const chapterSummaries  = ref(props.save?.chapterSummaries ? [...props.save.chapterSummaries] : []);
const isNewGame         = !props.save;
const isInitializing    = ref(false);   // 首次开场生成中（区别于普通回合）

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
const showSavePanel  = ref(false);
const novelAreaRef   = ref(null);
const userScrolled   = ref(false);
const inputRef       = ref(null);
const abortCtrl      = ref(null);
const toast          = ref({ show: false, msg: '' });
let toastTimer       = null;

// 最近一次存档时的消息数，用于判断是否有未存就离开
const savedMessageCount = ref(0);

// ── v2 改进：STATE 警告、回合计数、动画状态、侧边栏折叠 ──
const stateUpdateFailed  = ref(false);
const roundCount         = computed(() => messages.value.filter(m => m.role === 'assistant').length);
const suggestionKey      = ref(0);        // 带动建议按鈕入场动画重划
const changedStatKeys    = ref(new Set());// 本轮数值变动闪烁
const changedItemKeys    = ref(new Set());// 新获得物品 glow
const realmGlow          = ref(false);    // 境界卡片升级光效
const collapsedSections  = ref({});       // 侧边栏分区折叠状态

function handleExit() {
  if (isStreaming.value) { showToast('请等待回复完成后再退出'); return; }
  if (messages.value.length > savedMessageCount.value) {
    if (!confirm('还有未存档的内容，确定要离开吗？')) return;
  }
  emit('exit');
}

// ── STATE 侧边栏 ──
const stateStats    = computed(() => currentState.value?.stats || {});
const stateItems    = computed(() => currentState.value?.items || []);
const stateNpcs     = computed(() => (currentState.value?.npcs || []).filter(n => !n.deceased));
const stateDeceased = computed(() => (currentState.value?.npcs || []).filter(n => n.deceased));
const stateLocation = computed(() => currentState.value?.location || null);
const stateQuests   = computed(() => currentState.value?.quests || []);

// ── API 设置（优先读书籍专用模型，未配置则回落全局）──
const PACE_MAX_TOKENS = { compact: 1200, auto: 2000, standard: 3000, immersive: 5000 };
const apiSettings = computed(() => {
  const nm = props.book.novelModel;
  const maxTokens = PACE_MAX_TOKENS[props.book.pace || 'auto'] ?? 2000;
  if (nm?.apiKey) {
    return {
      baseUrl: (nm.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, ''),
      apiKey:  nm.apiKey,
      model:   nm.model || 'deepseek-chat',
      maxTokens,
    };
  }
  return {
    baseUrl: props.globalSettings.baseUrl || 'https://api.deepseek.com',
    apiKey:  props.globalSettings.apiKey || '',
    model:   props.globalSettings.model  || 'deepseek-chat',
    maxTokens,
  };
});

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
  // 取最近 6 条消息内容作为关键词上下文，用于世界书条目智能筛选
  const recentCtx = messages.value
    .slice(-6)
    .map(m => m.content)
    .join(' ')
    .slice(-2000);
  return buildNovelSystemPrompt(props.book, {
    chapterSummaries: chapterSummaries.value,
  }, recentCtx, props.roleConfig);
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
  isStreaming.value   = true;
  isInitializing.value = true;
  streamingText.value  = '';
  userScrolled.value   = false;

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
        isInitializing.value = false;
        streamingText.value = full;
        fullText = full;
        scrollToBottom();
      },
      abortCtrl.value.signal,
    );

    await finalizeResponse(fullText, null);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[NovelMode] initNewGame error:', err);
      // 保留已输出的部分内容，不清空
      if (streamingText.value) {
        displayBlocks.value.push({
          type: 'narr',
          text: extractNarrative(streamingText.value),
          events: [],
        });
        messages.value.push({ role: 'assistant', content: streamingText.value });
      }
      showToast(friendlyError(err));
    }
  } finally {
    isStreaming.value    = false;
    isInitializing.value = false;
    streamingText.value  = '';
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
  userScrolled.value  = false;

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
    if (err.name !== 'AbortError') {
      console.error('[NovelMode] sendAction error:', err);
      // 保留已输出的部分内容
      if (streamingText.value) {
        displayBlocks.value.push({
          type: 'narr',
          text: extractNarrative(streamingText.value),
          events: [],
        });
        messages.value.push({ role: 'assistant', content: streamingText.value });
      }
      showToast(friendlyError(err));
    }
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
    stateUpdateFailed.value = false;

    // 检测数值变化（闪烁动画）
    const oldStats = currentState.value?.stats || {};
    const newStats = newState.stats || {};
    const changedKeys = new Set();
    for (const key of Object.keys(newStats)) {
      if (JSON.stringify(oldStats[key]) !== JSON.stringify(newStats[key])) changedKeys.add(key);
    }
    if (changedKeys.size > 0) {
      changedStatKeys.value = changedKeys;
      setTimeout(() => { changedStatKeys.value = new Set(); }, 900);
      if ([...changedKeys].some(k => renderStatField(k, newStats[k]).type === 'card')) {
        realmGlow.value = true;
        setTimeout(() => { realmGlow.value = false; }, 2000);
      }
    }

    // 检测新获得物品（glow）
    const oldItemNames = new Set((currentState.value?.items || []).map(i => i.name));
    const addedItems = new Set((newState.items || []).filter(i => !oldItemNames.has(i.name)).map(i => i.name));
    if (addedItems.size > 0) {
      changedItemKeys.value = addedItems;
      setTimeout(() => { changedItemKeys.value = new Set(); }, 2200);
    }

    currentState.value = newState;
    if (newState.suggestions?.length) {
      suggestions.value = newState.suggestions;
      suggestionKey.value++;
    }
    if (newState.chapterTitle) chapterTitle.value = newState.chapterTitle;
  } else {
    stateUpdateFailed.value = true;
    showToast('⚠️ 本轮状态未更新（AI 未返回 STATE 块）');
  }

  // 章节摘要触发（后台静默，不阻塞玩家输入）
  const assistantCount = messages.value.filter(m => m.role === 'assistant').length;
  const SUMMARY_INTERVAL = 20;
  if (assistantCount > 0 && assistantCount % SUMMARY_INTERVAL === 0) {
    triggerChapterSummary();
  }

  // 自动存档
  await autoSave();
}

// ── 手动存档面板 ──
function openSaveModal() {
  showSavePanel.value = true;
}

// 存档位信息（从父组件传入的 book 读取）
const saveSlots = computed(() => props.book.saves || [null, null, null, null]);

async function saveToSlot(slotIndex) {
  // 如果该存档位已有数据，确认覆盖
  if (saveSlots.value[slotIndex]) {
    if (!confirm(`存档位 ${slotIndex + 1} 已有数据，确定覆盖？`)) return;
  }

  try {
    // 1. 写 messages 到 IndexedDB
    await saveNovelMessages(props.book.id, slotIndex, messages.value);

    // 2. 写元数据到 localStorage
    const roundCount = messages.value.filter(m => m.role === 'assistant').length;
    const titleToSave = chapterTitle.value || `第 ${roundCount} 轮 · 冒险进行中`;
    emit('save-book', {
      slotIndex,
      saveData: {
        slotIndex,
        label: `存档${slotIndex + 1}`,
        updatedAt: Date.now(),
        chapterTitle: titleToSave,
        state: currentState.value,
        chapterSummaries: chapterSummaries.value,
      },
    });

    savedMessageCount.value = messages.value.length;
    showToast(`已保存到存档位 ${slotIndex + 1}`);
    showSavePanel.value = false;
  } catch (err) {
    console.error('[NovelMode] saveToSlot error:', err);
    showToast(`存档失败: ${err.message}`);
  }
}

// ── 章节摘要生成（后台非流式，不阻塞 UI）──
async function triggerChapterSummary() {
  try {
    const windowMsgs = buildMessageWindow(messages.value);
    const windowFirstIdx = messages.value.indexOf(windowMsgs[0]);
    if (windowFirstIdx <= 0) return;

    const oldMessages = messages.value.slice(0, windowFirstIdx)
      .filter(m => m.role === 'user' || m.role === 'assistant');
    if (oldMessages.length < 4) return;

    const recentOld = oldMessages.slice(-20)
      .map(m => m.role === 'user' ? `[玩家行动] ${m.content}` : extractNarrative(m.content).slice(0, 300))
      .join('\n');

    const summaryPrompt = [
      { role: 'system', content: '你是一个小说章节摘要生成器。请用 2-4 句话概括以下叙事内容的核心事件和变化，保留重要人名、地名、变故。用第三人称客观叙述。' },
      { role: 'user', content: recentOld },
    ];

    const summary = await callChat(summaryPrompt, apiSettings.value);
    if (summary?.trim()) {
      chapterSummaries.value.push({
        round: messages.value.filter(m => m.role === 'assistant').length,
        summary: summary.trim(),
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[NovelMode] 章节摘要生成失败:', err.message);
  }
}

// ── 行动建议 ──
function useSuggestion(text) {
  userInput.value = text;
  nextTick(() => inputRef.value?.focus());
}

const RANDOM_ACTIONS = [
  '我突发奇想，尝试做一件完全出乎意料的事……',
  '我决定冒险一试，走一条没人走过的路。',
  '我灵机一动，想到了一个离经叛道的办法。',
  '我决定完全跟随直觉，不管结果如何。',
  '我忽然心血来潮，做了一个连自己都没想到的决定。',
];
function randomAction() {
  const text = RANDOM_ACTIONS[Math.floor(Math.random() * RANDOM_ACTIONS.length)];
  useSuggestion(text);
}

// ── 滚动 ──
async function scrollToBottom(force = false) {
  if (!force && userScrolled.value) return;
  await nextTick();
  if (novelAreaRef.value) {
    novelAreaRef.value.scrollTop = novelAreaRef.value.scrollHeight;
  }
}

function onNovelScroll() {
  const el = novelAreaRef.value;
  if (!el) return;
  // 如果离底部超过 80px 认为用户主动上滚
  userScrolled.value = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
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

// ── 错误信息友好化 ──
function friendlyError(err) {
  const msg = err.message || '';
  if (msg.includes('401') || /unauthorized/i.test(msg)) return 'API Key 无效或已过期，请检查设置';
  if (msg.includes('402') || /insufficient/i.test(msg)) return '账户余额不足，请充值后重试';
  if (msg.includes('429') || /rate.?limit/i.test(msg)) return '请求过于频繁，请稍后再试';
  if (/50[0-9]/.test(msg)) return '服务器暂时故障，请稍后重试';
  if (/failed to fetch|networkerror/i.test(msg)) return '网络连接失败，请检查网络';
  if (/timeout|timed out/i.test(msg)) return '请求超时，请重试';
  return `生成中断（${msg.slice(0, 40)}）`;
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

// ── 游戏内读取存档（从 BookSettings 触发）──
async function handleLoadSave(slotIndex) {
  if (!confirm('读取此存档将丢失当前未保存的进度，确认继续？')) return;
  const save = props.book.saves?.[slotIndex];
  if (!save) {
    showToast('存档位为空');
    return;
  }

  try {
    const msgs = await loadNovelMessages(props.book.id, slotIndex);

    // 恢复状态
    messages.value = msgs;
    currentState.value = save.state || {};
    chapterTitle.value = save.chapterTitle || '';
    chapterSummaries.value = save.chapterSummaries ? [...save.chapterSummaries] : [];
    if (currentState.value.suggestions) suggestions.value = currentState.value.suggestions;

    // 重建显示块
    rebuildDisplayBlocks();
    showSettings.value = false;
    showToast(`已加载存档 ${slotIndex + 1}`);
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error('[NovelMode] handleLoadSave error:', err);
    showToast(`读档失败: ${err.message}`);
  }
}

// ── 初始化 ──
onMounted(async () => {
  novelAreaRef.value?.addEventListener('scroll', onNovelScroll, { passive: true });
  if (!isNewGame) {
    // 继续存档：从 IndexedDB 加载消息历史（save 元数据在 props 中，但 messages 只存 IDB）
    try {
      const msgs = await loadNovelMessages(props.book.id, props.slotIndex);
      messages.value = msgs;
    } catch (err) {
      console.error('[NovelMode] onMounted: 加载存档 messages 失败', err);
      showToast('存档消息加载失败，请重试');
    }
  }

  if (messages.value.length > 0) {
    savedMessageCount.value = messages.value.length;  // 存档加载时即为基线
    rebuildDisplayBlocks();
    await nextTick();
    scrollToBottom();
    const lastState = currentState.value;
    if (lastState?.suggestions) suggestions.value = lastState.suggestions;
  } else if (isNewGame) {
    await initNewGame();
  }
  // 若是继续存档但 messages 为空（存档损坏），保持空白并给提示
  else {
    showToast('存档内容为空，可能已损坏');
  }
});

onUnmounted(() => {
  clearTimeout(toastTimer);
  abortCtrl.value?.abort();
});

// ── STATE 侧边栏：通用渲染 ──
function renderStatField(key, val) {
  // 裸字符串或裸数字属事降级
  if (typeof val === 'string' || typeof val === 'number') {
    return { type: 'text', value: String(val) };
  }
  // 有 progress → 卡片（境界/修为等）
  if (val.progress !== undefined) {
    return { type: 'card', value: val.value ?? '', progress: Math.max(0, Math.min(100, Number(val.progress) || 0)) };
  }
  // 有 max → 数値条
  if (val.max !== undefined) {
    return { type: 'bar', value: val.value ?? 0, max: val.max };
  }
  // 其他对象属事降级
  return { type: 'text', value: val.value != null ? String(val.value) : JSON.stringify(val) };
}

// 流式渲染时安全过滤：遇到 <!--STATE: 就截断（closing --> 可能还没到达）
function streamingNarrative(text) {
  if (!text) return '';
  const idx = text.search(/<!--\s*STATE:/);
  return idx !== -1 ? text.slice(0, idx).trimEnd() : text;
}

// 流式输出实时分段：按 \n\n 拆分，过滤空段，返回段落数组
const streamingParagraphs = computed(() => {
  const clean = streamingNarrative(streamingText.value);
  if (!clean) return [];
  // 流式时末尾可能是不完整段落（没有第二个 \n\n），直接返回所有切片
  return clean.split('\n\n').filter(s => s.trim());
});

function npcDots(npc) {
  const rel = Math.max(-5, Math.min(5, npc.relation || 0));
  const abs = Math.abs(rel);
  const type = rel > 0 ? 'ally' : rel < 0 ? 'enemy' : 'neutral';
  return Array(5).fill(null).map((_, i) => ({ filled: i < abs, type }));
}

// ── 段落类型识别（小说模式段落色调分层）──
function classifyParagraph(text) {
  const t = text.trim();
  // 场景转换分隔线：只含符号/空白且不超过 15 字符
  if (t.length <= 15 && /^[\s*＊·•\-～—=~]+$/.test(t)) return 'scene-break';
  // 内心独白
  if (/心想|心道|暗想|暗道|心中想|心中暗|只觉得?|脑海中|不禁想|忽然想|意识到/.test(t)) return 'thought';
  // 对话段（以引号开头或以引号结尾）→ 保持正常色
  if (/^[""\u201c「『【]/.test(t) || /[""」』】\u201d]$/.test(t)) return '';
  // 其余：场景/环境描写 → 偏暗金色
  return 'scene';
}

// ── 侧边栏分区折叠 ──
function toggleSection(key) {
  collapsedSections.value = { ...collapsedSections.value, [key]: !collapsedSections.value[key] };
}

// ── 自动存档（每轮 AI 回复后静默触发）──
async function autoSave() {
  if (!messages.value.length) return;
  try {
    await saveNovelMessages(props.book.id, props.slotIndex, messages.value);
    const count = messages.value.filter(m => m.role === 'assistant').length;
    const title = chapterTitle.value || `第 ${count} 轮 · 冒险进行中`;
    emit('save-book', {
      slotIndex: props.slotIndex,
      saveData: {
        slotIndex: props.slotIndex,
        label: `存档${props.slotIndex + 1}`,
        updatedAt: Date.now(),
        chapterTitle: title,
        state: currentState.value,
        chapterSummaries: chapterSummaries.value,
      },
    });
    savedMessageCount.value = messages.value.length;
  } catch (err) {
    console.warn('[NovelMode] autoSave failed:', err.message);
  }
}
</script>

<template>
  <div class="novel-mode">
    <!-- ── 顶栏 ── -->
    <nav class="topbar">
      <button class="topbar-back" @click="handleExit" title="返回书库">←</button>
      <div class="topbar-title">
        <span class="topbar-name">{{ book.title }}</span>
        <span class="topbar-chapter">{{ chapterTitle }}</span>
      </div>
      <span v-if="roundCount" class="round-badge">第 {{ roundCount }} 轮</span>
      <div class="topbar-actions">
        <button class="top-btn" @click="openSaveModal" title="存档">🔖</button>
        <button class="top-btn" @click="showSettings = true" title="书籍设置">⚙</button>
      </div>
    </nav>

    <!-- ── STATE 失败警告条 ── -->
    <div v-if="stateUpdateFailed" class="state-warning">
      <span>⚠️ 本轮状态未更新（AI 未返回有效 STATE）</span>
      <button @click="stateUpdateFailed = false">知道了</button>
    </div>

    <!-- ── 主体布局 ── -->
    <div class="layout">
      <!-- 侧边栏 -->
      <aside class="sidebar" :class="{ open: showSidebar }">
        <!-- 修为/通用 stats -->
        <div class="s-section" v-if="Object.keys(stateStats).length">
          <div class="s-title">状态 <span :class="['fold-btn', !collapsedSections['stats'] && 'open']" @click="toggleSection('stats')">&#9654;</span></div>
          <div :class="['s-content', collapsedSections['stats'] && 'collapsed']">
            <template v-for="(stat, key) in stateStats" :key="key">
              <!-- has progress bar -->
              <div v-if="renderStatField(key, stat).type === 'card'" :class="['realm-card', realmGlow && 'glow']">
                <div class="realm-name">{{ renderStatField(key, stat).value }}</div>
                <div class="realm-sub">{{ key }}</div>
                <div class="exp-bar">
                  <div class="exp-fill" :style="{ width: renderStatField(key, stat).progress + '%' }"></div>
                </div>
              </div>
              <!-- has max (fraction) -->
              <div v-else-if="renderStatField(key, stat).type === 'bar'" class="stat-row">
                <span class="sl">{{ key }}</span>
                <span :class="['sv', changedStatKeys.has(key) && 'changed']">{{ renderStatField(key, stat).value }} / {{ renderStatField(key, stat).max }}</span>
              </div>
              <!-- plain value -->
              <div v-else class="stat-row">
                <span class="sl">{{ key }}</span>
                <span :class="['sv', changedStatKeys.has(key) && 'changed']">{{ renderStatField(key, stat).value }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 持有物品 -->
        <div class="s-section" v-if="stateItems.length">
          <div class="s-title">持有 <span :class="['fold-btn', !collapsedSections['items'] && 'open']" @click="toggleSection('items')">&#9654;</span></div>
          <div :class="['s-content', collapsedSections['items'] && 'collapsed']">
            <div class="items-wrap">
              <span
                v-for="item in stateItems"
                :key="item.name"
                :class="['item-chip', item.rarity, changedItemKeys.has(item.name) && 'new']"
              >{{ item.name }}{{ item.count && item.count > 1 ? ` ×${item.count}` : '' }}</span>
            </div>
          </div>
        </div>

        <!-- NPC 关系 -->
        <div class="s-section" v-if="stateNpcs.length">
          <div class="s-title">关系 <span :class="['fold-btn', !collapsedSections['npcs'] && 'open']" @click="toggleSection('npcs')">&#9654;</span></div>
          <div :class="['s-content', collapsedSections['npcs'] && 'collapsed']">
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
        </div>

        <!-- 已逝 NPC -->
        <div class="s-section" v-if="stateDeceased.length">
          <div class="s-title s-title-dim">已逝</div>
          <div v-for="npc in stateDeceased" :key="npc.name" class="npc-item npc-deceased">
            <div class="npc-info">
              <span class="npc-name">{{ npc.name }}</span>
              <span class="npc-role">{{ npc.role }}</span>
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
          <div class="s-title">任务 <span :class="['fold-btn', !collapsedSections['quests'] && 'open']" @click="toggleSection('quests')">&#9654;</span></div>
          <div :class="['s-content', collapsedSections['quests'] && 'collapsed']">
            <div
              v-for="quest in stateQuests"
              :key="quest.text"
              :class="['quest-item', quest.active && 'active', quest.completed && 'completed']"
            >
              <div class="quest-dot"></div>
              <span>{{ quest.text }}</span>
            </div>
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
                  <div v-if="classifyParagraph(para) === 'scene-break'" class="scene-break" aria-hidden="true"></div>
                  <p v-else :class="classifyParagraph(para) || undefined">{{ para }}</p>
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

            <!-- Streaming block：实时分段渲染，光标只跟在最后一段末尾 -->
            <div v-if="isStreaming && streamingParagraphs.length" class="narr-block streaming-block">
              <template v-for="(para, pi) in streamingParagraphs" :key="pi">
                <div v-if="classifyParagraph(para) === 'scene-break'" class="scene-break" aria-hidden="true"></div>
                <p v-else :class="classifyParagraph(para) || undefined">
                  {{ para }}<span v-if="pi === streamingParagraphs.length - 1" class="cursor"></span>
                </p>
              </template>
            </div>

            <!-- Generating indicator (before any text arrives) -->
            <div v-if="isStreaming && !streamingParagraphs.length" class="generating">
              <div class="gen-dots">
                <div class="gen-dot"></div>
                <div class="gen-dot"></div>
                <div class="gen-dot"></div>
              </div>
              <span v-if="isInitializing">正在创世，请稍候…</span>
              <span v-else>正在生成…</span>
            </div>

            <div style="height:24px"></div>
          </div>
        </div>

        <!-- ── 输入区 ── -->
        <div class="input-zone">
          <div class="input-inner">
            <!-- Action suggestions -->
            <div v-if="suggestions.length && !isStreaming" class="action-sugg" :key="suggestionKey">
              <button
                v-for="sugg in suggestions"
                :key="sugg"
                class="sugg-btn"
                @click="useSuggestion(sugg)"
              >{{ sugg }}</button>
              <button class="sugg-btn random" @click="randomAction()">🎲 意外</button>
            </div>

            <!-- Input row -->
            <div class="input-row">
              <textarea
                ref="inputRef"
                v-model="userInput"
                class="novel-input"
                placeholder="你打算做什么……"
                rows="1"
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

    <!-- ── 手动存档面板 ── -->
    <div v-if="showSavePanel" class="save-panel-overlay" @click.self="showSavePanel = false">
      <div class="save-panel">
        <div class="save-panel-header">
          <span class="save-panel-title">📖 存档管理</span>
          <button class="save-panel-close" @click="showSavePanel = false">✕</button>
        </div>
        <div class="save-panel-slots">
          <div
            v-for="(slot, i) in saveSlots"
            :key="i"
            :class="['save-slot', slot ? 'occupied' : 'empty', i === props.slotIndex && 'active-slot']"
            @click="!slot && saveToSlot(i)"
          >
            <template v-if="slot">
              <div class="save-slot-info">
                <div class="save-slot-label-row">
                  <span class="save-slot-label">{{ slot.label || `存档${i + 1}` }}</span>
                  <span v-if="i === props.slotIndex" class="current-badge">▶ 当前</span>
                </div>
                <span class="save-slot-chapter">{{ slot.chapterTitle || '冒险中' }}</span>
              </div>
              <span class="save-slot-time">{{ new Date(slot.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</span>
              <div class="save-slot-btns">
                <button class="slot-load-btn" @click.stop="handleLoadSave(i)">读取</button>
                <button class="slot-save-btn" @click.stop="saveToSlot(i)">存档</button>
              </div>
            </template>
            <template v-else>
              <span class="save-slot-empty">存档位 {{ i + 1 }} — 空</span>
              <span class="save-slot-hint">点击保存</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 书籍设置 ── -->
    <BookSettings
      v-if="showSettings"
      :book="book"
      :global-settings="globalSettings"
      @close="showSettings = false"
      @book-updated="handleBookUpdated"
      @delete-book="handleDeleteBook"
      @delete-save="payload => $emit('delete-save', payload)"
      @load-save="handleLoadSave"
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
.s-title-dim { color: rgba(255,255,255,0.2) !important; }
.npc-deceased { opacity: 0.4; }
.npc-deceased .npc-name { text-decoration: line-through; }

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
.sugg-btn.random { border-color: rgba(112,96,160,0.3); color: #a090d0; background: rgba(112,96,160,0.04); }
.sugg-btn.random:hover { border-color: rgba(112,96,160,0.6); background: rgba(112,96,160,0.1); color: #c0b0e8; }

.input-row { display: flex; align-items: flex-end; gap: 8px; }
.novel-input { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(200,168,74,0.15); border-radius: 10px; padding: 9px 14px; color: var(--ink); font-family: inherit; font-size: 14px; resize: none; outline: none; line-height: 1.7; transition: border-color 0.2s; max-height: 120px; overflow-y: auto; }
.novel-input:focus { border-color: rgba(200,168,74,0.4); }
.novel-input::placeholder { color: var(--ink-faint); font-size: 13px; }

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

/* ── Save Panel Overlay ── */
.save-panel-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.save-panel {
  background: #13100c;
  border: 1px solid rgba(200,168,74,0.2);
  border-radius: 16px;
  width: 100%; max-width: 440px;
  overflow: hidden;
}
.save-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(200,168,74,0.1);
}
.save-panel-title { font-size: 15px; color: var(--gold); letter-spacing: 2px; }
.save-panel-close {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4); cursor: pointer; font-size: 11px; transition: all 0.2s;
}
.save-panel-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }
.save-panel-slots { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.save-slot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-radius: 10px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(200,168,74,0.08);
  transition: all 0.2s;
}
.save-slot.empty { cursor: pointer; }
.save-slot.empty:hover { background: rgba(200,168,74,0.06); border-color: rgba(200,168,74,0.25); }
.save-slot.occupied { cursor: default; }
.save-slot.active-slot { border-color: rgba(52,211,153,0.35); background: rgba(52,211,153,0.06); }
.save-slot-label-row { display: flex; align-items: center; gap: 6px; }
.current-badge { font-size: 10px; color: rgba(52,211,153,0.9); letter-spacing: 0.5px; white-space: nowrap; }
.save-slot-btns { display: flex; gap: 6px; flex-shrink: 0; }
.slot-load-btn, .slot-save-btn {
  padding: 4px 10px; font-size: 12px; border-radius: 7px; cursor: pointer; transition: all 0.15s;
  border: 1px solid; letter-spacing: 0.5px;
}
.slot-load-btn { background: rgba(96,165,250,0.1); border-color: rgba(96,165,250,0.25); color: rgba(147,197,253,0.9); }
.slot-load-btn:hover { background: rgba(96,165,250,0.2); }
.slot-save-btn { background: rgba(200,168,74,0.08); border-color: rgba(200,168,74,0.2); color: rgba(200,168,74,0.75); }
.slot-save-btn:hover { background: rgba(200,168,74,0.18); }
.save-slot-info { display: flex; flex-direction: column; gap: 2px; }
.save-slot-label { font-size: 13px; color: var(--gold); }
.save-slot-chapter { font-size: 12px; color: var(--ink-dim); }
.save-slot-time { font-size: 11px; color: rgba(255,255,255,0.25); white-space: nowrap; }
.save-slot-empty { font-size: 13px; color: rgba(255,255,255,0.2); }
.save-slot-hint { font-size: 11px; color: rgba(200,168,74,0.4); }

/* ── Animations ── */
@keyframes blink        { 0%,100%{opacity:0.3} 50%{opacity:1} }
@keyframes blink-cursor { 0%,100%{opacity:1} 50%{opacity:0} }

/* ── v2 改进：新增样式 ── */

/* STATE 失败警告条 */
.state-warning {
  position: relative; z-index: 10;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 6px 16px;
  background: rgba(251,146,60,0.10);
  border-bottom: 1px solid rgba(251,146,60,0.28);
  font-size: 12px; color: rgba(251,146,60,0.9);
  animation: warn-slide 0.3s ease;
  flex-shrink: 0;
}
.state-warning button {
  padding: 2px 10px; border-radius: 8px; font-size: 11px;
  background: rgba(251,146,60,0.15); border: 1px solid rgba(251,146,60,0.35);
  color: rgba(251,146,60,0.9); cursor: pointer; transition: all 0.2s;
}
.state-warning button:hover { background: rgba(251,146,60,0.28); }
@keyframes warn-slide { 0%{transform:translateY(-100%)} 100%{transform:translateY(0)} }

/* 回合徽章 */
.round-badge {
  font-size: 10px; color: var(--gold-dim); letter-spacing: 1px;
  background: rgba(200,168,74,0.06); border: 1px solid rgba(200,168,74,0.15);
  border-radius: 10px; padding: 2px 10px; white-space: nowrap; flex-shrink: 0;
}

/* 叙事块入场动画 */
.narr-block {
  padding: 8px 0;
  opacity: 0;
  animation: fade-up 0.55s ease forwards;
}
@keyframes fade-up { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }

/* 玩家行动块入场 */
.player-act { animation: fade-up 0.35s ease forwards; opacity: 0; }

/* 段落类型分层 */
/* 场景/环境描写 → 偏暗金色，与对话白色形成层次 */
.narr-block p.scene {
  color: rgba(196, 158, 72, 0.68);
}
/* 内心独白 → 斜体 + 左侧竖线 */
.narr-block p.thought {
  color: rgba(200,170,136,0.72);
  font-style: italic;
  border-left: 2px solid rgba(200,168,74,0.22);
  padding-left: 12px;
  text-indent: 0;
}
/* 场景转换分隔线 → 三个小圆点居中 */
.narr-block .scene-break {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 10px 0; margin: 4px 0;
  color: rgba(200,168,74,0.28);
  font-size: 20px; letter-spacing: 6px;
}
.narr-block .scene-break::before { content: '· · ·'; }

/* 事件标签弹出动画（依次延迟） */
.ev-tag { opacity: 0; animation: tag-pop 0.4s ease forwards; }
.ev-tag:nth-child(1) { animation-delay: 0.05s; }
.ev-tag:nth-child(2) { animation-delay: 0.15s; }
.ev-tag:nth-child(3) { animation-delay: 0.25s; }
.ev-tag:nth-child(4) { animation-delay: 0.35s; }
@keyframes tag-pop { 0%{opacity:0;transform:scale(0.75)} 100%{opacity:1;transform:scale(1)} }

/* 行动建议依次淡入 */
.sugg-btn { opacity: 0; animation: sugg-fade 0.5s ease forwards; }
.sugg-btn:nth-child(1) { animation-delay: 0.08s; }
.sugg-btn:nth-child(2) { animation-delay: 0.20s; }
.sugg-btn:nth-child(3) { animation-delay: 0.32s; }
.sugg-btn:nth-child(4) { animation-delay: 0.44s; }
@keyframes sugg-fade { 0%{opacity:0;transform:translateY(5px)} 100%{opacity:1;transform:translateY(0)} }

/* 停止按钮脉冲 */
.stop-btn-inline { animation: pulse-stop 2s ease infinite; }
@keyframes pulse-stop { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 10px rgba(176,56,40,0.35)} }

/* 数值变化闪烁 */
@keyframes val-flash {
  0%  { color: #5eead4; text-shadow: 0 0 8px rgba(94,234,212,0.5); }
  100%{ color: var(--ink); text-shadow: none; }
}
.sv.changed { animation: val-flash 0.9s ease forwards; }

/* 境界卡片升级发光 */
@keyframes realm-glow-kf { 0%,100%{box-shadow:none;border-color:rgba(200,168,74,0.15)} 50%{box-shadow:0 0 20px rgba(200,168,74,0.28);border-color:rgba(200,168,74,0.45)} }
.realm-card.glow { animation: realm-glow-kf 2s ease; }

/* 新获得物品高亮 */
@keyframes item-glow { 0%{box-shadow:0 0 10px rgba(58,138,104,0.45);transform:scale(1.08)} 100%{box-shadow:none;transform:scale(1)} }
.item-chip.new { animation: item-glow 2.2s ease; background: rgba(58,138,104,0.1); }

/* 任务已完成状态 */
.quest-item.completed { text-decoration: line-through; opacity: 0.38; }

/* 侧边栏折叠 */
.s-title { justify-content: space-between; display: flex; align-items: center; }
.fold-btn { font-size: 8px; color: var(--ink-faint); cursor: pointer; transition: transform 0.3s; flex-shrink: 0; }
.fold-btn.open { transform: rotate(90deg); }
.s-content { overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s; max-height: 600px; opacity: 1; display: flex; flex-direction: column; gap: 7px; }
.s-content.collapsed { max-height: 0; opacity: 0; }

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
