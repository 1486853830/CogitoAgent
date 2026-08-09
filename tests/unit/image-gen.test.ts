import { getToolRegistry } from '../../src/agent/registry.ts';
import {
  getToolSchema,
  getToolAnnotations,
  getToolParamDocs,
} from '../../src/agent/tool-schema.ts';

describe('generateImage 工具注册（R1 接入校验）', () => {
  it('已注册到 image 分类', () => {
    const entry = getToolRegistry('generateImage');
    expect(entry).not.toBeNull();
    expect(entry?.category).toBe('image');
  });

  it('prompt 为必填参数，其余均为可选', () => {
    const schema = getToolSchema('generateImage');
    expect(schema.properties).toHaveProperty('prompt');
    expect(schema.required).toContain('prompt');
    // 其余可选参数不应出现在必填列表中
    for (const opt of [
      'referenceImages',
      'model',
      'size',
      'seed',
      'negativePrompt',
      'watermark',
      'n',
    ]) {
      expect(schema.required).not.toContain(opt);
    }
  });

  it('注解标记为 openWorld（依赖外部图像 API）', () => {
    const ann = getToolAnnotations('generateImage');
    expect(ann.openWorldHint).toBe(true);
    expect(ann.readOnlyHint).toBe(false);
  });

  it('参数元数据覆盖全部 8 个位置参数且顺序一致', () => {
    const params = getToolParamDocs('generateImage');
    expect(params.map((p) => p.name)).toEqual([
      'prompt',
      'referenceImages',
      'model',
      'size',
      'seed',
      'negativePrompt',
      'watermark',
      'n',
    ]);
  });
});
