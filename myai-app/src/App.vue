<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppState } from './composables/useAppState';
import { useChat } from './composables/useChat';
import { useMemory } from './composables/useMemory';
import { useTTS } from './composables/useTTS';
import { useGestures } from './composables/useGestures';
import { useGroupChat } from './composables/useGroupChat';
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
import GroupChatWindow from './components/GroupChatWindow.vue';
import CreateGroupModal from './components/CreateGroupModal.vue';
import EditGroupModal from './components/EditGroupModal.vue';
import DiaryModal from './components/DiaryModal.vue';
import StoryExportModal from './components/StoryExportModal.vue';
import OnboardingOverlay from './components/OnboardingOverlay.vue';
import RoleCardGenerator from './components/RoleCardGenerator.vue';
import CardLibraryModal from './components/CardLibraryModal.vue';

// Initialize State
const appState = useAppState();
const chatFunctions = useChat(appState);
const memoryFunctions = useMemory(appState);
const ttsFunctions = useTTS(appState);
const groupChat = useGroupChat(appState);
const branchFunctions = useBranch(appState);
// Sound effects — pass globalSettings directly for mute/volume sync
const sfx = useSoundEffects(appState.globalSettings);
const diary = useDiary(appState);
const activeMessage = useActiveMessage(appState);
const bgTasks = useBackgroundTasks();

// 🔤 聊天字体大小 — 通过 CSS 变量应用到所有消息
function applyChatFontSize() {
    const size = appState.globalSettings.chatFontSize || 1.0;
    document.documentElement.style.setProperty('--chat-font-size', size);
}
watch(() => appState.globalSettings.chatFontSize, applyChatFontSize);
applyChatFontSize(); // 初始化时立即应用

// 🌟 新手引导（仅首次显示）
const showOnboarding = ref(!localStorage.getItem('myai_onboarding_done'));

const showCreateGroupModal = ref(false);
const showEditGroupModal = ref(false);
const showDiaryModal = ref(false);
const showDiaryRolePicker = ref(false);
const showMoonMenu = ref(false);
const showStoryExport = ref(false);
const diaryDisplayList = ref([]);

// 🃏 角色卡生成器
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
  if (!role) {
    showToast('原角色已被删除，无法重新打开', 'error')
    return
  }
  showCardLibrary.value  = false
  cardTargetRoleId.value = entry.roleId
  cardSavedTheme.value   = entry.theme
}

// 🌙 结束今天 — 生成日记 + 自动开启新的一天
async function handleEndDay() {
    if (groupChat.isGroupMode.value) {
        // 群聊：提前校验是否有足够的消息
        const msgs = groupChat.groupMessages.value;
        const realMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'director');
        if (realMsgs.length < 3) {
            showToast('对话还不够丰富，再聊几句再来写日记吧 📝');
            return;
        }

        diaryDisplayList.value = [];
        showDiaryModal.value = true;
        const groupId = groupChat.currentGroupId.value;
        const groupName = groupChat.currentGroup.value?.name || '群聊';
        const participants = groupChat.participants.value;

        for (const role of participants) {
            try {
                const entry = await diary.generateDiary(role, msgs, {
                    isGroup: true,
                    groupId,
                    groupName,
                });
                if (entry) {
                    diaryDisplayList.value = [...diaryDisplayList.value, entry];
                }
            } catch (e) {
                console.warn(`${role.name} 日记生成失败:`, e);
            }
        }

        if (diaryDisplayList.value.length > 0) {
            executeStartNewDay();
        } else {
            showDiaryModal.value = false;
        }
    } else {
        // 单聊：提前校验消息数量，避免白等 30 秒后才提示
        const msgs = appState.messages.value;
        const realMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant');
        if (realMsgs.length < 3) {
            showToast('对话还不够丰富，再聊几句再来写日记吧 📝');
            return;
        }

        diaryDisplayList.value = [];
        showDiaryModal.value = true;
        const role = appState.currentRole.value;
        const entry = await diary.generateDiary(role, msgs);
        if (entry) {
            diaryDisplayList.value = [entry];
            // ✨ 日记生成后自动开启新的一天
            executeStartNewDay();
        } else {
            showDiaryModal.value = false;
            showToast('对话还不够丰富，再聊几句再来写日记吧 📝');
        }
    }
}

async function handleDiaryRolePick(role) {
    showDiaryRolePicker.value = false;
    // 先弹出加载界面
    diaryDisplayList.value = [];
    showDiaryModal.value = true;
    const msgs = groupChat.groupMessages.value;
    const entry = await diary.generateDiary(role, msgs, {
        isGroup: true,
        groupId: groupChat.currentGroupId.value,
        groupName: groupChat.currentGroup.value?.name || '群聊',
    });
    if (entry) {
        diaryDisplayList.value = [entry];
    } else {
        showDiaryModal.value = false;
    }
}

function handleMarkDiaryRead(diaryId) {
    diary.markAsRead(diaryId);
}

function openDiaryHistory() {
    if (groupChat.isGroupMode.value) {
        // 群聊：只显示当前群的日记
        const gid = groupChat.currentGroupId.value;
        diaryDisplayList.value = diary.diaries.value
            .filter(d => d.groupId === gid)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
        // 单聊：只显示当前角色的日记
        diaryDisplayList.value = diary.getDiariesForRole(appState.currentRoleId.value);
    }
    if (diaryDisplayList.value.length === 0) {
        appState.showToast?.('还没有日记哦');
        return;
    }
    showDiaryModal.value = true;
}

// 🌅 开启新的一天
function getCurrentDay(msgs) {
    let day = 1;
    for (const m of msgs) {
        if (m.type === 'day-separator') day++;
    }
    return day;
}

