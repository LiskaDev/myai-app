<script setup>
import { ref } from 'vue';

const props = defineProps({
  importJson: String
});

const emit = defineEmits(['import', 'close', 'update:importJson']);

const preview = ref(null);
const error = ref('');
const fileName = ref('');

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  fileName.value = file.name;
  error.value = '';
  preview.value = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);

      // 校验基本格式
      if (!data.globalSettings || !Array.isArray(data.roleList)) {
        throw new Error('缺少必要字段 (globalSettings / roleList)');
      }

      // 生成预览
      const totalMessages = data.roleList.reduce((sum, r) => sum + (r.messages?.length || 0), 0);
      preview.value = {
        version: data.version || '未知',
        exportTime: data.exportTime ? new Date(data.exportTime).toLocaleString('zh-CN') : '未知',
        roles: data.roleList.length,
        messages: totalMessages,
        groups: data.groups?.length || 0,
        diaries: data.diaries?.length || 0,
        persona: data.persona?.traits?.length || 0,
      };

      // 传递 JSON 文本给父组件
      emit('update:importJson', text);
    } catch (err) {
      error.value = err.message;
      preview.value = null;
    }
  };
  reader.readAsText(file);
}

function handlePaste() {
  error.value = '';
  preview.value = null;

  try {
    const text = props.importJson;
    if (!text?.trim()) return;

    const data = JSON.parse(text);
    if (!data.globalSettings || !Array.isArray(data.roleList)) {
      throw new Error('缺少必要字段 (globalSettings / roleList)');
    }

    const totalMessages = data.roleList.reduce((sum, r) => sum + (r.messages?.length || 0), 0);
    preview.value = {
      version: data.version || '未知',
      exportTime: data.exportTime ? new Date(data.exportTime).toLocaleString('zh-CN') : '未知',
      roles: data.roleList.length,
      messages: totalMessages,
      groups: data.groups?.length || 0,
      diaries: data.diaries?.length || 0,
      persona: data.persona?.traits?.length || 0,
    };
    fileName.value = '粘贴数据';
  } catch (err) {
    error.value = '解析失败: ' + err.message;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>
    <div class="relative glass bg-glass-dark rounded-2xl max-w-lg w-full p-6 border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
      <header class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-white text-shadow">📤 恢复数据</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white transition">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto space-y-4">
        <!-- 文件选择器 -->
        <div>
          <label class="block w-full cursor-pointer">
            <div class="glass bg-glass-message rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition p-6 text-center">
              <div class="text-3xl mb-2">📁</div>
              <div class="text-sm text-gray-300" v-if="!fileName">点击选择备份文件 (.json)</div>
              <div class="text-sm text-green-400" v-else>✅ {{ fileName }}</div>
              <div class="text-xs text-gray-500 mt-1">或将文件拖到此处</div>
            </div>
            <input type="file" accept=".json" @change="handleFileSelect" class="hidden" />
          </label>
        </div>

        <!-- 分隔线 -->
        <div class="flex items-center gap-3">
          <hr class="flex-1 border-white/10">
          <span class="text-xs text-gray-500">或者粘贴 JSON</span>
          <hr class="flex-1 border-white/10">
        </div>

        <!-- 粘贴区域（折叠式） -->
        <div>
          <textarea :value="importJson"
                    @input="$emit('update:importJson', $event.target.value)"
                    @blur="handlePaste"
                    class="w-full h-24 glass-light bg-glass-light text-gray-100 rounded-lg p-3 outline-none border border-white/10 focus:border-primary transition font-mono text-xs resize-none"
                    placeholder='粘贴备份 JSON 内容后点击外部解析...'></textarea>
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="p-3 rounded-xl bg-red-900/30 border border-red-500/30 text-sm text-red-400">
          ❌ {{ error }}
        </div>

        <!-- 数据预览 -->
        <div v-if="preview" class="glass bg-glass-message rounded-xl p-4 space-y-3">
          <h4 class="font-semibold text-gray-200 text-sm">📋 备份预览</h4>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">版本</span>
              <span class="text-gray-200">{{ preview.version }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">备份时间</span>
              <span class="text-gray-200">{{ preview.exportTime }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">🎭 角色</span>
              <span class="text-white font-medium">{{ preview.roles }} 个</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">💬 消息</span>
              <span class="text-white font-medium">{{ preview.messages }} 条</span>
            </div>
            <div class="flex justify-between" v-if="preview.groups">
              <span class="text-gray-400">👥 群聊</span>
              <span class="text-white font-medium">{{ preview.groups }} 个</span>
            </div>
            <div class="flex justify-between" v-if="preview.diaries">
              <span class="text-gray-400">📔 日记</span>
              <span class="text-white font-medium">{{ preview.diaries }} 篇</span>
            </div>
            <div class="flex justify-between" v-if="preview.persona">
              <span class="text-gray-400">👤 画像</span>
              <span class="text-white font-medium">{{ preview.persona }} 条</span>
            </div>
          </div>
          <div class="text-xs text-amber-400/80 mt-2">
            ⚠️ 恢复后当前所有数据将被覆盖
          </div>
        </div>
      </div>

      <div class="flex justify-end space-x-3 mt-4 pt-4 border-t border-white/10">
        <button @click="$emit('close')" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
        <button @click="$emit('import')"
                class="px-5 py-2 rounded-lg bg-primary hover:bg-indigo-600 text-white transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!preview">
          确认恢复
        </button>
      </div>
    </div>
  </div>
</template>
