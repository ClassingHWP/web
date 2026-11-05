// 코어 워커의 시작 파일. import 없이 먼저 뜬 뒤 core-worker.js 를 import() 로 불러온다.
// 아이패드 크롬은 앞 페이지의 스레드가 정리되는 사이에 정적 import 가 큰 모듈 워커를 띄우면 가끔
// 아무 내용 없는 오류로 죽는다(사파리는 괜찮다). 빈 워커를 먼저 띄우면 이 실패를 피한다.
// 불러오는 동안 온 메시지는 모아 두었다가 core-worker.js 가 받게 넘긴다.

const queued = [];
self.onmessage = (event) => queued.push(event);

import("./core-worker.js").then(
  () => {
    const handler = self.onmessage;
    for (const event of queued.splice(0)) handler(event);
  },
  (error) => {
    const text = `[Worker Error]\nMessage: 코어 워커를 불러오지 못했습니다: ${error?.message || error}\n${error?.stack || ""}`;
    self.postMessage({ errorLog: text });
    // 기다리는 호출이 끝나지 않고 남지 않게 모두 실패로 돌려준다.
    for (const event of queued.splice(0)) {
      const id = event.data?.id;
      if (id != null) self.postMessage({ id, ok: false, error: text });
    }
    self.onmessage = (event) => {
      const id = event.data?.id;
      if (id != null) self.postMessage({ id, ok: false, error: text });
    };
  },
);
