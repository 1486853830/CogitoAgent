/**
 * docx 轻量替身。
 *
 * 原实现的 Packer.toBuffer 返回空 Buffer，落盘产物是 0 字节文件，
 * 用例无法区分"真的写出了文档"和"什么都没做"。这里让 Document 记录
 * 结构信息，toBuffer 返回可断言的非空内容。
 */
export const Document = class {
  constructor(options = {}) {
    this.options = options;
    const sections = Array.isArray(options.sections) ? options.sections : [];
    this.childCount = sections.reduce(
      (n, s) => n + (Array.isArray(s.children) ? s.children.length : 0),
      0,
    );
  }
};

export const Packer = {
  toBuffer: (doc) =>
    Promise.resolve(
      Buffer.from(
        JSON.stringify({
          __mock: 'docx',
          title: doc?.options?.title ?? '',
          creator: doc?.options?.creator ?? '',
          childCount: doc?.childCount ?? 0,
        }),
        'utf8',
      ),
    ),
};

export const Paragraph = class {
  constructor(options) {
    this.options = options;
  }
};

export const TextRun = class {
  constructor(options) {
    this.options = options;
  }
};

export const HeadingLevel = {
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3,
  HEADING_4: 4,
  HEADING_5: 5,
  HEADING_6: 6,
};

export const Table = class {
  constructor(options) {
    this.options = options;
  }
};

export const TableRow = class {
  constructor(options) {
    this.options = options;
  }
};

export const TableCell = class {
  constructor(options) {
    this.options = options;
  }
};

export const WidthType = {
  PERCENTAGE: 'pct',
};

export const ImageRun = class {
  constructor(options) {
    this.options = options;
  }
};
