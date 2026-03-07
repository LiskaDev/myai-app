<script setup>
/**
 * ModelConfigPanel.vue — 可复用的模型配置面板
 * 用于 BookImport（提取模型）和 BookSettings（游玩模型）
 * Props:  modelValue: { baseUrl, apiKey, model }
 * Emits:  update:modelValue, close
 */
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
});
const emit = defineEmits(['update:modelValue', 'close']);

const local   = ref({ ...props.modelValue });
const showKey = ref(false);

watch(() => props.modelValue, v => { local.value = { ...v }; }, { deep: true });

function save() {
  emit('update:modelValue', {
    baseUrl: local.value.baseUrl?.trim() || 'https://api.deepseek.com',
    apiKey:  local.value.apiKey?.trim()  || '',
    model:   local.value.model?.trim()   || 'deepseek-chat',
  });
  emit('close');
}
</script>

<template>
  <div class="mcp-panel">
    <div class="mcp-title">🔧 配置模型</div>

    <div class="mcp-field">
      <label class="mcp-label">Base URL</label>
      <input
        class="mcp-input"
        v-model="local.baseUrl"
        placeholder="https://api.deepseek.com"
        autocomplete="off"
      />
    </div>

    <div class="mcp-field">
      <label class="mcp-label">API Key</label>
      <div class="mcp-key-row">
        <input
          class="mcp-input mcp-key-input"
          :type="showKey ? 'text' : 'password'"
          v-model="local.apiKey"
          placeholder="sk-..."
          autocomplete="new-password"
        />
        <button class="mcp-eye-btn" @click="showKey = !showKey" :title="showKey ? '隐藏' : '显示'">
          {{ showKey ? '🙈' : '👁️' }}
        </button>
      </div>
    </div>

    <div class="mcp-field">
      <label class="mcp-label">模型名称</label>
      <input
        class="mcp-input"
        v-model="local.model"
        placeholder="deepseek-chat"
        autocomplete="off"
      />
    </div>

    <div class="mcp-btns">
      <button class="mcp-cancel" @click="$emit('close')">取消</button>
      <button class="mcp-save" @click="save">确定</button>
    </div>
  </div>
</template>

<style scoped>
.mcp-panel {
  background: rgba(15, 10, 25, 0.97);
  border: 1px solid rgba(139, 92, 246, 0.35);
  border-radius: 14px;
  padding: 18px 20px 16px;
  margin: 10px 0;
}
.mcp-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(192, 132, 252, 0.8);
  margin-bottom: 14px;
  letter-spacing: 0.5px;
}
.mcp-field { margin-bottom: 12px; }
.mcp-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 5px;
  letter-spacing: 0.3px;
}
.mcp-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.mcp-input:focus { border-color: rgba(139, 92, 246, 0.5); }
.mcp-key-row { display: flex; gap: 6px; align-items: center; }
.mcp-key-input { flex: 1; }
.mcp-eye-btn {
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  transition: border-color 0.2s;
  line-height: 1;
}
.mcp-eye-btn:hover { border-color: rgba(255, 255, 255, 0.2); }
.mcp-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 14px;
}
.mcp-cancel {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.mcp-cancel:hover { border-color: rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.6); }
.mcp-save {
  padding: 6px 20px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.85), rgba(59, 130, 246, 0.75));
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.mcp-save:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3); }
</style>
