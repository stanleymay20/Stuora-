import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Compile the same pure TypeScript rules the app uses for its legal pages.
const source = readFileSync(new URL('../src/legal/operator.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
export const { assertLegalReady, readOperatorConfig } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
