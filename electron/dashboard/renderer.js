/**
 * Dashboard 渲染进程 - 模块化重构
 * 模块: WindowManager / ChatManager / NavManager / AppState
 * 公共组件: SharedUtils / PersonaManager / MessageRenderer (来自 ../shared/)
 */

// ============================================================
// 工具函数模块 - 复用公共 SharedUtils
// ============================================================
const Utils = SharedUtils;

// ============================================================
// 工具分类数据（与后端 registry.js 保持一致）
// ============================================================
const TOOL_CATEGORIES = [
  {
    id: 'file',
    name: '文件操作',
    icon: '📁',
    tools: ['ls', 'read', 'copy', 'mkdir', 'create']
  },
  {
    id: 'web',
    name: '网络工具',
    icon: '🌐',
    tools: ['search', 'browse', 'fetchPage']
  },
  {
    id: 'system',
    name: '系统操作',
    icon: '⚙️',
    tools: ['listApps', 'openApp', 'closeApp']
  },
  {
    id: 'browser',
    name: '浏览器自动化',
    icon: '🧭',
    tools: ['initBrowser', 'clickElement', 'fillField', 'selectOption', 'viewChanges', 'getPageContent', 'takeScreenshot', 'closeBrowser', 'searchOnPage', 'findElements', 'searchOnEngine', 'downloadFile']
  },
  {
    id: 'code',
    name: '代码执行',
    icon: '💻',
    tools: ['executeCode', 'executeFile', 'runJavaScript', 'runPython', 'formatCode']
  },
  {
    id: 'git',
    name: 'Git 版本控制',
    icon: '🔀',
    tools: ['gitInit', 'gitClone', 'gitAdd', 'gitCommit', 'gitPush', 'gitPull', 'gitStatus', 'gitLog', 'gitBranchCreate', 'gitBranchDelete', 'gitCheckout', 'gitCheckoutNew', 'gitMerge', 'gitDiff', 'gitRemoteAdd', 'gitRemoteList', 'gitConfigUser', 'gitReset', 'gitStash', 'gitStashPop']
  },
  {
    id: 'task',
    name: '任务管理',
    icon: '📋',
    tools: ['createTask', 'getTasks', 'getTask', 'updateTask', 'deleteTask', 'completeTask', 'splitTask', 'getTaskStats', 'clearTasks']
  },
  {
    id: 'memory',
    name: '记忆系统',
    icon: '🧠',
    tools: ['addMemory', 'searchMemory', 'getAllMemories', 'getMemory', 'updateMemory', 'deleteMemory', 'getMemoryStats', 'getRelatedMemories', 'clearMemory']
  },
  {
    id: 'data',
    name: '数据处理',
    icon: '📊',
    tools: ['readCSV', 'writeCSV', 'readJSON', 'writeJSON', 'csvToJSON', 'jsonToCSV', 'queryData', 'analyzeData', 'sortData']
  },
  {
    id: 'db',
    name: '数据库',
    icon: '🗄️',
    tools: ['executeSQL', 'query', 'insert', 'update', 'deleteData', 'createTable', 'dropTable', 'getTables', 'getTableSchema', 'executeTransaction', 'closeDB']
  },
  {
    id: 'email',
    name: '邮件功能',
    icon: '📧',
    tools: ['sendEmail', 'sendTextEmail', 'sendHtmlEmail', 'sendTemplateEmail', 'sendEmailWithAttachments', 'checkEmailConfig']
  },
  {
    id: 'monitor',
    name: '系统监控',
    icon: '📈',
    tools: ['getCPUInfo', 'getMemoryInfo', 'getDiskInfo', 'getNetworkInfo', 'getProcesses', 'getSystemInfo', 'getCurrentProcess', 'getSystemLoad', 'monitorSystem']
  },
  {
    id: 'scheduler',
    name: '定时任务',
    icon: '⏰',
    tools: ['addScheduleTask', 'getScheduleTasks', 'getScheduleTask', 'updateScheduleTask', 'toggleScheduleTask', 'removeScheduleTask', 'startScheduler', 'stopScheduler']
  },
  {
    id: 'ocr',
    name: '图像文字识别',
    icon: '🔍',
    tools: ['ocr', 'ocrBatch']
  },
  {
    id: 'office',
    name: 'Office 文档',
    icon: '📄',
    tools: ['createPpt', 'createWord', 'createExcel', 'readExcel']
  }
];