function handleStartNewDay() {
    showMoonMenu.value = false;
    executeStartNewDay();
}

function executeStartNewDay() {
    // 🛡️ 流式输出时禁止操作
    if (isStreaming.value || groupChat.isGroupStreaming.value) {
        showToast('请等待回复完成后再操作', 'error');
        return;
    }
    const isGroup = groupChat.isGroupMode.value;
    const msgs = isGroup ? groupChat.groupMessages.value : appState.messages.value;
    const currentDay = getCurrentDay(msgs);
    const newDay = currentDay + 1;

    // 查找最近一篇日记内容
    const allDiaries = diary.diaries.value;
    let lastDiary = null;
    if (isGroup) {
        const gid = groupChat.currentGroupId.value;
        lastDiary = allDiaries.filter(d => d.groupId === gid).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    } else {
        const rid = appState.currentRoleId.value;
        lastDiary = allDiaries.filter(d => d.roleId === rid && !d.groupId).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    }

    // 插入天数分隔线
    const separator = {
        role: 'system',
        type: 'day-separator',
        content: `─── 第 ${newDay} 天 ───`,
        day: newDay,
        timestamp: new Date().toISOString(),
    };

    // 构建系统提示（不可见，仅内部消耗）
    let hintContent = `[系统提示：时间已经过去了一晚，现在是新的一天（第${newDay}天）的早晨。请以新的一天的状态开始回应，可以提及昨天发生的事情。]`;
    if (lastDiary) {
        hintContent += `\n[昨晚${lastDiary.roleName}在日记中写道：「${lastDiary.content}」——请自然地延续日记中的情绪和想法，但不要直接提及"日记"这个词。]`;
    }

    // 🛡️ 系统提示对玩家不可见，仅作为 AI 上下文
    const systemHint = {
        role: 'system',
        type: 'new-day-hint',
        content: hintContent,
    };

    msgs.push(separator);
    msgs.push(systemHint);

    if (isGroup) {
        groupChat.saveGroups();
    } else {
        appState.saveData();
    }
    showToast(`☀️ 新的一天开始了！（第 ${newDay} 天）`);
    nextTick(() => scrollToBottom(true));
}

// Token pressure indicator
const contextPressure = computed(() => {
  if (groupChat.isGroupMode.value) {
    const group = groupChat.currentGroup.value;
    if (!group) return 0;
    const firstRole = groupChat.participants.value[0];
    const window = firstRole?.memoryWindow || 15;
    const count = group.chatHistory?.length || 0;
    return Math.min(1, count / (window * 2));
  } else {
    const window = currentRole.value?.memoryWindow || 15;
    const count = messages.value?.length || 0;
    return Math.min(1, count / (window * 2));
  }
});
const pressureColor = computed(() => {
  const p = contextPressure.value;
  if (p < 0.5) return `hsl(${120 - p * 120}, 70%, 50%)`;
  if (p < 0.8) return `hsl(${120 - p * 120}, 80%, 50%)`;
  return `hsl(0, 80%, 55%)`;
});

// v5.2: 最新 AI 消息的表情（用于标题栏头像）
const latestExpression = computed(() => {
  if (groupChat.isGroupMode.value) {
    const msgs = groupChat.groupMessages.value;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        const result = extractExpression(msgs[i].rawContent || msgs[i].content || '');
        return result.expression;
      }
    }
  } else {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') {
        const result = extractExpression(messages.value[i].rawContent || messages.value[i].content || '');
        return result.expression;
      }
    }
  }
  return null;
});

// 🌟 关系里程碑
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

// Mobile Gestures
useGestures({
  onSwipeRight: () => { showSidebar.value = true; },
  onSwipeLeft: () => { showSidebar.value = false; },
});

// DOM Refs
const chatContainer = ref(null);
const inputArea = ref(null);

// Destructure State & Methods
const {
  globalSettings,
  roleList,
  currentRoleId,
  currentRole,
  messages,
  showSidebar,
  showSettings,
  showImportModal,
  importJson,
  userInput,
  isStreaming,
  isThinking,
  activeMessageIndex,
  toast,
  editModal,
  ttsState,
  availableVoices,
  memoryEditState,
  isUserNearBottom,
  
  showToast,
  showConfirmModal,
  handleConfirm, 
  handleCancel,
  saveData,
  loadData,
  switchRole,
  createNewRole,
  confirmDeleteRole,
  clearChat,
  saveAndCloseSettings,
  setupWatchers,
  confirmModal,
  cleanupTimers,
  cleanupStorageListener
} = appState;

const {
  sendMessage,
  stopGeneration,
  regenerateMessage,
  deleteMessage,
  handleShiftEnter,
} = chatFunctions;

const {
  toggleMessagePin,
  isMessagePinned,
  removeManualMemory,
  addManualMemory,
  startEditMemory,
  saveEditMemory,
  cancelEditMemory,
  toggleMemoryExpand,
  refineMemoryWithAI,
} = memoryFunctions;

const {
  loadVoices,
  playTTS,
  stopTTS,
} = ttsFunctions;

// --- Search Logic ---
const showSearch = ref(false);
const searchQuery = ref('');
const currentMatchIndex = ref(0);

// v5.9: 跟踪 AI 生成角色的待定状态，关闭设置时清理空角色
const pendingAiRoleId = ref(null);

// v6.1: 风格调整面板状态
const showStylePanel = ref(false);
const customDirective = ref('');

