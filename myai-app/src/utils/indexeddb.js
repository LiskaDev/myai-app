/**
 * indexeddb.js — IndexedDB 读写工具
 *
 * 数据库：myai_db_v1，版本 1
 * 对象仓库：kv（通用键值，keyPath='k'）
 *   记录格式：{ k: 'key_name', v: <any JS value> }
 */

const DB_NAME = 'myai_db_v1';
const DB_VERSION = 1;
const STORE = 'kv';

let _db = null;

function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'k' });
            }
        };

        req.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };

        req.onerror = () => reject(req.error);
    });
}

/** 读取单个 key 的值，不存在时返回 null */
export async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.v : null);
        req.onerror = () => reject(req.error);
    });
}

/** 写入或覆盖一个 key */
export async function idbPut(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        // Vue reactive 对象是 Proxy，IDB structured clone 可能失败；
        // 先 JSON 序列化剥离 Proxy，得到纯 JS 对象再写入
        let plain;
        try {
            plain = JSON.parse(JSON.stringify(value));
        } catch {
            plain = value; // 极端兜底：直接尝试写入
        }
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put({ k: key, v: plain });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/** 删除一个 key */
export async function idbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/** 清空整个 IDB 数据库（删库，供"清除所有数据"使用） */
export async function idbClearAll() {
    if (_db) {
        _db.close();
        _db = null;
    }
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
            console.warn('[IDB] deleteDatabase blocked，5s 后强制继续');
            // 其他标签页持有连接时挂起；5s 超时后强制 resolve，避免 UI 卡死
            setTimeout(() => resolve(), 5000);
        };
    });
}

/**
 * 一次性迁移：把 localStorage 里的指定 keys 复制到 IDB，然后打上迁移标记。
 * 已迁移过则直接返回 false（不重复执行）。
 * localStorage 原始数据保留作为临时备份，不删除。
 */
export async function migrateFromLocalStorage(keys) {
    const MIGRATION_FLAG = 'myai_idb_migrated_v1';
    if (localStorage.getItem(MIGRATION_FLAG)) return false;

    for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            await idbPut(key, parsed);
        } catch {
            // 单条数据损坏时跳过，不中断整体迁移
        }
    }

    localStorage.setItem(MIGRATION_FLAG, '1');
    return true;
}
