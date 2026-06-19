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
 */
function filterToolBlocks(text) {
  return text
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
    .replace(/\n```\n/g, '\n')
    .trim();
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
    btnSend.title = '打断';
    svg.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"/>';
  } else {
    btnSend.style.opacity = '1';
    btnSend.style.background = 'rgba(99, 140, 255, 0.3)';
    btnSend.style.color = '#a0c0ff';
    btnSend.title = '发送';
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
        bubble.innerHTML = renderMarkdown(filtered);
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

    case 'done':
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
  // 通过 IPC 告知主进程最小化
  window.electronAPI?.sendMessage?.('') || null;
  // 实际最小化需要在 preload 中暴露
});

// 关闭
btnClose.addEventListener('click', () => {
  window.close();
});

// Agent 回复
window.electronAPI.onReply(handleReply);

// 状态变化
window.electronAPI.onStateChange((state) => {
  changeVideoState(state);
  updateStatusIndicator(state);
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