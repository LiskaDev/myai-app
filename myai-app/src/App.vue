<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppState } from './composables/useAppState';
import { useChat } from './composables/useChat';
import { useMemory } from './composables/useMemory';
import { useTTS } from './composables/useTTS';
import { useGestures } from './composables/useGestures';
import { useBranch } from './composables/useBranch';
import { useSoundEffects } from './composables/useSoundEffects';
import { useDiary } from './composables/useDiary';
import { useActiveMessage } from './composables/useActiveMessage';
import { useBackgroundTasks } from './composables/useBackgroundTasks';
import { extractExpression, parseDualLayerResponse } from './utils/textParser';
import { STYLE_QUICK_TAGS, WRITING_STYLE_PRESETS } from './composables/presets';

// Import Components
import ChatWindow from './components/ChatWindow.vue';
import SettingsModal from './components/SettingsModal.vue';
import RoleSidebar from './components/RoleSidebar.vue';
import EditMessageModal from './components/EditMessageModal.vue';
import ImportDataModal from './components/ImportDataModal.vue';
import DiaryModal from './components/DiaryModal.vue';
import StoryExportModal from './components/StoryExportModal.vue';
import OnboardingOverlay from './components/OnboardingOverlay.vue';
import RoleCardGenerator from './components/RoleCardGenerator.vue';
import CardLibraryModal from './components/CardLibraryModal.vue';
import CharacterHome from './components/CharacterHome.vue';
import NovelMode from './components/novel/NovelMode.vue';
import AssistantBot from './components/AssistantBot.vue';
import { useNovelStore } from './composables/useNovelStore.js';
import { exportAllBookMessages, saveNovelMessages } from './composables/useNovelDB.js';

// Initialize State
const appState = useAppState();
const chatFunctions = useChat(appState);
const memoryFunctions = useMemory(appState);
const ttsFunctions = useTTS(appState);
const branchFunctions = useBranch(appState);
const sfx = useSoundEffects(appState.globalSettings);
const diary = useDiary(appState);
const activeMessage = useActiveMessage(appState);
const bgTasks = useBackgroundTasks();

// ── 日夜主题 ──
const isDark = ref(false);
function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}
// 初始化主题
document.documentElement.setAttribute('data-theme', 'light');

// ── 星星菜单面板 ──
const showMenuPanel = ref(false);

// 🔤 聊天字体大小
function applyChatFontSize() {
    const size = appState.globalSettings.chatFontSize || 1.0;
    document.documentElement.style.setProperty('--chat-font-size', size);
}
watch(() => appState.globalSettings.chatFontSize, applyChatFontSize);
applyChatFontSize();

// 🌟 新手引导
const showOnboarding = ref(!localStorage.getItem('myai_onboarding_done'));

// 🏠 角色选择主页
const showHomePage = ref(true);

// 🤖 内置助手
const showAssistant = ref(false);

function handleAssistantAction(action) {
  showAssistant.value = false;
  if (!action) return;
  if (action.type === 'navigate') {
    switch (action.target) {
      case 'settings':
        showSettings.value = true;
        if (action.tab) settingsInitialTab.value = action.tab;
        break;
      case 'characterHome':
        showHomePage.value = true;
        showNovelMode.value = false;
        break;
    }
  }
}

function handleSelectRole(roleId) {
  appState.switchRole(roleId);
  showHomePage.value = false;
}

// 🌏 小说模式
const novelStore = useNovelStore();
const showNovelMode  = ref(false);
const novelBook      = ref(null);
const novelSave      = ref(null);
const novelSlotIndex = ref(0);
const novelRoleConfig = ref(null);
const NOVEL_SESSION_KEY = 'myai_active_novel_session';

function handleNovelExit() {
  showNovelMode.value = false;
  showHomePage.value  = true;
  sessionStorage.removeItem(NOVEL_SESSION_KEY);
}

function handleStartNovel({ book, slotIndex, save, roleConfig = null }) {
  novelBook.value      = book;
  novelSave.value      = save || null;
  novelSlotIndex.value = slotIndex ?? 0;
  novelRoleConfig.value = roleConfig;
  showNovelMode.value  = true;
  showHomePage.value   = false;
  sessionStorage.setItem(NOVEL_SESSION_KEY, JSON.stringify({ bookId: book.id, slotIndex: slotIndex ?? 0 }));
}

async function handleNovelSaveBook(payload) {
  novelStore.loadBooks();
  if (novelBook.value) novelBook.value = novelStore.getBook(novelBook.value.id);
  const { slotIndex, saveData, bookUpdates, deleteBook } = payload;
  if (deleteBook && novelBook.value) {
    novelStore.deleteBook(novelBook.value.id);
    showNovelMode.value = false;
    showHomePage.value  = true;
    return;
  }
  if (bookUpdates && novelBook.value) {
    novelStore.updateBook(novelBook.value.id, bookUpdates);
    novelBook.value = novelStore.getBook(novelBook.value.id);
  }
  if (saveData !== undefined && novelBook.value) {
    const existing = novelBook.value.saves?.[slotIndex];
    if (existing) {
      novelStore.updateSave(novelBook.value.id, slotIndex, saveData);
    } else {
      novelStore.createSave(novelBook.value.id, slotIndex, saveData);
    }
    novelBook.value = novelStore.getBook(novelBook.value.id);
  }
}

async function handleNovelDeleteSave(payload) {
  if (!novelBook.value) return;
  const slotIdx = typeof payload === 'number' ? payload : payload.deleteSaveSlot;
  await novelStore.deleteSave(novelBook.value.id, slotIdx);
  novelBook.value = novelStore.getBook(novelBook.value.id);
}

const showDiaryModal = ref(false);
const diaryMode = ref('paper');
const showMoonMenu = ref(false);
const showOverflowMenu = ref(false);
const showStoryExport = ref(false);
const diaryDisplayList = ref([]);

// 🃏 角色卡
const cardTargetRoleId = ref(null)
const cardSavedTheme   = ref(null)
const showCardLibrary  = ref(false)

const cardTargetRole = computed(() =>
  roleList.value.find(r => r.id === cardTargetRoleId.value) || null
)

