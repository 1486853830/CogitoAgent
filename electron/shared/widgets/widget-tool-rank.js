/* ============================================================
 *  Widget: Tool Rank — 工具 Top 排行榜
 *  横向进度条排行,展示 Top 10 工具的调用次数与成功率
 *  数据来源: stats-request {type: 'topTools'}
 * ============================================================ */

window.WidgetRegistry?.register('toolRank', (container, opts = {}) => {
  const state = { data: [], limit: opts.limit || 10, intervalId: null, langHandler: null };

  const tr = (key, fb) =>
    window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : fb;

  // 工具名/分类来自统计库，可能包含模型编造的任意字符串，直接插入 innerHTML 会构成 XSS。
  // SharedUtils 未加载时回退到 textContent 转义，绝不返回原始文本。
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    if (window.SharedUtils && typeof window.SharedUtils.escapeHtml === 'function') {
      return window.SharedUtils.escapeHtml(String(v));
    }
    const div = document.createElement('div');
    div.textContent = String(v);
    return div.innerHTML;
  };

  const CAT_MAP = {
    file: 'widget.cat.file',
    web: 'widget.cat.web',
    system: 'widget.cat.system',
    browser: 'widget.cat.browser',
    code: 'widget.cat.code',
    git: 'Git',
    task: 'widget.cat.task',
    memory: 'widget.cat.memory',
    data: 'widget.cat.data',
    db: 'widget.cat.db',
    email: 'widget.cat.email',
    monitor: 'widget.cat.monitor',
    scheduler: 'widget.cat.scheduler',
    ocr: 'OCR',
    vision: 'widget.cat.vision',
    office: 'Office',
    cluster: 'widget.cat.cluster',
    wechat: 'widget.cat.wechat',
    gis: 'GIS',
    bio: 'widget.cat.bio',
    med: 'widget.cat.med',
    chem: 'widget.cat.chem',
    finance: 'widget.cat.finance',
    math: 'widget.cat.math',
  };

  function catName(key) {
    const v = CAT_MAP[key];
    if (v && v.indexOf('.') !== -1) return tr(v);
    return v || key;
  }

  function render() {
    const top = [...state.data].sort((a, b) => b.callCount - a.callCount).slice(0, state.limit);
    const maxCount = top.length > 0 ? top[0].callCount : 1;

    const items = top
      .map((t, idx) => {
        const rawPct = (Number(t.callCount) / (Number(maxCount) || 1)) * 100;
        const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;
        let barCls = '';
        if (t.successRate < 70) barCls = 'danger';
        else if (t.successRate < 90) barCls = 'warn';

        return `
        <div class="tool-rank-item">
          <span class="tool-rank-no">${String(idx + 1).padStart(2, '0')}</span>
          <span class="tool-rank-name" title="${esc(t.toolName)} (${esc(catName(t.category))})">${esc(t.toolName)}</span>
          <span class="tool-rank-count">${esc(t.callCount)}</span>
          <div class="tool-rank-bar-wrap">
            <div class="tool-rank-bar ${barCls}" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
      })
      .join('');

    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">TOOL RANKING</span>
          <span class="widget-head-meta">TOP ${state.limit}</span>
        </div>
        ${
          top.length === 0
            ? `<div class="widget-empty">${tr('widget.waitingTools', '等待工具调用数据...')}</div>`
            : `<div class="tool-rank-list">${items}</div>`
        }
      </div>
    `;
  }

  return {
    init() {
      render();
      state.langHandler = render;
      document.addEventListener('cogito:langchange', state.langHandler);
      // 主动拉取
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'topTools', limit: state.limit });
      }
      if (window.electronAPI?.on) {
        state.unsubStats = window.electronAPI.on('stats-response', (data) => {
          const tools = data?.data || data?.topTools;
          if (Array.isArray(tools)) {
            state.data = tools;
            render();
          }
        });
      }
      // 每 15 秒刷新一次
      state.intervalId = setInterval(() => {
        if (window.electronAPI?.sendStatsRequest) {
          window.electronAPI.sendStatsRequest({ type: 'topTools', limit: state.limit });
        }
      }, 15000);
    },
    update(data) {
      const tools = Array.isArray(data) ? data : data?.topTools || data?.data;
      if (Array.isArray(tools)) {
        state.data = tools;
        render();
      }
    },
    destroy() {
      if (state.intervalId) clearInterval(state.intervalId);
      if (state.langHandler) document.removeEventListener('cogito:langchange', state.langHandler);
      state.data = [];
      state.langHandler = null;
      state.intervalId = null;
      if (typeof state.unsubStats === 'function') {
        state.unsubStats();
        state.unsubStats = null;
      }
    },
  };
});
