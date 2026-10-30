module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-independent',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(app|features|server)/' },
    },
    {
      name: 'features-do-not-import-composition',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/(app|server)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
