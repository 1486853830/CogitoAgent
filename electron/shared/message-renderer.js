/* ============================================================
 *  MessageRenderer - 公共消息渲染模块
 *  支持 desktop 和 dashboard 两种布局模式
 * ============================================================ */

const MessageRenderer = {
  messagesEl: null,
  options: {},

  init(options = {}) {
    this.messagesEl = options.messagesEl || document.getElementById('messages');
    this.options = {
      layout: 'desktop',
      showAvatar: false,
      userAvatarText: '我',
      assistantAvatarText: 'AI',
      emptyHintIcon: 'Cogito Agent',
      emptyHintText: '有什么可以帮你的？',
      ...options,
    };

    if (!this.messagesEl) {
      console.warn('[MessageRenderer] 未找到消息容器');
      return false;
    }

    console.log('[MessageRenderer] 初始化完成，布局模式:', this.options.layout);
    return true;
  },

  clearEmptyHint() {
    const hint = this.messagesEl?.querySelector('.empty-hint');
    if (hint) hint.remove();
  },

  clearMessages() {
    if (!this.messagesEl) return;
    this.messagesEl.innerHTML = `
      <div class="empty-hint">
        <div class="hint-icon">${this.options.emptyHintIcon}</div>
        <div class="hint-text">${this.options.emptyHintText}</div>
      </div>
    `;
  },

  addMessage(type, content, extra = {}) {
    this.clearEmptyHint();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    if (extra.className) msgDiv.classList.add(extra.className);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (extra.isHtml) {
      bubble.innerHTML = SharedUtils.sanitizeHtml(content);
    } else {
      bubble.textContent = content;
    }

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = SharedUtils.formatTime();

    if (this.options.layout === 'dashboard' && this.options.showAvatar) {
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = type === 'user'
        ? this.options.userAvatarText
        : this.options.assistantAvatarText;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.appendChild(bubble);
      contentDiv.appendChild(time);

      if (type === 'user') {
        msgDiv.appendChild(contentDiv);
        msgDiv.appendChild(avatar);
      } else {
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(contentDiv);
      }
    } else {
      msgDiv.appendChild(bubble);
      msgDiv.appendChild(time);
    }

    this.messagesEl.appendChild(msgDiv);
    this.scrollToBottom();

    return { msgDiv, bubble };
  },

  addToolCall(toolName, args) {
    this.clearEmptyHint();

    const argsStr = SharedUtils.formatArgs(args);
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message tool-call';

    const card = document.createElement('div');
    card.className = 'tool-call-card tool-call-collapsed';

    const header = document.createElement('div');
    header.className = 'tool-call-header';

    const icon = document.createElement('div');
    icon.className = 'tool-call-icon';
    icon.textContent = '⚡';

    const name = document.createElement('div');
    name.className = 'tool-call-name';
    name.textContent = `${toolName}(${argsStr})`;

    const arrow = document.createElement('div');
    arrow.className = 'tool-call-arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(arrow);

    const content = document.createElement('div');
    content.className = 'tool-call-content';

    const pre = document.createElement('pre');
    pre.textContent = `🔧 ${toolName}(${argsStr})`;
    content.appendChild(pre);

    card.appendChild(header);
    card.appendChild(content);

    card.addEventListener('click', () => {
      if (card.classList.contains('tool-call-collapsed')) {
        card.classList.remove('tool-call-collapsed');
        card.classList.add('tool-call-expanded');
      } else {
        card.classList.remove('tool-call-expanded');
        card.classList.add('tool-call-collapsed');
      }
    });

    if (this.options.layout === 'dashboard' && this.options.showAvatar) {
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = '⚙';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.appendChild(card);

      contentDiv.appendChild(bubble);
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(contentDiv);
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.appendChild(card);
      msgDiv.appendChild(bubble);
    }

    this.messagesEl.appendChild(msgDiv);
    this.scrollToBottom();

    return { msgDiv, card };
  },

  addToolResult(toolName, data, success = true) {
    this.clearEmptyHint();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message tool-result';

    const card = document.createElement('div');
    card.className = `tool-result-card ${success ? '' : 'tool-error'} tool-result-collapsed`;

    const header = document.createElement('div');
    header.className = 'tool-result-header';

    const icon = document.createElement('div');
    icon.className = 'tool-icon';
    icon.textContent = success ? '✓' : '✕';

    const name = document.createElement('div');
    name.className = 'tool-name';
    name.textContent = toolName;

    const status = document.createElement('div');
    status.className = `tool-status ${success ? 'success' : 'error'}`;
    status.textContent = success ? '成功' : '失败';

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(status);

    const resultContent = document.createElement('div');
    resultContent.className = 'tool-result-content';

    const pre = document.createElement('pre');
    pre.textContent = typeof data === 'string'
      ? data
      : JSON.stringify(data, null, 2);
    resultContent.appendChild(pre);

    card.appendChild(header);
    card.appendChild(resultContent);

    card.addEventListener('click', () => {
      if (card.classList.contains('tool-result-collapsed')) {
        card.classList.remove('tool-result-collapsed');
        card.classList.add('tool-result-expanded');
      } else {
        card.classList.remove('tool-result-expanded');
        card.classList.add('tool-result-collapsed');
      }
    });

    if (this.options.layout === 'dashboard' && this.options.showAvatar) {
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = '⚙';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.appendChild(card);

      contentDiv.appendChild(bubble);
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(contentDiv);
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.appendChild(card);
      msgDiv.appendChild(bubble);
    }

    this.messagesEl.appendChild(msgDiv);
    this.scrollToBottom();

    return { msgDiv, card };
  },

  loadHistory(history) {
    if (!history || history.length === 0) return;
    this.clearEmptyHint();
    history.forEach(msg => {
      this.addMessage(msg.role, msg.content);
    });
  },

  scrollToBottom() {
    SharedUtils.scrollToBottom(this.messagesEl);
  },

  setMessagesElement(el) {
    this.messagesEl = el;
  },
};

window.MessageRenderer = MessageRenderer;
