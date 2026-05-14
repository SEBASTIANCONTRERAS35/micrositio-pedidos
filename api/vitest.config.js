module.exports = {
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['routes/**', 'middlewares/**', 'services/**', 'models/**', 'utils/**'],
      exclude: ['node_modules/**', 'tests/**', 'public/**', 'views/**'],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    include: ['tests/unit/**/*.test.js'],
    testTimeout: 10000,
  },
};
