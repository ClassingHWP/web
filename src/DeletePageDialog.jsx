import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { pageControl } from "./ui-actions.js";

// 쪽 지우기(한글 2024 RemovePage 대화 상자): 지울 범위 현재 쪽·선택한 쪽·일부분("3-5"). 지우기는 코어 deletePage 가 한다.

export function openDeletePageDialog() {
  window.dispatchEvent(new Event("chwp-open-delete-page-dialog"));
}

// 현재 쪽 지우기(한글 DeleteCurrentPage). 블록이면 블록이 걸친 쪽을 지운다.
export function deleteCurrentPage() {
  return pageControl("deletePage", { range: "current" });
}

const ranges = [["current", "현재 쪽(C)"], ["selected", "선택한 쪽(S)"], ["custom", "일부분(P)"]];
const box = "ui-box h-9 rounded-md px-2";

export function DeletePageDialog() {
  const [open, setOpen] = useOpen("chwp-open-delete-page-dialog");
  const [range, setRange] = useState("current");
  const [pages, setPages] = useState("");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    const fields = range === "custom" ? { range, pages } : { range };
    void pageControl("deletePage", fields).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  return (
    <Frame open={open} onClose={close} title="쪽 지우기" description="지울 쪽의 범위를 정해 지웁니다." onApply={apply}
      applyLabel="지우기(D)" disabled={range === "custom" && !pages.trim()}>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">지울 범위</legend>
        {ranges.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="delete-page-range" checked={range === value} onChange={() => setRange(value)} />
            {label}
            {value === "custom" ? (
              <input className={`${box} ml-2 w-[8em] disabled:opacity-40`} aria-label="지울 쪽" placeholder="예: 3-5"
                disabled={range !== "custom"} value={pages} onChange={(event) => setPages(event.target.value)} />
            ) : null}
          </label>
        ))}
      </fieldset>
    </Frame>
  );
}
