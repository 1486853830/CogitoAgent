/* ============================================================
 *  Widget: Tool Rank — 工具 Top 排行榜
 *  横向进度条排行,展示 Top 10 工具的调用次数与成功率
 *  数据来源: stats-request {type: 'topTools'}
 * ============================================================ */

window.WidgetRegistry?.register('toolRank', (container, opts = {}) => {
  const state = { data: [], limit: opts.limit || 10, intervalId: null };

  const CAT_MAP = {
    file: '文件', web: '网络', system: '系统', browser: '浏览器',
    code: '代码', git: 'Git', task: '任务', memory: '记忆',
    data: '数据', db: '数据库', email: '邮件', monitor: '监控',
    scheduler: '定时', ocr: 'OCR', vision: '视觉', office: 'Office',
    cluster: '集群', wechat: '微信', gis: 'GIS', bio: '生命科学',
    med: '医学', chem: '化学', finance: '金融', math: '数学',
  };

  function render() {
    const top = [...state.data].sort((a, b) => b.callCount - a.callCount).slice(0, state.limit);
    const maxCount = top.length > 0 ? top[0].callCount : 1;

    const items = top.map((t, idx) => {
      const pct = (t.callCount / maxCount) * 100;
      let barCls = '';
      if (t.successRate < 70) barCls = 'danger';
      else if (t.successRate < 90) barCls = 'warn';

      return `
        <div class="tool-rank-item">
          <span class="tool-rank-no">${String(idx + 1).padStart(2, '0')}</span>
          <span class="tool-rank-name" title="${t.toolName} (${CAT_MAP[t.category] || t.category})">${t.toolName}</span>
          <span class="tool-rank-count">${t.callCount}</span>
          <div class="tool-rank-bar-wrap">
            <div class="tool-rank-bar ${barCls}" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">TOOL RANKING</span>
          <span class="widget-head-meta">TOP ${state.limit}</span>
        </div>
        ${top.length === 0
          ? '<div class="widget-empty">等待工具调用数据...</div>'
          : `<div class="tool-rank-list">${items}</div>`
        }
      </div>
    `;
  }

  return {
    init() {
      render();
      // 主动拉取
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'topTools', limit: state.limit });
      }
      if (window.electronAPI?.on) {
        window.electronAPI.on('stats-response', (data) => {
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
      const tools = Array.isArray(data) ? data : (data?.topTools || data?.data);
      if (Array.isArray(tools)) {
        state.data = tools;
        render();
      }
    },
    destroy() {
      if (state.intervalId) clearInterval(state.intervalId);
      state.data = [];
    },
  };
});
