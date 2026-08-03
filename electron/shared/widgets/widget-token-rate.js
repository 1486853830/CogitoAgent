/* ============================================================
 *  Widget: Token Rate — Token 速率圆环
 *  滑动窗口(最近 5 秒)采样 token-usage 事件,显示速率
 *  依赖 WS 推送的 token-usage 事件
 * ============================================================ */

window.WidgetRegistry?.register('tokenRate', (container, opts = {}) => {
  const state = {
    samples: [], // {t: ms, count: n}
    totalToday: 0,
    totalAll: 0,
    lastTotal: 0,
    maxRate: 100, // 自适应上限
    intervalId: null,
  };

  function pushSample(count) {
    const now = Date.now();
    state.samples.push({ t: now, count });
    // 清掉 5 秒前的样本
    const cutoff = now - 5000;
    state.samples = state.samples.filter((s) => s.t >= cutoff);
  }

  function computeRate() {
    if (state.samples.length < 2) return 0;
    const first = state.samples[0];
    const last = state.samples[state.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    const total = state.samples.reduce((sum, s) => sum + s.count, 0);
    return Math.round(total / dt);
  }

  function render() {
    if (!container) return;
    const rate = computeRate();
    const hasData = state.samples.length >= 2;
    // 自适应上限
    if (rate > state.maxRate) state.maxRate = Math.ceil(rate / 100) * 100;
    const pct = hasData ? Math.min(rate / state.maxRate, 1) : 0;
    const circumference = 2 * Math.PI * 42;
    const offset = circumference * (1 - pct);

    const ringContent = hasData
      ? `
      <div class="token-rate-ring">
        <svg viewBox="0 0 96 96">
          <circle class="ring-bg" cx="48" cy="48" r="42"/>
          <circle class="ring-fg" cx="48" cy="48" r="42"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"/>
        </svg>
        <div class="token-rate-center">
          <div class="token-rate-value">${rate}</div>
          <div class="token-rate-unit">tok/s</div>
        </div>
      </div>
    `
      : `
      <div class="token-rate-ring" style="display:flex;align-items:center;justify-content:center;">
        <div class="token-rate-center">
          <div class="token-rate-value" style="font-size:12px;">--</div>
          <div class="token-rate-unit">tok/s</div>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">TOKEN RATE</span>
          <span class="widget-head-meta">5s 窗口</span>
        </div>
        <div class="token-rate-wrap">
          ${ringContent}
          <div class="token-rate-stats">
            <div class="token-rate-row">
              <span class="token-rate-key">TODAY</span>
              <span class="token-rate-val">${formatNum(state.totalToday)}</span>
            </div>
            <div class="token-rate-row">
              <span class="token-rate-key">TOTAL</span>
              <span class="token-rate-val">${formatNum(state.totalAll)}</span>
            </div>
            <div class="token-rate-row">
              <span class="token-rate-key">PEAK</span>
              <span class="token-rate-val">${formatNum(state.maxRate)}/s</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function formatNum(n) {
    const num = Number(n) || 0;
    if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  }

  function applyStatsResponse(s) {
    if (!s) return;
    // 使用 !== undefined 检查,避免 0 值被 || 吞掉
    if (s.todayTokens !== undefined) state.totalToday = Number(s.todayTokens) || 0;
    if (s.totalTokens !== undefined) state.totalAll = Number(s.totalTokens) || 0;
    render();
  }

  return {
    init() {
      render();
      // 发送初始请求获取累计数据
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'tokens' });
      }
      // 监听 token-usage 推送
      if (window.electronAPI?.onTokenUsage) {
        window.electronAPI.onTokenUsage((data) => {
          const total = Number(data?.total) || 0;
          if (total > 0) {
            pushSample(total);
            // 从 session 中取累计值,避免用累加导致重复
            if (data?.session) {
              applyStatsResponse(data.session);
            } else {
              render();
            }
          }
        });
      }
      if (window.electronAPI?.on) {
        window.electronAPI.on('stats-response', (data) => {
          const s = data?.data || data?.session || data;
          applyStatsResponse(s);
        });
      }
      // 每 500ms 重新计算速率(让圆环持续衰减)
      state.intervalId = setInterval(() => {
        if (state.samples.length > 0) render();
      }, 500);
    },
    update(data) {
      const total = Number(data?.total) || 0;
      if (total > 0) pushSample(total);
      applyStatsResponse(data?.session || data);
    },
    destroy() {
      if (state.intervalId) clearInterval(state.intervalId);
      state.samples = [];
    },
  };
});
