/**
 * 聊天图片附件工具。
 * 图片在浏览器本地缩放并转为 Data URL，随后随角色消息一起保存到 IndexedDB。
 */

// DeepSeek V4.1 folds the retired experimental Vision route into deepseek-flash.
export const DEEPSEEK_VISION_MODEL = 'deepseek-flash';
export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const MAX_IMAGE_DIMENSION = 1280;
const MAX_GIF_BYTES = 4 * 1024 * 1024;

export function modelSupportsImages(modelId = '') {
    return modelId.trim().toLowerCase() === DEEPSEEK_VISION_MODEL;
}
export function validateImageFile(file) {
    if (!file) return '没有选择图片';
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        return '仅支持 JPG、PNG、WebP 或 GIF 图片';
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
        return '单张图片不能超过 12 MB';
    }
    if (file.type === 'image/gif' && file.size > MAX_GIF_BYTES) {
        return 'GIF 图片不能超过 4 MB';
    }
    return null;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('无法解析这张图片'));
        image.src = dataUrl;
    });
}

function estimateDataUrlBytes(dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    return Math.ceil(base64.length * 0.75);
}

function createAttachmentId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 普通图片缩放到最长边 1280px 并转 WebP；GIF 保留原文件以免破坏动画。
 */
export async function prepareImageAttachment(file) {
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    const sourceDataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(sourceDataUrl);

    if (file.type === 'image/gif') {
        return {
            id: createAttachmentId(),
            name: file.name || 'image.gif',
            mimeType: file.type,
            dataUrl: sourceDataUrl,
            width: image.naturalWidth,
            height: image.naturalHeight,
            size: file.size,
        };
    }

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片');
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/webp', 0.86);
    canvas.width = 1;
    canvas.height = 1;
    if (!dataUrl || dataUrl === 'data:,') throw new Error('压缩图片失败');

    const mimeType = dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/webp';
    return {
        id: createAttachmentId(),
        name: file.name || 'image',
        mimeType,
        dataUrl,
        width,
        height,
        size: estimateDataUrlBytes(dataUrl),
    };
}
