/**
 * Monitor 渲染进程 - 独立监控面板
 * 展示: 思维链 / 工具统计 / 智能体集群
 * 使用共享组件：WindowControls / PanelToggle / SharedUtils
 */

const T = (k, vars) =>
  window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(k, vars) : k;

// ============================================================
// 窗口控制 - 使用公共 WindowControls
// ============================================================
WindowControls.init();

// ============================================================
// 面板折叠切换 - 使用公共 PanelToggle
// ============================================================
PanelToggle.init([
  { btnId: 'toggleThoughtPanel', bodyId: 'thoughtPanelBody' },
  { btnId: 'toggleStatsPanel', bodyId: 'statsPanelBody' },
  { btnId: 'toggleClusterPanel', bodyId: 'clusterPanelBody' },
]);

// ============================================================
// 思维链管理
// ============================================================
const ThoughtManager = {
  trace: [],

  init() {
    if (window.electronAPI?.on) {
      window.electronAPI.on('thought-trace', (data) => this.handleThoughtTrace(data));
    }
  },

  handleThoughtTrace(data) {
    if (data.type === 'add') {
      this.trace.push(data.step);
    } else if (data.type === 'update') {
      const idx = this.trace.findIndex((s) => s.id === data.step.id);
      if (idx !== -1) this.trace[idx] = { ...this.trace[idx], ...data.step };
    } else if (data.type === 'clear') {
      this.trace = [];
    }
    this.render();
  },

  render() {
    const el = document.getElementById('thoughtTimeline');
    if (!el) return;

    if (this.trace.length === 0) {
      el.innerHTML = `<div class="thought-empty">${T('monitor.thoughtEmpty')}</div>`;
      return;
    }

    el.innerHTML = this.trace
      .map((step) => {
        const details = step.details || {};
        const detailsText = Object.entries(details)
          .filter(([k]) => k !== 'success' && k !== 'isEmpty' && k !== 'error' && k !== 'args')
          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v).slice(0, 30)}`)
          .join(', ');
        const argsText = details.args ? JSON.stringify(details.args).slice(0, 50) : '';
        const statusText =
          step.status === 'running'
            ? T('monitor.statusRunning')
            : step.status === 'completed'
              ? T('monitor.statusCompleted')
              : T('monitor.statusFailed');

        return `
        <div class="thought-step ${step.status}">
          <div class="thought-step-content">
            <div class="thought-step-name">${SharedUtils.escapeHtml(step.name)}</div>
            ${detailsText || argsText ? `<div class="thought-step-details">${SharedUtils.escapeHtml(detailsText || argsText)}</div>` : ''}
            <div class="thought-step-meta">
              ${step.duration > 0 ? `<span class="thought-step-duration">${step.duration}s</span>` : ''}
              <span class="thought-step-status ${step.status}">${statusText}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    el.scrollTop = el.scrollHeight;
  },
};

