import { htmlUiModules } from './tools/htmlui-art.mjs';
export default { plugins: [htmlUiModules(import.meta.dirname)], test: { include: ['tests/**/*.test.ts'], environment: 'node', maxWorkers: 2, minWorkers: 1 } };