const cardTargetMessages = computed(() => {
  if (!cardTargetRole.value) return []
  const activeBranchId = cardTargetRole.value.activeBranchId || 'branch-main'
  const branch = (cardTargetRole.value.branches || []).find(b => b.id === activeBranchId)
  return branch?.messages || cardTargetRole.value.chatHistory || []
})

function handleReopenCard(entry) {
  const role = roleList.value.find(r => r.id === entry.roleId)
  if (!role) { showToast('原角色已被删除，无法重新打开', 'error'); return; }
  showCardLibrary.value  = false
  cardTargetRoleId.value = entry.roleId
  cardSavedTheme.value   = entry.theme
}

const pendingRolecard = ref(null)

function handleRolecardDetected({ data, file }) {
  showImportModal.value = false
  pendingRolecard.value = { data, file }
}

function confirmRolecardImport() {
  const { data } = pendingRolecard.value
  if (!data?.role) return
  const incoming = data.role
  const existing = roleList.value.find(r => r.name === incoming.name)
  if (existing) {
    Object.assign(existing, {
      description: incoming.description, systemPrompt: incoming.systemPrompt,
      avatar: incoming.avatar, tags: incoming.tags, speakingStyle: incoming.speakingStyle,
      relationship: incoming.relationship, writingStyle: incoming.writingStyle,
      styleDirectives: incoming.styleDirectives, firstMessage: incoming.firstMessage,
    })
    saveData(); switchRole(existing.id); showToast('✅ 角色定开已更新！')
  } else {
    const newRole = { ...incoming, id: crypto.randomUUID(), chatHistory: data.messages || [], createdAt: Date.now() }
    roleList.value.push(newRole); saveData(); switchRole(newRole.id); showToast('✅ 角色卡导入成功！')
  }
  if (data.theme) {
    cardSavedTheme.value   = data.theme
    cardTargetRoleId.value = roleList.value.find(r => r.name === incoming.name)?.id || null
  }
  pendingRolecard.value = null
}

async function handleEndDay() {
    const msgs = appState.messages.value;
    const realMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant');
    if (realMsgs.length < 3) { showToast('对话还不够丰富，再聊几句再来写日记吧 📝'); return; }
    diaryDisplayList.value = []; diaryMode.value = 'paper'; showDiaryModal.value = true;
    const role = appState.currentRole.value;
    const entry = await diary.generateDiary(role, msgs);
    if (entry) { diaryDisplayList.value = [entry]; executeStartNewDay(); }
    else { showDiaryModal.value = false; showToast('对话还不够丰富，再聊几句再来写日记吧 📝'); }
}

function handleMarkDiaryRead(diaryId) { diary.markAsRead(diaryId); }

function openDiaryHistory() {
    diaryDisplayList.value = diary.getDiariesForRole(appState.currentRoleId.value);
    if (diaryDisplayList.value.length === 0) { appState.showToast?.('还没有日记哦'); return; }
    diaryMode.value = 'card';
    showDiaryModal.value = true;
}

function getCurrentDay(msgs) {
    let day = 1;
    for (const m of msgs) { if (m.type === 'day-separator') day++; }
    return day;
}

function handleStartNewDay() { showMoonMenu.value = false; executeStartNewDay(); }

function executeStartNewDay() {
    if (isStreaming.value) { showToast('请等待回复完成后再操作', 'error'); return; }
    const msgs = appState.messages.value;
    const currentDay = getCurrentDay(msgs);
    const newDay = currentDay + 1;
    const allDiaries = diary.diaries.value;
    const rid = appState.currentRoleId.value;
    const lastDiary = allDiaries.filter(d => d.roleId === rid && !d.groupId).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const separator = { role: 'system', type: 'day-separator', content: `─── 第 ${newDay} 天 ───`, day: newDay, timestamp: new Date().toISOString() };
    let hintContent = `[系统提示：时间已经过去了一晚，现在是新的一天（第${newDay}天）的早晨。请以新的一天的状态开始回应，可以提及昨天发生的事情。]`;
    if (lastDiary) hintContent += `\n[昨晚${lastDiary.roleName}在日记中写道：「${lastDiary.content}」——请自然地延续日记中的情绪和想法，但不要直接提及"日记"这个词。]`;
    const systemHint = { role: 'system', type: 'new-day-hint', content: hintContent };
    msgs.push(separator); msgs.push(systemHint);
    appState.saveData();
    showToast(`☀️ 新的一天开始了！（第 ${newDay} 天）`);
    nextTick(() => scrollToBottom(true));
}

const contextPressure = computed(() => {
    const window = currentRole.value?.memoryWindow || 15;
    const count = messages.value?.length || 0;
    return Math.min(1, count / (window * 2));
});
const pressureColor = computed(() => {
  const p = contextPressure.value;
  if (p < 0.5) return `hsl(${120 - p * 120}, 70%, 50%)`;
  if (p < 0.8) return `hsl(${120 - p * 120}, 80%, 50%)`;
  return `hsl(0, 80%, 55%)`;
});

const latestExpression = computed(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') return extractExpression(messages.value[i].rawContent || messages.value[i].content || '').expression;
    }
  return null;
});

const chatMilestone = computed(() => {
  const hist = currentRole.value?.chatHistory || [];
  if (hist.length === 0) return '在线';
  const rounds = hist.filter(m => m.role === 'assistant').length;
  const firstMsg = hist[0];
  let dayText = '';
  if (firstMsg?.timestamp) {
    const days = Math.floor((Date.now() - firstMsg.timestamp) / 86400000) + 1;
    dayText = ` · 第 ${days} 天`;
  }
  return `对话 ${rounds} 轮${dayText}`;
});

useGestures({ onSwipeRight: () => { showSidebar.value = true; }, onSwipeLeft: () => { showSidebar.value = false; } });

const chatContainer = ref(null);
const inputArea = ref(null);

