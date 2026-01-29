/**
 * 🧪 边缘问题验证脚本
 * 在浏览器控制台运行这些代码来验证问题的存在
 * 
 * 使用方法：npm run dev 后，打开控制台粘贴运行
 */

// ========================================
// 🔴 问题1: 疯狂点击者 - 验证代码
// ========================================
// 运行此代码前，确保输入框有内容

console.log('=== 测试1: 疯狂点击发送按钮 ===');
console.log('步骤：');
console.log('1. 在输入框输入任意内容');
console.log('2. 在控制台运行以下代码：');
console.log(`
// 模拟快速点击50次
let clickCount = 0;
const form = document.querySelector('form');
const originalSubmitCount = window.__submitCount || 0;
window.__submitCount = 0;

// 劫持 fetch 来计数实际请求
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0]?.includes?.('chat/completions') || args[0]?.includes?.('deepseek')) {
    window.__submitCount++;
    console.log('🚨 API 请求 #' + window.__submitCount);
  }
  return originalFetch.apply(this, args);
};

// 疯狂点击
for (let i = 0; i < 50; i++) {
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  clickCount++;
}

setTimeout(() => {
  console.log('点击次数:', clickCount);
  console.log('实际 API 请求数:', window.__submitCount);
  console.log(window.__submitCount > 1 ? '❌ 漏洞存在！多次请求被发出' : '✅ 防护正常');
  window.fetch = originalFetch; // 恢复
}, 1000);
`);

// ========================================
// 🔴 问题2: 网络超时 - 验证思路
// ========================================
console.log('\n=== 测试2: 网络超时 ===');
console.log('步骤：');
console.log('1. 打开 DevTools → Network');
console.log('2. 点击 "Offline" 模拟断网');
console.log('3. 发送一条消息');
console.log('4. 观察界面是否永久卡在 "正在输入..."');
console.log('5. 30秒后切回 Online');
console.log('预期问题：没有超时机制，界面永久卡死');

// ========================================
// 🟡 问题3: 双标签冲突 - 验证代码
// ========================================
console.log('\n=== 测试3: 双标签数据冲突 ===');
console.log('步骤：');
console.log('1. 复制当前页面 URL，打开两个标签页');
console.log('2. 在标签页A修改角色名为 "测试A"，保存');
console.log('3. 在标签页B（不刷新）修改角色名为 "测试B"，保存');
console.log('4. 刷新两个页面，查看角色名');
console.log('预期问题：A的修改被B覆盖，或数据不一致');

// ========================================
// 🟡 问题4: 超长输入 - 验证代码
// ========================================
console.log('\n=== 测试4: 超长角色名 ===');
console.log(`
// 生成10000个emoji的字符串
const longName = '😀'.repeat(10000);
console.log('字符串长度:', longName.length);
console.log('字节大小:', new Blob([longName]).size, 'bytes');

// 尝试保存到 localStorage
try {
  const testKey = 'test_long_name';
  localStorage.setItem(testKey, longName);
  console.log('✅ localStorage 可以保存');
  localStorage.removeItem(testKey);
} catch (e) {
  console.log('❌ localStorage 爆炸:', e.message);
}
`);

console.log('\n🎯 运行以上测试后，你就能亲眼看到问题是否存在');