function addStyleDirective(directive) {
  if (!currentRole.value) return;
  if (!currentRole.value.styleDirectives) currentRole.value.styleDirectives = [];
  // 避免重复添加
  if (!currentRole.value.styleDirectives.includes(directive)) {
    currentRole.value.styleDirectives.push(directive);
    saveData();
  }
}

function removeStyleDirective(index) {
  if (!currentRole.value?.styleDirectives) return;
  currentRole.value.styleDirectives.splice(index, 1);
  saveData();
}

function addCustomStyleDirective() {
  const text = customDirective.value.trim();
  if (!text) return;
  addStyleDirective(text);
  customDirective.value = '';
}

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const results = [];
  // 🛡️ 群聊模式搜群聊消息，单聊搜单聊消息
  const source = groupChat.isGroupMode.value ? groupChat.groupMessages.value : messages.value;
  source.forEach((msg, index) => {
    const content = (msg.rawContent || msg.content || '').toLowerCase();
    if (content.includes(query)) {
      results.push(index);
    }
  });
  return results;
});

function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (!showSearch.value) {
    searchQuery.value = '';
    currentMatchIndex.value = 0;
  }
}

function goToMatch(direction) {
  if (searchResults.value.length === 0) return;
  if (direction === 'next') {
    currentMatchIndex.value = (currentMatchIndex.value + 1) % searchResults.value.length;
  } else {
    currentMatchIndex.value = (currentMatchIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
  }
}

// v5.9: 关闭设置时清理未完成的 AI 生成角色
function handleSettingsClose() {
  if (pendingAiRoleId.value) {
    const pendingRole = roleList.value.find(r => r.id === pendingAiRoleId.value);
    // 如果角色还是空的（没有 systemPrompt），说明用户取消了生成
    if (pendingRole && !pendingRole.systemPrompt?.trim()) {
      const idx = roleList.value.indexOf(pendingRole);
      if (idx !== -1) {
        roleList.value.splice(idx, 1);
        // 切换回上一个角色
        if (roleList.value.length > 0) {
          switchRole(roleList.value[Math.max(0, idx - 1)].id);
        }
      }
    }
    pendingAiRoleId.value = null;
  }
  saveAndCloseSettings();
}

// Ctrl+F 快捷键
function handleGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    showSearch.value = true;
  }
}

// --- Sound Effect Triggers ---
// Play 'notify' when AI finishes replying (single chat)
watch(isStreaming, (now, prev) => {
  if (prev && !now) sfx.play('notify');
});
// Group chat: play 'notify' after EACH role completes (not just whole round)
groupChat.setOnRoleComplete(() => {
  sfx.play('notify');
});
// Director events: play 'event' when AI director finishes
const pendingDirectorEvent = ref(false);
watch(() => groupChat.isGroupStreaming.value, (now, prev) => {
  if (prev && !now && pendingDirectorEvent.value) {
    sfx.play('event');
    pendingDirectorEvent.value = false;
  }
});

// Wrap sendMessage to play 'send' sound
function sendMessageWithSound() {
  if (!userInput.value?.trim()) return;
  sfx.play('send');
  sendMessage();
}

// 🌟 快捷建议按钮点击：填入内容并发送
function handleSendSuggestion(text) {
  userInput.value = text;
  nextTick(() => sendMessageWithSound());
}

// --- Scroll Logic ---
const SCROLL_THRESHOLD = 150; // 距离底部多少像素内视为 "在底部"

function checkIfNearBottom() {
  if (!chatContainer.value) return true;
  const { scrollTop, scrollHeight, clientHeight } = chatContainer.value;
  return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
}

async function scrollToBottom(force = false) {
  await nextTick();
  // 🛡️ 只在用户靠近底部时自动滚动，避免打断阅读历史
  const shouldScroll = force || checkIfNearBottom();
  if (chatContainer.value && shouldScroll) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

function onChatScroll() {
  // 更新滚动状态用于后续判断
  isUserNearBottom.value = checkIfNearBottom();
}

// Watch messages to scroll (only when near bottom)
watch(() => messages.value.length, () => {
  if (isUserNearBottom.value) {
    scrollToBottom();
  }
});

// 切换角色时强制滚动到底部
watch(() => currentRoleId.value, () => {
  nextTick(() => setTimeout(() => scrollToBottom(true), 50));
});

// 切换群聊时强制滚动到底部
watch(() => groupChat.currentGroupId.value, () => {
  nextTick(() => setTimeout(() => scrollToBottom(true), 50));
});

// 🛡️ 清理 Timer 和 Storage 监听器
onUnmounted(() => {
  cleanupTimers();
  cleanupStorageListener();
});

// 🛡️ 首次进入：无 API Key 时自动打开设置面板
onMounted(() => {
  if (!globalSettings.apiKey) {
    // 延迟一下避免和新手引导冲突
    setTimeout(() => {
      if (!globalSettings.apiKey && !showOnboarding.value) {
        showSettings.value = true;
        showToast('⚡ 请先配置 API Key 才能开始对话', 'info');
      }
    }, 800);
  }
  // 初始化存储用量
  appState.refreshStorageUsage();

  // 📱 iOS 软键盘适配：使用 visualViewport 动态调整布局
  if (window.visualViewport) {
    const onViewportResize = () => {
      const offset = window.innerHeight - window.visualViewport.height;
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
    };
    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', onViewportResize);
  }

  // 🛡️ 刷新页面后流式中断消息标记
  const msgs = messages.value;
  if (msgs.length > 0) {
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role === 'assistant' && (!lastMsg.content || lastMsg.content.trim() === '')) {
      lastMsg.content = '⚠️ 生成被中断（页面已刷新）';
      lastMsg.interrupted = true;
      saveData();
    }
  }
});

