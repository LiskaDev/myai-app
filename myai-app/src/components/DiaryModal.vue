<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
    show: Boolean,
    diaries: { type: Array, default: () => [] },
    isGenerating: Boolean,
});

const emit = defineEmits(['close', 'mark-read', 'delete-diary']);

const currentIndex = ref(0);

const currentDiary = computed(() => {
    return props.diaries[currentIndex.value] || null;
});

watch(() => props.show, (v) => {
    if (v) currentIndex.value = 0;
});

function prevDiary() {
    if (currentIndex.value > 0) currentIndex.value--;
}

function nextDiary() {
    if (currentIndex.value < props.diaries.length - 1) currentIndex.value++;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${mins}`;
}

function handleClose() {
    // 标记当前日记为已读
    if (currentDiary.value && !currentDiary.value.read) {
        emit('mark-read', currentDiary.value.id);
    }
    emit('close');
}
</script>

<template>
    <Transition name="diary-fade">
        <div v-if="show" class="diary-overlay" @click.self="handleClose">
            <Transition name="diary-slide" appear>
                <div class="diary-container" v-if="show">
                    <!-- 信纸背景 -->
                    <div class="diary-paper">
                        <!-- 顶部装饰 -->
                        <div class="diary-header">
                            <div class="diary-ribbon">📔 私密日记</div>
                            <button @click="handleClose" class="diary-close-btn">✕</button>
                        </div>

                        <!-- 加载状态 -->
                        <div v-if="isGenerating" class="diary-loading">
                            <div class="diary-loading-quill">🪶</div>
                            <p class="diary-loading-text">正在书写日记...</p>
                        </div>

                        <!-- 日记内容 -->
                        <div v-else-if="currentDiary" class="diary-content-area">
                            <!-- 角色信息 -->
                            <div class="diary-author">
                                <div v-if="currentDiary.roleAvatar" class="diary-avatar">
                                    <img :src="currentDiary.roleAvatar" class="w-full h-full object-cover rounded-full" />
                                </div>
                                <div v-else class="diary-avatar diary-avatar-fallback">📝</div>
                                <div>
                                    <div class="diary-author-name">{{ currentDiary.roleName }} 的日记</div>
                                    <div class="diary-date">{{ formatDate(currentDiary.date) }}</div>
                                </div>
                            </div>

                            <!-- 分隔线 -->
                            <div class="diary-divider"></div>

                            <!-- 正文 -->
                            <div class="diary-text">{{ currentDiary.content }}</div>

                            <!-- 签名 -->
                            <div class="diary-signature">
                                —— {{ currentDiary.roleName }}
                            </div>
                        </div>

                        <!-- 空状态 -->
                        <div v-else class="diary-empty">
                            <p>📖 还没有日记哦</p>
                            <p class="text-sm mt-2 opacity-60">点击 🌙 结束今天 来生成第一篇日记</p>
                        </div>

                        <!-- 翻页 -->
                        <div v-if="diaries.length > 1" class="diary-pagination">
                            <button @click="prevDiary" :disabled="currentIndex === 0"
                                    class="diary-page-btn">◀ 上一篇</button>
                            <span class="diary-page-info">{{ currentIndex + 1 }} / {{ diaries.length }}</span>
                            <button @click="nextDiary" :disabled="currentIndex >= diaries.length - 1"
                                    class="diary-page-btn">下一篇 ▶</button>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>
    </Transition>
</template>

<style scoped>
.diary-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 20px;
}

.diary-container {
    width: 100%;
    max-width: 480px;
    max-height: 85vh;
    overflow-y: auto;
}

.diary-paper {
    position: relative;
    background: linear-gradient(180deg,
        #fdf6ec 0%,
        #faf0de 30%,
        #f7ead2 60%,
        #f5e4c8 100%
    );
    border-radius: 4px;
    padding: 32px 28px 24px;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(180, 150, 100, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.5),
        inset 0 -1px 0 rgba(180, 150, 100, 0.2);
    /* 纸纹效果 */
    background-image:
        repeating-linear-gradient(
            transparent,
            transparent 27px,
            rgba(180, 160, 120, 0.15) 27px,
            rgba(180, 160, 120, 0.15) 28px
        );
    background-position-y: 80px;
}

/* 纸张折痕 */
.diary-paper::before {
    content: '';
    position: absolute;
    left: 40px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(200, 80, 80, 0.2);
}

.diary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.diary-ribbon {
    font-family: 'Ma Shan Zheng', cursive, serif;
    font-size: 1.4rem;
    color: #5a3e2b;
    letter-spacing: 2px;
}

.diary-close-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(90, 62, 43, 0.1);
    color: #5a3e2b;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}
.diary-close-btn:hover {
    background: rgba(90, 62, 43, 0.2);
    transform: scale(1.1);
}

.diary-loading {
    text-align: center;
    padding: 40px 0;
}

.diary-loading-quill {
    font-size: 2.5rem;
    animation: quillWrite 1.5s ease-in-out infinite;
}

@keyframes quillWrite {
    0%, 100% { transform: rotate(-5deg) translateY(0); }
    25% { transform: rotate(3deg) translateY(-4px); }
    50% { transform: rotate(-3deg) translateY(0); }
    75% { transform: rotate(5deg) translateY(-2px); }
}

.diary-loading-text {
    font-family: 'Ma Shan Zheng', cursive, serif;
    color: #8b6e52;
    font-size: 1.1rem;
    margin-top: 12px;
    animation: loadingPulse 1.5s ease-in-out infinite;
}

@keyframes loadingPulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}

.diary-author {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.diary-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(180, 150, 100, 0.4);
    flex-shrink: 0;
}

.diary-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(180, 150, 100, 0.2);
    font-size: 1.2rem;
}

.diary-author-name {
    font-family: 'Ma Shan Zheng', cursive, serif;
    font-size: 1.15rem;
    color: #5a3e2b;
    font-weight: 600;
}

.diary-date {
    font-size: 0.75rem;
    color: #a08060;
    margin-top: 2px;
}

.diary-divider {
    height: 1px;
    background: linear-gradient(90deg,
        transparent,
        rgba(180, 150, 100, 0.4) 20%,
        rgba(180, 150, 100, 0.4) 80%,
        transparent
    );
    margin: 12px 0 20px;
}

.diary-text {
    font-family: 'Ma Shan Zheng', cursive, serif;
    font-size: 1.15rem;
    line-height: 2;
    color: #3a2a1a;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 120px;
    padding-left: 20px;
}

.diary-signature {
    font-family: 'Ma Shan Zheng', cursive, serif;
    text-align: right;
    color: #8b6e52;
    font-size: 1rem;
    margin-top: 24px;
    padding-right: 8px;
    font-style: italic;
}

.diary-empty {
    text-align: center;
    padding: 40px 0;
    color: #8b6e52;
    font-family: 'Ma Shan Zheng', cursive, serif;
    font-size: 1.15rem;
}

.diary-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px dashed rgba(180, 150, 100, 0.3);
}

.diary-page-btn {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid rgba(180, 150, 100, 0.3);
    background: rgba(180, 150, 100, 0.1);
    color: #5a3e2b;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
}
.diary-page-btn:hover:not(:disabled) {
    background: rgba(180, 150, 100, 0.2);
}
.diary-page-btn:disabled {
    opacity: 0.3;
    cursor: default;
}

.diary-page-info {
    font-size: 0.8rem;
    color: #a08060;
}

/* === 动画 === */
.diary-fade-enter-active,
.diary-fade-leave-active {
    transition: opacity 0.35s ease;
}
.diary-fade-enter-from,
.diary-fade-leave-to {
    opacity: 0;
}

.diary-slide-enter-active {
    animation: diarySlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.diary-slide-leave-active {
    animation: diarySlideOut 0.3s ease-in forwards;
}

@keyframes diarySlideIn {
    from {
        opacity: 0;
        transform: translateY(30px) scale(0.92) rotateX(8deg);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1) rotateX(0);
    }
}

@keyframes diarySlideOut {
    from {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    to {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
}

/* === 移动端 === */
@media (max-width: 640px) {
    .diary-overlay {
        padding: 12px;
    }
    .diary-paper {
        padding: 24px 20px 20px;
    }
    .diary-text {
        font-size: 1.05rem;
        padding-left: 12px;
    }
}
</style>
