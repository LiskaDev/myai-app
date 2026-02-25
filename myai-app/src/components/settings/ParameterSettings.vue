<script setup>
defineProps({
  currentRole: Object
});
</script>

<template>
  <!-- 参数调整 -->
  <section class="glass bg-glass-message rounded-xl p-4 space-y-4">
    <h3 class="font-semibold text-green-400 flex items-center text-shadow">
      <span class="mr-2">🎛️</span> 参数调整
    </h3>

    <div class="space-y-4">
      <div>
        <div class="flex justify-between text-sm mb-1">
          <label class="text-gray-300">Temperature (创造力)</label>
          <span class="text-primary font-mono">{{ (currentRole.temperature || 1.0).toFixed(1) }}</span>
        </div>
        <input v-model.number="currentRole.temperature" type="range" min="0" max="2" step="0.1"
               class="w-full h-2 bg-glass-light rounded-lg appearance-none cursor-pointer accent-primary">
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>精确 0.0</span>
          <span>平衡 1.0</span>
          <span>创意 2.0</span>
        </div>
      </div>

      <div>
        <label class="block text-sm text-gray-300 mb-1">Max Tokens (最大长度)</label>
        <input v-model.number="currentRole.maxTokens" type="number" min="100" max="8192" placeholder="2000"
               class="w-full glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-primary transition text-shadow-light">
      </div>
    </div>
  </section>
</template>
