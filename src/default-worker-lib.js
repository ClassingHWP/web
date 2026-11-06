// 보기 패키지의 코어 워커. engine 옵션을 주지 않으면 이 사이트의 /chwp/ 에 올린 engine 폴더를 쓴다.
export function createDefaultWorker(single) {
  return new Worker(new URL("/chwp/core-worker-boot.js", location.href), { type: "module", name: single ? "single" : "core" });
}
