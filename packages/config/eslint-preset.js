/**
 * Shared ESLint preset. Apps extend this via their own .eslintrc.
 * Kept lint-light in Phase 1; tightened in later phases.
 */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'prettier'],
  ignorePatterns: ['node_modules/', '.next/', 'dist/', '.turbo/', 'coverage/'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
