/**
 * 通用文件存储模块
 * 解决 task.js、memory.js、scheduler.js 等模块的重复代码
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * 文件存储错误类
 */
export class StorageError extends Error {
  code: string;
  constructor(message: string, code: string = 'STORAGE_ERROR') {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

/**
 * 通用文件存储类
 * 提供加载、保存、增删改查等通用功能
 */
export class FileStorage {
  filePath: string;
  entityName: string;
  data: any;
  autoSave: boolean;

  /**
   * @param {string} filePath - 数据文件路径
   * @param {string} entityName - 实体名称（用于日志）
   * @param {object} options - 配置选项
   */
  constructor(filePath: string, entityName: string = 'data', options: any = {}) {
    this.filePath = filePath;
    this.entityName = entityName;
    this.data = options.defaultData || null;
    this.autoSave = options.autoSave !== false;
  }

  /**
   * 确保目录存在
   */
  async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new StorageError(`创建目录失败: ${error.message}`, 'DIR_CREATE_FAILED');
      }
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 加载数据
   * @returns {Promise<any>} 加载的数据
   */
  async load(): Promise<any> {
    try {
      const fileExists = await this.exists();
      if (!fileExists) {
        return this.data;
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(content);
      return this.data;
    } catch (error: any) {
      console.error(`[${this.entityName}] 加载失败: ${error.message}`);
      throw new StorageError(`加载失败: ${error.message}`, 'LOAD_FAILED');
    }
  }

  /**
   * 保存数据
   * @param {any} data - 要保存的数据
   */
  async save(data: any = this.data): Promise<void> {
    try {
      await this.ensureDir();
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.data = data;
    } catch (error: any) {
      console.error(`[${this.entityName}] 保存失败: ${error.message}`);
      throw new StorageError(`保存失败: ${error.message}`, 'SAVE_FAILED');
    }
  }

  /**
   * 获取数据（如果尚未加载则先加载）
   */
  async getData(): Promise<any> {
    if (this.data === null) {
      await this.load();
    }
    return this.data;
  }

  /**
   * 设置数据并保存
   */
  async setData(data: any): Promise<any> {
    await this.save(data);
    return data;
  }

  /**
   * 创建实体
   * @param {object} item - 要创建的实体
   * @param {string} idField - ID 字段名，默认为 'id'
   * @returns {Promise<object>} 创建的实体
   */
  async create(item: any, idField: string = 'id'): Promise<any> {
    const data = await this.getData();
    const list = Array.isArray(data) ? data : [];

    if (!item[idField]) {
      item[idField] = Date.now();
    }

    list.push(item);
    await this.save(list);
    return item;
  }

  /**
   * 根据 ID 获取实体
   * @param {any} id - 实体 ID
   * @param {string} idField - ID 字段名，默认为 'id'
   * @returns {Promise<object|null>} 找到的实体或 null
   */
  async getById(id: any, idField: string = 'id'): Promise<any | null> {
    const data = await this.getData();
    const list = Array.isArray(data) ? data : [];
    const numId = typeof id === 'string' ? parseInt(id) : id;
    return list.find(item => item[idField] === numId) || null;
  }

  /**
   * 更新实体
   * @param {any} id - 实体 ID
   * @param {object} updates - 更新内容
   * @param {string} idField - ID 字段名，默认为 'id'
   * @returns {Promise<object|null>} 更新后的实体或 null
   */
  async update(id: any, updates: any, idField: string = 'id'): Promise<any | null> {
    const data = await this.getData();
    const list = Array.isArray(data) ? data : [];
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const index = list.findIndex(item => item[idField] === numId);

    if (index === -1) {
      return null;
    }

    list[index] = { ...list[index], ...updates };
    await this.save(list);
    return list[index];
  }

  /**
   * 删除实体
   * @param {any} id - 实体 ID
   * @param {string} idField - ID 字段名，默认为 'id'
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(id: any, idField: string = 'id'): Promise<boolean> {
    const data = await this.getData();
    const list = Array.isArray(data) ? data : [];
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const index = list.findIndex(item => item[idField] === numId);

    if (index === -1) {
      return false;
    }

    list.splice(index, 1);
    await this.save(list);
    return true;
  }

  /**
   * 查询实体列表
   * @param {function} filterFn - 过滤函数
   * @returns {Promise<array>} 过滤后的列表
   */
  async filter(filterFn: (item: any) => boolean): Promise<any[]> {
    const data = await this.getData();
    const list = Array.isArray(data) ? data : [];
    return list.filter(filterFn);
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.save([]);
  }
}

/**
 * 创建指定实体类型的存储实例
 * @param {string} filePath - 数据文件路径
 * @param {string} entityName - 实体名称
 */
export function createStorage(filePath: string, entityName: string): FileStorage {
  return new FileStorage(filePath, entityName);
}
