<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { buildStoryHTML, polishStory, downloadHTML } from '../composables/useStoryExporter';

const props = defineProps({
    messages: { type: Array, required: true },
    roleName: { type: String, default: '角色' },
    roleColor: { type: String, default: '#818cf8' },
    isGroup: { type: Boolean, default: false },
    participants: { type: Array, default: () => [] },
    globalSettings: { type: Object, required: true },
});

const emit = defineEmits(['close']);

const isPolishing = ref(false);
const polishError = ref('');
const exportSuccess = ref('');

// 倒计时环状态
const ESTIMATED_SECONDS = 18; // 预估 AI 润色时间
const countdown = ref(0); // 已过秒数
const countdownStatus = ref('idle'); // idle | running | done | error
let countdownTimer = null;

function startCountdown() {
    countdown.value = 0;
    countdownStatus.value = 'running';
    countdownTimer = setInterval(() => {
        countdown.value++;
        // 到达预估时间后放慢（不超过 95%）
        if (countdown.value >= ESTIMATED_SECONDS) {
            countdown.value = ESTIMATED_SECONDS;
        }
    }, 1000);
}

function stopCountdown(status) {
    clearInterval(countdownTimer);
    countdownTimer = null;
    countdownStatus.value = status; // 'done' or 'error'
    // 成功时快速填满
    if (status === 'done') {
        countdown.value = ESTIMATED_SECONDS;
    }
    // 3 秒后复位
    setTimeout(() => {
        countdownStatus.value = 'idle';
        countdown.value = 0;
    }, 3000);
}

onUnmounted(() => clearInterval(countdownTimer));

// 倒计时进度 (0~1)
const progress = computed(() => {
    if (countdown.value <= 0) return 0;
    return Math.min(countdown.value / ESTIMATED_SECONDS, 0.95);
});

// SVG 圆环参数
const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ringDashoffset = computed(() => {
    return RING_CIRCUMFERENCE * (1 - (countdownStatus.value === 'done' ? 1 : progress.value));
});

const remainingSeconds = computed(() => {
    if (countdownStatus.value !== 'running') return 0;
    return Math.max(0, ESTIMATED_SECONDS - countdown.value);
});

const messageCount = computed(() => {
    return props.messages.filter(m =>
        m.role !== 'system' && m.type !== 'day-separator' && m.role !== 'pass'
    ).length;
});

const hasMessages = computed(() => messageCount.value > 0);

function getFileName(suffix = '') {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const name = props.roleName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
    return `${name}_故事${suffix}_${date}.html`;
}

// 直接导出
function handleDirectExport() {
    polishError.value = '';
    const html = buildStoryHTML(props.messages, {
        title: `与${props.roleName}的故事`,
        roleName: props.roleName,
        roleColor: props.roleColor,
        isGroup: props.isGroup,
        participants: props.participants,
    });
    downloadHTML(html, getFileName());
    exportSuccess.value = '📖 故事已下载！';
    setTimeout(() => exportSuccess.value = '', 3000);
}

// AI 润色导出
async function handlePolishedExport() {
    if (!props.globalSettings.apiKey) {
        polishError.value = '请先在设置中配置 API Key';
        return;
    }

    isPolishing.value = true;
    polishError.value = '';
    startCountdown();

    try {
        const storyContent = await polishStory(props.messages, props.roleName, {
            baseUrl: props.globalSettings.baseUrl,
            apiKey: props.globalSettings.apiKey,
        });

        if (!storyContent) {
            throw new Error('AI 润色返回空内容');
        }

        const html = buildStoryHTML(props.messages, {
            title: `与${props.roleName}的故事`,
            roleName: props.roleName,
            roleColor: props.roleColor,
            isGroup: props.isGroup,
            participants: props.participants,
        }, { storyContent });

        downloadHTML(html, getFileName('_润色版'));
        stopCountdown('done');
        exportSuccess.value = '✨ 润色故事已下载！';
        setTimeout(() => exportSuccess.value = '', 3000);
    } catch (e) {
        stopCountdown('error');
        polishError.value = e.message || 'AI 润色失败，请重试';
    } finally {
        isPolishing.value = false;
    }
}
</script>

