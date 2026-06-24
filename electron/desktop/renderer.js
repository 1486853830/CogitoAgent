/**
 * 渲染进程 - 桌面 UI 逻辑
 */

// DOM 元素
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const btnSend = document.getElementById('btnSend');
const charVideo = document.getElementById('charVideo');
const panel = document.getElementById('panel');
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');

// 状态
let currentAssistantBubble = null;
let isProcessing = false;
let lastToolKey = '';  // 工具调用去重
let pendingContent = '';  // 待显示的流式内容缓冲区
let flushTimer = null;  // 防抖定时器
let isInToolCall = false;  // 是否正在处理工具调用

// 视频状态映射（可根据实际视频文件修改）
const videoStates = { default: '../assets/zhanshi.mp4' };

/**
 * 渲染 Markdown 为 HTML
 */
function renderMarkdown(text) {
  return marked.parse(text, { breaks: true, gfm: true });
}

/**
 * 过滤工具调用内容，仅保留正文
 * 移除整个工具结果/错误块，不只是标签
 */
function filterToolBlocks(text) {
  let result = text;
  
  // 移除 [TOOL]...[/TOOL] 块（多行）
  result = result.replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '');
  
  // 移除 [工具结果]: 及其后面的内容块（多行，直到下一个段落或消息结束）
  result = result.replace(/\[工具结果\]:?\s*((?:\n|.)*?)(?=\n\n|\n\[|$)/g, '');
  
  // 移除 [工具错误]: 及其后面的内容块（多行）
  result = result.replace(/\[工具错误\]:?\s*((?:\n|.)*?)(?=\n\n|\n\[|$)/g, '');
  
  // 移除 [工具调用]: 及其后面的内容块（多行）
  result = result.replace(/\[工具调用\]:?\s*((?:\n|.)*?)(?=\n\n|\n\[|$)/g, '');
  
  // 移除多余的代码块标记
  result = result.replace(/\n```\n/g, '\n');
  
  // 移除多余的空行
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return result.trim();
}

/**
 * 格式化工具结果为卡片样式（默认收起，点击展开）
 */
function formatToolResult(data) {
  const { tool, success, data: resultData, error } = data;
  
  if (!success || error) {
    const errorMsg = error || resultData || '未知错误';
    const resultStr = String(errorMsg);
    
    return `
      <div class="tool-result-card tool-error tool-result-collapsed" onclick="toggleResultExpand(this)">
        <div class="tool-result-header">
          <span class="tool-icon">✗</span>
          <span class="tool-name">${escapeHtml(tool || '未知工具')}</span>
          <span class="tool-status error">失败</span>
          <span class="tool-expand-icon">›</span>
        </div>
        <div class="tool-result-content">
          <pre>${escapeHtml(resultStr)}</pre>
        </div>
      </div>
    `;
  }
  
  const result = resultData;
  const resultStr = typeof result === 'object' && result !== null 
    ? JSON.stringify(result, null, 2) 
    : String(result);
  
  return `
    <div class="tool-result-card tool-result-collapsed" onclick="toggleResultExpand(this)">
      <div class="tool-result-header">
        <span class="tool-icon">✓</span>
        <span class="tool-name">${escapeHtml(tool || '未知工具')}</span>
        <span class="tool-status success">完成</span>
        <span class="tool-expand-icon">›</span>
      </div>
      <div class="tool-result-content">
        <pre>${escapeHtml(resultStr)}</pre>
      </div>
    </div>
  `;
}

/**
 * 截断文本并添加省略号
 */
function truncateText(text, maxLength = 150) {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 切换视频状态（单视频模式，始终播放同一个视频）
 */
function changeVideoState(_state) {
  const src = videoStates.default;
  if (!src || charVideo.src.endsWith(src)) return;
  charVideo.src = src;
  charVideo.play().catch(() => {});
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
    bubble.innerHTML = content;
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
 * 刷新缓存的内容
 */
function flushPendingContent() {
  if (!pendingContent.trim()) return;
  
  const filtered = filterToolBlocks(pendingContent);
  if (filtered.trim()) {
    if (!currentAssistantBubble) {
      currentAssistantBubble = addMessage('assistant', renderMarkdown(filtered), { isHtml: true });
    } else {
      const bubble = currentAssistantBubble.querySelector('.bubble');
      bubble.innerHTML = renderMarkdown(filtered);
    }
    currentAssistantBubble.querySelector('.bubble').classList.add('typing-cursor');
    scrollToBottom();
  }
  pendingContent = '';
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
      // 如果正在处理工具调用，先缓存内容
      if (isInToolCall) {
        pendingContent = data.full || data.content;
        return;
      }
      
      // 否则先缓存，等待一小段时间看是否有工具调用
      pendingContent = data.full || data.content;
      
      // 清除之前的定时器
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      
      // 300ms 后如果没有工具调用，就显示内容
      flushTimer = setTimeout(() => {
        if (!isInToolCall) {
          flushPendingContent();
        }
      }, 300);
      break;

    case 'tool-start':
      // 标记进入工具调用状态
      isInToolCall = true;
      
      // 清除防抖定时器
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      
      // 去重：同一工具调用跳过重复
      const toolKey = `${data.tool}:${JSON.stringify(data.args)}`;
      if (toolKey === lastToolKey) break;
      lastToolKey = toolKey;
      // 500ms 后清除去重标记（允许后续合法的重复调用）
      setTimeout(() => { if (lastToolKey === toolKey) lastToolKey = ''; }, 500);

      // 移除空的助理气泡
      if (currentAssistantBubble) {
        const bubble = currentAssistantBubble.querySelector('.bubble');
        if (bubble && !bubble.textContent.trim()) {
          currentAssistantBubble.remove();
        }
      }
      currentAssistantBubble = null;
      
      // 显示工具调用提示
      addMessage('tool-start', `🔧 ${data.tool}(${Array.isArray(data.args) ? data.args.join(', ') : data.args})`, {
        className: 'tool-start',
      });
      break;

    case 'tool-result':
      // 工具结果卡片展示
      const resultContent = formatToolResult(data);
      addMessage('tool-result', resultContent, {
        className: 'tool-result',
        isHtml: true,
      });
      
      // 如果缓存了内容，在工具结果之后显示
      if (pendingContent.trim()) {
        const filtered = filterToolBlocks(pendingContent);
        if (filtered.trim()) {
          currentAssistantBubble = addMessage('assistant', renderMarkdown(filtered), { isHtml: true });
          currentAssistantBubble.querySelector('.bubble').classList.add('typing-cursor');
        }
        pendingContent = '';
      }
      break;

    case 'done':
      // 标记工具调用结束
      isInToolCall = false;
      
      // 刷新缓存的内容（如果有的话）
      flushPendingContent();
      
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

// 点击输入框聚焦
inputEl.focus();
document.addEventListener('click', () => {
  inputEl.focus();
});

/**
 * 切换工具结果展开/收起（点击卡片触发）
 */
function toggleResultExpand(card) {
  if (card.classList.contains('tool-result-collapsed')) {
    card.classList.remove('tool-result-collapsed');
    card.classList.add('tool-result-expanded');
  } else {
    card.classList.remove('tool-result-expanded');
    card.classList.add('tool-result-collapsed');
  }
}

// 暴露全局函数供内联 onclick 使用
window.toggleResultExpand = toggleResultExpand;

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
 * 点击视频切换面板显示/隐藏
 * 注意：如果发生了拖动，则不触发切换
 */
charVideo.addEventListener('click', (e) => {
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
 * 拖拽视频移动窗口位置
 */
charVideo.addEventListener('mousedown', (e) => {
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