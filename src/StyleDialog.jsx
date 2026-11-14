import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { applyStyle } from "./FormatBar.jsx";
import { toast } from "./ui-actions.js";

// 스타일(한글 2024 스타일 대화 상자, F6)과 스타일 추가하기·편집하기.
// 목록·정보·초안, 추가·편집·지우기·차례 바꾸기·현재 모양으로 바꾸기·글자 스타일 해제 규칙은 모두 코어가 정한다.
// 셸은 코어가 준 값을 보이고 고른 값과 명령을 넘긴다.

// 글자·문단 모양 대화 상자를 스타일 초안 모양으로 연다(FormatDialogs 의 styleChar·stylePara).
const openFormatDialog = (name) => window.dispatchEvent(new CustomEvent("chwp-open-format-dialog", { detail: { name } }));

export function openStyleDialog() {
  window.dispatchEvent(new Event("chwp-open-style-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const box = "ui-box h-9 rounded-md px-2";
const button = "ui-outline h-10 rounded-lg px-3 disabled:opacity-40";

function Frame({ open, onClose, title, description, width = "lg:w-[720px]", children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={`${shell} ${width}`} onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-10 items-center justify-center rounded-[10px]" aria-label="닫기" onClick={onClose}>
              <X className="size-5" />
            </button>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function styleView(id) {
  if (typeof window.__chwpStyleView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpStyleView(id));
}

function editStyle(action, fields = {}) {
  if (typeof window.__chwpStyleCommand !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpStyleCommand(action, fields)).then((result) => {
    if (result && result.error) toast(result.error, "info", null, { key: "style" });
    return result;
  });
}

// 코어 rows 글: "번호\t이름\t영문 이름\t종류\t다음 스타일\t단축키" 줄.
function rowsOf(view) {
  return String(view?.rows || "").split("\n").filter(Boolean).map((line) => {
    const [id, name, engName, type, next, shortcut] = line.split("\t");
    return { id: Number(id), name, engName, type, next: Number(next), shortcut: Number(shortcut) };
  });
}

const alignLabels = { JUSTIFY: "양쪽 정렬", LEFT: "왼쪽 정렬", RIGHT: "오른쪽 정렬", CENTER: "가운데 정렬", DISTRIBUTE: "배분 정렬", DISTRIBUTE_SPACE: "나눔 정렬" };
const pt = (value) => (typeof value === "number" ? `${Math.round(value * 10) / 10} pt` : "");

function lineSpacingText(view) {
  const value = view["info.lineSpacing"];
  if (typeof value !== "number") return "";
  return (view["info.lineSpacingType"] || "PERCENT") === "PERCENT" ? `${value} %` : pt(value / 100);
}

function headingText(view) {
  const type = view["info.headingType"] || "NONE";
  if (type === "OUTLINE") return `개요 ${(view["info.headingLevel"] | 0) + 1} 수준`;
  if (type === "NUMBER") return "문단 번호";
  if (type === "BULLET") return "글머리표";
  return "없음";
}

function Info({ label, value }) {
  return (
    <div className="flex gap-1">
      <span className="w-[5.5em] flex-none text-[#737373]">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function InfoGroup({ title, children }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[#e5e5e5] pt-2">
      <span className="font-medium">{title}</span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

export function StyleDialog() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({});
  const [picked, setPicked] = useState(0);
  const [editor, setEditor] = useState(null);  // { editing } 추가·편집 창
  const [deleting, setDeleting] = useState(null);  // { replacement } 지우기 창
  const [importing, setImporting] = useState(null);  // { rows, picked, file } 가져오기 창
  const rows = rowsOf(view);
  const pickedRow = rows.find((row) => row.id === picked) || null;

  const load = (id) => styleView(id).then((next) => {
    if (next) setView(next);
    return next;
  });
  useEffect(() => {
    const onOpen = () => {
      void load(-1).then((first) => {
        const caret = Number(first?.caretStyleId) | 0;
        setPicked(caret);
        void load(caret);
        setEditor(null);
        setDeleting(null);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-style-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-style-dialog", onOpen);
  }, []);

  const pick = (id) => {
    setPicked(id);
    void load(id);
  };
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  // 설정: 고른 스타일을 캐럿(블록)에 입히고 닫는다.
  const apply = () => {
    if (pickedRow) applyStyle({ styleName: pickedRow.name });
    close();
  };
  const command = (action, fields, nextPick) => editStyle(action, fields).then((result) => {
    if (result?.documentChanged) {
      const id = typeof nextPick === "number" ? nextPick : picked;
      setPicked(id);
      void load(id);
    }
    return result;
  });

  // 스타일 내보내기: 이 문서 스타일만 담은 HWPX 파일을 내려받는다.
  const exportStyles = () => {
    if (typeof window.__chwpExportStyles !== "function") return;
    void Promise.resolve(window.__chwpExportStyles()).then((ok) => {
      if (!ok) toast("스타일 파일을 만들지 못했습니다.", "info", null, { key: "style" });
    });
  };

  if (importing) {
    // 스타일 가져오기(한글 스타일 가져오기/내보내기의 가져오는 쪽): 파일을 고르고 그 스타일을 이 문서로 복사한다.
    // 같은 이름은 덮어쓴다(되돌리기 한 번이면 돌아온다).
    const pickFile = (event) => {
      const file = event.target.files?.[0];
      if (!file || typeof window.__chwpOpenStyleSource !== "function") return;
      void file.arrayBuffer().then((buffer) => window.__chwpOpenStyleSource(buffer)).then((got) => {
        if (got?.error) {
          toast(got.error, "info", null, { key: "style" });
          return;
        }
        setImporting({ rows: rowsOf(got), picked: [], file: file.name });
      });
    };
    const copy = (names) => void command("import", { names: names.join("\n") }).then((result) => {
      if (result?.documentChanged) setImporting(null);
    });
    const toggle = (name) => setImporting((prev) => ({
      ...prev,
      picked: prev.picked.includes(name) ? prev.picked.filter((n) => n !== name) : [...prev.picked, name],
    }));
    const existing = new Set(rows.map((row) => row.name));
    return (
      <Frame open={open} onClose={() => setImporting(null)} title="스타일 가져오기" description="다른 문서의 스타일을 이 문서로 복사합니다." width="lg:w-[460px]">
        <label className="flex items-center gap-2">
          <span className="w-[6em]">파일</span>
          <span className="min-w-0 flex-1 truncate text-[#737373]">{importing.file || "HWP·HWPX 문서를 고르십시오."}</span>
          <span className={`${button} flex cursor-pointer items-center`}>
            파일 고르기
            <input type="file" accept=".hwp,.hwpx" className="hidden" onChange={pickFile} />
          </span>
        </label>
        <div className="flex h-[16em] flex-col overflow-y-auto rounded-md border border-[#e5e5e5]" role="listbox" aria-label="가져올 스타일" aria-multiselectable="true">
          {importing.rows.map((row) => (
            <label key={row.id} className="flex items-center gap-2 px-2 py-1">
              <input type="checkbox" checked={importing.picked.includes(row.name)} onChange={() => toggle(row.name)} />
              <span className="w-[1.2em] flex-none text-center text-[#737373]" aria-hidden="true">{row.type === "CHAR" ? "가" : "¶"}</span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="flex-none text-[#a3a3a3]">{existing.has(row.name) ? "덮어씀" : "새로"}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-row-reverse flex-wrap gap-2 border-t border-[#e5e5e5] pt-3">
          <button type="button" className="ui-primary h-10 rounded-lg px-5" disabled={!importing.picked.length} onClick={() => copy(importing.picked)}>복사</button>
          <button type="button" className="ui-outline h-10 rounded-lg px-5" disabled={!importing.rows.length} onClick={() => copy([])}>모두 복사</button>
          <button type="button" className="ui-outline h-10 rounded-lg px-5" onClick={() => setImporting(null)}>닫기</button>
        </div>
      </Frame>
    );
  }

  if (deleting) {
    return (
      <Frame open={open} onClose={() => setDeleting(null)} title="스타일 지우기" description="스타일을 지우고 그 스타일을 쓰던 문단을 다른 스타일로 바꿉니다." width="lg:w-[420px]">
        <p>"{pickedRow?.name}" 스타일을 지웁니다. 이 스타일을 쓰던 곳은 아래 스타일로 바뀝니다.</p>
        <label className="flex items-center gap-2">
          <span className="w-[6em]">바꿀 스타일</span>
          <select className={`${box} flex-1`} value={deleting.replacement} onChange={(event) => setDeleting({ replacement: Number(event.target.value) })}>
            {rows.filter((row) => row.id !== picked && row.type === (pickedRow?.type || "PARA")).map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
            {pickedRow?.type === "CHAR" ? <option value={0}>(글자 스타일 풀기)</option> : null}
          </select>
        </label>
        <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
          <button type="button" className="ui-primary h-10 rounded-lg px-5"
            onClick={() => void command("delete", { styleId: picked, replacement: deleting.replacement }, 0).then((result) => {
              if (result?.documentChanged) setDeleting(null);
            })}>지우기</button>
          <button type="button" className="ui-outline h-10 rounded-lg px-5" onClick={() => setDeleting(null)}>취소</button>
        </div>
      </Frame>
    );
  }

  if (editor) {
    return (
      <StyleEditor
        open={open}
        editing={editor.editing}
        rows={rows}
        onClose={(addedId) => {
          setEditor(null);
          const id = typeof addedId === "number" ? addedId : picked;
          setPicked(id);
          void load(id);
        }}
      />
    );
  }

  const v = view;
  const isChar = pickedRow?.type === "CHAR";
  return (
    <Frame open={open} onClose={close} title="스타일" description="문서 스타일을 고르고, 추가하고, 고치고, 지웁니다.">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-col gap-2 lg:w-[16em]">
          <span>스타일 목록</span>
          <div className="flex h-[18em] flex-col overflow-y-auto rounded-md border border-[#e5e5e5]" role="listbox" aria-label="스타일 목록">
            {rows.map((row) => (
              <button key={row.id} type="button" role="option" aria-selected={row.id === picked}
                ref={row.id === picked ? (node) => node?.scrollIntoView({ block: "nearest" }) : undefined}
                className={`flex items-center gap-2 px-2 py-1 text-left ${row.id === picked ? "bg-[#e8efff]" : ""}`}
                onClick={() => pick(row.id)} onDoubleClick={() => { pick(row.id); applyStyle({ styleName: row.name }); close(); }}>
                <span className="w-[1.2em] flex-none text-center text-[#737373]" aria-hidden="true">{row.type === "CHAR" ? "가" : "¶"}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="flex-none text-[#a3a3a3]">{row.shortcut ? `Ctrl+${row.shortcut % 10}` : ""}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" className={`${button} flex-1`} onClick={() => setEditor({ editing: -1 })}>추가</button>
            <button type="button" className={`${button} flex-1`} onClick={() => setEditor({ editing: picked })} disabled={!pickedRow}>편집</button>
            <button type="button" className={`${button} flex-1`} onClick={() => setDeleting({ replacement: 0 })} disabled={!pickedRow || picked === 0}>지우기</button>
          </div>
          <div className="flex gap-1">
            <button type="button" className={`${button} flex flex-1 items-center justify-center`} aria-label="한 줄 위로"
              onClick={() => void command("move", { styleId: picked, delta: -1 }, picked - 1)} disabled={!pickedRow || picked === 0}>
              <ArrowUp className="size-4" />
            </button>
            <button type="button" className={`${button} flex flex-1 items-center justify-center`} aria-label="한 줄 아래로"
              onClick={() => void command("move", { styleId: picked, delta: 1 }, picked + 1)} disabled={!pickedRow || picked >= rows.length - 1}>
              <ArrowDown className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <InfoGroup title="문단 모양 정보">
            <Info label="왼쪽 여백" value={pt(v["info.marginLeft"])} />
            <Info label="첫 줄" value={pt(v["info.indent"])} />
            <Info label="오른쪽 여백" value={pt(v["info.marginRight"])} />
            <Info label="정렬 방식" value={alignLabels[v["info.align"]] || ""} />
            <Info label="줄 간격" value={lineSpacingText(v)} />
            <Info label="다음 스타일" value={isChar ? "" : v["info.nextStyle"] || ""} />
          </InfoGroup>
          <InfoGroup title="글자 모양 정보">
            <Info label="글꼴" value={v["info.font"] || ""} />
            <Info label="장평" value={typeof v["info.ratio"] === "number" ? `${v["info.ratio"]} %` : ""} />
            <Info label="크기" value={pt(v["info.height"])} />
            <Info label="자간" value={typeof v["info.spacing"] === "number" ? `${v["info.spacing"]} %` : ""} />
          </InfoGroup>
          <InfoGroup title="문단 번호/글머리표 정보">
            <Info label="종류" value={isChar ? "" : headingText(v)} />
          </InfoGroup>
          <div className="flex flex-wrap gap-1 border-t border-[#e5e5e5] pt-2">
            <button type="button" className={button} onClick={() => void command("fromCaret", { styleId: picked })} disabled={!pickedRow}>현재 모양으로 바꾸기</button>
            <button type="button" className={button} onClick={() => void command("clearChar", {})}>글자 스타일 해제</button>
            <button type="button" className={button} onClick={() => setImporting({ rows: [], picked: [], file: "" })}>가져오기</button>
            <button type="button" className={button} onClick={exportStyles}>내보내기</button>
          </div>
        </div>
      </div>
      <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="ui-primary h-10 rounded-lg px-5" onClick={apply} disabled={!pickedRow}>설정</button>
        <button type="button" className="ui-outline h-10 rounded-lg px-5" onClick={close}>취소</button>
      </div>
    </Frame>
  );
}

// 스타일 추가하기·편집하기(한글 2024 AddStyleDlg): 이름, 영문 이름, 종류, 다음 문단에 적용할 스타일,
// 문단 모양·글자 모양 단추. 초안은 코어에 있고 글자·문단 모양 대화 상자는 그 초안을 고친다.
function StyleEditor({ open, editing, rows, onClose }) {
  const [draft, setDraft] = useState(null);
  const adding = editing < 0;
  useEffect(() => {
    let alive = true;
    void editStyle("begin", { editing }).then(() => styleView(-1)).then((next) => {
      if (!alive || !next) return;
      setDraft({
        name: String(next["draft.name"] || ""),
        engName: String(next["draft.engName"] || ""),
        type: String(next["draft.type"] || "PARA"),
        nextStyleId: Number(next["draft.nextStyleId"]) | 0,
      });
    });
    return () => { alive = false; };
  }, [editing]);

  const set = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    void editStyle("set", { [key]: value });
  };
  const cancel = () => {
    void editStyle("end");
    onClose();
  };
  const commit = () => {
    void editStyle("commit").then((result) => {
      if (!result?.documentChanged) return;
      onClose(adding ? rows.length : editing);
    });
  };
  // 새 스타일은 목록 끝에 붙는다. 다음 스타일에 새 스타일 자신도 고를 수 있다.
  const nextChoices = adding ? [...rows, { id: rows.length, name: draft?.name || "(새 스타일)", type: "PARA" }] : rows;
  const isChar = draft?.type === "CHAR";
  return (
    <Frame open={open} onClose={cancel} title={adding ? "스타일 추가하기" : "스타일 편집하기"} description="스타일 이름과 종류, 다음 스타일, 문단·글자 모양을 정합니다." width="lg:w-[460px]">
      {draft ? (
        <>
          <label className="flex items-center gap-2">
            <span className="w-[8em]">스타일 이름</span>
            <input className={`${box} flex-1`} value={draft.name} autoFocus onChange={(event) => set("name", event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-[8em]">영문 이름</span>
            <input className={`${box} flex-1`} value={draft.engName} onChange={(event) => set("engName", event.target.value)} />
          </label>
          <div className="flex items-center gap-4">
            <span className="w-[8em]">스타일 종류</span>
            <label className="flex items-center gap-1"><input type="radio" checked={!isChar} disabled={!adding} onChange={() => set("type", "PARA")} />문단</label>
            <label className="flex items-center gap-1"><input type="radio" checked={isChar} disabled={!adding} onChange={() => set("type", "CHAR")} />글자</label>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-[8em]">다음 문단에 적용할 스타일</span>
            <select className={`${box} flex-1`} value={draft.nextStyleId} disabled={isChar} onChange={(event) => set("nextStyleId", Number(event.target.value))}>
              {nextChoices.filter((row) => row.type !== "CHAR").map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className={`${button} flex-1`} disabled={isChar} onClick={() => openFormatDialog("stylePara")}>문단 모양…</button>
            <button type="button" className={`${button} flex-1`} onClick={() => openFormatDialog("styleChar")}>글자 모양…</button>
          </div>
          <p className="text-[#737373]">{adding ? "캐럿이 있는 곳의 문단·글자 모양으로 시작합니다." : "고치면 이 스타일을 쓰는 곳이 모두 바뀝니다."}</p>
        </>
      ) : null}
      <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="ui-primary h-10 rounded-lg px-5" onClick={commit} disabled={!draft?.name}>{adding ? "추가" : "설정"}</button>
        <button type="button" className="ui-outline h-10 rounded-lg px-5" onClick={cancel}>취소</button>
      </div>
    </Frame>
  );
}
