# 角色卡面生成 · IDE Skill v2
> 给 IDE 里的 AI 使用。实现角色卡面系统的完整代码规范。

---

## 整体架构

卡面系统分为三个场景，每个场景用不同的卡：

| 场景 | 卡的类型 | 说明 |
|------|---------|------|
| 角色列表浏览 | 全息视差卡 | 鼠标跟随光效，用于侧边栏展示所有角色 |
| 新角色导入登场 | 封印揭示动画 | 光爆揭示，仅在首次导入时触发一次 |
| 导出 / 分享 | 风格展示卡 | 静态精美卡面，用于生成分享链接 |

三种卡各司其职，不互相替代。

---

## 一、全息视差卡（角色列表用）

### 效果描述
鼠标移入时卡片3D倾斜，彩虹棱镜光效跟随鼠标位置实时变化，光效角度由 JS 计算。鼠标离开后平滑复位。

### 核心 JS 逻辑

```javascript
card.addEventListener('mousemove', (e) => {
  const rect = card.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height

  // 3D 倾斜
  const rotateY = (x - 0.5) * 25
  const rotateX = (0.5 - y) * 15
  inner.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`

  // 棱镜光效角度跟随鼠标
  const angle = Math.atan2(y - 0.5, x - 0.5) * (180 / Math.PI) + 180
  prism.style.setProperty('--holo-angle', `${angle}deg`)
  shimmer.style.setProperty('--shimmer-angle', `${angle + 90}deg`)
})

card.addEventListener('mouseleave', () => {
  inner.style.transition = 'transform 0.6s cubic-bezier(0.2, 0, 0.2, 1)'
  inner.style.transform = 'rotateY(0deg) rotateX(0deg)'
  setTimeout(() => { inner.style.transition = 'transform 0.15s ease-out' }, 600)
})
```

### 关键 CSS

```css
.card-holo {
  perspective: 1200px;
  cursor: pointer;
}

.card-holo-inner {
  transform-style: preserve-3d;
  transition: transform 0.15s ease-out;
  will-change: transform;
}

/* 棱镜光层 */
.holo-prism {
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from var(--holo-angle, 0deg) at 50% 50%,
    rgba(255,60,120,0.12) 0deg,
    rgba(60,255,120,0.10) 90deg,
    rgba(60,180,255,0.12) 180deg,
    rgba(255,60,120,0.12) 360deg
  );
  mix-blend-mode: screen;
  opacity: 0.3;
  transition: opacity 0.3s;
  pointer-events: none;
}
.card-holo:hover .holo-prism { opacity: 0.8; }

/* 扫光层 */
.holo-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    var(--shimmer-angle, 105deg),
    transparent 30%,
    rgba(255,255,255,0.15) 50%,
    transparent 70%
  );
  mix-blend-mode: overlay;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.card-holo:hover .holo-shimmer { opacity: 1; }
```

### 注意事项
- `perspective` 必须设在外层容器，不能设在 inner 上
- `will-change: transform` 开启 GPU 加速，性能更好
- 列表里多张卡同时存在时，每张卡独立绑定事件，不共享状态

---

## 二、封印揭示动画（新角色导入登场用）

### 效果描述
导入新角色时，先显示封印面（魔法球 + 浮动符文），点击或自动触发后：
1. 封印面淡出消失
2. 光爆从中心爆开（径向渐变扩散）
3. 角色卡从缩小透明状态浮现

### 实现逻辑

```javascript
function revealCard() {
  seal.classList.add('hidden')        // 封印面消失
  burst.classList.add('active')       // 光爆
  setTimeout(() => {
    card.classList.add('revealed')    // 卡片浮现
  }, 300)
  setTimeout(() => {
    burst.classList.remove('active')  // 清理光爆
  }, 1000)
}
```

### 封印面 CSS 要点

```css
.mystic-seal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s, transform 0.3s;
}
.mystic-seal.hidden {
  opacity: 0;
  transform: scale(1.1);
  pointer-events: none;
}

/* 浮动符文 */
.seal-rune {
  position: absolute;
  animation: runeFloat 3s ease-in-out infinite var(--rune-delay);
}
@keyframes runeFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
  50% { transform: translateY(-10px) rotate(10deg); opacity: 0.8; }
}

/* 光爆 */
.mystic-burst {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle, rgba(180,140,255,0.9) 0%, transparent 70%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.mystic-burst.active {
  animation: burstAnim 0.8s ease-out forwards;
}
@keyframes burstAnim {
  0% { opacity: 0; transform: scale(0.5); }
  20% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.6); }
}

