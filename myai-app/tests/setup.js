/**
 * 测试环境设置
 * 在每个测试文件运行前执行
 */

// 模拟 localStorage
const localStorageMock = {
    store: {},
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => {
        localStorageMock.store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
        delete localStorageMock.store[key];
    }),
    clear: vi.fn(() => {
        localStorageMock.store = {};
    }),
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// 模拟 speechSynthesis
Object.defineProperty(window, 'speechSynthesis', {
    value: {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
    },
});

// 模拟 AbortSignal.timeout (Node < 17 可能没有)
if (!AbortSignal.timeout) {
    AbortSignal.timeout = (ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    };
}

// 模拟 AbortSignal.any (部分环境可能没有)
if (!AbortSignal.any) {
    AbortSignal.any = (signals) => {
        const controller = new AbortController();
        for (const signal of signals) {
            if (signal.aborted) {
                controller.abort(signal.reason);
                break;
            }
            signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        }
        return controller.signal;
    };
}

// 模拟 fetch
global.fetch = vi.fn();

// 清理函数 - 每个测试后重置
beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
});
