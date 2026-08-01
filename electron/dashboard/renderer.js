/**
 * Dashboard 渲染进程 - 模块化重构
 * 模块: WindowManager / ChatManager / NavManager / AppState
 * 公共组件: SharedUtils / PersonaManager / MessageRenderer (来自 ../shared/)
 */

// 环境粒子生成 — 背景氛围（磷光浮点）
// 原为 index.html 内联 <script>，为 CSP 安全（移除 unsafe-inline）外迁至此。
(function () {
  const container = document.getElementById('ambientParticles');
  if (!container) return;
  const PARTICLE_COUNT = 28;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    const size = (1 + Math.random() * 2.2).toFixed(2);
    p.style.left = (Math.random() * 100).toFixed(2) + '%';
    p.style.top = (Math.random() * 100).toFixed(2) + '%';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.animationDelay = (Math.random() * -14).toFixed(2) + 's';
    p.style.animationDuration = (10 + Math.random() * 12).toFixed(2) + 's';
    p.style.setProperty('--particle-opacity', (0.15 + Math.random() * 0.4).toFixed(2));
    frag.appendChild(p);
  }
  container.appendChild(frag);
})();

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
    code: 'FILE',
    tools: ['ls', 'read', 'copy', 'mkdir', 'create'],
  },
  {
    id: 'web',
    name: '网络工具',
    code: 'WEB',
    tools: ['search', 'browse', 'fetchPage'],
  },
  {
    id: 'system',
    name: '系统操作',
    code: 'SYS',
    tools: ['listApps', 'openApp', 'closeApp'],
  },
  {
    id: 'browser',
    name: '浏览器自动化',
    code: 'BROW',
    tools: [
      'initBrowser',
      'clickElement',
      'fillField',
      'selectOption',
      'viewChanges',
      'getPageContent',
      'takeScreenshot',
      'closeBrowser',
      'searchOnPage',
      'findElements',
      'searchOnEngine',
      'downloadFile',
    ],
  },
  {
    id: 'code',
    name: '代码执行',
    code: 'CODE',
    tools: ['executeCode', 'executeFile', 'runJavaScript', 'runPython', 'formatCode'],
  },
  {
    id: 'git',
    name: 'Git 版本控制',
    code: 'GIT',
    tools: [
      'gitInit',
      'gitClone',
      'gitAdd',
      'gitCommit',
      'gitPush',
      'gitPull',
      'gitStatus',
      'gitLog',
      'gitBranchCreate',
      'gitBranchDelete',
      'gitCheckout',
      'gitCheckoutNew',
      'gitMerge',
      'gitDiff',
      'gitRemoteAdd',
      'gitRemoteList',
      'gitConfigUser',
      'gitReset',
      'gitStash',
      'gitStashPop',
    ],
  },
  {
    id: 'task',
    name: '任务管理',
    code: 'TASK',
    tools: [
      'createTask',
      'getTasks',
      'getTask',
      'updateTask',
      'deleteTask',
      'completeTask',
      'splitTask',
      'getTaskStats',
      'clearTasks',
    ],
  },
  {
    id: 'memory',
    name: '记忆系统',
    code: 'MEM',
    tools: [
      'addMemory',
      'searchMemory',
      'getAllMemories',
      'getMemory',
      'updateMemory',
      'deleteMemory',
      'getMemoryStats',
      'getRelatedMemories',
      'clearMemory',
    ],
  },
  {
    id: 'data',
    name: '数据处理',
    code: 'DATA',
    tools: [
      'readCSV',
      'writeCSV',
      'readJSON',
      'writeJSON',
      'csvToJSON',
      'jsonToCSV',
      'queryData',
      'analyzeData',
      'sortData',
    ],
  },
  {
    id: 'db',
    name: '数据库',
    code: 'DB',
    tools: [
      'executeSQL',
      'query',
      'insert',
      'update',
      'deleteData',
      'createTable',
      'dropTable',
      'getTables',
      'getTableSchema',
      'executeTransaction',
      'closeDB',
    ],
  },
  {
    id: 'email',
    name: '邮件功能',
    code: 'MAIL',
    tools: [
      'sendEmail',
      'sendTextEmail',
      'sendHtmlEmail',
      'sendTemplateEmail',
      'sendEmailWithAttachments',
      'checkEmailConfig',
    ],
  },
  {
    id: 'monitor',
    name: '系统监控',
    code: 'MON',
    tools: [
      'getCPUInfo',
      'getMemoryInfo',
      'getDiskInfo',
      'getNetworkInfo',
      'getProcesses',
      'getSystemInfo',
      'getCurrentProcess',
      'getSystemLoad',
      'monitorSystem',
    ],
  },
  {
    id: 'scheduler',
    name: '定时任务',
    code: 'CRON',
    tools: [
      'addScheduleTask',
      'getScheduleTasks',
      'getScheduleTask',
      'updateScheduleTask',
      'toggleScheduleTask',
      'removeScheduleTask',
      'startScheduler',
      'stopScheduler',
    ],
  },
  {
    id: 'ocr',
    name: '图像文字识别',
    code: 'OCR',
    tools: ['ocr', 'ocrBatch'],
  },
  {
    id: 'vision',
    name: '视觉分析',
    code: 'VIS',
    tools: ['vision', 'visionFromUrl'],
  },
  {
    id: 'office',
    name: 'Office 文档',
    code: 'DOC',
    tools: ['createPpt', 'createWord', 'createExcel', 'readExcel'],
  },
  {
    id: 'cluster',
    name: '集群管理',
    code: 'NODE',
    tools: [
      'spawnAgent',
      'delegateTask',
      'getClusterStatus',
      'stopAgent',
      'stopAllAgents',
      'parallelExecute',
      'getAgent',
    ],
  },
];

