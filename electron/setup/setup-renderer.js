/**
 * 配置向导渲染进程 - setup-renderer.js
 * 处理配置向导的 UI 交互和 IPC 通信
 */

// 内联脚本外迁：节折叠交互（原 setup.html 内联 <script>，为 CSP 安全移出）
function toggleSection(id) {
  const section = document.getElementById(id);
  const toggle = section.parentElement.querySelector('.section-toggle');
  const header = section.parentElement.querySelector('.section-header');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    toggle.textContent = '−';
    header.classList.add('expanded');
  } else {
    section.style.display = 'none';
    toggle.textContent = '+';
    header.classList.remove('expanded');
  }
}
document.querySelectorAll('.section-content').forEach((el) => (el.style.display = 'none'));

// DOM 元素
const progressFill = document.getElementById('progressFill');
const progressSteps = document.querySelectorAll('.progress-steps .step');
const formSteps = document.querySelectorAll('.form-step');
const setupForm = document.getElementById('setupForm');
const setupComplete = document.getElementById('setupComplete');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');
const errorToast = document.getElementById('errorToast');

// 输入元素
const baseURLInput = document.getElementById('baseURL');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const workspaceInput = document.getElementById('workspace');
const personaGrid = document.getElementById('personaGrid');
const browseBtn = document.getElementById('browseBtn');

// 高级配置元素
const thinkingIntervalInput = document.getElementById('thinkingInterval');
const modeSelect = document.getElementById('mode');

// 邮件配置元素
const emailHostInput = document.getElementById('emailHost');
const emailPortInput = document.getElementById('emailPort');
const emailUserInput = document.getElementById('emailUser');
const emailPasswordInput = document.getElementById('emailPassword');
const emailFromInput = document.getElementById('emailFrom');

// OCR 配置元素
const ocrApiKeyInput = document.getElementById('ocrApiKey');
const ocrBaseURLInput = document.getElementById('ocrBaseURL');
const ocrModelInput = document.getElementById('ocrModel');
const ocrProviderInput = document.getElementById('ocrProvider');

// 视觉配置元素
const visionApiKeyInput = document.getElementById('visionApiKey');
const visionBaseURLInput = document.getElementById('visionBaseURL');
const visionModelInput = document.getElementById('visionModel');

// 代码执行配置元素
const codeTimeoutInput = document.getElementById('codeTimeout');
const codeMaxOutputInput = document.getElementById('codeMaxOutput');

// 安全配置元素
const confirmDangerousInput = document.getElementById('confirmDangerous');
const sandboxModeInput = document.getElementById('sandboxMode');

// 预设按钮
const presetBtns = document.querySelectorAll('.preset-btn');

// 状态
let currentStep = 1;
const totalSteps = 6;
let selectedPersona = '';

// 默认工作区路径
let defaultWorkspace = '';

async function init() {
  // 获取默认工作区（留空，让用户选择或使用默认值）
  // 工作区输入框保持空，用户可以手动输入或浏览选择
  defaultWorkspace = '';

  setupEventListeners();
  await loadPersonas();
  updateUI();
}

/**
 * 动态加载 personas 列表
 */
async function loadPersonas() {
  try {
    const personas = await window.electronAPI.getPersonas();

    personaGrid.innerHTML = '';

    // 默认选项
    const defaultCard = createPersonaCard('', '默认', '无特定性格');
    personaGrid.appendChild(defaultCard);

    // 动态加载的 personas
    for (const p of personas) {
      const card = createPersonaCard(p.id, p.name, p.id);
      personaGrid.appendChild(card);
    }

    // 绑定点击事件
    setupPersonaClickListeners();
  } catch (e) {
    console.error('加载 personas 失败:', e);
  }
}

/**
 * 创建角色卡片元素
 */
function createPersonaCard(id, name, desc) {
  const card = document.createElement('div');
  card.className = 'persona-card';
  card.dataset.persona = id;

  const nameDiv = document.createElement('div');
  nameDiv.className = 'persona-name';
  nameDiv.textContent = name;

  const descDiv = document.createElement('div');
  descDiv.className = 'persona-desc';
  descDiv.textContent = desc;

  card.appendChild(nameDiv);
  card.appendChild(descDiv);

  return card;
}

/**
 * 设置人设卡片点击事件
 */
function setupPersonaClickListeners() {
  personaGrid.querySelectorAll('.persona-card').forEach((card) => {
    card.addEventListener('click', () => {
      personaGrid.querySelectorAll('.persona-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPersona = card.dataset.persona;
    });
  });
}

/**
 * 设置事件监听
 */
function setupEventListeners() {
  btnNext.addEventListener('click', handleNext);
  btnBack.addEventListener('click', handleBack);

  // 预设按钮点击
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const targetInput = btn.closest('.form-step').querySelector('input');
      if (targetInput && preset) {
        targetInput.value = preset;
        targetInput.focus();
      }
    });
  });

  // 浏览按钮（通过 IPC 请求主进程打开文件夹对话框）
  browseBtn.addEventListener('click', () => {
    window.electronAPI.selectDirectory();
  });

  // 输入框回车跳下一步
  [baseURLInput, apiKeyInput, modelInput, workspaceInput].forEach((input) => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleNext();
        }
      });
    }
  });

  // 监听主进程消息
  window.electronAPI.onConfigResult(handleConfigResult);
  window.electronAPI.onDirectorySelected(handleDirectorySelected);
}

