/**
 * 生命科学工具（Bioinformatics）
 * 提供序列分析、格式转换、引物设计辅助等功能
 * 第一梯队：零外部依赖，纯数学/字符串操作
 */

import fs from 'fs/promises';
import path from 'path';
import { getBasePath } from './path.ts';

// ============================================
// 常量定义
// ============================================

// DNA 互补碱基映射
const DNA_COMPLEMENT: any = { A: 'T', T: 'A', C: 'G', G: 'C', a: 't', t: 'a', c: 'g', g: 'c' };

// 标准遗传密码表（RNA 密码子 → 氨基酸单字母缩写）
const CODON_TABLE: any = {
  UUU: 'F',
  UUC: 'F',
  UUA: 'L',
  UUG: 'L',
  CUU: 'L',
  CUC: 'L',
  CUA: 'L',
  CUG: 'L',
  AUU: 'I',
  AUC: 'I',
  AUA: 'I',
  AUG: 'M',
  GUU: 'V',
  GUC: 'V',
  GUA: 'V',
  GUG: 'V',
  UCU: 'S',
  UCC: 'S',
  UCA: 'S',
  UCG: 'S',
  CCU: 'P',
  CCC: 'P',
  CCA: 'P',
  CCG: 'P',
  ACU: 'T',
  ACC: 'T',
  ACA: 'T',
  ACG: 'T',
  GCU: 'A',
  GCC: 'A',
  GCA: 'A',
  GCG: 'A',
  UAU: 'Y',
  UAC: 'Y',
  UAA: '*',
  UAG: '*',
  CAU: 'H',
  CAC: 'H',
  CAA: 'Q',
  CAG: 'Q',
  AAU: 'N',
  AAC: 'N',
  AAA: 'K',
  AAG: 'K',
  GAU: 'D',
  GAC: 'D',
  GAA: 'E',
  GAG: 'E',
  UGU: 'C',
  UGC: 'C',
  UGA: '*',
  UGG: 'W',
  CGU: 'R',
  CGC: 'R',
  CGA: 'R',
  CGG: 'R',
  AGU: 'S',
  AGC: 'S',
  AGA: 'R',
  AGG: 'R',
  GGU: 'G',
  GGC: 'G',
  GGA: 'G',
  GGG: 'G',
};

// 氨基酸单字母 → 三字母映射
const AA_THREE_LETTER: Record<string, string> = {
  A: 'Ala',
  R: 'Arg',
  N: 'Asn',
  D: 'Asp',
  C: 'Cys',
  Q: 'Gln',
  E: 'Glu',
  G: 'Gly',
  H: 'His',
  I: 'Ile',
  L: 'Leu',
  K: 'Lys',
  M: 'Met',
  F: 'Phe',
  P: 'Pro',
  S: 'Ser',
  T: 'Thr',
  W: 'Trp',
  Y: 'Tyr',
  V: 'Val',
  '*': 'Stop',
};

// 氨基酸单字母分子量（Da，近似值）
const AA_MOLECULAR_WEIGHT: any = {
  A: 89.09,
  R: 174.2,
  N: 132.12,
  D: 133.1,
  C: 121.16,
  Q: 146.15,
  E: 147.13,
  G: 75.07,
  H: 155.16,
  I: 131.18,
  L: 131.18,
  K: 146.19,
  M: 149.21,
  F: 165.19,
  P: 115.13,
  S: 105.09,
  T: 119.12,
  W: 204.23,
  Y: 181.19,
  V: 117.15,
};

// 序列类型字符集
const DNA_CHARS = new Set('ATCGatcg');
const RNA_CHARS = new Set('AUCGaucg');
const PROTEIN_CHARS = new Set('ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy');

// ============================================
// 辅助函数
// ============================================

/**
 * 清理序列（去除非序列字符）
 */
function cleanSeq(seq: string, validChars: Set<string>): string {
  return [...seq].filter((ch) => validChars.has(ch)).join('');
}

/**
 * 验证序列是否有效
 */
function validateSeq(seq: string, validChars: Set<string>, name: string): any {
  if (!seq || seq.length === 0) {
    return { success: false, error: `${name}序列不能为空` };
  }
  const cleaned = cleanSeq(seq, validChars);
  if (cleaned.length === 0) {
    return { success: false, error: `${name}序列不包含有效碱基/氨基酸字符` };
  }
  return { success: true, data: cleaned };
}

