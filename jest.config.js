module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { diagnostics: false }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(css-select|css-what|boolbase|domhandler|domutils|dom-serializer|entities|nth-check|domelementtype)/)',
  ],
  testMatch: ['**/tests/**/*.test.ts'],
}
