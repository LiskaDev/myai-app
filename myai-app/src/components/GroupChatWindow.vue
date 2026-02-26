<script setup>
import { ref, watch, nextTick, computed } from 'vue';
import { renderMarkdown } from '../utils/markdown';
import { parseDualLayerResponse } from '../utils/textParser';
import RelationshipRadar from './RelationshipRadar.vue';

const props = defineProps({
    messages: { type: Array, default: () => [] },
    participants: { type: Array, default: () => [] },
    currentGroup: Object,
    isStreaming: Boolean,
    currentSpeakingRole: String,
    globalSettings: Object,
});

const emit = defineEmits([
    'send-director',
    'continue-round',
    'stop-generation',
    'speak-as-role',
    'delete-message',
    'edit-message',
    'inject-world-event',
    'send-whisper',
    'generate-director-event',
    'update-affinity',
]);

const containerRef = ref(null);
const directorInput = ref('');
const showMentionList = ref(false);
const mentionFilter = ref('');
const inputRef = ref(null);
const activeMessageIndex = ref(-1);
const expandedPassGroups = ref(new Set());

// 世界事件面板
const showEventPanel = ref(false);
const showCommandMenu = ref(false);
const customEventText = ref('');
const showRelationshipPanel = ref(false);

const WORLD_EVENTS = [
    { category: '☁️ 天气', items: [
        { emoji: '⛈️', label: '雷暴', text: '突然窗外闪过一道剧烈的闪电，伴随着震耳欲聋的雷声，暴雨倾盆而下。' },
        { emoji: '❄️', label: '暴风雪', text: '窗外突然开始下起了暴风雪，能见度几乎为零，气温骤降。' },
        { emoji: '🌅', label: '夕阳', text: '窗外夏阳渐渐西沉，温暖的橙红色光芒洒进房间。' },
    ]},
    { category: '🕐 时间', items: [
        { emoji: '🌙', label: '入夜', text: '不知不觉天色已晚，窗外一片漆黑，只有远处的路灯微微闪烁。' },
        { emoji: '🌄', label: '破晓', text: '第一缕晨光透过窗帘的缝隙洒入房间，鸟儿开始在窗外鸣叫。' },
    ]},
    { category: '💥 突发', items: [
        { emoji: '💡', label: '停电', text: '突然“喀嗒”一声，所有的灯同时熄灭，房间陷入了完全的黑暗。' },
        { emoji: '🚨', label: '警报', text: '手机突然同时响起了刺耳的紧急警报声，屏幕上显示着一条紧急通知。' },
        { emoji: '🪨', label: '地震', text: '脚下的地面突然剧烈晃动起来，桂子上的东西纷纷掉落，空气中弥漫着火药的味道。' },
        { emoji: '🚪', label: '神秘来客', text: '门外突然响起了急促的敲门声，一下、两下、三下……然后是长久的沉默。' },
        { emoji: '🧟', label: '丧尸', text: '窗外传来杂乱的尖叫声和不明物体撞击大门的声音，透过窗户可以看到街上的人在拼命奔跑。' },
    ]},
];

function triggerEvent(eventText) {
    emit('inject-world-event', eventText);
    showEventPanel.value = false;
}

function triggerCustomEvent() {
    if (!customEventText.value.trim()) return;
    emit('inject-world-event', customEventText.value.trim());
    customEventText.value = '';
    showEventPanel.value = false;
}

// 悄悄话面板
const showWhisperPanel = ref(false);
const whisperTargetRoleId = ref('');
const whisperContent = ref('');

function toggleWhisperPanel() {
    showWhisperPanel.value = !showWhisperPanel.value;
    if (showWhisperPanel.value) showEventPanel.value = false;
}

function toggleEventPanel() {
    showEventPanel.value = !showEventPanel.value;
    if (showEventPanel.value) {
        showWhisperPanel.value = false;
        showRelationshipPanel.value = false;
    }
}

function toggleRelationshipPanel() {
    showRelationshipPanel.value = !showRelationshipPanel.value;
    if (showRelationshipPanel.value) {
        showEventPanel.value = false;
        showWhisperPanel.value = false;
    }
}

function handleSendWhisper() {
    if (!whisperTargetRoleId.value || !whisperContent.value.trim()) return;
    emit('send-whisper', whisperTargetRoleId.value, whisperContent.value.trim());
    whisperContent.value = '';
    showWhisperPanel.value = false;
}

