/**
 * Preload 脚本 - 安全的 IPC 桥接
 * .cjs 扩展名确保在 ESM 项目中被 Electron 以 CommonJS 方式加载
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送用户消息给 agent
  sendMessage: (text) => ipcRenderer.send('user-message', text),

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
});