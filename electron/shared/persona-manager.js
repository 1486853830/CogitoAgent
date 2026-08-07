/* ============================================================
 *  PersonaManager - 公共 Persona 形象管理模块
 *  适用于 desktop 和 dashboard 两种模式
 * ============================================================ */

const PersonaManager = {
  containerEl: null,
  defaultMediaPath: '',
  currentMedia: null,

  init(options = {}) {
    const {
      containerSelector = '.character',
      containerEl = null,
      defaultMediaPath = '../shared/video.mp4',
      autoLoad = true,
    } = options;

    this.containerEl = containerEl || document.querySelector(containerSelector);
    this.defaultMediaPath = defaultMediaPath;

    if (!this.containerEl) {
      console.warn('[PersonaManager] 未找到容器元素');
      return false;
    }

    if (autoLoad) {
      this.loadPersonaMedia();
    }

    console.log('[PersonaManager] 初始化完成');
    return true;
  },

  async loadPersonaMedia() {
    try {
      const media = await window.electronAPI.getPersonaMedia();
      this.currentMedia = media;
      this._renderMedia(media);
    } catch (e) {
      console.error('[PersonaManager] 加载 persona 媒体失败:', e);
      this.loadDefaultMedia();
    }
  },

  loadDefaultMedia() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = '';
    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.src = this.defaultMediaPath;
    this.containerEl.appendChild(video);
  },

  _renderMedia(media) {
    if (!this.containerEl) return;

    this.containerEl.innerHTML = '';

    const mediaPath = media.path === 'default' ? this.defaultMediaPath : media.path;

    if (media.type === 'image') {
      const img = document.createElement('img');
      img.src = mediaPath;
      img.alt = 'Persona Image';
      this.containerEl.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.src = mediaPath;
      this.containerEl.appendChild(video);
    }
  },

  getContainer() {
    return this.containerEl;
  },
};

window.PersonaManager = PersonaManager;
