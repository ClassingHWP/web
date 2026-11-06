// 보기 패키지의 엔진 파일. 이 워커와 같은 폴더(engine/)에 둔다.
// 스레드 워커는 같은 출처에서만 뜨므로, 쓰는 쪽이 제 서버에 이 폴더를 그대로 올린다.
const at = (name) => new URL(name, self.location.href).href;
const load = (name) => import(/* @vite-ignore */ /* webpackIgnore: true */ at(name)).then((module) => module.default);

export const engine = {
  pthread: () => load("chwp.mjs"),
  single: () => load("chwp-single.mjs"),
  wasmPthreadUrl: at("chwp.wasm"),
  wasmSingleUrl: at("chwp-single.wasm"),
  dataUrl: at("chwp.data"),
};
