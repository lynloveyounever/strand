import { build } from 'esbuild';
await build({ entryPoints: ['backend/domain/bridge.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'backend/domain/bridge.mjs', sourcemap: false, resolveExtensions: ['.ts', '.tsx', '.js', '.json'] });
