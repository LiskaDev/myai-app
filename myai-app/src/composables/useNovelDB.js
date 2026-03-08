/**
 * useNovelDB.js — IndexedDB 异步封装
 * 存储小说模式的 messages，避免 localStorage 5MB 上限
 *
 * Key 结构: novel_messages_{bookId}_{slotIndex}
 * DB: myai_novel_db / store: messages
 */

const DB_NAME = 'myai_novel_db';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

/**
 * 打开（或初始化）IndexedDB — 模块级缓存，只初始化一次
 */
function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.error('[useNovelDB] IndexedDB open failed:', request.error);
            dbPromise = null; // 失败后允许重试
            reject(request.error);
        };
    });

    return dbPromise;
}

/**
 * 构建存储 key
 */
function makeKey(bookId, slotIndex) {
    return `novel_messages_${bookId}_${slotIndex}`;
}

/**
 * 保存 messages 到 IndexedDB
 * @param {string} bookId
 * @param {number} slotIndex
 * @param {Array} messages
 */
export async function saveNovelMessages(bookId, slotIndex, messages) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(JSON.parse(JSON.stringify(messages)), makeKey(bookId, slotIndex));
            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                console.error('[useNovelDB] save failed:', tx.error);
                reject(tx.error);
            };
        });
    } catch (err) {
        console.error('[useNovelDB] saveNovelMessages error:', err);
    }
}

/**
 * 从 IndexedDB 加载 messages
 * @param {string} bookId
 * @param {number} slotIndex
 * @returns {Promise<Array>} 不存在时返回空数组
 */
export async function loadNovelMessages(bookId, slotIndex) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(makeKey(bookId, slotIndex));
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                console.error('[useNovelDB] load failed:', request.error);
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[useNovelDB] loadNovelMessages error:', err);
        return [];
    }
}

/**
 * 删除单个存档的 messages
 * @param {string} bookId
 * @param {number} slotIndex
 */
export async function deleteNovelMessages(bookId, slotIndex) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(makeKey(bookId, slotIndex));
            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                console.error('[useNovelDB] delete failed:', tx.error);
                reject(tx.error);
            };
        });
    } catch (err) {
        console.error('[useNovelDB] deleteNovelMessages error:', err);
    }
}

/**
 * 删除一本书的所有存档 messages（slots 0-3）
 * @param {string} bookId
 */
export async function deleteAllBookMessages(bookId) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (let i = 0; i < 4; i++) {
                store.delete(makeKey(bookId, i));
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                console.error('[useNovelDB] deleteAll failed:', tx.error);
                reject(tx.error);
            };
        });
    } catch (err) {
        console.error('[useNovelDB] deleteAllBookMessages error:', err);
    }
}