// ============================================================
// 工具统计管理
// ============================================================
const StatsManager = {
  chart: null,
  intervalId: null,

  init() {
    this.initChart();
    this.requestStats();
    this.intervalId = setInterval(() => this.requestStats(), 10000);

    if (window.electronAPI?.on) {
      window.electronAPI.on('stats-response', (data) => this.handleStatsResponse(data));
    }

    // 窗口卸载/重建时清理定时器与图表实例，防止监听器/定时器累积
    window.addEventListener('pagehide', () => {
      if (this.intervalId) clearInterval(this.intervalId);
      if (this.chart && typeof this.chart.dispose === 'function') this.chart.dispose();
      this.chart = null;
      this.intervalId = null;
    });
  },

  requestStats() {
    window.electronAPI?.sendStatsRequest?.({});
  },

  handleStatsResponse(data) {
    if (data.toolUsage) this.updateChart(data.toolUsage);
    if (data.session) this.updateStats(data.session);
    if (data.data) {
      // data.data 可能是 toolUsage 数组(有 callCount) 或 dailyHistory 数组(有 date)
      if (Array.isArray(data.data) && data.data.length > 0) {
        // 只当是工具统计数据时才更新 chart
        if (data.data[0].callCount !== undefined) {
          this.updateChart(data.data);
        }
      } else if (data.data.totalToolCalls !== undefined) {
        this.updateStats(data.data);
      }
    }
  },

  initChart() {
    const dom = document.getElementById('toolUsageChart');
    if (dom && window.echarts) {
      this.chart = window.echarts.init(dom);
      this.updateChart([]);
      window.addEventListener('resize', () => this.chart?.resize());
    }
  },

  updateChart(data) {
    if (!this.chart) return;

    const categoryMap = {
      file: 'monitor.cat.file',
      web: 'monitor.cat.web',
      system: 'monitor.cat.system',
      browser: 'monitor.cat.browser',
      code: 'monitor.cat.code',
      git: 'Git',
      task: 'monitor.cat.task',
      memory: 'monitor.cat.memory',
      data: 'monitor.cat.data',
      db: 'monitor.cat.db',
      email: 'monitor.cat.email',
      monitor: 'monitor.cat.monitor',
      scheduler: 'monitor.cat.scheduler',
      ocr: 'OCR',
      vision: 'monitor.cat.vision',
      office: 'Office',
    };

    if (!Array.isArray(data)) return;
    this._lastChartData = data;
    const filtered = data.filter((d) => d.callCount > 0);
    const names = filtered.map((d) => {
      const key = categoryMap[d.category];
      if (key && key.indexOf('.') !== -1) return T(key);
      return key || d.category;
    });
    const values = filtered.map((d) => d.callCount);
    const rates = filtered.map((d) => d.successRate);

    this.chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const idx = params[0].dataIndex;
          return `${names[idx]}<br/>${T('monitor.calls')}: ${values[idx]}<br/>${T('monitor.successRate')}: ${rates[idx]}%`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#94a3b8', fontSize: 10, rotate: 30 },
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.05)' } },
      },
      series: [
        {
          type: 'bar',
          data: values.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: `rgba(59, 130, 246, ${0.4 + (rates[idx] / 100) * 0.6})`,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: '60%',
        },
      ],
    });
  },

  updateStats(data) {
    const totalEl = document.getElementById('statTotalCalls');
    const rateEl = document.getElementById('statSuccessRate');
    if (totalEl && data.totalToolCalls !== undefined) totalEl.textContent = data.totalToolCalls;
    if (rateEl && data.totalToolCalls !== undefined) {
      const rate =
        data.totalToolCalls > 0
          ? Math.round(((data.totalToolCalls - (data.failCount || 0)) / data.totalToolCalls) * 100)
          : 0;
      rateEl.textContent = rate + '%';
    }
  },
};

