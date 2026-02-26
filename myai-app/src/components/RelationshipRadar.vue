<script setup>
import { ref, computed, watch } from 'vue';
import { Radar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { getAffinity, affinityToText, AFFINITY_MIN, AFFINITY_MAX } from '../composables/useRelationship';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

const props = defineProps({
  participants: { type: Array, default: () => [] },
  relationshipMatrix: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update-affinity', 'close']);

// 当前选中的视角角色（index）
const selectedPerspective = ref(0);

// 所有视角选项（角色 + 导演）
const perspectives = computed(() => {
  const list = props.participants.map(p => ({
    id: p.id,
    name: p.name,
    type: 'role',
  }));
  list.push({ id: 'director', name: '导演', type: 'director' });
  return list;
});

const currentPerspective = computed(() => {
  return perspectives.value[selectedPerspective.value] || perspectives.value[0];
});

// 雷达图 targets（当前视角对 其他所有人 的好感度）
const targets = computed(() => {
  if (!currentPerspective.value) return [];
  return perspectives.value
    .filter(p => p.id !== currentPerspective.value.id)
    .map(p => ({
      ...p,
      value: getAffinity(props.relationshipMatrix, currentPerspective.value.id, p.id),
    }));
});

// Chart.js 数据
const chartData = computed(() => {
  const labels = targets.value.map(t => t.name);
  // 将 -100~100 映射到 0~200 用于雷达图（Chart.js 不支持负值 radial）
  const values = targets.value.map(t => t.value + 100);

  return {
    labels,
    datasets: [{
      label: `${currentPerspective.value?.name || ''} 的好感度`,
      data: values,
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      borderColor: 'rgba(99, 102, 241, 0.8)',
      borderWidth: 2,
      pointBackgroundColor: targets.value.map(t => affinityColor(t.value)),
      pointBorderColor: 'rgba(255, 255, 255, 0.6)',
      pointRadius: 5,
      pointHoverRadius: 7,
    }],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    r: {
      min: 0,
      max: 200,
      ticks: {
        stepSize: 50,
        display: false,
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.08)',
      },
      angleLines: {
        color: 'rgba(255, 255, 255, 0.08)',
      },
      pointLabels: {
        color: 'rgba(255, 255, 255, 0.75)',
        font: { size: 12 },
        callback: function(label, index) {
          const val = targets.value[index]?.value ?? 0;
          return `${label} (${val > 0 ? '+' : ''}${val})`;
        },
      },
    },
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: function(ctx) {
          const realValue = ctx.raw - 100;
          return `好感度: ${realValue > 0 ? '+' : ''}${realValue} (${affinityToText(realValue)})`;
        },
      },
    },
    legend: {
      display: false,
    },
  },
}));

// 好感度 → 颜色（HSL：红→黄→绿）
function affinityColor(value) {
  // -100 → hue 0 (red), 0 → hue 60 (yellow), 100 → hue 120 (green)
  const hue = ((value + 100) / 200) * 120;
  return `hsl(${hue}, 70%, 55%)`;
}

// Slider 用的双向绑定
function onSliderChange(targetId, event) {
  const value = parseInt(event.target.value, 10);
  emit('update-affinity', currentPerspective.value.id, targetId, value);
}

// 切换视角
function switchPerspective(index) {
  selectedPerspective.value = index;
}

// 展开/折叠详情
const showDetails = ref(false);
</script>

<template>
  <div class="relationship-panel">
    <!-- 面板标题 -->
    <div class="panel-header">
      <h3 class="panel-title">📊 关系雷达图</h3>
      <button @click="$emit('close')" class="close-btn">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- 视角选择 Tab -->
    <div class="perspective-tabs">
      <button
        v-for="(p, idx) in perspectives"
        :key="p.id"
        @click="switchPerspective(idx)"
        class="perspective-tab"
        :class="{ 'active': idx === selectedPerspective }"
      >
        {{ p.type === 'director' ? '🎬' : '🎭' }} {{ p.name }}
      </button>
    </div>

    <!-- 雷达图 -->
    <div class="chart-container" v-if="targets.length > 0">
      <Radar :data="chartData" :options="chartOptions" />
    </div>
    <div v-else class="empty-state">
      至少需要 2 个角色才能显示关系图
    </div>

    <!-- 详情 / 手动微调 切换 -->
    <button 
      @click="showDetails = !showDetails" 
      class="toggle-details-btn"
    >
      {{ showDetails ? '▾ 收起详情' : '▸ 展开详情 & 手动调整' }}
    </button>

    <!-- 手动微调滑块 -->
    <div v-if="showDetails" class="details-section">
      <div class="detail-info">
        <span class="perspective-label">
          {{ currentPerspective?.type === 'director' ? '🎬' : '🎭' }}
          {{ currentPerspective?.name }} 的视角
        </span>
      </div>
      <div v-for="target in targets" :key="target.id" class="slider-row">
        <div class="slider-label">
          <span class="target-name">→ {{ target.name }}</span>
          <span class="affinity-badge" :style="{ backgroundColor: affinityColor(target.value) }">
            {{ target.value > 0 ? '+' : '' }}{{ target.value }}
          </span>
          <span class="affinity-text">{{ affinityToText(target.value) }}</span>
        </div>
        <input
          type="range"
          :min="AFFINITY_MIN"
          :max="AFFINITY_MAX"
          :value="target.value"
          @input="onSliderChange(target.id, $event)"
          class="affinity-slider"
          :style="{ '--hue': ((target.value + 100) / 200) * 120 }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.relationship-panel {
  background: rgba(15, 15, 25, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;
  max-height: 80vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #818cf8, #f472b6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.close-btn {
  padding: 4px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s;
}
.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* 视角 Tab */
.perspective-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 12px;
  scrollbar-width: thin;
}

.perspective-tab {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
  white-space: nowrap;
}
.perspective-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}
.perspective-tab.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
  color: #818cf8;
}

/* 雷达图 */
.chart-container {
  height: 260px;
  position: relative;
  margin-bottom: 12px;
}

.empty-state {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 40px 0;
  font-size: 0.85rem;
}

/* 详情切换 */
.toggle-details-btn {
  width: 100%;
  padding: 8px;
  text-align: center;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  transition: all 0.2s;
}
.toggle-details-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

/* 滑块详情区 */
.details-section {
  margin-top: 12px;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.detail-info {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.perspective-label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
}

.slider-row {
  margin-bottom: 12px;
}

.slider-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.target-name {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
  min-width: 80px;
}

.affinity-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 36px;
  text-align: center;
}

.affinity-text {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
}

/* 好感度滑块 */
.affinity-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.affinity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: hsl(calc(var(--hue, 60)), 70%, 55%);
  border: 2px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: transform 0.15s;
}
.affinity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.3);
}

.affinity-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: hsl(calc(var(--hue, 60)), 70%, 55%);
  border: 2px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
}
</style>
