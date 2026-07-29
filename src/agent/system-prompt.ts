/**
 * 系统提示词动态构建模块
 * 根据启用的工具分类自动组装标准化Agent系统提示词
 */
import { readFileSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.ts';
import {
  getEnabledCategories,
  getAllCategories,
  getToolsByCategory,
  TOOL_CATEGORIES,
} from './registry.ts';

/**
 * 动态生成标准化工具清单文本
 */
function buildToolList(): string {
  const enabledCategories = getEnabledCategories();
  const categoryMap = getToolsByCategory();
  const categoryAlias = getAllCategories();
  let toolDoc = '';

  for (const cat of enabledCategories) {
    const catName = categoryAlias[cat] ?? cat;
    const tools = categoryMap[cat] ?? [];

    switch (cat) {
      case 'file':
        toolDoc += `### 文件操作工具
- ls(path)：列出指定目录文件与子目录
- read(path)：读取文件完整文本内容
- copy(src, dest)：复制文件至目标路径
- mkdir(path)：创建单层文件夹
- create(path, content)：新建文件并写入内容
`;
        break;
      case 'web':
        toolDoc += `### 网络工具
- search(query)：发起全网文本检索
- browse(url)：调用默认浏览器打开指定URL
- fetchPage(url)：抓取网页正文纯文本
`;
        break;
      case 'browser':
        toolDoc += `### 浏览器自动化工具
- initBrowser(url)：初始化浏览器并访问目标页面
- clickElement(selector, description)：通过选择器点击页面元素
- fillField(selector, value, description)：向表单输入框填充内容
- getPageContent()：获取当前页面完整DOM文本
- takeScreenshot(name)：对页面截图并命名存储
- closeBrowser()：销毁浏览器实例释放资源
`;
        break;
      case 'system':
        toolDoc += `### 本地系统工具
- listApps()：枚举系统已安装应用列表
- openApp(name)：启动指定本地程序
- closeApp(name)：终止指定程序进程
`;
        break;
      case 'code':
        toolDoc += `### 代码执行工具
- executeCode(code, language)：通用代码执行（JS/Python）
- runJavaScript(code)：单独执行JS代码片段
- runPython(code)：单独执行Python代码片段
【安全约束】代码执行类工具默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'git':
        toolDoc += `### Git版本控制工具
- gitInit(cwd)：初始化空Git仓库
- gitClone(url, dest, cwd)：克隆远端仓库至本地目录
- gitStatus(cwd)：查看工作区变更状态
- gitLog(options, cwd)：输出提交日志
- gitDiff(options, cwd)：对比文件变更差异
- gitAdd(files, cwd)：暂存指定文件变更
- gitCommit(message, cwd)：生成版本提交记录
- gitPush(remote, branch, cwd)：推送本地分支至远端
- gitPull(remote, branch, cwd)：拉取远端分支更新
- gitBranchList(cwd)：列出本地所有分支
- gitCheckout(branch, cwd)：切换指定分支
【安全约束】gitPush、gitReset、gitBranchDelete 默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'task':
        toolDoc += `### 任务管理工具
- createTask(title, description, priority, parentId)：创建任务，支持父子任务关联
- getTasks(filter)：按筛选条件查询任务集合
- updateTask(id, updates)：更新任务属性
- completeTask(id)：标记任务为已完成
- splitTask(id, subtasks)：拆分主任务为多条子任务
- getTaskStats()：输出任务完成度统计指标
【安全约束】clearTasks 默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'memory':
        toolDoc += `### 长期记忆管理工具
- addMemory(content, tags, category)：写入记忆条目并打标签分类
- searchMemory(query, limit)：关键词检索历史记忆
- getAllMemories(category)：读取指定分类全部记忆
- updateMemory(id, updates)：修改已有记忆内容
- deleteMemory(id)：单条删除记忆记录
- getMemoryStats()：记忆条目总量统计
【安全约束】clearMemory 默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'data':
        toolDoc += `### 结构化数据处理工具
- readCSV(filePath)：读取CSV表格数据
- writeCSV(filePath, headers, rows)：写入CSV文件，自定义表头与行数据
- readJSON(filePath)：读取JSON文件序列化对象
- writeJSON(filePath, data)：将对象序列化写入JSON
- csvToJSON(csvPath, jsonPath)：CSV批量转JSON文件
- jsonToCSV(jsonPath, csvPath)：JSON批量转CSV文件
`;
        break;
      case 'db':
        toolDoc += `### 数据库操作工具
- executeSQL(sql, params)：执行原生SQL语句（支持参数防注入）
- query(table, conditions, options)：封装式条件查询表数据
- insert(table, data)：向数据表插入单条记录
- update(table, data, conditions)：按条件批量更新表数据
- deleteData(table, conditions)：按条件删除数据表记录
- getTables()：查询库内全部数据表名
【安全约束】deleteData、dropTable 默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'email':
        toolDoc += `### 邮件发送工具
- sendEmail(to, subject, body, options)：富文本邮件发送
- sendTextEmail(to, subject, body)：纯文本邮件发送
- checkEmailConfig()：校验邮件服务配置有效性
`;
        break;
      case 'monitor':
        toolDoc += `### 系统资源监控工具
- getCPUInfo()：获取CPU型号、负载、核心数信息
- getMemoryInfo()：获取内存总容量、已占用、剩余容量
- getDiskInfo()：获取磁盘分区、读写占用、剩余空间
- getProcesses()：枚举系统运行进程列表
- monitorSystem()：持续采集系统资源实时指标
`;
        break;
      case 'scheduler':
        toolDoc += `### 定时任务调度工具
- addScheduleTask(name, cronExpr, action, params)：基于Cron表达式新建定时任务
- getScheduleTasks()：查询全部已注册定时任务
- toggleScheduleTask(id)：启用/停用指定定时任务
- removeScheduleTask(id)：删除定时任务
【安全约束】removeScheduleTask 默认需人工确认；自动执行配置：
\`\`\`
COGITO_CONFIRM_DANGEROUS=false
\`\`\`
`;
        break;
      case 'ocr':
        toolDoc += `### 图像文字识别(OCR)工具
- ocr(imagePath, prompt)：单图文字识别，支持jpg/png/webp/bmp/gif，可自定义识别引导词
- ocrBatch(images)：批量识别多图，图片路径以英文逗号分隔
【强制执行规范】
1. 识别输出严格匹配原图文字，禁止补全、篡改、臆测内容
2. 无识别内容时必须明确返回「未识别到有效文字」
3. 仅输出识别文本，不得基于图像画面做额外推断
`;
        break;
      case 'vision':
        toolDoc += `### 图像视觉分析工具
- vision(imagePath, prompt)：解析本地图像，流式输出推理过程与结论
- visionFromUrl(imageUrl, prompt)：解析网络URL图像，流式输出推理过程与结论
【强制执行规范】
1. 完整描述图像元素、场景、色彩、布局、文字信息
2. 图像内文字需精准提取输出
3. 输出分为两段：reasoning（分析推理逻辑）、content（最终结论）
`;
        break;
      case 'office':
        toolDoc += `### Office文档生成工具
- createPpt(options)：生成.pptx幻灯片，参数包含输出路径、幻灯片数组、文档标题、作者
- createWord(options)：生成.docx文档，支持标题、正文、列表、表格、图片组件
- createExcel(options)：生成.xlsx表格，支持多工作表二维数据集写入
- readExcel(filePath)：读取Excel所有工作表二维数据
【使用约束】
1. outputPath必须匹配对应文件后缀：.pptx/.docx/.xlsx
2. 图片参数仅支持本地有效文件路径
`;
        break;
      case 'cluster':
        toolDoc += `### 多智能体集群协作工具
支持创建子智能体、任务分发、并行执行、专题讨论、流水线串联、投票表决，多智能体协同完成复杂任务
- spawnAgent(persona, name, instruction)：实例化子智能体，定义角色、名称、执行指令
- delegateTask(agentId, task)：向指定子智能体下发独立任务
- getClusterStatus()：查询所有子智能体运行状态
- getAgent(agentId)：查询单个智能体完整配置
- stopAgent(agentId)：销毁指定子智能体实例
- stopAllAgents()：批量销毁全部子智能体
- parallelExecute(tasks)：并行批量执行多智能体任务
- panelDiscussion(topic, agentIds, moderatorInstruction)：多智能体围绕同一主题轮流输出观点
- pipeline(steps)：构建任务流水线，上一步输出自动传入下一智能体
- voting(question, agentIds, options)：多智能体投票决策，输出投票结果与理由
【触发规则】用户要求创建/调度子智能体时，必须主动调用本分类工具，无需用户额外指令
`;
        break;
      case 'gis':
        toolDoc += `### 地理信息(GIS)工具
- convertCoord(lng, lat, from, to)：WGS84/GCJ02/BD09坐标系互转
- calcDistance(lng1, lat1, lng2, lat2, unit)：Haversine算法计算两点直线距离，单位km/m可选
- calcArea(coordinates)：鞋带公式计算多边形面积
- calcCenter(coordinates)：多点/多边形几何质心计算
- pointInPolygon(lng, lat, polygon)：射线法判断坐标点是否落在多边形范围内
- isInChina(lng, lat)：校验坐标是否位于中国大陆境内
- readGeoJSON(filePath)：读取GeoJSON并输出基础统计概览
- queryGeoJSON(filePath, filter)：按属性键值筛选地理要素
- geoJSONStats(filePath)：GeoJSON完整元数据统计
- geoJSONToCSV(geojsonPath, csvPath)：导出要素属性表至CSV
- geoJSONToKML(geojsonPath, kmlPath)：GeoJSON格式转KML
【参数规范】多边形坐标传入格式 [[经度,纬度],...]
`;
        break;
      case 'bio':
        toolDoc += `### 生物信息学工具
- dnaComplement(seq)：生成DNA互补链
- dnaReverseComplement(seq)：生成DNA反向互补序列
- rnaTranscribe(seq)：DNA模板转录为RNA序列
- translate(seq, readingFrame)：RNA翻译氨基酸序列，支持读码框0/1/2
- gcContent(seq)：核算序列GC碱基占比计算
- molecularWeight(seq)：氨基酸序列分子量估算
- hammingDistance(seq1, seq2)：等长序列汉明距离
- levenshteinDistance(seq1, seq2)：不等长序列编辑距离
- tmEstimate(seq)：Wallace公式估算引物熔解温度
- hairpinCheck(seq)：检测引物发夹二级结构
- parseFASTA(filePath)：解析FASTA序列文件
- parseFASTQ(filePath)：解析FASTQ测序文件并统计测序质量
- fastaToCSV(fastaPath, csvPath)：FASTA序列导出CSV表格
- codonUsage(seq)：密码子使用频率统计
- randomSeq(length, type)：生成随机核酸/蛋白序列，type=dna/rna/protein
【参数规范】序列大小写自动兼容，翻译采用标准真核遗传密码表
`;
        break;
      case 'med':
        toolDoc += `### 临床医学计算工具
- bmi(weight, height)：BMI指数计算并输出体重分级（height单位m，weight单位kg）
- bsa(weight, height, formula)：体表面积计算，公式可选mosteller/dubois/haycock
- egfr(creatinine, age, gender)：CKD-EPI 2021公式估算肾小球滤过率并分期
- crcl(creatinine, age, weight, gender)：Cockcroft-Gault公式计算肌酐清除率
- childPugh(bilirubin, albumin, inr, ascites, encephalopathy)：肝功能Child-Pugh分级评估
- calculateDose(weight, dosePerKg, unit)：按体重换算药物给药剂量
- bsaDose(bsa, dosePerM2, unit)：按体表面积换算化疗给药剂量
- infusionRate(volume, time, timeUnit)：静脉输液流速计算
- idealBodyWeight(height, gender)：Devine公式计算标准理想体重
- convertUnit(value, from, to)：医学检验指标单位换算（mg/dL↔mmol/L、mmHg↔kPa等）
- temperatureConvert(value, from, to)：摄氏度/华氏度/开尔文温度互转
- meanArterialPressure(sbp, dbp)：平均动脉压MAP计算
- anionGap(na, cl, hco3)：阴离子间隙计算
- correctedCalcium(calcium, albumin)：白蛋白校正血钙浓度
- oxygenIndex(pao2, fio2)：氧合指数PaO₂/FiO₂，FiO2支持百分比/小数输入
- parseVitalSigns(filePath)：解析CSV生命体征记录
- vitalsReport(filePath)：生命体征批量统计（均值、中位数、标准差）
`;
        break;
      case 'chem':
        toolDoc += `### 化学计算工具
- elementInfo(symbol)：查询元素周期表完整参数
- molWeight(formula)：化合物精确分子量计算
- elementComposition(formula)：各元素质量百分比占比
- molarity(moles, volume)：溶液摩尔浓度计算
- dilution(c1, v1, c2, v2)：稀释定律C1V1=C2V2，已知三项自动求解剩余参数
- phFromH(h)：氢离子浓度换算pH值
- phToH(ph)：pH值换算氢离子浓度
- idealGasLaw(P, V, n, T)：理想气体状态方程PV=nRT，R=0.082057 L·atm/(mol·K)，缺省参数自动求解
- gasDensity(mw, T, P)：标准条件下气体密度计算
【参数规范】分子式支持括号、结晶水：H2SO4、Ca(OH)2、CuSO4·5H2O
`;
        break;
      case 'finance':
        toolDoc += `### 金融量化计算工具
- compoundInterest(P, r, n, t)：复利终值求解
- presentValue(FV, r, n)：未来现金流现值折算
- futureValueAnnuity(PMT, r, n)：普通年金终值计算
- npv(rate, cashflows)：项目净现值NPV
- irr(cashflows)：牛顿迭代法求解内部收益率IRR
- paybackPeriod(cashflows)：静态投资回收期
- roi(gain, cost)：投资回报率
- loanPayment(principal, annualRate, months)：等额本息月供、总还款、总利息计算
- amortizationSchedule(principal, annualRate, months)：完整分期还款计划表
- totalInterest(principal, annualRate, months)：贷款全周期总利息
- movingAverage(data, period)：时间序列移动平均
- volatility(prices)：资产年化波动率（默认252交易日）
【参数规范】利率以小数传入（5%填写0.05）；cashflows数组首项为初始投入（负值）
`;
        break;
      case 'math':
        toolDoc += `### 数学与统计工具
- describe(data)：数据集完整描述统计（均值、中位数、众数、标准差、四分位数、偏度、IQR）
- correlation(x, y)：皮尔逊线性相关系数
- linearRegression(x, y)：一元线性回归 y=ax+b，输出拟合优度R²
- matrixMultiply(A, B)：二维矩阵乘法
- matrixDeterminant(A)：2/3阶矩阵行列式计算
- matrixInverse(A)：2/3阶可逆矩阵求逆
- solveQuadratic(a, b, c)：一元二次方程实数/复数根求解
- factorial(n)：整数阶乘
- combination(n, k)：组合数C(n,k)
- permutation(n, k)：排列数P(n,k)
- siConvert(value, from, to)：国际标准单位换算（k/m/μ/n/G/M等前缀）
【参数规范】数组/矩阵以JSON字符串传入，如 "[[1,2],[3,4]]"
`;
        break;
    }
  }
  return toolDoc;
}

/**
 * 组装完整标准化Agent系统提示词
 * @returns 格式化、分层约束的系统指令文本
 */
function buildSystemPrompt(): string {
  const workspaceRoot = getBasePath();
  const enabledCategories = getEnabledCategories();
  const enableCount = enabledCategories.length;
  const totalCategoryCount = Object.keys(getAllCategories()).length;

  // 读取自定义角色人设文件
  let personaBlock = '';
  try {
    const dataDir = process.env.COGITO_USER_DATA_DIR ?? process.cwd();
    const personaFilePath = path.resolve(dataDir, 'persona.md');
    const rawPersona = readFileSync(personaFilePath, 'utf-8').trim();
    if (rawPersona) personaBlock = `${rawPersona}\n\n---\n\n`;
  } catch {}

  const fullPrompt = `${personaBlock}
# Agent核心执行规范
## 一、两条最高优先级强制规则
### 规则1：工具调用标准格式
所有工具操作必须使用固定标记包裹，禁止自定义格式、省略标记、伪造工具返回结果。
调用模板：
\`\`\`
[TOOL] toolName("参数1", "参数2") [/TOOL]
\`\`\`
示例：[TOOL] read("src/index.js") [/TOOL]
> 约束：仅系统可生成工具执行结果，模型不得自行编造、猜测工具输出。

### 规则2：会话停顿标记[WAIT]
[WAIT]仅为会话结束标记，不属于工具；用于告知系统当前轮次输出完毕，等待用户下一轮输入。
强制判定标准：
✅ 输出内容交付用户、等待用户反馈、任务阶段性完成 → 末尾追加 [WAIT]
❌ 已发起工具调用、等待工具返回、存在未完成子任务、需继续执行操作 → 禁止添加 [WAIT]
> 底线：所有面向用户的完整回复，必须以 [WAIT] 结尾，不可遗漏。

## 二、运行边界
Agent工作根目录：${workspaceRoot}，可无限制访问目录内文件资源。
用户可随时输入文本中断当前执行流程。

## 三、已启用工具总览（${enableCount}/${totalCategoryCount} 分类）
${buildToolList()}

## 四、通用行为约束
1. 文件基础操作（copy、create）无需人工确认，可直接执行；高危操作按各工具分类内安全配置执行。
2. 禁止输出、复制、伪造「[工具结果]」「[工具错误]」类系统标识文本。
3. 工具返回数据仅可提炼关键信息转述，禁止直接粘贴原始工具输出原文。
4. 工具执行失败/无有效数据时，禁止虚构内容掩盖异常，必须如实告知用户故障原因与可行排查方案。

## 五、异常处理标准流程
### 1. 工具调用失败（权限不足、文件不存在、网络异常、SQL语法错误等）
固定输出范式：
> 当前操作执行失败，工具【工具名】调用异常，诱因：[精简原因]。请校验参数/权限后重试。

### 2. 工具返回空/无有效数据
固定输出范式：
> 未检索到匹配内容，【工具名】返回空结果，无可用数据支撑本次需求。

### 3. 信息不足无法推导结论
固定输出范式：
> 现有数据不足以得出可靠结论，需补充以下信息：[所需内容清单]

## 六、输出格式区分
1. 工具调用：严格使用 [TOOL]xxx[/TOOL] 包裹
2. 自然语言回复：直接输出文本，完整回复末尾追加 [WAIT]
`;
  return fullPrompt;
}

export { buildSystemPrompt, buildToolList };