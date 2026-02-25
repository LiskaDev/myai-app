// TTS 语音合成组合式函数
export function useTTS(appState) {
    const {
        currentRole,
        ttsState,
        availableVoices,
        globalSettings,
        showToast,
    } = appState;

    // 加载可用语音
    function loadVoices() {
        if (!window.speechSynthesis) return;

        const voices = window.speechSynthesis.getVoices();
        availableVoices.value = voices.filter(v =>
            v.lang.startsWith('zh') || v.lang.startsWith('en')
        );
    }

    // 去除思考标签
    function stripThinkingTags(text) {
        if (!text) return '';
        return text
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<inner>[\s\S]*?<\/inner>/g, '')
            .replace(/<think>[\s\S]*/g, '')
            .trim();
    }

    // 播放 TTS
    function playTTS(index, content) {
        if (!window.speechSynthesis) {
            showToast('您的浏览器不支持语音合成', 'error');
            return;
        }

        // 如果正在播放，则停止
        if (ttsState.playingIndex === index) {
            stopTTS();
            return;
        }

        // 停止之前的播放
        stopTTS();

        const cleanContent = stripThinkingTags(content);
        if (!cleanContent) {
            showToast('没有可朗读的内容', 'error');
            return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanContent);

        // 设置语音
        const roleTTSVoice = currentRole.value.ttsVoice;
        if (roleTTSVoice && availableVoices.value.length > 0) {
            const voice = availableVoices.value.find(v => v.name === roleTTSVoice);
            if (voice) {
                utterance.voice = voice;
            }
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onend = () => {
            ttsState.playingIndex = null;
            ttsState.utterance = null;
        };

        utterance.onerror = (event) => {
            ttsState.playingIndex = null;
            ttsState.utterance = null;
            if (event.error !== 'canceled') {
                showToast('语音播放出错', 'error');
            }
        };

        ttsState.utterance = utterance;
        ttsState.playingIndex = index;
        window.speechSynthesis.speak(utterance);
    }

    // 停止 TTS
    function stopTTS() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        ttsState.playingIndex = null;
        ttsState.utterance = null;
    }

    // 自动播放 TTS
    function autoPlayTTSIfEnabled(content) {
        if (globalSettings.autoPlayTTS && content) {
            setTimeout(() => {
                const lastIndex = appState.messages.value.length - 1;
                if (lastIndex >= 0) {
                    playTTS(lastIndex, content);
                }
            }, 100);
        }
    }

    return {
        loadVoices,
        playTTS,
        stopTTS,
        autoPlayTTSIfEnabled,
    };
}