<template>
    <Transition name="toast">
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <!-- 背景遮罩 -->
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

            <!-- 弹窗内容 -->
            <div class="story-modal relative">
                <!-- 标题栏 -->
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-lg font-bold text-white flex items-center gap-2">
                        <span>📖</span> 导出为故事
                    </h3>
                    <button @click="emit('close')"
                            class="p-1.5 rounded-full hover:bg-white/10 transition text-gray-400 hover:text-white">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <!-- 统计信息 -->
                <div class="stats-bar">
                    <div class="stat-item">
                        <span class="stat-num">{{ messageCount }}</span>
                        <span class="stat-label">条消息</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-num">{{ roleName }}</span>
                        <span class="stat-label">主角</span>
                    </div>
                    <div class="stat-item" v-if="isGroup">
                        <span class="stat-num">{{ participants.length }}</span>
                        <span class="stat-label">角色</span>
                    </div>
                </div>

                <!-- 导出选项 -->
                <div v-if="hasMessages" class="space-y-3 mt-5">
                    <!-- 直接导出 -->
                    <button @click="handleDirectExport" class="export-btn export-direct">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">📖</span>
                            <div class="text-left">
                                <div class="font-semibold text-sm">直接导出</div>
                                <div class="text-xs text-gray-400 mt-0.5">对话原文 → 视觉小说排版（免费，即时）</div>
                            </div>
                        </div>
                        <svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor"
                             viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                    </button>

                    <!-- AI 润色导出 -->
                    <button @click="handlePolishedExport" :disabled="isPolishing" class="export-btn export-ai">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl" :class="{ 'animate-pulse': isPolishing }">✨</span>
                            <div class="text-left">
                                <div class="font-semibold text-sm">AI 润色导出</div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    {{ isPolishing ? '正在改写为小说叙述...' : 'AI 改写为第三人称小说（消耗 Token）' }}
                                </div>
                            </div>
                        </div>

                        <!-- 倒计时环 / 完成 / 错误 / 默认下载图标 -->
                        <div class="ring-container flex-shrink-0">
                            <!-- 空闲：下载图标 -->
                            <svg v-if="countdownStatus === 'idle'" class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>

                            <!-- 倒计时环 -->
                            <div v-else-if="countdownStatus === 'running'" class="countdown-ring">
                                <svg width="42" height="42" viewBox="0 0 42 42">
                                    <!-- 背景圆 -->
                                    <circle cx="21" cy="21" :r="RING_RADIUS"
                                            fill="none" stroke="rgba(168,85,247,0.12)" stroke-width="3"/>
                                    <!-- 进度圆 -->
                                    <circle cx="21" cy="21" :r="RING_RADIUS"
                                            fill="none" stroke="#a855f7" stroke-width="3"
                                            stroke-linecap="round"
                                            :stroke-dasharray="RING_CIRCUMFERENCE"
                                            :stroke-dashoffset="ringDashoffset"
                                            class="ring-progress"/>
                                </svg>
                                <span class="ring-text">{{ remainingSeconds }}</span>
                            </div>

                            <!-- 完成：勾 -->
                            <div v-else-if="countdownStatus === 'done'" class="countdown-result done">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>

                            <!-- 错误：叉 -->
                            <div v-else-if="countdownStatus === 'error'" class="countdown-result error">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </div>
                        </div>
                    </button>
                </div>

                <!-- 空状态 -->
                <div v-else class="text-center py-8 text-gray-500">
                    <div class="text-3xl mb-2">📝</div>
                    <div class="text-sm">还没有对话记录，先聊几句再来导出吧</div>
                </div>

                <!-- 错误提示 -->
                <div v-if="polishError" class="error-tip">
                    ⚠️ {{ polishError }}
                </div>

                <!-- 成功提示 -->
                <Transition name="toast">
                    <div v-if="exportSuccess" class="success-tip">
                        {{ exportSuccess }}
                    </div>
                </Transition>

                <!-- 说明 -->
                <p class="text-xs text-gray-600 mt-4 text-center leading-relaxed">
                    导出为 HTML 文件 · 黑色背景衬线字体排版 · 适合截图分享
                </p>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.story-modal {
    background: rgba(12, 12, 20, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 24px;
    max-width: 420px;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.stats-bar {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-item { flex: 1; text-align: center; }
.stat-num { display: block; font-size: 1.1rem; font-weight: 700; color: #e0dce8; }
.stat-label { display: block; font-size: 0.65rem; color: #6b6880; margin-top: 2px; }

.export-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: #e0dce8;
    cursor: pointer;
    transition: all 0.25s ease;
}
.export-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
}
.export-btn:disabled { opacity: 0.7; cursor: wait; }

.export-direct:hover:not(:disabled) {
    border-color: rgba(96, 165, 250, 0.3);
    box-shadow: 0 0 15px rgba(96, 165, 250, 0.08);
}
.export-ai {
    border-color: rgba(168, 85, 247, 0.15);
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.04), rgba(245, 158, 11, 0.04));
}
.export-ai:hover:not(:disabled) {
    border-color: rgba(168, 85, 247, 0.3);
    box-shadow: 0 0 15px rgba(168, 85, 247, 0.1);
}

/* ====== 倒计时环 ====== */
.ring-container {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.countdown-ring {
    position: relative;
    width: 42px;
    height: 42px;
}

.ring-progress {
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 0.8s ease;
}

.ring-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #a855f7;
    font-variant-numeric: tabular-nums;
}

.countdown-result {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: resultPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.countdown-result.done { background: rgba(52, 211, 153, 0.1); }
.countdown-result.error { background: rgba(248, 113, 113, 0.1); }

@keyframes resultPop {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}

.error-tip {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    font-size: 0.8rem;
    text-align: center;
}
.success-tip {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.2);
    color: #86efac;
    font-size: 0.8rem;
    text-align: center;
}
</style>
