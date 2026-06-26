/**
 * Preload 脚本 - 安全的 IPC 桥接
 * .cjs 扩展名确保在 ESM 项目中被 Electron 以 CommonJS 方式加载
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送用户消息给 agent
  sendMessage: (text) => ipcRenderer.send('user-message', text),

  // 窗口操作
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
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

  // 监听历史消息
  onHistory: (callback) => {
    ipcRenderer.on('agent-history', (_event, messages) => callback(messages));
  },

  // 请求历史消息
  requestHistory: () => ipcRenderer.send('request-history'),

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
});