// ========================================
// Toggle Thinking/Select are now emitted from ChatWindow
function handleToggleSelect(index) {
  activeMessageIndex.value = (activeMessageIndex.value === index) ? null : index;
}

function handleToggleThinking(index) {
  const msg = messages.value[index];
  if (msg) msg.thinkingExpanded = !msg.thinkingExpanded;
}

function handleStartEdit(index) {
  const msg = messages.value[index];
  if (msg) {
    editModal.show = true;
    editModal.type = 'message';
    editModal.index = index;
    editModal.originalContent = msg.rawContent || msg.content;
  }
}

function saveEditMessage() {
  if (editModal.index >= 0 && editModal.index < messages.value.length) {
    const content = editModal.originalContent.trim();
    if (content) {
      const msg = messages.value[editModal.index];
      // 🛡️ 保留 inner/thinking 层：只更新 rawContent，由渲染器重新拆分
      msg.rawContent = content;
      // 🛡️ AI 消息通过解析器处理，确保 think/inner/expr 标签不泄露（容错变体）
      if (msg.role === 'assistant') {
        const parsed = parseDualLayerResponse(content);
        msg.content = parsed.content || content;
        if (parsed.inner) msg.inner = parsed.inner;
      } else {
        msg.content = content;
      }
      saveData();
      showToast('消息已更新');
    }
  }
  cancelEditMessage();
}

function cancelEditMessage() {
  editModal.show = false;
  editModal.index = -1;
  editModal.originalContent = '';
}

// 导出数据（完整备份：角色 + 群聊 + 日记 + 画像）
function exportData() {
  const data = {
    version: '5.9',
    exportTime: new Date().toISOString(),
    globalSettings: globalSettings,
    roleList: roleList.value,
    currentRoleId: currentRoleId.value,
    // v5.9: 完整备份 —— 群聊、日记、用户画像
    groups: JSON.parse(localStorage.getItem('myai_groups_v1') || '[]'),
    diaries: JSON.parse(localStorage.getItem('myai_diaries_v1') || '[]'),
    persona: JSON.parse(localStorage.getItem('myai_user_persona_v1') || 'null'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `myai_backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 完整备份已生成（含群聊、日记、画像）');
}

// Lifecycle
// 💡 lastVisitTime 由 useChat.js 在用户每次发消息时更新
// 不在页面 load/unload 时操作，避免 F5 刷新把时间覆写为"现在"导致永远 0 小时

onMounted(() => {
  loadData();
  setupWatchers();
  loadVoices();
  groupChat.loadGroups();
  diary.loadDiaries();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  // 延迟确保 DOM 完全渲染后再强制滚动到底部
  setTimeout(() => scrollToBottom(true), 100);
  window.addEventListener('keydown', handleGlobalKeydown);

  // 🌟 主动消息：回访检测（diary 生成完后再弹未读日记）
  // 延迟 1000ms：确保「无 API Key 时自动打开设置面板」（800ms）已执行完，
  // 避免日记弹窗和设置面板同时出现叠叠乐
  setTimeout(async () => {
    const sent = await activeMessage.checkAndSend(diary);
    if (sent) {
      await nextTick();
      scrollToBottom(true);
    }

    // ✅ 必须在 checkAndSend 完成后再检查未读日记
    // 原因：思念日记是异步 API 调用，800ms 固定延迟会错过刚生成的日记
    const unread = diary.getUnreadDiaries();
    if (unread.length > 0) {
      // 🛡️ 如果设置面板已经打开（无 API Key 场景），等它关闭再弹日记
      if (showSettings.value) {
        const stopWatch = watch(showSettings, (val) => {
          if (!val) {
            diaryDisplayList.value = unread;
            showDiaryModal.value = true;
            stopWatch();
          }
        });
      } else {
        diaryDisplayList.value = unread;
        showDiaryModal.value = true;
      }
    }
  }, 1000);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

// 导入数据（从文件选择器获取解析后的数据）
function handleImport() {
  try {
    if (!importJson.value.trim()) return;
    const data = JSON.parse(importJson.value);
    if (!data.globalSettings || !Array.isArray(data.roleList)) {
      throw new Error('无效的备份文件格式');
    }

    // 🛡️ 防御：空 roleList 会导致后续崩溃
    if (data.roleList.length === 0) {
      showToast('备份文件中没有任何角色数据', 'error');
      return;
    }

    // 📊 预览统计信息，让用户知道将要导入什么
    const stats = [];
    stats.push(`${data.roleList.length} 个角色`);
    if (data.groups?.length) stats.push(`${data.groups.length} 个群聊`);
    if (data.diaries?.length) stats.push(`${data.diaries.length} 篇日记`);
    if (data.persona?.traits?.length) stats.push(`${data.persona.traits.length} 条画像`);

    // ⚠️ 二次确认：明确告知会覆盖现有数据
    showConfirmModal(
      '确认导入',
      `即将导入 ${stats.join('、')}。\n\n⚠️ 这将覆盖当前所有数据！\n建议先导出当前数据作为备份。`,
      () => {
        executeImport(data, stats);
      }
    );
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

function executeImport(data, stats) {
  try {
    // 🛡️ 安全合并设置：用当前默认值填充旧备份中缺失的字段
    const safeSettings = { ...globalSettings, ...data.globalSettings };
    // 保护嵌套对象（如 customStyle）不被 undefined 覆盖
    if (globalSettings.customStyle && !data.globalSettings.customStyle) {
      safeSettings.customStyle = globalSettings.customStyle;
    }
    Object.assign(globalSettings, safeSettings);
    roleList.value = data.roleList;
    currentRoleId.value = data.currentRoleId || data.roleList[0]?.id;
    saveData();

    // v5.9: 恢复群聊数据
    if (Array.isArray(data.groups)) {
      localStorage.setItem('myai_groups_v1', JSON.stringify(data.groups));
      groupChat.loadGroups();
    }

    // v5.9: 恢复日记数据
    if (Array.isArray(data.diaries)) {
      localStorage.setItem('myai_diaries_v1', JSON.stringify(data.diaries));
      diary.loadDiaries();
    }

    // v5.9: 恢复用户画像
    if (data.persona) {
      localStorage.setItem('myai_user_persona_v1', JSON.stringify(data.persona));
    }

    showImportModal.value = false;
    importJson.value = '';
    showToast(`✅ 数据恢复成功：${stats.join('、')}`);
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

// 😊 设置消息表情反应
function setReaction(messageIndex, emoji) {
  const msg = messages.value[messageIndex];
  if (!msg) return;
  msg.reaction = emoji; // null = 取消，否则设置表情
  saveData();
}

// 📤 导出单个角色（含全部分支聊天记录 + 日记）
function exportSingleRole(roleId) {
  const role = roleList.value.find(r => r.id === roleId);
  if (!role) return;

  // 收集该角色的日记（diaries 是 ref([])，直接 filter）
  const roleDiaries = (diary.diaries?.value || []).filter(d => d.roleId === roleId);

  const payload = {
    version: 'single-role-v1',
    exportedAt: new Date().toISOString(),
    role: JSON.parse(JSON.stringify(role)), // 深拷贝，含所有分支
    diaries: roleDiaries,
  };

  const safeName = (role.name || 'role').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📤 已导出「${role.name}」`);
}

function confirmClearAll() {
  showConfirmModal({
    title: '清除所有数据',
    message: '确定要清除所有数据吗？\n\n这将删除所有角色、聊天记录和设置！此操作无法恢复！',
    isDangerous: true,
    onConfirm: async () => {
      localStorage.clear();
      // 🛡️ 等待 Service Worker 注销 + 缓存清除都完成后再 reload，
      // 避免 reload 时 SW 还在服务旧缓存内容
      const cleanupTasks = [];
      if ('serviceWorker' in navigator) {
        cleanupTasks.push(
          navigator.serviceWorker.getRegistrations().then(regs =>
            Promise.all(regs.map(reg => reg.unregister()))
          )
        );
      }
      if ('caches' in window) {
        cleanupTasks.push(
          caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
          )
        );
      }
      // 等所有清理完成，再重新加载页面
      await Promise.all(cleanupTasks).catch(() => {});
      location.reload();
    }
  });
}

