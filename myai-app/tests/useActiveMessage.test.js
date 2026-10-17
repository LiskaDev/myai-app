import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { isAutoDiaryEnabled, useActiveMessage } from '../src/composables/useActiveMessage.js';

function makeAppState(autoDiaryEnabled) {
    const role = {
        id: 'role-1',
        name: '泉水',
        systemPrompt: '温柔但有一点嘴硬。',
    };

    return {
        currentRole: ref(role),
        messages: ref([{ role: 'user', content: '明天见。' }]),
        globalSettings: {
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
            model: 'test-model',
            ...(typeof autoDiaryEnabled === 'boolean' && { autoDiaryEnabled }),
        },
        showToast: vi.fn(),
        saveData: vi.fn(),
    };
}

function makeDiary() {
    return {
        generateAbsenceDiary: vi.fn().mockResolvedValue({ id: 'diary-1' }),
        getDiariesForRole: vi.fn().mockReturnValue([
            { id: 'diary-1', content: '很想念你。', read: false },
        ]),
    };
}

function prepareReturnVisit() {
    localStorage.setItem('myai_lastVisitTime', String(Date.now() - 9 * 60 * 60 * 1000));
    fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '你终于回来了。' } }],
        }),
    });
}

describe('自动私密日记开关', () => {
    it('旧角色没有开关字段时应该默认开启', () => {
        expect(isAutoDiaryEnabled({})).toBe(true);
    });

    it('关闭后不应生成思念日记或发送日记提醒', async () => {
        prepareReturnVisit();
        const appState = makeAppState(false);
        const diary = makeDiary();

        const sent = await useActiveMessage(appState).checkAndSend(diary);

        expect(sent).toBe(true);
        expect(diary.generateAbsenceDiary).not.toHaveBeenCalled();
        expect(diary.getDiariesForRole).not.toHaveBeenCalled();
        expect(appState.messages.value.at(-1).content).toBe('你终于回来了。');
        expect(appState.messages.value.at(-1).content).not.toContain('📔');
    });

    it('开启时应该保持原有的自动思念日记流程', async () => {
        prepareReturnVisit();
        const appState = makeAppState(true);
        const diary = makeDiary();

        await useActiveMessage(appState).checkAndSend(diary);

        expect(diary.generateAbsenceDiary).toHaveBeenCalledTimes(1);
        expect(appState.messages.value.at(-1).content).toContain('📔');
    });

    it('本地模拟参数无需等待即可触发 9 小时回访', async () => {
        window.history.replaceState({}, '', '/?simulateDiaryReturn=1');
        const appState = makeAppState(true);
        const diary = makeDiary();

        try {
            await useActiveMessage(appState).checkAndSend(diary);
            expect(diary.generateAbsenceDiary).toHaveBeenCalledTimes(1);
        } finally {
            window.history.replaceState({}, '', '/');
        }
    });
});
