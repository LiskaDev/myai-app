<script setup>
import { ref } from 'vue';
import { useUserPersona } from '../../composables/useUserPersona.js';

const { traits, addTrait, removeTrait, clearAllTraits } = useUserPersona();

const newContent = ref('');
const newCategory = ref('preference');
const showConfirmClear = ref(false);

const categoryConfig = {
    preference: {
        label: '偏好', desc: '稳定的喜好，如喜欢的题材、风格',
        tagClass: 'persona-tag-blue', dotColor: '#60a5fa',
    },
    personality: {
        label: '性格', desc: '稳定的性格特质',
        tagClass: 'persona-tag-purple', dotColor: '#a78bfa',
    },
    fact: {
        label: '事实', desc: '客观事实，如职业、地区',
        tagClass: 'persona-tag-green', dotColor: '#34d399',
    },
    style: {
        label: '风格', desc: '角色扮演风格偏好',
        tagClass: 'persona-tag-orange', dotColor: '#fb923c',
    },
    boundary: {
        label: '雷区', desc: '不喜欢的内容，AI会主动规避',
        tagClass: 'persona-tag-red', dotColor: '#f87171',
    },
};

function handleAdd() {
    if (!newContent.value.trim()) return;
    addTrait({ category: newCategory.value, content: newContent.value });
    newContent.value = '';
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAdd();
    }
}
</script>

<template>
    <section class="space-y-5">
        <h3 class="font-semibold text-gray-300 flex items-center text-shadow px-1">
            <span class="mr-2">👤</span> 用户画像
        </h3>

        <!-- 说明卡片 -->
        <div class="glass bg-glass-message rounded-2xl p-4">
            <p class="text-sm text-gray-400 leading-relaxed">
                🧠 AI 会静默分析你的聊天记录，自动提取你的长期偏好和习惯，让每个角色都能自然地了解你。
                你也可以手动添加或删除条目。
            </p>
            <p class="mt-2 text-xs text-gray-500">
                已保存 {{ traits.length }} 条画像信息 · 每 8 条消息自动分析一次
            </p>
        </div>

        <!-- 手动添加 -->
        <div class="space-y-2">
            <label class="block text-sm text-gray-400">手动添加</label>
            <div class="flex gap-2">
                <select v-model="newCategory"
                        class="glass bg-glass-light rounded-xl px-3 py-2 text-sm text-gray-200 border border-white/10 focus:border-white/30 outline-none transition">
                    <option v-for="(cfg, key) in categoryConfig" :key="key" :value="key"
                            class="bg-gray-900">{{ cfg.label }}</option>
                </select>
                <input v-model="newContent" type="text"
                       :placeholder="categoryConfig[newCategory].desc"
                       maxlength="50"
                       @keydown="handleKeydown"
                       class="flex-1 glass bg-glass-light rounded-xl px-3 py-2 text-sm text-gray-200 border border-white/10 focus:border-white/30 outline-none transition placeholder-gray-500 min-w-0" />
                <button @click="handleAdd" :disabled="!newContent.trim()"
                        class="glass bg-glass-light rounded-xl px-4 py-2 text-sm text-gray-300 hover:bg-white/15 disabled:opacity-30 transition border border-white/10 flex-shrink-0">
                    ➕
                </button>
            </div>
        </div>

        <!-- Traits 展示 -->
        <div v-if="traits.length > 0" class="space-y-4">
            <div class="flex items-center justify-between">
                <label class="text-sm text-gray-400">当前画像</label>
                <template v-if="!showConfirmClear">
                    <button @click="showConfirmClear = true"
                            class="text-xs text-gray-500 hover:text-red-400 transition">清空全部</button>
                </template>
                <div v-else class="flex items-center gap-2">
                    <span class="text-xs text-red-400">确认？</span>
                    <button @click="clearAllTraits(); showConfirmClear = false"
                            class="text-xs text-red-400 hover:text-red-300 transition">确认</button>
                    <button @click="showConfirmClear = false"
                            class="text-xs text-gray-500 hover:text-gray-300 transition">取消</button>
                </div>
            </div>

            <!-- 按 category 分组 -->
            <template v-for="(cfg, catKey) in categoryConfig" :key="catKey">
                <div v-if="traits.filter(t => t.category === catKey).length > 0" class="space-y-2">
                    <!-- 分组标题 -->
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: cfg.dotColor }"></span>
                        <span class="text-xs font-medium text-gray-500">{{ cfg.label }}</span>
                    </div>
                    <!-- 标签流 -->
                    <div class="flex flex-wrap gap-2">
                        <div v-for="trait in traits.filter(t => t.category === catKey)" :key="trait.id"
                             :class="['group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all', cfg.tagClass]">
                            <span>{{ trait.content }}</span>
                            <span v-if="trait.source === 'manual'" class="opacity-40 text-[10px]">手动</span>
                            <button @click="removeTrait(trait.id)"
                                    class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white ml-0.5"
                                    title="删除">✕</button>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- 空状态 -->
        <div v-else class="flex flex-col items-center gap-3 py-10 text-gray-500">
            <span class="text-3xl">🔍</span>
            <p class="text-sm">还没有收集到任何画像信息</p>
            <p class="text-xs text-gray-600">继续聊天，AI 会自动分析你的偏好</p>
        </div>
    </section>
</template>

<style scoped>
.persona-tag-blue {
    background: rgba(96, 165, 250, 0.12);
    color: #93bbfd;
    border-color: rgba(96, 165, 250, 0.25);
}
.persona-tag-purple {
    background: rgba(167, 139, 250, 0.12);
    color: #c4b5fd;
    border-color: rgba(167, 139, 250, 0.25);
}
.persona-tag-green {
    background: rgba(52, 211, 153, 0.12);
    color: #6ee7b7;
    border-color: rgba(52, 211, 153, 0.25);
}
.persona-tag-orange {
    background: rgba(251, 146, 60, 0.12);
    color: #fdba74;
    border-color: rgba(251, 146, 60, 0.25);
}
.persona-tag-red {
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
    border-color: rgba(248, 113, 113, 0.25);
}
</style>