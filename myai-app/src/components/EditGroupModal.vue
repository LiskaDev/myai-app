<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
    group: Object,
    roleList: Array,
});

const emit = defineEmits(['save', 'close']);

const groupName = ref('');
const groupDescription = ref('');
const groupGenre = ref('');
const groupModel = ref('');
const groupMaxTokens = ref(0);
const selectedIds = ref([]);

const GENRE_OPTIONS = [
    { value: '', label: '未设置（自由发挥）' },
    { value: '搞笑日常', label: '🤣 搞笑日常' },
    { value: '校园恋爱', label: '💕 校园恋爱' },
    { value: '职场故事', label: '💼 职场故事' },
    { value: '悬疑推理', label: '🔍 悬疑推理' },
    { value: '废土生存', label: '☢️ 废土生存' },
    { value: '奇幻冒险', label: '⚔️ 奇幻冒险' },
    { value: '科幻太空', label: '🚀 科幻太空' },
];

const MODEL_OPTIONS = [
    { value: '', label: '跟随全局设置' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
];

const TOKEN_PRESETS = [
    { value: 0, label: '跟随角色设置' },
    { value: 500, label: '简短 (500)' },
    { value: 1000, label: '适中 (1000)' },
    { value: 2000, label: '较长 (2000)' },
    { value: 4000, label: '长文 (4000)' },
];

onMounted(() => {
    groupName.value = props.group?.name || '';
    groupDescription.value = props.group?.description || '';
    groupGenre.value = props.group?.genre || '';
    groupModel.value = props.group?.model || '';
    groupMaxTokens.value = props.group?.maxTokens || 0;
    selectedIds.value = [...(props.group?.participantIds || [])];
});

const canSave = computed(() => groupName.value.trim() && selectedIds.value.length >= 2);

function toggleRole(roleId) {
    if (selectedIds.value.includes(roleId)) {
        selectedIds.value = selectedIds.value.filter(id => id !== roleId);
    } else if (selectedIds.value.length < 8) {
        selectedIds.value = [...selectedIds.value, roleId];
    }
}

function handleSave() {
    if (!canSave.value) return;
    emit('save', props.group.id, groupName.value.trim(), [...selectedIds.value], groupDescription.value.trim(), groupModel.value, groupMaxTokens.value, groupGenre.value);
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" @click.self="$emit('close')">
        <div class="glass-strong bg-glass-dark rounded-2xl border border-white/15 shadow-2xl w-full max-w-md overflow-hidden">
            <div class="p-6 space-y-4">
                <h2 class="text-lg font-bold">✏️ 编辑群聊</h2>

                <div>
                    <label class="block text-sm text-gray-400 mb-1">群聊名称</label>
                    <input v-model="groupName" type="text"
                           class="w-full glass-light bg-glass-light rounded-xl px-4 py-2.5 text-gray-100 outline-none border border-white/10 focus:border-primary transition" />
                </div>

                <div>
                    <label class="block text-sm text-gray-400 mb-1">群聊描述 <span class="text-gray-600">（可选）</span></label>
                    <textarea v-model="groupDescription"
                              placeholder="例如：几个朋友在咖啡厅聊天，主题是最近看过的电影"
                              rows="2"
                              class="w-full glass-light bg-glass-light rounded-xl px-4 py-2.5 text-gray-100 outline-none border border-white/10 focus:border-primary transition resize-none"></textarea>
                </div>

                <!-- 剧本基调 -->
                <div>
                    <label class="block text-sm text-gray-400 mb-1">🎬 剧本基调 <span class="text-gray-600">（约束影子导演生成的事件风格）</span></label>
                    <select v-model="groupGenre"
                            class="w-full glass-light bg-glass-light rounded-xl px-3 py-2.5 text-gray-100 text-sm outline-none border border-white/10 focus:border-primary transition appearance-none cursor-pointer">
                        <option v-for="opt in GENRE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                </div>

                <div>
                    <label class="block text-sm text-gray-400 mb-2">
                        参与角色（{{ selectedIds.length }}/8，至少 2 个）
                    </label>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        <div v-for="role in roleList" :key="role.id"
                             @click="toggleRole(role.id)"
                             class="flex items-center space-x-3 p-2 rounded-lg cursor-pointer border transition"
                             :class="selectedIds.includes(role.id)
                                 ? 'border-primary/60 bg-primary/10'
                                 : 'border-white/10 hover:bg-white/5'">
                            <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                                 :class="selectedIds.includes(role.id) ? 'bg-primary border-primary' : 'border-gray-500'">
                                <svg v-if="selectedIds.includes(role.id)" class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div v-if="role.avatar" class="w-7 h-7 rounded-full overflow-hidden">
                                <img :src="role.avatar" class="w-full h-full object-cover" />
                            </div>
                            <div v-else class="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-xs">🎭</div>
                            <span class="text-sm">{{ role.name }}</span>
                        </div>
                    </div>
                </div>

                <!-- 模型 & 回复长度设置 -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm text-gray-400 mb-1">🧠 模型</label>
                        <select v-model="groupModel"
                                class="w-full glass-light bg-glass-light rounded-xl px-3 py-2.5 text-gray-100 text-sm outline-none border border-white/10 focus:border-primary transition appearance-none cursor-pointer">
                            <option v-for="opt in MODEL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-400 mb-1">📏 回复长度</label>
                        <select v-model.number="groupMaxTokens"
                                class="w-full glass-light bg-glass-light rounded-xl px-3 py-2.5 text-gray-100 text-sm outline-none border border-white/10 focus:border-primary transition appearance-none cursor-pointer">
                            <option v-for="preset in TOKEN_PRESETS" :key="preset.value" :value="preset.value">{{ preset.label }}</option>
                        </select>
                    </div>
                </div>

                <div class="flex space-x-3 justify-end pt-2">
                    <button @click="$emit('close')"
                            class="px-5 py-2 rounded-xl glass hover:bg-white/10 transition text-sm">
                        取消
                    </button>
                    <button @click="handleSave" :disabled="!canSave"
                            class="px-5 py-2 rounded-xl bg-primary hover:bg-primary/80 transition text-sm font-medium text-white disabled:opacity-40">
                        保存
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
