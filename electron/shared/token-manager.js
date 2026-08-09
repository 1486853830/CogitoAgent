/* ============================================================
 *  TokenManager - 公共 Token 用量监控组件
 *  监听 WS 推送的 token-usage 事件，支持主动拉取
 *  用法:
 *    TokenManager.init({
 *      todayEl: document.getElementById('tokenToday'),
 *      totalEl: document.getElementById('tokenTotal'),
 *      detailEl: document.getElementById('tokenDetail'),
 *      panelEl: document.getElementById('tokenPanel'),
 *      requestOnLoad: true
 *    });
 * ============================================================ */

const TokenManager = {
  todayEl: null,
  totalEl: null,
  detailEl: null,
  panelEl: null,

  init(options = {}) {
    this.todayEl = options.todayEl || document.getElementById('tokenToday');
    this.totalEl = options.totalEl || document.getElementById('tokenTotal');
    this.detailEl = options.detailEl || document.getElementById('tokenDetail');
    this.panelEl = options.panelEl || document.getElementById('tokenPanel');

    // 监听 WS 推送的 token 用量
    if (window.electronAPI?.onTokenUsage) {
      window.electronAPI.onTokenUsage((data) => this.update(data));
    }

    // 启动时主动拉取一次
    if (options.requestOnLoad !== false) {
      this._requestInitial();
    }

    console.log('[TokenManager] 初始化完成');
  },

  async _requestInitial() {
    try {
      if (window.electronAPI?.sendStatsRequest) {
        window.electronAPI.sendStatsRequest({ type: 'tokens' });
      }
      // 防止重复注册：页面热重载或多次调用 init() 时，先移除旧监听器，
      // 避免 N 次重载后每个 stats-response 被 N 个 handler 重复处理。
      if (window.electronAPI?.off) {
        window.electronAPI.off('stats-response', this._statsHandler);
      }
      this._statsHandler =
        this._statsHandler ||
        ((msg) => {
          const payload = msg?.data || msg?.payload;
          if (payload && (payload.totalTokens !== undefined || payload.todayTokens !== undefined)) {
            this.update(payload);
          }
        });
      if (window.electronAPI?.on) {
        window.electronAPI.on('stats-response', this._statsHandler);
      }
    } catch (e) {
      console.warn('[TokenManager] 初始拉取失败:', e);
    }
  },

  formatNum(n) {
    return window.SharedUtils?.formatNumCompact?.(n) ?? String(Number(n) || 0);
  },

  update(data) {
    if (!data) return;
    // WS 推送格式：{ input, output, total, session: {...sessionStats} }
    // stats-response 格式：{ totalInputTokens, todayTokens, ... }
    const s = data.session || data;

    const today = Number(s.todayTokens) || 0;
    const total = Number(s.totalTokens) || 0;
    const todayIn = Number(s.todayInputTokens) || 0;
    const todayOut = Number(s.todayOutputTokens) || 0;

    if (this.todayEl) this.todayEl.textContent = this.formatNum(today);
    if (this.totalEl) this.totalEl.textContent = this.formatNum(total);
    if (this.detailEl) {
      this.detailEl.textContent = `输入 ${this.formatNum(todayIn)} / 输出 ${this.formatNum(todayOut)}`;
    }

    // 本轮用量闪烁提示（仅 WS 推送时触发）
    if (data.input !== undefined && data.output !== undefined && this.panelEl) {
      this.panelEl.classList.add('token-flash');
      setTimeout(() => this.panelEl.classList.remove('token-flash'), 800);
    }
  },
};

window.TokenManager = TokenManager;