const {
  globalSettings, roleList, currentRoleId, currentRole, messages,
  showSidebar, showSettings, settingsInitialTab, showImportModal, importJson,
  userInput, isStreaming, isThinking, activeMessageIndex, toast, editModal,
  ttsState, availableVoices, memoryEditState, isUserNearBottom,
  showToast, showConfirmModal, handleConfirm, handleCancel, saveData, loadData,
  switchRole, createNewRole, confirmDeleteRole, clearChat, saveAndCloseSettings,
  setupWatchers, confirmModal, cleanupTimers, cleanupStorageListener
} = appState;

const { sendMessage, stopGeneration, regenerateMessage, deleteMessage, handleShiftEnter } = chatFunctions;
const { toggleMessagePin, isMessagePinned, removeManualMemory, addManualMemory, startEditMemory, saveEditMemory, cancelEditMemory, toggleMemoryExpand, refineMemoryWithAI } = memoryFunctions;
const { loadVoices, playTTS, stopTTS } = ttsFunctions;

const showSearch = ref(false);
const searchQuery = ref('');
const currentMatchIndex = ref(0);
const pendingAiRoleId = ref(null);
const showStylePanel = ref(false);
const customDirective = ref('');

function addStyleDirective(directive) {
  if (!currentRole.value) return;
  if (!currentRole.value.styleDirectives) currentRole.value.styleDirectives = [];
  if (!currentRole.value.styleDirectives.includes(directive)) { currentRole.value.styleDirectives.push(directive); saveData(); }
}
function removeStyleDirective(index) {
  if (!currentRole.value?.styleDirectives) return;
  currentRole.value.styleDirectives.splice(index, 1); saveData();
}
function addCustomStyleDirective() {
  const text = customDirective.value.trim();
  if (!text) return;
  addStyleDirective(text); customDirective.value = '';
}

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const results = [];
  messages.value.forEach((msg, index) => {
    const content = (msg.rawContent || msg.content || '').toLowerCase();
    if (content.includes(query)) results.push(index);
  });
  return results;
});

function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (!showSearch.value) { searchQuery.value = ''; currentMatchIndex.value = 0; }
}
function goToMatch(direction) {
  if (searchResults.value.length === 0) return;
  if (direction === 'next') currentMatchIndex.value = (currentMatchIndex.value + 1) % searchResults.value.length;
  else currentMatchIndex.value = (currentMatchIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
}

function handleSettingsClose() {
  settingsInitialTab.value = '';
  if (pendingAiRoleId.value) {
    const pendingRole = roleList.value.find(r => r.id === pendingAiRoleId.value);
    if (pendingRole && !pendingRole.systemPrompt?.trim()) {
      const idx = roleList.value.indexOf(pendingRole);
      if (idx !== -1) { roleList.value.splice(idx, 1); if (roleList.value.length > 0) switchRole(roleList.value[Math.max(0, idx - 1)].id); }
    }
    pendingAiRoleId.value = null;
  }
  saveAndCloseSettings();
}

function handleGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); showSearch.value = true; }
}

watch(isStreaming, (now, prev) => { if (prev && !now) sfx.play('notify'); });

function sendMessageWithSound() {
  if (!userInput.value?.trim()) return;
  sfx.play('send'); sendMessage();
}
function handleSendSuggestion(text) { userInput.value = text; nextTick(() => sendMessageWithSound()); }

const SCROLL_THRESHOLD = 150;
function checkIfNearBottom() {
  if (!chatContainer.value) return true;
  const { scrollTop, scrollHeight, clientHeight } = chatContainer.value;
  return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
}
async function scrollToBottom(force = false) {
  await nextTick();
  const shouldScroll = force || checkIfNearBottom();
  if (chatContainer.value && shouldScroll) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
}
function onChatScroll() { isUserNearBottom.value = checkIfNearBottom(); }

watch(() => messages.value.length, () => { if (isUserNearBottom.value) scrollToBottom(); });
watch(() => currentRoleId.value, () => { nextTick(() => setTimeout(() => scrollToBottom(true), 50)); });

onUnmounted(() => { cleanupTimers(); cleanupStorageListener(); });

onMounted(() => {
  const sessionRaw = sessionStorage.getItem(NOVEL_SESSION_KEY);
  if (sessionRaw) {
    try {
      const { bookId, slotIndex } = JSON.parse(sessionRaw);
      novelStore.loadBooks();
      const book = novelStore.getBook(bookId);
      if (book) { novelBook.value = book; novelSave.value = book.saves?.[slotIndex] || null; novelSlotIndex.value = slotIndex; showNovelMode.value = true; showHomePage.value = false; }
      else sessionStorage.removeItem(NOVEL_SESSION_KEY);
    } catch { sessionStorage.removeItem(NOVEL_SESSION_KEY); }
  }
  if (!globalSettings.apiKey) {
    setTimeout(() => {
      if (!globalSettings.apiKey && !showOnboarding.value) { settingsInitialTab.value = 'general'; showSettings.value = true; showToast('⚡ 请先配置 API Key 才能开始对话', 'info'); }
    }, 800);
  }
  appState.refreshStorageUsage();
  if (window.visualViewport) {
    const onViewportResize = () => {
      const offset = window.innerHeight - window.visualViewport.height;
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
    };
    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', onViewportResize);
  }
  const msgs = messages.value;
  if (msgs.length > 0) {
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role === 'assistant' && (!lastMsg.content || lastMsg.content.trim() === '')) { lastMsg.content = '⚠️ 生成被中断（页面已刷新）'; lastMsg.interrupted = true; saveData(); }
  }
});

function handleToggleSelect(index) { activeMessageIndex.value = (activeMessageIndex.value === index) ? null : index; }
function handleToggleThinking(index) { const msg = messages.value[index]; if (msg) msg.thinkingExpanded = !msg.thinkingExpanded; }
function handleStartEdit(index) {
  const msg = messages.value[index];
  if (msg) { editModal.show = true; editModal.type = 'message'; editModal.index = index; editModal.originalContent = msg.rawContent || msg.content; }
}

function saveEditMessage() {
  if (editModal.index >= 0 && editModal.index < messages.value.length) {
    const content = editModal.originalContent.trim();
    if (content) {
      const msg = messages.value[editModal.index];
      msg.rawContent = content;
      if (msg.role === 'assistant') { const parsed = parseDualLayerResponse(content); msg.content = parsed.content || content; if (parsed.inner) msg.inner = parsed.inner; }
      else msg.content = content;
      saveData(); showToast('消息已更新');
    }
  }
  cancelEditMessage();
}
function cancelEditMessage() { editModal.show = false; editModal.index = -1; editModal.originalContent = ''; }

