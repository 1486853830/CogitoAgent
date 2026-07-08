/**
 * Preload 脚本 - 安全的 IPC 桥接
 * .cjs 扩展名确保在 ESM 项目中被 Electron 以 CommonJS 方式加载
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送用户消息给 agent
  sendMessage: (text) => ipcRenderer.send('user-message', text),
  
  // 发送统计数据请求
  sendStatsRequest: (data) => ipcRenderer.send('stats-request', data),

  // 窗口操作
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 窗口移动（用于拖拽视频）
  moveWindow: (x, y) => ipcRenderer.send('window-move', { x, y }),

  // 监听 agent 的回复
  onReply: (callback) => {
    ipcRenderer.on('agent-reply', (_event, data) => callback(data));
  },

  // 监听 agent 状态变化
  onStateChange: (callback) => {
    ipcRenderer.on('agent-state', (_event, state) => callback(state));
  },

  // 监听思维链消息
  on: (channel, callback) => {
    if (channel === 'thought-trace') {
      ipcRenderer.on('thought-trace', (_event, data) => callback(data));
    } else if (channel === 'stats-response') {
      ipcRenderer.on('stats-response', (_event, data) => callback(data));
    } else if (channel === 'cluster-state') {
      ipcRenderer.on('cluster-state', (_event, data) => callback(data));
    }
  },

  // 监听历史消息
  onHistory: (callback) => {
    ipcRenderer.on('agent-history', (_event, messages) => callback(messages));
  },

  // 请求历史消息
  requestHistory: () => ipcRenderer.send('request-history'),

  // 模式切换
  getCurrentMode: () => ipcRenderer.invoke('get-current-mode'),
  switchToDesktop: () => ipcRenderer.send('switch-to-desktop'),
  switchToDashboard: () => ipcRenderer.send('switch-to-dashboard'),

  // 打开监控面板
  openMonitor: () => ipcRenderer.send('open-monitor'),

  // ===== 配置向导相关 IPC =====

  // 提交配置
  submitConfig: (config) => ipcRenderer.send('setup-submit-config', config),

  // 监听配置结果
  onConfigResult: (callback) => {
    ipcRenderer.on('setup-config-result', (_event, data) => callback(data));
  },

  // 请求选择目录
  selectDirectory: () => ipcRenderer.send('setup-select-directory'),

  // 监听目录选择结果
  onDirectorySelected: (callback) => {
    ipcRenderer.on('setup-directory-selected', (_event, path) => callback(path));
  },

  // 启动主应用
  launchMainApp: () => ipcRenderer.send('setup-launch-main-app'),

  // 获取 personas 列表
  getPersonas: () => ipcRenderer.invoke('get-personas'),

  // 获取当前 persona 的媒体资源（视频或图片）
  getPersonaMedia: () => ipcRenderer.invoke('get-persona-media'),

  // ===== 会话管理 IPC =====
  // 获取会话列表
  getSessions: () => ipcRenderer.invoke('get-sessions'),

  // 切换会话
  switchSession: (sessionId) => ipcRenderer.send('switch-session', sessionId),

  // 获取当前会话 ID
  getCurrentSession: () => ipcRenderer.invoke('get-current-session'),

  // 获取指定会话的历史消息
  getSessionHistory: (sessionId) => ipcRenderer.invoke('get-session-history', sessionId),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ===== 微信相关 IPC =====
  // 登录微信
  loginWechat: () => ipcRenderer.send('wechat-login'),
  
  // 登出微信
  logoutWechat: () => ipcRenderer.send('wechat-logout'),
  
  // 请求微信状态
  requestWechatStatus: () => ipcRenderer.send('wechat-request-status'),
  
  // 监听微信状态变化
  onWechatState: (callback) => {
    ipcRenderer.on('wechat-state', (_event, state) => callback(state));
  },
  
  // 监听微信消息
  onWechatMessage: (callback) => {
    ipcRenderer.on('wechat-message', (_event, message) => callback(message));
  },

  // 监听微信二维码
  onWechatQRCode: (callback) => {
    ipcRenderer.on('wechat-qrcode', (_event, data) => callback(data));
  },

  // 监听微信登录状态
  onWechatLoginStatus: (callback) => {
    ipcRenderer.on('wechat-login-status', (_event, data) => callback(data));
  },
});