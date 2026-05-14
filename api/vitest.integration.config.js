module.exports = {
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    testTimeout: 60000, // testcontainers tarda en levantar
    hookTimeout: 60000,
  },
};
