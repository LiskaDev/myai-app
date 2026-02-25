<script setup>
import { ref, watch, nextTick, computed } from 'vue';
import { renderMarkdown } from '../utils/markdown';
import { parseDualLayerResponse } from '../utils/textParser';

const props = defineProps({
    messages: { type: Array, default: () => [] },
    participants: { type: Array, default: () => [] },
    currentGroup: Object,
    isStreaming: Boolean,
    currentSpeakingRole: String,
    globalSettings: Object,
});

const emit = defineEmits([
    'send-director',
    'continue-round',
    'stop-generation',
    'speak-as-role',
]);

const containerRef = ref(null);
const directorInput = ref('');
const showMentionList = ref(false);
const mentionFilter = ref('');
const inputRef = ref(null);

// 角色颜色映射（最多 8 种颜色，循环使用）
const ROLE_COLORS = [
    '#818cf8', // indigo
    '#f472b6', // pink
    '#34d399', // emerald
    '#fbbf24', // amber
    '#60a5fa', // blue
    '#a78bfa', // violet
    '#fb923c', // orange
    '#2dd4bf', // teal
];

function getRoleColor(roleId) {
    const index = props.participants.findIndex(p => p.id === roleId);
    return ROLE_COLORS[index % ROLE_COLORS.length];
}

// @ 提及：过滤的角色列表
const filteredMentions = computed(() => {
    if (!mentionFilter.value) return props.participants;
    return props.participants.filter(p =>
        p.name.toLowerCase().includes(mentionFilter.value.toLowerCase())
    );
});

function safeRender(content) {
    try {
        if (!content) return '';
        const parsed = parseDualLayerResponse(content);
        return renderMarkdown(parsed.content || content);
    } catch {
        return content;
    }
}

// 监听输入框内容变化，检测 @
function onInputChange() {
    const value = directorInput.value;
    const cursorPos = inputRef.value?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);

    // 找到最后一个 @ 符号
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex >= 0) {
        const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
        // 如果 @ 后没有空格，说明正在输入名字
        if (!afterAt.includes(' ')) {
            mentionFilter.value = afterAt;
            showMentionList.value = true;
            return;
        }
    }
    showMentionList.value = false;
}

// 选择 @ 角色
function selectMention(role) {
    const value = directorInput.value;
    const cursorPos = inputRef.value?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
        const before = value.substring(0, lastAtIndex);
        const after = value.substring(cursorPos);
        directorInput.value = `${before}@${role.name} ${after}`;
    }

    showMentionList.value = false;
    nextTick(() => inputRef.value?.focus());
}

// 自动滚动到底部
watch(() => props.messages.length, () => {
    nextTick(() => {
        if (containerRef.value) {
            containerRef.value.scrollTop = containerRef.value.scrollHeight;
        }
    });
});

// 流式输出时跟随滚动
watch(() => {
    const msgs = props.messages;
    return msgs.length > 0 ? msgs[msgs.length - 1]?.content : '';
}, () => {
    nextTick(() => {
        if (containerRef.value) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
            if (scrollHeight - scrollTop - clientHeight < 200) {
                containerRef.value.scrollTop = scrollHeight;
            }
        }
    });
});

function handleSend() {
    if (!directorInput.value.trim()) return;
    showMentionList.value = false;
    emit('send-director', directorInput.value);
    directorInput.value = '';
}
</script>

