/**
 * 🧪 useChat.js 单元测试
 * 测试发送锁、超时、状态管理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, reactive } from 'vue';

// 模拟 appState
function createMockAppState() {
    return {
        globalSettings: reactive({
            apiKey: 'test-api-key',
            baseUrl: 'https://api.test.com',
            model: 'test-model',
            responseLength: 'normal',
        }),
        currentRole: ref({
            id: 'role-1',
            name: 'Test Role',
            systemPrompt: 'You are a test assistant',
            temperature: 1.0,
            maxTokens: 2000,
            memoryWindow: 10,
        }),
        messages: ref([]),
        userInput: ref(''),
        isStreaming: ref(false),
        isThinking: ref(false),
        abortController: ref(null),
        showToast: vi.fn(),
        saveData: vi.fn(), // 🛡️ 添加 saveData mock
    };
}

describe('useChat - 发送锁机制', () => {
    it('不应该在 isStreaming 时发送消息', async () => {
        const appState = createMockAppState();
        appState.isStreaming.value = true;
        appState.userInput.value = 'test message';

        // 动态导入以确保每次测试都是新实例
        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        // 不应该添加新消息
        expect(appState.messages.value.length).toBe(0);
    });

    it('应该在空输入时不发送', async () => {
        const appState = createMockAppState();
        appState.userInput.value = '';

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        expect(appState.messages.value.length).toBe(0);
    });

    it('应该在空格输入时不发送', async () => {
        const appState = createMockAppState();
        appState.userInput.value = '   ';

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        expect(appState.messages.value.length).toBe(0);
    });

    it('没有 API Key 时应该显示错误', async () => {
        const appState = createMockAppState();
        appState.globalSettings.apiKey = '';
        appState.userInput.value = 'test';

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        expect(appState.showToast).toHaveBeenCalledWith(
            expect.stringContaining('API Key'),
            'error',
            expect.anything()
        );
    });
});

describe('useChat - 消息处理', () => {
    beforeEach(() => {
        // 重置 fetch mock
        global.fetch = vi.fn();
    });

    it('发送消息后应该添加用户消息', async () => {
        const appState = createMockAppState();
        appState.userInput.value = 'Hello AI';

        // Mock fetch 返回错误以快速结束
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        // 应该添加用户消息
        expect(appState.messages.value.length).toBeGreaterThanOrEqual(1);
        expect(appState.messages.value[0].role).toBe('user');
        expect(appState.messages.value[0].content).toBe('Hello AI');
    });

    it('发送后应该清空输入框', async () => {
        const appState = createMockAppState();
        appState.userInput.value = 'Test message';

        global.fetch = vi.fn().mockRejectedValue(new Error('Test'));

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        expect(appState.userInput.value).toBe('');
    });

    it('网络错误应该显示错误提示', async () => {
        const appState = createMockAppState();
        appState.userInput.value = 'Test';

        global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

        const { useChat } = await import('../src/composables/useChat');
        const { sendMessage } = useChat(appState);

        await sendMessage();

        expect(appState.showToast).toHaveBeenCalledWith(
            expect.stringContaining('Network failed'),
            'error'
        );
    });
});

describe('useChat - 停止生成', () => {
    it('stopGeneration 在无活动请求时不应崩溃', async () => {
        const appState = createMockAppState();
        appState.isStreaming.value = true;

        const { useChat } = await import('../src/composables/useChat');
        const { stopGeneration } = useChat(appState);

        // 没有 abortController 时调用不应崩溃
        expect(() => stopGeneration()).not.toThrow();
        expect(appState.isStreaming.value).toBe(false);
    });
});

describe('useChat - 消息删除', () => {
    it('应该删除指定索引的消息', async () => {
        const appState = createMockAppState();
        appState.messages.value = [
            { role: 'user', content: 'msg1' },
            { role: 'assistant', content: 'resp1' },
            { role: 'user', content: 'msg2' },
        ];

        const { useChat } = await import('../src/composables/useChat');
        const { deleteMessage } = useChat(appState);

        deleteMessage(1);

        expect(appState.messages.value.length).toBe(2);
        expect(appState.messages.value[1].content).toBe('msg2');
    });

    it('无效索引不应该崩溃', async () => {
        const appState = createMockAppState();
        appState.messages.value = [{ role: 'user', content: 'msg1' }];

        const { useChat } = await import('../src/composables/useChat');
        const { deleteMessage } = useChat(appState);

        // 不应该抛出错误
        expect(() => deleteMessage(-1)).not.toThrow();
        expect(() => deleteMessage(999)).not.toThrow();
        expect(appState.messages.value.length).toBe(1);
    });
});
