import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** A forbidden executable mocking construct, located for actionable CLI output. */
export interface MockHit {
  readonly path: string;
  readonly line: number;
  readonly construct: string;
}

const methods = new Set(['mock', 'doMock', 'spyOn', 'fn', 'setMock', 'unstable_mockModule', 'createMockFromModule', 'stubGlobal', 'stubEnv']);
const nodeMethods = new Set(['module', 'fn', 'method', 'getter', 'setter']);

function importedModule(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isImportDeclaration(current)) current = current.parent;
  return current && ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)
    ? current.moduleSpecifier.text : undefined;
}

function canonical(value: string): string {
  return value.replace(/^vitest\.(?:vi|vitest)/, 'vi').replace(/^@jest\/globals\.jest/, 'jest');
}

/** Parse executable syntax and resolve imported/destructured aliases without executing source. */
export function findMocks(files: ReadonlyArray<{ path: string; text: string }>): MockHit[] {
  const hits: MockHit[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true,
      /\.[jt]sx$/.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const host = ts.createCompilerHost({});
    host.getSourceFile = (name) => name === file.path ? source : undefined;
    const program = ts.createProgram([file.path], { noResolve: true, noLib: true }, host);
    const checker = program.getTypeChecker();

    function resolve(node: ts.Node, visited = new Set<ts.Node>()): string | undefined {
      if (visited.has(node)) return undefined;
      visited.add(node);
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
        return resolve(node.expression, visited);
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const parent = resolve(node.expression, visited);
        const property = ts.isPropertyAccessExpression(node) ? node.name.text
          : ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
        return parent && property ? canonical(`${parent}.${property}`) : undefined;
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const argument = node.arguments[0];
        return argument && ts.isStringLiteral(argument) ? argument.text : undefined;
      }
      if (!ts.isIdentifier(node)) return undefined;
      const declarations = checker.getSymbolAtLocation(node)?.declarations;
      if (!declarations?.length) {
        return ['vi', 'jest'].includes(node.text) ? node.text : node.text === 'mock' ? 'node:test.mock' : undefined;
      }
      const declaration = declarations[0];
      if (!declaration) return undefined;
      if (ts.isImportSpecifier(declaration)) {
        const module = importedModule(declaration);
        return module ? canonical(`${module}.${(declaration.propertyName ?? declaration.name).text}`) : undefined;
      }
      if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) return importedModule(declaration);
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) return resolve(declaration.initializer, visited);
      if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
        const container = declaration.parent.parent;
        if (ts.isVariableDeclaration(container) && container.initializer) {
          const base = resolve(container.initializer, visited);
          const name = declaration.propertyName ?? declaration.name;
          return base && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? canonical(`${base}.${name.text}`) : undefined;
        }
      }
      return undefined;
    }

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const binding = resolve(node.expression);
        const match = binding && /^(vi|jest|vitest|@jest\/globals|(?:node|bun):test\.mock)\.([\w]+)$/.exec(binding);
        if (match?.[1] && match[2] && (match[1].endsWith(':test.mock') ? nodeMethods : methods).has(match[2])) {
          hits.push({ path: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            construct: node.expression.getText(source) });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return hits;
}

async function sourceFiles(directory: string): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '.vitest', 'vendor', 'generated'].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filePath));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push({ path: filePath, text: await readFile(filePath, 'utf8') });
  }
  return files;
}

async function main(): Promise<void> {
  const files = (await Promise.all(['src', 'scripts', 'e2e'].map(sourceFiles))).flat();
  const hits = findMocks(files);
  for (const hit of hits) process.stderr.write(`${hit.path}:${hit.line} ${hit.construct}\n`);
  if (hits.length) process.exitCode = 1;
  else process.stdout.write(`No executable mocking constructs found in ${files.length} source files.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    process.stderr.write(`Mock guard failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
