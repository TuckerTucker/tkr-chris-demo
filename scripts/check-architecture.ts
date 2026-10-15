import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** An application source module and its static import/export dependencies. */
export interface SourceModule { readonly path: string; readonly text: string }

/** Check the pure-domain and storage boundaries and named application exports. */
export function checkBoundaries(modules: readonly SourceModule[]): string[] {
  const errors: string[] = [];
  for (const module of modules) {
    const file = ts.createSourceFile(module.path, module.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of file.statements) {
      if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        errors.push(`${module.path}: application exports must be named`);
      }
      if (ts.isExportAssignment(statement)) errors.push(`${module.path}: application exports must be named`);
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const resolved = specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(module.path), specifier)) : specifier;
      if (resolved.includes('/__tests__/')) errors.push(`${module.path}: production cannot import test support ${specifier}`);
      if (module.path.startsWith('src/domain/') && !resolved.startsWith('src/domain/')) {
        errors.push(`${module.path}: domain dependency ${specifier} breaks the pure-domain boundary`);
      }
      if (module.path.startsWith('src/storage/') && /^src\/(app|ui)\//.test(resolved)) {
        errors.push(`${module.path}: storage dependency ${specifier} points into the application/UI`);
      }
      if (!module.path.startsWith('src/domain/') && resolved.startsWith('src/domain/') && !/^src\/domain\/index(?:\.[jt]s)?$/.test(resolved)) {
        errors.push(`${module.path}: use the domain barrel instead of ${specifier}`);
      }
    }
  }
  return errors;
}

async function sources(directory: string): Promise<SourceModule[]> {
  const result: SourceModule[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === '__tests__') continue;
    if (entry.isDirectory()) result.push(...await sources(filePath));
    else if (/\.tsx?$/.test(filePath) && !/\.(test|d)\.tsx?$/.test(filePath)) result.push({ path: filePath, text: await readFile(filePath, 'utf8') });
  }
  return result;
}

/** Audit source reachability from the composition root using TypeScript module resolution. */
export function findOrphans(modules: readonly SourceModule[], root: string, options: ts.CompilerOptions): string[] {
  const files = new Map(modules.map((file) => [path.resolve(file.path), file]));
  const seen = new Set<string>();
  function visit(filePath: string): void {
    if (seen.has(filePath)) return;
    seen.add(filePath);
    const file = files.get(filePath);
    if (!file) return;
    const parsed = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function inspect(node: ts.Node): void {
      let name: string | undefined;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) name = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) name = node.arguments[0].text;
      if (name) {
        const resolved = ts.resolveModuleName(name, filePath, options, ts.sys).resolvedModule;
        if (resolved) visit(path.resolve(resolved.resolvedFileName));
      }
      ts.forEachChild(node, inspect);
    }
    inspect(parsed);
  }
  visit(path.resolve(root));
  return modules.filter((file) => !seen.has(path.resolve(file.path))).map((file) => `${file.path}: unreachable from ${root}`);
}

async function main(): Promise<void> {
  const modules = await sources('src');
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const errors = [...checkBoundaries(modules), ...findOrphans(modules, 'src/main.tsx', parsed.options)];
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = errors.length ? 1 : 0;
  if (!errors.length) process.stdout.write(`Architecture: ${modules.length} modules satisfy boundaries, named exports and reachability.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    process.stderr.write(`Architecture check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
