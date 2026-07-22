# Security Policy / 安全政策

> 本项目重视安全问题。如果你发现安全漏洞，请通过以下方式报告。
> This project takes security issues seriously. If you discover a security vulnerability, please report it through the following channels.

---

## Supported Versions / 支持版本

以下版本会接收安全更新：

The following versions are currently supported with security updates:

| Version | Supported / 支持  |
| ------- | ----------------- |
| 2.3.x   | ✅ Yes / 是       |
| 2.2.x   | ⚠️ Limited / 有限 |
| < 2.2   | ❌ No / 否        |

---

## Reporting a Vulnerability / 报告漏洞

### 首选渠道 / Preferred Channel

我们鼓励通过 GitHub Security Advisory 报告漏洞：

We encourage reporting vulnerabilities through GitHub Security Advisory:

1. 访问 [GitHub Security Advisory](https://github.com/SnowLeopard-io/CogitoAgent/security/advisories/new)
   / Visit [GitHub Security Advisory](https://github.com/SnowLeopard-io/CogitoAgent/security/advisories/new)
2. 填写漏洞详情，包括：
   / Fill in the vulnerability details, including:
   - 漏洞描述（英文或中文）/ Vulnerability description (English or Chinese)
   - 影响范围 / Scope of impact
   - 复现步骤 / Steps to reproduce
   - 潜在危害 / Potential harm
   - 建议修复方案 / Suggested fix

### 替代渠道 / Alternative Channel

如果无法使用 GitHub Security Advisory，可以在 GitHub Issues 中创建 issue，添加 `security` 标签。

If you cannot use GitHub Security Advisory, you can create an issue in GitHub Issues with the `security` label.

### 报告内容 / What to Include

请尽可能提供以下信息：

Please provide as much information as possible:

- **漏洞类型**：例如命令注入、XSS、路径遍历等
  / **Vulnerability type**: e.g., command injection, XSS, path traversal, etc.
- **影响范围**：哪些模块/功能受到影响
  / **Scope**: Which modules/features are affected
- **复现步骤**：详细的复现步骤和测试代码
  / **Reproduction steps**: Detailed steps and test code
- **环境信息**：Node.js 版本、操作系统、依赖版本等
  / **Environment info**: Node.js version, OS, dependency versions, etc.
- **潜在危害**：漏洞可能造成的影响
  / **Potential impact**: What harm the vulnerability could cause
- **建议修复**：如果你有修复建议
  / **Suggested fix**: If you have a fix suggestion

---

## Response Process / 响应流程

我们承诺在收到漏洞报告后及时响应：

We commit to responding promptly to vulnerability reports:

1. **确认接收**：48 小时内确认收到报告
   / **Acknowledgment**: Confirm receipt within 48 hours
2. **评估严重性**：72 小时内完成漏洞评估
   / **Severity assessment**: Complete vulnerability assessment within 72 hours
3. **修复开发**：根据严重性制定修复计划
   / **Fix development**: Develop a fix plan based on severity
4. **发布更新**：修复完成后发布安全更新
   / **Release update**: Publish security update after fix is complete
5. **公开披露**：在修复发布后公开漏洞详情（如有必要）
   / **Public disclosure**: Disclose vulnerability details after fix release (if necessary)

### 严重性分级 / Severity Levels

| 级别 / Level | 描述 / Description               | 响应时间 / Response Time        |
| ------------ | -------------------------------- | ------------------------------- |
| **Critical** | 可远程执行任意代码、泄露敏感数据 | 24 小时内响应 / Within 24 hours |
| **High**     | 可绕过安全限制、造成本地破坏     | 48 小时内响应 / Within 48 hours |
| **Medium**   | 信息泄露、权限提升可能           | 72 小时内响应 / Within 72 hours |
| **Low**      | 安全最佳实践问题、潜在风险       | 1 周内响应 / Within 1 week      |

---

## Security Focus Areas / 安全关注点

本安全政策适用于以下场景：

This security policy applies to the following areas:

| 领域 / Area       | 描述 / Description                      |
| ----------------- | --------------------------------------- |
| **代码执行沙箱**  | JavaScript/Python 代码执行的隔离安全性  |
| **API Key 处理**  | API Key 的存储和传输安全性              |
| **文件系统访问**  | 工作目录的访问控制和路径限制            |
| **网络通信**      | WebSocket、HTTP 请求的安全性            |
| **Electron 安全** | 桌面应用的安全策略（CSP、IPC、preload） |
| **依赖安全**      | 第三方依赖的安全漏洞                    |

### 不在范围内 / Out of Scope

- 第三方 LLM API 服务的安全性（由服务商负责）
  / Third-party LLM API service security (responsibility of the service provider)
- 用户配置不当导致的安全问题
  / Security issues caused by improper user configuration
- 网络钓鱼或社会工程攻击
  / Phishing or social engineering attacks

---

## Security Features / 安全特性

CogitoAgent 已实现以下安全特性：

CogitoAgent has implemented the following security features:

### 代码执行沙箱 / Code Execution Sandbox

- JavaScript 代码执行使用 `isolated-vm` 进行进程级隔离
  / JavaScript code execution uses `isolated-vm` for process-level isolation
- Python 代码执行使用子进程隔离
  / Python code execution uses subprocess isolation
- 内置对象深度冻结，防止原型污染
  / Built-in objects are deeply frozen to prevent prototype pollution
- 危险操作（如文件删除、系统命令）需要用户确认
  / Dangerous operations (e.g., file deletion, system commands) require user confirmation

### API Key 保护 / API Key Protection

- API Key 存储在本地 `.env` 文件或系统密钥链
  / API Keys are stored in local `.env` files or system keychains
- 不在日志或控制台输出中暴露 API Key
  / API Keys are not exposed in logs or console output
- 支持环境变量优先覆盖配置文件
  / Environment variables take priority over configuration files

### 安全策略 / Security Policies

- Electron 应用配置 Content Security Policy (CSP)
  / Electron app configures Content Security Policy (CSP)
- 使用 `execFile` 替代 `exec` 防止命令注入
  / Uses `execFile` instead of `exec` to prevent command injection
- URL 验证防止 `openExternal` 漏洞
  / URL validation prevents `openExternal` vulnerabilities

---

## Best Practices / 最佳实践

### 用户安全建议 / User Security Recommendations

1. **限制工作目录**：将 AI 访问范围限制在专用工作目录
   / **Restrict workspace**: Limit AI access to a dedicated workspace directory
2. **使用强密码**：为 API Key 和账户设置强密码
   / **Use strong passwords**: Set strong passwords for API keys and accounts
3. **定期更新**：保持 CogitoAgent 和依赖的最新版本
   / **Update regularly**: Keep CogitoAgent and dependencies up to date
4. **监控执行**：关注 AI 的工具执行行为
   / **Monitor execution**: Monitor AI tool execution behavior
5. **谨慎授权**：仅授权必要的工具和权限
   / **Grant cautiously**: Only grant necessary tools and permissions

### 开发者安全建议 / Developer Security Recommendations

1. **代码审查**：所有代码变更需经过安全审查
   / **Code review**: All code changes must undergo security review
2. **依赖扫描**：定期扫描第三方依赖的安全漏洞
   / **Dependency scanning**: Regularly scan third-party dependencies for vulnerabilities
3. **最小权限**：遵循最小权限原则设计功能
   / **Least privilege**: Design features following the principle of least privilege
4. **输入验证**：对所有用户输入进行严格验证
   / **Input validation**: Strictly validate all user inputs
5. **安全测试**：添加安全相关的测试用例
   / **Security testing**: Add security-related test cases

---

## License / 许可证

本安全政策受 [Apache 2.0](LICENSE) 许可证约束。

This security policy is governed by the [Apache 2.0](LICENSE) license.

---

感谢你帮助我们保持 CogitoAgent 的安全！🎉

Thanks for helping us keep CogitoAgent secure! 🎉
