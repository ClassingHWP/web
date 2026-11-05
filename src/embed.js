// 다른 페이지가 iframe 으로 넣은 보기와 그 페이지 사이의 통로(postMessage).
// 받는 명령: { chwp: "zoom" | "page" | "view", value, cols, rows }, { chwp: "state" }
// 보내는 알림: { chwp: "ready" | "change" | "state", page, pageCount, percent, zoomMode, zoomLabel, view, cols, rows },
//             { chwp: "error", message }
// 명령의 뜻과 범위(150%, width, next, grid 칸 수)는 코어가 정한다(input "embed"). 여기서는 바꿔 넘기고 포장만 한다.
// 알림에는 문서 내용이 없어서 받는 쪽 출처를 묶지 않는다.

function pack(view) {
  return {
    page: view.page | 0,
    pageCount: view.pageCount | 0,
    percent: view.percent | 0,
    zoomMode: view.zoomMode || "percent",
    zoomLabel: view.zoomLabel || "",
    view: view.gridMode || "auto",
    cols: view.gridCols | 0,
    rows: view.gridRows | 0,
  };
}

export function startEmbed(sendInput) {
  const host = window.parent !== window ? window.parent : null;
  if (!host) return { opened() {}, failed() {} };
  let state = null;
  let sent = "";
  let open = false;
  const post = (type, body) => host.postMessage({ chwp: type, ...body }, "*");

  window.addEventListener("chwp-viewport-changed", (event) => {
    state = pack(event.detail || {});
    if (!open) return;
    const text = JSON.stringify(state);
    if (text === sent) return;
    sent = text;
    post("change", state);
  });
  window.addEventListener("message", (event) => {
    if (event.source !== host) return;
    const data = event.data;
    if (!data || typeof data !== "object" || typeof data.chwp !== "string") return;
    if (data.chwp === "state") {
      if (state) post("state", state);
      return;
    }
    if (!open) return;
    void sendInput({
      type: "embed",
      mode: data.chwp,
      choice: String(data.value ?? ""),
      cols: Number(data.cols) | 0,
      rows: Number(data.rows) | 0,
    });
  });

  return {
    // report 는 코어 입력 답이다. 쪽은 0부터 세므로 알림처럼 1부터로 바꾼다.
    opened(report) {
      state = pack({ ...report, page: (report?.page | 0) + 1 });
      sent = JSON.stringify(state);
      open = true;
      post("ready", state);
    },
    failed(error) {
      open = false;
      post("error", { message: String(error?.message || error) });
    },
  };
}
