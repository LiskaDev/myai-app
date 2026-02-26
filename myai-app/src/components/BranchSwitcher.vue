<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    branches: { type: Array, default: () => [] },
    currentBranchId: { type: String, default: 'branch-main' },
});

const emit = defineEmits(['switch', 'rename', 'delete']);

const isOpen = ref(false);
const editingId = ref(null);
const editName = ref('');

const currentBranch = computed(() =>
    props.branches.find(b => b.id === props.currentBranchId) || props.branches[0]
);

function toggleDropdown() {
    isOpen.value = !isOpen.value;
}

function selectBranch(branchId) {
    if (branchId !== props.currentBranchId) {
        emit('switch', branchId);
    }
    isOpen.value = false;
}

function startRename(branch) {
    editingId.value = branch.id;
    editName.value = branch.name;
}

function confirmRename(branchId) {
    if (editName.value.trim()) {
        emit('rename', branchId, editName.value.trim());
    }
    editingId.value = null;
}

function handleDelete(branchId) {
    emit('delete', branchId);
    if (props.branches.length <= 2) {
        isOpen.value = false;
    }
}

function closeDropdown(e) {
    // 点击外部关闭
    if (!e.target.closest('.branch-switcher')) {
        isOpen.value = false;
    }
}
</script>

<template>
    <div class="branch-switcher" v-if="branches.length > 1">
        <button class="branch-current" @click="toggleDropdown">
            <span class="branch-icon">🌿</span>
            <span class="branch-name">{{ currentBranch?.name || '主线' }}</span>
            <span class="branch-count">({{ branches.length }})</span>
            <svg class="branch-arrow" :class="{ open: isOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </button>

        <Teleport to="body">
            <div v-if="isOpen" class="branch-overlay" @click="isOpen = false"></div>
        </Teleport>

        <transition name="dropdown">
            <div v-if="isOpen" class="branch-dropdown">
                <div v-for="branch in branches" :key="branch.id" class="branch-item"
                    :class="{ active: branch.id === currentBranchId }" @click="selectBranch(branch.id)">
                    <div class="branch-item-left">
                        <span class="branch-item-icon">{{ branch.id === 'branch-main' ? '🌳' : '🔀' }}</span>
                        <div v-if="editingId === branch.id" class="branch-edit" @click.stop>
                            <input v-model="editName" @keyup.enter="confirmRename(branch.id)"
                                @blur="confirmRename(branch.id)" class="branch-edit-input" autofocus />
                        </div>
                        <div v-else class="branch-item-info">
                            <span class="branch-item-name">{{ branch.name }}</span>
                            <span class="branch-item-meta">{{ branch.chatHistory.length }} 条消息</span>
                        </div>
                    </div>
                    <div class="branch-item-actions" @click.stop>
                        <button @click="startRename(branch)" class="branch-action-btn" title="重命名">✏️</button>
                        <button v-if="branch.id !== 'branch-main'" @click="handleDelete(branch.id)"
                            class="branch-action-btn delete" title="删除">🗑️</button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.branch-switcher {
    position: relative;
}

.branch-current {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(220, 220, 240, 0.85);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.branch-current:hover {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.3);
}

.branch-icon {
    font-size: 0.8rem;
}

.branch-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.branch-count {
    color: rgba(160, 160, 180, 0.6);
    font-size: 0.65rem;
}

.branch-arrow {
    transition: transform 0.2s ease;
    opacity: 0.5;
}

.branch-arrow.open {
    transform: rotate(180deg);
}

.branch-overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
}

.branch-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 240px;
    max-height: 300px;
    overflow-y: auto;
    background: rgba(20, 20, 35, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 4px;
    z-index: 100;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.branch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.branch-item:hover {
    background: rgba(255, 255, 255, 0.06);
}

.branch-item.active {
    background: rgba(99, 102, 241, 0.15);
    border-left: 2px solid rgba(99, 102, 241, 0.6);
}

.branch-item-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}

.branch-item-icon {
    font-size: 0.85rem;
    flex-shrink: 0;
}

.branch-item-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.branch-item-name {
    font-size: 0.8rem;
    color: rgba(220, 220, 240, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.branch-item-meta {
    font-size: 0.65rem;
    color: rgba(160, 160, 180, 0.5);
}

.branch-item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.branch-item:hover .branch-item-actions {
    opacity: 1;
}

.branch-action-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background 0.15s ease;
}

.branch-action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.branch-action-btn.delete:hover {
    background: rgba(239, 68, 68, 0.2);
}

.branch-edit {
    flex: 1;
}

.branch-edit-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 6px;
    color: white;
    font-size: 0.8rem;
    padding: 2px 8px;
    outline: none;
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}
</style>
