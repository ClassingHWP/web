// 보기 패키지(@classinghwp/viewer)를 만든다. 결과는 build/viewer 다.
//
//   index.js        createViewer, DEFAULT_FONTS (번들러·브라우저 ESM)
//   react.js        <HwpViewer> ("use client")
//   viewer.css      보기 화면 모양
//   engine/         코어 워커와 WASM(글루·wasm·data). 쓰는 쪽 서버에 그대로 올린다(기본 /chwp/).
//
// 엔진은 쓰는 쪽 번들러가 손대지 않게 따로 둔다. 스레드 워커가 같은 출처에서만 뜨므로 엔진은 제 서버에 있어야 한다.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { buildDir, coreDir, wasmDir, webDir } from "./paths.mjs";

const src = path.join(webDir, "src");
const out = path.join(buildDir, "viewer");
const engineOut = path.join(out, "engine");

// WASM 글루의 eval(new Function)을 뺀다. 앱 빌드와 같은 글루를 쓴다.
const patched = spawnSync(process.execPath, [path.join(webDir, "patch-embind-eval.mjs")], { stdio: "inherit" });
if (patched.status !== 0) process.exit(patched.status || 1);

// 1. 보기와 React 감싸개. 앱 빌드의 워커 대신 엔진 폴더의 워커를 띄운다.
await build({
  configFile: false,
  root: webDir,
  publicDir: false,
  logLevel: "warn",
  plugins: [react()],
  resolve: {
    alias: [{ find: /^\.\/default-worker\.js$/, replacement: path.join(src, "default-worker-lib.js") }],
  },
  build: {
    outDir: out,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: { index: path.join(src, "viewer.js"), react: path.join(src, "react", "HwpViewer.jsx") },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: { chunkFileNames: "[name].js" },
    },
  },
});

// 2. 코어 워커. 엔진 파일은 워커와 같은 폴더에서 읽는다(engine-url.js).
await build({
  configFile: false,
  root: webDir,
  publicDir: false,
  logLevel: "warn",
  resolve: {
    alias: [{ find: /^\.\/engine\.js$/, replacement: path.join(src, "engine-url.js") }],
  },
  build: {
    outDir: engineOut,
    emptyOutDir: false,
    minify: true,
    lib: { entry: path.join(src, "core-worker-boot.js"), formats: ["es"], fileName: () => "core-worker-boot.js" },
    rollupOptions: { output: { chunkFileNames: "[name].js" } },
  },
});

mkdirSync(engineOut, { recursive: true });
for (const name of ["chwp.mjs", "chwp.wasm", "chwp-single.mjs", "chwp-single.wasm"]) {
  const from = path.join(wasmDir, name);
  if (!existsSync(from)) throw new Error(`엔진 파일이 없다: ${from} (WASM 을 먼저 빌드한다)`);
  copyFileSync(from, path.join(engineOut, name));
}
copyFileSync(path.join(src, "viewer.css"), path.join(out, "viewer.css"));
for (const name of ["LICENSE", "LICENSE.ko.md", "THIRD_PARTY_NOTICES.md"]) {
  const from = [path.join(webDir, name), path.join(coreDir, name)].find((file) => existsSync(file));
  if (from) writeFileSync(path.join(out, name), readFileSync(from));
}

const app = JSON.parse(readFileSync(path.join(webDir, "package.json"), "utf8"));
const pkg = {
  name: "@classinghwp/viewer",
  version: app.version,
  description: "한글 문서(.hwp, .hwpx)를 웹 페이지 안에서 보여 주는 보기와 React 컴포넌트",
  type: "module",
  main: "./index.js",
  exports: {
    ".": "./index.js",
    "./react": "./react.js",
    "./viewer.css": "./viewer.css",
    "./engine/*": "./engine/*",
  },
  sideEffects: ["*.css"],
  peerDependencies: { react: ">=18" },
  peerDependenciesMeta: { react: { optional: true } },
  license: "SEE LICENSE IN LICENSE",
};
writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
copyFileSync(path.join(webDir, "viewer-package.md"), path.join(out, "README.md"));
console.log(`보기 패키지: ${out}`);
