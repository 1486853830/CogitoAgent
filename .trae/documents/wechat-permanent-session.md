# 微信永久登录 + 专属会话方案

## 目标
1. 微信登录一次后永久保存（已实现：`data/wechat/wechat-state.json` 持久化登录态）
2. 有一个永久的"微信通道"专属会话（`getOrCreateWechatSession()` 已实现）
3. 点击"连接微信"按钮 → 自动连接（已登录则跳过扫码）+ 自动加载微信通道会话

## 当前状态分析

### 已完成
- `src/agent/session.js`：`getOrCreateWechatSession()` 已添加并导出（查找/创建名为"微信通道"的会话）
- `src/agent/tools/wechat.js`：`wechatState` 已包含 `wechatSessionId: null` 字段；`loginWechat()` 成功时保留 `wechatState.wechatSessionId`

### 未完成（本计划要做的）
- `wechat.js`：缺少 `setWechatSessionId(id)` 导出函数；`logoutWechat()` 会丢失 `wechatSessionId`（重置 state 时未保留）
- `wechat-manager.js`：连接时未创建/切换到微信会话；消息未路由到微信会话
- `renderer.js`：收到 `wechat-state` 时未自动加载微信会话

### 关键架构
- UI 切换会话：`renderer.switchToSession(id)` → IPC `switch-session` → agent `/switch id` → `session.switchSession(id)`
- Agent 当前会话：`session.js` 的 `currentSessionId`，`handleUserInput` 使用当前会话
- `initWechatChannel()` 在 `Agent.start()` 中自动调用（应用启动时），若已登录会自动连接轮询

## 实现步骤

### Step 1: wechat.js — 添加 setter + 修复 logout 丢字段
文件：`src/agent/tools/wechat.js`

**1a. 添加 `setWechatSessionId` 函数并导出**
```javascript
function setWechatSessionId(id) {
  wechatState.wechatSessionId = id;
  saveState();
}
```
在 export 块中加入 `setWechatSessionId`。

**1b. 修复 `logoutWechat()` 保留 `wechatSessionId`**
当前 `logoutWechat()` 重置 `wechatState` 时完全清空，导致 `wechatSessionId` 丢失。修改为保留：
```javascript
wechatState = {
  loggedIn: false,
  accountId: null,
  botToken: null,
  baseUrl: null,
  userId: null,
  polling: false,
  qrCodeUrl: null,
  sessionKey: null,
  wechatSessionId: wechatState.wechatSessionId  // 保留会话 ID
};
```

### Step 2: wechat-manager.js — 连接时切换到微信会话
文件：`src/agent/wechat-manager.js`

**2a. 新增 import**
```javascript
import { setWechatSessionId, wechatState } from './tools/wechat.js';
import { getOrCreateWechatSession, switchSession, getCurrentSession } from './session.js';
```
（`wechatState` 已在现有 import 中，只需加 `setWechatSessionId`；新增 session.js 的 import）

**2b. 新增辅助函数 `ensureWechatSession()`**
```javascript
function ensureWechatSession() {
  const sessionId = getOrCreateWechatSession();
  setWechatSessionId(sessionId);
  const current = getCurrentSession();
  if (!current || current.id !== sessionId) {
    switchSession(sessionId);
  }
  return sessionId;
}
```

**2c. 修改 `manualLoginWechat()` — 用户点击按钮时**
登录成功 + 轮询启动后：
- 调用 `ensureWechatSession()` 获取会话 ID
- 在 `wechat-state` 广播中加入 `sessionId`
```javascript
// 两次 broadcast 都加 sessionId
broadcast('wechat-state', {
  data: {
    connected: true,
    accountId: wechatState.accountId,
    polling: true,
    sessionId: ensureWechatSession()  // 切换会话并返回 ID
  }
});
```