// 将消息分组：连续的 pass 消息合并为一个 pass-group
const displayItems = computed(() => {
    const items = [];
    let i = 0;
    const msgs = props.messages;
    while (i < msgs.length) {
        if (msgs[i].role === 'pass') {
            // 收集连续的 pass
            const passGroup = [];
            const startIndex = i;
            while (i < msgs.length && msgs[i].role === 'pass') {
                passGroup.push(msgs[i]);
                i++;
            }
            items.push({ type: 'pass-group', passes: passGroup, startIndex });
        } else {
            items.push({ type: 'message', msg: msgs[i], index: i });
            i++;
        }
    }
    return items;
});

function togglePassGroup(startIndex) {
    if (expandedPassGroups.value.has(startIndex)) {
        expandedPassGroups.value.delete(startIndex);
    } else {
        expandedPassGroups.value.add(startIndex);
    }
    // 强制响应式更新
    expandedPassGroups.value = new Set(expandedPassGroups.value);
}

// 编辑状态
const editingIndex = ref(-1);
const editContent = ref('');

// 角色颜色映射（最多 8 种颜色，循环使用）
const ROLE_COLORS = [
    '#818cf8', // indigo
    '#f472b6', // pink
    '#34d399', // emerald
    '#fbbf24', // amber
    '#60a5fa', // blue
    '#a78bfa', // violet
    '#fb923c', // orange
    '#2dd4bf', // teal
];

function getRoleColor(roleId) {
    const index = props.participants.findIndex(p => p.id === roleId);
    return ROLE_COLORS[index % ROLE_COLORS.length];
}

// @ 提及：过滤的角色列表
const filteredMentions = computed(() => {
    if (!mentionFilter.value) return props.participants;
    return props.participants.filter(p =>
        p.name.toLowerCase().includes(mentionFilter.value.toLowerCase())
    );
});

function safeRender(content) {
    try {
        if (!content) return '';
        const parsed = parseDualLayerResponse(content);
        return renderMarkdown(parsed.content || content);
    } catch {
        return content;
    }
}

// 点击消息切换选中状态
function toggleSelect(index) {
    activeMessageIndex.value = activeMessageIndex.value === index ? -1 : index;
}

// 开始编辑消息
function startEdit(index) {
    const msg = props.messages[index];
    if (!msg) return;
    editingIndex.value = index;
    editContent.value = msg.rawContent || msg.content || '';
    activeMessageIndex.value = -1;
}

// 保存编辑
function saveEdit() {
    if (editingIndex.value >= 0 && editContent.value.trim()) {
        emit('edit-message', editingIndex.value, editContent.value.trim());
    }
    cancelEdit();
}

// 取消编辑
function cancelEdit() {
    editingIndex.value = -1;
    editContent.value = '';
}

// 监听输入框内容变化，检测 @
function onInputChange() {
    const value = directorInput.value;
    const cursorPos = inputRef.value?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);

    // 找到最后一个 @ 符号
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex >= 0) {
        const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!afterAt.includes(' ')) {
            mentionFilter.value = afterAt;
            showMentionList.value = true;
            return;
        }
    }
    showMentionList.value = false;
}

// 选择 @ 角色
function selectMention(role) {
    const value = directorInput.value;
    const cursorPos = inputRef.value?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
        const before = value.substring(0, lastAtIndex);
        const after = value.substring(cursorPos);
        directorInput.value = `${before}@${role.name} ${after}`;
    }

    showMentionList.value = false;
    nextTick(() => inputRef.value?.focus());
}

// 自动滚动到底部
watch(() => props.messages.length, () => {
    nextTick(() => {
        if (containerRef.value) {
            containerRef.value.scrollTop = containerRef.value.scrollHeight;
        }
    });
});

// 流式输出时跟随滚动
watch(() => {
    const msgs = props.messages;
    return msgs.length > 0 ? msgs[msgs.length - 1]?.content : '';
}, () => {
    nextTick(() => {
        if (containerRef.value) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
            if (scrollHeight - scrollTop - clientHeight < 200) {
                containerRef.value.scrollTop = scrollHeight;
            }
        }
    });
});

function handleSend() {
    if (!directorInput.value.trim()) return;
    showMentionList.value = false;
    emit('send-director', directorInput.value);
    directorInput.value = '';
}
</script>

