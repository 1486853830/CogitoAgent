/**
 * Preload 脚本 - 安全的 IPC 桥接
 * .cjs 扩展名确保在 ESM 项目中被 Electron 以 CommonJS 方式加载
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送用户消息给 agent
  sendMessage: (text) => ipcRenderer.send('user-message', text),

  // 响应危险操作确认（true=允许, false=拒绝）
  respondConfirmation: (confirmed) => ipcRenderer.send('confirmation-response', confirmed),

  // 监听危险操作确认请求（后端要求用户确认危险操作）
  onConfirmationRequest: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('confirmation-requested', listener);
    return () => ipcRenderer.removeListener('confirmation-requested', listener);
  },

  // 监听危险操作确认结束（允许/拒绝/超时）
  onConfirmationResolved: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('confirmation-resolved', listener);
    return () => ipcRenderer.removeListener('confirmation-resolved', listener);
  },

  // 发送统计数据请求
  sendStatsRequest: (data) => ipcRenderer.send('stats-request', data),

  // 请求技能与工具面板数据
  sendToolsRequest: () => ipcRenderer.send('tools-request'),

  // 监听技能与工具面板数据响应
  onToolsResponse: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tools-response', listener);
    return () => ipcRenderer.removeListener('tools-response', listener);
  },

  // 窗口操作
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // 窗口移动（用于拖拽视频）
  moveWindow: (x, y) => ipcRenderer.send('window-move', { x, y }),

  // 监听 agent 的回复
  onReply: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('agent-reply', listener);
    return () => ipcRenderer.removeListener('agent-reply', listener);
  },

  // 监听 agent 状态变化
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('agent-state', listener);
    return () => ipcRenderer.removeListener('agent-state', listener);
  },

  // 监听思维链消息
  on: (channel, callback) => {
    const listener = (_event, data) => callback(data);
    if (channel === 'thought-trace') {
      ipcRenderer.on('thought-trace', listener);
      return () => ipcRenderer.removeListener('thought-trace', listener);
    } else if (channel === 'stats-response') {
      ipcRenderer.on('stats-response', listener);
      return () => ipcRenderer.removeListener('stats-response', listener);
    } else if (channel === 'cluster-state') {
      ipcRenderer.on('cluster-state', listener);
      return () => ipcRenderer.removeListener('cluster-state', listener);
    }
    return () => {};
  },

  // 监听历史消息
  onHistory: (callback) => {
    const listener = (_event, messages) => callback(messages);
    ipcRenderer.on('agent-history', listener);
    return () => ipcRenderer.removeListener('agent-history', listener);
  },

  // 请求历史消息
  requestHistory: () => ipcRenderer.send('request-history'),

  // 模式切换
  getCurrentMode: () => ipcRenderer.invoke('get-current-mode'),
  switchToDesktop: () => ipcRenderer.send('switch-to-desktop'),
  switchToDashboard: () => ipcRenderer.send('switch-to-dashboard'),

  // 打开配置向导（重新配置）
  openSetup: () => ipcRenderer.send('open-setup'),

  // 打开监控面板
  openMonitor: () => ipcRenderer.send('open-monitor'),

  // ===== 配置向导相关 IPC =====

  // 提交配置
  submitConfig: (config) => ipcRenderer.send('setup-submit-config', config),

  // 加载已有配置（回填表单）
  loadConfig: () => ipcRenderer.invoke('load-config'),

  // 监听配置结果
  onConfigResult: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('setup-config-result', listener);
    return () => ipcRenderer.removeListener('setup-config-result', listener);
  },

  // 监听重新配置模式
  onSetupReconfigureMode: (callback) => {
    const listener = (_event, isReconfigure) => callback(isReconfigure);
    ipcRenderer.on('setup-reconfigure-mode', listener);
    return () => ipcRenderer.removeListener('setup-reconfigure-mode', listener);
  },

  // 请求选择目录
  selectDirectory: () => ipcRenderer.send('setup-select-directory'),

  // 监听目录选择结果
  onDirectorySelected: (callback) => {
    const listener = (_event, path) => callback(path);
    ipcRenderer.on('setup-directory-selected', listener);
    return () => ipcRenderer.removeListener('setup-directory-selected', listener);
  },

  // 启动主应用
  launchMainApp: () => ipcRenderer.send('setup-launch-main-app'),

  // 获取 personas 列表
  getPersonas: () => ipcRenderer.invoke('get-personas'),

  // 获取当前 persona 的媒体资源（视频或图片）
  getPersonaMedia: () => ipcRenderer.invoke('get-persona-media'),

  // ===== 扩展配置（R4.3 MCP / R5.2 插件权限） =====
  // 获取 MCP 配置
  getMcpConfig: () => ipcRenderer.invoke('get-mcp-config'),

  // 更新 MCP 配置（合并补丁）
  updateMcpConfig: (patch) => ipcRenderer.invoke('update-mcp-config', patch),

  // 获取扩展信息：插件列表 + MCP 配置 + 工具权限规则
  getExtensions: () => ipcRenderer.invoke('get-extensions'),

  // 设置完整工具权限规则集（替换 tools.permissions）
  setToolPermissions: (rules) => ipcRenderer.invoke('set-tool-permissions', { rules }),

  // ===== 会话管理 IPC =====
  // 获取会话列表
  getSessions: () => ipcRenderer.invoke('get-sessions'),

  // 切换会话
  switchSession: (sessionId) => ipcRenderer.send('switch-session', sessionId),

  // 更新主进程当前 persona（原通用 send 通道已移除，改为具名方法避免任意通道转发）
  updateCurrentPersona: (persona) => ipcRenderer.send('update-current-persona', persona),

  // 获取当前会话 ID
  getCurrentSession: () => ipcRenderer.invoke('get-current-session'),

  // 获取指定会话的历史消息
  getSessionHistory: (sessionId) => ipcRenderer.invoke('get-session-history', sessionId),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 更新当前语言配置
  updateLanguage: (lang) => ipcRenderer.send('update-language', lang),

  // ===== 微信相关 IPC =====
  // 登录微信
  loginWechat: () => ipcRenderer.send('wechat-login'),

  // 登出微信
  logoutWechat: () => ipcRenderer.send('wechat-logout'),

  // 请求微信状态
  requestWechatStatus: () => ipcRenderer.send('wechat-request-status'),

  // 获取微信历史消息
  getWechatHistory: () => ipcRenderer.invoke('get-wechat-history'),

  // 监听微信状态变化
  onWechatState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('wechat-state', listener);
    return () => ipcRenderer.removeListener('wechat-state', listener);
  },

  // 监听微信消息
  onWechatMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('wechat-message', listener);
    return () => ipcRenderer.removeListener('wechat-message', listener);
  },

  // 监听微信二维码
  onWechatQRCode: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('wechat-qrcode', listener);
    return () => ipcRenderer.removeListener('wechat-qrcode', listener);
  },

  // 监听微信登录状态
  onWechatLoginStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('wechat-login-status', listener);
    return () => ipcRenderer.removeListener('wechat-login-status', listener);
  },

  // 监听人设切换事件
  onPersonaSwitched: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('persona-switched', listener);
    return () => ipcRenderer.removeListener('persona-switched', listener);
  },

  // 监听会话列表更新（meta.json 刷新后推送）
  onSessionUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('session-updated', listener);
    return () => ipcRenderer.removeListener('session-updated', listener);
  },

  // ===== Token 用量相关 IPC =====
  // 监听 token 用量推送（每轮 AI 回复后推送）
  onTokenUsage: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('token-usage', listener);
    return () => ipcRenderer.removeListener('token-usage', listener);
  },
});
