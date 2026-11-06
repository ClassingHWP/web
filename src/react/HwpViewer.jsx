"use client";

// 한글 문서 보기 React 컴포넌트. viewer.js 의 createViewer 를 감싼다.
//
//   <HwpViewer file="/docs/공문.hwpx" zoom="width" style={{ height: 600 }} onChange={(s) => setPage(s.page)} />
//
// file      문서 주소, File·Blob, ArrayBuffer·Uint8Array. 바뀌면 새로 연다.
// zoom      "150", "page", "width"     page  1부터 센 쪽, "next", "prev", "first", "last"
// view      "auto", "single", "two", "grid"(cols·rows)
//           처음 열 때 맞추고, 연 뒤에 바뀌면 그 명령을 보낸다.
// readOnly  보기 전용(기본 true). false 면 글을 칠 수 있다(서식 메뉴는 없다).
// engine    엔진 폴더 주소(기본 /chwp/). fonts  글꼴 서버 주소나 { base, index, licenseSwap, replace }
// onReady(state), onChange(state), onError(error), ref 는 보기 인스턴스(viewer.js)다.
// state 는 { page, pageCount, percent, zoomMode, zoomLabel, gridMode, gridCols, gridRows, ... } 다(쪽은 1부터).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createViewer } from "../viewer.js";

function queryOf({ zoom, page, view, cols, rows }) {
  const params = new URLSearchParams();
  if (zoom != null && zoom !== "") params.set("zoom", String(zoom));
  if (page != null && page !== "") params.set("page", String(page));
  if (view != null && view !== "") params.set("view", String(view));
  if (cols) params.set("cols", String(cols));
  if (rows) params.set("rows", String(rows));
  return "?" + params.toString();
}

export const HwpViewer = forwardRef(function HwpViewer(props, ref) {
  const { file, fileName, zoom, page, view, cols, rows, readOnly = true, engine, fonts, className, style } = props;
  const host = useRef(null);
  const [viewer, setViewer] = useState(null);
  // 알림 함수는 매번 새로 올 수 있다. 보기를 다시 만들지 않고 마지막 것을 부른다.
  const latest = useRef(props);
  latest.current = props;
  const opened = useRef(false);
  const fontsKey = typeof fonts === "object" && fonts ? JSON.stringify(fonts) : String(fonts ?? "");

  useImperativeHandle(ref, () => viewer, [viewer]);

  useEffect(() => {
    const made = createViewer(host.current, { readOnly: latest.current.readOnly ?? true, engine, fonts });
    made.addEventListener("opened", () => {
      opened.current = true;
      latest.current.onReady?.(made.info.viewport);
    });
    made.addEventListener("viewport", (event) => {
      if (opened.current) latest.current.onChange?.(event.detail);
    });
    made.addEventListener("openfailed", (event) => latest.current.onError?.(event.detail?.error));
    setViewer(made);
    return () => {
      opened.current = false;
      made.destroy();
      setViewer(null);
    };
    // 엔진과 글꼴이 바뀔 때만 새 보기를 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, fontsKey]);

  useEffect(() => {
    if (!viewer || file == null) return;
    opened.current = false;
    void viewer.open(file, fileName || "", queryOf(latest.current));
    // 쪽 모양·배율·쪽은 열 때 query 로 함께 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, file, fileName]);

  // 연 뒤에 바뀐 값만 명령으로 보낸다. 처음 값은 위에서 열 때 맞췄다.
  const sent = useRef({});
  useEffect(() => {
    if (!viewer) return;
    const last = sent.current;
    sent.current = { zoom, page, view, cols, rows };
    if (!opened.current) return;
    if (zoom != null && zoom !== last.zoom) void viewer.zoom(zoom);
    if (view != null && (view !== last.view || cols !== last.cols || rows !== last.rows)) void viewer.view(view, cols, rows);
    if (page != null && page !== last.page) void viewer.page(page);
  }, [viewer, zoom, page, view, cols, rows]);

  useEffect(() => {
    viewer?.setReadOnly(readOnly);
  }, [viewer, readOnly]);

  return <div ref={host} className={className} style={{ position: "relative", overflow: "hidden", ...style }} />;
});

export default HwpViewer;
