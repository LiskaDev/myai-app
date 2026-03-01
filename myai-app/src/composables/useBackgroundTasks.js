import { ref, computed } from 'vue';

/**
 * 🔍 后台任务追踪器（单例）
 * 用于让用户知道后台正在进行哪些 API 调用、消耗了多少 token
 */
let _instance = null;

export function useBackgroundTasks() {
    if (_instance) return _instance;

    const activeTasks = ref([]);           // 当前激活的后台任务 { id, name }
    const totalBgTokens = ref(0);          // 本次会话累计后台 token
    let _taskIdCounter = 0;

    const isActive = computed(() => activeTasks.value.length > 0);
    const taskNames = computed(() => activeTasks.value.map(t => t.name).join('、'));

    /**
     * 注册一个后台任务
     * @param {string} name  任务名称，如 '自动摘要'、'用户画像'
     * @returns {{ done: Function, fail: Function, addTokens: Function }}
     */
    function trackTask(name) {
        const id = ++_taskIdCounter;
        activeTasks.value.push({ id, name });

        function remove() {
            activeTasks.value = activeTasks.value.filter(t => t.id !== id);
        }

        return {
            done: remove,
            fail: remove,
            addTokens(count) {
                if (count > 0) totalBgTokens.value += count;
            },
        };
    }

    _instance = {
        activeTasks,
        totalBgTokens,
        isActive,
        taskNames,
        trackTask,
    };

    return _instance;
}
