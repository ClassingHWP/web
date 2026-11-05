// 원격 로그: 주소에 ?rlog=1 이 있으면 콘솔(core 로그 포함)·오류·기기 정보·프레임 통계를 개발 서버(/__rlog)로 보낸다.
// 폰처럼 디버거를 붙이기 어려운 기기에서 개발할 때만 쓴다. 무엇이 부드러운지의 기준(프레임 통계)은 core 가 센다.

const STATS_EVERY_MS = 3000;
const FLUSH_AT = 200;

function text(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deviceInfo() {
  return {
    url: location.href,
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
    screen: [screen.width, screen.height],
    view: [window.innerWidth, window.innerHeight],
    cores: navigator.hardwareConcurrency || 0,
    memoryGb: navigator.deviceMemory || 0,
    secure: window.isSecureContext,
    isolated: window.crossOriginIsolated,
    webgpu: !!navigator.gpu,
    touch: navigator.maxTouchPoints || 0,
  };
}

export function startRemoteLog(session) {
  if (new URLSearchParams(location.search).get("rlog") !== "1") return null;
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  let queue = [];
  const flush = () => {
    if (!queue.length) return;
    const body = JSON.stringify({ id, items: queue });
    queue = [];
    fetch("/__rlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: body.length < 60000,
    }).catch(() => {});
  };
  const push = (kind, data) => {
    queue.push({ t: Math.round(performance.now()), kind, data });
    if (queue.length >= FLUSH_AT) flush();
  };

  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      push(level, args.map(text).join(" "));
    };
  }
  window.addEventListener("error", (event) => {
    push("error", `${event.message} @ ${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => push("error", `unhandledrejection ${text(event.reason)}`));
  document.addEventListener("visibilitychange", () => {
    push("visibility", document.visibilityState);
    if (document.visibilityState === "hidden") flush();
  });

  push("device", deviceInfo());
  flush();
  let timer = 0;
  // 코어가 뜬 뒤(begin)에만 코어에 묻는다. 문서 열기 첫 단계(파일 읽기)는 코어가 뜨기 전에 끝날 수 있다.
  let coreUp;
  const coreReady = new Promise((resolve) => {
    coreUp = resolve;
  });

  const api = {
    // 코어가 뜬 뒤 프레임 통계와 캐시 사용량을 몇 초마다 보낸다.
    begin() {
      coreUp();
      if (timer) return;
      void session.frameStats();
      timer = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        Promise.all([session.frameStats(), session.cacheUsage()]).then(
          ([frames, caches]) => {
            const sizes = {};
            for (const item of caches || []) sizes[item.name] = Math.round(item.bytes / 1048576);
            api.memory("통계");
            push("stats", {
              frames,
              cacheMb: sizes,
              heapMb: Math.round((frames?.heapBytes || 0) / 1048576),
              inUseMb: Math.round((frames?.inUseBytes || 0) / 1048576),
            });
            flush();
          },
          (error) => push("error", `stats ${text(error)}`),
        );
      }, STATS_EVERY_MS);
    },
    // 단계가 끝난 직후 WASM 메모리. 코어 일은 차례대로 하니 이 요청은 그 단계 바로 뒤에 돈다.
    memory(stage) {
      coreReady.then(() => session.memory()).then(
        (m) => {
          const report = {};
          for (const [key, value] of Object.entries(m.report || {})) {
            // 쪽 계산 내역(scenePart)은 KB 로 적는다. MB 로 반올림하면 단계마다 차이가 안 보인다.
            report[key] = /Count|Faces|sizeof/.test(key)
              ? value
              : /^scenePart/.test(key)
                ? Math.round(value / 1024)
                : Math.round(value / 1048576);
          }
          push("mem", {
            단계: stage,
            heapMb: Math.round(m.heapBytes / 1048576),
            inUseMb: Math.round(m.inUseBytes / 1048576),
            reportMb: report,
          });
        },
        () => {},
      );
    },
    // 셸이 잰 기록 한 묶음(예: 문서 열기 단계별 시간).
    note(kind, data) {
      push(kind, data);
      flush();
    },
    flush,
  };
  return api;
}
