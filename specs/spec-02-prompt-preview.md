# 规格书 02：Prompt 预览面板

## 目标
在设置弹窗中新增一个 **"🔍 Prompt 预览"** 按钮（或 tab），
让用户能看到当前发送给 AI 的完整系统 prompt，用于调试和理解。

---

## 位置
文件：`myai-app/src/components/SettingsModal.vue`

在"记忆状态"tab（spec-01）旁边再加一个 tab，key 命名为 `prompt-preview`。

---

## 核心逻辑

### 如何获取 prompt 内容
`SettingsModal.vue` 已经通过 props 接收了 `currentRole`、`globalSettings` 等数据。
但 `constructPrompt()` 是异步函数，需要从父组件传入。

**方案：通过 emit 触发父组件获取**

1. 在 SettingsModal 加一个 emit：`emit('request-prompt-preview')`
2. 在 `App.vue` 监听该 emit，调用 `chatFunctions.constructPrompt()`，
   将结果通过 props 传回给 SettingsModal（新增 prop `promptPreviewData`）
3. SettingsModal 用 `promptPreviewData` 渲染

### promptPreviewData 的结构
`constructPrompt()` 返回一个 `apiMessages` 数组，每项格式：
```js
{ role: 'system' | 'user' | 'assistant', content: '...' }
```

---

## UI 展示

切换到该 tab 时，显示一个"生成预览"按钮。
点击后触发 emit，获取数据，渲染如下：

```
┌──────────────────────────────────────────┐
│ [system] 🔴 核心框架                     │
│ You are a creative writing collaborator… │
│ （折叠，点击展开完整内容）                 │
├──────────────────────────────────────────┤
│ [system] 🟡 写作质量基础                  │
│ [WRITING QUALITY — BASE RULES]…          │
├──────────────────────────────────────────┤
│ [user] 用户消息 #1                        │
│ 你好                                      │
└──────────────────────────────────────────┘
```

每个消息块：
- 标题行：`[role] 前N字内容预览`（最多 40 字）
- 点击标题展开/折叠完整内容
- 底部显示：`共 N 条消息 · 估算约 N tokens（字符数 ÷ 2）`

### token 估算公式
```js
const totalChars = apiMessages.reduce((s, m) => s + m.content.length, 0);
const estimatedTokens = Math.round(totalChars / 2); // 中英混合粗估
```

---

## 角色颜色
- `system` → 蓝色标签
- `user` → 绿色标签  
- `assistant` → 灰色标签

---

## App.vue 需要的修改

1. 在 `<SettingsModal>` 上加 `@request-prompt-preview="handlePromptPreview"`
2. 新增响应式变量：`const promptPreviewData = ref(null)`
3. 新增函数：
```js
async function handlePromptPreview() {
  try {
    promptPreviewData.value = await chatFunctions.constructPrompt();
  } catch (e) {
    showToast('获取 Prompt 失败', 'error');
  }
}
```
4. 将 `promptPreviewData` 作为 prop 传给 SettingsModal：
   `:prompt-preview-data="promptPreviewData"`

---

## 不需要做的事
- 不需要修改 `constructPrompt()` 函数本身
- 不需要持久化预览结果
- 不需要实时更新（点一次生成一次即可）

---

## 验收标准
1. 点击"生成预览"按钮后，能看到当前 prompt 的所有消息块
2. 每块可折叠/展开
3. 底部显示 token 估算
4. 切换角色后再次点击能获取新角色的 prompt