<template>
    <div ref="containerRef"
         class="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-4"
         style="scroll-behavior: smooth;">

        <!-- 空消息时的提示 -->
        <div v-if="messages.length === 0"
             class="flex items-center justify-center h-full">
            <div class="text-center text-gray-400 space-y-3">
                <div class="text-4xl">👥</div>
                <p class="text-lg font-medium">{{ currentGroup?.name || '群聊' }}</p>
                <p class="text-sm">
                    参与角色：{{ participants.map(p => p.name).join('、') }}
                </p>
                <p class="text-xs text-gray-500">发送消息引导讨论，或直接点击 ▶️ 让他们开聊</p>
                <!-- 角色快捷触发按钮 -->
                <div class="flex flex-wrap justify-center gap-2 mt-4">
                    <button v-for="p in participants" :key="p.id"
                            @click="$emit('speak-as-role', p.id)"
                            :disabled="isStreaming"
                            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 transition text-xs disabled:opacity-40"
                            :style="{ borderColor: getRoleColor(p.id) + '50' }"
                            :title="`让${p.name}说一句`">
                        <span>💬</span>
                        <span :style="{ color: getRoleColor(p.id) }">{{ p.name }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 消息列表 -->
        <template v-for="(item, idx) in displayItems" :key="idx">

            <!-- PASS 折叠组（Discord 风格） -->
            <div v-if="item.type === 'pass-group'" class="flex justify-center">
                <div class="pass-group-bar" @click="togglePassGroup(item.startIndex)">
                    <span class="pass-group-icon">🤫</span>
                    <span>{{ item.passes.length }} 个角色选择了跳过</span>
                    <svg class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': expandedPassGroups.has(item.startIndex) }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </div>
            </div>
            <!-- PASS 展开详情 -->
            <div v-if="item.type === 'pass-group' && expandedPassGroups.has(item.startIndex)"
                 class="pass-group-detail">
                <div v-for="p in item.passes" :key="p.roleId + p.timestamp" class="pass-detail-item">
                    <div v-if="p.avatar" class="w-5 h-5 rounded-full overflow-hidden flex-shrink-0"
                         :style="{ border: `1.5px solid ${getRoleColor(p.roleId)}` }">
                        <img :src="p.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0"
                         :style="{ background: getRoleColor(p.roleId) }">🎭</div>
                    <span class="text-xs" :style="{ color: getRoleColor(p.roleId) }">{{ p.roleName }}</span>
                    <span class="text-xs text-gray-500">选择了跳过</span>
                </div>
            </div>

            <!-- 世界事件消息 -->
            <div v-if="item.type === 'message' && item.msg.role === 'world-event'" class="flex justify-center">
                <div class="world-event-message">
                    <span class="world-event-icon">🌍</span>
                    <span>{{ item.msg.content }}</span>
                </div>
            </div>

            <!-- 悄悄话消息 -->
            <div v-else-if="item.type === 'message' && item.msg.role === 'whisper'" class="flex justify-center">
                <div class="whisper-message">
                    <span class="whisper-icon">🤫</span>
                    <span>悄悄话发给 <strong>{{ item.msg.targetRoleName }}</strong>：{{ item.msg.content }}</span>
                </div>
            </div>

            <!-- 编辑模式 -->
            <div v-else-if="item.type === 'message' && editingIndex === item.index" class="edit-message-container">
                <div class="text-xs text-gray-400 mb-1">
                    ✏️ 编辑{{ item.msg.role === 'director' ? '导演' : item.msg.roleName }}的消息
                </div>
                <textarea v-model="editContent"
                    rows="3"
                    class="w-full glass-light bg-glass-light text-gray-100 rounded-xl px-4 py-3 resize-none outline-none border border-primary/50 focus:border-primary transition"
                    @keydown.enter.ctrl.prevent="saveEdit"
                ></textarea>
                <div class="flex justify-end space-x-2 mt-2">
                    <button @click="cancelEdit"
                            class="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition text-xs">
                        取消
                    </button>
                    <button @click="saveEdit"
                            :disabled="!editContent.trim()"
                            class="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/80 transition text-xs text-white disabled:opacity-40">
                        保存 (Ctrl+Enter)
                    </button>
                </div>
            </div>

            <!-- 导演消息（非编辑） -->
            <div v-else-if="item.type === 'message' && item.msg.role === 'director'" class="flex justify-center">
                <div class="message-wrapper">
                    <div class="director-message cursor-pointer"
                         :class="{ 'ring-2 ring-amber-400/50': activeMessageIndex === item.index }"
                         @click.stop="toggleSelect(item.index)">
                        <span class="director-label">🎬 导演</span>
                        <span>{{ item.msg.content }}</span>
                    </div>
                    <!-- 操作按钮 -->
                    <div class="message-toolbar" :class="{ 'active': activeMessageIndex === item.index }">
                        <div class="toolbar-inner">
                            <button class="toolbar-btn" @click.stop="startEdit(item.index)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                                编辑
                            </button>
                            <button class="toolbar-btn delete" @click.stop="$emit('delete-message', item.index)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- AI 角色消息（非编辑） -->
            <div v-else-if="item.type === 'message' && item.msg.role === 'assistant'" class="flex items-start space-x-3">
                <!-- 角色头像（可点击让该角色继续说） -->
                <div class="flex-shrink-0 cursor-pointer group" @click="$emit('speak-as-role', item.msg.roleId)"
                     :title="`让${item.msg.roleName}继续说`">
                    <div v-if="item.msg.avatar" class="w-10 h-10 rounded-full overflow-hidden transition group-hover:ring-2 group-hover:ring-white/30"
                         :style="{ border: `2px solid ${getRoleColor(item.msg.roleId)}` }">
                        <img :src="item.msg.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-10 h-10 rounded-full flex items-center justify-center text-sm transition group-hover:ring-2 group-hover:ring-white/30"
                         :style="{ background: getRoleColor(item.msg.roleId), border: `2px solid ${getRoleColor(item.msg.roleId)}` }">
                        🎭
                    </div>
                    <div class="text-center mt-0.5 opacity-0 group-hover:opacity-100 transition text-[10px] text-gray-400">💬</div>
                </div>

                <div class="max-w-[80%] min-w-0 message-wrapper">
                    <!-- 角色名 -->
                    <div class="text-xs mb-1 font-medium"
                         :style="{ color: getRoleColor(item.msg.roleId) }">
                        {{ item.msg.roleName || '角色' }}
                    </div>
                    <!-- 消息内容 -->
                    <div class="group-speech-bubble cursor-pointer"
                         :class="{ 'selected': activeMessageIndex === item.index, 'latest-bubble': item.index === messages.length - 1 && item.msg.role === 'assistant' }"
                         :style="{ borderLeftColor: getRoleColor(item.msg.roleId) }"
                         @click.stop="toggleSelect(item.index)">
                        <div v-if="item.msg.content" class="vn-body markdown-body"
                             v-html="safeRender(item.msg.rawContent || item.msg.content)">
                        </div>
                        <div v-else class="typing-indicator">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
                    <!-- 操作按钮 -->
                    <div class="message-toolbar" :class="{ 'active': activeMessageIndex === item.index }">
                        <div class="toolbar-inner">
                            <button class="toolbar-btn" @click.stop="startEdit(item.index)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                                编辑
                            </button>
                            <button class="toolbar-btn delete" @click.stop="$emit('delete-message', item.index)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- 正在输入状态 -->
        <div v-if="isStreaming && currentSpeakingRole && !(messages.length > 0 && !messages[messages.length - 1]?.content)"
             class="flex items-center space-x-2 text-gray-400 text-sm pl-13">
        </div>
    </div>

    <!-- ▁▁ 悟空按钮：▆️ 继续一轮 (FAB) -->
    <Transition name="fab">
        <button v-if="messages.length > 0 && !isStreaming"
                @click="$emit('continue-round')"
                class="group-fab">
            ▶️ 继续
        </button>
    </Transition>

    <!-- 底部输入区 -->
    <footer class="glass-strong bg-glass-dark border-t border-white/10 p-3 flex-shrink-0">
        <div class="relative">
            <!-- @ 提及下拉列表 -->
            <div v-if="showMentionList && filteredMentions.length > 0"
                 class="absolute bottom-full left-0 right-0 mb-2 glass bg-glass-dark rounded-xl border border-white/15 shadow-2xl overflow-hidden z-10">
                <div v-for="role in filteredMentions" :key="role.id"
                     @mousedown.prevent="selectMention(role)"
                     class="flex items-center space-x-2 px-3 py-2 hover:bg-white/10 cursor-pointer transition">
                    <div v-if="role.avatar" class="w-6 h-6 rounded-full overflow-hidden">
                        <img :src="role.avatar" class="w-full h-full object-cover" />
                    </div>
                    <div v-else class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                         :style="{ background: getRoleColor(role.id) }">🎭</div>
                    <span class="text-sm" :style="{ color: getRoleColor(role.id) }">{{ role.name }}</span>
                </div>
            </div>

            <!-- 🌍 世界事件面板 -->
            <div v-if="showEventPanel"
                 class="absolute bottom-full left-0 right-0 mb-2 glass bg-glass-dark rounded-xl border border-white/15 shadow-2xl overflow-hidden z-10 max-h-80 overflow-y-auto">
                <div class="p-3 border-b border-white/10 flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-200">🌍 注入世界事件</span>
                    <button @click="showEventPanel = false" class="text-gray-400 hover:text-white transition text-xs">✖</button>
                </div>
                <div v-for="cat in WORLD_EVENTS" :key="cat.category" class="border-b border-white/5 last:border-0">
                    <div class="text-xs text-gray-500 px-3 pt-2 pb-1">{{ cat.category }}</div>
                    <div class="flex flex-wrap gap-1.5 px-3 pb-2">
                        <button v-for="ev in cat.items" :key="ev.label"
                                @click="triggerEvent(ev.text)"
                                class="event-preset-btn">
                            <span>{{ ev.emoji }}</span>
                            <span>{{ ev.label }}</span>
                        </button>
                    </div>
                </div>
                <!-- 自定义事件 -->
                <div class="p-3 border-t border-white/10">
                    <div class="text-xs text-gray-500 mb-1.5">✨ 自定义事件</div>
                    <div class="flex space-x-2">
                        <input v-model="customEventText"
                               @keydown.enter.prevent="triggerCustomEvent"
                               placeholder="例如：突然一只猫跳上了桌子..."
                               class="flex-1 glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 text-sm outline-none border border-white/10 focus:border-primary transition" />
                        <button @click="triggerCustomEvent"
                                :disabled="!customEventText.trim()"
                                class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition text-sm text-white disabled:opacity-40">
                            注入
                        </button>
                    </div>
                </div>
            </div>

            <!-- 🤫 悄悄话面板 -->
            <div v-if="showWhisperPanel"
                 class="absolute bottom-full left-0 right-0 mb-2 glass bg-glass-dark rounded-xl border border-purple-500/25 shadow-2xl overflow-hidden z-10">
                <div class="p-3 border-b border-white/10 flex items-center justify-between">
                    <span class="text-sm font-medium text-purple-300">🤫 发送悄悄话</span>
                    <button @click="showWhisperPanel = false" class="text-gray-400 hover:text-white transition text-xs">✖</button>
                </div>
                <div class="p-3 space-y-3">
                    <div>
                        <div class="text-xs text-gray-500 mb-1.5">选择目标角色</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button v-for="p in participants" :key="p.id"
                                    @click="whisperTargetRoleId = p.id"
                                    class="whisper-role-btn"
                                    :class="{ active: whisperTargetRoleId === p.id }">
                                <div v-if="p.avatar" class="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                                    <img :src="p.avatar" class="w-full h-full object-cover" />
                                </div>
                                <div v-else class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0"
                                     :style="{ background: getRoleColor(p.id) }">🎭</div>
                                <span>{{ p.name }}</span>
                            </button>
                        </div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 mb-1.5">私密指令（只有该角色能“听到”）</div>
                        <div class="flex space-x-2">
                            <input v-model="whisperContent"
                                   @keydown.enter.prevent="handleSendWhisper"
                                   placeholder="例如：一会儿小明说话时，你故意反驳他..."
                                   class="flex-1 glass-light bg-glass-light text-gray-100 rounded-lg px-3 py-2 text-sm outline-none border border-purple-500/20 focus:border-purple-500 transition" />
                            <button @click="handleSendWhisper"
                                    :disabled="!whisperTargetRoleId || !whisperContent.trim()"
                                    class="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition text-sm text-white disabled:opacity-40">
                                发送
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 📊 关系雷达图面板 -->
            <div v-if="showRelationshipPanel"
                 class="absolute bottom-full left-0 right-0 mb-2 z-10">
                <RelationshipRadar
                    :participants="participants"
                    :relationship-matrix="currentGroup?.relationshipMatrix || {}"
                    @update-affinity="(from, to, val) => emit('update-affinity', from, to, val)"
                    @close="showRelationshipPanel = false"
                />
            </div>

            <!-- 主输入行：⚡ + textarea + 发送/停止 -->
            <form @submit.prevent="handleSend" class="flex items-end space-x-2">
                <!-- ⚡ 命令菜单包裹器 -->
                <div class="cmd-menu-wrapper flex-shrink-0">
                    <button type="button" @click="showCommandMenu = !showCommandMenu"
                            class="cmd-menu-trigger"
                            :class="{ active: showCommandMenu || showEventPanel || showWhisperPanel }">
                        ⚡
                    </button>
                    <!-- 向上弹出的悬浮菜单 -->
                    <Transition name="cmd-pop">
                        <div v-if="showCommandMenu" class="cmd-menu" @click.stop>
                            <button class="cmd-menu-item cmd-ai-event" :disabled="isStreaming" @click="emit('generate-director-event'); showCommandMenu = false;">
                                <span>🎬</span><span>AI 盲盒事件</span>
                            </button>
                            <div class="cmd-menu-divider"></div>
                            <button class="cmd-menu-item" @click="toggleEventPanel(); showCommandMenu = false;">
                                <span>🌍</span><span>手动事件</span>
                            </button>
                            <button class="cmd-menu-item" @click="toggleWhisperPanel(); showCommandMenu = false;">
                                <span>🤫</span><span>悄悄话</span>
                            </button>
                            <button class="cmd-menu-item" @click="toggleRelationshipPanel(); showCommandMenu = false;">
                                <span>📊</span><span>关系雷达</span>
                            </button>
                            <div class="cmd-menu-divider"></div>
                            <button v-for="p in participants" :key="p.id"
                                    class="cmd-menu-item" @click="$emit('speak-as-role', p.id); showCommandMenu = false;">
                                <span class="cmd-role-dot" :style="{ background: getRoleColor(p.id) }"></span>
                                <span>让 {{ p.name }} 说</span>
                            </button>
                        </div>
                    </Transition>
                </div>
                <div class="flex-1 relative">
                    <textarea ref="inputRef" v-model="directorInput"
                        @keydown.enter.exact.prevent="handleSend"
                        @input="onInputChange"
                        :disabled="isStreaming"
                        placeholder="以导演身份发言（输入 @ 点名角色）..."
                        rows="1"
                        class="w-full glass-light bg-glass-light text-gray-100 rounded-2xl px-4 py-3 resize-none input-focus outline-none border border-white/10 focus:border-primary transition max-h-32 overflow-y-auto text-shadow-light group-chat-input"
                        style="min-height: 48px;"></textarea>
                </div>
                <button type="submit" :disabled="!directorInput.trim() || isStreaming"
                        class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        v-if="!isStreaming" title="发送导演消息">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                    </svg>
                </button>
                <button type="button" @click="$emit('stop-generation')"
                        class="send-btn w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center transition flex-shrink-0"
                        v-if="isStreaming" title="停止生成">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                    </svg>
                </button>
            </form>

        </div>
    </footer>
</template>

<style scoped>
/* 世界事件消息 */
.world-event-message {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08));
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 20px;
    padding: 8px 18px;
    color: #6ee7b7;
    font-size: 0.85rem;
    max-width: 90%;
    font-style: italic;
    animation: worldEventFadeIn 0.4s ease;
}

