import { describe, it, expect } from 'vitest';
import {
    DEEPSEEK_VISION_MODEL,
    MAX_SOURCE_IMAGE_BYTES,
    modelSupportsImages,
    validateImageFile,
} from '../src/utils/imageAttachment.js';

describe('图片附件模型与文件校验', () => {
    it('只对 DeepSeek 实验视觉模型启用图片', () => {
        expect(modelSupportsImages(DEEPSEEK_VISION_MODEL)).toBe(true);
        expect(modelSupportsImages(DEEPSEEK_VISION_MODEL.toUpperCase())).toBe(true);
        expect(modelSupportsImages('deepseek-v4-flash')).toBe(false);
        expect(modelSupportsImages('')).toBe(false);
    });

    it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('应该接受 %s', (type) => {
        expect(validateImageFile({ type, size: 1024 })).toBeNull();
    });

    it('应该拒绝不支持的格式和超大文件', () => {
        expect(validateImageFile({ type: 'image/svg+xml', size: 1024 })).toContain('仅支持');
        expect(validateImageFile({ type: 'image/png', size: MAX_SOURCE_IMAGE_BYTES + 1 })).toContain('12 MB');
        expect(validateImageFile({ type: 'image/gif', size: 5 * 1024 * 1024 })).toContain('4 MB');
    });
});
