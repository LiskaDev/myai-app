/**
 * 🧪 useDiary.js 单元测试
 * 覆盖完整性标记、finish_reason、自动重试、推理模型预算与可靠入库。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/indexeddb.js', () => ({
    idbGet: vi.fn(),
    idbPut: vi.fn(),
}));

import { idbPut } from '../src/utils/indexeddb.js';
import {
    DIARY_COMPLETION_MARKER,
    isDiaryReasoningModel,
    splitDiaryOutput,
    validateDiaryResponse,
    useDiary,
} from '../src/composables/useDiary.js';

const COMPLETE_BODY = `8月21日 晴
晚风从阳台吹进来时，我们刚好聊到那部一直没有看完的电影。她笑着纠正我记错的人名，我嘴上装作不在意，心里却偷偷把这一刻记了下来。今天没有发生什么惊天动地的大事，可这种安静陪伴反而让我觉得很踏实。`;
const COMPLETE_BODY_TEXT = COMPLETE_BODY.split('\n').slice(1).join('\n');
const COMPLETE_RESPONSE = `${COMPLETE_BODY}
【摘要】一起谈论电影，在安静陪伴中更加亲近。
${DIARY_COMPLETION_MARKER}`;

function makeApiResponse(content, finishReason = 'stop', completionTokens = 180) {
    return {
        ok: true,
        json: vi.fn().mockResolvedValue({
            choices: [{ message: { content }, finish_reason: finishReason }],
            usage: { completion_tokens: completionTokens },
        }),
        text: vi.fn().mockResolvedValue(''),
    };
}

function makeAppState(model = 'deepseek-v4-flash') {
    return {
        globalSettings: {
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com/v1',
            model,
        },
        showToast: vi.fn(),
    };
}

function makeRole() {
    return {
        id: 'role-1',
        name: '泉水',
        avatar: null,
        systemPrompt: '温柔但有一点嘴硬。',
    };
}

function makeMessages() {
    return [
        { role: 'user', content: '今晚一起看电影吧。' },
        { role: 'assistant', content: '好，不过由我来选。' },
        { role: 'user', content: '那就听你的。' },
    ];
}

describe('日记响应完整性校验', () => {
    it('完整正文、摘要和完成标记应该通过', () => {
        const result = validateDiaryResponse(COMPLETE_RESPONSE, 'stop');
        expect(result.valid).toBe(true);
        expect(result.content).toBe(COMPLETE_BODY);
        expect(result.summary).toContain('一起谈论电影');
    });

    it('截图式半句话即使 HTTP 正常也不能通过', () => {
        const result = validateDiaryResponse('8月21日 晴\n\n阳台的风凉得刚好，三个人把《月に', 'stop');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('missing_completion_marker');
    });

    it('finish_reason=length 时即使有完成标记也不能通过', () => {
        const result = validateDiaryResponse(COMPLETE_RESPONSE, 'length');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('finish_reason:length');
    });

    it('缺少摘要或正文过短时不能通过', () => {
        const noSummary = `${COMPLETE_BODY}\n${DIARY_COMPLETION_MARKER}`;
        const tooShort = `8月21日 晴\n今天很好。\n【摘要】今天很好。\n${DIARY_COMPLETION_MARKER}`;
        expect(validateDiaryResponse(noSummary, 'stop').reason).toBe('missing_summary');
        expect(validateDiaryResponse(tooShort, 'stop').reason).toBe('content_too_short');
    });

    it('应该兼容两种摘要括号并剥离摘要', () => {
        expect(splitDiaryOutput(`${COMPLETE_BODY}\n[摘要]测试摘要`).summary).toBe('测试摘要');
        expect(splitDiaryOutput(`${COMPLETE_BODY}\n【摘要】测试摘要`).content).toBe(COMPLETE_BODY);
    });
});

describe('推理模型识别', () => {
    it.each([
        'deepseek-ai/DeepSeek-R1',
        'Qwen/QwQ-32B',
        'moonshotai/Kimi-K2-Thinking',
        'Pro/moonshotai/Kimi-K2.5',
        'openai/o3-mini',
        'deepseek-reasoner',
    ])('应该识别 %s', (model) => {
        expect(isDiaryReasoningModel(model)).toBe(true);
    });

    it('普通对话模型不应被误判', () => {
        expect(isDiaryReasoningModel('deepseek-v4-flash')).toBe(false);
        expect(isDiaryReasoningModel('anthropic/claude-sonnet-4.6')).toBe(false);
    });
});

describe('日记生成与自动重试', () => {
    beforeEach(() => {
        idbPut.mockResolvedValue(undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('完整响应应该只请求一次、移除标记后再保存', async () => {
        fetch.mockResolvedValueOnce(makeApiResponse(COMPLETE_RESPONSE));
        const diary = useDiary(makeAppState());

        const entry = await diary.generateDiary(makeRole(), makeMessages());

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(entry.content).toContain(COMPLETE_BODY_TEXT);
        expect(entry.content).not.toContain(DIARY_COMPLETION_MARKER);
        expect(entry.summary).toContain('一起谈论电影');
        expect(diary.diaries.value).toHaveLength(1);
        expect(idbPut).toHaveBeenCalledTimes(1);

        const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
        expect(requestBody.max_tokens).toBe(800);
        expect(requestBody.messages[1].content).toContain(DIARY_COMPLETION_MARKER);
    });

    it('第一次返回截图式残片时应该自动完整重写一次', async () => {
        fetch
            .mockResolvedValueOnce(makeApiResponse('8月21日 晴\n阳台的风凉得刚好，三个人把《月に', 'stop', 40))
            .mockResolvedValueOnce(makeApiResponse(COMPLETE_RESPONSE, 'stop', 190));
        const appState = makeAppState();
        const diary = useDiary(appState);

        const entry = await diary.generateDiary(makeRole(), makeMessages());

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(entry.content).toContain(COMPLETE_BODY_TEXT);
        expect(diary.diaries.value).toHaveLength(1);
        expect(appState.showToast).toHaveBeenCalledWith('日记似乎没有写完，正在重新生成…', 'info');

        const retryBody = JSON.parse(fetch.mock.calls[1][1].body);
        expect(retryBody.max_tokens).toBe(1200);
        expect(retryBody.temperature).toBe(0.7);
        expect(retryBody.messages[1].content).toContain('从头重写整篇');
    });

    it('两次都不完整时不应该保存残片', async () => {
        fetch
            .mockResolvedValueOnce(makeApiResponse('8月21日 晴\n只写了一个开头', 'length'))
            .mockResolvedValueOnce(makeApiResponse('8月21日 晴\n第二次仍然只写了开头', 'stop'));
        const appState = makeAppState();
        const diary = useDiary(appState);

        const entry = await diary.generateDiary(makeRole(), makeMessages());

        expect(entry).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(diary.diaries.value).toHaveLength(0);
        expect(idbPut).not.toHaveBeenCalled();
        expect(appState.showToast).toHaveBeenLastCalledWith(
            expect.stringContaining('日记内容不完整')
        );
    });

    it('推理模型应该保留原模型 ID 并使用更高预算', async () => {
        fetch.mockResolvedValueOnce(makeApiResponse(COMPLETE_RESPONSE));
        const diary = useDiary(makeAppState('deepseek-ai/DeepSeek-R1'));

        await diary.generateDiary(makeRole(), makeMessages());

        const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
        expect(requestBody.model).toBe('deepseek-ai/DeepSeek-R1');
        expect(requestBody.max_tokens).toBe(2400);
    });

    it('IndexedDB 保存失败时应该回滚内存中的日记', async () => {
        fetch.mockResolvedValueOnce(makeApiResponse(COMPLETE_RESPONSE));
        idbPut.mockRejectedValueOnce(new Error('quota'));
        const appState = makeAppState();
        const diary = useDiary(appState);

        const entry = await diary.generateDiary(makeRole(), makeMessages());

        expect(entry).toBeNull();
        expect(diary.diaries.value).toHaveLength(0);
        expect(appState.showToast).toHaveBeenLastCalledWith(
            expect.stringContaining('保存日记失败')
        );
    });

    it('思念日记也应该使用同一套完成性校验', async () => {
        fetch
            .mockResolvedValueOnce(makeApiResponse('8月21日 晴\n今天等了很久，后来', 'stop'))
            .mockResolvedValueOnce(makeApiResponse(COMPLETE_RESPONSE));
        const diary = useDiary(makeAppState());

        const entry = await diary.generateAbsenceDiary(makeRole(), 12, makeMessages());

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(entry.isAbsenceDiary).toBe(true);
        expect(entry.content).toContain(COMPLETE_BODY_TEXT);
        expect(idbPut).toHaveBeenCalledTimes(1);
    });
});