// ============================================
// 序列基础操作
// ============================================

/**
 * DNA 互补链
 * @param {string} seq - DNA 序列
 * @returns {Promise<Object>}
 */
async function dnaComplement(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();
    const result = [...upper].map((ch) => DNA_COMPLEMENT[ch]).join('');
    return { success: true, data: `互补链: ${result}` };
  } catch (error: unknown) {
    return { success: false, error: `计算互补链失败: ${(error as Error).message}` };
  }
}

/**
 * DNA 反向互补
 * @param {string} seq - DNA 序列
 * @returns {Promise<Object>}
 */
async function dnaReverseComplement(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();
    const result = [...upper]
      .reverse()
      .map((ch) => DNA_COMPLEMENT[ch])
      .join('');
    return { success: true, data: `反向互补: ${result}` };
  } catch (error: unknown) {
    return { success: false, error: `计算反向互补失败: ${(error as Error).message}` };
  }
}

/**
 * DNA → RNA 转录
 * @param {string} seq - DNA 序列
 * @returns {Promise<Object>}
 */
async function rnaTranscribe(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();
    // 以 DNA 编码链为模板：T→U，其他不变
    const result = [...upper]
      .map((ch) => {
        if (ch === 'T') return 'U';
        return ch;
      })
      .join('');
    return { success: true, data: `转录 RNA: ${result}` };
  } catch (error: unknown) {
    return { success: false, error: `转录失败: ${(error as Error).message}` };
  }
}

/**
 * RNA → 氨基酸序列翻译
 * @param {string} seq - RNA 序列
 * @param {number} [readingFrame=0] - 读码框（0, 1, 2）
 * @returns {Promise<Object>}
 */
