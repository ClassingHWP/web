// 엔진 파일(WASM 글루·wasm). 앱(Vite)은 빌드가 묶은 주소를 쓴다.
// 보기 패키지는 빌드 때 이 파일을 engine-url.js 로 바꿔 끼운다(vite.viewer.config.js).
import createPthread from "@wasm/chwp.mjs";
import createSingle from "@wasm/chwp-single.mjs";
import wasmPthreadUrl from "@wasm/chwp.wasm?url";
import wasmSingleUrl from "@wasm/chwp-single.wasm?url";

export const engine = {
  pthread: async () => createPthread,
  single: async () => createSingle,
  wasmPthreadUrl,
  wasmSingleUrl,
};
