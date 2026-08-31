import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sourcePath = join(root, "index.html");
const distDir = join(root, "dist");
const outputPath = join(distDir, "index.html");

let html = await readFile(sourcePath, "utf8");

const apiBlock = `const API =\n"https://futures-ai-worker.s4112930.workers.dev";`;
const aiFetch = `await fetch(\n      AI_API,\n      {`;

if (!html.includes(apiBlock)) {
  throw new Error("找不到預期的舊 Worker API 設定，停止 staging 建置。\n");
}

if (!html.includes(aiFetch)) {
  throw new Error("找不到預期的 AI fetch 呼叫，停止 staging 建置。\n");
}

html = html.replace(
  apiBlock,
  `const API =\nwindow.location.origin;\n\nconst AI_API =\nAPI + "/api/analyze";`
);

html = html.replace(
  "<title>期貨交易日誌</title>",
  '<meta name="robots" content="noindex,nofollow,noarchive">\n\n<title>期貨交易日誌</title>'
);

if (html.includes("https://futures-ai-worker.s4112930.workers.dev")) {
  throw new Error("staging 輸出仍含舊 Worker URL，停止建置。\n");
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await writeFile(outputPath, html, "utf8");

console.log("staging assets built: dist/index.html");
