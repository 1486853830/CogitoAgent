/* ============================================================
 *  Widget: Stat Cards — 今日卡片墙
 *  展示今日会话/消息/工具调用/Token/运行时长等大数字卡片
 *  数据来源: stats-request {type: 'session'} 或 stats-response.session
 * ============================================================ */

window.WidgetRegistry?.register('statCards', (container, opts = {}) => {
  const fields = opts.fields || [
    { key: 'todaySessions', labelKey: 'widget.todaySessions', unit: '' },
    { key: 'todayMessages', labelKey: 'widget.todayMessages', unit: '' },
    { key: 'todayToolCalls', labelKey: 'widget.todayToolCalls', unit: '' },
    { key: 'todayTokens', labelKey: 'widget.todayTokens', unit: '' },
    { key: 'totalTokens', labelKey: 'widget.totalTokens', unit: '' },
    { key: 'totalThinkingTime', labelKey: 'widget.thinkingTime', unit: 's', format: 'time' },
  ];

  const state = { data: {}, startedAt: Date.now(), langHandler: null };

  const tr = (key, fb) =>
    window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : fb;

  function formatNum(n) {
    return window.SharedUtils?.formatNumCompact?.(n) ?? String(Number(n) || 0);
  }

  function formatTime(s) {
    const sec = Math.floor(Number(s) || 0);
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    return Math.floor(sec / 3600) + 'h' + Math.floor((sec % 3600) / 60) + 'm';
  }

  function render() {
    const cards = fields
      .map((f) => {
        const raw = state.data[f.key] || 0;
        const val = f.format === 'time' ? formatTime(raw) : formatNum(raw);
        const label = f.labelKey ? tr(f.labelKey, f.label || f.key) : f.label;
        return `
        <div class="stat-card" data-key="${f.key}">
          <div class="stat-card-label">${label}</div>
          <div class="stat-card-value">${val}<span class="stat-card-unit">${f.unit || ''}</span></div>
        </div>
      `;
      })
      .join('');
    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">TODAY METRICS</span>
          <span class="widget-head-meta">${tr('widget.realtime', '实时')}</span>
        </div>
        <div class="stat-cards">${cards}</div>
      </div>
    `;
  }

  return {
    init() {
      state.startedAt = Date.now();
      render();
      state.langHandler = render;
      document.addEventListener('cogito:langchange', state.langHandler);
      // 启动时拉取一次
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'session' });
      }
      // 监听 stats-response
      if (window.electronAPI?.on) {
        window.electronAPI.on('stats-response', (data) => {
          const s = data?.data || data?.session || data;
          if (s && s.totalTokens !== undefined) {
            state.data = { ...state.data, ...s };
            // 思考时长实时计算:totalThinkingTime + (now - startedAt)
            if (state.data.totalThinkingTime !== undefined) {
              const liveTime =
                Number(state.data.totalThinkingTime) +
                Math.floor((Date.now() - state.startedAt) / 1000);
              state.data.totalThinkingTime = liveTime;
            }
            render();
          }
        });
      }
    },
    update(data) {
      const s = data?.session || data?.data || data;
      if (s) {
        state.data = { ...state.data, ...s };
        render();
      }
    },
    destroy() {
      if (state.langHandler) document.removeEventListener('cogito:langchange', state.langHandler);
      state.data = {};
      state.langHandler = null;
    },
  };
});