async function collectBackupData() {
  const worldbooks = {};
  for (const role of roleList.value) {
    try { const raw = localStorage.getItem('myai_worldbook_' + role.id); if (raw) worldbooks[role.id] = JSON.parse(raw); } catch { }
  }
  const novelBooks = JSON.parse(localStorage.getItem('myai_bookList_v1') || '[]');
  const novelMessages = {};
  for (const book of novelBooks) { const slots = await exportAllBookMessages(book.id); if (slots.length > 0) novelMessages[book.id] = slots; }
  return { version: '6.1', exportTime: new Date().toISOString(), globalSettings, roleList: roleList.value, currentRoleId: currentRoleId.value, diaries: JSON.parse(localStorage.getItem('myai_diaries_v1') || '[]'), persona: JSON.parse(localStorage.getItem('myai_user_persona_v1') || 'null'), worldbooks, novelBooks, novelMessages };
}

async function exportData() {
  const data = await collectBackupData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
  a.download = `myai_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ 完整备份已生成（含群聊、日记、画像、世界书、小说书库）');
}

onMounted(() => {
  loadData(); setupWatchers(); loadVoices(); diary.loadDiaries();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
  nextTick(() => { const msgs = messages.value; if (msgs && msgs.length > 0) showHomePage.value = false; });
  setTimeout(() => scrollToBottom(true), 100);
  window.addEventListener('keydown', handleGlobalKeydown);
  setTimeout(async () => {
    const sent = await activeMessage.checkAndSend(diary);
    if (sent) { await nextTick(); scrollToBottom(true); }
    const unread = diary.getUnreadDiaries();
    if (unread.length > 0) {
      if (showSettings.value) { const stopWatch = watch(showSettings, (val) => { if (!val) { diaryDisplayList.value = unread; showDiaryModal.value = true; stopWatch(); } }); }
      else { diaryDisplayList.value = unread; showDiaryModal.value = true; }
    }
  }, 1000);
});

onUnmounted(() => { window.removeEventListener('keydown', handleGlobalKeydown); });

function handleImport() {
  try {
    if (!importJson.value.trim()) return;
    const data = JSON.parse(importJson.value);
    if (!data.globalSettings || !Array.isArray(data.roleList)) throw new Error('无效的备份文件格式');
    if (data.roleList.length === 0) { showToast('备份文件中没有任何角色数据', 'error'); return; }
    const stats = [];
    stats.push(`${data.roleList.length} 个角色`);
    if (data.diaries?.length) stats.push(`${data.diaries.length} 篇日记`);
    if (data.persona?.traits?.length) stats.push(`${data.persona.traits.length} 条画像`);
    const wbCount = Object.keys(data.worldbooks || {}).length;
    if (wbCount) stats.push(`${wbCount} 个角色世界书`);
    if (data.novelBooks?.length) stats.push(`${data.novelBooks.length} 本小说`);
    showConfirmModal('确认导入', `即将导入 ${stats.join('、')}。\n\n⚠️ 这将覆盖当前所有数据！\n导入前会自动下载一份当前数据的备份文件。`, () => { executeImport(data, stats); });
  } catch (e) { showToast('导入失败: ' + e.message, 'error'); }
}

async function executeImport(data, stats) {
  try {
    try {
      const currentBackup = await collectBackupData();
      const blob = new Blob([JSON.stringify(currentBackup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      a.download = `myai_auto_backup_before_import_${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch { }
    const safeSettings = { ...globalSettings, ...data.globalSettings };
    if (globalSettings.customStyle && !data.globalSettings.customStyle) safeSettings.customStyle = globalSettings.customStyle;
    Object.assign(globalSettings, safeSettings);
    roleList.value = data.roleList; currentRoleId.value = data.currentRoleId || data.roleList[0]?.id; saveData();
    if (Array.isArray(data.diaries)) { localStorage.setItem('myai_diaries_v1', JSON.stringify(data.diaries)); diary.loadDiaries(); }
    if (data.persona) localStorage.setItem('myai_user_persona_v1', JSON.stringify(data.persona));
    if (data.worldbooks && typeof data.worldbooks === 'object') { for (const [roleId, entries] of Object.entries(data.worldbooks)) localStorage.setItem('myai_worldbook_' + roleId, JSON.stringify(entries)); }
    if (Array.isArray(data.novelBooks) && data.novelBooks.length > 0) localStorage.setItem('myai_bookList_v1', JSON.stringify(data.novelBooks));
    if (data.novelMessages && typeof data.novelMessages === 'object') { for (const [bookId, slots] of Object.entries(data.novelMessages)) { for (const { slotIndex, messages } of slots) { if (Array.isArray(messages)) await saveNovelMessages(bookId, slotIndex, messages); } } }
    showImportModal.value = false; importJson.value = '';
    showToast(`✅ 数据恢复成功：${stats.join('、')}`);
  } catch (e) { showToast('导入失败: ' + e.message, 'error'); }
}

function setReaction(messageIndex, emoji) { const msg = messages.value[messageIndex]; if (!msg) return; msg.reaction = emoji; saveData(); }

function exportSingleRole(roleId) {
  const role = roleList.value.find(r => r.id === roleId); if (!role) return;
  const roleDiaries = (diary.diaries?.value || []).filter(d => d.roleId === roleId);
  const payload = { version: 'single-role-v1', exportedAt: new Date().toISOString(), role: JSON.parse(JSON.stringify(role)), diaries: roleDiaries };
  const safeName = (role.name || 'role').replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
  a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  showToast(`📤 已导出「${role.name}」`);
}

function confirmClearAll() {
  showConfirmModal({ title: '清除所有数据', message: '确定要清除所有数据吗？\n\n这将删除所有角色、聊天记录和设置！此操作无法恢复！', isDangerous: true, onConfirm: async () => {
    localStorage.clear();
    const cleanupTasks = [];
    if ('serviceWorker' in navigator) cleanupTasks.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(reg => reg.unregister()))));
    if ('caches' in window) cleanupTasks.push(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
    await Promise.all(cleanupTasks).catch(() => {});
    location.reload();
  }});
}

