/* ============================================================
 *  CogitoAgent I18N - 前端国际化运行时 (zh / en / es / hu / ru)
 *  适用于所有 Electron 渲染进程页面及 introduction 静态预览页。
 *
 *  用法:
 *    <script src="../shared/i18n.js"></script>   (置于其它 JS 之前)
 *      · HTML 元素: <span data-i18n="dashboard.name">...</span>
 *      · 占位符:    <input data-i18n-placeholder="chat.placeholder">
 *      · title:     <button data-i18n-title="win.close">
 *      · JS 动态:   I18N.t('skills.title')
 *      · 带插值:    I18N.t('common.greeting', { name: 'Cogito' })
 *    自动检测系统 locale；localStorage['cogito_lang'] 优先；未命中回退 zh。
 *    I18N.auto() 遍历并绑定所有含 data-* 的节点并注入语言切换器。
 *    语言变化会触发 document 'cogito:langchange' 事件。
 * ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'cogito_lang';
  const DEFAULT_LANG = 'zh';

  const SUPPORTED = ['zh', 'en', 'es', 'hu', 'ru'];

  const LANGUAGE_NAMES = {
    zh: { self: '简体中文', label: '中文', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
    en: { self: 'English', label: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    es: { self: 'Español', label: 'Español', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
    hu: { self: 'Magyar', label: 'Magyar', flag: '\uD83C\uDDED\uD83C\uDDFA' },
    ru: { self: 'Русский', label: 'Русский', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  };

  const MESSAGES = {
    /* ===================== 通用 ===================== */
    'common.yes': {
      zh: '是',
      en: 'Yes',
      es: 'Sí',
      hu: 'Igen',
      ru: 'Да',
    },
    'common.no': {
      zh: '否',
      en: 'No',
      es: 'No',
      hu: 'Nem',
      ru: 'Нет',
    },
    'common.cancel': {
      zh: '取消',
      en: 'Cancel',
      es: 'Cancelar',
      hu: 'Mégse',
      ru: 'Отмена',
    },
    'common.confirm': {
      zh: '确认',
      en: 'Confirm',
      es: 'Confirmar',
      hu: 'Megerősítés',
      ru: 'Подтвердить',
    },
    'common.close': {
      zh: '关闭',
      en: 'Close',
      es: 'Cerrar',
      hu: 'Bezárás',
      ru: 'Закрыть',
    },
    'common.minimize': {
      zh: '最小化',
      en: 'Minimize',
      es: 'Minimizar',
      hu: 'Kicsinyítés',
      ru: 'Свернуть',
    },
    'common.maximize': {
      zh: '最大化',
      en: 'Maximize',
      es: 'Maximizar',
      hu: 'Nagyítás',
      ru: 'Развернуть',
    },
    'common.send': {
      zh: '发送',
      en: 'Send',
      es: 'Enviar',
      hu: 'Küldés',
      ru: 'Отправить',
    },
    'common.loading': {
      zh: '加载中...',
      en: 'Loading...',
      es: 'Cargando...',
      hu: 'Betöltés...',
      ru: 'Загрузка...',
    },
    'common.retry': {
      zh: '重试',
      en: 'Retry',
      es: 'Reintentar',
      hu: 'Újra',
      ru: 'Повторить',
    },
    'common.settings': {
      zh: '设置',
      en: 'Settings',
      es: 'Ajustes',
      hu: 'Beállítások',
      ru: 'Настройки',
    },
    'common.about': {
      zh: '关于',
      en: 'About',
      es: 'Acerca de',
      hu: 'Névjegy',
      ru: 'О программе',
    },
    'common.openBrowser': {
      zh: '在浏览器中打开',
      en: 'Open in browser',
      es: 'Abrir en el navegador',
      hu: 'Megnyitás böngészőben',
      ru: 'Открыть в браузере',
    },
    'common.language': {
      zh: '语言',
      en: 'Language',
      es: 'Idioma',
      hu: 'Nyelv',
      ru: 'Язык',
    },
    'common.videoLoadError': {
      zh: '视频加载失败',
      en: 'Video failed to load',
      es: 'No se pudo cargar el video',
      hu: 'A videó betöltése sikertelen',
      ru: 'Не удалось загрузить видео',
    },
    'common.online': {
      zh: '在线',
      en: 'Online',
      es: 'En línea',
      hu: 'Online',
      ru: 'В сети',
    },
    'common.offline': {
      zh: '离线',
      en: 'Offline',
      es: 'Desconectado',
      hu: 'Offline',
      ru: 'Не в сети',
    },
    'common.ready': {
      zh: '就绪',
      en: 'Ready',
      es: 'Listo',
      hu: 'Kész',
      ru: 'Готов',
    },
    'common.thinking': {
      zh: '思考中',
      en: 'Thinking',
      es: 'Pensando',
      hu: 'Gondolkodás',
      ru: 'Думает',
    },
    'common.processing': {
      zh: '处理中',
      en: 'Processing',
      es: 'Procesando',
      hu: 'Feldolgozás',
      ru: 'Обработка',
    },
    'common.idle': {
      zh: '空闲',
      en: 'Idle',
      es: 'Inactivo',
      hu: 'Tétlen',
      ru: 'Простаивает',
    },
    'common.connecting': {
      zh: '连接中',
      en: 'Connecting',
      es: 'Conectando',
      hu: 'Csatlakozás',
      ru: 'Подключение',
    },
    'common.default': {
      zh: '默认',
      en: 'Default',
      es: 'Predeterminado',
      hu: 'Alapértelmezett',
      ru: 'По умолчанию',
    },
    'dashboard.noPersonality': {
      zh: '无特定性格',
      en: 'No specific personality',
      es: 'Sin personalidad específica',
      hu: 'Nincs külön személyiség',
      ru: 'Без особой личности',
    },

    /* ===================== 危险操作确认 ===================== */
    'confirm.eyebrow': {
      zh: '危险操作',
      en: 'Dangerous Operation',
      es: 'Operación peligrosa',
      hu: 'Veszélyes művelet',
      ru: 'Опасная операция',
    },
    'confirm.title': {
      zh: '确认执行危险操作？',
      en: 'Confirm dangerous operation?',
      es: '¿Confirmar la operación peligrosa?',
      hu: 'Megerősíti a veszélyes műveletet?',
      ru: 'Подтвердить опасную операцию?',
    },
    'confirm.allow': {
      zh: '允许执行',
      en: 'Allow execution',
      es: 'Permitir ejecución',
      hu: 'Végrehajtás engedélyezése',
      ru: 'Разрешить выполнение',
    },
    'confirm.noArgs': {
      zh: '(无参数)',
      en: '(no arguments)',
      es: '(sin argumentos)',
      hu: '(nincs argumentum)',
      ru: '(без аргументов)',
    },
    'confirm.defaultHint': {
      zh: '危险操作',
      en: 'Dangerous operation',
      es: 'Operación peligrosa',
      hu: 'Veszélyes művelet',
      ru: 'Опасная операция',
    },

    /* ===================== 桌面窗口 (desktop) ===================== */
    'desktop.dashboard.title': {
      zh: '工作台模式',
      en: 'Dashboard mode',
      es: 'Modo panel de control',
      hu: 'Irányítópult mód',
      ru: 'Режим панели управления',
    },
    'desktop.emptyHint': {
      zh: '待命中 · 输入指令开始对话',
      en: 'Standing by · Type a command to start',
      es: 'En espera · Escribe un comando para empezar',
      hu: 'Készenlét · Gépeljen egy parancsot a kezdéshez',
      ru: 'Ожидание · Введите команду для старта',
    },
    'desktop.placeholder': {
      zh: '输入指令...',
      en: 'Type a command...',
      es: 'Escribe un comando...',
      hu: 'Írjon egy parancsot...',
      ru: 'Введите команду...',
    },
    'desktop.statusIdle': {
      zh: '空闲',
      en: 'Idle',
      es: 'Inactivo',
      hu: 'Túlten',
      ru: 'Простой',
    },

    /* ===================== 仪表盘 (dashboard) ===================== */
    'dashboard.newTask': {
      zh: '新建任务',
      en: 'New Task',
      es: 'Nueva tarea',
      hu: 'Új feladat',
      ru: 'Новая задача',
    },
    'dashboard.skills': {
      zh: '技能',
      en: 'Skills',
      es: 'Habilidades',
      hu: 'Készségek',
      ru: 'Навыки',
    },
    'dashboard.desktopMode': {
      zh: '桌宠模式',
      en: 'Desktop Pet Mode',
      es: 'Modo mascota de escritorio',
      hu: 'Asztali pocok mód',
      ru: 'Режим рабочего стола',
    },
    'dashboard.monitor': {
      zh: '监控面板',
      en: 'Monitor Panel',
      es: 'Panel de monitoreo',
      hu: 'Figyelőpanel',
      ru: 'Панель мониторинга',
    },
    'dashboard.connectWechat': {
      zh: '连接微信',
      en: 'Connect WeChat',
      es: 'Conectar WeChat',
      hu: 'WeChat csatlakoztatása',
      ru: 'Подключить WeChat',
    },
    'dashboard.sessions': {
      zh: '会话',
      en: 'Sessions',
      es: 'Sesiones',
      hu: 'Munkamenetek',
      ru: 'Сеансы',
    },
    'dashboard.newSession': {
      zh: '新建会话',
      en: 'New Session',
      es: 'Nueva sesión',
      hu: 'Új munkamenet',
      ru: 'Новый сеанс',
    },
    'dashboard.tokenUsage': {
      zh: 'Token 用量',
      en: 'Token Usage',
      es: 'Uso de tokens',
      hu: 'Token-felhasználás',
      ru: 'Использование токенов',
    },
    'dashboard.tokenToday': {
      zh: '今日',
      en: 'Today',
      es: 'Hoy',
      hu: 'Ma',
      ru: 'Сегодня',
    },
    'dashboard.tokenTotal': {
      zh: '累计',
      en: 'Total',
      es: 'Total',
      hu: 'Összesen',
      ru: 'Всего',
    },
    'dashboard.reconfigure': {
      zh: '重新配置',
      en: 'Reconfigure',
      es: 'Reconfigurar',
      hu: 'Újrakonfigurálás',
      ru: 'Перенастроить',
    },
    'dashboard.aboutTitle': {
      zh: '关于 CogitoAgent',
      en: 'About CogitoAgent',
      es: 'Acerca de CogitoAgent',
      hu: 'A CogitoAgentről',
      ru: 'О CogitoAgent',
    },
    'dashboard.wechatLogin': {
      zh: '微信扫码登录',
      en: 'WeChat QR Login',
      es: 'Inicio de sesión con WeChat',
      hu: 'WeChat QR bejelentkezés',
      ru: 'Вход через WeChat QR',
    },
    'dashboard.wechatScan': {
      zh: '请使用微信扫描二维码',
      en: 'Please scan the QR code with WeChat',
      es: 'Escanee el código QR con WeChat',
      hu: 'Kérem olvassa be a QR-kódot WeChattel',
      ru: 'Отсканируйте QR-код в WeChat',
    },
    'dashboard.wechatLoading': {
      zh: '二维码加载中...',
      en: 'QR code loading...',
      es: 'Cargando código QR...',
      hu: 'QR-kód betöltése...',
      ru: 'Загрузка QR-кода...',
    },
    'dashboard.wechatStatus': {
      zh: '请使用微信扫描二维码',
      en: 'Please scan the QR code with WeChat',
      es: 'Escanee el código QR con WeChat',
      hu: 'Kérem olvassa be a QR-kódot WeChattel',
      ru: 'Отсканируйте QR-код в WeChat',
    },
    'dashboard.personaTitle': {
      zh: '选择人设',
      en: 'Choose a Persona',
      es: 'Elegir un personaje',
      hu: 'Személy kiválasztása',
      ru: 'Выбрать персонаж',
    },
    'dashboard.personaSubtitle': {
      zh: '为新会话选择一个角色',
      en: 'Choose a role for the new session',
      es: 'Elija un rol para la nueva sesión',
      hu: 'Válasszon szerepet az új munkamenethez',
      ru: 'Выберите роль для нового сеанса',
    },
    'dashboard.createSession': {
      zh: '创建会话',
      en: 'Create Session',
      es: 'Crear sesión',
      hu: 'Munkamenet létrehozása',
      ru: 'Создать сеанс',
    },
    'dashboard.welcomeTagline': {
      zh: '云端推理 · 本地执行 · 自主行动',
      en: 'Cloud-driven · Local-executing · Autonomous',
      es: 'Impulsado en la nube · Ejecución local · Autónomo',
      hu: 'Felhő által vezérelt · Helyi végrehajtás · Autonóm',
      ru: 'Облачный интеллект · Локальное исполнение · Автономный',
    },
    'dashboard.newSessionHint': {
      zh: '新建会话',
      en: 'New session',
      es: 'Nueva sesión',
      hu: 'Új munkamenet',
      ru: 'Новый сеанс',
    },
    'dashboard.helpHint': {
      zh: '命令列表',
      en: 'Command list',
      es: 'Lista de comandos',
      hu: 'Parancslista',
      ru: 'Список команд',
    },
    'dashboard.sessionsHint': {
      zh: '多会话',
      en: 'Multi-session',
      es: 'Múltiplas sesiones',
      hu: 'Többszörös munkamenet',
      ru: 'Мультисеанс',
    },
    'dashboard.sendHint': {
      zh: '发送',
      en: 'Send',
      es: 'Enviar',
      hu: 'Küldés',
      ru: 'Отправить',
    },
    'dashboard.welcomeDesc': {
      zh: '持续思考的自主 AI 智能体。集成文件管理、代码执行、网页搜索、数据库等实工具，云端推理、本地执行，安全高效。',
      en: 'A continuously-thinking autonomous AI agent. Integrates real tools like file management, code execution, web search and databases — cloud reasoning, local execution, safe and efficient.',
      es: 'Un agente de IA autónomo que piensa continuamente. Integra herramientas reales como gestión de archivos, ejecución de código, búsqueda web y bases de datos: razonamiento en la nube, ejecución local, seguro y eficiente.',
      hu: 'Folyamatosan gondolkodó autonóm AI-ügynök. Valódi eszközöket integrál: fájlkezelés, kódfuttatás, webes keresés, adatbázisok — felhőben gondolkodik, helyben futtat, biztonságosan és hatékonyan.',
      ru: 'Автономный ИИ-агент, непрерывно думающий. Интегрирует реальные инструменты: файлы, выполнение кода, веб-поиск, базы данных — облачный интеллект, локальное исполнение, безопасно и эффективно.',
    },
    'dashboard.moduleWeb': {
      zh: '网页读取',
      en: 'Web Reading',
      es: 'Lectura web',
      hu: 'Weboldal beolvasás',
      ru: 'Чтение веб-страниц',
    },
    'dashboard.moduleWebDesc': {
      zh: '抓取页面内容并解析',
      en: 'Fetch and parse page content',
      es: 'Obtener y analizar contenido de páginas',
      hu: 'Oldaltartalom letöltése és feldolgozása',
      ru: 'Получение и разбор содержимого страницы',
    },
    'dashboard.moduleResearch': {
      zh: '调研分析',
      en: 'Research Analysis',
      es: 'Análisis de investigación',
      hu: 'Kutatási elemzés',
      ru: 'Исследовательский анализ',
    },
    'dashboard.moduleResearchDesc': {
      zh: '深度主题研究分析',
      en: 'In-depth topic research',
      es: 'Investigación profunda de temas',
      hu: 'Mélyreható témafeltárás',
      ru: 'Глубокое исследование тем',
    },
    'dashboard.moduleData': {
      zh: '数据挖掘',
      en: 'Data Mining',
      es: 'Minería de datos',
      hu: 'Adatbányászat',
      ru: 'Интеллектуальный анализ данных',
    },
    'dashboard.moduleDataDesc': {
      zh: '数据清洗与模式发现',
      en: 'Data cleaning and pattern discovery',
      es: 'Limpieza de datos y descubrimiento de patrones',
      hu: 'Adattisztítás és mintázat-felfedezés',
      ru: 'Очистка данных и обнаружение закономерностей',
    },
    'dashboard.moduleFile': {
      zh: '文件管理',
      en: 'File Management',
      es: 'Gestión de archivos',
      hu: 'Fájlkezelés',
      ru: 'Управление файлами',
    },
    'dashboard.moduleFileDesc': {
      zh: '文件操作与目录组织',
      en: 'File operations and directory organization',
      es: 'Operaciones de archivos y organización de directorios',
      hu: 'Fájlműveletek és mapparendezés',
      ru: 'Операции с файлами и структура каталогов',
    },
    'dashboard.noSession': {
      zh: '暂无会话',
      en: 'No sessions',
      es: 'Sin sesiones',
      hu: 'Nincsenek munkamenetek',
      ru: 'Нет сеансов',
    },
    'dashboard.loadFailed': {
      zh: '加载失败',
      en: 'Load failed',
      es: 'Error al cargar',
      hu: 'Betöltés sikertelen',
      ru: 'Ошибка загрузки',
    },
    'dashboard.busySwitch': {
      zh: 'AI 正在思考中，请等待回复完成后再切换会话',
      en: 'AI is thinking — please wait for the reply before switching',
      es: 'La IA está pensando, espere la respuesta antes de cambiar',
      hu: 'Az AI gondolkodik, várja meg a választ mielőtt átvált',
      ru: 'ИИ думает, дождитесь ответа перед переключением',
    },
    'dashboard.busyNew': {
      zh: 'AI 正在思考中，请等待回复完成后再创建新会话',
      en: 'AI is thinking — please wait for the reply before creating a new session',
      es: 'La IA está pensando, espere la respuesta antes de crear una sesión',
      hu: 'Az AI gondolkodik, várja meg a választ mielőtt új munkamenetet hoz létre',
      ru: 'ИИ думает, дождитесь ответа перед созданием сеанса',
    },
    'dashboard.wechatWaiting': {
      zh: '等待微信消息...',
      en: 'Waiting for WeChat messages...',
      es: 'Esperando mensajes de WeChat...',
      hu: 'Várunk WeChat üzeneteket...',
      ru: 'Ожидание сообщений WeChat...',
    },
    'dashboard.newSessionStart': {
      zh: '新会话开始...',
      en: 'New session started...',
      es: 'Nueva sesión iniciada...',
      hu: 'Új munkamenet elkezdődött...',
      ru: 'Новый сеанс начат...',
    },
    'dashboard.wechatReceived': {
      zh: '微信收到',
      en: 'WeChat received',
      es: 'WeChat recibido',
      hu: 'WeChat fogadott',
      ru: 'WeChat получено',
    },
    'dashboard.wechatReplied': {
      zh: '微信回复',
      en: 'WeChat reply',
      es: 'Respuesta de WeChat',
      hu: 'WeChat válasz',
      ru: 'Ответ WeChat',
    },
    'dashboard.wechatChannel': {
      zh: '微信通道',
      en: 'WeChat Channel',
      es: 'Canal de WeChat',
      hu: 'WeChat csatorna',
      ru: 'Канал WeChat',
    },
    'dashboard.enterWechatSession': {
      zh: '点击进入微信会话',
      en: 'Click to enter WeChat session',
      es: 'Haga clic para entrar en la sesión de WeChat',
      hu: 'Kattintson a WeChat-munkamenet megnyitásához',
      ru: 'Нажмите, чтобы войти в сеанс WeChat',
    },
    'dashboard.scanHint': {
      zh: '请使用微信扫描二维码',
      en: 'Please scan the QR code with WeChat',
      es: 'Escanee el código QR con WeChat',
      hu: 'Kérem olvassa be a QR-kódot WeChattel',
      ru: 'Отсканируйте QR-код в WeChat',
    },
    'dashboard.chatEmptyHint': {
      zh: '有什么可以帮你的？',
      en: 'How can I help you?',
      es: '¿En qué puedo ayudarte?',
      hu: 'Miben segíthetek?',
      ru: 'Чем могу помочь?',
    },
    'dashboard.stopClick': {
      zh: '点击终止',
      en: 'Click to stop',
      es: 'Haga clic para detener',
      hu: 'Kattintás a leállításhoz',
      ru: 'Нажмите, чтобы остановить',
    },
    'dashboard.avatarMe': {
      zh: '我',
      en: 'Me',
      es: 'Yo',
      hu: 'Én',
      ru: 'Я',
    },
    'dashboard.avatarAI': {
      zh: 'AI',
      en: 'AI',
      es: 'IA',
      hu: 'AI',
      ru: 'ИИ',
    },
    'dashboard.promptAutomation': {
      zh: '请帮我创建一个自动化任务，我需要...',
      en: 'Please help me create an automation task, I need...',
      es: 'Ayúdeme a crear una tarea de automatización, necesito...',
      hu: 'Kérem segítsen automata feladatot létrehozni, szükségem van...',
      ru: 'Помогите создать задачу автоматизации, мне нужно...',
    },
    'dashboard.promptGeneric': {
      zh: '请帮我处理{label}相关的任务。',
      en: 'Please help me with tasks related to {label}.',
      es: 'Ayúdeme con tareas relacionadas con {label}.',
      hu: 'Kérem segítsen a(z) {label} kapcsolódó feladatokban.',
      ru: 'Помогите с задачами, связанными с {label}.',
    },
    'dashboard.promptWeb': {
      zh: '请帮我读取并分析以下网页内容：',
      en: 'Please read and analyze the following web content:',
      es: 'Lea y analice el siguiente contenido web:',
      hu: 'Kérem olvassa el és elemezze az alábbi weboldaltartalmat:',
      ru: 'Прочитайте и проанализируйте следующее веб-содержимое:',
    },
    'dashboard.promptResearch': {
      zh: '请帮我做一个调研分析，主题是：',
      en: 'Please do a research analysis on the topic:',
      es: 'Haga un análisis de investigación sobre el tema:',
      hu: 'Készítsen kutatási elemzést a témában:',
      ru: 'Проведите исследовательский анализ по теме:',
    },
    'dashboard.promptData': {
      zh: '请帮我进行数据挖掘，分析以下数据：',
      en: 'Please perform data mining and analyze the following data:',
      es: 'Realice minería de datos y analice los siguientes datos:',
      hu: 'Végezzen adatbányászatot és elemezze az alábbi adatokat:',
      ru: 'Проведите интеллектуальный анализ следующих данных:',
    },
    'dashboard.promptFile': {
      zh: '请帮我管理文件，我需要：',
      en: 'Please manage my files, I need:',
      es: 'Gestione mis archivos, necesito:',
      hu: 'Kérem kezelje a fájljaimat, szükségem van:',
      ru: 'Управляйте моими файлами, мне нужно:',
    },
    'dashboard.promptFunc': {
      zh: '请帮我进行{func}。',
      en: 'Please help me do {func}.',
      es: 'Ayúdeme a hacer {func}.',
      hu: 'Kérem segítsen elvégezni: {func}.',
      ru: 'Помогите мне выполнить: {func}.',
    },
    'desktop.waitSend': {
      zh: '等待发送',
      en: 'Waiting to send',
      es: 'Esperando enviar',
      hu: 'Küldés előtt',
      ru: 'Ожидание отправки',
    },

    /* ===================== 技能面板 ===================== */
    'skills.title': {
      zh: '技能与工具',
      en: 'Skills & Tools',
      es: 'Habilidades y herramientas',
      hu: 'Készségek és eszközök',
      ru: 'Навыки и инструменты',
    },
    'skills.desc': {
      zh: 'CogitoAgent 支持以下分类的所有工具能力，可供组合使用',
      en: 'CogitoAgent supports all tool capabilities in the categories below, ready to combine',
      es: 'CogitoAgent admite todas las categorías de herramientas siguientes, listas para combinar',
      hu: 'A CogitoAgent támogatja az alábbi kategórák minden eszközképességét, kombinálásra készen',
      ru: 'CogitoAgent поддерживает все категории инструментов ниже, готовы к комбинированию',
    },
    'skills.eyebrow': {
      zh: '能力',
      en: 'Capabilities',
      es: 'Capacidades',
      hu: 'Képességek',
      ru: 'Возможности',
    },

    /* ===================== 工具分类名 (按 id 客户端翻译) ===================== */
    'cat.file': {
      zh: '文件操作',
      en: 'File Operations',
      es: 'Operaciones de archivos',
      hu: 'Fájlműveletek',
      ru: 'Операции с файлами',
    },
    'cat.web': {
      zh: '网络工具',
      en: 'Web Tools',
      es: 'Herramientas web',
      hu: 'Webeszközök',
      ru: 'Веб-инструменты',
    },
    'cat.system': {
      zh: '系统操作',
      en: 'System Operations',
      es: 'Operaciones del sistema',
      hu: 'Rendszerműveletek',
      ru: 'Системные операции',
    },
    'cat.browser': {
      zh: '浏览器自动化',
      en: 'Browser Automation',
      es: 'Automatización del navegador',
      hu: 'Böngésző-automatizálás',
      ru: 'Автоматизация браузера',
    },
    'cat.code': {
      zh: '代码执行',
      en: 'Code Execution',
      es: 'Ejecución de código',
      hu: 'Kódfuttatás',
      ru: 'Выполнение кода',
    },
    'cat.git': {
      zh: 'Git 版本控制',
      en: 'Git Version Control',
      es: 'Control de versiones Git',
      hu: 'Git verziókezelés',
      ru: 'Контроль версий Git',
    },
    'cat.task': {
      zh: '任务管理',
      en: 'Task Management',
      es: 'Gestión de tareas',
      hu: 'Feladatkezelés',
      ru: 'Управление задачами',
    },
    'cat.memory': {
      zh: '记忆系统',
      en: 'Memory System',
      es: 'Sistema de memoria',
      hu: 'Memóriarendszer',
      ru: 'Система памяти',
    },
    'cat.data': {
      zh: '数据处理',
      en: 'Data Processing',
      es: 'Procesamiento de datos',
      hu: 'Adatfeldolgozás',
      ru: 'Обработка данных',
    },
    'cat.db': {
      zh: '数据库',
      en: 'Database',
      es: 'Base de datos',
      hu: 'Adatbázis',
      ru: 'База данных',
    },
    'cat.email': {
      zh: '邮件功能',
      en: 'Email',
      es: 'Correo electrónico',
      hu: 'E-mail',
      ru: 'Электронная почта',
    },
    'cat.monitor': {
      zh: '系统监控',
      en: 'System Monitoring',
      es: 'Monitoreo del sistema',
      hu: 'Rendszerfigyelés',
      ru: 'Мониторинг системы',
    },
    'cat.scheduler': {
      zh: '定时任务',
      en: 'Scheduled Tasks',
      es: 'Tareas programadas',
      hu: 'Ütemezett feladatok',
      ru: 'Планировщик задач',
    },
    'cat.ocr': {
      zh: '图像文字识别',
      en: 'OCR',
      es: 'Reconocimiento óptico',
      hu: 'Karakterfelismerés',
      ru: 'Распознавание текста',
    },
    'cat.vision': {
      zh: '视觉分析',
      en: 'Vision Analysis',
      es: 'Análisis visual',
      hu: 'Látáselemzés',
      ru: 'Анализ изображений',
    },
    'cat.office': {
      zh: 'Office 文档',
      en: 'Office Documents',
      es: 'Documentos de Office',
      hu: 'Office dokumentumok',
      ru: 'Office-документы',
    },
    'cat.cluster': {
      zh: '集群管理',
      en: 'Cluster Management',
      es: 'Gestión de clúster',
      hu: 'Fürtkezelés',
      ru: 'Управление кластером',
    },
    'cat.wechat': {
      zh: '微信集成',
      en: 'WeChat Integration',
      es: 'Integración con WeChat',
      hu: 'WeChat-integráció',
      ru: 'Интеграция с WeChat',
    },
    'cat.gis': {
      zh: '地理信息',
      en: 'GIS',
      es: 'SIG',
      hu: 'GIS',
      ru: 'ГИС',
    },
    'cat.bio': {
      zh: '生物信息',
      en: 'Bioinformatics',
      es: 'Bioinformática',
      hu: 'Bioinformatika',
      ru: 'Биоинформатика',
    },
    'cat.med': {
      zh: '医学信息',
      en: 'Medical',
      es: 'Información médica',
      hu: 'Orvostudományi',
      ru: 'Медицинская информация',
    },
    'cat.chem': {
      zh: '化学分析',
      en: 'Chemistry',
      es: 'Química',
      hu: 'Kémia',
      ru: 'Химия',
    },
    'cat.chemistry': {
      zh: '化学分析',
      en: 'Chemistry',
      es: 'Química',
      hu: 'Kémia',
      ru: 'Химия',
    },
    'cat.finance': {
      zh: '金融分析',
      en: 'Finance',
      es: 'Finanzas',
      hu: 'Pénzügy',
      ru: 'Финансы',
    },
    'cat.math': {
      zh: '数学计算',
      en: 'Mathematics',
      es: 'Matemáticas',
      hu: 'Matematika',
      ru: 'Математика',
    },
    'cat.bioinformatics': {
      zh: '生物信息',
      en: 'Bioinformatics',
      es: 'Bioinformática',
      hu: 'Bioinformatika',
      ru: 'Биоинформатика',
    },
    'cat.literature': {
      zh: '文献检索',
      en: 'Literature',
      es: 'Literatura',
      hu: 'Szakirodalom',
      ru: 'Литература',
    },

    /* ===================== 监控 (monitor) 占位, 见 monitor 词典 ===================== */

    /* ===================== 安装向导 (setup) ===================== */
    'setup.languagePrompt': {
      zh: '请选择界面语言',
      en: 'Please choose your interface language',
      es: 'Elija el idioma de la interfaz',
      hu: 'Válassza ki a kezelőfelület nyelvét',
      ru: 'Выберите язык интерфейса',
    },

    /* ===================== 监控 (monitor) ===================== */
    'monitor.totalCalls': {
      zh: '总调用',
      en: 'Total Calls',
      es: 'Llamadas totales',
      hu: 'Összes hívás',
      ru: 'Всего вызовов',
    },
    'monitor.successRate': {
      zh: '成功率',
      en: 'Success Rate',
      es: 'Tasa de éxito',
      hu: 'Sikerráta',
      ru: 'Доля успеха',
    },
    'monitor.clusterHint': {
      zh: '使用 /spawn 命令创建子智能体',
      en: 'Use the /spawn command to create sub-agents',
      es: 'Use el comando /spawn para crear subagentes',
      hu: 'Használja a /spawn parancsot alügynökök létrehozásához',
      ru: 'Используйте команду /spawn для создания субагентов',
    },
    'monitor.agent': {
      zh: '智能体',
      en: 'Agent',
      es: 'Agente',
      hu: 'Ügynök',
      ru: 'Агент',
    },
    'monitor.thoughtEmpty': {
      zh: '等待思考开始...',
      en: 'Waiting for thinking to start...',
      es: 'Esperando que comience el razonamiento...',
      hu: 'Várunk a gondolkodás elkezdődésére...',
      ru: 'Ожидание начала размышлений...',
    },
    'monitor.statusRunning': {
      zh: '运行中',
      en: 'Running',
      es: 'En ejecución',
      hu: 'Futásban',
      ru: 'Выполняется',
    },
    'monitor.statusCompleted': {
      zh: '完成',
      en: 'Done',
      es: 'Completado',
      hu: 'Kész',
      ru: 'Завершено',
    },
    'monitor.statusFailed': {
      zh: '失败',
      en: 'Failed',
      es: 'Falló',
      hu: 'Sikertelen',
      ru: 'Не удалось',
    },
    'monitor.calls': {
      zh: '调用次数',
      en: 'Calls',
      es: 'Llamadas',
      hu: 'Hívások',
      ru: 'Вызовы',
    },
    'monitor.secondsAgo': {
      zh: '{n} 秒前',
      en: '{n}s ago',
      es: 'hace {n} s',
      hu: '{n} másodperce',
      ru: '{n} сек назад',
    },
    'monitor.minutesAgo': {
      zh: '{n} 分钟前',
      en: '{n} min ago',
      es: 'hace {n} min',
      hu: '{n} perce',
      ru: '{n} мин назад',
    },
    'monitor.tools': {
      zh: '工具:',
      en: 'Tools:',
      es: 'Herramientas:',
      hu: 'Eszközök:',
      ru: 'Инструменты:',
    },
    'monitor.iterations': {
      zh: '迭代:',
      en: 'Iterations:',
      es: 'Iteraciones:',
      hu: 'Iterációk:',
      ru: 'Итерации:',
    },
    'monitor.errorLabel': {
      zh: '错误:',
      en: 'Error:',
      es: 'Error:',
      hu: 'Hiba:',
      ru: 'Ошибка:',
    },
    'monitor.mainAgent': {
      zh: '主智能体',
      en: 'Main Agent',
      es: 'Agente principal',
      hu: 'Fő ügynök',
      ru: 'Главный агент',
    },
    'monitor.cat.file': {
      zh: '文件',
      en: 'File',
      es: 'Archivo',
      hu: 'Fájl',
      ru: 'Файл',
    },
    'monitor.cat.web': {
      zh: '网络',
      en: 'Web',
      es: 'Red',
      hu: 'Web',
      ru: 'Веб',
    },
    'monitor.cat.system': {
      zh: '系统',
      en: 'System',
      es: 'Sistema',
      hu: 'Rendszer',
      ru: 'Система',
    },
    'monitor.cat.browser': {
      zh: '浏览器',
      en: 'Browser',
      es: 'Navegador',
      hu: 'Böngésző',
      ru: 'Браузер',
    },
    'monitor.cat.code': {
      zh: '代码',
      en: 'Code',
      es: 'Código',
      hu: 'Kód',
      ru: 'Код',
    },
    'monitor.cat.task': {
      zh: '任务',
      en: 'Tasks',
      es: 'Tareas',
      hu: 'Feladatok',
      ru: 'Задачи',
    },
    'monitor.cat.memory': {
      zh: '记忆',
      en: 'Memory',
      es: 'Memoria',
      hu: 'Memória',
      ru: 'Память',
    },
    'monitor.cat.data': {
      zh: '数据',
      en: 'Data',
      es: 'Datos',
      hu: 'Adat',
      ru: 'Данные',
    },
    'monitor.cat.db': {
      zh: '数据库',
      en: 'Database',
      es: 'Base de datos',
      hu: 'Adatbázis',
      ru: 'База данных',
    },
    'monitor.cat.email': {
      zh: '邮件',
      en: 'Email',
      es: 'Correo',
      hu: 'E-mail',
      ru: 'Почта',
    },
    'monitor.cat.monitor': {
      zh: '监控',
      en: 'Monitor',
      es: 'Monitor',
      hu: 'Figyelés',
      ru: 'Монитор',
    },
    'monitor.cat.scheduler': {
      zh: '定时',
      en: 'Scheduled',
      es: 'Programado',
      hu: 'Ütemezett',
      ru: 'Планировщик',
    },
    'monitor.cat.vision': {
      zh: '视觉',
      en: 'Vision',
      es: 'Visión',
      hu: 'Látás',
      ru: 'Зрение',
    },

    /* ===================== 监控 Widgets ===================== */
    'widget.todaySessions': {
      zh: '今日会话',
      en: 'Sessions Today',
      es: 'Sesiones de hoy',
      hu: 'Mai munkamenetek',
      ru: 'Сеансов сегодня',
    },
    'widget.todayMessages': {
      zh: '今日消息',
      en: 'Messages Today',
      es: 'Mensajes de hoy',
      hu: 'Mai üzenetek',
      ru: 'Сообщений сегодня',
    },
    'widget.todayToolCalls': {
      zh: '今日调用',
      en: 'Tool Calls Today',
      es: 'Llamadas de hoy',
      hu: 'Mai hívások',
      ru: 'Вызовов сегодня',
    },
    'widget.todayTokens': {
      zh: '今日 Token',
      en: 'Tokens Today',
      es: 'Tokens de hoy',
      hu: 'Mai tokenek',
      ru: 'Токенов сегодня',
    },
    'widget.totalTokens': {
      zh: '累计 Token',
      en: 'Total Tokens',
      es: 'Tokens totales',
      hu: 'Összes token',
      ru: 'Всего токенов',
    },
    'widget.thinkingTime': {
      zh: '思考时长',
      en: 'Thinking Time',
      es: 'Tiempo de razonamiento',
      hu: 'Gondolkodási idő',
      ru: 'Время размышлений',
    },
    'widget.realtime': {
      zh: '实时',
      en: 'Live',
      es: 'En tiempo real',
      hu: 'Élő',
      ru: 'В реальном времени',
    },
    'widget.heartbeat3s': {
      zh: '3s 心跳',
      en: '3s heartbeat',
      es: 'Latido 3s',
      hu: '3 mp ütem',
      ru: 'Пульс 3с',
    },
    'widget.window5s': {
      zh: '5s 窗口',
      en: '5s window',
      es: 'Ventana 5s',
      hu: '5s ablak',
      ru: 'Окно 5с',
    },
    'widget.waitingData': {
      zh: '等待数据中...',
      en: 'Waiting for data...',
      es: 'Esperando datos...',
      hu: 'Adatokra várunk...',
      ru: 'Ожидание данных...',
    },
    'widget.waitingTools': {
      zh: '等待工具调用数据...',
      en: 'Waiting for tool call data...',
      es: 'Esperando datos de llamadas...',
      hu: 'Várunk eszközhívási adatokra...',
      ru: 'Ожидание данных о вызовах...',
    },
    'widget.cat.file': {
      zh: '文件',
      en: 'File',
      es: 'Archivo',
      hu: 'Fájl',
      ru: 'Файл',
    },
    'widget.cat.web': {
      zh: '网络',
      en: 'Web',
      es: 'Red',
      hu: 'Web',
      ru: 'Веб',
    },
    'widget.cat.network': {
      zh: '网络',
      en: 'Network',
      es: 'Red',
      hu: 'Hálózat',
      ru: 'Сеть',
    },
    'widget.cat.system': {
      zh: '系统',
      en: 'System',
      es: 'Sistema',
      hu: 'Rendszer',
      ru: 'Система',
    },
    'widget.cat.browser': {
      zh: '浏览器',
      en: 'Browser',
      es: 'Navegador',
      hu: 'Böngésző',
      ru: 'Браузер',
    },
    'widget.cat.code': {
      zh: '代码',
      en: 'Code',
      es: 'Código',
      hu: 'Kód',
      ru: 'Код',
    },
    'widget.cat.task': {
      zh: '任务',
      en: 'Tasks',
      es: 'Tareas',
      hu: 'Feladatok',
      ru: 'Задачи',
    },
    'widget.cat.memory': {
      zh: '记忆',
      en: 'Memory',
      es: 'Memoria',
      hu: 'Memória',
      ru: 'Память',
    },
    'widget.cat.data': {
      zh: '数据',
      en: 'Data',
      es: 'Datos',
      hu: 'Adat',
      ru: 'Данные',
    },
    'widget.cat.db': {
      zh: '数据库',
      en: 'Database',
      es: 'Base de datos',
      hu: 'Adatbázis',
      ru: 'База данных',
    },
    'widget.cat.email': {
      zh: '邮件',
      en: 'Email',
      es: 'Correo',
      hu: 'E-mail',
      ru: 'Почта',
    },
    'widget.cat.monitor': {
      zh: '监控',
      en: 'Monitor',
      es: 'Monitor',
      hu: 'Figyelés',
      ru: 'Монитор',
    },
    'widget.cat.scheduler': {
      zh: '定时',
      en: 'Scheduled',
      es: 'Programado',
      hu: 'Ütemezett',
      ru: 'Планировщик',
    },
    'widget.cat.vision': {
      zh: '视觉',
      en: 'Vision',
      es: 'Visión',
      hu: 'Látás',
      ru: 'Зрение',
    },
    'widget.cat.cluster': {
      zh: '集群',
      en: 'Cluster',
      es: 'Clúster',
      hu: 'Fürt',
      ru: 'Кластер',
    },
    'widget.cat.wechat': {
      zh: '微信',
      en: 'WeChat',
      es: 'WeChat',
      hu: 'WeChat',
      ru: 'WeChat',
    },
    'widget.cat.bio': {
      zh: '生命科学',
      en: 'Life Sciences',
      es: 'Ciencias de la vida',
      hu: 'Élettudományok',
      ru: 'Науки о жизни',
    },
    'widget.cat.med': {
      zh: '医学',
      en: 'Medical',
      es: 'Medicina',
      hu: 'Orvostudomány',
      ru: 'Медицина',
    },
    'widget.cat.chem': {
      zh: '化学',
      en: 'Chemistry',
      es: 'Química',
      hu: 'Kémia',
      ru: 'Химия',
    },
    'widget.cat.finance': {
      zh: '金融',
      en: 'Finance',
      es: 'Finanzas',
      hu: 'Pénzügy',
      ru: 'Финансы',
    },
    'widget.cat.math': {
      zh: '数学',
      en: 'Math',
      es: 'Matemáticas',
      hu: 'Matematika',
      ru: 'Математика',
    },

    /* ===================== 安装向导 (setup) ===================== */
    'setup.bannerSub': {
      zh: '首次配置向导 · INITIAL CONFIGURATION',
      en: 'Initial Configuration Wizard',
      es: 'Asistente de configuración inicial',
      hu: 'Kezdeti konfiguráló varázsló',
      ru: 'Начальная настройка',
    },
    'setup.stepApi': {
      zh: 'API',
      en: 'API',
      es: 'API',
      hu: 'API',
      ru: 'API',
    },
    'setup.step2': {
      zh: '密钥',
      en: 'Key',
      es: 'Clave',
      hu: 'Kulcs',
      ru: 'Ключ',
    },
    'setup.step3': {
      zh: '模型',
      en: 'Model',
      es: 'Modelo',
      hu: 'Modell',
      ru: 'Модель',
    },
    'setup.step4': {
      zh: '工作区',
      en: 'Workspace',
      es: 'Espacio de trabajo',
      hu: 'Munkaterület',
      ru: 'Рабочая область',
    },
    'setup.step5': {
      zh: '高级',
      en: 'Advanced',
      es: 'Avanzado',
      hu: 'Speciális',
      ru: 'Дополнительно',
    },
    'setup.titleApi': {
      zh: '设置 API Base URL',
      en: 'Set API Base URL',
      es: 'Establecer URL base de API',
      hu: 'API Base URL beállítása',
      ru: 'Задайте базовый URL API',
    },
    'setup.descApi': {
      zh: '请输入 AI 服务提供商的 API 地址',
      en: 'Enter the API address of your AI provider',
      es: 'Introduzca la dirección API de su proveedor de IA',
      hu: 'Adja meg az AI-szolgáltató API-címét',
      ru: 'Введите адрес API вашего ИИ-провайдера',
    },
    'setup.hintApiCompat': {
      zh: '支持 OpenAI 兼容的 API',
      en: 'Supports OpenAI-compatible APIs',
      es: 'Admite APIs compatibles con OpenAI',
      hu: 'OpenAI-kompatibilis API-kat támogat',
      ru: 'Поддерживает API, совместимые с OpenAI',
    },
    'setup.titleKey': {
      zh: '输入 API 密钥',
      en: 'Enter API Key',
      es: 'Introduzca la clave de API',
      hu: 'API-k Mobilkulcs megadása',
      ru: 'Введите API-ключ',
    },
    'setup.descKey': {
      zh: '您的 API Key，用于访问 AI 服务',
      en: 'Your API key for accessing AI services',
      es: 'Su clave de API para acceder a los servicios de IA',
      hu: 'API-kulcsa az AI-szolgáltatások eléréséhez',
      ru: 'Ваш API-ключ для доступа к ИИ-сервисам',
    },
    'setup.hintKeySafe': {
      zh: '密钥不会保存到任何第三方服务器',
      en: 'Your key is never stored on any third-party server',
      es: 'Su clave nunca se guarda en servidores de terceros',
      hu: 'A kulcsot nem tároljuk harmadik fél szerverein',
      ru: 'Ключ не сохраняется на сторонних серверах',
    },
    'setup.titleModel': {
      zh: '选择模型',
      en: 'Select Model',
      es: 'Seleccionar modelo',
      hu: 'Modell kiválasztása',
      ru: 'Выберите модель',
    },
    'setup.descModel': {
      zh: '请输入要使用的模型名称',
      en: 'Enter the model name to use',
      es: 'Introduzca el nombre del modelo',
      hu: 'Adja meg a használni kívánt modell nevét',
      ru: 'Введите название модели',
    },
    'setup.hintModel': {
      zh: '如: gpt-4o, claude-3-sonnet, DeepSeek-V4-Flash',
      en: 'e.g. gpt-4o, claude-3-sonnet, DeepSeek-V4-Flash',
      es: 'p. ej. gpt-4o, claude-3-sonnet, DeepSeek-V4-Flash',
      hu: 'pl. gpt-4o, claude-3-sonnet, DeepSeek-V4-Flash',
      ru: 'например gpt-4o, claude-3-sonnet, DeepSeek-V4-Flash',
    },
    'setup.titleWorkspace': {
      zh: '设置工作区',
      en: 'Set Workspace',
      es: 'Establecer espacio de trabajo',
      hu: 'Munkaterület beállítása',
      ru: 'Настройка рабочей области',
    },
    'setup.descWorkspace': {
      zh: 'AI 可以访问和操作的目录范围',
      en: 'Directory scope the AI can access and operate on',
      es: 'Alcance de directorios que la IA puede usar',
      hu: 'Az AI által elérhető és kezelhető könyvtárak',
      ru: 'Каталоги, к которым ИИ имеет доступ',
    },
    'setup.hintWorkspace': {
      zh: '默认为用户主目录',
      en: 'Defaults to the user home directory',
      es: 'Se usa el directorio de inicio del usuario',
      hu: 'Alapértelmezés a felhasználó kezdőkönyvtára',
      ru: 'По умолчанию домашний каталог пользователя',
    },
    'setup.browse': {
      zh: '浏览目录...',
      en: 'Browse folder...',
      es: 'Explorar carpeta...',
      hu: 'Mappaválasztás...',
      ru: 'Обзор каталога...',
    },
    'setup.titleAdvanced': {
      zh: '高级配置（可选）',
      en: 'Advanced Configuration (optional)',
      es: 'Configuración avanzada (opcional)',
      hu: 'Speciális beállítások (opcionális)',
      ru: 'Дополнительные настройки (необязательно)',
    },
    'setup.descAdvanced': {
      zh: '配置思考间隔、启动模式、邮件服务、OCR、视觉分析、科学计算等',
      en: 'Configure thinking interval, startup mode, email, OCR, vision, and science',
      es: 'Configura intervalo de pensamiento, modo de inicio, email, OCR, visión, etc.',
      hu: 'Konfigurálja a gondolkodási időt, indítómódot, e-mailt, OCR-t, látást, stb.',
      ru: 'Настройте интервал размышлений, режим запуска, почту, OCR, зрительный анализ и др.',
    },
    'setup.thinkingLabel': {
      zh: '思考间隔（毫秒）',
      en: 'Thinking interval (ms)',
      es: 'Intervalo de pensamiento (ms)',
      hu: 'Gondolkodási időköz (ms)',
      ru: 'Интервал размышлений (мс)',
    },
    'setup.thinkingHint': {
      zh: 'AI 自动思考的时间间隔，最小值 1000',
      en: 'Interval for automatic AI thinking, minimum 1000',
      es: 'Intervalo de pensamiento automático, mínimo 1000',
      hu: 'Az AI automatikus gondolkodásának időköze, minimum 1000',
      ru: 'Интервал автоматического размышления ИИ, минимум 1000',
    },
    'setup.modeLabel': {
      zh: '启动模式',
      en: 'Startup mode',
      es: 'Modo de inicio',
      hu: 'Indítási mód',
      ru: 'Режим запуска',
    },
    'setup.modeDesktop': {
      zh: '桌面宠物模式 (Desktop)',
      en: 'Desktop pet mode (Desktop)',
      es: 'Modo mascota de escritorio (Desktop)',
      hu: 'Asztali pocok mód (Desktop)',
      ru: 'Режим рабочего стола (Desktop)',
    },
    'setup.modeDashboard': {
      zh: '工作台模式 (Dashboard)',
      en: 'Dashboard mode',
      es: 'Modo panel de control',
      hu: 'Irányítópult mód',
      ru: 'Режим панели',
    },
    'setup.modeHint': {
      zh: '默认启动时的显示模式',
      en: 'Display mode at default startup',
      es: 'Modo de pantalla al inicio por defecto',
      hu: 'Alapértelmezett megjelenítési mód indításkor',
      ru: 'Режим отображения при старте по умолчанию',
    },
    'setup.emailSection': {
      zh: '邮件配置',
      en: 'Email Configuration',
      es: 'Configuración de correo',
      hu: 'E-mail beállítás',
      ru: 'Настройка почты',
    },
    'setup.emailHostPh': {
      zh: 'SMTP服务器地址',
      en: 'SMTP server address',
      es: 'Dirección del servidor SMTP',
      hu: 'SMTP-kiszolgáló címe',
      ru: 'Адрес SMTP-сервера',
    },
    'setup.emailHostHint': {
      zh: '例如: smtp.example.com',
      en: 'e.g. smtp.example.com',
      es: 'p. ej. smtp.example.com',
      hu: 'pl. smtp.example.com',
      ru: 'Например smtp.example.com',
    },
    'setup.emailPortHint': {
      zh: 'SMTP端口',
      en: 'SMTP port',
      es: 'Puerto SMTP',
      hu: 'SMTP-port',
      ru: 'Порт SMTP',
    },
    'setup.emailUserPh': {
      zh: '邮箱用户名',
      en: 'Email username',
      es: 'Usuario de correo',
      hu: 'E-mail felhasználónév',
      ru: 'Имя пользователя почты',
    },
    'setup.emailUserHint': {
      zh: '邮箱地址',
      en: 'Email address',
      es: 'Dirección de correo',
      hu: 'E-mail cím',
      ru: 'Адрес почты',
    },
    'setup.emailPasswordPh': {
      zh: '邮箱密码',
      en: 'Email password',
      es: 'Contraseña de correo',
      hu: 'E-mail jelszó',
      ru: 'Пароль почты',
    },
    'setup.emailPasswordHint': {
      zh: '邮箱密码或授权码',
      en: 'Email password or authorization code',
      es: 'Contraseña o código de autorización',
      hu: 'E-mail jelszó vagy jogosítási kód',
      ru: 'Пароль или код авторизации почты',
    },
    'setup.emailFromPh': {
      zh: '发件人地址',
      en: 'Sender address',
      es: 'Dirección del remitente',
      hu: 'Feladói cím',
      ru: 'Адрес отправителя',
    },
    'setup.emailFromHint': {
      zh: '发件人邮箱地址',
      en: 'Sender email address',
      es: 'Dirección de correo del remitente',
      hu: 'Feladó e-mail címe',
      ru: 'Почта отправителя',
    },
    'setup.ocrSection': {
      zh: 'OCR 图像文字识别',
      en: 'OCR Image Text Recognition',
      es: 'Reconocimiento óptico',
      hu: 'OCR képfelismerés',
      ru: 'OCR распознавание текста',
    },
    'setup.ocrKeyHint': {
      zh: '不填则使用主 API Key',
      en: 'Uses the main API Key if empty',
      es: 'Usa la clave principal si está vacío',
      hu: 'Üresen a fő API-kulcsot használja',
      ru: 'При пустом поле используется основной ключ',
    },
    'setup.ocrBasePh': {
      zh: 'OCR API 地址',
      en: 'OCR API address',
      es: 'Dirección de la API OCR',
      hu: 'OCR API címe',
      ru: 'Адрес OCR API',
    },
    'setup.ocrBaseHint': {
      zh: '例如: https://dashscope.aliyuncs.com/compatible-mode/v1',
      en: 'e.g. https://dashscope.aliyuncs.com/compatible-mode/v1',
      es: 'p. ej. https://dashscope.aliyuncs.com/compatible-mode/v1',
      hu: 'pl. https://dashscope.aliyuncs.com/compatible-mode/v1',
      ru: 'Например https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    'setup.ocrModelHint': {
      zh: 'OCR 模型名称',
      en: 'OCR model name',
      es: 'Nombre del modelo OCR',
      hu: 'OCR-modell neve',
      ru: 'Название модели OCR',
    },
    'setup.ocrProviderPh': {
      zh: '服务商名称',
      en: 'Provider name',
      es: 'Nombre del proveedor',
      hu: 'Szolgáltató neve',
      ru: 'Название провайдера',
    },
    'setup.ocrProviderHint': {
      zh: '例如: qwen-vl',
      en: 'e.g. qwen-vl',
      es: 'p. ej. qwen-vl',
      hu: 'pl. qwen-vl',
      ru: 'Например qwen-vl',
    },
    'setup.visionSection': {
      zh: '视觉分析',
      en: 'Vision Analysis',
      es: 'Análisis visual',
      hu: 'Látáselemzés',
      ru: 'Анализ изображений',
    },
    'setup.visionKeyHint': {
      zh: '不填则使用主 API Key',
      en: 'Uses the main API Key if empty',
      es: 'Usa la API principal si está vacío',
      hu: 'Üresen a fő API-kulcsot használja',
      ru: 'При пустом поле используется основной ключ',
    },
    'setup.visionBasePh': {
      zh: 'Vision API 地址',
      en: 'Vision API address',
      es: 'Dirección de la API Vision',
      hu: 'Vision API címe',
      ru: 'Адрес Vision API',
    },
    'setup.visionBaseHint': {
      zh: '不填则使用主 API 地址',
      en: 'Uses the main API address if empty',
      es: 'Usa la dirección principal si está vacío',
      hu: 'Üresen a fő API-címet használja',
      ru: 'При пустом поле используется основной адрес',
    },
    'setup.visionModelHint': {
      zh: '视觉模型名称',
      en: 'Vision model name',
      es: 'Nombre del modelo visual',
      hu: 'Látási modell neve',
      ru: 'Название визуальной модели',
    },
    'setup.codeSection': {
      zh: '代码执行',
      en: 'Code Execution',
      es: 'Ejecución de código',
      hu: 'Kódfuttatás',
      ru: 'Выполнение кода',
    },
    'setup.codeTimeoutHint': {
      zh: '执行超时时间（毫秒）',
      en: 'Execution timeout (ms)',
      es: 'Tiempo de espera de ejecución (ms)',
      hu: 'Végrehajtási időtúllépés (ms)',
      ru: 'Таймаут выполнения (мс)',
    },
    'setup.codeMaxHint': {
      zh: '最大输出大小（字符）',
      en: 'Maximum output size (chars)',
      es: 'Tamaño máximo de salida (caracteres)',
      hu: 'Maximális kimenőméret (karakterek)',
      ru: 'Максимальный размер вывода (символов)',
    },
    'setup.securitySection': {
      zh: '安全设置',
      en: 'Security Settings',
      es: 'Ajustes de seguridad',
      hu: 'Biztonsági beállítások',
      ru: 'Настройки безопасности',
    },
    'setup.securityConfirm': {
      zh: '启用危险操作确认',
      en: 'Enable dangerous operation confirmation',
      es: 'Habilitar confirmación de operaciones peligrosas',
      hu: 'Veszélyes műveletek megerősítésének bekapcsolása',
      ru: 'Включить подтверждение опасных операций',
    },
    'setup.securityConfirmHint': {
      zh: 'gitPush / executeCode 等操作需要确认',
      en: 'Operations like gitPush / executeCode require confirmation',
      es: 'Operaciones como gitPush / executeCode requieren confirmación',
      hu: 'Az olyan műveletek, mint a gitPush / executeCode, megerősítést igényelnek',
      ru: 'Такие операции как gitPush / executeCode требуют подтверждения',
    },
    'setup.securitySandbox': {
      zh: '启用代码沙盒模式',
      en: 'Enable code sandbox mode',
      es: 'Habilitar modo sandbox de código',
      hu: 'Kód-sandbox üzemmód bekapcsolása',
      ru: 'Включить режим песочницы кода',
    },
    'setup.securitySandboxHint': {
      zh: '隔离代码执行环境，提高安全性',
      en: 'Isolate the code execution environment for safety',
      es: 'Aislar el entorno de ejecución para mayor seguridad',
      hu: 'Izolálja a kód futtatási környezetét a biztonságért',
      ru: 'Изолируйте среду выполнения кода для безопасности',
    },
    'setup.scienceSection': {
      zh: 'AI for Science · 科学计算',
      en: 'AI for Science · Scientific Computing',
      es: 'IA para la ciencia · Computación científica',
      hu: 'AI a tudományért · Tudományos számítás',
      ru: 'ИИ для науки · Научные вычисления',
    },
    'setup.scienceMode': {
      zh: '启用科学计算模式',
      en: 'Enable scientific computing mode',
      es: 'Habilitar modo de cómputo científico',
      hu: 'Tudományos számítási mód bekapcsolása',
      ru: 'Включить режим научных вычислений',
    },
    'setup.scienceModeHint': {
      zh: '允许启用已安装的科学库（RDKit, Biopython 等）',
      en: 'Allows using installed scientific libraries (RDKit, Biopython, etc.)',
      es: 'Permite usar bibliotecas científicas instaladas (RDKit, Biopython, etc.)',
      hu: 'Lehetővé teszi a telepített tudományos könyvtárak használatát (RDKit, Biopython, stb.)',
      ru: 'Разрешает использовать установленные научные библиотеки (RDKit, Biopython и др.)',
    },
    'setup.scienceLibrariesHint': {
      zh: '已安装的科学库列表（逗号分隔），可在终端执行 pip install 安装',
      en: 'Installed scientific libraries (comma-separated); use pip install in the terminal',
      es: 'Bibliotecas científicas instaladas (separadas por coma), instale con pip',
      hu: 'Telepített tudományos könyvtárak (vesszővel elválasztva), pip install a terminálban',
      ru: 'Список установленных научных библиотек (через запятую), установка через pip install',
    },
    'setup.completeTitle': {
      zh: '配置完成',
      en: 'Configuration Complete',
      es: 'Configuración completada',
      hu: 'A konfiguráció kész',
      ru: 'Настройка завершена',
    },
    'setup.completeDesc': {
      zh: '正在启动 CogitoAgent...',
      en: 'Starting CogitoAgent...',
      es: 'Iniciando CogitoAgent...',
      hu: 'A CogitoAgent indítása...',
      ru: 'Запуск CogitoAgent...',
    },
    'setup.back': {
      zh: '上一步',
      en: 'Back',
      es: 'Atrás',
      hu: 'Vissza',
      ru: 'Назад',
    },
    'setup.next': {
      zh: '下一步',
      en: 'Next',
      es: 'Siguiente',
      hu: 'Tovább',
      ru: 'Далее',
    },
    'setup.finish': {
      zh: '完成配置',
      en: 'Finish',
      es: 'Finalizar',
      hu: 'Befejezés',
      ru: 'Завершить',
    },
    'setup.saveError': {
      zh: '配置保存失败',
      en: 'Failed to save configuration',
      es: 'No se pudo guardar la configuración',
      hu: 'Nem sikerült menteni a konfigurációt',
      ru: 'Не удалось сохранить настройки',
    },
    'setup.errApiRequired': {
      zh: '请输入 API Base URL',
      en: 'Please enter API Base URL',
      es: 'Introduzca la URL base de API',
      hu: 'Adja meg az API Base URL-t',
      ru: 'Введите базовый URL API',
    },
    'setup.errKeyRequired': {
      zh: '请输入 API 密钥',
      en: 'Please enter API Key',
      es: 'Introduzca la clave de API',
      hu: 'Adja meg az API-kulcsot',
      ru: 'Введите API-ключ',
    },
    'setup.errModelRequired': {
      zh: '请输入模型名称',
      en: 'Please enter the model name',
      es: 'Introduzca el nombre del modelo',
      hu: 'Adja meg a modell nevét',
      ru: 'Введите название модели',
    },
    'setup.submitting': {
      zh: '提交中...',
      en: 'Submitting...',
      es: 'Enviando...',
      hu: 'Küldés...',
      ru: 'Отправка...',
    },
    'setup.updated': {
      zh: '配置已更新',
      en: 'Configuration updated',
      es: 'Configuración actualizada',
      hu: 'A konfiguráció frissítve',
      ru: 'Настройки обновлены',
    },
    'setup.refreshing': {
      zh: '正在刷新界面...',
      en: 'Refreshing interface...',
      es: 'Actualizando la interfaz...',
      hu: 'A felület frissítése...',
      ru: 'Обновление интерфейса...',
    },
    'setup.errTimeout': {
      zh: '配置保存超时，请重试',
      en: 'Configuration save timed out, please retry',
      es: 'Tiempo de espera agotado, reintente',
      hu: 'A mentés időtúllépett, próbálja újra',
      ru: 'Истекло время сохранения, повторите попытку',
    },

    /* ===================== 预览演示 (preview) ===================== */
    'preview.desktopIdle': {
      zh: '待命中 · 输入指令开始对话',
      en: 'Standby · type a command to start',
      es: 'En espera · escriba un comando',
      hu: 'Üzemkész · írjon egy parancsot',
      ru: 'Ожидание · введите команду',
    },
    'preview.inputPlaceholder': {
      zh: '输入指令...',
      en: 'Type a command...',
      es: 'Escriba un comando...',
      hu: 'Írjon egy parancsot...',
      ru: 'Введите команду...',
    },
    'preview.dashboardTitle': {
      zh: '工作台',
      en: 'Dashboard',
      es: 'Panel de control',
      hu: 'Irányítópult',
      ru: 'Панель управления',
    },
    'preview.simulatedReply': {
      zh: '收到您的消息：{text}<br><br>这是一个模拟回复。在真实环境中，CogitoAgent 会调用工具来分析并回复您的问题。',
      en: 'Received your message: {text}<br><br>This is a simulated reply. In the real environment, CogitoAgent would call tools to analyze and respond.',
      es: 'Recibido su mensaje: {text}<br><br>Esta es una respuesta simulada. En el entorno real, CogitoAgent llamaría a herramientas para analizar y responder.',
      hu: 'Kaptam az üzenetét: {text}<br><br>Ez egy szimulált válasz. A valódi környezetben a CogitoAgent eszközöket hívna az elemzéshez és a válaszhoz.',
      ru: 'Получено ваше сообщение: {text}<br><br>Это имитация ответа. В реальной среде CogitoAgent вызвал бы инструменты для анализа.',
    },
    'preview.sessionCodeReview': {
      zh: '代码审查',
      en: 'Code Review',
      es: 'Revisión de código',
      hu: 'Kódáttekintés',
      ru: 'Ревью кода',
    },
    'preview.sessionCodeReviewPrev': {
      zh: '正在审查 PR #127 的变更...',
      en: 'Reviewing changes in PR #127...',
      es: 'Revisando cambios del PR #127...',
      hu: 'A PR #127 változásainak áttekintése...',
      ru: 'Проверка изменений в PR #127...',
    },
    'preview.sessionDocSearch': {
      zh: '文档搜索',
      en: 'Document Search',
      es: 'Búsqueda de documentos',
      hu: 'Dokumentumkeresés',
      ru: 'Поиск документов',
    },
    'preview.sessionDocSearchPrev': {
      zh: 'TypeScript 5.0 新特性概览',
      en: 'TypeScript 5.0 new features overview',
      es: 'Resumen de novedades de TypeScript 5.0',
      hu: 'A TypeScript 5.0 új funkcióinak áttekintése',
      ru: 'Обзор новых возможностей TypeScript 5.0',
    },
    'preview.sessionDataAnalysis': {
      zh: '数据分析',
      en: 'Data Analysis',
      es: 'Análisis de datos',
      hu: 'Adatelemzés',
      ru: 'Анализ данных',
    },
    'preview.sessionDataAnalysisPrev': {
      zh: 'Q3 用户增长趋势报告',
      en: 'Q3 user growth trend report',
      es: 'Informe de tendencia de crecimiento Q3',
      hu: 'Q3 felhasználónövekedési jelentés',
      ru: 'Отчёт о росте пользователей за Q3',
    },
    'preview.yesterday': {
      zh: '昨日',
      en: 'Yesterday',
      es: 'Ayer',
      hu: 'Tegnap',
      ru: 'Вчера',
    },

    /* ===================== Toast ===================== */
    'toast.success': {
      zh: '操作成功',
      en: 'Success',
      es: 'Éxito',
      hu: 'Sikeres',
      ru: 'Успешно',
    },
  };

  let current = DEFAULT_LANG;

  function normalize(locale) {
    if (!locale) return DEFAULT_LANG;
    const base = String(locale).toLowerCase().split('-')[0];
    return SUPPORTED.includes(base) ? base : DEFAULT_LANG;
  }

  function detect() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // 忽略 localStorage 访问异常
    }
    if (stored && SUPPORTED.includes(stored)) return stored;
    if (typeof navigator !== 'undefined' && navigator.language) {
      return normalize(navigator.language);
    }
    return DEFAULT_LANG;
  }

  function get() {
    return current;
  }

  function getLanguageName(lng) {
    const meta = LANGUAGE_NAMES[lng] || LANGUAGE_NAMES[DEFAULT_LANG];
    return meta ? meta.label : lng;
  }

  function t(key, vars) {
    const entry = MESSAGES[key];
    let text = entry ? entry[current] : null;
    if (text === null || text === undefined) {
      // 回退到默认语言，最后保留 key 本身，避免空白界面。
      text = entry ? entry[DEFAULT_LANG] : key;
      if (text === null || text === undefined) text = key;
    }
    if (vars && Object.keys(vars).length) {
      text = String(text).replace(/\{(\w+)\}/g, (m, name) =>
        vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m,
      );
    }
    return text;
  }

  function setLang(lng) {
    const target = SUPPORTED.includes(lng) ? lng : DEFAULT_LANG;
    if (target === current) return current;
    current = target;
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = target;
    document.dispatchEvent(new CustomEvent('cogito:langchange', { detail: { lang: target } }));
    applyDom();
    // 同步语言到后端配置
    try {
      window.electronAPI?.updateLanguage?.(target);
    } catch {
      /* ignore */
    }
    return current;
  }

  function applyAttr(el) {
    const k = el.getAttribute('data-i18n');
    if (k) el.textContent = t(k);
    const p = el.getAttribute('data-i18n-placeholder');
    if (p) el.setAttribute('placeholder', t(p));
    const ti = el.getAttribute('data-i18n-title');
    if (ti) el.setAttribute('title', t(ti));
    const alt = el.getAttribute('data-i18n-alt');
    if (alt) el.setAttribute('alt', t(alt));
  }

  function applyDom(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = scope.querySelectorAll
      ? scope.querySelectorAll(
          '[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-alt]',
        )
      : [];
    for (let i = 0; i < list.length; i++) {
      applyAttr(list[i]);
    }
  }

  /* 注入语言切换器到页面右上角（自动避开顶部窗口控制栏）
     胶囊按钮 + 下拉面板，带国旗与母语名，毛玻璃 + 微光反馈。 */
  function injectSwitcher() {
    if (document.getElementById('cogito-lang-switcher')) return;

    // 注入的切换器样式（独立作用域前缀，避免与宿主页面冲突，并适配深/浅色）
    let styleEl = document.getElementById('cogito-lang-switcher-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'cogito-lang-switcher-style';
      styleEl.textContent =
        '#cogito-lang-switcher{' +
        'position:fixed;right:14px;z-index:2147482999;font-family:var(--font-sans,system-ui);font-size:12px;' +
        'user-select:none;' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-trigger{' +
        'display:flex;align-items:center;gap:7px;padding:5px 11px 5px 9px;cursor:pointer;' +
        'color:var(--type,#e8eaed);background:#1b2230;' +
        'background:color-mix(in srgb,var(--panel-2,#1b2230) 82%,transparent);' +
        'border:1px solid var(--line,#26323f);border-radius:999px;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05);' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
        'transition:border-color .15s ease,box-shadow .15s ease,transform .1s ease;line-height:1;' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-trigger:hover{' +
        'border-color:var(--line-phosphor,#0e7490);box-shadow:0 3px 14px rgba(0,0,0,.35);transform:translateY(-1px);' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-flag{font-size:14px;line-height:1;filter:saturate(1.1);}' +
        '#cogito-lang-switcher .cogito-ls-name{font-weight:600;letter-spacing:.02em;white-space:nowrap;}' +
        '#cogito-lang-switcher .cogito-ls-caret{' +
        'width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;' +
        'border-top:5px solid var(--type-dim,#6b7280);margin-left:2px;transition:transform .15s ease;' +
        '}' +
        '#cogito-lang-switcher.open .cogito-ls-caret{transform:rotate(180deg);}' +
        '#cogito-lang-switcher .cogito-ls-menu{' +
        'position:absolute;top:calc(100% + 6px);right:0;min-width:150px;padding:5px;' +
        'background:#161b28;' +
        'background:color-mix(in srgb,var(--panel-2,#161b28) 92%,transparent);' +
        'border:1px solid var(--line,#26323f);border-radius:12px;' +
        'box-shadow:0 12px 34px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);' +
        'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
        'opacity:0;visibility:hidden;transform:translateY(-6px) scale(.98);' +
        'transform-origin:top right;transition:opacity .16s ease,transform .16s ease,visibility .16s;' +
        '}' +
        '#cogito-lang-switcher.open .cogito-ls-menu{' +
        'opacity:1;visibility:visible;transform:translateY(0) scale(1);' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-item{' +
        'width:100%;display:flex;align-items:center;gap:9px;padding:8px 10px;cursor:pointer;' +
        'color:var(--type,#d4d8df);background:transparent;border:0;border-radius:8px;text-align:left;' +
        'font:inherit;line-height:1;transition:background .12s ease,color .12s ease;' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-item:hover{background:var(--panel-3,#222a3a);color:var(--type-bright,#fff);}' +
        '#cogito-lang-switcher .cogito-ls-item.active{' +
        'background:rgba(13,148,136,.18);' +
        'background:color-mix(in srgb,var(--accent,#0d9488) 18%,transparent);color:var(--type-bright,#fff);' +
        '}' +
        '#cogito-lang-switcher .cogito-ls-item.active .cogito-ls-check{margin-left:auto;color:var(--phosphor,#5eead4);font-weight:700;}' +
        '#cogito-lang-switcher .cogito-ls-self{flex:1;}' +
        '@media (prefers-color-scheme:light){' +
        '#cogito-lang-switcher .cogito-ls-trigger{background:color-mix(in srgb,#f4f6fa 78%,transparent);color:#1b2330;border-color:#d7dde6;box-shadow:0 2px 10px rgba(0,0,0,.12);}' +
        '#cogito-lang-switcher .cogito-ls-menu{background:color-mix(in srgb,#ffffff 94%,transparent);border-color:#e3e8ef;box-shadow:0 12px 34px rgba(0,0,0,.18);}' +
        '#cogito-lang-switcher .cogito-ls-item{color:#3a4451;}' +
        '#cogito-lang-switcher .cogito-ls-item:hover{background:color-mix(in srgb,#eef1f6 70%,transparent);color:#111827;}' +
        '#cogito-lang-switcher .cogito-ls-item.active{background:color-mix(in srgb,#0ea5a4 14%,transparent);color:#0f766e;}' +
        '#cogito-lang-switcher .cogito-ls-caret{border-top-color:#64748b;}' +
        '}';

      document.head.appendChild(styleEl);
    }

    const hasTitleBar = !!(
      document.querySelector('.title-bar') || document.querySelector('.drag-bar')
    );
    const top = hasTitleBar ? '48px' : '12px';

    const host = document.createElement('div');
    host.id = 'cogito-lang-switcher';
    host.style.top = top;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cogito-ls-trigger';
    trigger.setAttribute('data-i18n-title', 'common.language');
    trigger.addEventListener('click', () => host.classList.toggle('open'));

    const flag = document.createElement('span');
    flag.className = 'cogito-ls-flag';
    const nameEl = document.createElement('span');
    nameEl.className = 'cogito-ls-name';
    const caret = document.createElement('span');
    caret.className = 'cogito-ls-caret';
    trigger.appendChild(flag);
    trigger.appendChild(nameEl);
    trigger.appendChild(caret);
    host.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'cogito-ls-menu';
    const items = [];
    SUPPORTED.forEach((code) => {
      const meta = LANGUAGE_NAMES[code];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cogito-ls-item';
      item.dataset.lang = code;
      const f = document.createElement('span');
      f.className = 'cogito-ls-flag';
      f.textContent = meta.flag;
      const self = document.createElement('span');
      self.className = 'cogito-ls-self';
      self.textContent = meta.self;
      const check = document.createElement('span');
      check.className = 'cogito-ls-check';
      check.textContent = '\u2713';
      item.appendChild(f);
      item.appendChild(self);
      item.appendChild(check);
      item.addEventListener('click', () => {
        setLang(code);
        host.classList.remove('open');
      });
      menu.appendChild(item);
      items.push(item);
    });
    host.appendChild(menu);
    document.body.appendChild(host);

    function syncUI() {
      flag.textContent = LANGUAGE_NAMES[current].flag;
      nameEl.textContent = LANGUAGE_NAMES[current].self;
      items.forEach((it) => {
        const active = it.dataset.lang === current;
        it.classList.toggle('active', active);
        it.querySelector('.cogito-ls-check').style.visibility = active ? 'visible' : 'hidden';
      });
    }
    syncUI();

    // 点击外部 / Escape 关闭
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) host.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') host.classList.remove('open');
    });

    document.addEventListener('cogito:langchange', syncUI);
  }

  function init(root) {
    current = detect();
    document.documentElement.lang = current;
    injectSwitcher();
    applyDom(root);
    return current;
  }

  // 立即确定语言，保证 t() 在 DOM 就绪前也可用
  current = detect();

  function boot() {
    init();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  window.I18n = {
    t,
    get,
    setLang,
    detect,
    init,
    apply: applyDom,
    languages: SUPPORTED,
    languageNames: LANGUAGE_NAMES,
    getLanguageName,
  };
})();
