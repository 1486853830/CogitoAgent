/* ============================================================
 *  Widget: ECG Trace — 思考流心电图
 *  横向滚动的折线,波峰完全由真实 thought-trace 事件驱动
 *  Agent 空闲时保持平直滚动(不合成假心跳)
 *  工具调用失败时变红色尖刺
 *  依赖 WS 推送的 thought-trace 事件
 * ============================================================ */

window.WidgetRegistry?.register('ecg', (container) => {
  const state = {
    canvas: null,
    ctx: null,
    data: [], // 采样点 {t: ms, v: number}
    maxPoints: 240, // 大约 60 秒(250ms 一个点)
    intervalId: null, // 衰减 + 重绘循环
    unsubTrace: null, // thought-trace 取消订阅函数
    lastBeat: 0,
    width: 0,
    height: 0,
    langHandler: null,
    resizeHandler: null,
  };

  function setupCanvas() {
    const canvas = container.querySelector('.ecg-canvas');
    if (!canvas) return;
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    if (!state.canvas) return;
    const rect = state.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    state.width = rect.width;
    state.height = rect.height;
    state.canvas.width = rect.width * dpr;
    state.canvas.height = rect.height * dpr;
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(dpr, dpr);
  }

  function pushSample(v) {
    const now = Date.now();
    state.data.push({ t: now, v });
    if (state.data.length > state.maxPoints) state.data.shift();
  }

  function draw() {
    if (!state.ctx) return;
    const { width: w, height: h, ctx } = state;
    ctx.clearRect(0, 0, w, h);

    // 背景网格
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 中线
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (state.data.length < 2) return;

    // 心电图: 计算每个点的 y 坐标
    const step = w / state.maxPoints;
    const centerY = h / 2;

    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(94, 234, 212, 0.6)';
    ctx.strokeStyle = '#5eead4';
    ctx.beginPath();

    state.data.forEach((pt, i) => {
      const x = i * step;
      // v 范围 0-1,转成 ±centerY 的偏移
      const y = centerY - (pt.v - 0.5) * (h * 0.85);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 标记最新点(亮点)
    const lastPt = state.data[state.data.length - 1];
    if (lastPt) {
      const x = (state.data.length - 1) * step;
      const y = centerY - (lastPt.v - 0.5) * (h * 0.85);
      ctx.fillStyle = '#7ff5dd';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(94, 234, 212, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // 触发一次心跳波峰,kind: 'think' | 'tool' | 'fail'
  function beat(kind = 'think') {
    const now = Date.now();
    if (now - state.lastBeat < 200) return;
    state.lastBeat = now;

    // 生成一个波峰序列(QRS-like)
    if (kind === 'fail') {
      // 失败:红色尖刺
      pushSample(0.5);
      pushSample(0.05); // 大下冲
      pushSample(0.95); // 大上冲(红色)
      pushSample(0.5);
    } else if (kind === 'tool') {
      // 工具调用:中波
      pushSample(0.5);
      pushSample(0.7);
      pushSample(0.3);
      pushSample(0.5);
    } else {
      // think cycle:小波(默认心跳)
      pushSample(0.5);
      pushSample(0.6);
      pushSample(0.4);
      pushSample(0.5);
    }
  }

  // 衰减采样——让曲线持续滚动
  function decay() {
    const now = Date.now();
    if (state.data.length === 0) {
      state.data.push({ t: now, v: 0.5 });
      return;
    }
    const last = state.data[state.data.length - 1];
    if (now - last.t > 300) {
      // 一直没新事件,推一个 0.5 的平直值,让滚动继续
      pushSample(0.5);
    }
  }

  function render() {
    container.innerHTML = `
      <div class="widget-card">
        <div class="widget-head">
          <span class="widget-head-mark">▸</span>
          <span class="widget-head-label">THINK ECG</span>
          <span class="widget-head-meta">${window.I18n ? window.I18n.t('widget.realtime') : '实时'}</span>
        </div>
        <div class="ecg-wrap">
          <canvas class="ecg-canvas"></canvas>
          <div class="ecg-legend">
            <span class="ecg-legend-item"><span class="ecg-legend-dot"></span>THINK</span>
            <span class="ecg-legend-item"><span class="ecg-legend-dot amber"></span>TOOL</span>
            <span class="ecg-legend-item"><span class="ecg-legend-dot crimson"></span>FAIL</span>
          </div>
        </div>
      </div>
    `;
    setupCanvas();
  }

  return {
    init() {
      render();
      state.langHandler = render;
      document.addEventListener('cogito:langchange', state.langHandler);
      state.resizeHandler = resize;
      window.addEventListener('resize', state.resizeHandler);
      // 监听 thought-trace 事件——波峰的唯一真实来源
      if (window.electronAPI?.on) {
        const unsub = window.electronAPI.on('thought-trace', (data) => {
          const action = data?.action || data?.type;
          const step = data?.step || {};
          if (action === 'add') {
            if (step.status === 'failed') beat('fail');
            else if (step.name && /tool|execut/i.test(step.name)) beat('tool');
            else beat('think');
          } else if (action === 'update' && step.status === 'failed') {
            beat('fail');
          }
        });
        // preload 的 on() 返回取消订阅函数，销毁时必须调用，否则重复挂载会累积监听器
        if (typeof unsub === 'function') state.unsubTrace = unsub;
      }
      // 衰减 + 重绘循环（Agent 空闲时曲线保持平直滚动，不再合成假心跳）
      state.intervalId = setInterval(() => {
        if (document.hidden) return;
        decay();
        draw();
      }, 250);
    },
    update(data) {
      if (data?.type === 'think') beat('think');
      else if (data?.type === 'tool') beat('tool');
      else if (data?.type === 'fail') beat('fail');
    },
    destroy() {
      if (state.intervalId) clearInterval(state.intervalId);
      if (state.unsubTrace) {
        try {
          state.unsubTrace();
        } catch (e) {
          console.warn('[widget-ecg] 取消 thought-trace 订阅失败:', e);
        }
      }
      if (state.langHandler) document.removeEventListener('cogito:langchange', state.langHandler);
      if (state.resizeHandler) window.removeEventListener('resize', state.resizeHandler);
      state.data = [];
      state.langHandler = null;
      state.resizeHandler = null;
      state.intervalId = null;
      state.unsubTrace = null;
    },
  };
});