**2d. 修改 `initWechatChannel()` — 启动时自动连接**
登录态有效时启动轮询，但**不切换会话、不广播 sessionId**（避免启动时强行切换 UI）：
```javascript
if (status.success && status.data.loggedIn) {
  // 仅确保 wechatSessionId 已设置（不切换当前会话）
  if (!wechatState.wechatSessionId) {
    const sid = getOrCreateWechatSession();
    setWechatSessionId(sid);
  }
  const result = await startWechatPolling(handleWechatMessage);
  // 广播不含 sessionId，前端只更新按钮状态
  broadcast('wechat-state', {
    data: { connected: true, accountId: status.data.accountId, polling: true }
  });
}
```

### Step 3: wechat-manager.js — 消息路由到微信会话
文件：`src/agent/wechat-manager.js`

修改 `handleWechatMessage()`：
- 若当前会话不是微信会话，切换 agent 会话 + 广播 `sessionId` 让前端跟随
- 不切回原会话（微信连接期间，微信通道就是活跃会话）

```javascript
async function handleWechatMessage(message) {
  const { from, text } = message;

  broadcast('wechat-message', {
    direction: 'received', from, text,
    timestamp: new Date().toISOString()
  });

  if (text.trim() === '/new') {
    WECHAT_SESSIONS.delete(from);
    return;
  }

  // 确保在微信会话中处理消息
  const current = getCurrentSession();
  const wechatSid = wechatState.wechatSessionId;
  if (wechatSid && (!current || current.id !== wechatSid)) {
    switchSession(wechatSid);
    // 通知前端切换 UI（会触发 switchToSession 加载历史）
    broadcast('wechat-state', {
      data: { connected: true, accountId: wechatState.accountId, polling: true, sessionId: wechatSid }
    });
  }

  let sessionData = WECHAT_SESSIONS.get(from);
  if (!sessionData) {
    sessionData = { messages: [], lastActive: Date.now() };
    WECHAT_SESSIONS.set(from, sessionData);
  }
  sessionData.messages.push({ role: 'user', content: text });
  sessionData.lastActive = Date.now();

  setReplyCallback(async (replyText) => {
    const result = await sendWechatMessage(from, replyText);
    if (result.success) {
      broadcast('wechat-message', {
        direction: 'sent', from, text: replyText,
        timestamp: new Date().toISOString()
      });
    }
  });

  const prompt = `[微信消息 来自 ${from}] ${text}`;
  handleUserInput(prompt);
}
```

### Step 4: renderer.js — 按钮变为永久会话入口
文件：`electron/dashboard/renderer.js`

**交互模型变更**：按钮不再是"连接/断开"toggle，而是：
- **未登录时**：显示"连接微信"，点击 → 扫码登录
- **已登录后**：按钮变成"微信通道"会话入口（永久），点击 → 确保连接 + 切换到微信专属会话
- **没有断开操作**（不再点击按钮取消连接）

**4a. 修改 `toggleWechat()` → `connectWechat()`**
```javascript
connectWechat() {
  // 始终调用登录（已登录则后端快速返回成功，跳过扫码）
  // 然后切换到微信会话
  window.electronAPI?.loginWechat();
}
```
移除 `if (this._wechatConnected) { logoutWechat() }` 分支。

**4b. 修改 `updateWechatState(state)`**
```javascript
updateWechatState(state) {
  this._wechatConnected = !!state.connected;
  const label = document.getElementById('wechatBtnLabel');
  const btn = document.getElementById('wechatBtn');
  if (!label || !btn) return;

  if (state.connected) {
    // 按钮变成"微信通道"会话入口
    label.textContent = '微信通道';
    btn.classList.add('wechat-connected');
    btn.title = '点击进入微信会话';
    const modal = document.getElementById('wechatQrModal');
    if (modal) modal.style.display = 'none';

    // 自动切换到微信会话（仅在 sessionId 存在且非当前会话时）
    if (state.sessionId && AppState.currentSessionId !== state.sessionId) {
      this.switchToSession(state.sessionId);
    }
  } else {
    label.textContent = '连接微信';
    btn.classList.remove('wechat-connected');
    btn.title = '连接微信';
  }
}
```

