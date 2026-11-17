module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'resolve-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'shared-is-independent',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(app|features|server|i18n|mocks)/' },
    },
    {
      name: 'features-do-not-import-composition',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/(app|server|i18n|mocks)/' },
    },
    {
      name: 'no-cross-feature',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'feature-public-entries',
      severity: 'error',
      from: { path: '^src/(app|server)/' },
      to: {
        path: '^src/features/',
        pathNot: '^src/features/[^/]+/(client|server|model)\\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
