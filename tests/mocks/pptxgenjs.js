/**
 * pptxgenjs 轻量替身。
 *
 * 原实现的 writeFile 是 no-op，用例断言"创建成功"时磁盘上其实什么都没有。
 * 这里记录真实的 slide/文本调用并落盘为 JSON，使产物可被断言。
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

class Presentation {
  constructor() {
    this.slides = [];
    this.title = '';
    this.author = '';
    this.layout = '';
  }

  addSlide() {
    const slide = { texts: [], shapes: 0, images: 0 };
    this.slides.push(slide);
    return {
      addText: (text, opts) => {
        slide.texts.push({ text, opts: opts || null });
      },
      addShape: () => {
        slide.shapes++;
      },
      addImage: () => {
        slide.images++;
      },
    };
  }

  async writeFile({ fileName } = {}) {
    if (!fileName) throw new Error('pptx mock: writeFile 缺少 fileName');
    mkdirSync(dirname(fileName), { recursive: true });
    writeFileSync(
      fileName,
      JSON.stringify(
        {
          __mock: 'pptx',
          title: this.title,
          author: this.author,
          slideCount: this.slides.length,
          slides: this.slides,
        },
        null,
        2,
      ),
      'utf8',
    );
    return fileName;
  }
}

const pptxgen = Presentation;
pptxgen.Presentation = Presentation;

export default pptxgen;
