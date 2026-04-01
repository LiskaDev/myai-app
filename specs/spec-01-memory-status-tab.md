# 规格书 01：记忆状态 Tab

## 目标
在设置弹窗（SettingsModal.vue）中新增一个 **"🧠 记忆状态"** tab，
让用户能一眼看到各记忆系统的健康状况，不再是黑盒。

---

## 位置
文件：`myai-app/src/components/SettingsModal.vue`

设置弹窗已有多个 tab（通用设置、角色设置、记忆、时间线等）。
在现有 tab 列表末尾追加一个新 tab，tab key 命名为 `memory-status`。

---

## 展示的数据

从 `props.currentRole`（当前角色对象）中读取以下字段：

### 1. 章节摘要状态
- 数据来源：`currentRole.chapterSummaries`（数组）
- 展示：已归档章节数、最新一章的创建时间（`chapterSummaries.slice(-1)[0]?.createdAt`）
- 格式：`共 N 章 · 最近归档：YYYY-MM-DD HH:mm`
- 无数据时：`暂无归档`

### 2. 认知卡状态
- 数据来源：`currentRole.memoryCard`（对象）
- 展示：最后更新时间（`memoryCard.updatedAt`）、已记录事件数（`memoryCard.keyEvents?.length`）
- 格式：`已记录 N 条关键事件 · 更新于 YYYY-MM-DD HH:mm`
- 无数据时：`尚未生成`

### 3. 时间线状态
- 数据来源：`currentRole.timeline`（数组）、`currentRole.timelineAnalyzedCount`（数字）
- 展示：事件总数、已分析消息数
- 格式：`共 N 条事件 · 已分析 N 条消息`
- 无数据时：`尚未生成`

### 4. 关键词记忆（原"向量记忆"）
- 数据来源：`currentRole.vectorMemories`（数组）
- 展示：已存储记忆条数
- 格式：`共 N 条关键词记忆`
- 无数据时：`尚未生成`

### 5. 用户画像
- 数据来源：从 `localStorage` 读取 `myai_user_persona_v1`（JSON），取 `traits` 数组长度和 `lastAnalyzedAt`
- 展示：已提取特征数、最后分析时间
- 格式：`共 N 条用户特征 · 分析于 YYYY-MM-DD HH:mm`
- 无数据时：`尚未分析`

---

## UI 样式要求

参考同文件中现有的"时间线"tab 样式（已有类似的列表卡片样式），保持风格一致。

每条记忆系统用一个小卡片展示：
```
┌─────────────────────────────────────┐
│ 📚 章节摘要                    ✅   │
│ 共 3 章 · 最近归档：2024-03-15 22:30 │
└─────────────────────────────────────┘
```

状态图标规则：
- 有数据且不超过 7 天未更新 → `✅`
- 有数据但超过 7 天未更新 → `⚠️`
- 无数据 → `⭕`（灰色，表示尚未生成）

---

## 时间格式化
使用以下工具函数（在组件内定义）：
```js
function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
```

---

## 不需要做的事
- 不需要在这个 tab 里提供任何操作按钮（只读展示）
- 不需要修改任何后台逻辑
- 不需要改其他文件

---

## 验收标准
1. 切换到该 tab 能看到 5 个记忆系统的状态卡片
2. 有数据时显示具体信息，无数据时显示"尚未生成"
3. 样式与现有 tab 风格一致，不破坏现有布局
