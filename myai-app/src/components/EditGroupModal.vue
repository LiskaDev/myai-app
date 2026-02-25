<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
    group: Object,
    roleList: Array,
});

const emit = defineEmits(['save', 'close']);

const groupName = ref('');
const selectedIds = ref([]);

onMounted(() => {
    groupName.value = props.group?.name || '';
    selectedIds.value = [...(props.group?.participantIds || [])];
});

const canSave = computed(() => groupName.value.trim() && selectedIds.value.length >= 2);

function toggleRole(roleId) {
    const index = selectedIds.value.indexOf(roleId);
    if (index >= 0) {
        selectedIds.value.splice(index, 1);
    } else if (selectedIds.value.length < 8) {
        selectedIds.value.push(roleId);
    }
}

function handleSave() {
    if (!canSave.value) return;
    emit('save', props.group.id, groupName.value.trim(), [...selectedIds.value]);
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