// 危险操作列表（来自 registry.js）
const DANGEROUS_TOOLS = new Set([
  'gitPush',
  'gitReset',
  'gitBranchDelete',
  'executeCode',
  'executeFile',
  'runJavaScript',
  'runPython',
  'deleteData',
  'dropTable',
  'clearTasks',
  'clearMemory',
  'removeScheduleTask',
]);

// ============================================================
// 应用状态模块
// ============================================================
const AppState = {
  isProcessing: false,
  isWaiting: false, // Agent 是否在等待用户输入
  currentAssistantBubble: null,
  lastToolKey: '',
  currentMode: 'work', // work / code / design
  view: 'welcome', // welcome / chat
  currentSessionId: null, // 追踪当前会话 ID
  wechatSessionId: null, // 微信通道会话 ID

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
// Toast 提示模块 - 使用公共 ToastManager
// ============================================================
// 复用 shared/toast.js 中的 window.ToastManager

// ============================================================
// Token 用量监控模块 - 使用公共 TokenManager
// ============================================================
// 复用 shared/token-manager.js 中的 window.TokenManager

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

    // 监听人设切换事件，自动更新媒体资源
    window.electronAPI?.onPersonaSwitched?.((data) => {
      console.log('[PersonaUIManager] Persona 已切换:', data.persona);
      // 同步主进程的 currentPersona
      window.electronAPI?.updateCurrentPersona(data.persona);
      PersonaManager.loadPersonaMedia();
    });
  },
};

// ============================================================
// Persona 选择弹窗模块
// ============================================================
const PersonaSelectModal = {
  callback: null,
  selectedPersona: '',

  async show(callback) {
    this.callback = callback;
    this.selectedPersona = '';
    const modal = document.getElementById('personaModal');
    const grid = document.getElementById('personaModalGrid');
    const confirmBtn = document.getElementById('personaModalConfirm');
    if (!modal || !grid) return;

    // 重置状态
    confirmBtn.disabled = true;
    grid.innerHTML = '';

    // 加载 personas
    try {
      const personas = await window.electronAPI.getPersonas();

      // 默认选项
      const defaultCard = this._createCard('', '默认', '无特定性格');
      grid.appendChild(defaultCard);

      for (const p of personas) {
        const card = this._createCard(p.id, p.name, p.id);
        grid.appendChild(card);
      }
    } catch (e) {
      console.error('[PersonaSelectModal] 加载 personas 失败:', e);
    }

    // 绑定点击事件
    grid.querySelectorAll('.persona-card').forEach((card) => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.persona-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedPersona = card.dataset.persona;
        confirmBtn.disabled = false;
      });
    });

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定按钮事件
    document.getElementById('personaModalConfirm').onclick = () => this._confirm();
    document.getElementById('personaModalCancel').onclick = () => this._cancel();
    document.getElementById('personaModalClose').onclick = () => this._cancel();
    modal.onclick = (e) => {
      if (e.target === modal) this._cancel();
    };
  },

  hide() {
    const modal = document.getElementById('personaModal');
    if (modal) modal.style.display = 'none';
  },

  _confirm() {
    this.hide();
    if (this.callback) {
      this.callback(this.selectedPersona);
    }
  },

  _cancel() {
    this.hide();
    // 取消则不创建会话
  },

  _createCard(id, name, desc) {
    const card = document.createElement('div');
    card.className = 'persona-card';
    card.dataset.persona = id;
    card.innerHTML = `
      <div class="persona-name">${name}</div>
      <div class="persona-desc">${desc}</div>
    `;
    return card;
  },
};

