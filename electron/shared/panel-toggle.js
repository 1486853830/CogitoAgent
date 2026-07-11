/* ============================================================
 *  PanelToggle - 公共面板折叠/展开组件
 *  支持多个面板，自动绑定点击事件和箭头旋转
 *  用法: PanelToggle.init([{ btnId: 'xxx', bodyId: 'yyy' }])
 * ============================================================ */

const PanelToggle = {
  /**
   * 初始化面板折叠切换
   * @param {Array} panels - [{ btnId, bodyId, arrowSelector? }]
   */
  init(panels) {
    if (!panels || !Array.isArray(panels)) return;

    panels.forEach(({ btnId, bodyId, arrowSelector }) => {
      const btn = document.getElementById(btnId);
      const body = document.getElementById(bodyId);
      if (!btn || !body) return;

      btn.addEventListener('click', () => {
        const collapsed = body.classList.toggle('collapsed');
        this._updateArrow(btn, arrowSelector, collapsed);
      });
    });

    console.log('[PanelToggle] 初始化完成，面板数量:', panels.length);
  },

  _updateArrow(btn, selector, collapsed) {
    const svgPath = selector
      ? btn.querySelector(selector)
      : btn.querySelector('svg path');
    if (!svgPath) return;

    if (collapsed) {
      svgPath.setAttribute('d', 'M12 8l6 6 1.41-1.41L12 5.17 4.59 12.59 6 14z');
    } else {
      svgPath.setAttribute('d', 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z');
    }
  },
};

window.PanelToggle = PanelToggle;
