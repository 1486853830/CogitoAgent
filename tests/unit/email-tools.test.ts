import {
  sendEmail,
  sendTextEmail,
  sendHtmlEmail,
  sendEmailWithAttachments,
  sendTemplateEmail,
  checkEmailConfig,
} from '../../src/agent/tools/email.ts';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('email tools', () => {
  const emailEnvKeys = [
    'COGITO_EMAIL_HOST',
    'COGITO_EMAIL_PORT',
    'COGITO_EMAIL_USER',
    'COGITO_EMAIL_PASSWORD',
    'COGITO_EMAIL_FROM',
  ];

  const originalUserDataDir = process.env.COGITO_USER_DATA_DIR;
  let tempConfigDir: string;

  beforeEach(() => {
    emailEnvKeys.forEach((key) => {
      delete process.env[key];
    });
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cogito-email-test-'));
    process.env.COGITO_USER_DATA_DIR = tempConfigDir;
  });

  afterEach(() => {
    process.env.COGITO_USER_DATA_DIR = originalUserDataDir;
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('checkEmailConfig', () => {
    it('should return success:false with missing config items when email config is not set', async () => {
      const result = await checkEmailConfig();
      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少配置项');
    });
  });

  describe('sendEmail', () => {
    it('should return success:false when config not complete', async () => {
      const result = await sendEmail('to@test.com', 'subject', 'body');
      expect(result.success).toBe(false);
      expect(result.error).toContain('配置不完整');
    });
  });

  describe('sendTextEmail', () => {
    it('should return success:false when config not complete', async () => {
      const result = await sendTextEmail('to@test.com', 'subject', 'body');
      expect(result.success).toBe(false);
    });
  });

  describe('sendHtmlEmail', () => {
    it('should return success:false when config not complete', async () => {
      const result = await sendHtmlEmail('to@test.com', 'subject', '<p>html</p>');
      expect(result.success).toBe(false);
    });
  });

  describe('sendEmailWithAttachments', () => {
    it('should return success:false when config not complete', async () => {
      const result = await sendEmailWithAttachments('to@test.com', 'subject', 'body', []);
      expect(result.success).toBe(false);
    });
  });

  describe('sendTemplateEmail', () => {
    it('should return success:false when config not complete', async () => {
      const result = await sendTemplateEmail('to@test.com', 'subject', 'welcome', {
        username: 'test',
        email: 'test@test.com',
      });
      expect(result.success).toBe(false);
    });

    it('should return success:false for unknown template name', async () => {
      const result = await sendTemplateEmail('to@test.com', 'subject', 'unknownTemplate', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('模板不存在');
    });
  });
});
