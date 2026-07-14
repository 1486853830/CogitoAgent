export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 60000,
  forceExit: true,
  detectOpenHandles: true,
  moduleNameMapper: {
    '^pptxgenjs$': '<rootDir>/tests/mocks/pptxgenjs.js',
    '^docx$': '<rootDir>/tests/mocks/docx.js',
    '^xlsx$': '<rootDir>/tests/mocks/xlsx.js'
  }
};