/**
 * useSoundEffects.js — UI 音效管理
 * 
 * 预加载所有音效，统一管理播放、音量、静音。
 * 遵循浏览器"第一击"规则：只有在用户交互后才能播放。
 */
import { ref, watch } from 'vue';

// 音效文件映射
const SOUNDS = {
    send: '/sounds/send.mp3',   // 发送消息
    notify: '/sounds/notify.mp3', // AI 回复完成
    pop: '/sounds/pop.mp3',    // 菜单弹出
    click: '/sounds/click.mp3',  // 按钮点击
    event: '/sounds/event.mp3',  // 世界事件
};

// 预加载的 Audio 对象缓存
const audioCache = {};
let audioUnlocked = false;

/**
 * 预加载所有音效到内存
 */
function preloadAll() {
    for (const [key, src] of Object.entries(SOUNDS)) {
        try {
            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.volume = 0.2;
            audioCache[key] = audio;
        } catch (e) {
            console.warn(`[Sound] Failed to preload ${key}:`, e);
        }
    }
}

/**
 * 浏览器"第一击"解锁：在首次用户交互时播放静音来解锁音频
 */
function unlockAudio() {
    if (audioUnlocked) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
    // 移除监听器
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
}

export function useSoundEffects(globalSettings) {
    const isMuted = ref(false);

    // 初始化
    preloadAll();

    // 注册"第一击"解锁
    document.addEventListener('click', unlockAudio, { once: false });
    document.addEventListener('touchstart', unlockAudio, { once: false });

    // 从 globalSettings 同步静音状态
    if (globalSettings) {
        isMuted.value = globalSettings.soundMuted ?? false;
        watch(() => globalSettings.soundMuted, (v) => {
            isMuted.value = v ?? false;
        });
    }

    /**
     * 播放指定音效
     * @param {'send'|'notify'|'pop'|'click'|'event'} name
     * @param {number} volumeOverride - 可选的音量覆盖 (0-1)
     */
    function play(name, volumeOverride) {
        if (isMuted.value) return;

        const cached = audioCache[name];
        if (!cached) return;

        // 全局音量（默认 0.2）
        const baseVolume = globalSettings?.soundVolume ?? 0.2;
        const volume = volumeOverride ?? baseVolume;

        try {
            // 克隆播放，避免快速连续触发时音频冲突
            const audio = cached.cloneNode();
            audio.volume = Math.max(0, Math.min(1, volume));
            audio.play().catch(() => { /* 浏览器阻止了自动播放，静默失败 */ });
        } catch (e) {
            // 静默失败
        }
    }

    /**
     * 切换静音
     */
    function toggleMute() {
        isMuted.value = !isMuted.value;
        if (globalSettings) {
            globalSettings.soundMuted = isMuted.value;
        }
    }

    return {
        play,
        isMuted,
        toggleMute,
    };
}
