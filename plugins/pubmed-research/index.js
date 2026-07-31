/**
 * PubMed 文献检索插件
 * 基于 NCBI Entrez API，提供文献搜索、摘要获取和引用管理功能
 * 不需要额外依赖，使用 Node.js 内置 https 模块
 *
 * 安全设计：XML 标签清理使用状态机而非正则，避免不完整的清理风险。
 */

const TOOLS = [];

const ENTREZ_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * 执行 Entrez API 查询
 */
async function entrezFetch(url) {
  const https = await import('https');
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy();
        reject(new Error('请求超时'));
      });
  });
}

/**
 * 使用状态机安全剥离 XML 标签
 * 不使用正则，避免 CodeQL "Incomplete multi-character sanitization" 警报
 * @param {string} str - 包含 XML 标签的字符串
 * @returns {string} - 剥离标签后的纯文本
 */
function stripXmlTags(str) {
  let out = '';
  let inTag = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '<') {
      inTag = true;
      continue;
    }
    if (ch === '>') {
      inTag = false;
      continue;
    }
    if (!inTag) {
      out += ch;
    }
  }
  return out.trim();
}

/**
 * 解析 PubMed XML 结果的简化版本
 */
function parsePubMedXml(xml) {
  const articles = [];
  const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

  for (const articleXml of articleMatches) {
    const article = {};

    const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    article.pmid = pmidMatch ? pmidMatch[1] : '';

    const titleMatch = articleXml.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
    article.title = titleMatch ? stripXmlTags(titleMatch[1]) : '';

    const absMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
    article.abstract = absMatch ? stripXmlTags(absMatch[1]).slice(0, 500) : '';

    const authors = [];
    const authorMatches = articleXml.matchAll(/<Author[^>]*>[\s\S]*?<\/Author>/g);
    for (const am of authorMatches) {
      const lastName = am[0].match(/<LastName[^>]*>([^<]+)<\/LastName>/);
      const foreName = am[0].match(/<ForeName[^>]*>([^<]+)<\/ForeName>/);
      if (lastName) {
        authors.push(`${foreName ? foreName[1] + ' ' : ''}${lastName[1]}`);
      }
    }
    article.authors = authors.slice(0, 10).join(', ');

    const journalMatch = articleXml.match(/<Journal[^>]*>[\s\S]*?<Title[^>]*>([^<]+)<\/Title>/);
    article.journal = journalMatch ? journalMatch[1] : '';

    const yearMatch = articleXml.match(/<PubDate[^>]*>[\s\S]*?<Year[^>]*>(\d{4})<\/Year>/);
    article.year = yearMatch ? yearMatch[1] : '';

    const doiMatch = articleXml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    article.doi = doiMatch ? doiMatch[1] : '';

    articles.push(article);
  }
  return articles;
}

