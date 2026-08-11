/**
 * RDKit 化学信息学插件
 * 依赖：RDKit (pip install rdkit)
 * 提供分子操作、指纹计算、子结构搜索、药效团分析等功能
 *
 * 安全设计：所有用户输入通过 stdin 传递 JSON，不使用字符串拼接，
 * 彻底避免命令注入风险。
 */

import { runPython, validateOutputPath } from '../shared/python-runner.js';

const TOOLS = [];

// ============================================
// 工具：分子基本信息
// ============================================
TOOLS.push({
  name: 'molInfo',
  description: '分析分子的基本化学信息，包括分子式、分子量、SMILES、LogP 等',
  category: 'chemistry',
  fn: async (smiles) => {
    if (!smiles || typeof smiles !== 'string') {
      return { success: false, error: '请输入 SMILES 字符串' };
    }
    try {
      const script = `
import json, sys
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen

data = json.load(sys.stdin)
mol = Chem.MolFromSmiles(data["smiles"])
if mol is None:
    print("ERROR:Invalid SMILES")
else:
    mw = Descriptors.MolWt(mol)
    logp = Crippen.MolLogP(mol)
    hbd = Descriptors.NumHDonors(mol)
    hba = Descriptors.NumHAcceptors(mol)
    rot = Descriptors.NumRotatableBonds(mol)
    tpsa = Descriptors.TPSA(mol)
    formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
    heavy = mol.GetNumHeavyAtoms()
    rings = Descriptors.RingCount(mol)
    print(f"分子式: {formula}")
    print(f"分子量: {mw:.2f}")
    print(f"LogP: {logp:.2f}")
    print(f"氢键供体: {hbd}")
    print(f"氢键受体: {hba}")
    print(f"可旋转键: {rot}")
    print(f"TPSA: {tpsa:.2f}")
    print(f"重原子数: {heavy}")
    print(f"环数: {rings}")
`;
      const result = await runPython(script, { smiles });
      if (result.startsWith('ERROR:')) {
        return { success: false, error: result.replace('ERROR:', '').trim() };
      }
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `RDKit 执行失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：SMILES 转分子结构图
// ============================================
TOOLS.push({
  name: 'molDraw',
  description: '生成分子的 2D 结构图，保存为 PNG 文件',
  category: 'chemistry',
  fn: async (smiles, outputPath) => {
    if (!smiles) return { success: false, error: '请输入 SMILES 字符串' };
    if (!outputPath) return { success: false, error: '请指定输出文件路径' };
    try {
      // 校验输出路径，防止路径遍历
      validateOutputPath(outputPath, '.png');
      const script = `
import json, sys, os
from rdkit import Chem
from rdkit.Chem import Draw

data = json.load(sys.stdin)
mol = Chem.MolFromSmiles(data["smiles"])
if mol is None:
    print("ERROR:Invalid SMILES")
else:
    out_path = os.path.normpath(data["outputPath"])
    img = Draw.MolToImage(mol, size=(600, 600))
    img.save(out_path)
    print(f"OK: 分子结构图已保存")
`;
      const result = await runPython(script, { smiles, outputPath });
      if (result.startsWith('ERROR:')) {
        return { success: false, error: result.replace('ERROR:', '').trim() };
      }
      return { success: true, data: `分子结构图已保存到: ${outputPath}` };
    } catch (error) {
      return { success: false, error: `分子绘图失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：分子指纹计算
// ============================================
TOOLS.push({
  name: 'molFingerprint',
  description: '计算分子的 Morgan/Circular 指纹（ECFP 类似物）',
  category: 'chemistry',
  fn: async (smiles, radius = 2, nBits = 2048) => {
    if (!smiles) return { success: false, error: '请输入 SMILES 字符串' };
    try {
      const r = Math.max(1, parseInt(radius) || (radius === 0 ? 0 : 2));
      const n = Math.max(32, Math.min(4096, parseInt(nBits) || 2048));
      const script = `
import json, sys
from rdkit import Chem
from rdkit.Chem import AllChem

data = json.load(sys.stdin)
mol = Chem.MolFromSmiles(data["smiles"])
if mol is None:
    print("ERROR:Invalid SMILES")
else:
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, data["radius"], nBits=data["nBits"])
    bits = [i for i in range(len(fp)) if fp[i]]
    print(f"指纹位长: {data['nBits']}")
    print(f"开启位数量: {len(bits)}")
    print(f"开启位索引: {bits[:50]}")
    if len(bits) > 50:
        print(f"... 还有 {len(bits) - 50} 个位")
`;
      const result = await runPython(script, { smiles, radius: r, nBits: n });
      if (result.startsWith('ERROR:')) {
        return { success: false, error: result.replace('ERROR:', '').trim() };
      }
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `指纹计算失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：子结构搜索
// ============================================
TOOLS.push({
  name: 'molSubstruct',
  description: '搜索分子中是否包含指定子结构',
  category: 'chemistry',
  fn: async (smiles, substructureSmiles) => {
    if (!smiles || !substructureSmiles) {
      return { success: false, error: '请输入分子 SMILES 和子结构 SMILES' };
    }
    try {
      const script = `
import json, sys
from rdkit import Chem

data = json.load(sys.stdin)
mol = Chem.MolFromSmiles(data["smiles"])
sub = Chem.MolFromSmiles(data["substructureSmiles"])
if mol is None:
    print("ERROR:Invalid molecule SMILES")
elif sub is None:
    print("ERROR:Invalid substructure SMILES")
else:
    matches = mol.GetSubstructMatches(sub)
    print(f"匹配数量: {len(matches)}")
    if matches:
        for i, m in enumerate(matches[:10]):
            print(f"  匹配 {i+1}: 原子索引 {list(m)}")
        if len(matches) > 10:
            print(f"  ... 还有 {len(matches) - 10} 个匹配")
`;
      const result = await runPython(script, { smiles, substructureSmiles });
      if (result.startsWith('ERROR:')) {
        return { success: false, error: result.replace('ERROR:', '').trim() };
      }
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `子结构搜索失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：分子相似性比较
// ============================================
TOOLS.push({
  name: 'molSimilarity',
  description: '计算两个分子之间的 Tanimoto 相似度',
  category: 'chemistry',
  fn: async (smiles1, smiles2, radius = 2) => {
    if (!smiles1 || !smiles2) {
      return { success: false, error: '请输入两个 SMILES 字符串' };
    }
    // S35: radius 此前被忽略（硬编码 2）；校验后传入，控制 Morgan 指纹半径
    const parsedRadius = parseInt(radius, 10);
    const safeRadius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 2;
    try {
      const script = `
import json, sys
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.DataStructs import TanimotoSimilarity

data = json.load(sys.stdin)
radius = int(data.get("radius", 2))
if radius <= 0:
    radius = 2
mol1 = Chem.MolFromSmiles(data["smiles1"])
mol2 = Chem.MolFromSmiles(data["smiles2"])
if mol1 is None or mol2 is None:
    print("ERROR:Invalid SMILES")
else:
    fp1 = AllChem.GetMorganFingerprintAsBitVect(mol1, radius, nBits=2048)
    fp2 = AllChem.GetMorganFingerprintAsBitVect(mol2, radius, nBits=2048)
    sim = TanimotoSimilarity(fp1, fp2)
    print(f"Tanimoto 相似度 (radius={radius}): {sim:.4f}")
    desc = '非常相似 (>=0.85)' if sim >= 0.85 else '相似 (>=0.7)' if sim >= 0.7 else '中等相似 (>=0.5)' if sim >= 0.5 else '不相似 (<0.5)'
    print(f"描述: {desc}")
`;
      const result = await runPython(script, { smiles1, smiles2, radius: safeRadius });
      if (result.startsWith('ERROR:')) {
        return { success: false, error: result.replace('ERROR:', '').trim() };
      }
      return { success: true, data: result.trim() };
    } catch (error) {
      return { success: false, error: `相似性计算失败: ${error.message}` };
    }
  },
});

export default TOOLS;

export const metadata = {
  // name 为简短名（与目录名一致）；package.json.name 使用带前缀的 npm 风格 cogito-plugin-rdkit-chem
  name: 'rdkit-chem',
  version: '1.0.0',
  author: 'CogitoAgent AI for Science',
  description:
    '基于 RDKit 的化学信息学工具包，提供分子分析、指纹计算、子结构搜索和相似性比较等功能',
  dependencies: ['rdkit'],
  config: {
    scientificMode: true,
  },
};
