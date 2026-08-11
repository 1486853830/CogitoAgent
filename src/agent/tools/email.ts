import { loadConfig } from '../../config.ts';
import type { Config } from '../../types/index.ts';

/**
 * 发送邮件
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options: Record<string, unknown> = {},
): Promise<{ success: boolean; data?: string; error?: string }> {
  const cfg: Config = loadConfig();
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

  const nodemailer: {
    createTransport: (opts: Record<string, unknown>) => {
      sendMail: (opts: Record<string, unknown>) => Promise<{ messageId: string }>;
    };
  } = await import('nodemailer');

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
  } catch (e: unknown) {
    return {
      success: false,
      error: `发送邮件失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 发送简单文本邮件
 */
async function sendTextEmail(
  to: string,
  subject: string,
  body: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return await sendEmail(to, subject, body);
}

/**
 * 发送 HTML 邮件
 */
async function sendHtmlEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return await sendEmail(to, subject, '', { html: htmlBody });
}

/**
 * 发送带附件的邮件
 */
async function sendEmailWithAttachments(
  to: string,
  subject: string,
  body: string,
  attachments: unknown[],
): Promise<{ success: boolean; data?: string; error?: string }> {
  return await sendEmail(to, subject, body, { attachments });
}

/**
 * 发送邮件模板
 */
async function sendTemplateEmail(
  to: string,
  subject: string,
  templateName: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const escapeHtml = (s: unknown): string =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // 对纯文本字段做基础净化：移除控制字符，防止注入到邮件正文
  const safeText = (v: unknown): string =>
    String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const templates: Record<string, { text: string; html: string }> = {
    welcome: {
      text: `欢迎使用 CogitoAgent！\n\n您好，感谢您的注册。\n\n用户名: ${safeText(data.username)}\n邮箱: ${safeText(data.email)}\n\n祝您使用愉快！`,
      html: `<h1>欢迎使用 CogitoAgent！</h1><p>您好，感谢您的注册。</p><p>用户名: ${escapeHtml(data.username)}</p><p>邮箱: ${escapeHtml(data.email)}</p><p>祝您使用愉快！</p>`,
    },
    notification: {
      text: `通知\n\n${safeText(data.message)}\n\n时间: ${data.time ? safeText(data.time) : new Date().toLocaleString()}`,
      html: `<h2>通知</h2><p>${escapeHtml(data.message)}</p><p>时间: ${escapeHtml(data.time ? data.time : new Date().toLocaleString())}</p>`,
    },
    error: {
      text: `错误通知\n\n错误信息: ${safeText(data.error)}\n\n堆栈: ${data.stack ? safeText(data.stack) : 'N/A'}\n\n时间: ${new Date().toLocaleString()}`,
      html: `<h2>错误通知</h2><p>错误信息: ${escapeHtml(data.error)}</p><p>堆栈: ${data.stack ? escapeHtml(data.stack) : 'N/A'}</p><p>时间: ${new Date().toLocaleString()}</p>`,
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
async function checkEmailConfig(): Promise<{
  success: boolean;
  data?: { smtpHost: string; smtpPort: number; user: string; from: string };
  error?: string;
}> {
  const cfg: Config = loadConfig();
  const emailConfig = cfg.email || {};

  const required = ['smtpHost', 'smtpPort', 'user', 'password'];
  const missing = required.filter(
    (key) => !(emailConfig as unknown as Record<string, unknown>)[key],
  );

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
