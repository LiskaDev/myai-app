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
]);

const containerRef = ref(null);
const directorInput = ref('');

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

function safeRender(content) {
    try {
        if (!content) return '';
        const parsed = parseDualLayerResponse(content);
        return renderMarkdown(parsed.content || content);
    } catch {
        return content;
    }
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
                <p class="text-xs text-gray-500">发送消息引导讨论，或直接点击"继续一轮"让他们开聊</p>
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
                <!-- 角色头像 -->
                <div class="flex-shrink-0">
                    <div v-if="msg.avatar" class="w-10 h-10 rounded-full overflow-hidden"
                         :style="{ border: `2px solid ${getRoleColor(msg.roleId)}` }">
                        <img :src="msg.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-10 h-10 rounded-full flex items-center justify-center text-sm"
                         :style="{ background: getRoleColor(msg.roleId), border: `2px solid ${getRoleColor(msg.roleId)}` }">
                        🎭
                    </div>
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
        <div v-if="isStreaming && currentSpeakingRole && !messages[messages.length - 1]?.content"
             class="flex items-center space-x-2 text-gray-400 text-sm pl-13">
            <span>{{ currentSpeakingRole }} 正在输入...</span>
        </div>
    </div>

    <!-- 底部输入区 -->
    <footer class="glass-strong bg-glass-dark border-t border-white/10 p-3 flex-shrink-0">
        <form @submit.prevent="handleSend" class="flex items-end space-x-2">
            <div class="flex-1 relative">
                <textarea v-model="directorInput"
                    @keydown.enter.exact.prevent="handleSend"
                    :disabled="isStreaming"
                    placeholder="以导演身份发言..."
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