function handleAvatarError(type, roleId) {
  if (type === 'user') { globalSettings.userAvatar = ''; showToast('用户头像加载失败'); }
  else if (type === 'ai') { const roleIndex = roleList.value.findIndex(r => r.id === roleId); if (roleIndex !== -1) { roleList.value[roleIndex].avatar = ''; showToast('AI头像加载失败'); } }
}
</script>

<template>
  <!-- 🏠 角色选择主页 -->
  <CharacterHome
    v-if="showHomePage && !showNovelMode"
    :role-list="roleList"
    :global-settings="globalSettings"
    @select-role="handleSelectRole"
    @open-settings="showSettings = true"
    @start-novel="handleStartNovel"
    @open-assistant="showAssistant = true"
  />

  <!-- 🌏 小说冒险模式 -->
  <NovelMode
    v-if="showNovelMode && novelBook"
    :book="novelBook"
    :save="novelSave"
    :slot-index="novelSlotIndex"
    :role-config="novelRoleConfig"
    :global-settings="globalSettings"
    @exit="handleNovelExit"
    @save-book="handleNovelSaveBook"
    @delete-save="handleNovelDeleteSave"
    @open-assistant="showAssistant = true"
  />

  <!-- ── 主界面（对话模式） ── -->
  <template v-else-if="!showHomePage">

  <div class="fullscreen-bg" :style="[
    currentRole.background ? { backgroundImage: `url(${currentRole.background})` } : {},
    (globalSettings.chatBgBrightness && globalSettings.chatBgBrightness !== 100)
      ? { filter: `brightness(${globalSettings.chatBgBrightness / 100})` }
      : {}
  ]">
    <img v-if="currentRole.background" :src="currentRole.background" style="display:none" @error="currentRole.background = ''" />
  </div>

  <div id="app" class="h-full flex flex-col relative"
       :style="{
         '--text-filter': (globalSettings.chatTextBrightness && globalSettings.chatTextBrightness !== 100) ? `brightness(${globalSettings.chatTextBrightness / 100})` : undefined,
         '--font-weight-delta': (globalSettings.chatFontWeight || 0) * 100
       }">

    <!-- ══ 顶栏 ══ -->
    <header class="topbar">
      <!-- 左：汉堡键 + 角色信息 -->
      <div class="topbar-left">
        <button class="icon-btn" @click="showSidebar = !showSidebar" title="角色列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>

        <div v-if="currentRole.avatar"
             class="char-avatar expr-avatar"
             :class="latestExpression ? 'expr-' + latestExpression : ''">
          <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="handleAvatarError('ai', currentRoleId)">
        </div>
        <div v-else class="char-avatar-placeholder expr-avatar"
             :class="latestExpression ? 'expr-' + latestExpression : ''">🎭</div>
        <div class="char-meta">
          <div class="char-name">{{ currentRole.name || 'MyAI-RolePlay' }}</div>
          <div class="char-status">
            <span class="status-dot"></span>
            {{ isThinking ? '正在思考...' : isStreaming ? '正在输入...' : chatMilestone }}
          </div>
        </div>
      </div>

      <!-- 右：日夜切换 + 星星菜单 -->
      <div class="topbar-right">
        <!-- 后台任务指示 -->
        <div v-if="bgTasks.isActive.value" class="relative group" title="后台分析中">
          <span class="bg-task-dot"></span>
          <div class="bg-task-tooltip">⚡ {{ bgTasks.taskNames.value }}</div>
        </div>

        <!-- 日夜切换 -->
        <button class="theme-btn" @click="toggleTheme" :title="isDark ? '切换日间' : '切换夜间'">
          {{ isDark ? '🌙' : '☀️' }}
        </button>

        <!-- 星星菜单 -->
        <button class="icon-btn star-btn" @click="showMenuPanel = true" title="功能菜单">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- 侧边栏 -->
    <RoleSidebar
      :roleList="roleList"
      :currentRoleId="currentRoleId"
      :showSidebar="showSidebar"
      @switch-role="(id) => { switchRole(id); }"
      @create-role="createNewRole"
      @ai-create-role="() => { createNewRole(); pendingAiRoleId = currentRole.id; showSidebar = false; showSettings = true; }"
      @delete-role="confirmDeleteRole"
      @export-role="exportSingleRole"
      @generate-card="(id) => { cardSavedTheme = null; cardTargetRoleId = id; showSidebar = false; }"
      @open-card-library="showCardLibrary = true"
      @close="showSidebar = false"
      @avatar-error="handleAvatarError"
    />

    <!-- 聊天区域 -->
      <ChatWindow
        ref="chatContainer"
        :messages="messages"
        :current-role="currentRole"
        :global-settings="globalSettings"
        :is-streaming="isStreaming"
        :is-thinking="isThinking"
        :active-message-index="activeMessageIndex"
        :tts-state="ttsState"
        :memory-functions="{ isMessagePinned, toggleMessagePin }"
        :show-search="showSearch"
        :search-query="searchQuery"
        :search-results="searchResults"
        :current-match-index="currentMatchIndex"
        :branches="branchFunctions.branchList.value"
        :current-branch-id="currentRole.activeBranchId || 'branch-main'"
        :class="{ 'blur-background': showSettings }"
        @toggle-select="handleToggleSelect"
        @toggle-thinking="handleToggleThinking"
        @start-edit="handleStartEdit"
        @delete-message="deleteMessage"
        @regenerate="regenerateMessage"
        @play-tts="playTTS"
        @update:search-query="searchQuery = $event"
        @search-next="goToMatch('next')"
        @search-prev="goToMatch('prev')"
        @close-search="toggleSearch"
        @fork-at="branchFunctions.forkAtMessage"
        @switch-branch="branchFunctions.switchBranch"
        @rename-branch="branchFunctions.renameBranch"
        @delete-branch="branchFunctions.deleteBranch"
        @send-suggestion="handleSendSuggestion"
        @open-diary="openDiaryHistory"
        @set-reaction="setReaction"
      />

      <!-- ══ 底栏输入区（单聊） ══ -->
      <footer class="bottombar">
        <!-- 风格调整面板 -->
        <div class="relative">
          <Transition name="cmd-pop">
            <div v-if="showStylePanel" class="style-adjust-panel">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium" style="color:var(--ink)">🎨 风格调整</span>
                <button @click="showStylePanel = false" style="color:var(--ink-faint);font-size:12px">✖</button>
              </div>
              <div v-if="currentRole.writingStyle" class="style-template-hint">
                <span>🎨</span>
                <span>当前模板：{{ WRITING_STYLE_PRESETS.find(s => s.id === currentRole.writingStyle)?.label || '未知' }}</span>
              </div>
              <div class="text-xs mb-1.5" style="color:var(--ink-faint)">快捷调整</div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                <button v-for="tag in STYLE_QUICK_TAGS" :key="tag.label"
                        @click="addStyleDirective(tag.directive)"
                        class="style-tag-btn"
                        :class="{ active: currentRole.styleDirectives?.includes(tag.directive) }">
                  {{ tag.label }}
                </button>
              </div>
              <div class="text-xs mb-1.5" style="color:var(--ink-faint)">自定义指令</div>
              <div class="flex gap-2 mb-3">
                <input v-model="customDirective"
                       @keydown.enter.prevent="addCustomStyleDirective"
                       placeholder="例如：多用短句，不要铺垫"
                       class="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition"
                       style="background:var(--paper-warm);border:1px solid var(--border);color:var(--ink)" />
                <button @click="addCustomStyleDirective"
                        :disabled="!customDirective.trim()"
                        class="px-3 py-2 rounded-lg text-sm transition disabled:opacity-40"
                        style="background:var(--accent);color:white">添加</button>
              </div>
              <div v-if="currentRole.styleDirectives?.length > 0">
                <div class="text-xs mb-1.5" style="color:var(--ink-faint)">已激活 ({{ currentRole.styleDirectives.length }})</div>
                <div class="style-directives-list">
                  <div v-for="(d, i) in currentRole.styleDirectives" :key="i" class="style-directive-item">
                    <span class="style-directive-text" style="color:var(--ink)">{{ d }}</span>
                    <button @click="removeStyleDirective(i)" class="style-directive-remove">✖</button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
          <div v-if="showStylePanel" class="fixed inset-0 z-30" @click="showStylePanel = false"></div>
        </div>

        <div class="input-row">
          <div class="input-wrap">
            <textarea
              ref="inputArea"
              v-model="userInput"
              @keydown.enter.exact.prevent="sendMessageWithSound"
              @keydown.enter.shift.exact="handleShiftEnter"
              :disabled="isStreaming"
              :placeholder="`你想对 ${currentRole.name || 'AI'} 说点什么…`"
              rows="1"
              class="chat-input"
            ></textarea>
          </div>

          <button v-if="!isStreaming && !isThinking"
                  @click="sendMessageWithSound"
                  :disabled="!userInput.trim()"
                  class="send-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
          <button v-else @click="stopGeneration" class="send-btn stop-btn" title="停止生成">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        </div>
      </footer>
    <!-- ══ 星星菜单底部面板 ══ -->
    <Transition name="panel-slide">
      <div v-if="showMenuPanel" class="panel-overlay" @click.self="showMenuPanel = false">
        <div class="bottom-panel">
          <div class="panel-handle"></div>
          <button class="panel-close" @click="showMenuPanel = false">✕</button>

          <div class="menu-list">
            <div class="menu-row" @click="showMenuPanel = false; openDiaryHistory()">
              <span class="menu-row-icon">📖</span>
              <span class="menu-row-label">角色日记</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; handleEndDay()">
              <span class="menu-row-icon">🌙</span>
              <span class="menu-row-label">结束今天</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; showStoryExport = true">
              <span class="menu-row-icon">🪶</span>
              <span class="menu-row-label">导出为故事</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; showAssistant = true">
              <span class="menu-row-icon">✨</span>
              <span class="menu-row-label">AI 助手</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; showStylePanel = true">
              <span class="menu-row-icon">🎨</span>
              <span class="menu-row-label">风格调整</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; toggleSearch()">
              <span class="menu-row-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </span>
              <span class="menu-row-label">搜索对话</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; showSettings = true">
              <span class="menu-row-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </span>
              <span class="menu-row-label">设置</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-row" @click="showMenuPanel = false; showHomePage = true">
              <span class="menu-row-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </span>
              <span class="menu-row-label">返回首页</span>
              <span class="menu-row-arrow">›</span>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-row danger" @click="showMenuPanel = false; clearChat()">
              <span class="menu-row-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </span>
              <span class="menu-row-label">清空对话记录</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 弹窗们 -->

    <SettingsModal v-if="showSettings"
      :global-settings="globalSettings" :current-role="currentRole"
      :initial-tab="settingsInitialTab" :available-voices="availableVoices"
      :role-list="roleList" :import-json="importJson" :memory-edit-state="memoryEditState"
      @close="handleSettingsClose" @save-data="saveData" @clear-all-data="confirmClearAll"
      @export-data="exportData" @import-data="handleImport" @show-import-modal="showImportModal = true"
      @add-manual-memory="addManualMemory" @remove-manual-memory="removeManualMemory"
      @start-edit-memory="startEditMemory" @save-edit-memory="saveEditMemory"
      @cancel-edit-memory="cancelEditMemory" @toggle-memory-expand="toggleMemoryExpand"
      @refine-memory="refineMemoryWithAI" @show-toast="showToast" />

    <StoryExportModal v-if="showStoryExport"
      :messages="messages"
      :role-name="currentRole.name || '角色'"
      :global-settings="globalSettings" @close="showStoryExport = false" />

    <ImportDataModal v-if="showImportModal" :importJson="importJson"
      @update:importJson="importJson = $event" @import="handleImport"
      @close="showImportModal = false" @rolecard-detected="handleRolecardDetected" />

    <!-- 角色卡导入确认 -->
    <div v-if="pendingRolecard" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div class="fixed inset-0" style="background:var(--overlay-bg);backdrop-filter:blur(4px)" @click="pendingRolecard = null"></div>
      <div class="relative rounded-2xl max-w-sm w-full p-6" style="background:var(--paper-card);border:1px solid var(--border);box-shadow:0 8px 32px var(--shadow-lg)">
        <div class="flex items-center gap-4 mb-5">
          <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style="background:var(--brush)">
            <img v-if="pendingRolecard.data.role?.avatar" :src="pendingRolecard.data.role.avatar" class="w-full h-full object-cover" />
            <span v-else class="text-2xl">🎭</span>
          </div>
          <div>
            <h3 class="text-lg font-bold" style="color:var(--ink)">{{ pendingRolecard.data.role?.name || '未知角色' }}</h3>
            <p class="text-sm mt-0.5" style="color:var(--ink-faint)">🃏 角色卡检测到！</p>
            <p class="text-xs mt-1" style="color:var(--accent)">{{ pendingRolecard.data.messages?.length || 0 }} 条对话记录</p>
          </div>
        </div>
        <p class="text-sm mb-5" style="color:var(--ink-light)">是否要导入这个角色卡？如果同名角色已存在，将更新其设定并保留现有对话。</p>
        <div class="flex gap-3 justify-end">
          <button @click="pendingRolecard = null" class="px-4 py-2 rounded-lg text-sm transition" style="background:var(--brush);color:var(--ink-faint)">取消</button>
          <button @click="confirmRolecardImport" class="px-5 py-2 rounded-lg text-sm font-medium transition" style="background:var(--accent);color:white">✅ 确认导入</button>
        </div>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div v-if="confirmModal.show" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div class="fixed inset-0" style="background:var(--overlay-bg);backdrop-filter:blur(4px)" @click="handleCancel"></div>
      <div class="relative rounded-2xl max-w-sm w-full p-6" style="background:var(--paper-card);border:1px solid var(--border);box-shadow:0 8px 32px var(--shadow-lg)">
        <h3 class="text-xl font-bold mb-4" style="color:var(--ink)">{{ confirmModal.title }}</h3>
        <p class="mb-6 whitespace-pre-wrap" style="color:var(--ink-light)">{{ confirmModal.message }}</p>
        <div class="flex gap-3 justify-end">
          <button @click="handleCancel" class="px-4 py-2 rounded-lg transition" style="background:var(--brush);color:var(--ink-faint)">取消</button>
          <button @click="handleConfirm" class="px-4 py-2 rounded-lg text-white transition shadow-lg"
                  :style="{ background: confirmModal.isDangerous ? '#c07070' : 'var(--accent)' }">确认</button>
        </div>
      </div>
    </div>

    <EditMessageModal v-if="editModal.show" :editModal="editModal" @save="saveEditMessage" @cancel="cancelEditMessage" />

    <DiaryModal :show="showDiaryModal" :diaries="diaryDisplayList" :is-generating="diary.isGenerating.value"
      :mode="diaryMode" @close="showDiaryModal = false" @mark-read="handleMarkDiaryRead" />

    <!-- 角色卡生成器 -->
    <Teleport to="body">
      <div v-if="cardTargetRoleId && cardTargetRole" class="modal-overlay" @click.self="cardTargetRoleId = null">
        <RoleCardGenerator :role="cardTargetRole" :messages="cardTargetMessages"
          :global-settings="globalSettings" :saved-theme="cardSavedTheme"
          @close="cardTargetRoleId = null; cardSavedTheme = null;" />
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showCardLibrary" class="modal-overlay" @click.self="showCardLibrary = false">
        <CardLibraryModal @close="showCardLibrary = false" @reopen-card="handleReopenCard" />
      </div>
    </Teleport>

    <OnboardingOverlay v-if="showOnboarding" @close="showOnboarding = false" />

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast.show"
           class="toast-msg"
           :class="{ 'toast-error': toast.type === 'error' }">
        <span>{{ toast.message }}</span>
        <button v-if="toast.action" @click="toast.action.callback(); toast.show = false;"
                class="toast-action">{{ toast.action.label }}</button>
      </div>
    </Transition>
  </div>
  </template>

  <!-- 助手（全局单例） -->
  <AssistantBot :show="showAssistant" :global-settings="globalSettings" :roles="roleList"
    @close="showAssistant = false" @action="handleAssistantAction" />
