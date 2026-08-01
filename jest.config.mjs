export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json', useESM: true }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!sql\\.js|@pawastation)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs'],
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 50, functions: 60, lines: 60, statements: 60 }
  },
  verbose: true,
  testTimeout: 60000,
  forceExit: true,
  detectOpenHandles: true,
  moduleNameMapper: {
    '^(\\.{1,2}/src/.*)\\.js$': '$1.ts',
    '^pptxgenjs$': '<rootDir>/tests/mocks/pptxgenjs.js',
    '^docx$': '<rootDir>/tests/mocks/docx.js',
    '^xlsx$': '<rootDir>/tests/mocks/xlsx.js'
  }
};
