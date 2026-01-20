<!--
  📚 世界书编辑器组件
  
  这是什么？
  ---------
  这是一个弹窗，让用户管理自己的"世界书"。
  用户可以在这里：
  - 添加/删除条目
  - 设置触发词
  - 写简单描述或让 AI 完善
  - 手动编辑内容
  
  怎么用？
  -------
  在 App.vue 中引入：
  <LorebookEditor v-model:show="showLorebook" :app-state="appState" />
-->

<script setup>
import { ref, computed, watch } from 'vue';
import { useWorld } from '../composables/useWorld';

// ========================================
// 组件属性
// ========================================

const props = defineProps({
    show: {
        type: Boolean,
        default: false,
    },
    appState: {
        type: Object,
        required: true,
    },
});

const emit = defineEmits(['update:show']);

// ========================================
// 初始化世界书
// ========================================

const {
    lorebook,
    expandingEntryId,
    totalEntries,
    enabledEntries,
    addEntry,
    removeEntry,
    updateEntry,
    addKeyword,
    removeKeyword,
    expandEntryWithAI,
    getInjectionContent,
    estimateTokens,
    exportLorebook,
    importLorebook,
} = useWorld(props.appState);

// ========================================
// 本地状态
// ========================================

// 当前选中的条目 ID（用于显示详情）
const selectedEntryId = ref(null);

// 新关键词输入框的值
const newKeywordInput = ref('');

// 错误消息
const errorMessage = ref('');

// 导入框
const showImportModal = ref(false);
const importText = ref('');

// ========================================
// 计算属性
// ========================================

// 当前选中的条目
const selectedEntry = computed(() => {
    if (!selectedEntryId.value) return null;
    return lorebook.entries.find(e => e.id === selectedEntryId.value);
});

// 是否正在扩展当前条目
const isExpandingSelected = computed(() => {
    return expandingEntryId.value === selectedEntryId.value;
});

// 预览注入内容（用一个测试文本）
const previewContent = computed(() => {
    if (lorebook.entries.length === 0) return '(暂无条目)';
    // 用所有条目的关键词模拟触发
    const allKeywords = lorebook.entries.flatMap(e => e.keywords).join(' ');
    return getInjectionContent(allKeywords, []) || '(当前没有匹配的条目)';
});

// 预览 Token 数
const previewTokens = computed(() => {
    return estimateTokens(previewContent.value);
});

// ========================================
// 方法
// ========================================

// 关闭弹窗
function closeModal() {
    emit('update:show', false);
}

// 创建新条目
function handleAddEntry() {
    const entry = addEntry();
    selectedEntryId.value = entry.id;
    // 自动聚焦到名称输入框
}

// 删除条目
function handleRemoveEntry(entryId) {
    if (selectedEntryId.value === entryId) {
        selectedEntryId.value = null;
    }
    removeEntry(entryId);
}

// 添加关键词
function handleAddKeyword() {
    if (!selectedEntry.value || !newKeywordInput.value.trim()) return;
    addKeyword(selectedEntry.value.id, newKeywordInput.value.trim());
    newKeywordInput.value = '';
}

// 移除关键词
function handleRemoveKeyword(keyword) {
    if (!selectedEntry.value) return;
    removeKeyword(selectedEntry.value.id, keyword);
}

// AI 扩展
async function handleExpand() {
    if (!selectedEntry.value) return;
    errorMessage.value = '';
    
    try {
        await expandEntryWithAI(selectedEntry.value.id, {
            worldGenre: '奇幻', // 可以根据当前角色的世界类型来设置
        });
    } catch (error) {
        errorMessage.value = error.message;
    }
}

