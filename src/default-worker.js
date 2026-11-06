// 이 앱 빌드가 묶은 코어 워커. 보기 패키지는 빌드 때 이 파일을 default-worker-lib.js 로 바꿔 끼운다.
// Vite 는 new Worker(new URL(...), { 그대로 쓴 값 }) 모양을 보고 워커를 묶으므로 이 모양을 그대로 둔다.
export function createDefaultWorker(single) {
  return single
    ? new Worker(new URL("./core-worker-boot.js", import.meta.url), { type: "module", name: "single" })
    : new Worker(new URL("./core-worker-boot.js", import.meta.url), { type: "module", name: "core" });
}
