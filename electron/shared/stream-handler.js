/* ============================================================
 *  StreamReplyHandler - 公共流式回复处理器
 *  统一处理 agent-reply 的各种 type: chunk / tool-start / tool-result / end / error / user
 *  通过回调让调用方自定义 UI 渲染，避免各页面重复实现
 *
 *  用法:
 *    const handler = StreamReplyHandler.create({
 *      renderMessage: (type, content, extra) => { ... return bubbleEl },
 *      addToolCall: (toolName, args) => { ... },
 *      addToolResult: (toolName, data, success) => { ... },
 *      onStart: () => { ... },
 *      onEnd: (nextAction) => { ... },
 *      onError: (message) => { ... },
 *      scrollToBottom: () => { ... }
 *    });
 *    window.electronAPI.onReply(data => handler.handle(data));
 * ============================================================ */

const StreamReplyHandler = {
  create(options = {}) {
    const state = {
      currentBubble: null,
      isProcessing: false,
      lastToolKey: '',
    };

    return {
      handle(data) {
        switch (data.type) {
          case 'user':
            options.renderMessage?.('user', data.content);
            this._setProcessing(true);
            break;

          case 'chunk': {
            const fullText = data.full || data.content;
            const filtered = options.filterToolBlocks
              ? options.filterToolBlocks(fullText)
              : this._defaultFilterToolBlocks(fullText);
            if (!filtered) break;

            if (!state.currentBubble) {
              state.currentBubble = options.renderMessage?.('assistant', filtered, { isHtml: true });
            } else {
              options.updateMessage?.(state.currentBubble, filtered);
            }
            options.scrollToBottom?.();
            break;
          }

          case 'tool-start': {
            const toolKey = `${data.tool}:${JSON.stringify(data.args)}`;
            if (toolKey === state.lastToolKey) break;
            state.lastToolKey = toolKey;
            setTimeout(() => {
              if (state.lastToolKey === toolKey) state.lastToolKey = '';
            }, 500);

            // 清理空的助手气泡
            if (state.currentBubble) {
              const bubble = options.getBubbleElement?.(state.currentBubble);
              if (bubble && !bubble.textContent?.trim()) {
                options.removeMessage?.(state.currentBubble);
              }
            }
            state.currentBubble = null;
            options.addToolCall?.(data.tool, data.args);
            break;
          }

          case 'tool-result':
            options.addToolResult?.(data.tool, data.data, data.success);
            break;

          case 'end':
            if (state.currentBubble) {
              options.removeTypingCursor?.(state.currentBubble);
            }
            state.currentBubble = null;
            this._setProcessing(false);
            const nextAction = data.nextAction || 'wait';
            options.onEnd?.(nextAction);
            break;

          case 'error':
            if (state.currentBubble) {
              options.removeTypingCursor?.(state.currentBubble);
            }
            state.currentBubble = null;
            options.renderMessage?.('assistant', `⚠️ ${data.message}`, { className: 'error' });
            this._setProcessing(false);
            options.onError?.(data.message);
            break;
        }
      },

      reset() {
        state.currentBubble = null;
        state.isProcessing = false;
        state.lastToolKey = '';
      },

      isProcessing() {
        return state.isProcessing;
      },

      _setProcessing(val) {
        state.isProcessing = val;
        options.onProcessingChange?.(val);
      },

      _defaultFilterToolBlocks(text) {
        return text
          // 先移除完整的 [TOOL]...[/TOOL] 块
          .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
          // 再移除未闭合的 [TOOL] 标签（流式传输中尚未收到 [/TOOL]）
          .replace(/\[TOOL\][\s\S]*$/, '')
          .replace(/^\[工具结果\]:.*$/gm, '')
          .replace(/^\[工具错误\]:.*$/gm, '')
          .replace(/\n```\n/g, '\n')
          .trim();
      },
    };
  },
};

window.StreamReplyHandler = StreamReplyHandler;