// ============================================================
// 窗口控制模块 - 使用公共 WindowControls
// ============================================================
const WindowManager = {
  init() {
    WindowControls.init();
  },
};

// ============================================================
// 导航栏模块
// ============================================================
const NavManager = {
  init() {
    // Work/Code/Design 模式切换
    document.querySelectorAll('.mode-tab').forEach((tab) => {
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
    skillBtns.forEach((btn) => {
      if (btn.id === 'newTaskBtn') return;
      if (btn.id === 'desktopModeBtn') {
        btn.addEventListener('click', () => this.switchToDesktop());
        return;
      }
      if (btn.id === 'monitorBtn') {
        btn.addEventListener('click', () => {
          window.electronAPI?.openMonitor();
        });
        return;
      }
      if (btn.id === 'wechatBtn') {
        btn.addEventListener('click', () => {
          this.connectWechat();
        });
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

    // 重新配置按钮 — 打开 Setup 向导
    const reconfigLink = document.getElementById('reconfigLink');
    if (reconfigLink) {
      reconfigLink.addEventListener('click', () => {
        window.electronAPI?.openSetup();
      });
    }

    // 仓库源链接 — 欢迎页双仓库标识条
    document.querySelectorAll('.repo-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url) {
          window.electronAPI?.openExternal(url);
        }
      });
    });

    // 快捷功能卡片 — 支持 .func-card (旧) 与 .module-entry (新, 带 data-func)
    document.querySelectorAll('.func-card, .module-entry').forEach((card) => {
      card.addEventListener('click', () => {
        const funcName = card.dataset.func || card.textContent.trim();
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
        // 同步更新欢迎页状态条
        const countEl = document.getElementById('welcomeSessionCount');
        if (countEl) countEl.textContent = '00';
        return;
      }

      // 同步更新欢迎页状态条会话计数
      const countEl = document.getElementById('welcomeSessionCount');
      if (countEl) {
        countEl.textContent = String(sessions.length).padStart(2, '0');
      }

      // 按最后活跃时间排序（最新的在前）
      sessions.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

      sessionListEl.innerHTML = sessions
        .map(
          (session) => `
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
      `,
        )
        .join('');

      // 绑定点击事件
      sessionListEl.querySelectorAll('.session-item').forEach((item) => {
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
    if (AppState.isProcessing) {
      ToastManager.warning('AI 正在思考中，请等待回复完成后再切换会话');
      return;
    }

    console.log('[NavManager] 切换到会话:', sessionId);

    SkillsManager.hide();

    AppState.setProcessing(false);
    AppState.currentAssistantBubble = null;

    // 先切换视图，显示出聊天界面
    AppState.view = 'chat';
    document.getElementById('welcomeView').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';

    // 清空当前聊天
    ChatManager.clearMessages();

    // 微信通道会话：加载微信历史消息（工具气泡样式）
    if (AppState.wechatSessionId && sessionId === AppState.wechatSessionId) {
      try {
        const wechatHistory = await window.electronAPI?.getWechatHistory();
        if (wechatHistory && wechatHistory.length > 0) {
          for (const msg of wechatHistory) {
            if (msg.direction === 'received') {
              ChatManager.addToolCall('微信收到', { from: msg.from, text: msg.text });
            } else if (msg.direction === 'sent') {
              ChatManager.addToolResult('微信回复', { to: msg.to, text: msg.text }, true);
            }
          }
        } else {
          ChatManager.addMessage('system', '等待微信消息...');
        }
      } catch (e) {
        console.error('[NavManager] 加载微信历史消息失败:', e);
      }
    } else {
      // 普通会话：加载常规历史消息
      try {
        console.log('[NavManager] 正在加载历史消息, sessionId:', sessionId);
        const history = await window.electronAPI?.getSessionHistory(sessionId);
        console.log('[NavManager] 历史消息加载完成, 条数:', history?.length);

        if (history && history.length > 0) {
          for (const msg of history) {
            if (msg.role === 'user') {
              ChatManager.addMessage('user', msg.content);
            } else if (msg.role === 'assistant') {
              const filtered = Utils.filterToolBlocks(msg.content);
              if (filtered) {
                ChatManager.addMessage('assistant', Utils.renderMarkdown(filtered), {
                  isHtml: true,
                });
              }
            }
          }
        } else {
          ChatManager.addMessage('system', '新会话开始...');
        }
      } catch (e) {
        console.error('[NavManager] 加载历史消息失败:', e);
      }
    }

    // 发送切换命令给 Agent（这会更新 meta.activeId）
    window.electronAPI?.switchSession(sessionId);

    // 记录当前会话 ID
    AppState.currentSessionId = sessionId;

    // 切换会话后刷新人设媒体资源
    setTimeout(() => PersonaManager.loadPersonaMedia(), 600);

    // 重新加载列表以更新 active 状态
    setTimeout(() => this.loadSessions(), 500);
  },

  /**
   * 创建新会话
   */
  createNewSession() {
    if (AppState.isProcessing) {
      ToastManager.warning('AI 正在思考中，请等待回复完成后再创建新会话');
      return;
    }

    // 显示人设选择弹窗
    PersonaSelectModal.show((persona) => {
      console.log('[NavManager] 创建新会话, 人设:', persona || '默认');
      AppState.setProcessing(false);
      AppState.currentAssistantBubble = null;

      // 发送创建命令，携带人设参数
      const cmd = persona ? `/new ${persona}` : '/new';
      window.electronAPI?.sendMessage(cmd);

      ChatManager.clearMessages();
      ChatManager.enterChatView();

      const input = document.getElementById('chatInputBottom');
      if (input) {
        input.value = '';
        Utils.autoResizeTextarea(input);
        input.focus();
      }

      setTimeout(() => this.loadSessions(), 500);
    });
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
    document.querySelectorAll('.mode-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === mode);
    });
    console.log('[NavManager] 切换模式:', mode);
  },

  newTask() {
    if (AppState.isProcessing) {
      ToastManager.warning('AI 正在思考中，请等待回复完成后再创建新会话');
      return;
    }

    SkillsManager.hide();
    AppState.setProcessing(false);
    AppState.currentAssistantBubble = null;

    // 显示人设选择弹窗
    PersonaSelectModal.show((persona) => {
      const cmd = persona ? `/new ${persona}` : '/new';
      window.electronAPI?.sendMessage(cmd);

      ChatManager.clearMessages();
      ChatManager.enterChatView();

      const input = document.getElementById('chatInputBottom');
      if (input) {
        input.value = '';
        Utils.autoResizeTextarea(input);
        input.focus();
      }

      setTimeout(() => this.loadSessions(), 500);
      console.log('[NavManager] 新建任务, 人设:', persona || '默认');
    });
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
      自动化: '请帮我创建一个自动化任务，我需要...',
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
      网页读取: '请帮我读取并分析以下网页内容：',
      调研分析: '请帮我做一个调研分析，主题是：',
      数据挖掘: '请帮我进行数据挖掘，分析以下数据：',
      文件管理: '请帮我管理文件，我需要：',
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

  connectWechat() {
    window.electronAPI?.loginWechat();
  },

  updateWechatState(state) {
    this._wechatConnected = !!state.connected;
    const label = document.getElementById('wechatBtnLabel');
    const btn = document.getElementById('wechatBtn');
    if (!label || !btn) return;

    if (state.connected) {
      if (state.sessionId) {
        AppState.wechatSessionId = state.sessionId;
      }
      label.textContent = '微信通道';
      btn.classList.add('wechat-connected');
      btn.title = '点击进入微信会话';
      const modal = document.getElementById('wechatQrModal');
      if (modal) modal.style.display = 'none';

      if (state.sessionId && AppState.currentSessionId !== state.sessionId) {
        this.switchToSession(state.sessionId);
      }
    } else {
      label.textContent = '连接微信';
      btn.classList.remove('wechat-connected');
      btn.title = '连接微信';
    }
  },

  handleWechatMessage(msg) {
    const { direction, from, text } = msg;
    if (direction === 'received') {
      ChatManager.addToolCall('微信收到', { from, text });
    } else if (direction === 'sent') {
      ChatManager.addToolResult('微信回复', { to: from, text }, true);
    }
  },

  showWechatQRCode(data) {
    const modal = document.getElementById('wechatQrModal');
    const img = document.getElementById('wechatQrImage');
    const status = document.getElementById('wechatQrStatus');
    if (!modal || !img) return;

    if (data.qrCode) {
      img.src = data.qrCode;
      if (status) status.textContent = '请使用微信扫描二维码';
    }
    modal.style.display = 'flex';

    const closeBtn = document.getElementById('wechatQrClose');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }
  },

  updateWechatLoginStatus(data) {
    const statusEl = document.getElementById('wechatQrStatus');
    if (statusEl && data.status) {
      statusEl.textContent = data.status;
    }
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

    // 概览统计
    const totalCategories = TOOL_CATEGORIES.length;
    const totalTools = TOOL_CATEGORIES.reduce((sum, c) => sum + (c.tools ? c.tools.length : 0), 0);
    const dangerTools = new Set(DANGEROUS_TOOLS);
    const totalDanger = [...dangerTools].filter((t) =>
      TOOL_CATEGORIES.some((c) => c.tools && c.tools.includes(t)),
    ).length;

    const statsEl = document.getElementById('skillsStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-item">
          <span class="stat-val">${totalCategories}</span>
          <span class="stat-label">CATEGORIES</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-val">${totalTools}</span>
          <span class="stat-label">TOOLS</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item critical">
          <span class="stat-val">${totalDanger}</span>
          <span class="stat-label">CRITICAL</span>
        </div>
      `;
    }

    this.gridEl.innerHTML = TOOL_CATEGORIES.map((cat) => {
      const isExpanded = this._expandedCategories.has(cat.id);
      const catTools = cat.tools || [];
      const catDangerCount = catTools.filter((t) => dangerTools.has(t)).length;

      return `
        <div class="skill-category-card" data-category="${cat.id}">
          <div class="skill-category-header">
            <div class="skill-category-code">${cat.code || cat.id.toUpperCase()}</div>
            <div class="skill-category-info">
              <div class="skill-category-name">${cat.name}</div>
              <div class="skill-category-meta">${catTools.length} TOOLS${catDangerCount ? ` · ${catDangerCount} CRITICAL` : ''}</div>
            </div>
            <div class="skill-category-expand ${isExpanded ? 'expanded' : ''}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </div>
          </div>
          <div class="skill-tool-list ${isExpanded ? '' : 'collapsed'}">
            ${catTools
              .map((tool) => {
                const isDanger = dangerTools.has(tool);
                return `<span class="skill-tool-chip ${isDanger ? 'danger' : ''}">${tool}</span>`;
              })
              .join('')}
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击展开/收起
    this.gridEl.querySelectorAll('.skill-category-header').forEach((header) => {
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
      this.sendBtnTop.addEventListener('click', () => {
        if (AppState.isProcessing) {
          this.stopProcessing();
        } else {
          this.handleSendFromWelcome();
        }
      });
    }

    // 底部发送按钮
    if (this.sendBtnBottom) {
      this.sendBtnBottom.addEventListener('click', () => {
        if (AppState.isProcessing) {
          this.stopProcessing();
        } else {
          this.handleSendFromChat();
        }
      });
    }

    // 输入框事件
    if (this.inputTop) {
      this.inputTop.addEventListener('input', () => Utils.autoResizeTextarea(this.inputTop));
      this.inputTop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !AppState.isProcessing) {
          e.preventDefault();
          this.handleSendFromWelcome();
        }
      });
    }

    if (this.inputBottom) {
      this.inputBottom.addEventListener('input', () => Utils.autoResizeTextarea(this.inputBottom));
      this.inputBottom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !AppState.isProcessing) {
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

    // 监听会话列表更新（meta.json 刷新后由主进程推送）
    if (window.electronAPI?.onSessionUpdated) {
      window.electronAPI.onSessionUpdated(() => NavManager.loadSessions());
    }

    // 请求历史
    if (window.electronAPI?.requestHistory) {
      window.electronAPI.requestHistory();
    }

    // 微信状态监听
    if (window.electronAPI?.onWechatState) {
      window.electronAPI.onWechatState((state) => NavManager.updateWechatState(state));
    }
    if (window.electronAPI?.onWechatMessage) {
      window.electronAPI.onWechatMessage((msg) => NavManager.handleWechatMessage(msg));
    }
    if (window.electronAPI?.onWechatQRCode) {
      window.electronAPI.onWechatQRCode((data) => NavManager.showWechatQRCode(data));
    }
    if (window.electronAPI?.onWechatLoginStatus) {
      window.electronAPI.onWechatLoginStatus((data) => NavManager.updateWechatLoginStatus(data));
    }
    if (window.electronAPI?.requestWechatStatus) {
      window.electronAPI.requestWechatStatus();
    }

    // 拦截消息区域内的链接点击，在系统浏览器中打开
    this.messagesEl?.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        const url = link.href;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          e.preventDefault();
          window.electronAPI?.openExternal(url);
        }
      }
    });

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

    window.electronAPI?.sendMessage('/new');

    this.enterChatView();
    this.sendMessage(text);
    this.inputTop.value = '';
    Utils.autoResizeTextarea(this.inputTop);

    setTimeout(() => NavManager.loadSessions(), 500);
  },

  handleSendFromChat() {
    const text = this.inputBottom.value.trim();
    if (!text) return;
    this.sendMessage(text);
    this.inputBottom.value = '';
    Utils.autoResizeTextarea(this.inputBottom);
  },

  sendMessage(text) {
    if (AppState.isProcessing) {
      return;
    }

    this.clearEmptyHint();
    this.addMessage('user', text);
    AppState.setProcessing(true);

    window.electronAPI?.sendMessage(text);
    console.log('[ChatManager] 发送消息:', text);
  },

  stopProcessing() {
    if (!AppState.isProcessing) {
      return;
    }

    window.electronAPI?.sendMessage('/stop');
    console.log('[ChatManager] 发送停止命令');

    // 超时保护：若 8 秒后仍处于处理态，强制恢复按钮状态
    if (this._stopTimer) clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => {
      this._stopTimer = null;
      if (AppState.isProcessing) {
        console.warn('[ChatManager] 停止命令超时，强制恢复');
        AppState.setProcessing(false);
      }
    }, 8000);
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
    btns.forEach((btn) => {
      if (AppState.isProcessing) {
        btn.style.background = '#dc2626';
        btn.style.borderColor = '#f87171';
        btn.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.1)';
        btn.style.color = '#fff';
        btn.title = '点击终止';
        const svg = btn.querySelector('svg path');
        if (svg) {
          svg.setAttribute('d', 'M6 6h12v12H6z');
        }
      } else {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.boxShadow = '';
        btn.style.color = '';
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
        AppState.isWaiting = nextAction === 'wait';
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
// 欢迎页遥测模块 — 实时时间 / Uptime
// ============================================================
const WelcomeTelemetryManager = {
  _startTime: Date.now(),
  _timer: null,

  init() {
    this._tick();
    this._timer = setInterval(() => this._tick(), 1000);
    console.log('[WelcomeTelemetryManager] 初始化完成');
  },

  _tick() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    const timeEl = document.getElementById('welcomeTime');
    if (timeEl) timeEl.textContent = `${hh}:${mm}:${ss}`;

    const uptimeEl = document.getElementById('welcomeUptime');
    if (uptimeEl) {
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      uptimeEl.textContent = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
    }
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
    TokenManager.init();
  } catch (e) {
    console.error('[TokenManager] 初始化失败:', e);
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

  try {
    WelcomeTelemetryManager.init();
  } catch (e) {
    console.error('[WelcomeTelemetryManager] 初始化失败:', e);
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
