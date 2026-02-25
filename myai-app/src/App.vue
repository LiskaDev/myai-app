<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppState } from './composables/useAppState';
import { useChat } from './composables/useChat';
import { useMemory } from './composables/useMemory';
import { useTTS } from './composables/useTTS';

// Import Components
import ChatWindow from './components/ChatWindow.vue';
import SettingsModal from './components/SettingsModal.vue';
import RoleSidebar from './components/RoleSidebar.vue';
import EditMessageModal from './components/EditMessageModal.vue';
import ImportDataModal from './components/ImportDataModal.vue';

// Initialize State
const appState = useAppState();
const chatFunctions = useChat(appState);
const memoryFunctions = useMemory(appState);
const ttsFunctions = useTTS(appState);

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

// 🛡️ 清理 Timer 和 Storage 监听器
onUnmounted(() => {
  cleanupTimers();
  cleanupStorageListener();
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
      messages.value[editModal.index].content = content;
      messages.value[editModal.index].rawContent = content;
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

// 导出数据
function exportData() {
  const data = {
    globalSettings: globalSettings,
    roleList: roleList.value,
    currentRoleId: currentRoleId.value,
    exportTime: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `myai_backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('备份文件已生成');
}

// Lifecycle
onMounted(() => {
  loadData();
  setupWatchers();
  loadVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  scrollToBottom();
});

// 导入数据
function handleImport() {
  try {
    if (!importJson.value.trim()) return;
    const data = JSON.parse(importJson.value);
    if (!data.globalSettings || !Array.isArray(data.roleList)) {
      throw new Error('无效的备份文件格式');
    }
    if (confirm('确定要恢复此备份吗？当前的所有数据将被覆盖！')) {
      Object.assign(globalSettings, data.globalSettings);
      roleList.value = data.roleList;
      currentRoleId.value = data.roleList[0]?.id;
      saveData();
      showImportModal.value = false;
      showToast('数据恢复成功');
    }
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

function confirmClearAll() {
  showConfirmModal({
    title: '清除所有数据',
    message: '确定要清除所有数据吗？\n\n这将删除所有角色、聊天记录和设置！此操作无法恢复！',
    isDangerous: true,
    onConfirm: () => {
      localStorage.clear();
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
  <div class="fullscreen-bg" :style="{ backgroundImage: `url(${currentRole.background})` }"></div>

  <div id="app" class="h-full flex flex-col relative">

    <!-- 顶部导航栏 -->
    <header class="glass-strong bg-glass-dark px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0 z-20">
      <div class="flex items-center space-x-3">
        <button @click="showSidebar = !showSidebar" class="p-2 rounded-full hover:bg-white/10 transition">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        <!-- AI 头像 -->
        <div v-if="currentRole.avatar" class="avatar">
          <img :src="currentRole.avatar" alt="AI Avatar" class="w-full h-full rounded-full object-cover" @error="handleAvatarError('ai', currentRoleId)">
        </div>
        <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
        <div class="text-shadow">
          <h1 class="font-bold text-lg">{{ currentRole.name || 'MyAI-RolePlay' }}</h1>
          <p class="text-xs text-gray-300">{{ isThinking ? '正在输入...' : (isStreaming ? '正在回复...' : '在线') }}</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <!-- 清空聊天按钮 -->
        <button @click="clearChat" class="p-2 rounded-full hover:bg-white/10 transition" title="清空聊天">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
        <!-- 设置按钮 -->
        <button @click="showSettings = true" class="p-2 rounded-full hover:bg-white/10 transition" title="设置">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- 侧边栏（角色列表） -->
    <RoleSidebar
      :roleList="roleList"
      :currentRoleId="currentRoleId"
      :showSidebar="showSidebar"
      @switch-role="switchRole"
      @create-role="createNewRole"
      @delete-role="confirmDeleteRole"
      @close="showSidebar = false"
      @avatar-error="handleAvatarError"
    />

    <!-- 聊天消息区域 -->
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
      :class="{ 'blur-background': showSettings }"
      @toggle-select="handleToggleSelect"
      @toggle-thinking="handleToggleThinking"
      @start-edit="handleStartEdit"
      @delete-message="deleteMessage"
      @regenerate="regenerateMessage"
      @play-tts="playTTS"
    />

    <!-- 底部输入区域 -->
    <footer class="glass-strong bg-glass-dark border-t border-white/10 p-3 flex-shrink-0">
      <form @submit.prevent="sendMessage" class="flex items-end space-x-2">
        <div class="flex-1 relative">
          <textarea ref="inputArea" v-model="userInput"
                    @keydown.enter.exact.prevent="sendMessage"
                    @keydown.enter.shift.exact="handleShiftEnter"
                    :disabled="isStreaming"
                    :placeholder="`与 ${currentRole.name || 'AI'} 对话...`"
                    rows="1"
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-2xl px-4 py-3 resize-none input-focus outline-none border border-white/10 focus:border-primary transition max-h-32 overflow-y-auto text-shadow-light"
                    style="min-height: 48px;"></textarea>
        </div>
        <!-- 发送按钮 -->
        <button type="submit" :disabled="!userInput.trim() || isStreaming"
                class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                v-if="!isStreaming">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
          </svg>
        </button>
        <!-- 停止按钮 -->
        <button type="button" @click="stopGeneration"
                class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center transition hover:from-red-600 hover:to-red-700"
                v-else title="停止生成">
          <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
      </form>
    </footer>

    <!-- 设置面板 -->
    <SettingsModal v-if="showSettings"
      :global-settings="globalSettings"
      :current-role="currentRole"
      :available-voices="availableVoices"
      :role-list="roleList"
      :import-json="importJson"
      :memory-edit-state="memoryEditState"
      @close="saveAndCloseSettings"
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

    <!-- Toast 提示 -->
    <Transition name="toast">
      <div v-if="toast.show"
           class="fixed bottom-24 left-1/2 transform -translate-x-1/2 glass bg-glass-message text-gray-100 px-4 py-2 rounded-full shadow-lg border border-white/10 z-50 text-shadow-light"
           :class="{ 'border-red-500 text-red-400': toast.type === 'error' }">
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>