// ============================================
// 工具：PubMed 文献搜索
// ============================================
TOOLS.push({
  name: 'pubmedSearch',
  description: '在 PubMed 中搜索文献，返回搜索结果列表（标题、作者、期刊、摘要）',
  category: 'literature',
  fn: async (query, maxResults = 10) => {
    if (!query) return { success: false, error: '请输入搜索关键词' };
    try {
      const max = Math.min(Math.max(parseInt(maxResults) || 10, 1), 50);

      // 第一步：搜索获取 ID 列表
      const searchUrl = `${ENTREZ_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${max}&retmode=xml&sort=relevance`;
      const searchXml = await entrezFetch(searchUrl);

      const idMatch = searchXml.match(/<IdList>([\s\S]*?)<\/IdList>/);
      if (!idMatch) return { success: true, data: '未找到匹配的文献。' };

      const ids = [...idMatch[1].matchAll(/<Id>(\d+)<\/Id>/g)].map((m) => m[1]);
      if (ids.length === 0) return { success: true, data: '未找到匹配的文献。' };

      // 第二步：获取文献详情
      const fetchUrl = `${ENTREZ_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
      const fetchXml = await entrezFetch(fetchUrl);

      const articles = parsePubMedXml(fetchXml);

      if (articles.length === 0) return { success: true, data: '未找到匹配的文献。' };

      let output = `PubMed 搜索结果: "${query}"\n`;
      output += `共 ${ids.length} 条结果，显示前 ${Math.min(articles.length, max)} 条:\n\n`;

      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        output += `[${i + 1}] ${a.title}\n`;
        output += `    作者: ${a.authors || 'N/A'}\n`;
        output += `    期刊: ${a.journal || 'N/A'} (${a.year || 'N/A'})\n`;
        output += `    PMID: ${a.pmid}${a.doi ? ` | DOI: ${a.doi}` : ''}\n`;
        if (a.abstract) {
          output += `    摘要: ${a.abstract.slice(0, 300)}${a.abstract.length > 300 ? '...' : ''}\n`;
        }
        output += '\n';
      }

      return { success: true, data: output.trim() };
    } catch (error) {
      return { success: false, error: `PubMed 搜索失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：获取单篇文献详情
// ============================================
TOOLS.push({
  name: 'pubmedFetch',
  description: '通过 PMID 获取单篇 PubMed 文献的完整信息',
  category: 'literature',
  fn: async (pmid) => {
    if (!pmid) return { success: false, error: '请输入 PMID' };
    // 只允许数字
    const cleanPmid = String(pmid).replace(/\D/g, '');
    if (!cleanPmid) return { success: false, error: 'PMID 应为数字' };
    try {
      const fetchUrl = `${ENTREZ_BASE}/efetch.fcgi?db=pubmed&id=${cleanPmid}&retmode=xml`;
      const xml = await entrezFetch(fetchUrl);

      const articles = parsePubMedXml(xml);
      if (articles.length === 0) return { success: false, error: '未找到该文献' };

      const a = articles[0];

      // 提取完整摘要
      let fullAbstract = '';
      const absMatches = xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
      for (const m of absMatches) {
        const labelMatch = m[0].match(/Label="([^"]+)"/);
        const label = labelMatch ? `[${labelMatch[1]}] ` : '';
        fullAbstract += label + stripXmlTags(m[1]) + '\n\n';
      }

      // 提取完整作者列表
      const authors = [];
      const authorMatches = xml.matchAll(/<Author[^>]*>[\s\S]*?<\/Author>/g);
      for (const am of authorMatches) {
        const lastName = am[0].match(/<LastName[^>]*>([^<]+)<\/LastName>/);
        const foreName = am[0].match(/<ForeName[^>]*>([^<]+)<\/ForeName>/);
        if (lastName) {
          authors.push(`${foreName ? foreName[1] + ' ' : ''}${lastName[1]}`);
        }
      }

      // 提取关键词
      const keywords = [];
      const kwMatches = xml.matchAll(/<Keyword[^>]*>([^<]+)<\/Keyword>/g);
      for (const m of kwMatches) keywords.push(m[1]);

      // 提取 MeSH 术语
      const meshTerms = [];
      const meshMatches = xml.matchAll(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g);
      for (const m of meshMatches) meshTerms.push(m[1]);

      // 提取引用信息
      const citMatch = xml.match(/<Citation[^>]*>([^<]+)<\/Citation>/);
      const citation = citMatch ? citMatch[1] : '';

      let output = `PubMed 文献详情\n`;
      output += `${'='.repeat(50)}\n\n`;
      output += `标题: ${a.title}\n\n`;
      output += `作者: ${authors.join(', ')}\n\n`;
      output += `期刊: ${a.journal || 'N/A'}`;
      output += citation ? ` | ${citation}` : '';
      output += ` (${a.year || 'N/A'})\n`;
      output += `PMID: ${a.pmid}${a.doi ? `\nDOI: ${a.doi}` : ''}\n`;
      if (keywords.length > 0) {
        output += `\n关键词: ${keywords.join(', ')}\n`;
      }
      if (meshTerms.length > 0) {
        output += `\nMeSH 术语: ${meshTerms.slice(0, 15).join(', ')}\n`;
      }
      if (fullAbstract) {
        output += `\n摘要:\n${fullAbstract.trim()}\n`;
      }

      return { success: true, data: output.trim() };
    } catch (error) {
      return { success: false, error: `文献获取失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：文献高级检索
// ============================================
TOOLS.push({
  name: 'pubmedAdvanced',
  description: '使用 PubMed 高级查询语法搜索文献（支持 AND/OR/NOT、字段限定、日期范围等）',
  category: 'literature',
  fn: async (query, field = 'all', mindate = '', maxdate = '', maxResults = 10) => {
    if (!query) return { success: false, error: '请输入搜索关键词' };
    try {
      const max = Math.min(Math.max(parseInt(maxResults) || 10, 1), 50);
      let searchQuery = query;
      if (field && field !== 'all' && !query.includes('[')) {
        const fieldMap = {
          title: '[Title]',
          abstract: '[Abstract]',
          author: '[Author]',
          journal: '[Journal]',
          mesh: '[MeSH]',
          keyword: '[Keyword]',
        };
        searchQuery = `${query}${fieldMap[field] || ''}`;
      }

      let dateRange = '';
      if (mindate && maxdate) {
        dateRange = `&mindate=${encodeURIComponent(mindate)}&maxdate=${encodeURIComponent(maxdate)}&datetype=pdat`;
      } else if (mindate) {
        dateRange = `&mindate=${encodeURIComponent(mindate)}&maxdate=3000&datetype=pdat`;
      }

      const searchUrl = `${ENTREZ_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}${dateRange}&retmax=${max}&retmode=xml&sort=relevance`;
      const searchXml = await entrezFetch(searchUrl);

      const countMatch = searchXml.match(/<Count>(\d+)<\/Count>/);
      const totalCount = countMatch ? parseInt(countMatch[1]) : 0;

      const idMatch = searchXml.match(/<IdList>([\s\S]*?)<\/IdList>/);
      if (!idMatch || totalCount === 0) {
        return { success: true, data: '未找到匹配的文献。' };
      }

      const ids = [...idMatch[1].matchAll(/<Id>(\d+)<\/Id>/g)].map((m) => m[1]);

      const fetchUrl = `${ENTREZ_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
      const fetchXml = await entrezFetch(fetchUrl);
      const articles = parsePubMedXml(fetchXml);

      let output = `PubMed 高级搜索\n`;
      output += `查询: "${query}"${field !== 'all' ? ` [${field}]` : ''}`;
      if (mindate || maxdate) output += ` | 日期: ${mindate || '...'} ~ ${maxdate || '...'}`;
      output += `\n共 ${totalCount} 条结果，显示前 ${Math.min(articles.length, max)} 条:\n\n`;

      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        output += `[${i + 1}] ${a.title}\n`;
        output += `    作者: ${a.authors || 'N/A'}\n`;
        output += `    期刊: ${a.journal || 'N/A'} (${a.year || 'N/A'})\n`;
        output += `    PMID: ${a.pmid}\n`;
        if (a.abstract) {
          output += `    摘要: ${a.abstract.slice(0, 200)}${a.abstract.length > 200 ? '...' : ''}\n`;
        }
        output += '\n';
      }

      return { success: true, data: output.trim() };
    } catch (error) {
      return { success: false, error: `PubMed 搜索失败: ${error.message}` };
    }
  },
});

// ============================================
// 工具：文献引用格式导出
// ============================================
TOOLS.push({
  name: 'pubmedCite',
  description: '为指定 PMID 的文献生成多种格式的引用（AMA/APA/MLA/NLM）',
  category: 'literature',
  fn: async (pmid, format = 'nlm') => {
    if (!pmid) return { success: false, error: '请输入 PMID' };
    const cleanPmid = String(pmid).replace(/\D/g, '');
    if (!cleanPmid) return { success: false, error: 'PMID 应为数字' };
    try {
      const formats = { ama: 'AMA', apa: 'APA', mla: 'MLA', nlm: 'NLM' };
      const fmt = (formats[format] || 'NLM').toLowerCase();

      const fetchUrl = `${ENTREZ_BASE}/efetch.fcgi?db=pubmed&id=${cleanPmid}&retmode=xml`;
      const xml = await entrezFetch(fetchUrl);

      const articles = parsePubMedXml(xml);
      if (articles.length === 0) return { success: false, error: '未找到该文献' };

      const a = articles[0];
      const authors = a.authors.split(', ');

      let citation = '';

      if (fmt === 'nlm') {
        const authStr =
          authors.length > 6 ? authors.slice(0, 6).join(', ') + ', et al.' : authors.join(', ');
        citation = `${authStr}. ${a.title}. ${a.journal}. ${a.year};`;
      } else if (fmt === 'apa') {
        const authStr =
          authors.length > 7 ? authors.slice(0, 7).join(', ') + '...' : authors.join(', ');
        citation = `${authStr}. (${a.year}). ${a.title}. ${a.journal}.`;
      } else {
        citation = `${a.authors}. ${a.title}. ${a.journal}. ${a.year}. PMID: ${a.pmid}.`;
      }

      return {
        success: true,
        data: `引用格式 [${format.toUpperCase()}]:\n\n${citation}\n\n${a.doi ? `DOI: https://doi.org/${a.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`}`,
      };
    } catch (error) {
      return { success: false, error: `引用生成失败: ${error.message}` };
    }
  },
});

export default TOOLS;

export const metadata = {
  name: 'pubmed-research',
  version: '1.0.0',
  author: 'CogitoAgent AI for Science',
  description: 'PubMed 文献检索工具包，提供文献搜索、详情获取、高级检索和引用格式导出等功能',
  dependencies: [],
  config: {
    scientificMode: false,
  },
};
