// 다른 페이지가 iframe 으로 넣은 보기와 그 페이지 사이의 통로(postMessage).
// 받는 명령: { chwp: "zoom" | "page" | "view" | "edit", value, cols, rows }, { chwp: "state" }
// 보내는 알림: { chwp: "ready" | "change" | "state", page, pageCount, percent, zoomMode, zoomLabel, view, cols, rows, edit },
//             { chwp: "error", message }
// 명령의 뜻과 범위(150%, width, next, grid 칸 수)는 코어가 정한다(viewer.embed). 여기서는 바꿔 넘기고 포장만 한다.
// 알림에는 문서 내용이 없어서 받는 쪽 출처를 묶지 않는다.

function pack(view, edit) {
  return {
    page: view.page | 0,
    pageCount: view.pageCount | 0,
    percent: view.percent | 0,
    zoomMode: view.zoomMode || "percent",
    zoomLabel: view.zoomLabel || "",
    view: view.gridMode || "auto",
    cols: view.gridCols | 0,
    rows: view.gridRows | 0,
    edit: !!edit,
  };
}

export function startEmbed(viewer) {
  const host = window.parent !== window ? window.parent : null;
  if (!host) return;
  let state = null;
  let view = {};
  let edit = !!viewer.info.editButton;
  let sent = "";
  let open = false;
  const post = (type, body) => host.postMessage({ chwp: type, ...body }, "*");
  const changed = () => {
    state = pack(view, edit);
    if (!open) return;
    const text = JSON.stringify(state);
    if (text === sent) return;
    sent = text;
    post("change", state);
  };

  viewer.addEventListener("viewport", (event) => {
    view = event.detail || {};
    changed();
  });
  viewer.addEventListener("editbutton", (event) => {
    edit = !!event.detail?.shown;
    changed();
  });
  // 연 뒤의 답은 코어 입력 답이다. 쪽은 0부터 세므로 알림처럼 1부터로 바꾼다.
  viewer.addEventListener("opened", (event) => {
    const report = event.detail || {};
    view = { ...report, page: (report.page | 0) + 1 };
    edit = !!report.editButton;
    state = pack(view, edit);
    sent = JSON.stringify(state);
    open = true;
    post("ready", state);
  });
  viewer.addEventListener("openfailed", (event) => {
    open = false;
    const error = event.detail?.error;
    post("error", { message: String(error?.message || error) });
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
    void viewer.embed(data.chwp, data.value, data.cols, data.rows);
  });
}