<template>
    <div ref="containerRef"
         class="flex-1 overflow-y-auto px-4 py-4 space-y-4"
         style="scroll-behavior: smooth;">

        <!-- 空消息时的提示 -->
        <div v-if="messages.length === 0"
             class="flex items-center justify-center h-full">
            <div class="text-center text-gray-400 space-y-3">
                <div class="text-4xl">👥</div>
                <p class="text-lg font-medium">{{ currentGroup?.name || '群聊' }}</p>
                <p class="text-sm">
                    参与角色：{{ participants.map(p => p.name).join('、') }}
                </p>
                <p class="text-xs text-gray-500">发送消息引导讨论，或直接点击 ▶️ 让他们开聊</p>
                <!-- 角色快捷触发按钮 -->
                <div class="flex flex-wrap justify-center gap-2 mt-4">
                    <button v-for="p in participants" :key="p.id"
                            @click="$emit('speak-as-role', p.id)"
                            :disabled="isStreaming"
                            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 transition text-xs disabled:opacity-40"
                            :style="{ borderColor: getRoleColor(p.id) + '50' }"
                            :title="`让${p.name}说一句`">
                        <span>💬</span>
                        <span :style="{ color: getRoleColor(p.id) }">{{ p.name }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 消息列表 -->
        <template v-for="(msg, index) in messages" :key="index">
            <!-- 导演消息 -->
            <div v-if="msg.role === 'director'" class="flex justify-center">
                <div class="director-message">
                    <span class="director-label">🎬 导演</span>
                    <span>{{ msg.content }}</span>
                </div>
            </div>

            <!-- AI 角色消息 -->
            <div v-else-if="msg.role === 'assistant'" class="flex items-start space-x-3">
                <!-- 角色头像（可点击让该角色继续说） -->
                <div class="flex-shrink-0 cursor-pointer group" @click="$emit('speak-as-role', msg.roleId)"
                     :title="`让${msg.roleName}继续说`">
                    <div v-if="msg.avatar" class="w-10 h-10 rounded-full overflow-hidden transition group-hover:ring-2 group-hover:ring-white/30"
                         :style="{ border: `2px solid ${getRoleColor(msg.roleId)}` }">
                        <img :src="msg.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-10 h-10 rounded-full flex items-center justify-center text-sm transition group-hover:ring-2 group-hover:ring-white/30"
                         :style="{ background: getRoleColor(msg.roleId), border: `2px solid ${getRoleColor(msg.roleId)}` }">
                        🎭
                    </div>
                    <div class="text-center mt-0.5 opacity-0 group-hover:opacity-100 transition text-[10px] text-gray-400">💬</div>
                </div>

                <div class="max-w-[80%] min-w-0">
                    <!-- 角色名 -->
                    <div class="text-xs mb-1 font-medium"
                         :style="{ color: getRoleColor(msg.roleId) }">
                        {{ msg.roleName || '角色' }}
                    </div>
                    <!-- 消息内容 -->
                    <div class="group-speech-bubble"
                         :style="{ borderLeftColor: getRoleColor(msg.roleId) }">
                        <div v-if="msg.content" class="vn-body markdown-body"
                             v-html="safeRender(msg.rawContent || msg.content)">
                        </div>
                        <div v-else class="typing-indicator">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- 正在输入状态 -->
        <div v-if="isStreaming && currentSpeakingRole && !(messages.length > 0 && !messages[messages.length - 1]?.content)"
             class="flex items-center space-x-2 text-gray-400 text-sm pl-13">
        </div>
    </div>

    <!-- 角色快捷栏 -->
    <div v-if="messages.length > 0" class="flex items-center px-4 py-2 space-x-2 border-t border-white/5 overflow-x-auto flex-shrink-0">
        <span class="text-xs text-gray-500 whitespace-nowrap">让谁说：</span>
        <button v-for="p in participants" :key="p.id"
                @click="$emit('speak-as-role', p.id)"
                :disabled="isStreaming"
                class="flex items-center space-x-1 px-2.5 py-1 rounded-full border border-white/10 hover:bg-white/10 transition text-xs whitespace-nowrap disabled:opacity-40 flex-shrink-0"
                :style="{ borderColor: getRoleColor(p.id) + '40' }">
            <div v-if="p.avatar" class="w-5 h-5 rounded-full overflow-hidden"
                 :style="{ border: `1.5px solid ${getRoleColor(p.id)}` }">
                <img :src="p.avatar" class="w-full h-full object-cover" />
            </div>
            <div v-else class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                 :style="{ background: getRoleColor(p.id) }">🎭</div>
            <span :style="{ color: getRoleColor(p.id) }">{{ p.name }}</span>
        </button>
    </div>

    <!-- 底部输入区 -->
    <footer class="glass-strong bg-glass-dark border-t border-white/10 p-3 flex-shrink-0">
        <div class="relative">
            <!-- @ 提及下拉列表 -->
            <div v-if="showMentionList && filteredMentions.length > 0"
                 class="absolute bottom-full left-0 right-0 mb-2 glass bg-glass-dark rounded-xl border border-white/15 shadow-2xl overflow-hidden z-10">
                <div v-for="role in filteredMentions" :key="role.id"
                     @mousedown.prevent="selectMention(role)"
                     class="flex items-center space-x-2 px-3 py-2 hover:bg-white/10 cursor-pointer transition">
                    <div v-if="role.avatar" class="w-6 h-6 rounded-full overflow-hidden">
                        <img :src="role.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                         :style="{ background: getRoleColor(role.id) }">🎭</div>
                    <span class="text-sm" :style="{ color: getRoleColor(role.id) }">{{ role.name }}</span>
                </div>
            </div>

            <form @submit.prevent="handleSend" class="flex items-end space-x-2">
                <div class="flex-1 relative">
                    <textarea ref="inputRef" v-model="directorInput"
                        @keydown.enter.exact.prevent="handleSend"
                        @input="onInputChange"
                        :disabled="isStreaming"
                        placeholder="以导演身份发言（输入 @ 点名角色）..."
                        rows="1"
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-2xl px-4 py-3 resize-none input-focus outline-none border border-white/10 focus:border-primary transition max-h-32 overflow-y-auto text-shadow-light"
                        style="min-height: 48px;"></textarea>
                </div>
                <!-- 发送按钮 -->
                <button type="submit" :disabled="!directorInput.trim() || isStreaming"
                        class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                        v-if="!isStreaming"
                        title="发送导演消息">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                    </svg>
                </button>
                <!-- 停止按钮 -->
                <button type="button" @click="$emit('stop-generation')"
                        class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center transition"
                        v-if="isStreaming" title="停止生成">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                    </svg>
                </button>
                <!-- 继续一轮按钮 -->
                <button type="button" @click="$emit('continue-round')"
                        :disabled="isStreaming"
                        class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="继续一轮（所有角色各说一句）">
                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"></path>
                    </svg>
                </button>
            </form>
        </div>
    </footer>
</template>

<style scoped>
/* 导演消息 */
.director-message {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.08));
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 20px;
    padding: 8px 18px;
    color: #fcd34d;
    font-size: 0.9rem;
    max-width: 85%;
}

.director-label {
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.8;
    white-space: nowrap;
}

/* 群聊气泡 */
.group-speech-bubble {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 3px solid #6366f1;
    padding: 12px 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
}

.group-speech-bubble:hover {
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}
</style>
