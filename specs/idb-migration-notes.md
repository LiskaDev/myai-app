# IndexedDB 迁移说明（给 AI 助手的技术交接文档）

本文档描述从 localStorage 迁移到 IndexedDB 之后的架构变化，
供后续 AI 检查、调试、扩展时参考。

---

## 一、迁移范围

### 已迁移到 IndexedDB

| 数据 | 旧 localStorage key | 新位置 |
|------|---------------------|--------|
| 全局设置 | `myai_global_v1` | IDB: `myai_db_v1` → store `kv` → key `myai_global_v1` |
| 角色列表（含聊天记录）| `myai_roles_v1` | IDB: `myai_db_v1` → store `kv` → key `myai_roles_v1` |

### 仍在 localStorage（小型辅助数据）

| 数据 | key |
|------|-----|
| 群聊 | `myai_groups_v1` |
| 会话状态（当前角色 ID）| `myai_session_v1` |
| 日记 | `myai_diaries_v1` |
| 用户画像 | `myai_user_persona_v1` |
| 世界书（每角色一条）| `myai_worldbook_<roleId>` |
| 小说书库 | `myai_bookList_v1` |
| 新手引导标记 | `myai_onboarding_done` |
| **迁移完成标记** | `myai_idb_migrated_v1` |

---

## 二、迁移机制

首次启动时，`loadFromStorage()` 调用 `migrateFromLocalStorage()`：
- 读取 localStorage 里的旧 GLOBAL 和 ROLES 数据
- 写入 IDB
- 在 localStorage 写入 `myai_idb_migrated_v1 = '1'`，后续不再重复迁移
- **不删除** localStorage 旧数据（保留作临时备份）

如果需要强制重新迁移：删除 `myai_idb_migrated_v1` 这个 localStorage key。

---

## 三、关键 API 变化

### `saveToStorage()` — 变为异步

```js
// 之前（同步）
const success = saveToStorage(globalSettings, roleList, onError);

// 之后（异步，返回 Promise<boolean>）
const success = await saveToStorage(globalSettings, roleList, onError);
```

**注意**：`saveData()` 在 `useAppState.js` 中封装为 fire-and-forget，
外部调用 `saveData()` **无需修改**（签名仍是同步的，内部处理异步）。

### `loadFromStorage()` — 变为异步

```js
// 之后
const { globalSettings, roleList, error } = await loadFromStorage(onError);
```

`loadData()` 在 `useAppState.js` 中已改为 `async function`，
在 `App.vue` 的 `onMounted` 里用 `await loadData()` 调用。

### `retrieveRelevantMemories()` — 签名变化

```js
// 之前（读 localStorage）
await retrieveRelevantMemories(characterId, currentMessage)

// 之后（接收 memories 数组，同步）
retrieveRelevantMemories(role.vectorMemories || [], currentMessage)
```

调用方：`usePromptBuilder.js` 已更新。

---

## 四、调试方式

### 查看 IDB 数据
Chrome DevTools → Application → IndexedDB → `myai_db_v1` → `kv`

可以看到两条记录：
- `{ k: 'myai_global_v1', v: {...设置对象} }`
- `{ k: 'myai_roles_v1', v: [...角色数组] }`

### 验证迁移是否执行
DevTools → Application → Local Storage → 看是否有 `myai_idb_migrated_v1`

### 验证保存是否正常
发一条消息后，刷新 IDB 面板，检查 `myai_roles_v1` 里的聊天记录是否更新。

---

## 五、存储用量面板（Settings 里的进度条）

迁移后，进度条只统计 localStorage 的剩余辅助数据（群聊、日记等），
**不反映 IDB 里的角色/设置数据**。进度条会显示接近 0 — 这是正确的，
IDB 没有固定容量上限，不需要监控。

此面板的 "5 MB" 上限标注已过时，可在未来版本中移除或改为"IDB 无上限"说明。

---

## 六、多标签页同步

迁移前：通过 `window.addEventListener('storage', ...)` 监听 localStorage 事件实现多标签同步。

迁移后：IDB 不触发 storage 事件，**多标签页同步功能已停用**。
如需恢复，需要使用 `BroadcastChannel` API。当前 `storageListener` 已设为 `null`。

---

## 七、注意事项（给 AI 助手）

1. **不要再直接读写 `myai_roles_v1` 或 `myai_global_v1` 的 localStorage**
   - 这两个 key 在 IDB 迁移后 localStorage 里的版本是过期快照（迁移时的旧备份）
   - 所有角色数据通过 `appState.roleList`（内存响应式）或 `idbGet('myai_roles_v1')` 获取

2. **新增后台任务时不要读 localStorage 获取角色数据**
   - 参见 `retrieveRelevantMemories` 的修改方式：改为接收内存中的数据

3. **`saveData()` 是异步的，但调用时不需要 await**
   - 它是 fire-and-forget，下一条操作可以立即继续

4. **`loadData()` 必须 await**
   - 只在 App.vue onMounted 中调用一次，其他地方不应调用

5. **存储配额**
   - IDB 配额通常为磁盘空间的 50%（几 GB），实际上不会满
   - localStorage 仍有 5MB 限制，但剩余数据（群聊等）通常很小

---

## 八、可以安全删除的代码（未来清理）

- `storageUsage` 的 80%/60% 红黄警告逻辑（IDB 不需要）
- `cleanupStorageListener()` 函数（现在 listener 是 null，调用无副作用但没意义）
- GlobalSettings.vue 和 SettingsModal.vue 里的存储进度条组件（或改为 IDB 说明）
- localStorage 里的旧 `myai_roles_v1` / `myai_global_v1` 备份（可在迁移后某版本清除）