// 处理头像加载错误
function handleAvatarError(type, roleId) {
  if (type === 'user') {
    globalSettings.userAvatar = '';
    showToast('用户头像加载失败');
  } else if (type === 'ai') {
    const roleIndex = roleList.value.findIndex(r => r.id === roleId);
    if (roleIndex !== -1) {
      roleList.value[roleIndex].avatar = '';
      showToast('AI头像加载失败');
    }
  }
}
</script>

<template>
  <!-- 全屏背景层 -->
  <div class="fullscreen-bg" :style="[
    currentRole.background ? { backgroundImage: `url(${currentRole.background})` } : {},
    { filter: `brightness(${(globalSettings.chatBgBrightness || 100) / 100})` }
  ]">
    <img v-if="currentRole.background" :src="currentRole.background" style="display:none" @error="currentRole.background = ''" />
  </div>

  <div id="app" class="h-full flex flex-col relative"
       :style="{ '--bg-brightness': (globalSettings.chatBgBrightness || 100) / 100, '--text-brightness': (globalSettings.chatTextBrightness || 100) / 100, '--font-weight-delta': (globalSettings.chatFontWeight || 0) * 100 }">

    <!-- 顶部导航栏 -->
    <header class="glass-strong bg-glass-dark px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0 z-20 header-bar"
            :class="'chrome-style-' + (globalSettings.rpTextStyle || 'clear')">
      <div class="flex items-center space-x-3 min-w-0 flex-1">
        <button @click="showSidebar = !showSidebar" class="p-2 rounded-full hover:bg-white/10 transition flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        <!-- AI 头像 -->
        <template v-if="!groupChat.isGroupMode.value">
          <div v-if="currentRole.avatar"
               class="avatar header-avatar flex-shrink-0 expr-avatar"
               :class="latestExpression ? 'expr-' + latestExpression : ''">
            <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="handleAvatarError('ai', currentRoleId)">
          </div>
          <div v-else
               class="avatar-placeholder avatar-ai text-white header-avatar flex-shrink-0 expr-avatar"
               :class="latestExpression ? 'expr-' + latestExpression : ''">🎭</div>
          <div class="text-shadow min-w-0">
            <h1 class="font-bold text-lg header-title truncate">{{ currentRole.name || 'MyAI-RolePlay' }}</h1>
            <p class="text-xs text-gray-300 truncate">{{ isThinking ? `${currentRole.name} 正在思考...` : (isStreaming ? `${currentRole.name} 正在输入...` : chatMilestone) }}</p>
          </div>
        </template>
        <template v-else>
          <div class="avatar-placeholder avatar-ai text-white header-avatar flex-shrink-0">👥</div>
          <div class="text-shadow min-w-0">
            <h1 class="font-bold text-lg header-title truncate">{{ groupChat.currentGroup.value?.name || '群聊' }}</h1>
            <p class="text-xs text-gray-300 truncate">
              {{ groupChat.isGroupStreaming.value
                  ? `${groupChat.currentSpeakingRole.value || '角色'} 正在输入...`
                  : `已聊 ${groupChat.currentGroup.value?.messages?.length || 0} 轮 · ${groupChat.participants.value.length} 位角色` }}
            </p>
          </div>
        </template>
      </div>
      <div class="flex items-center space-x-2 header-actions flex-shrink-0">
        <!-- ⚡ 后台任务指示器 -->
        <div v-if="bgTasks.isActive.value" class="relative group" title="后台分析中">
          <span class="bg-task-dot"></span>
          <div class="bg-task-tooltip">
            ⚡ {{ bgTasks.taskNames.value }}
            <span v-if="bgTasks.totalBgTokens.value > 0" class="ml-1 opacity-60">(🪙 {{ bgTasks.totalBgTokens.value }})</span>
          </div>
        </div>
        <!-- 搜索按钮 -->
        <button @click="toggleSearch" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition" :class="{ 'bg-white/15': showSearch }" title="搜索消息 (Ctrl+F)">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </button>
        <!-- 清空聊天按钮 -->
        <button @click="groupChat.isGroupMode.value ? groupChat.clearGroupChat() : clearChat()" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition" title="清空聊天">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
        <!-- 编辑群聊按钮（仅群聊模式） -->
        <button v-if="groupChat.isGroupMode.value" @click="showEditGroupModal = true" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition" title="编辑群聊">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
        </button>
        <!-- 📖 导出故事按钮 -->
        <button @click="showStoryExport = true" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition" title="导出为故事">
          <span class="text-base">📖</span>
        </button>
        <!-- 🌙 夜晚菜单按钮 -->
        <div class="relative">
          <button @click="showMoonMenu = !showMoonMenu" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition relative" title="🌙 夜晚菜单" :disabled="diary.isGenerating.value">
            <span class="text-base" :class="{ 'animate-pulse': diary.isGenerating.value }">🌙</span>
          </button>
          <!-- 下拉菜单 -->
          <Transition name="dropdown">
            <div v-if="showMoonMenu" class="absolute right-0 top-full mt-2 w-48 glass bg-glass-dark rounded-xl border border-white/15 shadow-2xl overflow-hidden z-50">
              <button @click="showMoonMenu = false; handleEndDay()" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition text-sm text-gray-200">
                <span>🌙</span><span>结束今天</span>
              </button>
              <div class="border-t border-white/10"></div>
              <button @click="showMoonMenu = false; openDiaryHistory()" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition text-sm text-gray-200">
                <span>📖</span><span>查看历史日记</span>
              </button>
            </div>
          </Transition>
          <!-- 点击外部关闭 -->
          <div v-if="showMoonMenu" class="fixed inset-0 z-40" @click="showMoonMenu = false"></div>
        </div>
        <!-- 设置按钮 -->
        <button @click="showSettings = true" class="header-action-btn p-2 rounded-full hover:bg-white/10 transition" title="设置">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- Token 压力条（已隐藏） -->
    <div v-if="false" class="token-pressure-bar">
      <div class="token-pressure-fill" :style="{ width: (contextPressure * 100) + '%', background: pressureColor }" :title="`${Math.round(contextPressure * 100)}% 记忆口用量`"></div>
    </div>

    <!-- 侧边栏（角色列表） -->
    <RoleSidebar
      :roleList="roleList"
      :currentRoleId="currentRoleId"
      :showSidebar="showSidebar"
      :groupChats="groupChat.groupChats.value"
      :currentGroupId="groupChat.currentGroupId.value"
      :isGroupMode="groupChat.isGroupMode.value"
      @switch-role="(id) => { groupChat.exitGroupMode(); switchRole(id); }"
      @create-role="createNewRole"
      @ai-create-role="() => { createNewRole(); pendingAiRoleId = currentRole.id; showSidebar = false; showSettings = true; }"
      @delete-role="confirmDeleteRole"
      @export-role="exportSingleRole"
      @generate-card="(id) => { cardSavedTheme = null; cardTargetRoleId = id; showSidebar = false; }"
      @open-card-library="showCardLibrary = true"
      @close="showSidebar = false"
      @avatar-error="handleAvatarError"
      @switch-group="groupChat.switchToGroup"
      @delete-group="groupChat.deleteGroupChat"
      @create-group="showCreateGroupModal = true"
    />

    <!-- 聊天区域：单聊 / 群聊 条件渲染 -->
    <template v-if="!groupChat.isGroupMode.value">
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

      <!-- 底部输入区域（单聊） -->
      <footer class="glass-strong bg-glass-dark border-t border-white/10 p-3 flex-shrink-0"
              :class="'chrome-style-' + (globalSettings.rpTextStyle || 'clear')">

        <!-- 🎨 风格调整面板（向上弹出） -->
        <div class="relative">
          <Transition name="cmd-pop">
            <div v-if="showStylePanel" class="style-adjust-panel">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-gray-200">🎨 风格调整</span>
                <button @click="showStylePanel = false" class="text-gray-400 hover:text-white transition text-xs">✖</button>
              </div>
              <!-- 当前角色风格模板提示 -->
              <div v-if="currentRole.writingStyle" class="style-template-hint">
                <span>🎨</span>
                <span>当前模板：{{ WRITING_STYLE_PRESETS.find(s => s.id === currentRole.writingStyle)?.label || '未知' }}</span>
              </div>
              <!-- 快捷标签 -->
              <div class="text-xs text-gray-500 mb-1.5">快捷调整</div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                <button v-for="tag in STYLE_QUICK_TAGS" :key="tag.label"
                        @click="addStyleDirective(tag.directive)"
                        class="style-tag-btn"
                        :class="{ active: currentRole.styleDirectives?.includes(tag.directive) }">
                  {{ tag.label }}
                </button>
              </div>
              <!-- 自定义指令 -->
              <div class="text-xs text-gray-500 mb-1.5">自定义指令</div>
              <div class="flex space-x-2 mb-3">
                <input v-model="customDirective"
                       @keydown.enter.prevent="addCustomStyleDirective"
                       placeholder="例如：多用短句，不要铺垫"
                       class="flex-1 glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 text-sm outline-none border border-white/10 focus:border-primary transition" />
                <button @click="addCustomStyleDirective"
                        :disabled="!customDirective.trim()"
                        class="px-3 py-2 rounded-lg bg-primary hover:bg-indigo-600 transition text-sm text-white disabled:opacity-40">
                  添加
                </button>
              </div>
              <!-- 已激活的指令列表 -->
              <div v-if="currentRole.styleDirectives?.length > 0">
                <div class="text-xs text-gray-500 mb-1.5">已激活 ({{ currentRole.styleDirectives.length }})</div>
                <div class="style-directives-list">
                  <div v-for="(d, i) in currentRole.styleDirectives" :key="i" class="style-directive-item">
                    <span class="style-directive-text">{{ d }}</span>
                    <button @click="removeStyleDirective(i)" class="style-directive-remove">✖</button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
          <!-- 点击外部关闭 -->
          <div v-if="showStylePanel" class="fixed inset-0 z-30" @click="showStylePanel = false"></div>
        </div>

        <form @submit.prevent="sendMessageWithSound" class="flex items-center space-x-2">
          <!-- 🎨 风格调整按钮 -->
          <button type="button" @click="showStylePanel = !showStylePanel"
                  class="style-adjust-btn flex-shrink-0"
                  :class="{ active: showStylePanel || (currentRole.styleDirectives?.length > 0) }"
                  title="风格调整">
            🎨
          </button>
          <div class="flex-1 relative">
            <textarea ref="inputArea" v-model="userInput"
                      @keydown.enter.exact.prevent="sendMessageWithSound"
                      @keydown.enter.shift.exact="handleShiftEnter"
                      :disabled="isStreaming"
                      :placeholder="`你想对 ${currentRole.name || 'AI'} 说点什么…`"
                      rows="1"
                      class="w-full glass-light bg-glass-light text-gray-100 rounded-2xl px-4 py-3 resize-none input-focus outline-none border border-white/10 focus:border-primary transition max-h-32 overflow-y-auto text-shadow-light"
                      style="min-height: 48px;"></textarea>
          </div>
          <button type="submit" :disabled="!userInput.trim() || isStreaming || isThinking"
                  class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                  v-if="!isStreaming && !isThinking">
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
            </svg>
          </button>
          <button type="button" @click="stopGeneration"
                  class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center transition hover:from-red-600 hover:to-red-700"
                  v-else title="停止生成">
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
          </button>
        </form>
      </footer>
    </template>

    <!-- 群聊模式 -->
    <template v-else>
      <GroupChatWindow
        :messages="groupChat.groupMessages.value"
        :participants="groupChat.participants.value"
        :current-group="groupChat.currentGroup.value"
        :is-streaming="groupChat.isGroupStreaming.value"
        :current-speaking-role="groupChat.currentSpeakingRole.value"
        :global-settings="globalSettings"
        :missing-count="groupChat.missingMembers.value.length"
        :search-results="searchResults"
        :current-match-index="currentMatchIndex"
        :class="{ 'blur-background': showSettings }"
        @send-director="groupChat.sendDirectorMessage"
        @continue-round="groupChat.continueOneRound"
        @stop-generation="groupChat.stopGroupGeneration"
        @speak-as-role="groupChat.speakAsRole"
        @delete-message="groupChat.deleteGroupMessage"
        @edit-message="groupChat.editGroupMessage"
        @regenerate="groupChat.regenerateGroupMessage"
        @inject-world-event="groupChat.injectWorldEvent"
        @send-whisper="groupChat.sendWhisper"
        @generate-director-event="() => { pendingDirectorEvent = true; groupChat.generateDirectorEvent(true); }"
        @update-affinity="groupChat.updateAffinity"
        @skip-current-role="groupChat.skipCurrentRole"
        @continue-multi-round="groupChat.continueMultiRound"
        @update-group-style-directives="(dirs) => { if (groupChat.currentGroup.value) { groupChat.currentGroup.value.styleDirectives = dirs; groupChat.saveGroups(); } }"
      />
    </template>

    <!-- 创建群聊弹窗 -->
    <CreateGroupModal
      v-if="showCreateGroupModal"
      :roleList="roleList"
      @create="(name, ids, desc) => { groupChat.createGroupChat(name, ids, desc); showCreateGroupModal = false; groupChat.switchToGroup(groupChat.groupChats.value[groupChat.groupChats.value.length - 1].id); }"
      @close="showCreateGroupModal = false"
    />

    <!-- 编辑群聊弹窗 -->
    <EditGroupModal
      v-if="showEditGroupModal && groupChat.currentGroup.value"
      :group="groupChat.currentGroup.value"
      :roleList="roleList"
      @save="(id, name, ids, desc, model, maxTokens, genre) => { groupChat.updateGroupChat(id, name, ids, desc, model, maxTokens, genre); showEditGroupModal = false; }"
      @close="showEditGroupModal = false"
    />

    <!-- 设置面板 -->
    <SettingsModal v-if="showSettings"
      :global-settings="globalSettings"
      :current-role="currentRole"
      :available-voices="availableVoices"
      :role-list="roleList"
      :import-json="importJson"
      :memory-edit-state="memoryEditState"
      :is-group-mode="groupChat.isGroupMode.value"
      :current-group="groupChat.currentGroup.value"
      :participants="groupChat.participants.value"
      @close="handleSettingsClose"
      @save-data="saveData"
      @clear-all-data="confirmClearAll"
      @export-data="exportData"
      @import-data="handleImport"
      @show-import-modal="showImportModal = true"
      @add-manual-memory="addManualMemory"
      @remove-manual-memory="removeManualMemory"
      @start-edit-memory="startEditMemory"
      @save-edit-memory="saveEditMemory"
      @cancel-edit-memory="cancelEditMemory"
      @toggle-memory-expand="toggleMemoryExpand"
      @refine-memory="refineMemoryWithAI"
      @show-toast="showToast"
    />

    <!-- 📖 故事导出弹窗 -->
    <StoryExportModal
      v-if="showStoryExport"
      :messages="groupChat.isGroupMode.value ? groupChat.groupMessages.value : messages"
      :role-name="groupChat.isGroupMode.value ? (groupChat.currentGroup.value?.name || '群聊') : (currentRole.name || '角色')"
      :is-group="groupChat.isGroupMode.value"
      :participants="groupChat.isGroupMode.value ? groupChat.participants.value : []"
      :global-settings="globalSettings"
      @close="showStoryExport = false"
    />

    <!-- 导入数据模态框 -->
    <ImportDataModal
      v-if="showImportModal"
      :importJson="importJson"
      @update:importJson="importJson = $event"
      @import="handleImport"
      @close="showImportModal = false"
    />

    <!-- 确认对话框 -->
    <div v-if="confirmModal.show" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="handleCancel"></div>
      <div class="relative glass bg-glass-dark rounded-2xl max-w-sm w-full p-6 border border-white/10 shadow-2xl">
        <h3 class="text-xl font-bold mb-4 text-white text-shadow">{{ confirmModal.title }}</h3>
        <p class="text-gray-300 mb-6 whitespace-pre-wrap">{{ confirmModal.message }}</p>
        <div class="flex space-x-3 justify-end">
          <button @click="handleCancel" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
          <button @click="handleConfirm" class="px-4 py-2 rounded-lg text-white transition shadow-lg"
                  :class="confirmModal.isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-indigo-600'">确认</button>
        </div>
      </div>
    </div>

    <!-- 编辑消息模态框 -->
    <EditMessageModal
      v-if="editModal.show"
      :editModal="editModal"
      @save="saveEditMessage"
      @cancel="cancelEditMessage"
    />

    <!-- 🌙 日记弹窗 -->
    <DiaryModal
      :show="showDiaryModal"
      :diaries="diaryDisplayList"
      :is-generating="diary.isGenerating.value"
      @close="showDiaryModal = false"
      @mark-read="handleMarkDiaryRead"
    />

    <!-- 群聊日记角色选择 -->
    <Transition name="toast">
      <div v-if="showDiaryRolePicker" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showDiaryRolePicker = false"></div>
        <div class="relative glass bg-glass-dark rounded-2xl max-w-sm w-full p-6 border border-white/10 shadow-2xl">
          <h3 class="text-lg font-bold mb-1 text-white">🌙 今晚想偷看谁的日记？</h3>
          <p class="text-xs text-gray-400 mb-4">选择一个角色来生成 TA 的私密日记</p>
          <div class="space-y-2">
            <button v-for="role in groupChat.participants.value" :key="role.id"
                    @click="handleDiaryRolePick(role)"
                    class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition border border-white/5">
              <div v-if="role.avatar" class="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                <img :src="role.avatar" class="w-full h-full object-cover" />
              </div>
              <div v-else class="w-9 h-9 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0 text-sm">🎭</div>
              <span class="text-sm text-gray-200">{{ role.name }}</span>
            </button>
          </div>
          <button @click="showDiaryRolePicker = false" class="mt-4 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-sm transition">取消</button>
        </div>
      </div>
    </Transition>

    <!-- 🃏 角色卡生成器 Modal -->
    <Teleport to="body">
      <div v-if="cardTargetRoleId && cardTargetRole" class="modal-overlay" @click.self="cardTargetRoleId = null">
        <RoleCardGenerator
          :role="cardTargetRole"
          :messages="cardTargetMessages"
          :global-settings="globalSettings"
          :saved-theme="cardSavedTheme"
          @close="cardTargetRoleId = null; cardSavedTheme = null;"
        />
      </div>
    </Teleport>

    <!-- 🃏 卡片库 Modal -->
    <Teleport to="body">
      <div v-if="showCardLibrary" class="modal-overlay" @click.self="showCardLibrary = false">
        <CardLibraryModal
          @close="showCardLibrary = false"
          @reopen-card="handleReopenCard"
        />
      </div>
    </Teleport>

    <!-- 🌟 新手引导 -->
    <OnboardingOverlay v-if="showOnboarding" @close="showOnboarding = false" />

    <!-- Toast 提示 -->
    <Transition name="toast">
      <div v-if="toast.show"
           class="fixed bottom-24 left-1/2 transform -translate-x-1/2 glass bg-glass-message text-gray-100 px-4 py-2 rounded-full shadow-lg border border-white/10 z-50 text-shadow-light flex items-center gap-2"
           :class="{ 'border-red-500 text-red-400': toast.type === 'error' }">
        <span>{{ toast.message }}</span>
        <button v-if="toast.action"
                @click="toast.action.callback(); toast.show = false;"
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 transition whitespace-nowrap">
          {{ toast.action.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>
