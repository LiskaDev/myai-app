/**
 * 🧪 useGroupChat.js 单元测试
 * 测试群聊 prompt 构建、消息管理、悄悄话、世界事件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, reactive, computed } from 'vue';

// 创建模拟 appState
function createMockAppState() {
    const roleList = ref([
        {
            id: 'role-1',
            name: '毒舌姐姐',
            systemPrompt: '你是一个尖酸刻薄的角色，说话带刺',
            temperature: 1.0,
            maxTokens: 2000,
            memoryWindow: 15,
            avatar: '',
            styleGuide: '总是带着讽刺',
            appearance: '冷艳高挑',
            speakingStyle: '阴阳怪气',
        },
        {
            id: 'role-2',
            name: '温柔妹妹',
            systemPrompt: '你是一个温柔体贴的角色',
            temperature: 0.8,
            maxTokens: 1500,
            memoryWindow: 10,
            avatar: '',
            styleGuide: '',
            appearance: '',
            speakingStyle: '',
        },
    ]);

    return {
        roleList,
        currentRoleId: ref('role-1'),
        currentRole: ref(roleList.value[0]),
        globalSettings: reactive({
            apiKey: 'test-key',
            baseUrl: 'https://api.test.com',
            model: 'deepseek-chat',
        }),
        messages: ref([]),
        showToast: vi.fn(),
        showConfirmModal: vi.fn(),
        showSidebar: ref(false),
        saveData: vi.fn(),
    };
}

describe('useGroupChat - 群聊创建与管理', () => {
    it('应该创建群聊', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);

        expect(group).toBeDefined();
        expect(group.name).toBe('测试群');
        expect(group.participantIds).toEqual(['role-1', 'role-2']);
        expect(group.chatHistory).toEqual([]);
    });

    it('少于2个角色不应该创建群聊', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        const group = groupChat.createGroupChat('测试群', ['role-1']);

        expect(group).toBeNull();
        expect(appState.showToast).toHaveBeenCalledWith(
            expect.stringContaining('至少'),
            'error'
        );
    });
});

describe('useGroupChat - 导演消息', () => {
    it('应该添加导演消息到聊天历史', async () => {
        const appState = createMockAppState();
        // Mock fetch，防止真正调 API
        global.fetch = vi.fn().mockRejectedValue(new Error('mock'));

        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        // 创建并切换到群聊
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        // 发送导演消息（会触发 continueOneRound，但 fetch 会失败，不影响消息记录）
        groupChat.sendDirectorMessage('大家好');

        expect(groupChat.groupMessages.value.length).toBeGreaterThanOrEqual(1);
        expect(groupChat.groupMessages.value[0].role).toBe('director');
        expect(groupChat.groupMessages.value[0].content).toBe('大家好');
    });

    it('空消息不应该发送', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.sendDirectorMessage('   ');

        expect(groupChat.groupMessages.value.length).toBe(0);
    });
});

describe('useGroupChat - 世界事件注入', () => {
    it('应该注入世界事件', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.injectWorldEvent('突然下起了大雨');

        expect(groupChat.groupMessages.value.length).toBe(1);
        expect(groupChat.groupMessages.value[0].role).toBe('world-event');
        expect(groupChat.groupMessages.value[0].content).toBe('突然下起了大雨');
    });

    it('空事件不应该注入', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.injectWorldEvent('');

        expect(groupChat.groupMessages.value.length).toBe(0);
    });
});

describe('useGroupChat - 悄悄话', () => {
    it('应该发送悄悄话', async () => {
        const appState = createMockAppState();
        // Mock fetch 防止 speakAsRole 真正调 API
        global.fetch = vi.fn().mockRejectedValue(new Error('mock'));

        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.sendWhisper('role-1', '你知道她的秘密吗？');

        // 应该有悄悄话消息
        const whisperMsg = groupChat.groupMessages.value.find(m => m.role === 'whisper');
        expect(whisperMsg).toBeDefined();
        expect(whisperMsg.targetRoleId).toBe('role-1');
        expect(whisperMsg.content).toBe('你知道她的秘密吗？');
    });

    it('空内容的悄悄话不应该发送', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.sendWhisper('role-1', '');

        expect(groupChat.groupMessages.value.length).toBe(0);
    });
});

describe('useGroupChat - 消息管理', () => {
    it('应该删除指定消息', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        // 添加消息
        groupChat.injectWorldEvent('事件1');
        groupChat.injectWorldEvent('事件2');
        expect(groupChat.groupMessages.value.length).toBe(2);

        groupChat.deleteGroupMessage(0);
        expect(groupChat.groupMessages.value.length).toBe(1);
        expect(groupChat.groupMessages.value[0].content).toBe('事件2');
    });

    it('应该编辑消息', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.injectWorldEvent('原始事件');
        groupChat.editGroupMessage(0, '修改后的事件');

        expect(groupChat.groupMessages.value[0].content).toBe('修改后的事件');
    });
});

describe('useGroupChat - 群聊编辑', () => {
    it('应该更新群聊设置', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);

        groupChat.updateGroupChat(
            group.id,
            '新名字',
            ['role-1', 'role-2'],
            '新描述',
            'deepseek-reasoner',
            'long',
            '校园恋爱'
        );

        const updated = groupChat.groupChats.value.find(g => g.id === group.id);
        expect(updated.name).toBe('新名字');
        expect(updated.description).toBe('新描述');
        expect(updated.model).toBe('deepseek-reasoner');
        expect(updated.responseLength).toBe('long');
        expect(updated.genre).toBe('校园恋爱');
    });

    it('少于2角色不应该更新', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);
        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);

        groupChat.updateGroupChat(group.id, '新名字', ['role-1'], '', '', '', '');

        expect(appState.showToast).toHaveBeenCalledWith(
            expect.stringContaining('至少'),
            'error'
        );
    });
});

describe('useGroupChat - 停止生成', () => {
    it('stopGroupGeneration 不应该崩溃', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        expect(() => groupChat.stopGroupGeneration()).not.toThrow();
    });
});

describe('useGroupChat - v5.2 关系矩阵', () => {
    it('创建群聊时应初始化 relationshipMatrix', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);

        expect(group.relationshipMatrix).toBeDefined();
        expect(typeof group.relationshipMatrix).toBe('object');
        // 3 entities (role-1, role-2, director) × 2 = 6 pairs
        expect(Object.keys(group.relationshipMatrix).length).toBe(6);
        expect(group.relationshipMatrix['role-1→role-2']).toBe(0);
        expect(group.relationshipMatrix['role-1→director']).toBe(0);
    });

    it('updateAffinity 应正确更新好感度', async () => {
        const appState = createMockAppState();
        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);

        groupChat.updateAffinity('role-1', 'role-2', 75);

        expect(group.relationshipMatrix['role-1→role-2']).toBe(75);
    });

    it('更新群聊成员时应同步矩阵', async () => {
        const appState = createMockAppState();
        // 添加第三个角色
        appState.roleList.value.push({
            id: 'role-3', name: '新角色', systemPrompt: '', temperature: 1.0,
            maxTokens: 2000, memoryWindow: 15, avatar: '', styleGuide: '',
            appearance: '', speakingStyle: '',
        });

        const { useGroupChat } = await import('../src/composables/useGroupChat');
        const groupChat = useGroupChat(appState);

        const group = groupChat.createGroupChat('测试群', ['role-1', 'role-2']);
        groupChat.switchToGroup(group.id);
        groupChat.updateAffinity('role-1', 'role-2', 50);

        // 更新群聊：增加 role-3
        groupChat.switchToGroup(group.id);
        groupChat.updateGroupChat(group.id, '测试群', ['role-1', 'role-2', 'role-3'], '', '', 0, '');

        // 旧关系保留
        expect(group.relationshipMatrix['role-1→role-2']).toBe(50);
        // 新关系初始化
        expect(group.relationshipMatrix['role-1→role-3']).toBe(0);
        expect(group.relationshipMatrix['role-3→role-1']).toBe(0);
    });
});
