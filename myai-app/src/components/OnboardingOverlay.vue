<script setup>
import { ref } from 'vue';

const emit = defineEmits(['close']);

const currentStep = ref(0);

const steps = [
  {
    icon: '🎭',
    title: '选一个角色开始',
    desc: '左上角打开侧边栏，挑选一个你喜欢的角色。每个角色都有独立的性格、记忆和故事线。',
    tip: '也可以用 ✨AI 一键生成 创建你自己的角色',
  },
  {
    icon: '💬',
    title: '和 TA 聊天吧',
    desc: '在下方输入框发消息，AI 会以角色身份回复你。试试点击欢迎屏的快捷建议按钮，一键开启对话！',
    tip: '长按消息可以钉选为永久记忆，AI 不会忘记',
  },
  {
    icon: '👥',
    title: '多角色群聊',
    desc: '在侧边栏底部创建群聊，选 2-8 个角色同时对话！用导演模式引导剧情，看角色之间的化学反应。',
    tip: '试试 🎬 AI 盲盒事件，让世界自己来一点意外',
  },
];

function next() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  } else {
    finish();
  }
}

function finish() {
  localStorage.setItem('myai_onboarding_done', '1');
  emit('close');
}
</script>

<template>
  <Transition name="fade">
    <div class="onboarding-overlay" @click.self="finish">
      <div class="onboarding-card">
        <!-- Step dots -->
        <div class="step-dots">
          <span v-for="(_, i) in steps" :key="i"
                class="step-dot" :class="{ active: i === currentStep, done: i < currentStep }"></span>
        </div>

        <!-- Content -->
        <div class="step-content" :key="currentStep">
          <div class="step-icon">{{ steps[currentStep].icon }}</div>
          <h2 class="step-title">{{ steps[currentStep].title }}</h2>
          <p class="step-desc">{{ steps[currentStep].desc }}</p>
          <p class="step-tip">💡 {{ steps[currentStep].tip }}</p>
        </div>

        <!-- Actions -->
        <div class="step-actions">
          <button class="skip-btn" @click="finish">跳过</button>
          <button class="next-btn" @click="next">
            {{ currentStep < steps.length - 1 ? '下一步' : '开始探索 ✨' }}
          </button>
        </div>

        <!-- Step count -->
        <div class="step-count">{{ currentStep + 1 }} / {{ steps.length }}</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: fadeIn 0.3s ease;
}

.onboarding-card {
  max-width: 420px;
  width: 100%;
  background: linear-gradient(145deg, rgba(26, 26, 50, 0.98), rgba(22, 33, 62, 0.98));
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 24px;
  padding: 2rem;
  text-align: center;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1);
  animation: cardSlideUp 0.5s ease;
}

@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.step-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 1.5rem;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.step-dot.active {
  width: 24px;
  border-radius: 4px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
}

.step-dot.done {
  background: rgba(99, 102, 241, 0.5);
}

.step-content {
  animation: stepFadeIn 0.3s ease;
}

@keyframes stepFadeIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

.step-icon {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.3));
}

.step-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #e0d4ff;
  margin-bottom: 0.75rem;
}

.step-desc {
  font-size: 0.9rem;
  color: #94a3b8;
  line-height: 1.7;
  margin-bottom: 0.75rem;
}

.step-tip {
  font-size: 0.78rem;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1.5rem;
}

.step-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.skip-btn {
  padding: 0.6rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #94a3b8;
  background: transparent;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.skip-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #c4b5fd;
}

.next-btn {
  padding: 0.6rem 2rem;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;
}

.next-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.step-count {
  margin-top: 1rem;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.25);
}

/* Fade transition */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .onboarding-card { padding: 1.5rem; }
  .step-icon { font-size: 2.5rem; }
  .step-title { font-size: 1.1rem; }
}
</style>
