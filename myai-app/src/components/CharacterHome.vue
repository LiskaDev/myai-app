<template>
  <div class="character-home">
    <!-- 顶部标题区 -->
    <div class="home-header">
      <div class="home-logo">✨</div>
      <h1 class="home-title">MyAI RolePlay</h1>
      <p class="home-subtitle">选择一个角色，开始你的故事</p>
    </div>

    <!-- 角色卡片网格 -->
    <div class="home-grid">
      <div
        v-for="role in roleList"
        :key="role.id"
        class="role-card"
        @click="$emit('select-role', role.id)"
      >
        <!-- 卡片光效 -->
        <div class="role-card-glow"></div>

        <!-- 头像 -->
        <div class="role-card-avatar">
          <img v-if="role.avatar" :src="role.avatar" :alt="role.name" @error="$event.target.style.display='none'" />
          <div v-else class="role-card-avatar-placeholder">🎭</div>
        </div>

        <!-- 角色信息 -->
        <div class="role-card-info">
          <h3 class="role-card-name">{{ role.name }}</h3>
          <p class="role-card-desc">{{ role.styleGuide || '点击开始对话' }}</p>
        </div>

        <!-- 世界观标签 -->
        <div v-if="role.worldLogic" class="role-card-tag">
          {{ getWorldTag(role.worldLogic) }}
        </div>

        <!-- 已有对话指示器 -->
        <div v-if="hasHistory(role)" class="role-card-badge" title="已有对话">
          💬
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="home-footer">
      <button class="home-settings-btn" @click="$emit('open-settings')" title="配置 API Key">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
        <span>设置</span>
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  roleList: { type: Array, required: true },
});

defineEmits(['select-role', 'open-settings']);

function getWorldTag(worldLogic) {
  if (worldLogic.includes('怪物猎人') || worldLogic.includes('猎人世界')) return '🐉 怪猎';
  if (worldLogic.includes('生化') || worldLogic.includes('安布雷拉')) return '🧬 生化危机';
  if (worldLogic.includes('异世界') || worldLogic.includes('魔法')) return '🗡️ 奇幻';
  if (worldLogic.includes('都市悬疑') || worldLogic.includes('侦探')) return '🔍 悬疑';
  if (worldLogic.includes('都市奇幻') || worldLogic.includes('超自然')) return '🔮 都市奇幻';
  if (worldLogic.includes('高中') || worldLogic.includes('日常')) return '🌸 日常';
  if (worldLogic.includes('科幻')) return '🚀 科幻';
  if (worldLogic.includes('历史') || worldLogic.includes('古代')) return '📜 历史';
  return '🌍 自定义';
}

function hasHistory(role) {
  // 检查主分支或 chatHistory 是否有消息
  const branch = (role.branches || []).find(b => b.id === role.activeBranchId);
  const msgs = branch?.chatHistory || role.chatHistory || [];
  return msgs.length > 0;
}
</script>

<style scoped>
.character-home {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding: 40px 24px 60px;
  background: linear-gradient(145deg, #0f0a1a 0%, #1a1030 35%, #12081f 70%, #0a0612 100%);
  animation: homeIn 0.5s ease-out;
}

@keyframes homeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

/* ===== Header ===== */
.home-header {
  text-align: center;
  margin-bottom: 40px;
  animation: fadeSlideUp 0.6s ease-out;
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.home-logo {
  font-size: 48px;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.5));
}

.home-title {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 8px;
  letter-spacing: 1px;
}

.home-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  letter-spacing: 2px;
}

/* ===== Card Grid ===== */
.home-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  max-width: 720px;
  width: 100%;
}

/* ===== Role Card ===== */
.role-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  animation: cardIn 0.5s ease-out both;
}

.role-card:nth-child(1) { animation-delay: 0.1s; }
.role-card:nth-child(2) { animation-delay: 0.15s; }
.role-card:nth-child(3) { animation-delay: 0.2s; }
.role-card:nth-child(4) { animation-delay: 0.25s; }
.role-card:nth-child(5) { animation-delay: 0.3s; }
.role-card:nth-child(6) { animation-delay: 0.35s; }
.role-card:nth-child(7) { animation-delay: 0.4s; }
.role-card:nth-child(8) { animation-delay: 0.45s; }

@keyframes cardIn {
  from { opacity: 0; transform: translateY(24px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.role-card:hover {
  transform: translateY(-6px);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow:
    0 12px 40px rgba(139, 92, 246, 0.15),
    0 0 0 1px rgba(139, 92, 246, 0.2);
}

.role-card:active {
  transform: translateY(-2px) scale(0.98);
}

/* Glow effect */
.role-card-glow {
  position: absolute;
  top: -60%;
  left: -20%;
  width: 140%;
  height: 100%;
  background: radial-gradient(ellipse, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.role-card:hover .role-card-glow {
  opacity: 1;
}

/* ===== Avatar ===== */
.role-card-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 14px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  transition: border-color 0.3s, box-shadow 0.3s;
  flex-shrink: 0;
}

.role-card:hover .role-card-avatar {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.25);
}

.role-card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.role-card-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
  font-size: 32px;
}

/* ===== Info ===== */
.role-card-info {
  text-align: center;
  flex: 1;
  min-height: 0;
}

.role-card-name {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  margin: 0 0 6px;
  letter-spacing: 0.5px;
}

.role-card-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== Tag ===== */
.role-card-tag {
  margin-top: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.2);
  font-size: 10px;
  color: rgba(192, 132, 252, 0.85);
  letter-spacing: 0.5px;
}

/* ===== Badge ===== */
.role-card-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 14px;
  opacity: 0.6;
}

/* ===== Footer ===== */
.home-footer {
  margin-top: 40px;
  animation: fadeSlideUp 0.6s ease-out 0.5s both;
}

.home-settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s;
}

.home-settings-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  border-color: rgba(255, 255, 255, 0.2);
}

.home-settings-btn svg {
  width: 18px;
  height: 18px;
}

/* ===== 手机端适配 ===== */
@media (max-width: 640px) {
  .character-home {
    padding: 30px 16px 40px;
  }

  .home-header {
    margin-bottom: 28px;
  }

  .home-logo {
    font-size: 36px;
  }

  .home-title {
    font-size: 22px;
  }

  .home-subtitle {
    font-size: 12px;
  }

  .home-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .role-card {
    padding: 20px 12px 16px;
    border-radius: 16px;
  }

  .role-card-avatar {
    width: 60px;
    height: 60px;
    margin-bottom: 10px;
  }

  .role-card-name {
    font-size: 14px;
  }

  .role-card-desc {
    font-size: 10px;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .role-card-tag {
    font-size: 9px;
    padding: 2px 8px;
  }
}

/* 极窄设备 */
@media (max-width: 360px) {
  .home-grid {
    gap: 8px;
  }

  .role-card {
    padding: 16px 8px 12px;
  }

  .role-card-avatar {
    width: 50px;
    height: 50px;
  }
}
</style>
