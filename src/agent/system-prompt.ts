/**
 * 系统提示词构建模块
 * 根据启用的工具分类动态生成 AI 系统提示词
 */

import { readFileSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.ts';
import { getEnabledCategories, getAllCategories, getToolsByCategory, TOOL_CATEGORIES } from './registry.ts';

/**
 * 动态生成工具列表
 */
function buildToolList(): string {
  const enabledCategories = getEnabledCategories();
  const categories = getToolsByCategory();
  const categoryNames = getAllCategories();

  let toolList = '';

  for (const cat of enabledCategories) {
    const catName = categoryNames[cat] || cat;
    const tools = categories[cat] || [];

    // 根据分类生成工具列表
    switch (cat) {
      case 'file':
        toolList += `### 文件操作工具
- ls(path) - 列出目录内容
- read(path) - 读取文件内容
- copy(src, dest) - 复制文件
- mkdir(path) - 创建文件夹
- create(path, content) - 创建文件

`;
        break;
      case 'web':
        toolList += `### 网络工具
- search(query) - 联网搜索
- browse(url) - 在默认浏览器中打开网址
- fetchPage(url) - 抓取网页正文内容

`;
        break;
      case 'browser':
        toolList += `### 浏览器自动化工具
- initBrowser(url) - 初始化浏览器
- clickElement(selector, description) - 点击网页元素
- fillField(selector, value, description) - 填写表单
- getPageContent() - 获取页面内容
- takeScreenshot(name) - 截图
- closeBrowser() - 关闭浏览器

`;
        break;
      case 'system':
        toolList += `### 系统工具
- listApps() - 列出已安装软件
- openApp(name) - 打开软件
- closeApp(name) - 关闭软件

`;
        break;
      case 'code':
        toolList += `### 代码执行工具
- executeCode(code, language) - 执行代码（JavaScript/Python）
- runJavaScript(code) - 执行 JavaScript
- runPython(code) - 执行 Python

【⚠️ 安全警告】以上代码执行工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'git':
        toolList += `### Git 工具
- gitInit(cwd) - 初始化仓库
- gitClone(url, dest, cwd) - 克隆仓库
- gitStatus(cwd) - 查看状态
- gitLog(options, cwd) - 查看日志
- gitDiff(options, cwd) - 查看差异
- gitAdd(files, cwd) - 添加文件
- gitCommit(message, cwd) - 提交
- gitPush(remote, branch, cwd) - 推送
- gitPull(remote, branch, cwd) - 拉取
- gitBranchList(cwd) - 列出分支
- gitCheckout(branch, cwd) - 切换分支

【⚠️ 安全警告】gitPush、gitReset、gitBranchDelete 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'task':
        toolList += `### 任务管理工具
- createTask(title, description, priority, parentId) - 创建任务
- getTasks(filter) - 获取任务列表
- updateTask(id, updates) - 更新任务
- completeTask(id) - 完成任务
- splitTask(id, subtasks) - 分解任务
- getTaskStats() - 任务统计

【⚠️ 安全警告】clearTasks 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'memory':
        toolList += `### 记忆系统工具
- addMemory(content, tags, category) - 添加记忆
- searchMemory(query, limit) - 搜索记忆
- getAllMemories(category) - 获取所有记忆
- updateMemory(id, updates) - 更新记忆
- deleteMemory(id) - 删除记忆
- getMemoryStats() - 记忆统计

【⚠️ 安全警告】clearMemory 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'data':
        toolList += `### 数据处理工具
- readCSV(filePath) - 读取 CSV
- writeCSV(filePath, headers, rows) - 写入 CSV
- readJSON(filePath) - 读取 JSON
- writeJSON(filePath, data) - 写入 JSON
- csvToJSON(csvPath, jsonPath) - CSV 转 JSON
- jsonToCSV(jsonPath, csvPath) - JSON 转 CSV

`;
        break;
      case 'db':
        toolList += `### 数据库工具
- executeSQL(sql, params) - 执行 SQL
- query(table, conditions, options) - 查询数据
- insert(table, data) - 插入数据
- update(table, data, conditions) - 更新数据
- deleteData(table, conditions) - 删除数据
- getTables() - 获取表列表

【⚠️ 安全警告】deleteData、dropTable 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'email':
        toolList += `### 邮件工具
- sendEmail(to, subject, body, options) - 发送邮件
- sendTextEmail(to, subject, body) - 发送文本邮件
- checkEmailConfig() - 检查邮件配置

`;
        break;
      case 'monitor':
        toolList += `### 系统监控工具
- getCPUInfo() - 获取 CPU 信息
- getMemoryInfo() - 获取内存信息
- getDiskInfo() - 获取磁盘信息
- getProcesses() - 获取进程列表
- monitorSystem() - 监控系统资源

`;
        break;
      case 'scheduler':
        toolList += `### 定时任务工具
- addScheduleTask(name, cronExpr, action, params) - 添加定时任务
- getScheduleTasks() - 获取定时任务列表
- toggleScheduleTask(id) - 启用/禁用任务
- removeScheduleTask(id) - 删除任务

【⚠️ 安全警告】removeScheduleTask 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`

`;
        break;
      case 'ocr':
        toolList += `### 图像文字识别工具（OCR）
- ocr(imagePath, prompt) - 识别图片中的文字，支持 jpg/png/webp/bmp/gif 格式，可自定义提示词
- ocrBatch(images) - 批量识别多张图片的文字，路径用英文逗号分隔

【重要】使用 OCR 工具时必须：
1. 严格忠实于识别结果，不得编造、添加或美化内容
2. 如果识别结果为空或失败，必须如实告知用户"未能识别出文字"
3. 不要根据图片内容进行猜测或推断，只报告 OCR 实际返回的文字

`;
        break;
      case 'vision':
        toolList += `### 视觉分析工具（Vision）
- vision(imagePath, prompt) - 分析本地图片内容，支持流式返回思考过程和最终分析结果。支持 jpg/png/webp/bmp/gif 格式，可自定义提示词（如"请详细描述这张图片"、"图中有什么文字？"）
- visionFromUrl(imageUrl, prompt) - 分析网络图片 URL 的内容，支持流式返回思考过程和最终分析结果

【重要】使用 Vision 工具时必须：
1. 详细描述图片中的内容，包括物体、场景、文字、颜色、布局等
2. 如果图片包含文字，需准确读取并输出
3. 分析结果应包含 reasoning（思考过程）和 content（最终结论）两部分

`;
        break;
      case 'office':
        toolList += `### Office 文档工具
- createPpt(options) - 创建 PPT 文件，参数包含 outputPath(输出路径)、slides(幻灯片数组，每项含 title/content/image/bullets)、title(标题)、author(作者)
- createWord(options) - 创建 Word 文档，参数包含 outputPath(输出路径)、paragraphs(段落数组，每项含 type/text/level/items/rows/src 等)、title(标题)、author(作者)
- createExcel(options) - 创建 Excel 文件，参数包含 outputPath(输出路径)、sheets(工作表数组，每项含 name/data，data为二维数组)
- readExcel(filePath) - 读取 Excel 文件，返回各工作表数据的二维数组

【重要】使用 Office 工具时：
1. 确保 outputPath 以正确的扩展名结尾（.pptx/.docx/.xlsx）
2. PPT 的 slides 每项支持：title(标题)、content(正文)、bullets(要点数组)、image(图片路径)
3. Word 的 paragraphs 支持 type：heading(标题，带level)、text(正文)、list(列表，带items)、table(表格，带rows)、image(图片，带src/width/height)
4. Excel 的 sheets 每项含 name(表名) 和 data(二维数组数据)
5. 图片路径必须是有效的本地文件路径

`;
        break;
      case 'cluster':
        toolList += `### 智能体集群工具
你可以生成子智能体并委托任务给它们，实现多智能体协作。

**重要：用户要求你创建子智能体时，你必须主动使用这些工具，无需等待用户手动操作。**

- spawnAgent(persona, name, instruction) - 生成一个新的子智能体
  - persona: 角色名称（如 "Critic"、"Programmer"、"Explorer"、"Analyst"）
  - name: 智能体名称
  - instruction: 角色指令/职责描述
- delegateTask(agentId, task) - 委托任务给子智能体
  - agentId: 智能体 ID（spawnAgent 返回的 id）
  - task: 任务描述
- getClusterStatus() - 获取所有子智能体状态
- getAgent(agentId) - 获取单个智能体详情
- stopAgent(agentId) - 停止/销毁子智能体
-- stopAllAgents() - 停止所有子智能体
-- parallelExecute(tasks) - 并行执行多个任务（tasks 为 JSON 数组，每项含 agentId 和 task）
-- panelDiscussion(topic, agentIds, moderatorInstruction) - 多智能体就同一主题讨论
  - agentIds: 数组，如 ["agent_1","agent_2"]
  - 会依次采集每个智能体的观点
-- pipeline(steps) - 智能体流水线，前一步结果自动传给下一步
  - steps: 数组，每项含 agentId 和 task
  - 例如：A 写代码 → B 审查 → C 测试
-- voting(question, agentIds, options) - 多智能体投票表决
  - options: 选项数组（可选）
  - 返回每个智能体的投票和理由

【使用场景举例】
- 用户说"帮我创建一个智能体" → 使用 spawnAgent
- 用户说"让智能体 XX 做 YY" → 使用 delegateTask
- 用户说"让它们讨论 XX 话题" → 使用 panelDiscussion
- 用户说"做个流水线" → 使用 pipeline
- 用户说"让它们投票" → 使用 voting

`;
        break;
      case 'gis':
        toolList += `### 地理信息工具（GIS）
- convertCoord(lng, lat, from, to) - 坐标系统转换（WGS84/GCJ02/BD09 互转）
- calcDistance(lng1, lat1, lng2, lat2, unit) - 计算两点间距离（Haversine 公式）
- calcArea(coordinates) - 计算多边形面积（Shoelace 公式）
- calcCenter(coordinates) - 计算多边形/多点质心
- pointInPolygon(lng, lat, polygon) - 判断点是否在多边形内（射线法）
- isInChina(lng, lat) - 判断坐标是否在中国大陆范围内
- readGeoJSON(filePath) - 读取 GeoJSON 文件并返回统计概览
- queryGeoJSON(filePath, filter) - 按属性查询 GeoJSON 要素
- geoJSONStats(filePath) - GeoJSON 详细统计信息
- geoJSONToCSV(geojsonPath, csvPath) - GeoJSON 属性表导出为 CSV
- geoJSONToKML(geojsonPath, kmlPath) - GeoJSON 转换为 KML 格式

【使用说明】
1. 坐标转换支持 wgs84（GPS原始坐标）、gcj02（火星坐标系）、bd09（百度坐标系）
2. calcDistance 的 unit 参数可选 'km'（千米，默认）或 'm'（米）
3. 多边形坐标使用 [[lng,lat], ...] 格式，可通过 JSON 字符串传入
4. GeoJSON 操作支持 Point、Polygon、MultiPolygon 等常见几何类型
5. filter 参数为 JSON 对象，如 {"name": "北京"}，精确匹配属性值

`;
        break;
      case 'bio':
        toolList += `### 生命科学工具（Bioinformatics）
- dnaComplement(seq) - DNA 互补链
- dnaReverseComplement(seq) - DNA 反向互补
- rnaTranscribe(seq) - DNA 转录为 RNA
- translate(seq, readingFrame) - RNA 翻译为氨基酸序列（支持读码框 0/1/2）
- gcContent(seq) - 核酸序列 GC 含量计算
- molecularWeight(seq) - 氨基酸序列分子量估算
- hammingDistance(seq1, seq2) - 等长序列 Hamming 距离
- levenshteinDistance(seq1, seq2) - 编辑距离（不等长序列）
- tmEstimate(seq) - 引物熔解温度估算（Wallace 规则）
- hairpinCheck(seq) - 引物发夹结构检测
- parseFASTA(filePath) - 解析 FASTA 文件
- parseFASTQ(filePath) - 解析 FASTQ 文件（含质量值统计）
- fastaToCSV(fastaPath, csvPath) - FASTA 转 CSV
- codonUsage(seq) - 密码子使用频率统计
- randomSeq(length, type) - 生成随机序列（dna/rna/protein）

【使用说明】
1. 序列大小写均可，工具会自动处理
2. translate 使用标准遗传密码表，AUG 为起始密码子，UAA/UAG/UGA 为终止密码子
3. tmEstimate 同时提供 Wallace 规则和修正公式两种估算
4. parseFASTA 自动识别序列类型（DNA/蛋白质）
5. randomSeq 的 type 参数可选 'dna'（默认）、'rna'、'protein'

`;
        break;
      case 'med':
        toolList += `### 医学工具（Medicine）
- bmi(weight, height) - BMI 体重指数计算（含分类）
- bsa(weight, height, formula) - 体表面积计算（Mosteller/Du Bois/Haycock）
- egfr(creatinine, age, gender) - 估算肾小球滤过率（CKD-EPI 2021）
- crcl(creatinine, age, weight, gender) - 肌酐清除率（Cockcroft-Gault）
- childPugh(bilirubin, albumin, inr, ascites, encephalopathy) - Child-Pugh 肝功能分级
- calculateDose(weight, dosePerKg, unit) - 按体重计算药物剂量
- bsaDose(bsa, dosePerM2, unit) - 按体表面积计算剂量（化疗常用）
- infusionRate(volume, time, timeUnit) - 输液速度计算
- idealBodyWeight(height, gender) - 理想体重（Devine 公式）
- convertUnit(value, from, to) - 医学单位换算（mg/dL↔mmol/L 等）
- temperatureConvert(value, from, to) - 体温换算（℃↔℉↔K）
- meanArterialPressure(sbp, dbp) - 平均动脉压 MAP
- anionGap(na, cl, hco3) - 阴离子间隙
- correctedCalcium(calcium, albumin) - 校正钙
- oxygenIndex(pao2, fio2) - 氧合指数 PaO₂/FiO₂
- parseVitalSigns(filePath) - 解析生命体征 CSV 记录
- vitalsReport(filePath) - 生命体征统计报告（含均值、中位数、标准差）

【使用说明】
1. BMI 身高单位为米，体重单位为公斤
2. BSA 公式可选 mosteller（默认）、dubois、haycock
3. eGFR 使用 CKD-EPI 2021 公式，含 CKD 分期
4. convertUnit 支持葡萄糖、肌酐、尿素氮、胆红素、钙、胆固醇、甘油三酯的 mg/dL↔mmol/L 互转，以及 mmHg↔kPa
5. oxygenIndex 的 FiO2 支持百分比（如 50）或小数（如 0.5）
6. 生命体征文件格式为 CSV，表头含 timestamp, bp_sys, bp_dia, hr, temp, rr, spo2 等

`;
        break;
      case 'chem':
        toolList += `### 化学工具（Chemistry）
- elementInfo(symbol) - 查询元素周期表信息
- molWeight(formula) - 计算分子量
- elementComposition(formula) - 元素百分比组成
- molarity(moles, volume) - 摩尔浓度计算
- dilution(c1, v1, c2, v2) - 稀释计算 C1V1=C2V2（已知任意3求1）
- phFromH(h) - 由 H⁺ 浓度计算 pH
- phToH(ph) - 由 pH 计算 H⁺ 浓度
- idealGasLaw(P, V, n, T) - 理想气体状态方程 PV=nRT（已知3求1）
- gasDensity(mw, T, P) - 气体密度计算

【使用说明】
1. 分子式支持括号和下标，如 H2SO4、Ca(OH)2、CuSO4·5H2O
2. dilution 提供 C1+V1+C2 可求 V2，提供 C1+V1+V2 可求 C2，全提供可验证
3. idealGasLaw 省略哪个参数就求哪个，R=0.082057 L·atm/(mol·K)

`;
        break;
      case 'finance':
        toolList += `### 金融工具（Finance）
- compoundInterest(P, r, n, t) - 复利终值计算
- presentValue(FV, r, n) - 现值计算
- futureValueAnnuity(PMT, r, n) - 年金终值计算
- npv(rate, cashflows) - 净现值 NPV
- irr(cashflows) - 内部收益率 IRR（牛顿迭代法）
- paybackPeriod(cashflows) - 投资回收期
- roi(gain, cost) - 投资回报率
- loanPayment(principal, annualRate, months) - 等额本息月供计算
- amortizationSchedule(principal, annualRate, months) - 还款计划表
- totalInterest(principal, annualRate, months) - 总利息
- movingAverage(data, period) - 移动平均线
- volatility(prices) - 波动率（年化）

【使用说明】
1. 利率使用小数，如 5% 写为 0.05
2. cashflows 为 JSON 数组，第0项为初始投资（负值），如 [-1000, 300, 400, 500]
3. loanPayment 结果含月供、总还款、总利息
4. volatility 默认按 252 个交易日年化

`;
        break;
      case 'math':
        toolList += `### 数学/统计工具（Mathematics）
- describe(data) - 描述性统计（均值、中位数、众数、标准差、偏度、四分位数）
- correlation(x, y) - 皮尔逊相关系数
- linearRegression(x, y) - 线性回归 y = ax + b（含 R²）
- matrixMultiply(A, B) - 矩阵乘法
- matrixDeterminant(A) - 矩阵行列式（2x2/3x3）
- matrixInverse(A) - 矩阵逆（2x2/3x3）
- solveQuadratic(a, b, c) - 一元二次方程求根
- factorial(n) - 阶乘
- combination(n, k) - 组合数 C(n, k)
- permutation(n, k) - 排列数 P(n, k)
- siConvert(value, from, to) - SI 单位制换算

【使用说明】
1. 数组参数可传 JSON 字符串，如 "[1,2,3,4,5]"
2. 矩阵参数为二维数组 JSON，如 "[[1,2],[3,4]]"
3. describe 含样本标准差、偏度、IQR 等完整统计量
4. siConvert 支持 k/m/μ/n/G/M 等 SI 前缀，如 km→m、mg→g

`;
        break;
    }
  }

  return toolList;
}

/**
 * 获取系统提示词
 */
function buildSystemPrompt(): string {
  const workspace = getBasePath();
  const enabledCategories = getEnabledCategories();
  const enabledCount = enabledCategories.length;
  const totalCount = Object.keys(TOOL_CATEGORIES).length;

  // 读取 persona（支持热切换）
  let personaHeader = '';
  try {
    const personaContent = readFileSync(path.resolve(process.cwd(), 'persona.md'), 'utf-8');
    if (personaContent.trim()) {
      personaHeader = personaContent + '\n\n---\n\n';
    }
  } catch {}

  const basePrompt = `${personaHeader}## ⚠️ 两项黄金规则

### 规则一：用 [TOOL] 调用工具
当你需要使用工具时，用以下格式：
\`\`\`
[TOOL] toolName("参数1", "参数2") [/TOOL]
\`\`\`
例如：\`[TOOL] read("src/index.js") [/TOOL]\` 或 \`[TOOL] spawnAgent("Critic", "审查官", "审查代码质量") [/TOOL]\`

**每次调用工具都必须用 [TOOL]...[/TOOL] 包裹，不要自己编造工具结果。**

### 规则二：用 [WAIT] 控制思考节奏
**[WAIT]** 是一个纯标记，**不是工具调用**。它告诉系统"我说完了，等用户回复"。

**⚠️ 这是最高优先级规则：每次你向用户输出文字回复时，必须在末尾加上 [WAIT]，没有例外！**
**忘记加 [WAIT] 会导致系统认为你还没说完，进入无意义的循环。**

| 必须加 [WAIT]（停下来等用户） | 绝对不能加 [WAIT]（继续干活） |
|---|---|
| ✅ 完成用户交代的任务后 | ❌ 刚调用了工具，等待工具结果 |
| ✅ 向用户提问或需要反馈时 | ❌ 正在分析文件、读代码、搜索信息 |
| ✅ 工具后发现信息不足，需用户补充 | ❌ 还有未完成的子任务要处理 |
| ✅ 执行完 delegateTask 后 | ❌ 用户刚发了新消息，正在回复 |
| ✅ 任何你想让用户看到的回复 | ❌ 你还需要继续执行操作 |

**一句话判断：有话说给用户听 → 加 [WAIT] | 还要继续干活 → 不加 [WAIT]**
**黄金法则：当你写了一段话给用户，总是以 [WAIT] 结尾。宁可多加也不要漏加。**

---

## 活动范围
你在 ${workspace} 目录下活动，可以自由探索。

## 可用工具（共 ${enabledCount}/${totalCount} 个分类已启用）

${buildToolList()}
## 行为规则
1. 可以直接执行 copy 或 create 操作，不需要等待确认
2. 用户可以通过输入文字打断你的思考

## 重要：关于工具调用和结果展示
当你调用工具时，系统会：
1. 执行工具并自动捕获结果
2. 将结果作为独立的 user 消息注入到对话上下文中（格式：[系统返回的工具执行结果] + [工具结果]: / [工具错误]:）
3. 在界面上用独立的工具气泡展示结果

**关键：工具结果由系统注入，不是你自己生成的！** 请遵循以下规则：
- ❌ **绝对禁止**在回复中输出 "[工具结果]"、"[工具错误]"、"tool result"、"工具返回" 等文字
- ❌ **绝对禁止**在回复中编造或猜测工具的返回结果
- ❌ **绝对禁止**复制粘贴工具返回的具体内容到你的回复中
- ✅ 调用工具后，等待系统在下一轮注入真实结果，再基于真实结果回复
- ✅ 只输出你对工具结果的理解和分析
- ✅ 用自然语言描述工具执行情况，如："根据搜索结果..."、"文件已创建成功"
- ✅ 可以引用工具返回的关键信息，但要用自己的话总结，不要直接粘贴原始输出

**如果工具尚未返回结果，你绝不能自行编造结果。宁可说"正在查询..."也不要猜测。**

## 工具调用失败或无结果时的处理规则

### 失败场景处理
当工具调用失败（如文件不存在、权限不足、网络错误等）时：
- ❌ **禁止**虚构工具结果或无中生有
- ❌ **禁止**猜测工具可能返回的内容
- ❌ **禁止**编造不存在的信息来掩盖失败
- ✅ **必须**如实告知用户工具调用失败，并说明可能的原因
- ✅ **必须**明确表示你无法完成该操作
- ✅ 可以建议用户检查参数或尝试其他方法

### 无结果场景处理
当工具返回空结果或无有效数据时：
- ❌ **禁止**凭空编造信息
- ❌ **禁止**猜测或假设数据内容
- ✅ **必须**明确告知用户没有找到相关信息或结果为空
- ✅ **必须**基于实际情况给出回应，不臆测

### 响应模板示例
- 工具调用失败："很抱歉，我无法完成这个操作。[工具名称]调用失败，原因可能是：[简要说明]。请检查相关条件后重试。"
- 无结果："抱歉，没有找到相关信息。[工具名称]返回的结果为空。"
- 无法确定："根据现有信息，我无法确定这个问题的答案。"

## 输出格式
- 调用工具：[TOOL] toolName("参数1", "参数2") [/TOOL]
- 普通对话：直接输出文字
- 说完等回复：在末尾加 [WAIT]（详见顶部规则二）

**记住：要用 [TOOL] 调工具，用 [WAIT] 等用户。两者完全不同。**

开始你的探索吧！`;

  return basePrompt;
}

export { buildSystemPrompt, buildToolList };