</template>

<style scoped>
/* ══ 顶栏 ══ */
.topbar {
  height: 58px;
  display: flex; align-items: center;
  padding: 0 12px; gap: 8px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 8px var(--shadow);
  position: relative; z-index: 20; flex-shrink: 0;
  transition: background .3s, border-color .3s;
}

.topbar-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.topbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

.icon-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: transparent; color: var(--ink-faint);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .15s; flex-shrink: 0;
}
.icon-btn:hover { background: var(--brush); }
.icon-btn:active { transform: scale(.92); }
.icon-btn svg { width: 18px; height: 18px; }

.star-btn { color: var(--accent-gold); }

.theme-btn {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  border: 1px solid rgba(196,150,58,0.25);
  background: rgba(196,150,58,0.1);
  color: var(--accent-gold);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 16px; transition: all .2s;
}
.theme-btn:active { transform: scale(.9); }

.char-avatar {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(196,150,58,0.4); overflow: hidden;
  background: linear-gradient(135deg, #c4b8ae, #9e8478);
  transition: all .3s;
}
[data-theme="dark"] .char-avatar {
  background: linear-gradient(135deg, #a090e0, #6040c0);
  border-color: rgba(139,120,255,0.35);
  box-shadow: 0 0 8px rgba(139,120,255,0.25);
}
.char-avatar-placeholder {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(196,150,58,0.4);
  background: linear-gradient(135deg, #c4b8ae, #9e8478);
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.char-meta { min-width: 0; }
.char-name {
  font-family: 'Noto Serif SC', serif;
  font-size: 15px; font-weight: 500; line-height: 1.2;
  color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color .3s;
}
.char-status {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 10px; color: var(--accent);
  display: flex; align-items: center; gap: 3px; transition: color .3s;
}
.status-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #7aad6e; display: inline-block;
}

/* ══ 底栏 ══ */
.bottombar {
  background: var(--topbar-bg); border-top: 1px solid var(--border);
  padding: 10px 12px max(14px, env(safe-area-inset-bottom, 14px)); flex-shrink: 0; position: relative; z-index: 10;
  box-shadow: 0 -2px 12px var(--shadow);
  transition: background .3s, border-color .3s;
}
.input-row { display: flex; align-items: flex-end; gap: 8px; }
.input-wrap {
  flex: 1; background: var(--paper-card); border-radius: 22px;
  border: 1px solid var(--border); padding: 10px 14px;
  min-height: 44px; max-height: 120px;
  transition: border-color .2s, background .3s;
}
.input-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--brush); }
.chat-input {
  width: 100%; border: none; background: transparent;
  font-family: 'Noto Serif SC', serif; font-size: 15px; color: var(--ink);
  resize: none; outline: none; line-height: 1.5; max-height: 96px; overflow-y: auto;
  transition: color .3s;
}
.chat-input::placeholder { color: var(--ink-faint); opacity: .5; }

.send-btn {
  width: 40px; height: 40px; border-radius: 50%; border: none;
  background: var(--ink); color: var(--paper);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all .2s; box-shadow: 0 2px 8px var(--shadow-lg);
}
[data-theme="dark"] .send-btn { background: var(--accent); box-shadow: 0 2px 8px rgba(139,120,255,0.3); }
.send-btn:disabled { opacity: .45; cursor: not-allowed; }
.send-btn:active:not(:disabled) { transform: scale(.9); }
.send-btn svg { width: 16px; height: 16px; margin-left: 1px; }
.stop-btn { background: #c07070 !important; box-shadow: 0 2px 8px rgba(192,112,112,0.3) !important; }

/* ══ 星星菜单面板 ══ */
.panel-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: var(--overlay-bg); backdrop-filter: blur(2px);
}
.panel-slide-enter-active, .panel-slide-leave-active { transition: opacity .25s; }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; }
.panel-slide-enter-active .bottom-panel,
.panel-slide-leave-active .bottom-panel { transition: transform .32s cubic-bezier(.25,1,.4,1); }
.panel-slide-enter-from .bottom-panel,
.panel-slide-leave-to .bottom-panel { transform: translateY(100%); }