/* 卡片浮现 */
.mystic-card {
  opacity: 0;
  transform: scale(0.9) translateY(10px);
  transition: none;
}
.mystic-card.revealed {
  animation: cardReveal 0.7s cubic-bezier(0.2, 0, 0.2, 1) forwards;
}
@keyframes cardReveal {
  0% { opacity: 0; transform: scale(0.88) translateY(12px); }
  60% { opacity: 1; transform: scale(1.02) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
```

### 触发时机
- 用户通过链接导入角色时，**自动触发**，不需要点击
- 用户手动创建新角色时，**不触发**（直接显示卡片）
- 同一个角色只触发一次，之后正常显示

---

## 三、风格展示卡（导出分享用）

### 两层风格系统

风格分为**预设风格**和**自由创作风格**两类。

#### 预设风格（11种，代码已写好，直接渲染）

| styleId | 风格名 | 记忆点 | 配色基调 |
|---------|--------|--------|---------|
| `ink` | 国风水墨 | 宣纸质感 + 印章 | 米白 #f5efe0，墨色 #1a0a00 |
| `love` | 甜心恋爱 | 飘动爱心 + 粉色光晕 | 粉 #ff6eb0，浅玫瑰 #ffe4f0 |
| `dark` | 暗黑哥特 | 血滴 + 裂纹 | 深黑 #0d0005，暗红 #8b0000 |
| `cyber` | 赛博朋克 | 扫描线 + 切角 | 纯黑 #020815，荧光绿 #00ff9f |
| `adventure` | 冒险热血 | 火焰光晕 + 战痕 | 深褐 #1a0500，橙火 #ff6000 |
| `cozy` | 治愈日常 | 手写字体 + 纸张颗粒 | 米白 #fdfaf5，暖棕 #b49664 |
| `glitch` | 故障艺术 | RGB分离 + 横向撕裂 | 纯黑，白字，故障三色 |
| `film` | 老式胶片 | 齿孔 + 动态颗粒噪点 | 深棕 #1a1008，暖金 #c8a050 |
| `minimal` | 极简主义 | 轨道圆 + 顶部黑条 | 纸白 #fafafa，纯黑 |
| `aurora` | 液态极光 | 流体光团 + 玻璃面板 | 深夜蓝 #05050f，紫蓝绿渐变 |
| `scrap` | 手账剪贴 | 胶带 + 便利贴 + 撕边 | 米黄 #f5f0e8，牛皮棕 |

#### 自由创作风格（styleId = "custom"）

当 AI 判断角色气质不属于任何预设风格时，输出 `custom` 类型，前端动态渲染。

**自由创作的数据结构：**

```typescript
interface CustomStyle {
  styleId: "custom"
  custom: {
    bgColor: string          // 主背景色，深色优先
    bgGradient?: string      // 渐变方向和颜色，可选
    accentColor: string      // 强调色，用于边框/光晕/高亮文字
    secondaryColor?: string  // 辅助色，可选
    borderStyle: string      // 边框描述，如"细线单框""双线框""虚线""无边框"
    textureHint: string      // 背景纹理描述，如"细密点阵""斜向条纹""无纹理"
    fontStyle: string        // 字体风格，如"衬线体""等线体""手写体""粗黑体"
    cornerStyle: string      // 角落装饰，如"圆角""切角""尖角""无"
    animationHint: string    // 登场动画方向，如"从下浮起""从中心扩散""左右展开"
    glowEffect: boolean      // 是否有光晕效果
    glowColor?: string       // 光晕颜色
  }
}
```

**前端渲染 custom 风格的逻辑：**

```javascript
function renderCustomCard(cardData) {
  const { custom, character } = cardData
  const card = document.createElement('div')

  // 应用基础样式
  card.style.cssText = `
    background: ${custom.bgGradient
      ? `linear-gradient(${custom.bgGradient})`
      : custom.bgColor};
    border: 1px solid ${custom.accentColor}40;
    ${custom.glowEffect
      ? `box-shadow: 0 8px 40px ${custom.glowColor || custom.accentColor}25`
      : ''};
    color: #fff;
    border-radius: ${custom.cornerStyle === '切角' ? '4px' : '16px'};
  `

  // 字体
  const fontMap = {
    '衬线体': "'Noto Serif SC', serif",
    '等线体': "'Share Tech Mono', monospace",
    '手写体': "'Caveat', cursive",
    '粗黑体': "'Cinzel', serif",
  }
  card.style.fontFamily = fontMap[custom.fontStyle] || 'inherit'

  // 强调色变量
  card.style.setProperty('--accent', custom.accentColor)

  return card
}
```

---

## 四、数据结构

### CardData（完整角色卡数据）

```typescript
interface CardData {
  id: string
  version: "1.0"
  styleId: string                    // 预设风格ID 或 "custom"
  custom?: CustomStyle['custom']     // 仅 styleId 为 "custom" 时存在
  character: {
    name: string
    emoji: string
    avatarUrl?: string
    tag: string
    title: string
    desc: string
  }
  stats?: { label: string; value: string }[]
  roleData: {                        // 完整角色人设，导入后可直接聊天
    personality: string
    background: string
    speakingStyle: string
    systemPrompt: string
  }
  exportedAt: number
  authorNote?: string
}
```

---

## 五、分享链接规范

```javascript
// 导出
function exportCardToLink(cardData) {
  const json = JSON.stringify(cardData)
  const base64 = btoa(unescape(encodeURIComponent(json)))
  return `${location.origin}${location.pathname}#import=${base64}`
}

// 导入
function importCardFromLink() {
  const hash = location.hash
  if (!hash.startsWith('#import=')) return null
  try {
    const base64 = hash.replace('#import=', '')
    const json = decodeURIComponent(escape(atob(base64)))
    // 清除 URL hash，避免刷新重复触发
    history.replaceState(null, '', location.pathname)
    return JSON.parse(json)
  } catch {
    return null
  }
}

// App 初始化时检测
onMounted(() => {
  const imported = importCardFromLink()
  if (imported) showImportModal(imported)
})
```

---

## 六、导入弹窗规范

弹窗包含：
1. 卡片预览（带封印揭示动画，自动触发）
2. 角色名 + 作者留言（如果有）
3. "导入角色"主按钮 + "取消"次按钮
4. 导入后角色出现在侧边栏，自动切换

弹窗背景：`backdrop-filter: blur(8px)` + 半透明黑色遮罩

---

## 七、设计禁忌

- 单张卡面不超过 3 种动画效果
- 不超过 3 种主色（含黑白）
- 卡片宽度不超过 280px（移动端适配）
- custom 风格的 `bgColor` 必须是深色（亮度低于 50%），浅色背景用预设风格
- 封印揭示动画不可跳过
- 全息视差卡不用于导出，只用于列表展示