async function translate(
  seq: string,
  readingFrame: number | string = 0,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, RNA_CHARS, 'RNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();

    const frame = parseInt(readingFrame as string, 10) || 0;
    if (frame < 0 || frame > 2) {
      return { success: false, error: '读码框必须为 0、1 或 2' };
    }

    const codons: Array<{ codon: string; aa: string; position: number }> = [];
    for (let i = frame; i + 2 < upper.length; i += 3) {
      const codon = upper.substring(i, i + 3);
      const aa = CODON_TABLE[codon] || '?';
      codons.push({ codon, aa, position: i + 1 });
      if (aa === '*') break; // 遇到终止密码子停止
    }

    const aaSeq = codons.map((c) => c.aa).join('');

    return {
      success: true,
      data: `读码框 ${frame}: ${aaSeq}\n详细: ${codons.map((c) => `${c.codon}(${AA_THREE_LETTER[c.aa] || '?'})`).join(' → ')}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `翻译失败: ${(error as Error).message}` };
  }
}

/**
 * GC 含量计算
 * @param {string} seq - DNA/RNA 序列
 * @returns {Promise<Object>}
 */
async function gcContent(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, new Set([...DNA_CHARS, ...RNA_CHARS]), '核酸');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();
    const gcCount = (upper.match(/[GC]/g) || []).length;
    const percentage = ((gcCount / upper.length) * 100).toFixed(2);
    return {
      success: true,
      data: `GC 含量: ${percentage}% (${gcCount}/${upper.length})`,
    };
  } catch (error: unknown) {
    return { success: false, error: `计算 GC 含量失败: ${(error as Error).message}` };
  }
}

/**
 * 氨基酸序列分子量估算
 * @param {string} seq - 氨基酸序列（单字母）
 * @returns {Promise<Object>}
 */
async function molecularWeight(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const upper = seq.toUpperCase();

    const isValidDNA = [...upper].every((ch) => DNA_CHARS.has(ch));
    const isValidRNA = [...upper].every((ch) => RNA_CHARS.has(ch));
    const isValidProtein = [...upper].every((ch) => PROTEIN_CHARS.has(ch));

    let type: string;

    if (isValidProtein) {
      type = '蛋白质';
    } else if (isValidDNA) {
      type = 'DNA';
    } else if (isValidRNA) {
      type = 'RNA';
    } else {
      return { success: false, error: '序列包含无效字符' };
    }

    let totalWeight = 0;
    const details: string[] = [];

    if (type === '蛋白质') {
      for (const ch of upper) {
        const mw = AA_MOLECULAR_WEIGHT[ch];
        if (mw) {
          totalWeight += mw;
          details.push(`${ch}=${mw}Da`);
        }
      }
      return {
        success: true,
        data: `分子量: ${totalWeight.toFixed(2)} Da (${(totalWeight / 1000).toFixed(4)} kDa)\n序列长度: ${upper.length} aa`,
      };
    } else {
      const BASE_MW: Record<string, number> = {
        A: 313.21,
        T: 304.2,
        C: 289.18,
        G: 329.21,
        U: 306.17,
      };
      for (const ch of upper) {
        const mw = BASE_MW[ch];
        if (mw) {
          totalWeight += mw;
          details.push(`${ch}=${mw}Da`);
        }
      }
      return {
        success: true,
        data: `${type}分子量: ${totalWeight.toFixed(2)} Da (${(totalWeight / 1000).toFixed(4)} kDa)\n序列长度: ${upper.length} nt`,
      };
    }
  } catch (error: unknown) {
    return { success: false, error: `计算分子量失败: ${(error as Error).message}` };
  }
}

// ============================================
// 序列比对
// ============================================

/**
 * Hamming 距离（等长序列差异数）
 * @param {string} seq1 - 序列1
 * @param {string} seq2 - 序列2
 * @returns {Promise<Object>}
 */
async function hammingDistance(
  seq1: string,
  seq2: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!seq1 || !seq2) {
      return { success: false, error: '两个序列都不能为空' };
    }
    if (seq1.length !== seq2.length) {
      return {
        success: false,
        error: `序列长度不相等: ${seq1.length} vs ${seq2.length}，Hamming 距离仅适用于等长序列`,
      };
    }

    let diff = 0;
    const diffPositions: number[] = [];
    const upper1 = seq1.toUpperCase();
    const upper2 = seq2.toUpperCase();

    for (let i = 0; i < upper1.length; i++) {
      if (upper1[i] !== upper2[i]) {
        diff++;
        diffPositions.push(i + 1);
      }
    }

    const identity = (((upper1.length - diff) / upper1.length) * 100).toFixed(2);
    return {
      success: true,
      data: `Hamming 距离: ${diff}\n序列一致性: ${identity}%\n差异位置: ${diffPositions.length > 0 ? diffPositions.join(', ') : '无差异'}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `计算 Hamming 距离失败: ${(error as Error).message}` };
  }
}

/**
 * Levenshtein 编辑距离
 * @param {string} seq1 - 序列1
 * @param {string} seq2 - 序列2
 * @returns {Promise<Object>}
 */
