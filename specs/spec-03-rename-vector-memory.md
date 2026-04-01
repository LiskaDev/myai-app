# 规格书 03：关键词记忆改名

## 目标
将 UI 中所有"向量记忆"/"语义搜索"相关字样改为准确的名称，
避免误导用户期望真正的向量/语义搜索能力。

---

## 背景
当前代码中的"向量记忆"实际是 **n-gram 关键词匹配**（2-4 字片段重合度评分），
不是真正的向量嵌入或语义搜索。名称会让用户误解其能力。

---

## 需要修改的文件和位置

### 1. `myai-app/src/utils/storage.js`
第 54 行附近：
```js
enableVectorMemory: false,
```
**不改变量名**（改变量名会影响已有用户数据），只改 UI 显示用的地方。

### 2. `myai-app/src/components/SettingsModal.vue`
搜索以下关键词，找到对应的显示文字并替换：
- `向量记忆` → `关键词记忆`
- `语义搜索` → `关键词检索`
- `启用向量记忆` → `启用关键词记忆`
- `向量记忆检索` → `关键词记忆检索`

### 3. `myai-app/src/components/SettingsModal.vue` 中的说明文字
如果有对该功能的描述文字，替换为：
> 基于关键词匹配，自动检索与当前对话相关的历史记忆片段注入上下文。

### 4. `myai-app/src/composables/promptModules/contextAssembler.js`
第 42 行附近的注释：
```js
content: `[相关历史记忆 — 以下是与当前对话语义相关的重要历史事件，可作为背景参考]
```
改为：
```js
content: `[相关历史记忆 — 以下是与当前对话关键词匹配的历史事件，可作为背景参考]
```

---

## 不需要改的地方
- 所有变量名（`enableVectorMemory`、`vectorMemories`、`vectorMemoryBlocks` 等）保持不变
- 后端逻辑不变
- localStorage key 不变（改了会导致已有用户数据丢失）

---

## 验收标准
1. 设置界面中不再出现"向量"或"语义搜索"字样
2. 功能本身完全不变（只是改显示文字）
3. 代码中的变量名、localStorage key 不受影响
