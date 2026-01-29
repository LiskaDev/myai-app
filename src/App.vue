<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppState } from './composables/useAppState';
import { useChat } from './composables/useChat';
import { useMemory } from './composables/useMemory';
import { useTTS } from './composables/useTTS';

// Import Components
import ChatWindow from './components/ChatWindow.vue';
import SettingsModal from './components/SettingsModal.vue';

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

// ========================================
// 🎤 语音输入功能 (Speech-to-Text)
// ========================================
const isRecording = ref(false);
let recognition = null;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('浏览器不支持语音识别');
    return null;
  }
  
  const r = new SpeechRecognition();
  r.lang = 'zh-CN';
  r.continuous = false;
  r.interimResults = true;
  
  r.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    userInput.value = transcript;
  };
  
  r.onend = () => {
    isRecording.value = false;
  };
  
  r.onerror = (event) => {
    console.error('语音识别错误:', event.error);
    isRecording.value = false;
    if (event.error === 'not-allowed') {
      showToast('请允许麦克风权限', 'error');
    }
  };
  
  return r;
}

function toggleVoiceInput() {
  if (!recognition) {
    recognition = initSpeechRecognition();
  }
  
  if (!recognition) {
    showToast('您的浏览器不支持语音输入', 'error');
    return;
  }
  
  if (isRecording.value) {
    recognition.stop();
    isRecording.value = false;
  } else {
    try {
      recognition.start();
      isRecording.value = true;
    } catch (e) {
      console.error('启动语音识别失败:', e);
    }
  }
}

// 🛡️ 清理 Timer 和 Storage 监听器
onUnmounted(() => {
  cleanupTimers();
  cleanupStorageListener();
  if (recognition) {
    recognition.stop();
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
    <div class="sidebar fixed inset-y-0 left-0 w-80 glass-strong bg-glass-dark z-30 border-r border-white/10 overflow-y-auto" :class="{ 'hidden': !showSidebar }">
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-lg text-shadow">🎭 角色列表</h2>
          <button @click="showSidebar = false" class="p-2 rounded-full hover:bg-white/10 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- 角色列表 -->
        <div class="space-y-3">
          <div v-for="role in roleList" :key="role.id" @click="switchRole(role.id)"
               class="role-item p-3 rounded-lg cursor-pointer border border-white/10 relative"
               :class="{ 'active': role.id === currentRoleId }">
            <div class="flex items-center space-x-3">
              <div v-if="role.avatar" class="avatar">
                <img :src="role.avatar" alt="Role Avatar" class="w-full h-full rounded-full object-cover" @error="handleAvatarError('ai', role.id)">
              </div>
              <div v-else class="avatar-placeholder avatar-ai text-white">🎭</div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-sm truncate">{{ role.name }}</h3>
                <p class="text-xs text-gray-400 truncate">{{ role.chatHistory?.length || 0 }} 条对话</p>
              </div>
              <!-- 删除按钮 -->
              <button @click.stop="confirmDeleteRole(role.id)" class="delete-btn p-1 rounded-full hover:bg-red-500/20 transition" title="删除角色">
                <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 添加新角色按钮 -->
        <div class="mt-4">
          <button @click="createNewRole" class="w-full glass bg-glass-message text-gray-300 rounded-xl px-4 py-3 text-center hover:bg-glass-light transition border border-dashed border-white/20">
            ➕ 创建新角色
          </button>
        </div>
      </div>
    </div>

    <!-- 遮罩层 -->
    <div v-if="showSidebar" @click="showSidebar = false" class="fixed inset-0 bg-black/50 z-20"></div>

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

    <!-- 底部输入区域 v6.0 -->
    <footer class="bg-glass-dark border-t border-white/10 p-3 flex-shrink-0">
      <form @submit.prevent="sendMessage" class="flex items-end space-x-2">
        <div class="flex-1 relative">
          <textarea ref="inputArea" v-model="userInput"
                    @keydown.enter.exact.prevent="sendMessage"
                    @keydown.enter.shift.exact="handleShiftEnter"
                    :disabled="isStreaming || isRecording"
                    :placeholder="isRecording ? '🎤 正在录音...' : `与 ${currentRole.name || 'AI'} 对话...`"
                    rows="1"
                    class="w-full form-input rounded-2xl px-4 py-3 resize-none max-h-32 overflow-y-auto"
                    :class="{ 'border-red-500': isRecording }"
                    style="min-height: 48px;"></textarea>
        </div>
        
        <!-- 🎤 语音输入按钮 -->
        <button type="button" @click="toggleVoiceInput"
                :disabled="isStreaming"
                class="voice-btn w-11 h-11 rounded-full flex items-center justify-center transition"
                :class="isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'"
                :title="isRecording ? '停止录音' : '语音输入'">
          <svg class="w-5 h-5" :class="isRecording ? 'text-white' : 'text-gray-300'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
          </svg>
        </button>
        
        <!-- 发送按钮 -->
        <button type="submit" :disabled="!userInput.trim() || isStreaming"
                class="send-btn w-11 h-11 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                v-if="!isStreaming">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
          </svg>
        </button>
        <!-- 停止按钮 -->
        <button type="button" @click="stopGeneration"
                class="send-btn w-11 h-11 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center transition hover:from-red-600 hover:to-red-700"
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
    <div v-if="showImportModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showImportModal = false"></div>
      <div class="relative glass bg-glass-dark rounded-2xl max-w-lg w-full p-6 border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
        <header class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-white text-shadow">恢复数据</h3>
          <button @click="showImportModal = false" class="text-gray-400 hover:text-white transition">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </header>
        <div class="flex-1 overflow-y-auto mb-4">
          <p class="text-sm text-gray-300 mb-2">请粘贴您之前导出的 JSON 备份内容：</p>
          <textarea v-model="importJson"
                    class="w-full h-64 glass-light bg-glass-light text-gray-100 rounded-lg p-3 outline-none border border-white/10 focus:border-primary transition font-mono text-xs resize-none"
                    placeholder='{"globalSettings": {...}, "roleList": [...]}'></textarea>
        </div>
        <div class="flex justify-end space-x-3">
          <button @click="showImportModal = false" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
          <button @click="handleImport" class="px-4 py-2 rounded-lg bg-primary hover:bg-indigo-600 text-white transition shadow-lg" :disabled="!importJson.trim()">确认恢复</button>
        </div>
      </div>
    </div>

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
    <div v-if="editModal.show" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="cancelEditMessage"></div>
      <div class="relative glass bg-glass-dark rounded-2xl max-w-lg w-full p-6 border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
        <header class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-white text-shadow">✏️ 编辑消息</h3>
          <button @click="cancelEditMessage" class="text-gray-400 hover:text-white transition">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </header>
        <div class="flex-1 overflow-y-auto mb-4">
          <p class="text-sm text-gray-400 mb-2">修改此消息内容：</p>
          <textarea v-model="editModal.originalContent"
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-lg p-3 outline-none border border-white/10 focus:border-primary transition resize-none"
                    placeholder="输入消息内容..." style="min-height: 150px;"></textarea>
        </div>
        <div class="flex justify-end space-x-3">
          <button @click="cancelEditMessage" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
          <button @click="saveEditMessage" class="px-4 py-2 rounded-lg bg-primary hover:bg-indigo-600 text-white transition shadow-lg">保存修改</button>
        </div>
      </div>
    </div>

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