**4c. 在 `AppState` 添加 `currentSessionId` 追踪**
```javascript
const AppState = {
  isProcessing: false,
  isWaiting: false,
  currentAssistantBubble: null,
  lastToolKey: '',
  currentMode: 'work',
  view: 'welcome',
  currentSessionId: null,  // 新增：追踪当前会话
  // ...
};
```

**4d. 在 `switchToSession()` 中记录当前会话 ID**
在 `switchToSession` 方法末尾（加载历史后）添加：
```javascript
AppState.currentSessionId = sessionId;
```

**4e. 修改按钮点击绑定**
```javascript
if (btn.id === 'wechatBtn') {
  btn.addEventListener('click', () => {
    this.connectWechat();  // 原 toggleWechat 改名
  });
  return;
}
```

### Step 5: agent-bridge.js — 无需修改
`wechat-state` 消息已通过 `msg.data` 整体转发到渲染进程，`sessionId` 字段会自动包含在内。

### Step 6: preload.cjs — 无需修改
`onWechatState` 已传递整个 state 对象。

## 关键文件
| 文件 | 改动 |
|------|------|
| `src/agent/tools/wechat.js` | 添加 `setWechatSessionId`，修复 `logoutWechat` 保留 `wechatSessionId` |
| `src/agent/wechat-manager.js` | import session 函数；`manualLoginWechat` 切换会话+广播 sessionId；`initWechatChannel` 仅设置 sessionId 不切换；`handleWechatMessage` 路由到微信会话 |
| `electron/dashboard/renderer.js` | 按钮从 toggle 改为永久入口；`connectWechat` 替代 `toggleWechat`；`updateWechatState` 收到 sessionId 时切换会话；`AppState` 添加 `currentSessionId` 追踪 |
| `src/agent/session.js` | 无改动（`getOrCreateWechatSession` 已实现） |
| `electron/agent-bridge.js` | 无改动 |
| `electron/preload.cjs` | 无改动 |

## 设计决策
1. **按钮是永久入口，不是 toggle**：点击"连接微信"登录成功后，按钮变成"微信通道"会话入口。再次点击不会断开，而是确保连接 + 切换到微信会话。断开功能不在主按钮上（如需可放设置页）。
2. **`initWechatChannel` 不切换 UI**：启动时自动连接只更新按钮状态为"微信通道"，不强制跳转到微信会话（尊重用户上次会话选择）。微信会话 ID 仅保存到 wechatState 供后续消息路由使用。
3. **`handleWechatMessage` 不切回原会话**：微信连接期间，微信通道就是活跃会话。收到消息时若不在微信会话则切换过去（agent + UI 同步），避免消息污染其他会话。
4. **`switchToSession` 的 `isProcessing` 检查**：若 AI 正在思考，前端切换会被拦截（显示 toast）。这是可接受的——消息仍进入 agent 的微信会话（agent 侧已切换），用户可手动切换查看。
5. **已登录时点击按钮**：`loginWechat()` 快速返回成功（跳过扫码），`manualLoginWechat` 广播 `sessionId`，前端自动切换到微信会话。

## 验证步骤
1. 删除 `data/wechat/wechat-state.json` 和 `data/sessions/meta.json`，重启应用
2. 点击"连接微信"，扫码登录
3. 确认：自动创建"微信通道"会话，UI 切换到该会话，按钮变成"微信通道"入口
4. 从手机发消息，确认消息出现在微信通道会话中，Agent 回复发回手机
5. 切换到其他会话，从手机发消息 → 确认 UI 自动跳回微信通道会话，消息不污染其他会话
6. 重启应用 → 确认按钮显示"微信通道"（自动连接），UI 停留在上次会话
7. 点击"微信通道"按钮 → 确认切换到微信通道会话（不重新扫码）
8. 从手机发消息 → 确认 UI 跳转到微信通道会话
9. 重启应用后点击"微信通道"按钮 → 自动连接 + 加载已存在的微信通道会话（历史消息保留）