.bottom-panel {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: var(--paper-card); border-radius: 20px 20px 0 0;
  border-top: 1px solid var(--border);
  padding: 14px 20px 32px;
  box-shadow: 0 -4px 24px var(--shadow-lg);
  max-height: 85dvh; overflow-y: auto;
  transition: background .3s, border-color .3s;
}
.panel-handle {
  width: 36px; height: 4px; background: var(--border);
  border-radius: 2px; margin: 0 auto 18px;
}
.panel-close {
  position: absolute; top: 14px; right: 16px;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--paper-warm);
  color: var(--ink-faint); font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.panel-close:active { background: var(--brush); }

.menu-list { display: flex; flex-direction: column; gap: 0; }
.menu-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 4px; cursor: pointer;
  border-bottom: 1px solid var(--border);
  border-radius: 10px; transition: background .15s;
}
.menu-row:last-child { border-bottom: none; }
.menu-row:active { background: var(--brush); }
.menu-row-icon {
  font-size: 20px; width: 28px; text-align: center; flex-shrink: 0;
  color: var(--ink-faint);
  display: flex; align-items: center; justify-content: center;
}
.menu-row-label {
  flex: 1; font-family: 'Noto Sans SC', sans-serif;
  font-size: 15px; color: var(--ink); transition: color .3s;
}
.menu-row-arrow { color: var(--ink-faint); font-size: 18px; }
.menu-row.danger .menu-row-label,
.menu-row.danger .menu-row-icon { color: #c07070; }
.menu-divider { height: 1px; background: var(--border); margin: 6px 0; }

/* ══ Toast ══ */
.toast-msg {
  position: fixed; bottom: 88px; left: 50%;
  transform: translateX(-50%);
  background: var(--ink); color: var(--paper);
  font-family: 'Noto Sans SC', sans-serif; font-size: 13px;
  padding: 8px 18px; border-radius: 20px;
  z-index: 50; white-space: nowrap;
  box-shadow: 0 4px 12px var(--shadow-lg);
  display: flex; align-items: center; gap: 8px;
  transition: background .3s, color .3s;
}
.toast-error { background: #c07070; color: white; }
.toast-action {
  font-size: 11px; font-weight: 500; padding: 2px 8px;
  border-radius: 999px; cursor: pointer; transition: all .15s;
  background: rgba(255,255,255,0.15);
  border: none; color: inherit;
}
.toast-action:hover { background: rgba(255,255,255,0.25); }
.toast-enter-active, .toast-leave-active { transition: all .3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

/* ══ 风格面板 ══ */
.style-adjust-panel {
  position: absolute; bottom: calc(100% + 8px); left: 0; right: 0;
  background: var(--paper-card); border: 1px solid var(--border);
  border-radius: 16px; padding: 14px; z-index: 40;
  box-shadow: 0 -4px 24px var(--shadow-lg);
  max-height: 60vh; overflow-y: auto;
  transition: background .3s;
}
.style-template-hint {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; margin-bottom: 10px;
  background: var(--brush); border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--ink-faint);
}
.style-tag-btn {
  padding: 5px 12px; border-radius: 16px;
  border: 1px solid var(--border); background: var(--paper-warm);
  color: var(--ink-faint); font-size: 13px; cursor: pointer; transition: all .2s;
}
.style-tag-btn.active { background: var(--brush); color: var(--accent); border-color: var(--accent); }
.style-directives-list { display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; }
.style-directive-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 10px;
  background: var(--paper-warm); border: 1px solid var(--border); border-radius: 8px; font-size: 13px;
}
.style-directive-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.style-directive-remove {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
  border: none; background: rgba(192,112,112,0.15); color: #c07070;
  font-size: 10px; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center;
}
.cmd-pop-enter-active, .cmd-pop-leave-active { transition: all .2s ease; }
.cmd-pop-enter-from, .cmd-pop-leave-to { opacity: 0; transform: translateY(8px); }
</style>