/**
 * 更新 UI 状态
 */
function updateUI() {
  // 更新进度条
  const progress = (currentStep / totalSteps) * 100;
  progressFill.style.width = `${progress}%`;

  // 更新步骤指示器
  progressSteps.forEach((step, idx) => {
    const stepNum = idx + 1;
    step.classList.remove('active', 'completed');
    if (stepNum === currentStep) {
      step.classList.add('active');
    } else if (stepNum < currentStep) {
      step.classList.add('completed');
    }
  });

  // 更新表单显示
  formSteps.forEach((step) => {
    step.classList.remove('active');
    if (parseInt(step.dataset.step) === currentStep) {
      step.classList.add('active');
    }
  });

  // 更新按钮
  btnBack.style.display = currentStep > 1 ? 'block' : 'none';
  btnNext.textContent = currentStep === totalSteps ? '完成配置' : '下一步';

  // 设置当前步骤的输入焦点
  setTimeout(() => {
    const activeStep = document.querySelector('.form-step.active');
    if (activeStep) {
      const input = activeStep.querySelector('input:not([type="hidden"])');
      if (input) input.focus();
    }
  }, 100);
}

/**
 * 处理下一步
 */
function handleNext() {
  // 验证当前步骤
  if (!validateCurrentStep()) {
    return;
  }

  if (currentStep < totalSteps) {
    currentStep++;
    updateUI();
  } else {
    // 完成配置
    submitConfig();
  }
}

/**
 * 处理上一步
 */
function handleBack() {
  if (currentStep > 1) {
    currentStep--;
    updateUI();
  }
}

/**
 * 验证当前步骤
 */
function validateCurrentStep() {
  let value = '';

  switch (currentStep) {
    case 1:
      value = baseURLInput.value.trim();
      if (!value) {
        showError('请输入 API Base URL');
        baseURLInput.focus();
        return false;
      }
      break;
    case 2:
      value = apiKeyInput.value.trim();
      if (!value) {
        showError('请输入 API 密钥');
        apiKeyInput.focus();
        return false;
      }
      break;
    case 3:
      value = modelInput.value.trim();
      if (!value) {
        showError('请输入模型名称');
        modelInput.focus();
        return false;
      }
      break;
    case 4:
      // 工作区可选
      value = workspaceInput.value.trim();
      break;
    case 5:
      // 人设可选
      break;
  }

  return true;
}

/**
 * 提交配置
 */
function submitConfig() {
  const config = {
    api: {
      provider: 'custom',
      baseURL: baseURLInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    },
    workspace: workspaceInput.value.trim() || defaultWorkspace,
    persona: selectedPersona,
    thinkingInterval: thinkingIntervalInput.value.trim()
      ? parseInt(thinkingIntervalInput.value.trim(), 10)
      : 3000,
    mode: modeSelect.value,
    email: {
      host: emailHostInput.value.trim(),
      port: emailPortInput.value.trim() ? parseInt(emailPortInput.value.trim(), 10) : 587,
      user: emailUserInput.value.trim(),
      password: emailPasswordInput.value.trim(),
      from: emailFromInput.value.trim(),
    },
    ocr: {
      apiKey: ocrApiKeyInput.value.trim(),
      baseURL: ocrBaseURLInput.value.trim(),
      model: ocrModelInput.value.trim() || 'Qwen2.5-VL-32B-Instruct',
      provider: ocrProviderInput.value.trim(),
    },
    vision: {
      apiKey: visionApiKeyInput.value.trim(),
      baseURL: visionBaseURLInput.value.trim(),
      model: visionModelInput.value.trim() || 'Qwen2.5-VL-32B-Instruct',
    },
    code: {
      timeout: codeTimeoutInput.value.trim() ? parseInt(codeTimeoutInput.value.trim(), 10) : 30000,
      maxOutput: codeMaxOutputInput.value.trim()
        ? parseInt(codeMaxOutputInput.value.trim(), 10)
        : 100000,
    },
    security: {
      confirmDangerous: confirmDangerousInput.checked,
      sandboxMode: sandboxModeInput.checked,
    },
  };

  // 禁用按钮，防止重复提交
  btnNext.disabled = true;
  btnNext.textContent = '提交中...';

  // 发送配置到主进程
  window.electronAPI.submitConfig(config);
}

/**
 * 处理配置结果
 */
function handleConfigResult(data) {
  if (data.success) {
    // 显示完成页面
    setupForm.style.display = 'none';
    setupComplete.style.display = 'block';

    // 2秒后启动主界面
    setTimeout(() => {
      window.electronAPI.launchMainApp();
    }, 2000);
  } else {
    btnNext.disabled = false;
    btnNext.textContent = '完成配置';
    showError(data.error || '配置保存失败');
  }
}

/**
 * 处理目录选择结果
 */
function handleDirectorySelected(dirPath) {
  if (dirPath) {
    workspaceInput.value = dirPath;
  }
}

/**
 * 显示错误
 */
function showError(message) {
  errorToast.textContent = message;
  errorToast.classList.add('show');
  setTimeout(() => {
    errorToast.classList.remove('show');
  }, 3000);
}

// 启动
init();
