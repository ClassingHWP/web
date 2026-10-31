// 웹 앱이 엔진 저장소를 찾는 곳. web 저장소에서는 서브모듈 core/, 엔진과 한 저장소일 때는 바로 위 폴더다.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const webDir = path.dirname(fileURLToPath(import.meta.url));
const submodule = path.join(webDir, "core");
const standalone = existsSync(path.join(submodule, "CMakeLists.txt"));
export const coreDir = standalone ? submodule : path.resolve(webDir, "..");
// WASM 은 엔진 쪽에서 빌드하고, 웹 결과물은 web 저장소면 그 안의 build/ 에 둔다.
export const wasmDir = path.join(coreDir, "build", "wasm-release", "bindings", "wasm");
export const buildDir = path.join(standalone ? webDir : coreDir, "build");