// 危险操作列表（来自 registry.js）
const DANGEROUS_TOOLS = new Set([
  'gitPush', 'gitReset', 'gitBranchDelete',
  'executeCode', 'executeFile', 'runJavaScript', 'runPython',
  'deleteData', 'dropTable', 'clearTasks', 'clearMemory',
  'removeScheduleTask'
]);

// ============================================================
// 应用状态模块
// ============================================================
const AppState = {
  isProcessing: false,
  isWaiting: false,  // Agent 是否在等待用户输入
  currentAssistantBubble: null,
  lastToolKey: '',
  currentMode: 'work', // work / code / design
  view: 'welcome', // welcome / chat

  setProcessing(val) {
    this.isProcessing = val;
    ChatManager.updateSendButtonState();
  },

  setWaiting(val) {
    this.isWaiting = val;
    ChatManager.updateSendButtonState();
  },
};

// ============================================================
// Persona 形象管理模块 - 复用公共 PersonaManager
// ============================================================
const PersonaUIManager = {
  init() {
    const characterEl = document.getElementById('personaCharacter');
    if (!characterEl) {
      console.warn('[PersonaUIManager] 未找到 personaCharacter 元素');
      return;
    }

    PersonaManager.init({
      containerEl: characterEl,
      defaultMediaPath: '../shared/video.mp4',
    });

    console.log('[PersonaUIManager] 初始化完成');
  },
};

// ============================================================
// 窗口控制模块
// ============================================================
const WindowManager = {
  init() {
    const btnMin = document.getElementById('btnMinimize');
    const btnMax = document.getElementById('btnMaximize');
    const btnClose = document.getElementById('btnClose');

    if (btnMin) {
      btnMin.addEventListener('click', () => {
        window.electronAPI?.minimizeWindow();
      });
    }
    if (btnMax) {
      btnMax.addEventListener('click', () => {
        window.electronAPI?.maximizeWindow();
      });
    }
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        window.electronAPI?.closeWindow();
      });
    }

    console.log('[WindowManager] 初始化完成');
  },
};

