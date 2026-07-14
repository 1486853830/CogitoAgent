export default {
  Presentation: class {
    constructor() {
      this.slides = [];
    }
    addSlide() {
      return {
        addText: () => {},
        addShape: () => {},
        addImage: () => {}
      };
    }
    writeFile() {
      return Promise.resolve();
    }
  }
};