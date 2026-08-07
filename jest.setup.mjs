// 测试全局环境：在任意测试模块 import 之前，把用户数据目录指向临时目录，
// 避免 scheduler/memory/session 等模块在 ESM import 提升后把数据写入项目根 data/。
// （ts-jest useESM 下 import 声明先于顶层赋值执行，测试文件内顶层的
//   process.env.COGITO_USER_DATA_DIR = TMP_DIR 会晚于 import 生效。）
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const testDataDir = mkdtempSync(join(tmpdir(), 'cogito-jest-data-'));
process.env.COGITO_USER_DATA_DIR = testDataDir;

process.on('exit', () => {
  try {
    rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
});
