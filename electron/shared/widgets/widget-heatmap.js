/* ============================================================
 *  Widget: Heatmap — GitHub 风格热力图
 *  53×7 格子展示过去一年的日活
 *  数据来源: stats-request {type: 'dailyHistory'}
 * ============================================================ */

window.WidgetRegistry?.register('heatmap', (container, opts = {}) => {
  const state = { data: [], metric: opts.metric || 'tokens' };

  const METRICS = [
    { key: 'tokens', label: 'TOKEN' },
    { key: 'toolCalls', label: 'CALLS' },
    { key: 'sessions', label: 'SESSIONS' },
    { key: 'messages', label: 'MSGS' },
  ];

  function levelFor(val) {
    if (val <= 0) return 0;
    if (val < state.thresholds[0]) return 1;
    if (val < state.thresholds[1]) return 2;
    if (val < state.thresholds[2]) return 3;
    return 4;
  }

  function computeThresholds(values) {
    const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
    if (positive.length === 0) return [1, 10, 100];
    const p33 = positive[Math.floor(positive.length * 0.33)] || 1;
    const p66 = positive[Math.floor(positive.length * 0.66)] || 10;
    const p90 = positive[Math.floor(positive.length * 0.9)] || 100;
    return [Math.max(1, p33), Math.max(p33 + 1, p66), Math.max(p66 + 1, p90)];
  }

  state.thresholds = [1, 10, 100];

  function buildGrid(dailyHistory) {
    // 生成最近 53 周的网格(以周日为起始)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 找到本周周日
    const startSunday = new Date(today);
    startSunday.setDate(today.getDate() - today.getDay() - 7 * 52);

    const cells = [];
    for (let week = 0; week < 53; week++) {
      for (let day = 0; day < 7; day++) {
        const date = new Date(startSunday);
        date.setDate(startSunday.getDate() + week * 7 + day);
        if (date > today) continue;
        const dateStr = date.toISOString().split('T')[0];
        const found = dailyHistory.find((d) => d.date === dateStr);
        const val = found ? Number(found[state.metric]) || 0 : 0;
        cells.push({ date: dateStr, val, level: levelFor(val) });
      }
    }
    return cells;
  }

  function render() {
    const values = state.data.map((d) => Number(d[state.metric]) || 0);
    state.thresholds = computeThresholds(values);
    const cells = buildGrid(state.data);
    const total = values.reduce((a, b) => a + b, 0);

    const cellHtml = cells.map((c) => {
      const cls = c.level === 0 ? '' : `l${c.level}`;
      return `<div class="heatmap-cell ${cls}" title="${c.date}: ${c.val}"></div>`;
    }).join('');

    const metricButtons = METRICS.map((m) => `
      <button class="widget-tab ${state.metric === m.key ? 'active' : ''}" data-metric="${m.key}">${m.label}</button>
    `).join('');

    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">ACTIVITY HEATMAP</span>
          <span class="widget-head-meta">53 weeks · ${formatNum(total)} ${state.metric}</span>
        </div>
        <div class="widget-tabs">${metricButtons}</div>
        <div class="heatmap-wrap">
          <div class="heatmap-grid">${cellHtml}</div>
        </div>
        <div class="heatmap-legend">
          <span>LESS</span>
          <div class="heatmap-legend-cells">
            <div class="heatmap-cell"></div>
            <div class="heatmap-cell l1"></div>
            <div class="heatmap-cell l2"></div>
            <div class="heatmap-cell l3"></div>
            <div class="heatmap-cell l4"></div>
          </div>
          <span>MORE</span>
        </div>
      </div>
    `;

    // 绑定 metric 切换
    container.querySelectorAll('[data-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.metric = btn.dataset.metric;
        render();
      });
    });
  }

  function formatNum(n) {
    const num = Number(n) || 0;
    if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  }

  return {
    init() {
      render();
      // 主动拉取
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'dailyHistory', limit: 365 });
      }
      if (window.electronAPI?.on) {
        window.electronAPI.on('stats-response', (data) => {
          const hist = data?.data || data?.dailyHistory;
          if (Array.isArray(hist)) {
            state.data = hist;
            render();
          }
        });
      }
    },
    update(data) {
      const hist = Array.isArray(data) ? data : (data?.dailyHistory || data?.data);
      if (Array.isArray(hist)) {
        state.data = hist;
        render();
      }
    },
    destroy() {
      state.data = [];
    },
  };
});
