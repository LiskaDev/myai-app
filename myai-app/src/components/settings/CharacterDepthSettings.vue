<script setup>
import { computed } from 'vue';

const props = defineProps({
  currentRole: Object
});

const DEPTH_FIELDS = ['speakingStyle', 'secret', 'relationship', 'appearance', 'worldLogic'];
const filledCount = computed(() =>
  DEPTH_FIELDS.filter(f => (props.currentRole?.[f] || '').trim()).length
);
</script>

<template>
  <!-- v5.5: 角色深度设置 (3D Character Enhancement) -->
  <section class="glass bg-glass-message rounded-xl overflow-hidden">
    <details class="depth-panel">
      <summary class="p-4 cursor-pointer select-none flex items-center justify-between hover:bg-white/5 transition">
        <div class="flex items-center gap-2">
          <span class="text-base">✨</span>
          <span class="font-semibold text-rose-400 text-sm text-shadow">角色深度设置</span>
          <span class="text-xs text-gray-500">让角色更有血有肉</span>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="filledCount > 0" class="text-xs text-rose-400/70 bg-rose-500/10 px-2 py-0.5 rounded-full">已填 {{ filledCount }}/5</span>
          <svg class="w-4 h-4 text-gray-400 transition-transform depth-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </summary>

      <div class="p-4 pt-0 space-y-4 border-t border-white/5">
        <div class="grid gap-4">
      <!-- 说话风格 Speaking Style -->
      <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-rose-500/30 transition">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🗣️</span>
          <label class="text-sm text-gray-200 font-medium">说话风格</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
            <div class="tooltip-content">
              决定 TA 的口癖、语气。例如：'喜欢用反问句' 或 '每句话都很简短'
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.speakingStyle" rows="2" 
                  placeholder="例如：语气略带嘲讽，喜欢用「哦？」开头，句尾常加「...」表示意犹未尽..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-rose-500/50 transition resize-none text-shadow-light text-sm"></textarea>
      </div>

      <!-- 内心秘密 Secret -->
      <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/30 transition">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🔐</span>
          <label class="text-sm text-gray-200 font-medium">内心秘密与动机</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
            <div class="tooltip-content">
              TA 深藏心底的秘密或动机。这会让剧情更有张力，AI 不会主动透露
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.secret" rows="2" 
                  placeholder="例如：其实暗恋着你已经很久了，但因为害怕被拒绝一直不敢表白..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-purple-500/50 transition resize-none text-shadow-light text-sm"></textarea>
      </div>

      <!-- 当前关系 Relationship -->
      <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-pink-500/30 transition">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">💕</span>
          <label class="text-sm text-gray-200 font-medium">当前关系</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
            <div class="tooltip-content">
              开局时 TA 怎么看待你？是陌生人、恋人、青梅竹马还是仇人？
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.relationship" rows="2" 
                  placeholder="例如：你们是高中同班同学，TA 是班长，你总是迟到被 TA 记过名..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-pink-500/50 transition resize-none text-shadow-light text-sm"></textarea>
      </div>

      <!-- 外貌特征 Appearance -->
      <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-amber-500/30 transition">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">👤</span>
          <label class="text-sm text-gray-200 font-medium">外貌特征</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
            <div class="tooltip-content">
              TA 长什么样？这会影响 TA 做动作时的描写细节
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.appearance" rows="2" 
                  placeholder="例如：银白长发及腰，紫色竖瞳，穿着黑色长裙，左手无名指上戴着神秘戒指..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-amber-500/50 transition resize-none text-shadow-light text-sm"></textarea>
      </div>

      <!-- 世界观 World Logic -->
      <div class="depth-card p-3 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/30 transition">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🌍</span>
          <label class="text-sm text-gray-200 font-medium">世界观</label>
          <div class="tooltip-trigger relative group ml-auto">
            <span class="cursor-help text-gray-500 hover:text-gray-300">❓</span>
            <div class="tooltip-content">
              故事发生在哪里？古代、现代、末世还是魔法世界？
            </div>
          </div>
        </div>
        <textarea v-model="currentRole.worldLogic" rows="2" 
                  placeholder="例如：2077年的霓虹都市，巨型企业统治一切，人们通过神经接口连接网络..."
                  class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-cyan-500/50 transition resize-none text-shadow-light text-sm"></textarea>
      </div>
        </div>
      </div>
    </details>
  </section>
</template>

<style scoped>
/* Details panel arrow rotation */
.depth-panel summary { list-style: none; }
.depth-panel summary::-webkit-details-marker { display: none; }
.depth-panel[open] .depth-arrow { transform: rotate(180deg); }

/* Depth Card Hover Effect */
.depth-card {
  transition: all 0.25s ease;
}

.depth-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* v5.5: Tooltip Styles */
.tooltip-trigger {
  position: relative;
}

.tooltip-content {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  min-width: 220px;
  max-width: 280px;
  background: rgba(15, 15, 25, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 0.75rem;
  color: rgba(220, 220, 240, 0.9);
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: none;
}

.tooltip-trigger:hover .tooltip-content {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
</style>