// 导出
function handleExport() {
    const json = exportLorebook();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `世界书_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// 导入
function handleImport() {
    if (!importText.value.trim()) return;
    const success = importLorebook(importText.value);
    if (success) {
        showImportModal.value = false;
        importText.value = '';
    } else {
        errorMessage.value = '导入失败，请检查 JSON 格式';
    }
}
</script>

<template>
    <!-- 遮罩层 -->
    <div 
        v-if="show" 
        class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4"
        @click.self="closeModal"
    >
        <!-- 主弹窗 -->
        <div class="bg-gradient-to-br from-gray-900/95 to-gray-800/95 rounded-3xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col border border-gray-700/50">
            
            <!-- 标题栏 -->
            <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-700/50 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
                <div class="flex items-center gap-3 sm:gap-4">
                    <h2 class="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <span class="text-2xl">📚</span>
                        <span class="hidden sm:inline">世界书 / Lorebook</span>
                        <span class="sm:hidden">世界书</span>
                    </h2>
                    <!-- 启用开关 -->
                    <label class="flex items-center gap-2 text-xs sm:text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition">
                        <input type="checkbox" v-model="lorebook.enabled" class="rounded w-4 h-4 accent-indigo-500" />
                        <span class="hidden sm:inline">启用</span>
                    </label>
                </div>
                <div class="flex items-center gap-2 sm:gap-3">
                    <span class="text-xs sm:text-sm text-gray-500 bg-gray-800/50 px-2 py-1 rounded-full">
                        {{ enabledEntries }}/{{ totalEntries }}
                    </span>
                    <button @click="closeModal" class="text-gray-400 hover:text-white text-xl sm:text-2xl transition hover:rotate-90 duration-300">×</button>
                </div>
            </div>

            <!-- 说明提示 -->
            <div class="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border-b border-gray-700/30 text-xs sm:text-sm text-indigo-300/90">
                💡 <strong>省钱原理</strong>：只有当对话提到"触发词"时，对应的设定才会发给AI。没提到的不会发，这样就很省钱！
            </div>

            <!-- 主内容区域 -->
            <div class="flex-1 flex overflow-hidden flex-col lg:flex-row">
                
                <!-- 左侧：条目列表 -->
                <div class="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-gray-700/50 flex flex-col bg-gray-900/30">
                    <div class="p-3 border-b border-gray-700/30">
                        <button 
                            @click="handleAddEntry"
                            class="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-indigo-500/25 font-medium text-sm flex items-center justify-center gap-2"
                        >
                            <span class="text-lg">➕</span>
                            <span>添加条目</span>
                        </button>
                    </div>
                    
                    <!-- 条目列表 -->
                    <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
                        <div 
                            v-for="entry in lorebook.entries" 
                            :key="entry.id"
                            @click="selectedEntryId = entry.id"
                            :class="[
                                'px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 border',
                                selectedEntryId === entry.id 
                                    ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-500/40 shadow-lg shadow-indigo-500/10' 
                                    : 'hover:bg-gray-700/40 border-transparent'
                            ]"
                        >
                            <div class="flex items-center justify-between gap-2">
                                <span :class="[
                                    'text-sm font-medium truncate',
                                    entry.enabled ? 'text-white' : 'text-gray-500 line-through'
                                ]">
                                    {{ entry.name || '(未命名)' }}
                                </span>
                                <div class="flex items-center gap-1.5 flex-shrink-0">
                                    <span v-if="entry.isExpanded" class="text-xs text-emerald-400">✨</span>
                                    <span class="text-xs text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded-full">
                                        {{ entry.keywords.length }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div v-if="lorebook.entries.length === 0" class="text-center text-gray-500 py-12 px-4">
                            <div class="text-4xl mb-3">📭</div>
                            <div class="text-sm">暂无条目</div>
                            <div class="text-xs mt-1">点击上方按钮添加</div>
                        </div>
                    </div>
                    
                    <!-- 底部操作 -->
                    <div class="p-3 border-t border-gray-700/30 flex gap-2">
                        <button @click="handleExport" class="flex-1 px-2 py-2 text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-xl transition border border-gray-600/30 flex items-center justify-center gap-1.5">
                            <span>📤</span>
                            <span>导出</span>
                        </button>
                        <button @click="showImportModal = true" class="flex-1 px-2 py-2 text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-xl transition border border-gray-600/30 flex items-center justify-center gap-1.5">
                            <span>📥</span>
                            <span>导入</span>
                        </button>
                    </div>
                </div>

                <!-- 中间：条目详情编辑 -->
                <div class="flex-1 flex flex-col overflow-hidden bg-gray-900/20">
                    <div v-if="!selectedEntry" class="flex-1 flex items-center justify-center text-gray-500">
                        <div class="text-center">
                            <div class="text-5xl mb-4">📝</div>
                            <div class="text-sm">选择一个条目进行编辑</div>
                        </div>
                    </div>
                    
                    <div v-else class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
                        <!-- 错误提示 -->
                        <div v-if="errorMessage" class="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
                            <span>⚠️</span>
                            <span>{{ errorMessage }}</span>
                        </div>
                        
                        <!-- 基本信息 -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs sm:text-sm text-gray-400 mb-1.5 font-medium">
                                    📜 设定卡片名称
                                </label>
                                <input 
                                    v-model="selectedEntry.name"
                                    class="w-full bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                    placeholder="例如：伏地魔"
                                />
                            </div>
                            <div>
                                <label class="block text-xs sm:text-sm text-gray-400 mb-1.5 font-medium">
                                    ⭐ 重要程度
                                </label>
                                <input 
                                    type="number"
                                    v-model.number="selectedEntry.priority"
                                    class="w-full bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                    min="0"
                                    max="100"
                                    placeholder="默认 50"
                                />
                                <div class="text-xs text-gray-500 mt-1">数字越大越重要</div>
                            </div>
                        </div>
                        
                        <!-- 触发词 -->
                        <div>
                            <label class="block text-xs sm:text-sm text-gray-400 mb-1.5 font-medium">
                                🔑 触发词 (暗号)
                            </label>
                            <div class="flex flex-wrap gap-2 mb-2">
                                <span 
                                    v-for="kw in selectedEntry.keywords" 
                                    :key="kw"
                                    class="px-2.5 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-xs sm:text-sm rounded-full flex items-center gap-1.5 border border-purple-500/30 transition hover:border-purple-500/50"
                                >
                                    {{ kw }}
                                    <button @click="handleRemoveKeyword(kw)" class="hover:text-red-400 transition">×</button>
                                </span>
                                <span v-if="selectedEntry.keywords.length === 0" class="text-gray-500 text-sm py-1">
                                    (请添加触发词)
                                </span>
                            </div>
                            <div class="flex gap-2">
                                <input 
                                    v-model="newKeywordInput"
                                    @keyup.enter="handleAddKeyword"
                                    class="flex-1 bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                    placeholder="输入关键词，按回车添加"
                                />
                                <button 
                                    @click="handleAddKeyword"
                                    class="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-purple-500/25 font-medium text-sm flex items-center gap-1.5"
                                >
                                    <span>添加</span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- 简单描述 -->
                        <div>
                            <label class="block text-xs sm:text-sm text-gray-400 mb-1.5 font-medium">
                                📝 简单描述
                            </label>
                            <textarea 
                                v-model="selectedEntry.userDraft"
                                class="w-full bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all text-sm"
                                rows="2"
                                placeholder="写一句话简介，AI 会帮你扩展成详细版本..."
                            ></textarea>
                        </div>
                        
                        <!-- AI 扩展按钮 -->
                        <div class="flex items-center gap-3">
                            <button 
                                @click="handleExpand"
                                :disabled="isExpandingSelected"
                                class="px-4 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-pink-500/25 font-medium text-sm flex items-center gap-2"
                            >
                                <span v-if="isExpandingSelected" class="animate-spin">⏳</span>
                                <span v-else>✨</span>
                                <span>{{ isExpandingSelected ? 'AI 扩展中...' : 'AI 帮我扩展' }}</span>
                            </button>
                            <span v-if="selectedEntry.isExpanded" class="text-sm text-emerald-400 flex items-center gap-1">
                                ✓ 已扩展
                            </span>
                        </div>
                        
                        <!-- 最终内容 -->
                        <div>
                            <label class="block text-xs sm:text-sm text-gray-400 mb-1.5 font-medium">
                                📤 最终发送给 AI 的内容
                            </label>
                            <textarea 
                                v-model="selectedEntry.content"
                                class="w-full bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all text-sm"
                                rows="6"
                                placeholder="这里会显示 AI 扩展的内容，或者你可以直接手写..."
                            ></textarea>
                            <div class="flex justify-between text-xs text-gray-500 mt-1.5">
                                <span>预估 Token: {{ estimateTokens(selectedEntry.content) }}</span>
                                <span>{{ (selectedEntry.content || '').length }} 字符</span>
                            </div>
                        </div>
                        
                        <!-- 状态选项 -->
                        <div class="flex flex-wrap items-center gap-4 sm:gap-6">
                            <label class="flex items-center gap-2 text-xs sm:text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition">
                                <input type="checkbox" v-model="selectedEntry.enabled" class="rounded w-4 h-4 accent-indigo-500" />
                                <span>启用此条目</span>
                            </label>
                            <label class="flex items-center gap-2 text-xs sm:text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition">
                                <input type="checkbox" v-model="selectedEntry.caseSensitive" class="rounded w-4 h-4 accent-indigo-500" />
                                <span>区分大小写</span>
                            </label>
                        </div>
                        
                        <!-- 删除按钮 -->
                        <div class="pt-4 border-t border-gray-700/30">
                            <button 
                                @click="handleRemoveEntry(selectedEntry.id)"
                                class="w-full px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all duration-300 border border-red-500/20 hover:border-red-500/40 font-medium text-sm flex items-center justify-center gap-2"
                            >
                                <span>🗑️</span>
                                <span>删除此条目</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 右侧：预览 -->
                <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-700/50 flex flex-col bg-gray-900/30">
                    <div class="p-4 border-b border-gray-700/30 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
                        <h3 class="font-bold text-white mb-1 flex items-center gap-2">
                            <span class="text-lg">👁️</span>
                            <span>AI 视角预览</span>
                        </h3>
                        <p class="text-xs text-gray-500 leading-relaxed">
                            这里显示的是：假如所有卡片都被触发，AI 会看到什么。这只是给你预览用的，实际对话时只会显示相关的。
                        </p>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4">
                        <pre class="text-sm text-gray-300 whitespace-pre-wrap bg-gray-900/50 p-4 rounded-xl border border-gray-700/30 font-mono leading-relaxed">{{ previewContent }}</pre>
                    </div>
                    <div class="p-4 border-t border-gray-700/30 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 text-sm text-gray-400">
                        <div class="flex items-center justify-between">
                            <span>预估 Token:</span>
                            <strong class="text-white text-lg">{{ previewTokens }}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 导入弹窗 -->
        <div v-if="showImportModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-60 p-4">
            <div class="bg-gray-900/95 rounded-2xl p-6 w-full max-w-md border border-gray-700/50 shadow-2xl">
                <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span>📥</span>
                    <span>导入世界书</span>
                </h3>
                <textarea 
                    v-model="importText"
                    class="w-full bg-gray-800/50 text-white px-3 py-2.5 rounded-xl border border-gray-600/50 outline-none resize-none transition-all text-sm focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20"
                    rows="8"
                    placeholder="粘贴 JSON 内容..."
                ></textarea>
                <div class="flex justify-end gap-3 mt-4">
                    <button @click="showImportModal = false" class="px-4 py-2 text-gray-400 hover:text-white transition font-medium text-sm">取消</button>
                    <button @click="handleImport" class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-indigo-500/25 font-medium text-sm">导入</button>
                </div>
            </div>
        </div>
    </div>
</template>
