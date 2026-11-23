import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { PencilLine } from "lucide-react";
import { AppMenuBar } from "./AppMenuBar.jsx";
import { FontSwapDialog } from "./FontSwapDialog.jsx";
import { SelectionMenu } from "./SelectionMenu.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import { Button } from "@/components/ui/button";
import { editButtonShown, setReadOnly, startAppViewer } from "./app-viewer.js";
import { useWide } from "./ui-actions.js";
import "./viewer.css";
import "./app.css";

// 빌드는 사이트 루트(/) 기준이고, 배포 때 /hwp/ 같은 접두가 붙는다. 번들 주소에서 접두를 읽는다.
// (배포 스크립트가 "/assets/" 문자열을 접두 붙은 경로로 바꾸므로 여기서는 정규식으로만 찾는다.)
function routerBase() {
  const match = new URL(import.meta.url).pathname.match(/^(.*)\/assets\/[^/]+$/);
  return match?.[1] || "/";
}

// 문서 보기(viewer.js)는 여기 한 번만 만든다. 화면 캔버스는 워커로 넘긴 뒤 다시 쓸 수 없어서(OffscreenCanvas)
// 라우트가 바뀌어도 언마운트되면 안 된다. 보기↔편집은 위쪽 도구줄(Outlet)만 바뀐다.
function DocumentShell() {
  const host = useRef(null);
  useEffect(() => {
    startAppViewer(host.current);
  }, []);

  return (
    <>
      <Outlet />
      <FontSwapDialog />
      <input id="file" type="file" accept=".hwp,.hwpx" hidden />
      <div className="panes">
        <section ref={host} />
      </div>
      <SelectionMenu />
      <ContextMenu />
    </>
  );
}

// 보기·편집 모드. 처음 모드는 주소가 정한다(/viewer 는 보기, 나머지는 편집). 열린 뒤에는 코어가 모드를 들고 있고
// (보기 모드에서 두 번 누르면 편집), 화면은 그 알림(chwp-mode)대로 도구줄을 그리고 주소를 따라 적는다.
// 주소를 따라 적으므로 뒤로 가기는 보기로 돌아온다.
function routeMode(pathname) {
  return /\/viewer\/?$/.test(pathname) ? "view" : "edit";
}

function DocumentChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const wanted = routeMode(location.pathname);
  const [mode, setMode] = useState(wanted);

  // 주소 → 코어(처음 열 때, 편집 단추, 뒤로 가기).
  useEffect(() => {
    setMode(wanted);
    setReadOnly(wanted === "view");
  }, [wanted]);

  // 코어 → 화면·주소. ?file= 이 그대로 따라가므로 문서를 다시 읽지 않는다.
  useEffect(() => {
    const onMode = (event) => {
      const next = event.detail?.mode === "view" ? "view" : "edit";
      setMode(next);
      if (next !== wanted) navigate({ pathname: next === "view" ? "/viewer" : "/editor", search: location.search });
    };
    window.addEventListener("chwp-mode", onMode);
    return () => window.removeEventListener("chwp-mode", onMode);
  }, [wanted, location.search, navigate]);

  return mode === "view" ? <ViewChrome /> : <AppMenuBar />;
}

// 보기 모드. 메뉴·서식 줄이 없다. 스크롤·배율·블록·복사는 그대로다.
// 편집 단추는 처음엔 숨기고, 넣은 페이지가 임베드 명령(주소 ?edit=1, postMessage edit)으로 켤 때만 보인다.
// 휴대폰·태블릿 세로는 문서를 가리지 않게 오른쪽 아래 둥근 단추 하나다.
function ViewChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useWide();
  const [shown, setShown] = useState(editButtonShown);

  useEffect(() => {
    const onChange = (event) => setShown(!!event.detail?.shown);
    window.addEventListener("chwp-edit-button", onChange);
    return () => window.removeEventListener("chwp-edit-button", onChange);
  }, []);

  if (!shown) return null;
  const edit = () => navigate({ pathname: "/editor", search: location.search });
  if (!wide) {
    return (
      <Button
        size="icon"
        aria-label="편집"
        title="편집 (문서를 두 번 눌러도 들어갑니다)"
        className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-10 size-12 rounded-full shadow-lg"
        onClick={edit}
      >
        <PencilLine className="size-5" />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" className="fixed top-3 right-3 z-10 shadow-sm" onClick={edit}>
      <PencilLine />
      편집
    </Button>
  );
}

// 개발 서버가 이 파일을 다시 실행해도(HMR) 같은 루트에 다시 그린다. 루트를 또 만들면 React 가 경고한다.
const rootElement = document.getElementById("root");
rootElement.__chwpRoot ??= createRoot(rootElement);
rootElement.__chwpRoot.render(
  <BrowserRouter basename={routerBase()}>
    <Routes>
      <Route element={<DocumentShell />}>
        {/* /viewer 는 보기 모드로, /editor·/·/open(파일 핸들러) 등 나머지는 편집 모드로 연다 */}
        <Route path="*" element={<DocumentChrome />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