async function levenshteinDistance(
  seq1: string,
  seq2: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!seq1 || !seq2) {
      return { success: false, error: '两个序列都不能为空' };
    }

    const s1 = seq1.toUpperCase();
    const s2 = seq2.toUpperCase();
    const m = s1.length;
    const n = s2.length;

    // 使用滚动数组优化空间
    let prev: number[] = new Array(n + 1);
    let curr: number[] = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1, // 删除
          curr[j - 1] + 1, // 插入
          prev[j - 1] + cost, // 替换
        );
      }
      [prev, curr] = [curr, prev];
    }

    const distance = prev[n];
    const maxLen = Math.max(m, n);
    const similarity = maxLen > 0 ? ((1 - distance / maxLen) * 100).toFixed(2) : '100.00';

    return {
      success: true,
      data: `编辑距离: ${distance}\n相似度: ${similarity}%\n序列长度: ${m} vs ${n}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `计算编辑距离失败: ${(error as Error).message}` };
  }
}

// ============================================
// 引物设计辅助
// ============================================

/**
 * 引物熔解温度估算（Wallace 规则）
 * @param {string} seq - 引物序列
 * @returns {Promise<Object>}
 */
async function tmEstimate(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();

    // Wallace 规则：Tm = 2*(A+T) + 4*(G+C)
    // 适用于 14-20 nt 的短引物
    const at = (upper.match(/[AT]/g) || []).length;
    const gc = (upper.match(/[GC]/g) || []).length;
    const tm = 2 * at + 4 * gc;

    // 更精确的公式：Tm = 64.9 + 41*(G+C-16.4)/(A+T+G+C) （适用于较长序列）
    const total = upper.length;
    const gcPercent = (gc / total) * 100;
    const tmLong = total >= 14 ? 64.9 + (41 * (gc - 16.4)) / total : null;

    let result = `引物长度: ${total} nt\nWallace Tm: ${tm}°C\nGC 含量: ${gcPercent.toFixed(1)}%`;
    if (tmLong) {
      result += `\n修正 Tm: ${tmLong.toFixed(1)}°C`;
    }

    return { success: true, data: result };
  } catch (error: unknown) {
    return { success: false, error: `估算 Tm 失败: ${(error as Error).message}` };
  }
}

/**
 * 引物发夹结构检测
 * @param {string} seq - 引物序列
 * @returns {Promise<Object>}
 */
async function hairpinCheck(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();

    // 查找反向重复序列（可能形成发夹结构）
    const minStem = 3; // 最小茎长
    const minLoop = 3; // 最小环长
    const hairpins: Array<{
      position: number;
      stemLength: number;
      loopLength: number;
      sequence: string;
    }> = [];

    for (let i = 0; i < upper.length - minStem * 2 - minLoop; i++) {
      for (
        let stemLen = minStem;
        stemLen <= Math.min(10, Math.floor((upper.length - i - minLoop) / 2));
        stemLen++
      ) {
        const left = upper.substring(i, i + stemLen);
        const right = upper.substring(i + stemLen + minLoop, i + stemLen * 2 + minLoop);

        // 检查右侧是否是左侧的反向互补
        const revComp = [...left]
          .reverse()
          .map((ch) => DNA_COMPLEMENT[ch])
          .join('');
        if (right === revComp) {
          hairpins.push({
            position: i + 1,
            stemLength: stemLen,
            loopLength: i + stemLen * 2 + minLoop - (i + stemLen) - stemLen,
            sequence: upper.substring(
              i,
              i + stemLen * 2 + minLoop + (i + stemLen * 2 + minLoop - (i + stemLen) - stemLen),
            ),
          });
          break; // 只记录每个位置最长的
        }
      }
    }

    if (hairpins.length === 0) {
      return { success: true, data: '未检测到可能形成发夹结构的反向重复序列' };
    }

    return {
      success: true,
      data:
        `检测到 ${hairpins.length} 个可能的发夹结构:\n` +
        hairpins
          .map(
            (h, idx) =>
              `  [${idx + 1}] 位置 ${h.position}，茎长 ${h.stemLength} bp，环长 ${h.loopLength} nt`,
          )
          .join('\n'),
    };
  } catch (error: unknown) {
    return { success: false, error: `发夹结构检测失败: ${(error as Error).message}` };
  }
}

// ============================================
// 文件格式处理
// ============================================

/**
 * 解析 FASTA 文件
 * @param {string} filePath - FASTA 文件路径
 * @returns {Promise<Object>}
 */
async function parseFASTA(
  filePath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const entries: Array<{ header: string; sequence: string; length: number }> = [];
    let currentHeader = '';
    let currentSeq = '';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('>')) {
        if (currentHeader) {
          entries.push({ header: currentHeader, sequence: currentSeq, length: currentSeq.length });
        }
        currentHeader = trimmed.substring(1).trim();
        currentSeq = '';
      } else {
        currentSeq += trimmed.replace(/\s/g, '');
      }
    }
    if (currentHeader) {
      entries.push({ header: currentHeader, sequence: currentSeq, length: currentSeq.length });
    }

    if (entries.length === 0) {
      return { success: false, error: 'FASTA 文件中没有找到序列条目' };
    }

    // 统计信息
    const seqTypes = entries.map((e) => {
      const upper = e.sequence.toUpperCase();
      const dnaScore = (upper.match(/[ATCG]/g) || []).length / upper.length;
      const proteinScore = (upper.match(/[ACDEFGHIKLMNPQRSTVWY]/g) || []).length / upper.length;
      if (dnaScore > 0.8) return 'DNA';
      if (proteinScore > 0.8) return 'Protein';
      return 'Unknown';
    });

    const typeCount: Record<string, number> = {};
    seqTypes.forEach((t) => {
      typeCount[t] = (typeCount[t] || 0) + 1;
    });

    return {
      success: true,
      data:
        `共 ${entries.length} 个序列条目\n` +
        `序列类型: ${Object.entries(typeCount)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}\n` +
        `长度范围: ${Math.min(...entries.map((e) => e.length))} - ${Math.max(...entries.map((e) => e.length))} nt/aa\n` +
        `条目列表:\n` +
        entries
          .slice(0, 20)
          .map((e, i) => `  [${i + 1}] ${e.header} (${e.length} bp)`)
          .join('\n') +
        (entries.length > 20 ? `\n  ... 还有 ${entries.length - 20} 个条目` : ''),
    };
  } catch (error: unknown) {
    return { success: false, error: `解析 FASTA 失败: ${(error as Error).message}` };
  }
}

/**
 * 解析 FASTQ 文件
 * @param {string} filePath - FASTQ 文件路径
 * @returns {Promise<Object>}
 */
async function parseFASTQ(
  filePath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const entries: Array<{ header: string; sequence: string; length: number; quality: string }> =
      [];

    // FASTQ 格式：每 4 行为一组
    for (let i = 0; i + 3 < lines.length; i += 4) {
      if (!lines[i].startsWith('@')) continue;
      const header = lines[i].substring(1).trim();
      const sequence = lines[i + 1].trim();
      const quality = lines[i + 3].trim();
      entries.push({
        header,
        sequence,
        length: sequence.length,
        quality,
      });
    }

    if (entries.length === 0) {
      return { success: false, error: 'FASTQ 文件中没有找到有效条目' };
    }

    // 质量值统计（Phred+33）
    let totalQual = 0;
    let qualCount = 0;
    for (const entry of entries) {
      for (const ch of entry.quality) {
        totalQual += ch.charCodeAt(0) - 33;
        qualCount++;
      }
    }
    const avgQual = qualCount > 0 ? (totalQual / qualCount).toFixed(1) : 'N/A';

    return {
      success: true,
      data:
        `共 ${entries.length} 个 reads\n` +
        `平均质量值: ${avgQual} (Phred+33)\n` +
        `长度范围: ${Math.min(...entries.map((e) => e.length))} - ${Math.max(...entries.map((e) => e.length))} bp\n` +
        `条目列表:\n` +
        entries
          .slice(0, 10)
          .map((e, i) => `  [${i + 1}] ${e.header} (${e.length} bp)`)
          .join('\n') +
        (entries.length > 10 ? `\n  ... 还有 ${entries.length - 10} 个条目` : ''),
    };
  } catch (error: unknown) {
    return { success: false, error: `解析 FASTQ 失败: ${(error as Error).message}` };
  }
}

/**
 * FASTA 转 CSV
 * @param {string} fastaPath - FASTA 输入路径
 * @param {string} csvPath - CSV 输出路径
 * @returns {Promise<Object>}
 */
async function fastaToCSV(
  fastaPath: string,
  csvPath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const basePath = getBasePath();
  const fullFastaPath = path.isAbsolute(fastaPath) ? fastaPath : path.join(basePath, fastaPath);
  const fullCsvPath = path.isAbsolute(csvPath) ? csvPath : path.join(basePath, csvPath);

  try {
    const content = await fs.readFile(fullFastaPath, 'utf-8');
    const entries: Array<{ header: string; sequence: string; length: number }> = [];
    let currentHeader = '';
    let currentSeq = '';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('>')) {
        if (currentHeader) {
          entries.push({ header: currentHeader, sequence: currentSeq, length: currentSeq.length });
        }
        currentHeader = trimmed.substring(1).trim();
        currentSeq = '';
      } else {
        currentSeq += trimmed.replace(/\s/g, '');
      }
    }
    if (currentHeader) {
      entries.push({ header: currentHeader, sequence: currentSeq, length: currentSeq.length });
    }

    if (entries.length === 0) {
      return { success: false, error: 'FASTA 文件中没有序列条目' };
    }

    // 写入 CSV
    const csvLines = ['header,sequence,length'];
    for (const entry of entries) {
      // 处理引号和逗号
      const safeHeader =
        entry.header.includes(',') || entry.header.includes('"')
          ? `"${entry.header.replace(/"/g, '""')}"`
          : entry.header;
      csvLines.push(`${safeHeader},${entry.sequence},${entry.length}`);
    }

    const dir = path.dirname(fullCsvPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullCsvPath, csvLines.join('\n'), 'utf-8');

    return {
      success: true,
      data: `已导出 ${entries.length} 个序列条目到 CSV: ${fullCsvPath}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `FASTA 转 CSV 失败: ${(error as Error).message}` };
  }
}

// ============================================
// 序列统计与生成
// ============================================

/**
 * 密码子使用频率统计
 * @param {string} seq - DNA 编码序列
 * @returns {Promise<Object>}
 */
async function codonUsage(
  seq: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const valid = validateSeq(seq, DNA_CHARS, 'DNA');
    if (!valid.success) return valid;
    const cleaned = valid.data;
    const upper = cleaned.toUpperCase();

    // 先转录为 RNA
    const rna = upper.replace(/T/g, 'U');

    const codonCount: Record<string, number> = {};
    let total = 0;

    for (let i = 0; i + 2 < rna.length; i += 3) {
      const codon = rna.substring(i, i + 3);
      codonCount[codon] = (codonCount[codon] || 0) + 1;
      total++;
    }

    if (total === 0) {
      return { success: false, error: '序列太短，无法统计密码子' };
    }

    // 按氨基酸分组
    const byAA: Record<string, Array<{ codon: string; count: number; freq: string }>> = {};
    for (const [codon, count] of Object.entries(codonCount)) {
      const aa = CODON_TABLE[codon] || '?';
      if (!byAA[aa]) byAA[aa] = [];
      byAA[aa].push({ codon, count, freq: ((count / total) * 100).toFixed(1) });
    }

    const lines = ['密码子使用频率统计:\n'];
    for (const [aa, codons] of Object.entries(byAA)) {
      const aaName = AA_THREE_LETTER[aa] || 'Unknown';
      const sorted = codons.sort((a, b) => b.count - a.count);
      const totalAA = sorted.reduce((s, c) => s + c.count, 0);
      lines.push(`  ${aa} (${aaName}): 共 ${totalAA} 次`);
      for (const c of sorted) {
        lines.push(`    ${c.codon}: ${c.count} 次 (${c.freq}%)`);
      }
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: unknown) {
    return { success: false, error: `密码子统计失败: ${(error as Error).message}` };
  }
}

/**
 * 随机序列生成
 * @param {number} length - 序列长度
 * @param {string} [type='dna'] - 序列类型：'dna' | 'rna' | 'protein'
 * @returns {Promise<Object>}
 */
async function randomSeq(
  length: number | string,
  type: string = 'dna',
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const len = parseInt(length as string, 10);
    if (isNaN(len) || len < 1) {
      return { success: false, error: '序列长度必须为正整数' };
    }
    if (len > 100000) {
      return { success: false, error: '序列长度不能超过 100000' };
    }

    const typeNorm = type.toLowerCase().trim();
    let chars, typeName;

    switch (typeNorm) {
      case 'dna':
        chars = 'ATCG';
        typeName = 'DNA';
        break;
      case 'rna':
        chars = 'AUCG';
        typeName = 'RNA';
        break;
      case 'protein':
        chars = 'ACDEFGHIKLMNPQRSTVWY';
        typeName = '蛋白质';
        break;
      default:
        return { success: false, error: `不支持的序列类型: ${type}，仅支持 dna、rna、protein` };
    }

    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }

    return {
      success: true,
      data: `>Random ${typeName} (${len} ${typeNorm === 'protein' ? 'aa' : 'bp'})\n${result}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `生成随机序列失败: ${(error as Error).message}` };
  }
}

export {
  dnaComplement,
  dnaReverseComplement,
  rnaTranscribe,
  translate,
  gcContent,
  molecularWeight,
  hammingDistance,
  levenshteinDistance,
  tmEstimate,
  hairpinCheck,
  parseFASTA,
  parseFASTQ,
  fastaToCSV,
  codonUsage,
  randomSeq,
};
