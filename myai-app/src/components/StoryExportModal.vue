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
    <Transition name="export-panel">
        <div class="export-overlay" @click.self="emit('close')">
            <div class="export-panel">
                <!-- 拖把条 -->
                <div class="panel-handle"></div>
                <!-- 关闭按钮 -->
                <button class="panel-close-btn" @click="emit('close')">✕</button>

                <!-- 标题 -->
                <div class="panel-title">📖 导出为故事</div>

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
                <div v-if="hasMessages" class="menu-list">

                    <!-- 直接导出 -->
                    <div class="menu-row" @click="handleDirectExport">
                        <span class="menu-row-icon">📖</span>
                        <div class="menu-row-body">
                            <div class="menu-row-label">直接导出</div>
                            <div class="menu-row-sub">对话原文 → 视觉小说排版（免费，即时）</div>
                        </div>
                        <span class="menu-row-arrow">›</span>
                    </div>

                    <!-- AI 润色导出 -->
                    <div class="menu-row" :class="{ 'menu-row--disabled': isPolishing }"
                         @click="!isPolishing && handlePolishedExport()">
                        <span class="menu-row-icon" :class="{ 'pulse': isPolishing }">✨</span>
                        <div class="menu-row-body">
                            <div class="menu-row-label">AI 润色导出</div>
                            <div class="menu-row-sub">
                                {{ isPolishing ? '正在改写为小说叙述...' : 'AI 改写为第三人称小说（消耗 Token）' }}
                            </div>
                        </div>

                        <!-- 倒计时环 / 完成 / 错误 / 默认箭头 -->
                        <div class="ring-container">
                            <span v-if="countdownStatus === 'idle'" class="menu-row-arrow">›</span>

                            <div v-else-if="countdownStatus === 'running'" class="countdown-ring">
                                <svg width="42" height="42" viewBox="0 0 42 42">
                                    <circle cx="21" cy="21" :r="RING_RADIUS"
                                            fill="none" stroke="var(--brush)" stroke-width="3"/>
                                    <circle cx="21" cy="21" :r="RING_RADIUS"
                                            fill="none" stroke="var(--accent)" stroke-width="3"
                                            stroke-linecap="round"
                                            :stroke-dasharray="RING_CIRCUMFERENCE"
                                            :stroke-dashoffset="ringDashoffset"
                                            class="ring-progress"/>
                                </svg>
                                <span class="ring-text">{{ remainingSeconds }}</span>
                            </div>

                            <div v-else-if="countdownStatus === 'done'" class="countdown-result done">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                                     stroke="#7aad6e" stroke-width="2.5"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>

                            <div v-else-if="countdownStatus === 'error'" class="countdown-result error">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                                     stroke="#c07070" stroke-width="2.5"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 空状态 -->
                <div v-else class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">还没有对话记录，先聊几句再来导出吧</div>
                </div>

                <!-- 错误提示 -->
                <div v-if="polishError" class="tip-bar tip-error">⚠️ {{ polishError }}</div>

                <!-- 成功提示 -->
                <Transition name="toast">
                    <div v-if="exportSuccess" class="tip-bar tip-success">{{ exportSuccess }}</div>
                </Transition>

                <!-- 说明 -->
                <p class="panel-footnote">导出为 HTML 文件 · 黑色背景衬线字体排版 · 适合截图分享</p>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* ── 遮罩 ── */
.export-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: var(--overlay-bg);
    backdrop-filter: blur(2px);
}

/* ── 底部面板 ── */
.export-panel {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: var(--paper-card);
    border-radius: 20px 20px 0 0;
    border-top: 1px solid var(--border);
    padding: 14px 20px max(32px, env(safe-area-inset-bottom, 32px));
    box-shadow: 0 -4px 24px var(--shadow-lg);
    max-height: 85dvh;
    overflow-y: auto;
}

/* 拖把条 */
.panel-handle {
    width: 36px; height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin: 0 auto 18px;
}

/* 关闭按钮 */
.panel-close-btn {
    position: absolute;
    top: 18px; right: 20px;
    width: 28px; height: 28px;
    border-radius: 50%; border: none;
    background: var(--brush);
    color: var(--ink-faint);
    font-size: 12px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
}
.panel-close-btn:hover { color: var(--ink); }

/* 标题 */
.panel-title {
    font-family: 'Noto Serif SC', serif;
    font-size: 16px; font-weight: 500;
    color: var(--ink);
    margin-bottom: 16px;
}

/* 统计条 */
.stats-bar {
    display: flex;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-glass-light, var(--brush));
    border-radius: 12px;
    border: 1px solid var(--border);
    margin-bottom: 6px;
}
.stat-item { flex: 1; text-align: center; }
.stat-num {
    display: block;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 1rem; font-weight: 600;
    color: var(--ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stat-label {
    display: block;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 0.65rem; color: var(--ink-faint);
    margin-top: 2px;
}

/* ── 菜单行 ── */
.menu-list { margin-top: 4px; }

.menu-row {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 4px;
    border-bottom: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s;
}
.menu-row:last-child { border-bottom: none; }
.menu-row:active { background: var(--brush); }
.menu-row--disabled { opacity: 0.65; cursor: wait; }

.menu-row-icon {
    font-size: 20px; width: 28px;
    color: var(--ink-faint);
    flex-shrink: 0; text-align: center;
}
.menu-row-body { flex: 1; min-width: 0; }
.menu-row-label {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 15px; color: var(--ink);
}
.menu-row-sub {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 11px; color: var(--ink-faint);
    margin-top: 2px;
}
.menu-row-arrow {
    color: var(--ink-faint);
    font-size: 18px; flex-shrink: 0;
}

/* ── 倒计时环 ── */
.ring-container {
    width: 42px; height: 42px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.countdown-ring {
    position: relative; width: 42px; height: 42px;
}
.ring-progress {
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 0.8s ease;
}
.ring-text {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 0.7rem; font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
}
.countdown-result {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    animation: resultPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.countdown-result.done { background: rgba(122, 173, 110, 0.12); }
.countdown-result.error { background: rgba(192, 112, 112, 0.12); }

@keyframes resultPop {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}

/* ── 空状态 ── */
.empty-state {
    text-align: center;
    padding: 32px 0;
}
.empty-icon { font-size: 2rem; margin-bottom: 8px; }
.empty-text {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 13px; color: var(--ink-faint);
}

/* ── 提示条 ── */
.tip-bar {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 0.8rem; text-align: center;
}
.tip-error {
    background: rgba(192, 112, 112, 0.1);
    border: 1px solid rgba(192, 112, 112, 0.25);
    color: #c07070;
}
.tip-success {
    background: rgba(122, 173, 110, 0.1);
    border: 1px solid rgba(122, 173, 110, 0.25);
    color: #7aad6e;
}

/* ── 说明 ── */
.panel-footnote {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 11px; color: var(--ink-faint);
    text-align: center; margin-top: 16px;
    line-height: 1.6;
}

/* ── 动效 ── */
.pulse { animation: iconPulse 1.2s ease-in-out infinite; }
@keyframes iconPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* 面板从底部滑入 */
.export-panel-enter-active { transition: opacity 0.25s; }
.export-panel-leave-active { transition: opacity 0.25s; }
.export-panel-enter-from,
.export-panel-leave-to { opacity: 0; }
.export-panel-enter-active .export-panel,
.export-panel-leave-active .export-panel { transition: transform 0.32s cubic-bezier(0.25, 1, 0.4, 1); }
.export-panel-enter-from .export-panel,
.export-panel-leave-to .export-panel { transform: translateY(100%); }

/* Toast 动画（成功提示） */
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(6px); }
</style>
