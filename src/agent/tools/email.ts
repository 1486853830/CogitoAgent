import { loadConfig } from '../../config.ts';

/**
 * 发送邮件
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options: any = {},
): Promise<any> {
  const cfg: any = loadConfig();
  const emailConfig = cfg.email || {};

  if (
    !emailConfig.smtpHost ||
    !emailConfig.smtpPort ||
    !emailConfig.user ||
    !emailConfig.password
  ) {
    return {
      success: false,
      error: '邮件配置不完整，请在 .env 文件中配置 COGITO_EMAIL_* 相关参数',
    };
  }

  const nodemailer: any = await import('nodemailer');

  try {
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpPort === 465,
      // 587 等非 SSL 端口需要 STARTTLS 升级加密，否则明文发送会被服务器拒绝。
      requireTLS: emailConfig.smtpPort !== 465,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password,
      },
    });

    const mailOptions = {
      from: emailConfig.from || emailConfig.user,
      to: to,
      subject: subject,
      text: body,
      html: options.html || null,
      cc: options.cc || null,
      bcc: options.bcc || null,
      attachments: options.attachments || [],
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      data: `邮件发送成功！Message ID: ${info.messageId}`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `发送邮件失败: ${e.message}`,
    };
  }
}

/**
 * 发送简单文本邮件
 */
async function sendTextEmail(to: string, subject: string, body: string): Promise<any> {
  return await sendEmail(to, subject, body);
}

/**
 * 发送 HTML 邮件
 */
async function sendHtmlEmail(to: string, subject: string, htmlBody: string): Promise<any> {
  return await sendEmail(to, subject, '', { html: htmlBody });
}

/**
 * 发送带附件的邮件
 */
async function sendEmailWithAttachments(
  to: string,
  subject: string,
  body: string,
  attachments: any,
): Promise<any> {
  return await sendEmail(to, subject, body, { attachments });
}

/**
 * 发送邮件模板
 */
async function sendTemplateEmail(
  to: string,
  subject: string,
  templateName: string,
  data: any,
): Promise<any> {
  const templates: any = {
    welcome: {
      text: `欢迎使用 CogitoAgent！\n\n您好，感谢您的注册。\n\n用户名: ${data.username}\n邮箱: ${data.email}\n\n祝您使用愉快！`,
      html: `<h1>欢迎使用 CogitoAgent！</h1><p>您好，感谢您的注册。</p><p>用户名: ${data.username}</p><p>邮箱: ${data.email}</p><p>祝您使用愉快！</p>`,
    },
    notification: {
      text: `通知\n\n${data.message}\n\n时间: ${data.time || new Date().toLocaleString()}`,
      html: `<h2>通知</h2><p>${data.message}</p><p>时间: ${data.time || new Date().toLocaleString()}</p>`,
    },
    error: {
      text: `错误通知\n\n错误信息: ${data.error}\n\n堆栈: ${data.stack || 'N/A'}\n\n时间: ${new Date().toLocaleString()}`,
      html: `<h2>错误通知</h2><p>错误信息: ${data.error}</p><p>堆栈: ${data.stack || 'N/A'}</p><p>时间: ${new Date().toLocaleString()}</p>`,
    },
  };

  const template = templates[templateName];
  if (!template) {
    return {
      success: false,
      error: `模板不存在: ${templateName}`,
    };
  }

  return await sendEmail(to, subject, template.text, { html: template.html });
}

/**
 * 检查邮件配置
 */
async function checkEmailConfig(): Promise<any> {
  const cfg: any = loadConfig();
  const emailConfig = cfg.email || {};

  const required = ['smtpHost', 'smtpPort', 'user', 'password'];
  const missing = required.filter((key) => !emailConfig[key]);

  if (missing.length > 0) {
    return {
      success: false,
      error: `缺少配置项: ${missing.join(', ')}`,
    };
  }

  return {
    success: true,
    data: {
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      user: emailConfig.user,
      from: emailConfig.from || emailConfig.user,
    },
  };
}

export {
  sendEmail,
  sendTextEmail,
  sendHtmlEmail,
  sendEmailWithAttachments,
  sendTemplateEmail,
  checkEmailConfig,
};
