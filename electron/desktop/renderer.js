/**
 * 渲染进程 - 桌面 UI 逻辑
 * 使用 Shared 公共组件库
 */

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const btnSend = document.getElementById('btnSend');
const characterEl = document.querySelector('.character');
const panel = document.getElementById('panel');
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');

let currentAssistantBubble = null;
let isProcessing = false;
let lastToolKey = '';

let isPanelVisible = true;
let isDragging = false;
let hasDragged = false;
let dragStartX = 0;
let dragStartY = 0;
const DRAG_THRESHOLD = 5;

function initApp() {
  MessageRenderer.init({
    messagesEl,
    layout: 'desktop',
    showAvatar: false,
  });

  PersonaManager.init({
    containerEl: characterEl,
    defaultMediaPath: '../shared/video.mp4',
  });

  bindEvents();

  window.electronAPI.onReply(handleReply);
  window.electronAPI.onStateChange(handleStateChange);
  window.electronAPI.onHistory(handleHistory);
  window.electronAPI.requestHistory();

  inputEl.focus();

  console.log('[Desktop] 初始化完成');
}

function bindEvents() {
  btnSend.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  btnMinimize.addEventListener('click', () => {
    window.electronAPI?.minimizeWindow();
  });

  btnClose.addEventListener('click', () => {
    window.electronAPI?.closeWindow();
  });

  document.addEventListener('click', () => {
    inputEl.focus();
  });

  characterEl.addEventListener('click', handleCharacterClick);
  characterEl.addEventListener('mousedown', handleCharacterDragStart);
  document.addEventListener('mousemove', handleCharacterDragMove);
  document.addEventListener('mouseup', handleCharacterDragEnd);
}

function sendMessage() {
  if (isProcessing) {
    window.electronAPI.sendMessage('\n');
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  MessageRenderer.addMessage('user', text);
  isProcessing = true;
  setButtonState('stop');

  window.electronAPI.sendMessage(text);
}

function setButtonState(state) {
  const svg = btnSend.querySelector('svg');
  if (state === 'stop') {
    btnSend.style.opacity = '1';
    btnSend.style.background = 'rgba(255, 80, 80, 0.3)';
    btnSend.style.color = '#ff8888';
    btnSend.title = '点击终止';
    svg.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"/>';
  } else {
    btnSend.style.opacity = '1';
    btnSend.style.background = 'rgba(99, 140, 255, 0.3)';
    btnSend.style.color = '#a0c0ff';
    btnSend.title = '等待发送';
    svg.innerHTML = '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>';
  }
}

function handleReply(data) {
  switch (data.type) {
    case 'user':
      MessageRenderer.addMessage('user', data.content);
      break;

    case 'chunk': {
      const filtered = SharedUtils.filterToolBlocks(data.full || data.content);
      if (!currentAssistantBubble) {
        const result = MessageRenderer.addMessage('assistant', SharedUtils.renderMarkdown(filtered), { isHtml: true });
        currentAssistantBubble = result.msgDiv;
      } else {
        const bubble = currentAssistantBubble.querySelector('.bubble');
        bubble.innerHTML = SharedUtils.sanitizeHtml(SharedUtils.renderMarkdown(filtered));
      }
      currentAssistantBubble.querySelector('.bubble').classList.add('typing-cursor');
      MessageRenderer.scrollToBottom();
      break;
    }

    case 'tool-start': {
      const toolKey = `${data.tool}:${JSON.stringify(data.args)}`;
      if (toolKey === lastToolKey) break;
      lastToolKey = toolKey;
      setTimeout(() => { if (lastToolKey === toolKey) lastToolKey = ''; }, 500);

      if (currentAssistantBubble) {
        const bubble = currentAssistantBubble.querySelector('.bubble');
        if (bubble && !bubble.textContent.trim()) {
          currentAssistantBubble.remove();
        }
      }
      currentAssistantBubble = null;
      MessageRenderer.addToolCall(data.tool, data.args);
      break;
    }

    case 'tool-result':
      break;

    case 'end':
      if (currentAssistantBubble) {
        currentAssistantBubble.querySelector('.bubble').classList.remove('typing-cursor');
      }
      currentAssistantBubble = null;
      isProcessing = false;
      setButtonState('send');
      break;

    case 'error':
      if (currentAssistantBubble) {
        currentAssistantBubble.querySelector('.bubble').classList.remove('typing-cursor');
      }
      currentAssistantBubble = null;
      MessageRenderer.addMessage('error', `⚠️ ${data.message}`, { className: 'error' });
      isProcessing = false;
      setButtonState('send');
      break;
  }
}

function handleStateChange(state) {
  updateStatusIndicator(state);

  if (state === 'thinking') {
    setButtonState('stop');
    isProcessing = true;
  } else if (state === 'idle') {
    setButtonState('send');
    isProcessing = false;
  }
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
    window.electronAPI.moveWindow(deltaX, deltaY);
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
}

function handleCharacterDragEnd() {
  isDragging = false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
