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

// ---- 鼠标穿透（桌宠模式）：空白透明区点击落到下层应用，仅可交互区捕获 ----
// 默认 isMouseIgnored=true 与主进程 setIgnoreMouseEvents(true) 一致。
// 可交互区 = 宠物视频(.character) + 聊天面板(.panel) + 危险操作确认弹窗(.confirm-overlay)。
// 面板隐藏(.panel-hidden)时 pointer-events:none，elementFromPoint 会跳过它，自动变回穿透。
let isMouseIgnored = true;
let lastMouseX = 0;
let lastMouseY = 0;
const INTERACTIVE_SELECTOR = '.character, .panel, .confirm-overlay, #cogito-lang-switcher';

function setMouseIgnore(wantIgnore) {
  if (wantIgnore === isMouseIgnored) return; // 仅在状态变化时发 IPC，避免刷屏
  if (!window.electronAPI?.setIgnoreMouseEvents) return;
  window.electronAPI.setIgnoreMouseEvents(wantIgnore);
  isMouseIgnored = wantIgnore;
}

// 依据当前光标位置（elementFromPoint）决定窗口是否穿透。
function syncMouseIgnore() {
  // 拖拽宠物过程中必须保持捕获，否则拖到空白/缝隙处会丢失鼠标。
  if (isDragging) {
    setMouseIgnore(false);
    return;
  }
  const el = document.elementFromPoint(lastMouseX, lastMouseY);
  const interactive = el && typeof el.closest === 'function' && el.closest(INTERACTIVE_SELECTOR);
  setMouseIgnore(!interactive);
}

// ---- 自适应窗口大小（桌宠模式）：紧密贴合可见内容，去掉大片透明留白 ----
// 宠物与面板均靠右/下定位，所需窗口尺寸 = 各可见元素 (innerWidth - rect.left) /
// (innerHeight - rect.top) 的最大值。该公式与窗口当前大小无关（右/下锚定下缩放窗口
// 不会改变公式结果），因此重复计算必然收敛、不会抖动。
const SIZE_MARGIN = 16; // 内容四周留白
const MIN_WIN_W = 240;
const MIN_WIN_H = 200;
let lastAutoSize = { width: 0, height: 0 };
let resizeRaf = null;

function computeRequiredSize() {
  let needW = 0;
  let needH = 0;
  const candidates = [characterEl];
  // 面板收起（.panel-hidden）时不计入，窗口可缩到只剩宠物
  if (panel && !panel.classList.contains('panel-hidden')) candidates.push(panel);
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    needW = Math.max(needW, window.innerWidth - r.left);
    needH = Math.max(needH, window.innerHeight - r.top);
  }
  return {
    width: Math.max(MIN_WIN_W, Math.ceil(needW) + SIZE_MARGIN),
    height: Math.max(MIN_WIN_H, Math.ceil(needH) + SIZE_MARGIN),
  };
}

// 真正请求主进程缩放；尺寸与上次一致则跳过，避免 setBounds 触发的 resize 事件回环刷屏。
function requestAutoSize() {
  const { width, height } = computeRequiredSize();
  if (width === lastAutoSize.width && height === lastAutoSize.height) return;
  if (!window.electronAPI?.setWindowSize) return;
  lastAutoSize = { width, height };
  window.electronAPI.setWindowSize(width, height);
}

// rAF 节流：多次布局变化合并到一帧
function scheduleAutoSize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    requestAutoSize();
  });
}

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
    window.electronAPI.onConfirmationRequest((data) => {
      // 弹窗出现即强制捕获鼠标，保证"允许/取消"按钮可点（光标可能尚未移动）。
      setMouseIgnore(false);
      ConfirmationManager.show(data);
    });
  }
  if (window.electronAPI.onConfirmationResolved) {
    window.electronAPI.onConfirmationResolved((data) => {
      ConfirmationManager.dismiss(data);
      // 弹窗关闭后按当前光标位置重新计算穿透状态。
      syncMouseIgnore();
    });
  }

  // 自适应窗口尺寸：首帧测量 + 窗口 resize 时重测
  window.addEventListener('resize', scheduleAutoSize);
  // 面板显隐动画结束后按最终尺寸再测一次（过渡期间 rect 是中间值）
  if (panel) panel.addEventListener('transitionend', scheduleAutoSize);
  // 消息增删（历史加载 / 流式回复）导致面板高度变化时重测
  if (messagesEl) {
    const mo = new MutationObserver(scheduleAutoSize);
    mo.observe(messagesEl, { childList: true, subtree: true });
  }
  // 首帧测量（DOM 已就绪，视频/面板布局生效）
  scheduleAutoSize();

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

  // 鼠标穿透：记录光标坐标并在移动时同步窗口穿透状态（仅状态变化时发 IPC）。
  document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    syncMouseIgnore();
  });
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

  // 面板显隐后窗口尺寸应随之收缩/扩张
  scheduleAutoSize();
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