// ============================================================
// 导航栏模块
// ============================================================
const NavManager = {
  init() {
    // Work/Code/Design 模式切换
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchMode(tab.dataset.mode);
      });
    });

    // 新建任务按钮
    const newTaskBtn = document.getElementById('newTaskBtn');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', () => {
        this.newTask();
      });
    }

    // 新建会话按钮
    const newSessionBtn = document.getElementById('newSessionBtn');
    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', () => {
        this.createNewSession();
      });
    }

    // 技能按钮
    const skillBtns = document.querySelectorAll('.action-btn');
    skillBtns.forEach(btn => {
      if (btn.id === 'newTaskBtn') return;
      if (btn.id === 'desktopModeBtn') {
        btn.addEventListener('click', () => this.switchToDesktop());
        return;
      }
      btn.addEventListener('click', () => {
        const label = btn.textContent.trim();
        this.handleQuickAction(label);
      });
    });

    // 关于我们链接
    const aboutLink = document.getElementById('aboutLink');
    if (aboutLink) {
      aboutLink.addEventListener('click', () => {
        window.electronAPI?.openExternal('https://github.com/SnowLeopard-io/CogitoAgent');
      });
    }

    // 快捷功能卡片
    document.querySelectorAll('.func-card').forEach(card => {
      card.addEventListener('click', () => {
        const funcName = card.textContent.trim();
        this.handleQuickFunction(funcName);
      });
    });

    // 加载会话列表
    this.loadSessions();

    console.log('[NavManager] 初始化完成');
  },

  /**
   * 加载会话列表
   */
  async loadSessions() {
    const sessionListEl = document.getElementById('sessionList');
    if (!sessionListEl) return;

    try {
      const sessions = await window.electronAPI?.getSessions();
      if (!sessions || sessions.length === 0) {
        sessionListEl.innerHTML = `
          <div class="session-empty">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
            <span>暂无会话</span>
          </div>
        `;
        return;
      }

      // 按最后活跃时间排序（最新的在前）
      sessions.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

      sessionListEl.innerHTML = sessions.map(session => `
        <div class="session-item ${session.isActive ? 'active' : ''}" data-session-id="${session.id}">
          <div class="session-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </div>
          <div class="session-info">
            <div class="session-name">${this.escapeHtml(session.name)}</div>
            <div class="session-preview">${session.preview ? this.escapeHtml(session.preview) : ''}</div>
            <div class="session-time">${this.formatTime(session.lastActiveAt)}</div>
          </div>
        </div>
      `).join('');

      // 绑定点击事件
      sessionListEl.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', () => {
          const sessionId = item.dataset.sessionId;
          this.switchToSession(sessionId);
        });
      });
    } catch (e) {
      console.error('[NavManager] 加载会话列表失败:', e);
      sessionListEl.innerHTML = `
        <div class="session-empty">
          <span>加载失败</span>
        </div>
      `;
    }
  },

  /**
   * 切换到指定会话
   */
  async switchToSession(sessionId) {
    console.log('[NavManager] 切换到会话:', sessionId);

    SkillsManager.hide();

    // 先切换视图，显示出聊天界面
    AppState.view = 'chat';
    document.getElementById('welcomeView').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';

    // 清空当前聊天
    ChatManager.clearMessages();

    // 加载历史消息
    try {
      console.log('[NavManager] 正在加载历史消息, sessionId:', sessionId);
      const history = await window.electronAPI?.getSessionHistory(sessionId);
      console.log('[NavManager] 历史消息加载完成, 条数:', history?.length);

      if (history && history.length > 0) {
        // 逐条添加历史消息
        for (const msg of history) {
          if (msg.role === 'user') {
            ChatManager.addMessage('user', msg.content);
          } else if (msg.role === 'assistant') {
            const filtered = Utils.filterToolBlocks(msg.content);
            if (filtered) {
              ChatManager.addMessage('assistant', Utils.renderMarkdown(filtered), { isHtml: true });
            }
          }
        }
      } else {
        // 空会话，显示提示
        ChatManager.addMessage('system', '新会话开始...');
      }
    } catch (e) {
      console.error('[NavManager] 加载历史消息失败:', e);
    }

    // 发送切换命令给 Agent（这会更新 meta.activeId）
    window.electronAPI?.switchSession(sessionId);

    // 重新加载列表以更新 active 状态
    setTimeout(() => this.loadSessions(), 500);
  },

  /**
   * 创建新会话
   */
  createNewSession() {
    console.log('[NavManager] 创建新会话');
    window.electronAPI?.sendMessage('/new');
    setTimeout(() => this.loadSessions(), 500);
    AppState.view = 'welcome';
    document.getElementById('welcomeView').style.display = 'flex';
    document.getElementById('chatView').style.display = 'none';
    ChatManager.clearMessages();
  },

  /**
   * 格式化时间
   */
  formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    // 一天内显示时间
    if (diff < 86400000) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    // 一周内显示星期
    if (diff < 604800000) {
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return days[date.getDay()];
    }
    // 更早显示日期
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  },

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  switchMode(mode) {
    AppState.currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === mode);
    });
    console.log('[NavManager] 切换模式:', mode);
  },

  newTask() {
    SkillsManager.hide();
    AppState.view = 'welcome';
    document.getElementById('welcomeView').style.display = 'flex';
    document.getElementById('chatView').style.display = 'none';
    ChatManager.clearMessages();
    const input = document.getElementById('chatInput');
    if (input) {
      input.value = '';
      Utils.autoResizeTextarea(input);
      input.focus();
    }
    console.log('[NavManager] 新建任务');
  },

  handleQuickAction(label) {
    console.log('[NavManager] 快速操作:', label);
    // 技能按钮 → 打开技能视图
    if (label === '技能') {
      AppState.view = 'welcome';
      document.getElementById('welcomeView').style.display = 'none';
      document.getElementById('chatView').style.display = 'none';
      SkillsManager.show();
      return;
    }
    // 进入对话视图，预置提示词
    ChatManager.enterChatView();
    const prompts = {
      '自动化': '请帮我创建一个自动化任务，我需要...',
    };
    const prompt = prompts[label] || `请帮我处理${label}相关的任务。`;
    const inputBottom = document.getElementById('chatInputBottom');
    if (inputBottom) {
      inputBottom.value = prompt;
      Utils.autoResizeTextarea(inputBottom);
      inputBottom.focus();
    }
  },

  handleQuickFunction(funcName) {
    console.log('[NavManager] 快捷功能:', funcName);
    ChatManager.enterChatView();
    const prompts = {
      '网页读取': '请帮我读取并分析以下网页内容：',
      '调研分析': '请帮我做一个调研分析，主题是：',
      '数据挖掘': '请帮我进行数据挖掘，分析以下数据：',
      '文件管理': '请帮我管理文件，我需要：',
    };
    const prompt = prompts[funcName] || `请帮我进行${funcName}。`;
    const inputBottom = document.getElementById('chatInputBottom');
    if (inputBottom) {
      inputBottom.value = prompt;
      Utils.autoResizeTextarea(inputBottom);
      inputBottom.focus();
      inputBottom.setSelectionRange(inputBottom.value.length, inputBottom.value.length);
    }
  },

  switchToDesktop() {
    console.log('[NavManager] 切换到桌宠模式');
    window.electronAPI?.switchToDesktop();
  },
};

