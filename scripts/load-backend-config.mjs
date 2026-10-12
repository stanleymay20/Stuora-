import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Compile the same pure TypeScript validator used by Expo; never duplicate its rules.
const source = readFileSync(new URL('../src/backend/config.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
export const { validateBackendConfig } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
