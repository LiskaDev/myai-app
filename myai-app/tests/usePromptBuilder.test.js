/**
 * 🧪 usePromptBuilder.js 单元测试
 * 测试 prompt 构建逻辑：框架注入、角色深度字段、记忆窗口
 */

import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';

// Mock summary module
vi.mock('../src/utils/summary', () => ({
    formatSummaryForPrompt: (s) => `[摘要] ${s}`,
}));

function createMockAppState(overrides = {}) {
    return {
        currentRole: ref({
            name: 'Test Role',
            systemPrompt: 'You are a test character',
            styleGuide: '',
            worldLogic: '',
            appearance: '',
            speakingStyle: '',
            relationship: '',
            secret: '',
            storySummary: '',
            autoSummary: '',
            manualMemories: [],
            memoryWindow: 10,
            ...overrides,
        }),
        messages: ref([]),
    };
}

describe('usePromptBuilder - constructPrompt', () => {
    it('应该始终包含 ROLEPLAY FRAMEWORK', async () => {
        const appState = createMockAppState();
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();

        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('ROLEPLAY FRAMEWORK');
        expect(messages[0].content).toContain('Test Role');
    });

    it('应该注入角色的 systemPrompt', async () => {
        const appState = createMockAppState({ systemPrompt: '你是一个尖酸刻薄的人' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const systemPromptMsg = messages.find(m => m.content.includes('尖酸刻薄'));
        expect(systemPromptMsg).toBeDefined();
    });

    it('空 systemPrompt 不应该生成额外的 system 消息', async () => {
        const appState = createMockAppState({ systemPrompt: '' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        // ROLEPLAY FRAMEWORK + WRITING_STYLE_BASE + [当前状态]（始终注入，含默认值）
        expect(messages.length).toBe(3);
    });

    it('应该注入 styleGuide', async () => {
        const appState = createMockAppState({ styleGuide: '禁止打破第四面墙' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const styleMsg = messages.find(m => m.content.includes('风格指导'));
        expect(styleMsg).toBeDefined();
        expect(styleMsg.content).toContain('禁止打破第四面墙');
    });

    it('应该注入所有角色深度字段', async () => {
        const appState = createMockAppState({
            worldLogic: '现代都市',
            appearance: '黑发红眼',
            speakingStyle: '傲娇口吻',
            relationship: '青梅竹马',
            secret: '其实暗恋对方',
        });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const allContent = messages.map(m => m.content).join('\n');

        expect(allContent).toContain('WorldSetting');
        expect(allContent).toContain('现代都市');
        expect(allContent).toContain('Appearance');
        expect(allContent).toContain('黑发红眼');
        expect(allContent).toContain('Style');
        expect(allContent).toContain('傲娇口吻');
        expect(allContent).toContain('Relationship');
        expect(allContent).toContain('青梅竹马');
        expect(allContent).toContain('Secret');
        expect(allContent).toContain('暗恋对方');
    });

    it('应该注入摘要内容', async () => {
        const appState = createMockAppState({ storySummary: '昨天一起去了咖啡厅' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const summaryMsg = messages.find(m => m.content.includes('昨天一起去了咖啡厅'));
        expect(summaryMsg).toBeDefined();
    });

    it('应该注入手动记忆', async () => {
        const appState = createMockAppState({
            manualMemories: [
                { role: 'user', content: '我叫小明' },
                { role: 'assistant', content: '我记得你的名字' },
            ],
        });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const memoryMsg = messages.find(m => m.content.includes('重要记忆'));
        expect(memoryMsg).toBeDefined();
        expect(memoryMsg.content).toContain('小明');
    });

    it('应该尊重 memoryWindow 限制', async () => {
        const appState = createMockAppState({ memoryWindow: 3 });
        // 添加 5 条消息
        appState.messages.value = [
            { role: 'user', content: 'msg1' },
            { role: 'assistant', content: 'resp1' },
            { role: 'user', content: 'msg2' },
            { role: 'assistant', content: 'resp2' },
            { role: 'user', content: 'msg3' },
        ];

        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        // 只应包含最后 3 条对话消息
        const chatMessages = messages.filter(m => m.content === 'msg2' || m.content === 'resp2' || m.content === 'msg3');
        expect(chatMessages.length).toBe(3);
        // 不应包含最早的消息
        const hasOld = messages.some(m => m.content === 'msg1');
        expect(hasOld).toBe(false);
    });

    it('应该过滤掉 day-separator 和非标准 role 消息', async () => {
        const appState = createMockAppState({ memoryWindow: 10 });
        appState.messages.value = [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好呀' },
            { role: 'system', type: 'day-separator', content: '─── 第 2 天 ───' },
            { role: 'user', content: '新的一天开始了' },
            { role: 'director', content: '导演指令' },
            { role: 'pass', content: '' },
            { role: 'whisper', content: '悄悄话' },
            { role: 'assistant', content: '早上好' },
        ];

        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();

        // day-separator 不应出现
        const hasSeparator = messages.some(m => m.type === 'day-separator' || (m.content && m.content.includes('第 2 天')));
        expect(hasSeparator).toBe(false);

        // 非标准 role（director/pass/whisper）不应出现
        const hasNonStandard = messages.some(m => ['director', 'pass', 'whisper'].includes(m.role));
        expect(hasNonStandard).toBe(false);

        // 标准的 user/assistant 消息应该存在
        const hasUser = messages.some(m => m.content === '你好');
        const hasAssistant = messages.some(m => m.content === '早上好');
        expect(hasUser).toBe(true);
        expect(hasAssistant).toBe(true);
    });

    // v6.1: 写作风格系统测试
    it('应该注入写作风格模板指令（adventure）', async () => {
        const appState = createMockAppState({ writingStyle: 'adventure' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const styleMsg = messages.find(m => m.content.includes('WRITING STYLE DIRECTIVE'));
        expect(styleMsg).toBeDefined();
        expect(styleMsg.content).toContain('ACTION/ADVENTURE');
    });

    it('空 writingStyle 不应注入风格模板', async () => {
        const appState = createMockAppState({ writingStyle: '' });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const styleMsg = messages.find(m => m.content.includes('WRITING STYLE DIRECTIVE'));
        expect(styleMsg).toBeUndefined();
    });

    it('应该注入动态风格指令', async () => {
        const appState = createMockAppState({
            styleDirectives: ['多用短句，快节奏', '增加感官描写'],
        });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const directiveMsg = messages.find(m => m.content.includes('写作风格偏好'));
        expect(directiveMsg).toBeDefined();
        expect(directiveMsg.content).toContain('多用短句');
        expect(directiveMsg.content).toContain('增加感官描写');
    });

    it('空 styleDirectives 不应注入指令', async () => {
        const appState = createMockAppState({ styleDirectives: [] });
        const { usePromptBuilder } = await import('../src/composables/usePromptBuilder');
        const { constructPrompt } = usePromptBuilder(appState);

        const messages = constructPrompt();
        const directiveMsg = messages.find(m => m.content.includes('写作风格偏好'));
        expect(directiveMsg).toBeUndefined();
    });
});
