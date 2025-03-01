import * as esbuild from "esbuild";
import { writeFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log("Build script started");

// 确保dist目录存在
await mkdir("./dist", { recursive: true });
console.log("Created dist directory");

// 构建bundle.js
console.log("Building bundle.js...");
await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "./dist/bundle.js",
  target: "node18",
  banner: {
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`,
  },
});
console.log("bundle.js built successfully");

// 构建config.js
console.log("Building config.js...");
await esbuild.build({
  entryPoints: ["./src/config.ts"],
  bundle: false,
  platform: "node",
  format: "esm",
  outdir: "./dist",
  target: "node18",
});
console.log("config.js built successfully");

// 构建logger.js
console.log("Building logger.js...");
await esbuild.build({
  entryPoints: ["./src/logger.ts"],
  bundle: false,
  platform: "node",
  format: "esm",
  outdir: "./dist",
  target: "node18",
});
console.log("logger.js built successfully");

// 构建index.js (导出OpenAPIMCPServer类)
console.log("Building index.js...");
await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: false,
  platform: "node",
  format: "esm",
  outdir: "./dist",
  target: "node18",
});
console.log("index.js built successfully");

// 创建index.js导出文件
const indexContent = `
console.log("Loading dist/index.js");
export { OpenAPIMCPServer } from './bundle.js';
export { getConfig, parseEnvironmentDefaults } from './config.js';
export { log, logToFile } from './logger.js';
console.log("dist/index.js loaded successfully");
`;

await writeFile("./dist/index.js", indexContent);
console.log("Created index.js export file");

console.log("Build completed successfully!");
