/* ============================================================
 *  Shared Utils - 公共工具函数库
 *  适用于 desktop 和 dashboard 两种模式
 * ============================================================ */

const SharedUtils = {
  renderMarkdown(text) {
    // 默认自动消毒：marked.parse() 返回原始 HTML，上游若忘记消毒会形成 XSS。
    // 调用方无需再单独 sanitizeHtml。
    const raw = window.marked
      ? marked.parse(text, { breaks: true, gfm: true })
      : text.replace(/\n/g, '<br>');
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw);
    }
    const div = document.createElement('div');
    div.textContent = raw;
    return div.innerHTML;
  },

  sanitizeHtml(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html);
    }
    // DOMPurify 不可用时不能直接返回原始 html——上游若把 AI 输出或用户输入
    // 直接拼接进 innerHTML 会形成 XSS。回退到全量 HTML 转义，仅保留文本语义。
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  },

  filterToolBlocks(text) {
    return text
      .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
      .replace(/\[TOOL\][\s\S]*$/, '')
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
    const lng = window.I18n ? window.I18n.get() : 'zh-CN';
    return new Date().toLocaleTimeString(lng === 'zh' ? 'zh-CN' : lng, {
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  formatArgs(args) {
    if (Array.isArray(args)) {
      return args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(', ');
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
