export default {
  readFile: () => ({
    Sheets: {},
    SheetNames: [],
  }),
  utils: {
    sheet_to_json: () => [],
    book_new: () => ({ Sheets: {}, SheetNames: [] }),
    aoa_to_sheet: () => ({}),
    book_append_sheet: () => {},
  },
  write: () => Buffer.from('xlsx-mock'),
  writeFile: () => {},
};
