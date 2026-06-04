module.exports = {
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
};
