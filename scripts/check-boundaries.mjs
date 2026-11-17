import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { cruise } from 'dependency-cruiser';
import rules from '../.dependency-cruiser.cjs';

const { output } = await cruise(['src'], {
  ...rules.options,
  ruleSet: rules,
  validate: true,
  outputType: 'json',
});
const report = JSON.parse(output);
const violations = report.summary.violations.map(
  ({ rule, from, to, cycle }) =>
    rule.name +
    ': ' +
    [from, ...(cycle?.map(({ name }) => name) ?? [to])].join(' -> '),
);
const modules = new Map();
const clientRoots = [];
const modelRoots = [];
const serverModules = new Set();

for (const { source, dependencies } of report.modules) {
  if (!source.startsWith('src/') || !/\.[cm]?[jt]sx?$/.test(source)) continue;
  const ast = ts.createSourceFile(
    source,
    readFileSync(source, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const runtimeEdges = dependencies.filter(
    (edge) => !edge.dependencyTypes.includes('type-only'),
  );
  modules.set(source, runtimeEdges);
  const directives = [];
  for (const statement of ast.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    )
      break;
    directives.push(statement.expression.text);
  }
  if (directives.includes('use client')) clientRoots.push(source);
  if (/^src\/features\/[^/]+\/model(?:\/|\.ts$)/.test(source))
    modelRoots.push(source);
  if (
    source.startsWith('src/server/') ||
    /(?:\.server|\/server)\.[cm]?[jt]sx?$/.test(source) ||
    directives.includes('use server') ||
    runtimeEdges.some(({ module }) => module === 'server-only')
  ) {
    serverModules.add(source);
  }

  function checkModulePath(node) {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const path = node.arguments[0];
      if (!path || !ts.isStringLiteralLike(path)) {
        const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
        violations.push(
          source + ':' + (line + 1) + ': non-literal module path',
        );
      }
    }
    ts.forEachChild(node, checkModulePath);
  }
  checkModulePath(ast);
}

function trace(root, rule, rejects) {
  const queue = [[root]];
  const visited = new Set([root]);
  for (const path of queue) {
    for (const edge of modules.get(path.at(-1)) ?? []) {
      const next = [...path, edge.resolved];
      if (rejects(edge)) {
        violations.push(rule + ': ' + next.join(' -> '));
        continue;
      }
      if (!visited.has(edge.resolved)) {
        visited.add(edge.resolved);
        queue.push(next);
      }
    }
  }
}

for (const root of clientRoots) {
  trace(
    root,
    'no-client-to-server',
    (edge) => serverModules.has(edge.resolved) || edge.module === 'server-only',
  );
}
for (const root of modelRoots) {
  trace(
    root,
    'pure-model',
    (edge) =>
      edge.coreModule ||
      serverModules.has(edge.resolved) ||
      /^src\/(app\/|features\/[^/]+\/(ui\/|client\.))/.test(edge.resolved) ||
      /^(react|react-dom|next|openapi-fetch|axios|undici)(\/|$)/.test(
        edge.module,
      ),
  );
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'No architecture violations (' + modules.size + ' source modules checked)',
  );
}
