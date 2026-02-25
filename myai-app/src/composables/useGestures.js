import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 移动端手势组合式函数
 * - 左右滑动：打开/关闭侧边栏
 * - 长按消息：弹出操作菜单
 */
export function useGestures({ onSwipeRight, onSwipeLeft }) {
    const SWIPE_THRESHOLD = 60;  // 最小滑动距离 (px)
    const SWIPE_MAX_Y = 80;      // 垂直偏移超过此值视为滚动而非滑动
    const EDGE_ZONE = 40;        // 从屏幕左边缘多少px内开始的滑动才触发

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    function handleTouchStart(e) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        isSwiping = true;
    }

    function handleTouchEnd(e) {
        if (!isSwiping) return;
        isSwiping = false;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = Math.abs(touch.clientY - touchStartY);

        // 如果垂直偏移太大，说明是在滚动，忽略
        if (deltaY > SWIPE_MAX_Y) return;

        // 右滑打开侧边栏（仅从左边缘开始）
        if (deltaX > SWIPE_THRESHOLD && touchStartX < EDGE_ZONE) {
            onSwipeRight?.();
            return;
        }

        // 左滑关闭侧边栏
        if (deltaX < -SWIPE_THRESHOLD) {
            onSwipeLeft?.();
        }
    }

    onMounted(() => {
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
    });

    onUnmounted(() => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchend', handleTouchEnd);
    });
}

/**
 * 长按手势 Hook
 * 返回绑定到元素上的事件处理器
 */
export function useLongPress(callback, { delay = 500 } = {}) {
    let timer = null;
    let didLongPress = false;

    function onTouchStart(e, ...args) {
        didLongPress = false;
        timer = setTimeout(() => {
            didLongPress = true;
            // 触觉反馈（如果浏览器支持）
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
            callback(e, ...args);
        }, delay);
    }

    function onTouchEnd() {
        clearTimeout(timer);
        timer = null;
    }

    function onTouchMove(e) {
        // 手指移动了就取消长按
        clearTimeout(timer);
        timer = null;
    }

    // 长按后阻止 click 事件
    function shouldPreventClick() {
        return didLongPress;
    }

    return {
        onTouchStart,
        onTouchEnd,
        onTouchMove,
        shouldPreventClick,
    };
}