// ============================================================
// 技能管理模块
// ============================================================
const SkillsManager = {
  skillsEl: null,
  gridEl: null,
  _expandedCategories: new Set(),

  init() {
    this.skillsEl = document.getElementById('skillsView');
    this.gridEl = document.getElementById('skillsGrid');
    this.render();
    console.log('[SkillsManager] 初始化完成');
  },

  render() {
    if (!this.gridEl) return;

    this.gridEl.innerHTML = TOOL_CATEGORIES.map(cat => {
      const isExpanded = this._expandedCategories.has(cat.id);
      const catTools = cat.tools || [];
      const dangerTools = new Set(DANGEROUS_TOOLS);

      return `
        <div class="skill-category-card" data-category="${cat.id}">
          <div class="skill-category-header">
            <div class="skill-category-icon">${cat.icon}</div>
            <div class="skill-category-name">${cat.name}</div>
            <div class="skill-category-count">${catTools.length} 个工具</div>
            <div class="skill-category-expand ${isExpanded ? 'expanded' : ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </div>
          </div>
          <div class="skill-tool-list ${isExpanded ? '' : 'collapsed'}">
            ${catTools.map(tool => {
              const isDanger = dangerTools.has(tool);
              return `<span class="skill-tool-chip ${isDanger ? 'danger' : ''}">${isDanger ? '⚠️ ' : ''}${tool}</span>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击展开/收起
    this.gridEl.querySelectorAll('.skill-category-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.skill-category-card');
        const catId = card.dataset.category;
        const toolList = card.querySelector('.skill-tool-list');
        const expandIcon = card.querySelector('.skill-category-expand');

        if (this._expandedCategories.has(catId)) {
          this._expandedCategories.delete(catId);
          toolList.classList.add('collapsed');
          expandIcon.classList.remove('expanded');
        } else {
          this._expandedCategories.add(catId);
          toolList.classList.remove('collapsed');
          expandIcon.classList.add('expanded');
        }
      });
    });
  },

  show() {
    if (this.skillsEl) this.skillsEl.style.display = 'flex';
    AppState.view = 'skills';
  },

  hide() {
    if (this.skillsEl) this.skillsEl.style.display = 'none';
  },
};

