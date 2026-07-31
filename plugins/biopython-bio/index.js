/**
 * Biopython 生物信息学插件
 * 依赖：Biopython (pip install biopython)
 * 提供序列比对、BLAST 搜索、进化树构建、蛋白质结构分析等功能
 */

const TOOLS = [];

// ============================================
// 工具：序列全局比对（Needleman-Wunsch）
// ============================================
TOOLS.push({
  name: 'bioAlign',
  description: '使用 Biopython 的 PairwiseAligner 进行双序列全局比对',
  category: 'bioinformatics',
  fn: async (seq1, seq2, matchScore = 1, mismatchScore = -1, gapScore = -2) => {
    if (!seq1 || !seq2) return { success: false, error: '请输入两个序列' };
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio import SeqIO
from Bio.Seq import Seq
from Bio import Align

aligner = Align.PairwiseAligner()
aligner.mode = 'global'
aligner.match_score = ${matchScore}
aligner.mismatch_score = ${mismatchScore}
aligner.gap_score = ${gapScore}

seq_a = Seq("${seq1.replace(/"/g, '\\"')}")
seq_b = Seq("${seq2.replace(/"/g, '\\"')}")

alignments = aligner.align(seq_a, seq_b)
best = alignments[0]
identity = sum(1 for a, b in zip(best[0], best[1]) if a == b and a != '-')
length = len(best[0])
pid = (identity / length) * 100 if length > 0 else 0

print(f"比对长度: {length}")
print(f"一致度: {identity}/{length} ({pid:.2f}%)")
print(f"得分: {best.score:.2f}")
print()
print(f"序列1: {best[0][:120]}")
print(f"       {'|'*min(120, len(best[0]))}")
print(f"序列2: {best[1][:120]}")
if len(best[0]) > 120:
    print(f"... (剩余 {len(best[0]) - 120} 个字符)")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `序列比对失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：BLAST 搜索
// ============================================
TOOLS.push({
  name: 'bioBlast',
  description: '通过 NCBI BLAST 搜索序列相似性（需要网络连接）',
  category: 'bioinformatics',
  fn: async (sequence, program = 'blastn', database = 'nt') => {
    if (!sequence) return { success: false, error: '请输入查询序列' };
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio.Blast import NCBIWWW, NCBIXML
import io, sys

# 限制查询长度，避免过长
seq = "${sequence.replace(/"/g, '\\"')}"[:2000]

print(f"正在提交 BLAST {program} 查询到 {database} 数据库...")
print(f"查询序列长度: {len(seq)}")
print()

try:
    result_handle = NCBIWWW.qblast(program, database, seq, hitlist_size=10, alignments=5)
    records = NCBIXML.parse(result_handle)
    
    for i, record in enumerate(records):
        if i > 0: break
        for j, alignment in enumerate(record.alignments[:10]):
            hsp = alignment.hsps[0]
            print(f"[{j+1}] {alignment.title[:80]}")
            print(f"    长度: {alignment.length}, 得分: {hsp.score:.0f}, E-value: {hsp.expect:.2e}")
            print(f"    一致度: {hsp.identities}/{hsp.align_length} ({hsp.identities/hsp.align_length*100:.1f}%)")
            print()
    
    if not record.alignments:
        print("未找到显著匹配。")
except Exception as e:
    print(f"BLAST 搜索失败: {e}")
    print("提示: BLAST 需要网络连接，请确保能访问 NCBI 服务器。")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 60000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `BLAST 搜索失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：序列格式转换
// ============================================
TOOLS.push({
  name: 'bioConvert',
  description: '序列格式转换（FASTA/GenBank/EMBL/SwissProt 互转）',
  category: 'bioinformatics',
  fn: async (inputPath, outputPath, inputFormat = 'fasta', outputFormat = 'fasta') => {
    if (!inputPath || !outputPath) {
      return { success: false, error: '请指定输入和输出文件路径' };
    }
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio import SeqIO

count = SeqIO.convert("${inputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
                       "${inputFormat}",
                       "${outputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
                       "${outputFormat}")
print(f"成功转换 {count} 条序列")
print(f"格式: {inputFormat} → {outputFormat}")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `格式转换失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：从 GenBank 获取序列
// ============================================
TOOLS.push({
  name: 'bioFetchGenbank',
  description: '通过 Entrez 从 GenBank 获取序列信息（需要网络连接）',
  category: 'bioinformatics',
  fn: async (accession) => {
    if (!accession) return { success: false, error: '请输入 GenBank 登录号' };
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio import Entrez, SeqIO

Entrez.email = "cogito-agent@research.local"
print(f"正在从 NCBI 获取序列 {${JSON.stringify(accession)}}...")

try:
    handle = Entrez.efetch(db="nucleotide", id="${accession.replace(/"/g, '')}", rettype="gb", retmode="text")
    record = SeqIO.read(handle, "genbank")
    handle.close()
    
    print(f"登录号: {record.id}")
    print(f"名称: {record.name}")
    print(f"描述: {record.description}")
    print(f"长度: {len(record.seq)} bp")
    print(f"分子类型: {record.annotations.get('molecule_type', 'N/A')}")
    print(f"拓扑: {record.annotations.get('topology', 'N/A')}")
    print(f"数据来源: {record.annotations.get('data_file_division', 'N/A')}")
    print(f"日期: {record.annotations.get('date', 'N/A')}")
    
    features = [f for f in record.features if f.type == 'CDS']
    print(f"CDS 特征数: {len(features)}")
    for i, f in enumerate(features[:5]):
        loc = str(f.location)
        prod = f.qualifiers.get('product', ['N/A'])[0]
        print(f"  [{i+1}] {loc} - {prod}")
    if len(features) > 5:
        print(f"  ... 还有 {len(features) - 5} 个")
        
except Exception as e:
    print(f"获取失败: {e}")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `GenBank 获取失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：蛋白质结构分析（PDB 文件）
// ============================================
TOOLS.push({
  name: 'bioPdbInfo',
  description: '分析 PDB 蛋白质结构文件的基本信息',
  category: 'bioinformatics',
  fn: async (pdbPath) => {
    if (!pdbPath) return { success: false, error: '请输入 PDB 文件路径' };
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio.PDB import PDBParser

parser = PDBParser(QUIET=True)
structure = parser.get_structure("protein", "${pdbPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")

print(f"结构名称: {structure.id}")
print(f"模型数量: {len(structure)}")

for model in structure:
    print(f"\\n模型 {model.id}:")
    for chain in model:
        print(f"  链 {chain.id}: {len(chain)} 个残基")
        # 统计氨基酸类型
        residues = [r.get_resname() for r in chain if r.get_id()[0] == ' ']
        unique = set(residues)
        print(f"    氨基酸残基: {len(residues)} 个, {len(unique)} 种")
        
        # 统计原子数
        atoms = sum(1 for r in chain for a in r)
        print(f"    原子数: {atoms}")
        
        # 计算链的质心
        try:
            coords = [a.get_vector() for r in chain for a in r if a.get_id() != 'H']
            if coords:
                center = sum(coords, coords[0].zero()) / len(coords)
                print(f"    质心: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f})")
        except:
            pass
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `PDB 分析失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：FASTA 文件序列统计
// ============================================
TOOLS.push({
  name: 'bioFastaStats',
  description: '对 FASTA 文件进行全面的序列统计',
  category: 'bioinformatics',
  fn: async (fastaPath) => {
    if (!fastaPath) return { success: false, error: '请输入 FASTA 文件路径' };
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio import SeqIO

records = list(SeqIO.parse("${fastaPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", "fasta"))
n = len(records)
print(f"序列总数: {n}")

if n > 0:
    lengths = [len(r) for r in records]
    gc_contents = [(r.seq.count('G') + r.seq.count('C') + r.seq.count('g') + r.seq.count('c')) / len(r) * 100 for r in records]
    
    print(f"长度范围: {min(lengths)} - {max(lengths)}")
    print(f"平均长度: {sum(lengths)/n:.1f}")
    print(f"中位长度: {sorted(lengths)[n//2]}")
    print(f"平均 GC 含量: {sum(gc_contents)/n:.2f}%")
    
    # 序列描述统计
    descs = [r.description[:60] for r in records[:5]]
    for i, d in enumerate(descs):
        print(f"[{i+1}] {d}")
    if n > 5:
        print(f"... 还有 {n-5} 条序列")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `FASTA 统计失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：多序列比对（ClustalW 接口）
// ============================================
TOOLS.push({
  name: 'bioMsa',
  description: '使用 Biopython 调用 ClustalW 进行多序列比对（需要安装 clustalw）',
  category: 'bioinformatics',
  fn: async (inputFasta, outputAln) => {
    if (!inputFasta || !outputAln) {
      return { success: false, error: '请指定输入 FASTA 和输出比对文件路径' };
    }
    try {
      const { execFileSync } = await import('child_process');
      const script = `
from Bio import AlignIO
from Bio.Align.Applications import ClustalwCommandline

cline = ClustalwCommandline("clustalw2",
    infile="${inputFasta.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
    outfile="${outputAln.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
    outorder="input")
stdout, stderr = cline()

print("多序列比对完成")
print(f"输出文件: ${outputAln.replace(/\\/g, '\\\\')}")

# 读取比对结果并统计
alignment = AlignIO.read("${outputAln.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", "clustal")
print(f"序列数: {len(alignment)}")
print(f"比对长度: {alignment.get_alignment_length()}")
`;
      const result = execFileSync('python', ['-c', script], {
        encoding: 'utf8',
        timeout: 60000,
      });
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `多序列比对失败: ${error.message}` };
    }
  },
});

export default TOOLS;

export const metadata = {
  name: 'biopython-bio',
  version: '1.0.0',
  author: 'CogitoAgent AI for Science',
  description:
    '基于 Biopython 的生物信息学工具包，提供序列比对、BLAST 搜索、GenBank 获取、PDB 分析和格式转换等功能',
  dependencies: ['biopython'],
  config: {
    scientificMode: true,
  },
};
