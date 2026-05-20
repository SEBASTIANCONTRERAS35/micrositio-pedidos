module.exports = {
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['jobs/**', 'services/**', 'utils/**'],
      exclude: ['node_modules/**', 'tests/**'],
    },
    include: ['tests/unit/**/*.test.js'],
    testTimeout: 10000,
  },
};
