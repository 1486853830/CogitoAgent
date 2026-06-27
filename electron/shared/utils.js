/* ============================================================
 *  Shared Utils - 公共工具函数库
 *  适用于 desktop 和 dashboard 两种模式
 * ============================================================ */

const SharedUtils = {
  renderMarkdown(text) {
    if (window.marked) {
      return marked.parse(text, { breaks: true, gfm: true });
    }
    return text.replace(/\n/g, '<br>');
  },

  sanitizeHtml(html) {
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  },

  filterToolBlocks(text) {
    return text
      .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
      .replace(/^\[工具结果\]:.*$/gm, '')
      .replace(/^\[工具错误\]:.*$/gm, '')
      .replace(/\n```\n/g, '\n')
      .trim();
  },

  scrollToBottom(element) {
    setTimeout(() => {
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }, 50);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatTime() {
    return new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  formatArgs(args) {
    if (Array.isArray(args)) {
      return args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(', ');
    }
    if (typeof args === 'object' && args !== null) {
      return Object.entries(args)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');
    }
    return String(args);
  },

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  },
};

window.SharedUtils = SharedUtils;