.world-event-icon {
    font-size: 1rem;
    font-style: normal;
}

@keyframes worldEventFadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}

/* 事件预设按钮 */
.event-preset-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.15s ease;
    cursor: pointer;
}

.event-preset-btn:hover {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
}

/* 悄悄话消息 */
.whisper-message {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, rgba(147, 51, 234, 0.12), rgba(109, 40, 217, 0.08));
    border: 1px dashed rgba(147, 51, 234, 0.35);
    border-radius: 20px;
    padding: 8px 18px;
    color: #c4b5fd;
    font-size: 0.8rem;
    max-width: 90%;
    animation: whisperFadeIn 0.3s ease;
}

.whisper-icon {
    font-size: 1rem;
}

@keyframes whisperFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
}

/* 悄悄话角色选择按钮 */
.whisper-role-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.15s ease;
    cursor: pointer;
}

.whisper-role-btn:hover {
    background: rgba(147, 51, 234, 0.1);
    border-color: rgba(147, 51, 234, 0.3);
}

.whisper-role-btn.active {
    background: rgba(147, 51, 234, 0.2);
    border-color: rgba(147, 51, 234, 0.5);
    color: #c4b5fd;
}

/* 导演消息 */
.director-message {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.08));
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 20px;
    padding: 8px 18px;
    color: #fcd34d;
    font-size: 0.9rem;
    max-width: 85%;
    transition: all 0.2s ease;
}

