/* ============================================================
 *  WindowControls - 公共窗口控制按钮组件
 *  自动绑定最小化 / 最大化 / 关闭按钮
 *  用法: WindowControls.init({ minimizeId, maximizeId, closeId })
 * ============================================================ */

const WindowControls = {
  init(options = {}) {
    const btnMin = options.minimizeId
      ? document.getElementById(options.minimizeId)
      : document.getElementById('btnMinimize');
    const btnMax = options.maximizeId
      ? document.getElementById(options.maximizeId)
      : document.getElementById('btnMaximize');
    const btnClose = options.closeId
      ? document.getElementById(options.closeId)
      : document.getElementById('btnClose');

    if (btnMin) {
      btnMin.addEventListener('click', () => {
        window.electronAPI?.minimizeWindow();
      });
    }

    if (btnMax) {
      btnMax.addEventListener('click', () => {
        window.electronAPI?.maximizeWindow();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        window.electronAPI?.closeWindow();
      });
    }

    console.log('[WindowControls] 初始化完成');
  },
};

window.WindowControls = WindowControls;
