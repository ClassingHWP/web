import { useEffect, useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { pageControl, pageControlFields } from "./ui-actions.js";

// 바탕쪽(한글 2024): 종류(양쪽·홀수 쪽·짝수 쪽·현재 구역의 마지막 쪽·현재 구역 안 임의 쪽),
// 기존 바탕쪽과 겹치게 하기, 인쇄할 때 바탕쪽 맨 위로 보내기. 설정하면 그 바탕쪽 편집으로 들어간다.
// 없는 종류면 만들고, 있으면 그것을 연다(코어 pageControl masterPage).

export function openMasterPageDialog() {
  window.dispatchEvent(new Event("chwp-open-master-page-dialog"));
}

const types = [["BOTH", "양쪽(B)"], ["ODD", "홀수 쪽(O)"], ["EVEN", "짝수 쪽(E)"], ["LAST_PAGE", "현재 구역의 마지막 쪽(L)"],
  ["OPTIONAL_PAGE", "현재 구역 안 임의 쪽(R)"]];
const box = "ui-box h-9 rounded-md px-2";

export function MasterPageDialog() {
  const [open, setOpen] = useOpen("chwp-open-master-page-dialog");
  const [ready, setReady] = useState(false);
  const [type, setType] = useState("BOTH");
  const [pageNumber, setPageNumber] = useState(1);
  const [duplicate, setDuplicate] = useState(false);
  const [front, setFront] = useState(false);
  const close = () => {
    setOpen(false);
    setReady(false);
    focusEditor();
  };
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void pageControlFields("masterPage").then((view) => {
      if (!live) return;
      // 고치는 바탕쪽이 있으면 그 값으로, 아니면 양쪽으로 연다.
      setType(view?.inMaster && typeof view.type === "string" ? view.type : "BOTH");
      setPageNumber(view?.inMaster && Number(view.pageNumber) > 0 ? Number(view.pageNumber) : 1);
      setDuplicate(!!(view?.inMaster && view.duplicate));
      setFront(!!(view?.inMaster && view.front));
      setReady(true);
    });
    return () => { live = false; };
  }, [open]);
  const special = type === "LAST_PAGE" || type === "OPTIONAL_PAGE";
  const apply = () => {
    const fields = { type, front, duplicate: special && duplicate };
    if (type === "OPTIONAL_PAGE") fields.pageNumber = Math.max(1, Math.round(Number(pageNumber) || 1));
    void pageControl("masterPage", fields).then((result) => {
      if (result?.handled) {
        setOpen(false);
        setReady(false);
      }
    });
  };
  return (
    <Frame open={open && ready} onClose={close} title="바탕쪽" description="바탕쪽 종류를 고르고 그 바탕쪽을 고칩니다." onApply={apply}>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">종류</legend>
        {types.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="master-type" checked={type === value} onChange={() => setType(value)} />
            {label}
            {value === "OPTIONAL_PAGE" ? (
              <input type="number" min="1" className={`${box} ml-2 w-[5em] text-right disabled:opacity-40`} aria-label="쪽"
                disabled={type !== "OPTIONAL_PAGE"} value={pageNumber} onChange={(event) => setPageNumber(event.target.value)} />
            ) : null}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">속성</legend>
        <label className={`flex min-h-9 items-center gap-2 ${special ? "" : "opacity-40"}`}>
          <input type="checkbox" disabled={!special} checked={special && duplicate} onChange={(event) => setDuplicate(event.target.checked)} />
          기존 바탕쪽과 겹치게 하기(U)
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" checked={front} onChange={(event) => setFront(event.target.checked)} />
          인쇄할 때 바탕쪽 맨 위로 보내기(F)
        </label>
      </fieldset>
    </Frame>
  );
}