// ============================================================
// 对话管理模块
// ============================================================
const ChatManager = {
  messagesEl: null,
  sendBtnTop: null,
  sendBtnBottom: null,
  inputTop: null,
  inputBottom: null,

  // 流式渲染状态（双缓冲 + 节流）
  _streamBuffer: '',
  _streamPending: false,
  _streamBubble: null,
  _streamLastRenderedLen: 0,

  init() {
    this.messagesEl = document.getElementById('chatMessages');
    this.sendBtnTop = document.getElementById('sendBtn');
    this.sendBtnBottom = document.getElementById('sendBtnBottom');
    this.inputTop = document.getElementById('chatInput');
    this.inputBottom = document.getElementById('chatInputBottom');

    MessageRenderer.init({
      messagesEl: this.messagesEl,
      layout: 'dashboard',
      showAvatar: true,
      userAvatarText: '我',
      assistantAvatarText: 'AI',
      emptyHintIcon: 'Cogito Agent',
      emptyHintText: '有什么可以帮你的？',
    });

    // 顶部发送按钮
    if (this.sendBtnTop) {
      this.sendBtnTop.addEventListener('click', () => this.handleSendFromWelcome());
    }

    // 底部发送按钮
    if (this.sendBtnBottom) {
      this.sendBtnBottom.addEventListener('click', () => this.handleSendFromChat());
    }

    // 输入框事件
    if (this.inputTop) {
      this.inputTop.addEventListener('input', () => Utils.autoResizeTextarea(this.inputTop));
      this.inputTop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendFromWelcome();
        }
      });
    }

    if (this.inputBottom) {
      this.inputBottom.addEventListener('input', () => Utils.autoResizeTextarea(this.inputBottom));
      this.inputBottom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendFromChat();
        }
      });
    }

    // 监听 Agent 回复
    if (window.electronAPI?.onReply) {
      window.electronAPI.onReply((data) => this.handleReply(data));
    }

    // 监听状态变化
    if (window.electronAPI?.onStateChange) {
      window.electronAPI.onStateChange((state) => this.handleStateChange(state));
    }

    // 监听历史
    if (window.electronAPI?.onHistory) {
      window.electronAPI.onHistory((history) => this.loadHistory(history));
    }

    // 请求历史
    if (window.electronAPI?.requestHistory) {
      window.electronAPI.requestHistory();
    }

    console.log('[ChatManager] 初始化完成');
  },

  enterChatView() {
    if (AppState.view === 'chat') return;
    SkillsManager.hide();
    AppState.view = 'chat';
    document.getElementById('welcomeView').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';
    this.clearEmptyHint();
    this.inputBottom?.focus();
  },

  clearMessages() {
    if (!this.messagesEl) return;
    MessageRenderer.clearMessages();
    AppState.currentAssistantBubble = null;
  },

  clearEmptyHint() {
    MessageRenderer.clearEmptyHint();
  },

  handleSendFromWelcome() {
    const text = this.inputTop.value.trim();
    if (!text) return;
    this.enterChatView();
    this.sendMessage(text);
    this.inputTop.value = '';
    Utils.autoResizeTextarea(this.inputTop);
  },

  handleSendFromChat() {
    const text = this.inputBottom.value.trim();
    if (!text) return;
    this.sendMessage(text);
    this.inputBottom.value = '';
    Utils.autoResizeTextarea(this.inputBottom);
  },

  sendMessage(text) {
    // 正在处理中 → 点击打断
    if (AppState.isProcessing) {
      window.electronAPI?.sendMessage('\n');
      return;
    }

    this.clearEmptyHint();
    this.addMessage('user', text);
    AppState.setProcessing(true);

    window.electronAPI?.sendMessage(text);
    console.log('[ChatManager] 发送消息:', text);
  },

  addMessage(type, content, extra = {}) {
    this.clearEmptyHint();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    if (extra.className) msgDiv.classList.add(extra.className);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'user' ? '我' : 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (extra.isHtml) {
      bubble.innerHTML = Utils.sanitizeHtml(content);
    } else {
      bubble.textContent = content;
    }

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    contentDiv.appendChild(bubble);
    contentDiv.appendChild(time);
    if (type === 'user') {
      // 用户消息：内容左，头像右
      msgDiv.appendChild(contentDiv);
      msgDiv.appendChild(avatar);
    } else {
      // 助手消息：头像左，内容右
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(contentDiv);
    }
    this.messagesEl.appendChild(msgDiv);
    this.scrollToBottom();

    return { msgDiv, bubble };
  },

  updateSendButtonState() {
    const btns = [this.sendBtnTop, this.sendBtnBottom].filter(Boolean);
    btns.forEach(btn => {
      if (AppState.isProcessing) {
        btn.style.background = '#e17055';
        btn.title = '点击终止';
        const svg = btn.querySelector('svg path');
        if (svg) {
          svg.setAttribute('d', 'M6 6h12v12H6z');
        }
      } else {
        btn.style.background = '';
        btn.title = '发送';
        const svg = btn.querySelector('svg path');
        if (svg) {
          svg.setAttribute('d', 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z');
        }
      }
    });
  },

  handleReply(data) {
    switch (data.type) {
      case 'user':
        this.addMessage('user', data.content);
        break;

      case 'chunk': {
        const fullText = data.full || data.content;
        const filtered = Utils.filterToolBlocks(fullText);
        if (!filtered) break;

        // 第一次收到内容，创建气泡
        if (!AppState.currentAssistantBubble) {
          AppState.currentAssistantBubble = this.addMessage('assistant', '', { isHtml: true });
          this._startStream(AppState.currentAssistantBubble.bubble);
        }

        // 写入缓冲区，调度渲染
        this._appendToStream(filtered);
        break;
      }

      case 'tool-start': {
        const toolKey = `${data.tool}:${JSON.stringify(data.args)}`;
        if (toolKey === AppState.lastToolKey) break;
        AppState.lastToolKey = toolKey;
        setTimeout(() => {
          if (AppState.lastToolKey === toolKey) AppState.lastToolKey = '';
        }, 500);

        // 如果当前助手消息为空则移除
        if (AppState.currentAssistantBubble) {
          const { bubble } = AppState.currentAssistantBubble;
          if (bubble && !bubble.textContent.trim()) {
            AppState.currentAssistantBubble.msgDiv.remove();
          }
        }
        AppState.currentAssistantBubble = null;

        this.addToolCall(data.tool, data.args);
        break;
      }

      case 'tool-result':
        this.addToolResult(data.tool, data.data, data.success);
        break;

      case 'end': {
        // 完成流式渲染，最终全量渲染一次 Markdown
        this._flushStream(true);
        if (AppState.currentAssistantBubble) {
          AppState.currentAssistantBubble.bubble.classList.remove('typing-cursor');
        }
        AppState.currentAssistantBubble = null;

        // 根据 nextAction 设置状态
        const nextAction = data.nextAction || 'wait';
        AppState.isWaiting = (nextAction === 'wait');
        AppState.setProcessing(false);
        console.log('[ChatManager] 消息结束，下一步:', nextAction);
        break;
      }

      case 'error':
        if (AppState.currentAssistantBubble) {
          AppState.currentAssistantBubble.bubble.classList.remove('typing-cursor');
        }
        AppState.currentAssistantBubble = null;
        this.addMessage('assistant', `⚠️ ${data.message}`, {
          className: 'error',
        });
        AppState.setProcessing(false);
        break;
    }
  },

  addToolCall(toolName, args) {
    MessageRenderer.addToolCall(toolName, args);
  },

  addToolResult(toolName, data, success = true) {
    MessageRenderer.addToolResult(toolName, data, success);
  },

  handleStateChange(state) {
    console.log('[ChatManager] Agent 状态:', state);
    if (state === 'thinking') {
      // 强制清理旧气泡，确保新回复开始时创建新气泡
      if (AppState.currentAssistantBubble) {
        if (AppState.currentAssistantBubble.bubble) {
          AppState.currentAssistantBubble.bubble.classList.remove('typing-cursor');
        }
        AppState.currentAssistantBubble = null;
      }
      AppState.setProcessing(true);
      AppState.isWaiting = false;
    } else if (state === 'idle') {
      AppState.setProcessing(false);
    }
  },

  // ============== 流式渲染（双缓冲 + rAF 节流 + 纯文本增量） ==============

  _startStream(bubbleEl) {
    this._streamBuffer = '';
    this._streamPending = false;
    this._streamBubble = bubbleEl;
    this._streamLastLen = 0;
    this._streamTextNode = null;

    // 创建文本节点（光标用 CSS ::after）
    const textNode = document.createTextNode('');
    bubbleEl.appendChild(textNode);
    this._streamTextNode = textNode;

    // 添加光标类（CSS ::after 方式）
    bubbleEl.classList.add('typing-cursor');
  },

  _appendToStream(text) {
    this._streamBuffer = text;

    if (!this._streamPending) {
      this._streamPending = true;
      requestAnimationFrame(() => this._flushStream(false));
    }
  },

  _flushStream(isFinal) {
    this._streamPending = false;

    const bubble = this._streamBubble;
    if (!bubble) return;

    const text = this._streamBuffer;

    if (isFinal) {
      // 最终渲染：全量 Markdown + 移除光标
      bubble.classList.remove('typing-cursor');
      bubble.innerHTML = Utils.renderMarkdown(text);
      this._streamBubble = null;
      this._streamBuffer = '';
      this._streamLastLen = 0;
      this._streamTextNode = null;
      this.scrollToBottom();
      return;
    }

    // 流式过程中：只用 textContent 更新文本节点，不重建 DOM
    if (this._streamTextNode && text.length > this._streamLastLen) {
      this._streamTextNode.textContent = text;
      this._streamLastLen = text.length;
      this.scrollToBottom();
    }
  },

  loadHistory(history) {
    if (!history || history.length === 0) return;
    MessageRenderer.loadHistory(history);
  },

  scrollToBottom() {
    MessageRenderer.scrollToBottom();
  },
};

// ============================================================
// 应用入口
// ============================================================
function initApp() {
  console.log('[App] 初始化 Dashboard...');

  try {
    WindowManager.init();
  } catch (e) {
    console.error('[WindowManager] 初始化失败:', e);
  }

  try {
    PersonaUIManager.init();
  } catch (e) {
    console.error('[PersonaUIManager] 初始化失败:', e);
  }

  try {
    NavManager.init();
  } catch (e) {
    console.error('[NavManager] 初始化失败:', e);
  }

  try {
    SkillsManager.init();
  } catch (e) {
    console.error('[SkillsManager] 初始化失败:', e);
  }

  try {
    ChatManager.init();
  } catch (e) {
    console.error('[ChatManager] 初始化失败:', e);
  }

  // 初始化输入框高度
  Utils.autoResizeTextarea(document.getElementById('chatInput'));
  Utils.autoResizeTextarea(document.getElementById('chatInputBottom'));

  console.log('[App] Dashboard 初始化完成');
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
