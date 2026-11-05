import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { buildDir, coreDir, wasmDir, webDir } from "./paths.mjs";
function cleanWebAssets() {
  return {
    name: "clean-web-assets",
    apply: "build",
    buildStart() {
      const dir = path.join(buildDir, "web");
      for (const name of ["assets", "index.html"]) {
        rmSync(path.join(dir, name), { recursive: true, force: true });
      }
    },
  };
}

function quietNodeBuiltins() {
  return {
    name: "quiet-node-builtins",
    apply: "build",
    configResolved(config) {
      const warn = config.logger.warn.bind(config.logger);
      config.logger.warn = (msg, options) => {
        const text = typeof msg === "string" ? msg : "";
        // wasm 글루는 노드에서도 뜨도록 node: 모듈을 동적 import 한다. 브라우저 번들은 그걸 빼므로 경고가 아니다.
        if (text.includes("has been externalized for browser compatibility")) return;
        warn(msg, options);
      };
    },
  };
}

// VITE_FONT_BASE 가 다른 서버면 화면 글꼴 CSS 의 /fonts/ 주소도 그쪽으로 바꿔 app.css 안에 넣는다.
function fontBaseCss(fontBase) {
  const imported = "@import \"../public/fonts/noto-sans-kr/noto-sans-kr.css\";";
  return {
    name: "font-base-css",
    enforce: "pre",
    transform(code, id) {
      if (fontBase === "/fonts/" || !id.split("?")[0].endsWith("/src/app.css") || !code.includes(imported)) return null;
      const css = readFileSync(path.join(webDir, "public", "fonts", "noto-sans-kr", "noto-sans-kr.css"), "utf8");
      return code.replace(imported, css.replaceAll("url(/fonts/", "url(" + fontBase));
    },
  };
}

// 스레드 wasm 은 교차 출처 격리가 있어야 돈다. WebKit(사파리, iOS 의 모든 브라우저)은 COEP credentialless 를 몰라
// 격리가 켜지지 않으므로 require-corp 를 쓴다. 다른 출처 자원(VITE_FONT_BASE 의 글꼴 서버 등)은 CORP·CORS 를 보내야 한다.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Document-Isolation-Policy": "isolate-and-require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

// 자체 서명 인증서(.preview-cert)가 있을 때만 https 로 띄운다. 처음 받은 저장소에는 없다.
const previewCert = () => {
  const key = path.resolve(webDir, ".preview-cert/key.pem");
  const cert = path.resolve(webDir, ".preview-cert/cert.pem");
  if (!existsSync(key) || !existsSync(cert)) return undefined;
  return { key: readFileSync(key), cert: readFileSync(cert) };
};

export default defineConfig(({ mode }) => {
  const fontBase = (loadEnv(mode, webDir, "VITE_").VITE_FONT_BASE || "/fonts/").replace(/\/?$/, "/");
  return {
  root: webDir,
  plugins: [fontBaseCss(fontBase), react(), tailwindcss(), cleanWebAssets(), quietNodeBuiltins()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(webDir, "src"),
      "@wasm": wasmDir,
    },
  },
  build: {
    outDir: path.join(buildDir, "web"),
    emptyOutDir: false,
  },
  worker: {
    format: "es",
  },
  // web 저장소에서는 서브모듈 core/ 가 webDir 안에 있다. 의존성 검사가 core/build 의 Skia 시험 페이지까지 훑지 않게 입구를 정한다.
  optimizeDeps: {
    entries: ["index.html"],
  },
  // 내부 네트워크에서도 열리게 0.0.0.0 에 띄운다. IP 주소의 http 는 보안 맥락이 아니라 단일 스레드 wasm 으로 돈다.
  // dev:lan(--mode lan)은 미리보기와 같은 인증서로 https 를 써서 다른 기기에서도 스레드 wasm 을 쓴다.
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 5173,
    headers: isolation,
    fs: { allow: [webDir, coreDir] },
    watch: { ignored: [path.join(coreDir, "build", "skia") + "/**", "**/_deps/**"] },
    https: mode === "lan" ? previewCert() : undefined,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 5173,
    strictPort: true,
    headers: isolation,
    // IP 주소의 http 는 보안 맥락이 아니라서 스레드 wasm 이 막힌다.
    https: previewCert(),
  },
};
});
