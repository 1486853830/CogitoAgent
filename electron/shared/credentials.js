/**
 * 凭据加密/解密工具
 *
 * 用于加密存储邮箱密码等敏感字段，避免 .env 文件中明文落盘。
 *
 * 算法：AES-256-GCM
 *   - 密钥从机器特征派生（hostname + username + appId + 固定 salt），通过 PBKDF2 派生 32 字节密钥
 *   - 每次加密生成随机 IV（12 字节）和 auth tag（16 字节）
 *   - 加密后格式：enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 *
 * 向后兼容：
 *   - decrypt() 检测前缀 "enc:v1:"，若不是则按明文原样返回（支持老配置平滑迁移）
 *
 * 使用场景：
 *   - main.js saveConfig：写入 .env 前调用 encrypt()
 *   - main.js load-config：从 .env 读取后调用 decrypt() 回填表单
 *   - src/config.ts loadEnvConfig：读取 process.env 后调用 decrypt() 还原明文供业务使用
 */

import crypto from 'crypto';
import os from 'os';

const APP_SALT = 'cogito-agent::v1::credential-salt';
const APP_ID = 'com.cogito.agent';
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM 推荐 12 字节
const PBKDF2_ITERATIONS = 100000;
const ENCRYPTED_PREFIX = 'enc:v1:';

let cachedKey = null;

/**
 * 派生机器密钥（基于 hostname + username + appId + 固定 salt）
 * 缓存以避免重复 PBKDF2 计算。
 *
 * 注意：硬编码 salt + 机器特征派生密钥的保护强度等同于混淆。
 * 对于更高安全要求的场景，建议使用专用的密钥管理服务（如 Keytar / 系统密钥链）。
 */
function deriveMachineKey() {
  if (cachedKey) return cachedKey;
  const hostname = os.hostname() || 'unknown-host';
  const username = os.userInfo().username || 'unknown-user';
  const material = `${hostname}::${username}::${APP_ID}`;
  cachedKey = crypto.pbkdf2Sync(material, APP_SALT, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
  return cachedKey;
}

/**
 * 加密明文。返回格式：enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 * 空字符串原样返回（不加密空密码）。
 * @param {string} plaintext
 * @returns {string}
 */
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) return '';
  // 已是加密格式则原样返回，避免重复加密
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;
  try {
    const key = deriveMachineKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (e) {
    // 加密失败：返回空字符串而非明文，避免明文落盘到 .env。
    // 此前返回明文导致敏感凭据以明文写入 .env，用户无感知。
    // 返回空字符串会让密码字段为空，用户保存后需重新输入，但确保不会明文泄露。
    console.error('[credentials] encrypt failed, refusing to write plaintext:', e.message);
    return '';
  }
}

/**
 * 解密密文。若输入不是加密格式（无 enc:v1: 前缀），原样返回明文。
 * @param {string} value
 * @returns {string}
 */
export function decrypt(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  try {
    const rest = value.slice(ENCRYPTED_PREFIX.length);
    const parts = rest.split(':');
    if (parts.length !== 3) return value; // 格式错误，原样返回
    const [ivHex, tagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const key = deriveMachineKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // 解密失败（可能机器密钥变化、数据损坏）：返回空字符串避免泄露密文
    console.error('[credentials] decrypt failed:', e.message);
    return '';
  }
}

/**
 * 判断值是否为加密格式
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}
