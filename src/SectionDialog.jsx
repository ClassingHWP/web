import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { sectionSettingsView, setSectionSettings } from "./ui-actions.js";

// 구역 설정(한글 2024 구역 설정 대화 상자와 같은 칸). 처음 값과 적용 범위 목록은 코어가 준다.

export function openSectionDialog() {
  window.dispatchEvent(new Event("chwp-open-section-dialog"));
}

const startKinds = [["CONTINUE", "이어서"], ["ODD", "홀수"], ["EVEN", "짝수"], ["USER", "사용자"]];
const applyNames = { CURRENT: "현재 구역", WHOLE: "문서 전체", NEW_SECTION: "새 구역으로" };
const objects = [["pictureStart", "그림"], ["tableStart", "표"], ["equationStart", "수식"]];
const checks = [
  ["hideFirstHeaderFooter", "첫 쪽에만 머리말/꼬리말 감추기"],
  ["hideFirstMaster", "첫 쪽에만 바탕쪽 감추기"],
  ["hideFirstBorderFill", "첫 쪽에만 테두리/배경 감추기"],
  ["hideEmptyLine", "빈 줄 감추기"],
];

export function SectionDialog() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(null);

  useEffect(() => {
    const onOpen = () => {
      setValues(null);
      setOpen(true);
      void sectionSettingsView().then((view) => { if (view) setValues(view); });
    };
    window.addEventListener("chwp-open-section-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-section-dialog", onOpen);
  }, []);

  const set = (patch) => setValues((old) => ({ ...old, ...patch }));
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const fields = { ...values };
    delete fields.applyOptions;
    for (const key of Object.keys(fields)) if (key.startsWith("lineNumber")) delete fields[key];
    close();
    void setSectionSettings(fields);
  };

  const v = values || {};
  const options = String(v.applyOptions || "WHOLE").split(",");
  const box = "ui-box h-9 rounded-md px-2";
  const number = (key, disabled, min = 1) => (
    <input type="number" min={min} className={`${box} w-[5.5em] text-right disabled:opacity-40`} disabled={disabled}
      value={v[key] ?? ""} onChange={(event) => set({ [key]: Number(event.target.value) })} />
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Description className="sr-only">시작 쪽 번호, 개체 시작 번호와 구역의 감추기·간격을 정합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">구역 설정</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <fieldset className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">시작 쪽 번호</legend>
            <span>종류</span>
            <select className={`${box} flex-1`} value={v.startsOn || "CONTINUE"} onChange={(event) => set({ startsOn: event.target.value })}>
              {startKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {number("pageNumber", v.startsOn !== "USER")}
          </fieldset>
          <fieldset className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">개체 시작 번호</legend>
            {objects.map(([key, label]) => {
              const user = Number(v[key]) > 0;
              return [
                <span key={`${key}-l`}>{label}</span>,
                <select key={`${key}-s`} className={box} value={user ? "USER" : "CONTINUE"}
                  onChange={(event) => set({ [key]: event.target.value === "USER" ? 1 : 0 })}>
                  <option value="CONTINUE">이어서</option>
                  <option value="USER">사용자</option>
                </select>,
                <span key={`${key}-n`}>{number(key, !user)}</span>,
              ];
            })}
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">기타</legend>
            {checks.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input type="checkbox" checked={!!v[key]} onChange={(event) => set({ [key]: event.target.checked })} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <span className="w-[6.5em]">단 사이 간격</span>
              <input type="number" step="0.1" className={`${box} w-[6em] text-right`} value={v.columnGapPt ?? ""} onChange={(event) => set({ columnGapPt: Number(event.target.value) })} />
              <span>pt</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-[6.5em]">기본 탭 간격</span>
              <input type="number" step="0.1" className={`${box} w-[6em] text-right`} value={v.defaultTabPt ?? ""} onChange={(event) => set({ defaultTabPt: Number(event.target.value) })} />
              <span>pt</span>
            </label>
          </fieldset>
          <label className="flex items-center gap-3">
            <span>적용 범위</span>
            <select className={box} value={v.applyTo || options[0]} onChange={(event) => set({ applyTo: event.target.value })}>
              {options.map((value) => <option key={value} value={value}>{applyNames[value] || value}</option>)}
            </select>
          </label>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!values}>설정(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
