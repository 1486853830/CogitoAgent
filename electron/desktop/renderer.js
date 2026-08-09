/**
 * 渲染进程 - 桌面 UI 逻辑
 * 使用 Shared 公共组件库
 */

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const btnSend = document.getElementById('btnSend');
const characterEl = document.querySelector('.character');
const panel = document.getElementById('panel');
const btnDashboard = document.getElementById('btnDashboard');

let isPanelVisible = true;
let isDragging = false;
let hasDragged = false;
let dragStartX = 0;
let dragStartY = 0;
const DRAG_THRESHOLD = 5;
// rAF 节流移动窗口的 IPC 调用，避免每次 mousemove 触发一次
let pendingMove = null;

// 流式回复处理器（使用公共 StreamReplyHandler）
let replyHandler = null;

const T = (k) => (window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(k) : k);

function initApp() {
  MessageRenderer.init({
    messagesEl,
    layout: 'desktop',
    showAvatar: false,
  });

  // 拦截消息区域内的链接点击，在系统浏览器中打开
  messagesEl?.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      const url = link.href;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        e.preventDefault();
        window.electronAPI?.openExternal(url);
      }
    }
  });

  PersonaManager.init({
    containerEl: characterEl,
    defaultMediaPath: '../shared/video.mp4',
  });

  // 监听人设切换事件，自动更新媒体资源
  window.electronAPI?.onPersonaSwitched?.((data) => {
    console.log('[Desktop] Persona 已切换:', data.persona);
    // 同步主进程的 currentPersona
    window.electronAPI?.updateCurrentPersona(data.persona);
    PersonaManager.loadPersonaMedia();
  });

  // 使用公共窗口控制
  WindowControls.init();

  // 初始化流式回复处理器
  replyHandler = StreamReplyHandler.create({
    renderMessage: (type, content, extra) => MessageRenderer.addMessage(type, content, extra),
    updateMessage: (msgResult, content) => {
      const bubble = msgResult.bubble;
      if (bubble) bubble.innerHTML = SharedUtils.sanitizeHtml(SharedUtils.renderMarkdown(content));
    },
    getBubbleElement: (msgResult) => msgResult?.bubble,
    removeMessage: (msgResult) => msgResult?.msgDiv?.remove(),
    removeTypingCursor: (msgResult) => msgResult?.bubble?.classList.remove('typing-cursor'),
    addToolCall: (toolName, args) => MessageRenderer.addToolCall(toolName, args),
    addToolResult: (toolName, data, success) =>
      MessageRenderer.addToolResult(toolName, data, success),
    filterToolBlocks: (text) => SharedUtils.filterToolBlocks(text),
    scrollToBottom: () => MessageRenderer.scrollToBottom(),
    onProcessingChange: (processing) => {
      setButtonState(processing ? 'stop' : 'send');
    },
  });

  bindEvents();

  // 使用可选链保护：若 preload 脚本未正确暴露 electronAPI（如加载失败），
  // 这些调用应静默跳过，避免 TypeError 导致整个 UI 无响应。
  window.electronAPI?.onReply?.((data) => replyHandler.handle(data));
  window.electronAPI?.onStateChange?.(handleStateChange);
  window.electronAPI?.onHistory?.(handleHistory);
  window.electronAPI?.requestHistory?.();

  // 危险操作确认
  if (window.electronAPI.onConfirmationRequest) {
    window.electronAPI.onConfirmationRequest((data) => ConfirmationManager.show(data));
  }
  if (window.electronAPI.onConfirmationResolved) {
    window.electronAPI.onConfirmationResolved((data) => ConfirmationManager.dismiss(data));
  }

  inputEl.focus();

  console.log('[Desktop] 初始化完成');
}

function bindEvents() {
  if (btnSend) btnSend.addEventListener('click', sendMessage);
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (btnDashboard) {
    btnDashboard.addEventListener('click', () => {
      window.electronAPI?.switchToDashboard();
    });
  }

  document.addEventListener('click', () => {
    if (inputEl) inputEl.focus();
  });

  if (characterEl) {
    characterEl.addEventListener('click', handleCharacterClick);
    characterEl.addEventListener('mousedown', handleCharacterDragStart);
  }
  document.addEventListener('mousemove', handleCharacterDragMove);
  document.addEventListener('mouseup', handleCharacterDragEnd);
}

function sendMessage() {
  if (replyHandler?.isProcessing()) {
    window.electronAPI.sendMessage('\n');
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  MessageRenderer.addMessage('user', text);
  window.electronAPI.sendMessage(text);
}

function setButtonState(state) {
  const svg = btnSend.querySelector('svg');
  if (state === 'stop') {
    btnSend.style.opacity = '1';
    btnSend.style.background = 'rgba(248, 113, 113, 0.18)';
    btnSend.style.color = '#f87171';
    btnSend.style.borderColor = '#f87171';
    btnSend.title = T('dashboard.stopClick');
    svg.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"/>';
  } else {
    btnSend.style.opacity = '1';
    btnSend.style.background = 'rgba(94, 234, 212, 0.12)';
    btnSend.style.color = '#5eead4';
    btnSend.style.borderColor = '#5eead4';
    btnSend.title = T('desktop.waitSend');
    svg.innerHTML = '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>';
  }
}

function handleStateChange(state) {
  updateStatusIndicator(state);
}

function handleHistory(history) {
  MessageRenderer.loadHistory(history);
}

function updateStatusIndicator(state) {
  let el = document.querySelector('.status-indicator');
  if (!el) {
    el = document.createElement('div');
    el.className = 'status-indicator';
    document.body.appendChild(el);
  }
  el.className = `status-indicator status-${state}`;
}

function handleCharacterClick(e) {
  if (hasDragged) {
    hasDragged = false;
    return;
  }

  e.stopPropagation();
  isPanelVisible = !isPanelVisible;

  if (isPanelVisible) {
    panel.classList.remove('panel-hidden');
    panel.classList.add('panel-visible');
  } else {
    panel.classList.remove('panel-visible');
    panel.classList.add('panel-hidden');
  }
}

function handleCharacterDragStart(e) {
  if (e.button !== 0) return;

  isDragging = true;
  hasDragged = false;
  dragStartX = e.screenX;
  dragStartY = e.screenY;

  e.preventDefault();
}

function handleCharacterDragMove(e) {
  if (!isDragging) return;

  const deltaX = e.screenX - dragStartX;
  const deltaY = e.screenY - dragStartY;

  if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
    hasDragged = true;
  }

  if (hasDragged) {
    // rAF 节流：合并同一帧内的多次 mousemove，减少 IPC 频率
    if (!pendingMove) {
      pendingMove = requestAnimationFrame(() => {
        pendingMove = null;
        window.electronAPI.moveWindow(deltaX, deltaY);
      });
    }
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
}

function handleCharacterDragEnd() {
  isDragging = false;
  if (pendingMove) {
    cancelAnimationFrame(pendingMove);
    pendingMove = null;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
