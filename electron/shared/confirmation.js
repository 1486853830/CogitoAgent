/* ============================================================
 *  ConfirmationManager - 公共危险操作确认组件
 *  适用于所有 Electron 渲染进程页面
 *  用法:
 *    window.electronAPI?.onConfirmationRequest((data) =>
 *      ConfirmationManager.show(data)
 *    );
 *    window.electronAPI?.onConfirmationResolved((data) =>
 *      ConfirmationManager.dismiss(data)
 *    );
 * ============================================================ */

(function () {
  let el = null;
  let active = false;

  const TAG = `[ConfirmationManager]`;

  // 多语言助手：confirmation.js 优先使用 window.I18n，缺失时回退到中文字面量。
  function t(key, zhFallback) {
    if (window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t(key);
    }
    return zhFallback;
  }

  function injectStyles() {
    if (document.getElementById('confirmation-styles')) return;
    const style = document.createElement('style');
    style.id = 'confirmation-styles';
    style.textContent = `
      .confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(2, 4, 8, 0.78);
        backdrop-filter: blur(6px);
        opacity: 0;
        transition: opacity 0.18s ease;
      }
      .confirm-overlay.confirm-visible { opacity: 1; }
      .confirm-box {
        position: relative;
        overflow: hidden;
        width: min(560px, 90vw);
        max-height: 82vh;
        background: linear-gradient(180deg, var(--panel-2) 0%, var(--panel) 100%);
        color: var(--type);
        border: 1px solid var(--line-strong);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-elevated), 0 0 0 1px var(--line-phosphor);
        padding: 18px 20px 16px;
        font-family: var(--font-sans);
        transform: translateY(8px);
        transition: transform 0.2s var(--ease-out);
      }
      .confirm-box::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, var(--phosphor) 50%, transparent 100%);
        opacity: 0.45;
        pointer-events: none;
      }
      .confirm-overlay.confirm-visible .confirm-box { transform: translateY(0); }
      .confirm-eyebrow {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: 500;
        letter-spacing: var(--tracking-widest);
        text-transform: uppercase;
        color: var(--crimson);
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .confirm-eyebrow::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--line-phosphor);
        opacity: 0.5;
      }
      .confirm-title {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: var(--text-lg);
        font-weight: 600;
        color: var(--type-bright);
        letter-spacing: var(--tracking-tight);
        margin: 0 0 8px;
      }
      .confirm-title .confirm-icon {
        width: 20px;
        height: 20px;
        color: var(--crimson);
        flex: none;
        margin-top: 1px;
        filter: drop-shadow(0 0 6px rgba(248, 113, 113, 0.4));
      }
      .confirm-hint {
        font-size: var(--text-base);
        line-height: 1.6;
        color: var(--type);
        margin: 0 0 12px;
        word-break: break-word;
      }
      .confirm-args {
        background: var(--panel-recessed);
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        color: var(--silver);
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 180px;
        overflow: auto;
        margin: 0 0 18px;
        box-shadow: inset 0 1px 0 var(--line-top);
      }
      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .confirm-btn {
        border-radius: var(--radius-md);
        padding: 9px 18px;
        font-size: var(--text-base);
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s var(--ease), border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
      }
      .confirm-btn-cancel {
        background: var(--panel-3);
        color: var(--type);
        border: 1px solid var(--line-strong);
      }
      .confirm-btn-cancel:hover { background: var(--panel-elevated); }
      .confirm-btn-confirm {
        background: var(--crimson-dim);
        color: #fff;
        border: 1px solid var(--crimson-dim);
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.25);
      }
      .confirm-btn-confirm:hover {
        background: var(--crimson);
        border-color: var(--crimson);
        box-shadow: 0 0 18px rgba(248, 113, 113, 0.35);
      }
      .confirm-btn:active { filter: brightness(0.92); }
    `;
    document.head.appendChild(style);
  }

  function buildHtml(data) {
    const hint =
      (data && data.hint) || (data && data.toolName) || t('confirm.defaultHint', '危险操作');
    const args = (data && data.args) || t('confirm.noArgs', '(无参数)');
    return `
      <div class="confirm-box" role="dialog" aria-modal="true">
        <div class="confirm-eyebrow">${t('confirm.eyebrow', '危险操作')}</div>
        <div class="confirm-title">
          <svg class="confirm-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/>
          </svg>
          <span>${t('confirm.title', '确认执行危险操作？')}</span>
        </div>
        <p class="confirm-hint">${SharedUtils.escapeHtml(hint)}</p>
        <div class="confirm-args">${SharedUtils.escapeHtml(args)}</div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel" data-action="cancel">${t('common.cancel', '取消')}</button>
          <button class="confirm-btn confirm-btn-confirm" data-action="confirm">${t('confirm.allow', '允许执行')}</button>
        </div>
      </div>
    `;
  }

  function respond(confirmed) {
    const api = window.electronAPI;
    if (api && typeof api.respondConfirmation === 'function') {
      api.respondConfirmation(confirmed);
    } else {
      console.warn(TAG, 'electronAPI 未暴露 respondConfirmation，无法回传确认结果。');
    }
  }

  function dismiss() {
    // 后端已允许 / 拒绝 / 超时：无论哪种结果都关闭确认框。
    close();
  }

  function close() {
    if (!el) return;
    const overlay = el;
    el = null;
    active = false;
    overlay.classList.remove('confirm-visible');
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);
  }

  function show(data) {
    injectStyles();
    if (el) close();
    el = document.createElement('div');
    el.className = 'confirm-overlay';
    el.innerHTML = buildHtml(data);
    el.addEventListener('click', (e) => {
      const action = e.target && e.target.getAttribute && e.target.getAttribute('data-action');
      if (action === 'confirm') respond(true);
      else if (action === 'cancel') respond(false);
    });
    document.body.appendChild(el);
    active = true;
    requestAnimationFrame(() => el.classList.add('confirm-visible'));
    // 切换语言时重绘确认框文案
    if (!window.__cogitoConfirmationLangListener) {
      window.__cogitoConfirmationLangListener = true;
      document.addEventListener('cogito:langchange', () => {
        if (active && el) {
          const next = document.createElement('div');
          next.className = 'confirm-overlay confirm-visible';
          next.innerHTML = buildHtml(window.__cogitoConfirmationData || null);
          next.addEventListener('click', (ev) => {
            const action =
              ev.target && ev.target.getAttribute && ev.target.getAttribute('data-action');
            if (action === 'confirm') respond(true);
            else if (action === 'cancel') respond(false);
          });
          if (el.parentNode) el.parentNode.replaceChild(next, el);
          el = next;
        }
      });
    }
    window.__cogitoConfirmationData = data || null;
  }

  window.ConfirmationManager = { show, dismiss, respond };
})();