// ============================================================
// 集群管理
// ============================================================
const ClusterManager = {
  init() {
    if (window.electronAPI?.on) {
      window.electronAPI.on('cluster-state', (data) => this.render(data));
    }
  },

  render(data) {
    const clusterList = document.getElementById('clusterList');
    const clusterEmpty = document.querySelector('.cluster-empty');
    const topologyContainer = document.getElementById('clusterTopology');
    if (!clusterList) return;

    const status = data.totalAgents !== undefined ? data : data.data || data;
    this._lastData = data;

    if (!status || !status.agents || status.agents.length === 0) {
      clusterList.innerHTML = '';
      if (clusterEmpty) clusterEmpty.style.display = '';
      if (topologyContainer) topologyContainer.style.display = 'none';
      return;
    }

    if (clusterEmpty) clusterEmpty.style.display = 'none';
    if (topologyContainer) topologyContainer.style.display = 'block';

    this._renderTopology(status.agents);

    const stateIcons = {
      idle: '💤',
      thinking: '🧠',
      tool_executing: '🛠️',
      done: '✅',
      error: '❌',
    };

    clusterList.innerHTML = status.agents
      .map((agent) => {
        const icon = stateIcons[agent.state] || '🤖';
        const timeAgo = agent.lastActiveAt
          ? Math.round((Date.now() - new Date(agent.lastActiveAt).getTime()) / 1000)
          : 0;
        const timeStr =
          timeAgo < 60
            ? T('monitor.secondsAgo', { n: timeAgo })
            : T('monitor.minutesAgo', { n: Math.round(timeAgo / 60) });

        return `
        <div class="cluster-agent-card">
          <div class="cluster-agent-header">
            <span class="cluster-agent-name">${icon} ${SharedUtils.escapeHtml(agent.name)}</span>
            <span class="cluster-agent-state ${agent.state}">${agent.state}</span>
          </div>
          <div class="cluster-agent-details">
            <span class="cluster-agent-detail">
              <span class="cluster-agent-detail-label">Persona:</span>
              <span class="cluster-agent-detail-value">${SharedUtils.escapeHtml(agent.persona)}</span>
            </span>
            <span class="cluster-agent-detail">
              <span class="cluster-agent-detail-label">${T('monitor.tools')}</span>
              <span class="cluster-agent-detail-value">${agent.toolCalls}</span>
            </span>
            <span class="cluster-agent-detail">
              <span class="cluster-agent-detail-label">${T('monitor.iterations')}</span>
              <span class="cluster-agent-detail-value">${agent.iterationCount}</span>
            </span>
          </div>
          <div style="font-size:10px;color:var(--text-muted);display:flex;justify-content:space-between;">
            <span>ID: ${SharedUtils.escapeHtml(agent.id)}</span>
            <span>${timeStr}</span>
          </div>
          ${agent.hasError ? `<div style="font-size:10px;color:#f87171;margin-top:2px;">${T('monitor.errorLabel')} ${SharedUtils.escapeHtml(agent.error)}</div>` : ''}
        </div>
      `;
      })
      .join('');

    clusterList.scrollTop = clusterList.scrollHeight;
  },

  _renderTopology(agents) {
    const canvas = document.getElementById('clusterTopologyCanvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    if (!agents || agents.length === 0) return;

    const radius = Math.min(w, h) * 0.3;
    const nodes = agents.map((agent, i) => {
      const angle = (i / agents.length) * 2 * Math.PI - Math.PI / 2;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        label: agent.name,
        state: agent.state,
        persona: agent.persona,
      };
    });

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 1.5;
    for (const node of nodes) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
    }

    this._drawNode(ctx, cx, cy, T('monitor.mainAgent'), 'center', 28);
    for (const node of nodes) {
      this._drawNode(ctx, node.x, node.y, node.label, node.state, 20);
    }

    const now = Date.now();
    for (const node of nodes) {
      if (node.state === 'thinking' || node.state === 'tool_executing') {
        const pulse = Math.sin(now / 500) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
        ctx.fillStyle =
          node.state === 'thinking'
            ? `rgba(99, 102, 241, ${pulse * 0.3})`
            : `rgba(245, 158, 11, ${pulse * 0.3})`;
        ctx.fill();
      }
    }
  },

  _drawNode(ctx, x, y, label, state, size) {
    const colors = {
      idle: '#6b7280',
      thinking: '#6366f1',
      tool_executing: '#f59e0b',
      done: '#10b981',
      error: '#f87171',
      center: '#6366f1',
    };
    const color = colors[state] || '#6b7280';

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (state !== 'center') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + size / 2 + 4);
  },
};

// ============================================================
// Widget 挂载 - OVERVIEW tab 的 5 个可观测组件
// ============================================================
function initOverviewWidgets() {
  const W = window.WidgetRegistry;
  if (!W) {
    console.warn('[Monitor] WidgetRegistry 未加载');
    return;
  }
  W.mount('statCards', document.getElementById('widgetStatCards'));
  W.mount('tokenRate', document.getElementById('widgetTokenRate'));
  W.mount('ecg', document.getElementById('widgetEcg'));
  W.mount('heatmap', document.getElementById('widgetHeatmap'));
  W.mount('toolRank', document.getElementById('widgetToolRank'));
}

// ============================================================
// Tab 切换 - OVERVIEW / DETAIL
// ============================================================
function initTabSwitch() {
  const tabs = document.querySelectorAll('.widget-tab[data-pane]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.pane;
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.overview-pane, .detail-pane').forEach((pane) => {
        pane.style.display = 'none';
      });
      const target = document.getElementById(targetId);
      if (target) target.style.display = '';
    });
  });
}

// ============================================================
// 应用入口
// ============================================================
function init() {
  console.log('[Monitor] 初始化...');
  initTabSwitch();
  initOverviewWidgets();
  ThoughtManager.init();
  StatsManager.init();
  ClusterManager.init();

  // 语言切换：重绘思维链 / 统计图 / 集群（各管理器缓存最新数据）
  document.addEventListener('cogito:langchange', () => {
    try {
      ThoughtManager.render();
      StatsManager.updateChart(StatsManager._lastChartData || []);
      if (ClusterManager._lastData) ClusterManager.render(ClusterManager._lastData);
    } catch (e) {
      console.error('[Monitor] 语言切换刷新失败:', e);
    }
  });

  console.log('[Monitor] 初始化完成');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
