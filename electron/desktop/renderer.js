/**
 * 渲染进程 - 桌面 UI 逻辑
 */

// DOM 元素
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const btnSend = document.getElementById('btnSend');
const characterEl = document.querySelector('.character');
const panel = document.getElementById('panel');
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');

// 状态
let currentAssistantBubble = null;
let isProcessing = false;
let lastToolKey = '';  // 工具调用去重

// 默认媒体路径
const DEFAULT_MEDIA = { type: 'video', path: '../assets/zhanshi.mp4' };

/**
 * 渲染 Markdown 为 HTML
 */
function renderMarkdown(text) {
  return marked.parse(text, { breaks: true, gfm: true });
}

/**
 * 过滤危险 HTML，防止 XSS
 */
function sanitizeHtml(html) {
  const dangerous = /<script[\s\S]*?<\/script>|on\w+\s*=|javascript\s*:/gi;
  return html.replace(dangerous, '');
}

/**
 * 过滤工具调用内容，仅保留正文
 */
function filterToolBlocks(text) {
  return text
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
    .replace(/\n```\n/g, '\n')
    .trim();
}

/**
 * 动态加载 persona 媒体资源（视频或图片）
 */
async function loadPersonaMedia() {
  try {
    const media = await window.electronAPI.getPersonaMedia();
    
    characterEl.innerHTML = '';
    
    if (media.type === 'image') {
      const img = document.createElement('img');
      img.src = media.path;
      img.alt = 'Persona Image';
      characterEl.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.id = 'charVideo';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.src = media.path;
      characterEl.appendChild(video);
    }
  } catch (e) {
    console.error('加载 persona 媒体失败:', e);
    characterEl.innerHTML = '';
    const video = document.createElement('video');
    video.id = 'charVideo';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.src = DEFAULT_MEDIA.path;
    characterEl.appendChild(video);
  }
}

/**
 * 切换视频状态（根据状态更新视频）
 */
function changeVideoState(_state) {
  // 状态变化时不切换视频，视频由 persona 决定
}

/**
 * 添加状态指示器
 */
function updateStatusIndicator(state) {
  let el = document.querySelector('.status-indicator');
  if (!el) {
    el = document.createElement('div');
    el.className = 'status-indicator';
    document.body.appendChild(el);
  }
  el.className = `status-indicator status-${state}`;
}

/**
 * 清空空状态提示
 */
function clearEmptyHint() {
  const hint = messagesEl.querySelector('.empty-hint');
  if (hint) hint.remove();
}

/**
 * 添加消息
 */
function addMessage(type, content, extra = {}) {
  clearEmptyHint();

  const div = document.createElement('div');
  div.className = `message ${type}`;

  if (extra.className) {
    div.classList.add(extra.className);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (extra.isHtml) {
    bubble.innerHTML = sanitizeHtml(content);
  } else {
    bubble.textContent = content;
  }

  const time = document.createElement('div');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  div.appendChild(bubble);
  div.appendChild(time);
  messagesEl.appendChild(div);
  scrollToBottom();

  return div;
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 50);
}

/**
 * 发送消息 / 打断
 */
function sendMessage() {
  // 正在处理中 → 点击打断
  if (isProcessing) {
    window.electronAPI.sendMessage('\n');  // 发送空行打断 Agent
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  addMessage('user', text);
  isProcessing = true;
  setButtonState('stop');

  window.electronAPI.sendMessage(text);
}

/**
 * 切换按钮状态：发送 / 停止
 */
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

/**
 * 处理 Agent 回复
 */
function handleReply(data) {
  switch (data.type) {
    case 'user':
      // 终端输入的消息也显示在桌面端
      addMessage('user', data.content);
      break;

    case 'chunk':
      // 流式输出，过滤工具调用后渲染 Markdown
      const filtered = filterToolBlocks(data.full || data.content);
      if (!currentAssistantBubble) {
        currentAssistantBubble = addMessage('assistant', renderMarkdown(filtered), { isHtml: true });
      } else {
        const bubble = currentAssistantBubble.querySelector('.bubble');
        bubble.innerHTML = sanitizeHtml(renderMarkdown(filtered));
      }
      currentAssistantBubble.querySelector('.bubble').classList.add('typing-cursor');
      scrollToBottom();
      break;

    case 'tool-start':
      // 去重：同一工具调用跳过重复
      const toolKey = `${data.tool}:${JSON.stringify(data.args)}`;
      if (toolKey === lastToolKey) break;
      lastToolKey = toolKey;
      // 500ms 后清除去重标记（允许后续合法的重复调用）
      setTimeout(() => { if (lastToolKey === toolKey) lastToolKey = ''; }, 500);

      // 移除过滤后为空的助理气泡（流式输出的工具调用内容被过滤掉了）
      if (currentAssistantBubble) {
        const bubble = currentAssistantBubble.querySelector('.bubble');
        if (bubble && !bubble.textContent.trim()) {
          currentAssistantBubble.remove();
        }
      }
      currentAssistantBubble = null;
      addMessage('tool-start', `🔧 ${data.tool}(${Array.isArray(data.args) ? data.args.join(', ') : data.args})`, {
        className: 'tool-start',
      });
      break;

    case 'tool-result':
      // 工具结果已隐藏，仅显示工具调用
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
      addMessage('error', `⚠️ ${data.message}`, { className: 'error' });
      isProcessing = false;
      setButtonState('send');
      break;
  }
}

// ---- 事件监听 ----

// 发送
btnSend.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// 最小化
btnMinimize.addEventListener('click', () => {
  window.electronAPI?.minimizeWindow();
});

// 关闭
btnClose.addEventListener('click', () => {
  window.electronAPI?.closeWindow();
});

// Agent 回复
window.electronAPI.onReply(handleReply);

// 状态变化
window.electronAPI.onStateChange((state) => {
  changeVideoState(state);
  updateStatusIndicator(state);

  // 根据 Agent 状态更新按钮
  // thinking = 正在回复，按钮显示"终止"
  // idle = 等待输入，按钮显示"发送"
  if (state === 'thinking') {
    setButtonState('stop');
    isProcessing = true;
  } else if (state === 'idle') {
    setButtonState('send');
    isProcessing = false;
  }
});

// 历史消息
window.electronAPI.onHistory((history) => {
  history.forEach(msg => {
    addMessage(msg.role, msg.content);
  });
});

// 加载历史
window.electronAPI.requestHistory();

// 加载 persona 媒体资源
loadPersonaMedia();

// 点击输入框聚焦
inputEl.focus();
document.addEventListener('click', () => {
  inputEl.focus();
});

// ---- 视频交互功能 ----

// 面板显示状态
let isPanelVisible = true;

// 拖拽状态
let isDragging = false;
let hasDragged = false;  // 是否发生了实际拖动（移动距离超过阈值）
let dragStartX = 0;
let dragStartY = 0;
const DRAG_THRESHOLD = 5;  // 拖动阈值（像素）

/**
 * 点击人物区域切换面板显示/隐藏
 * 注意：如果发生了拖动，则不触发切换
 */
characterEl.addEventListener('click', (e) => {
  // 如果发生了拖动，不触发展开/收起
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
});

/**
 * 拖拽人物区域移动窗口位置
 */
characterEl.addEventListener('mousedown', (e) => {
  // 只响应左键
  if (e.button !== 0) return;
  
  isDragging = true;
  hasDragged = false;  // 重置拖动标记
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  const deltaX = e.screenX - dragStartX;
  const deltaY = e.screenY - dragStartY;
  
  // 检查是否超过拖动阈值
  if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
    hasDragged = true;  // 标记为发生了拖动
  }
  
  // 只有发生实际拖动后才移动窗口
  if (hasDragged) {
    window.electronAPI.moveWindow(deltaX, deltaY);
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});