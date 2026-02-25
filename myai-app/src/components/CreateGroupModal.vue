<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    roleList: Array,
});

const emit = defineEmits(['create', 'close']);

const groupName = ref('');
const selectedIds = ref([]);

const canCreate = computed(() => {
    return groupName.value.trim() && selectedIds.value.length >= 2;
});

function toggleRole(roleId) {
    const index = selectedIds.value.indexOf(roleId);
    if (index === -1) {
        if (selectedIds.value.length < 8) {
            selectedIds.value.push(roleId);
        }
    } else {
        selectedIds.value.splice(index, 1);
    }
}

function handleCreate() {
    if (!canCreate.value) return;
    emit('create', groupName.value.trim(), [...selectedIds.value]);
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>
        <div class="relative glass bg-glass-dark rounded-2xl max-w-md w-full p-6 border border-white/10 shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-white text-shadow">👥 创建群聊</h3>

            <!-- 群聊名称 -->
            <div class="mb-4">
                <label class="text-sm text-gray-400 mb-1 block">群聊名称</label>
                <input v-model="groupName"
                       type="text"
                       placeholder="例如：笑话大赛"
                       class="w-full glass-light bg-glass-light text-gray-100 rounded-xl px-4 py-2.5 border border-white/10 focus:border-primary outline-none transition" />
            </div>

            <!-- 角色选择 -->
            <div class="mb-4">
                <label class="text-sm text-gray-400 mb-2 block">
                    选择参与角色（{{ selectedIds.length }}/8，至少 2 个）
                </label>
                <div class="space-y-2 max-h-60 overflow-y-auto">
                    <div v-for="role in roleList" :key="role.id"
                         @click="toggleRole(role.id)"
                         class="flex items-center space-x-3 p-2.5 rounded-xl cursor-pointer border transition"
                         :class="selectedIds.includes(role.id)
                             ? 'border-primary bg-primary/15'
                             : 'border-white/10 hover:bg-white/5'">
                        <!-- Checkbox -->
                        <div class="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition"
                             :class="selectedIds.includes(role.id)
                                 ? 'border-primary bg-primary'
                                 : 'border-gray-500'">
                            <svg v-if="selectedIds.includes(role.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <!-- 头像 + 名字 -->
                        <div v-if="role.avatar" class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-white/20">
                            <img :src="role.avatar" class="w-full h-full object-cover" />
                        </div>
                        <div v-else class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm flex-shrink-0">🎭</div>
                        <span class="text-gray-200 text-sm truncate">{{ role.name }}</span>
                    </div>
                </div>
            </div>

            <!-- 按钮 -->
            <div class="flex space-x-3 justify-end">
                <button @click="$emit('close')"
                    class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">取消</button>
                <button @click="handleCreate"
                    :disabled="!canCreate"
                    class="px-4 py-2 rounded-lg bg-primary hover:bg-indigo-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed">
                    创建群聊
                </button>
            </div>
        </div>
    </div>
</template>
