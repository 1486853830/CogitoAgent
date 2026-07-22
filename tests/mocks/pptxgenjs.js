class Presentation {
  constructor() {
    this.slides = [];
  }
  addSlide() {
    return {
      addText: () => {},
      addShape: () => {},
      addImage: () => {},
    };
  }
  writeFile() {
    return Promise.resolve();
  }
}

const pptxgen = Presentation;
pptxgen.Presentation = Presentation;

export default pptxgen;
