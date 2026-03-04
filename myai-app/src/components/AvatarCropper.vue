<script setup>
/**
 * AvatarCropper.vue
 * 纯 Canvas 实现的头像裁剪器
 * - 拖拽平移图片
 * - 鼠标滚轮 / 双指捏合缩放
 * - 输出 256×256 正方形 JPEG（覆盖在圆形区域内）
 */
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  imageSrc: { type: String, required: true }, // base64 或 URL
});

const emit = defineEmits(['confirm', 'cancel']);

const canvasRef = ref(null);
const CANVAS_SIZE = 300;   // 预览 canvas 像素
const OUTPUT_SIZE = 256;   // 最终输出像素

// 图片状态
let img = null;
let scale = 1;
let offsetX = 0;  // 图片左上角相对 canvas 的偏移
let offsetY = 0;

// 拖拽状态
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// 触摸双指缩放状态
let lastPinchDist = 0;

// ------- 初始化 -------
function initImage() {
  img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // 初始缩放：让图片短边 = CANVAS_SIZE（填满裁剪框）
    const fit = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
    scale = fit;
    // 居中
    offsetX = (CANVAS_SIZE - img.width * scale) / 2;
    offsetY = (CANVAS_SIZE - img.height * scale) / 2;
    draw();
  };
  img.onerror = () => emit('cancel');
  img.src = props.imageSrc;
}

// ------- 渲染 -------
function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 把图片画在偏移+缩放后的位置
  ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale);

  // 遮罩层（正方形区域外半透明黑色）
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  // 上
  ctx.fillRect(0, 0, CANVAS_SIZE, 0);
  // 画圆形镂空
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 2, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();

  // 圆形边框
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ------- 边界约束 -------
function clampOffset() {
  const iw = img.width * scale;
  const ih = img.height * scale;
  // 图片不能露出裁剪框
  offsetX = Math.min(0, Math.max(CANVAS_SIZE - iw, offsetX));
  offsetY = Math.min(0, Math.max(CANVAS_SIZE - ih, offsetY));
}

// ------- 缩放 -------
function applyScale(newScale, pivotX, pivotY) {
  const minScale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
  const maxScale = minScale * 6;
  newScale = Math.max(minScale, Math.min(maxScale, newScale));

  // 让缩放以 pivot 点为中心
  offsetX = pivotX - (pivotX - offsetX) * (newScale / scale);
  offsetY = pivotY - (pivotY - offsetY) * (newScale / scale);
  scale = newScale;
  clampOffset();
  draw();
}

// ------- 鼠标事件 -------
function onMouseDown(e) {
  isDragging = true;
  dragStartX = e.clientX - offsetX;
  dragStartY = e.clientY - offsetY;
}
function onMouseMove(e) {
  if (!isDragging) return;
  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;
  clampOffset();
  draw();
}
function onMouseUp() { isDragging = false; }

function onWheel(e) {
  e.preventDefault();
  const rect = canvasRef.value.getBoundingClientRect();
  const pivotX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
  const pivotY = (e.clientY - rect.top)  * (CANVAS_SIZE / rect.height);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  applyScale(scale * factor, pivotX, pivotY);
}

// ------- 触摸事件 -------
function getCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}
function getDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e) {
  if (e.touches.length === 1) {
    isDragging = true;
    dragStartX = e.touches[0].clientX - offsetX;
    dragStartY = e.touches[0].clientY - offsetY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    lastPinchDist = getDistance(e.touches);
  }
}
function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    offsetX = e.touches[0].clientX - dragStartX;
    offsetY = e.touches[0].clientY - dragStartY;
    clampOffset();
    draw();
  } else if (e.touches.length === 2) {
    const dist = getDistance(e.touches);
    const factor = dist / lastPinchDist;
    lastPinchDist = dist;
    const rect = canvasRef.value.getBoundingClientRect();
    const c = getCenter(e.touches);
    const pivotX = (c.x - rect.left) * (CANVAS_SIZE / rect.width);
    const pivotY = (c.y - rect.top)  * (CANVAS_SIZE / rect.height);
    applyScale(scale * factor, pivotX, pivotY);
  }
}
function onTouchEnd() { isDragging = false; }

// ------- 确认输出 -------
function confirm() {
  const out = document.createElement('canvas');
  out.width = OUTPUT_SIZE;
  out.height = OUTPUT_SIZE;
  const ctx = out.getContext('2d');

  // 圆形裁剪
  ctx.beginPath();
  ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();

  // 按当前 canvas 坐标映射到输出尺寸
  const ratio = OUTPUT_SIZE / CANVAS_SIZE;
  ctx.drawImage(
    img,
    offsetX * ratio,
    offsetY * ratio,
    img.width * scale * ratio,
    img.height * scale * ratio
  );

  emit('confirm', out.toDataURL('image/jpeg', 0.9));
}

// ------- 生命周期 -------
onMounted(() => {
  initImage();
  // 全局 mousemove/up，防止拖出 canvas
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});
onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
watch(() => props.imageSrc, initImage);
</script>

<template>
  <div class="cropper-overlay" @click.self="$emit('cancel')">
    <div class="cropper-modal">
      <h3 class="cropper-title">✂️ 调整头像</h3>
      <p class="cropper-hint">拖拽移动 · 滚轮/双指缩放</p>

      <div class="canvas-wrapper">
        <canvas
          ref="canvasRef"
          :width="300"
          :height="300"
          class="cropper-canvas"
          @mousedown="onMouseDown"
          @wheel.prevent="onWheel"
          @touchstart.prevent="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
        />
      </div>

      <div class="cropper-actions">
        <button class="btn-cancel" @click="$emit('cancel')">取消</button>
        <button class="btn-confirm" @click="confirm">✓ 使用此头像</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cropper-modal {
  background: rgba(18, 18, 30, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  width: 340px;
  max-width: 100%;
}

.cropper-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e5e7eb;
}

.cropper-hint {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: -8px;
}

.canvas-wrapper {
  border-radius: 50%;
  overflow: hidden;
  width: 300px;
  height: 300px;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4);
}

.cropper-canvas {
  display: block;
  cursor: grab;
  width: 300px;
  height: 300px;
  touch-action: none;
}

.cropper-canvas:active {
  cursor: grabbing;
}

.cropper-actions {
  display: flex;
  gap: 12px;
  width: 100%;
}

.btn-cancel {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #9ca3af;
  font-size: 0.875rem;
  transition: background 0.15s;
}
.btn-cancel:hover { background: rgba(255, 255, 255, 0.12); }

.btn-confirm {
  flex: 2;
  padding: 10px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.85);
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background 0.15s;
}
.btn-confirm:hover { background: rgba(99, 102, 241, 1); }
</style>