.director-label {
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.8;
    white-space: nowrap;
}

/* 群聊气泡 */
.group-speech-bubble {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 2px solid rgba(99, 102, 241, 0.25);
    padding: 12px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
}

.group-speech-bubble:hover {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.group-speech-bubble.selected {
    border-color: rgba(129, 140, 248, 0.3);
    box-shadow: 0 0 12px rgba(129, 140, 248, 0.1);
}

/* Only the latest message gets the full glow */
.group-speech-bubble.latest-bubble {
    border-left-width: 3px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), -4px 0 16px -4px var(--glow-color, rgba(99, 102, 241, 0.2));
    animation: bubble-glow-in 0.6s ease forwards;
}

@keyframes bubble-glow-in {
    from {
        border-left-width: 2px;
        opacity: 0.7;
    }
    to {
        border-left-width: 3px;
        opacity: 1;
    }
}

/* 消息操作工具栏 */
.message-wrapper {
    position: relative;
    animation: msg-slide-in 0.3s ease;
}

@keyframes msg-slide-in {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.message-toolbar {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.25s ease, opacity 0.2s ease, margin 0.25s ease;
    margin-top: 0;
}

.message-toolbar.active {
    max-height: 50px;
    opacity: 1;
    margin-top: 6px;
}

.toolbar-inner {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.65);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.15s ease;
    cursor: pointer;
}

.toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: white;
}

.toolbar-btn.delete:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
}


/* PASS 折叠组 */
.pass-group-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.35);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
}

.pass-group-bar:hover {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.55);
    border-color: rgba(255, 255, 255, 0.18);
}

.pass-group-icon {
    font-size: 0.85rem;
}

.pass-group-detail {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    animation: passDetailFadeIn 0.2s ease;
}

@keyframes passDetailFadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}

.pass-detail-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
}

/* 编辑消息容器 */
.edit-message-container {
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 16px;
    padding: 12px 16px;
}

/* ============== Command Menu & FAB ============== */
.cmd-menu-wrapper {
    position: relative;
}
.cmd-menu-trigger {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
}
.cmd-menu-trigger:hover, .cmd-menu-trigger.active {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.4);
}
.cmd-menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    min-width: 160px;
    max-height: 280px;
    overflow-y: auto;
    background: rgba(20, 20, 35, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
    z-index: 60;
}
.cmd-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 14px;
    border-radius: 8px;
    border: none;
    background: none;
    color: rgba(220, 220, 240, 0.85);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s ease;
}
.cmd-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
}
.cmd-menu-item.cmd-ai-event {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(234, 88, 12, 0.1));
    color: #fbbf24;
    font-weight: 600;
}
.cmd-menu-item.cmd-ai-event:hover {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(234, 88, 12, 0.18));
}
.cmd-menu-item.cmd-ai-event:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.cmd-menu-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 4px 10px;
}
.cmd-role-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}
.group-fab {
    position: absolute;
    right: 16px;
    bottom: 76px;
    padding: 10px 20px;
    border-radius: 24px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 10;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.45), 0 0 40px rgba(139, 92, 246, 0.15);
    letter-spacing: 0.5px;
}
.group-fab:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 28px rgba(99, 102, 241, 0.6), 0 0 50px rgba(139, 92, 246, 0.25);
}
.group-fab:active {
    transform: scale(0.95);
}
/* Upward pop animation */
.cmd-pop-enter-active, .cmd-pop-leave-active {
    transition: all 0.2s ease;
}
.cmd-pop-enter-from, .cmd-pop-leave-to {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
}
.fab-enter-active, .fab-leave-active {
    transition: all 0.25s ease;
}
.fab-enter-from, .fab-leave-to {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
}

.group-action-label {
    font-size: 0.75rem;
    font-weight: 500;
}

/* 群聊输入框 - prevent iOS zoom */
.group-chat-input {
    font-size: 16px;
}
</style>
