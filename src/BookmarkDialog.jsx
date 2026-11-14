import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { bookmark, bookmarkView, goTo, goToPage, goToSection, goToView } from "./ui-actions.js";

// 책갈피(한글 2024 책갈피 대화 상자: 이름, 목록, 넣기·이동·지우기)와 찾아가기(쪽·책갈피).
// 목록·처음 이름·같은 이름 거절은 코어가 정한다.

export function openBookmarkDialog() {
  window.dispatchEvent(new Event("chwp-open-bookmark-dialog"));
}

export function openGoToDialog() {
  window.dispatchEvent(new Event("chwp-open-goto-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[400px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const box = "ui-box h-9 rounded-md px-2";

function Frame({ open, onClose, title, description, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={onClose}>
              <X className="size-6" />
            </button>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

export function BookmarkDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [names, setNames] = useState([]);
  const [sortByName, setSortByName] = useState(false);

  const load = () => bookmarkView().then((view) => {
    const list = String(view?.names || "").split("\n").filter(Boolean);
    setNames(list);
    return view;
  });
  useEffect(() => {
    const onOpen = () => {
      void load().then((view) => {
        setName(String(view?.defaultName || ""));
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-bookmark-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-bookmark-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const run = (action) => {
    void bookmark(action, name).then((result) => {
      if (action === "delete") {
        void load();
        return;
      }
      if (result && (result.documentChanged || (action === "goto" && result.handled))) close();
    });
  };
  const shown = sortByName ? [...names].sort((a, b) => a.localeCompare(b, "ko")) : names;
  // 이름 바꾸기(한글 RenameBookmark: 새 책갈피 이름, 확인·취소). 빈 이름·이미 있는 이름 거절은 코어가 한다.
  const [renaming, setRenaming] = useState(null);
  const rename = () => {
    void bookmark("rename", renaming.from, renaming.to).then((result) => {
      if (!result?.documentChanged) return;
      setName(renaming.to);
      setRenaming(null);
      void load();
    });
  };
  if (renaming) {
    return (
      <Frame open={open} onClose={() => setRenaming(null)} title="책갈피 이름 바꾸기" description="고른 책갈피의 이름을 바꿉니다.">
        <label className="flex items-center gap-2">
          <span className="w-[7em]">새 책갈피 이름</span>
          <input className={`${box} flex-1`} value={renaming.to} autoFocus onChange={(event) => setRenaming((prev) => ({ ...prev, to: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Enter") rename(); }} />
        </label>
        <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
          <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={rename} disabled={!renaming.to}>확인</button>
          <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => setRenaming(null)}>취소</button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame open={open} onClose={close} title="책갈피" description="책갈피를 넣고, 그 자리로 가고, 이름을 바꾸고, 지웁니다.">
      <label className="flex items-center gap-2">
        <span className="w-[5em]">책갈피 이름</span>
        <input className={`${box} flex-1`} value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") run("insert"); }} />
      </label>
      <div className="flex min-h-[8em] flex-col overflow-y-auto rounded-md border border-[#e5e5e5]" role="listbox" aria-label="책갈피 목록">
        {shown.length === 0 ? <span className="p-2 text-[#737373]">책갈피가 없습니다.</span> : null}
        {shown.map((item) => (
          <button key={item} type="button" role="option" aria-selected={item === name}
            className={`px-2 py-1 text-left ${item === name ? "bg-[#e8efff]" : ""}`}
            onClick={() => setName(item)} onDoubleClick={() => { setName(item); void bookmark("goto", item).then(close); }}>
            {item}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <span>정렬 기준</span>
        <label className="flex items-center gap-1"><input type="radio" checked={sortByName} onChange={() => setSortByName(true)} />이름</label>
        <label className="flex items-center gap-1"><input type="radio" checked={!sortByName} onChange={() => setSortByName(false)} />위치</label>
      </div>
      <div className="flex flex-row-reverse flex-wrap gap-2 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => run("insert")} disabled={!name}>넣기(I)</button>
        <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => run("goto")} disabled={!names.includes(name)}>이동(M)</button>
        <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => run("delete")} disabled={!names.includes(name)}>지우기</button>
        <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => setRenaming({ from: name, to: name })} disabled={!names.includes(name)}>이름 바꾸기</button>
        <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={close}>닫기</button>
      </div>
    </Frame>
  );
}

// 찾아가기(한글 2024 GotoDlg): 쪽(P)·구역(A)·줄(L)·스타일(S)·조판 부호(R)·책갈피(B), 가기(D).
// 쪽·구역·줄은 번호 입력 칸과 목록(쪽·구역은 번호들, 줄은 첫 줄과 마지막 줄), 스타일·조판 부호·책갈피는 이름 목록이다.
// 입력 칸에 이름을 치면 목록에서 그 이름을 고른다. 어디로 가는지는 코어(goTo·goToPage·goToSection·bookmark)가 정한다.
const GOTO_KINDS = [["page", "쪽(P)"], ["section", "구역(A)"], ["line", "줄(L)"], ["style", "스타일(S)"], ["mark", "조판 부호(R)"], ["bookmark", "책갈피(B)"]];

export function GoToDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("page");
  const [number, setNumber] = useState(1);
  const [counts, setCounts] = useState({ page: 1, section: 1, line: 1 });
  const [names, setNames] = useState([]);
  const [styles, setStyles] = useState([]);
  const [marks, setMarks] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => {
    const onOpen = () => {
      void Promise.all([bookmarkView(), goToView()]).then(([view, more]) => {
        const list = String(view?.names || "").split("\n").filter(Boolean);
        setNames(list);
        setCounts({
          page: Math.max(1, Number(view?.pageCount) || 1),
          section: Math.max(1, Number(view?.sectionCount) || 1),
          line: Math.max(1, Number(more?.lineCount) || 1),
        });
        setStyles(String(more?.styles || "").split("\n").filter(Boolean).map((row) => {
          const cut = row.indexOf("\t");
          return [row.slice(0, cut), row.slice(cut + 1)];
        }));
        setMarks(String(more?.marks || "").split("\n").filter(Boolean));
        setNumber(1);
        setName("");
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-goto-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-goto-dialog", onOpen);
  }, []);

  const choices = kind === "style" ? styles.map(([, label]) => label) : kind === "mark" ? marks : kind === "bookmark" ? names : [];
  useEffect(() => {
    // 이름 목록으로 바꾸면 첫 이름을 고른다(한글은 열 때 목록 첫 줄이 골라져 있다).
    if (kind === "style" || kind === "mark" || kind === "bookmark") setName(choices[0] || "");
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const go = () => {
    const index = Math.max(1, Number(number) || 1);
    let done;
    if (kind === "page") done = goToPage(index - 1);
    else if (kind === "section") done = goToSection(index - 1);
    else if (kind === "line") done = goTo({ kind: "line", line: index });
    else if (kind === "style") {
      const found = styles.find(([, label]) => label === name);
      done = goTo({ kind: "style", style: found ? Number(found[0]) : -1 });
    } else if (kind === "mark") done = goTo({ kind: "mark", mark: name });
    else done = bookmark("goto", name);
    void done.then((result) => { if (result?.handled && !result?.error) close(); });
  };
  const numbered = kind === "page" || kind === "section" || kind === "line";
  const count = counts[kind] || 1;
  const numberList = kind === "line" ? (count > 1 ? [1, count] : [1]) : Array.from({ length: count }, (_, i) => i + 1);
  // 입력 칸에 친 글로 시작하는 이름을 고른다.
  const typeName = (text) => {
    setName(text);
    const hit = choices.find((item) => item.startsWith(text));
    if (hit && text) setName(hit);
  };

  return (
    <Frame open={open} onClose={close} title="찾아가기" description="쪽·구역·줄 번호, 스타일, 조판 부호, 책갈피로 캐럿을 옮깁니다.">
      <div className="flex gap-3">
        <div role="radiogroup" aria-label="찾아갈 곳" className="flex w-[7.5em] shrink-0 flex-col gap-1">
          {GOTO_KINDS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1">
              <input type="radio" checked={kind === value} onChange={() => { setKind(value); setNumber(1); }} />{label}
            </label>
          ))}
        </div>
        {numbered ? (
          <div className="flex flex-1 flex-col gap-2">
            <input type="number" min={1} max={count} className={`${box} text-right`} value={number} aria-label="번호"
              onChange={(event) => setNumber(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") go(); }} />
            <select className="ui-box min-h-[8em] rounded-md px-2" size={8} value={String(number)} onChange={(event) => setNumber(event.target.value)}
              onDoubleClick={go} aria-label="번호 목록">
              {numberList.map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <input className={box} value={name} aria-label="이름" onChange={(event) => typeName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") go(); }} />
            <select className="ui-box min-h-[8em] rounded-md px-2" size={8} value={name} onChange={(event) => setName(event.target.value)}
              onDoubleClick={go} disabled={choices.length === 0} aria-label="이름 목록">
              {choices.length === 0 ? <option value="">{kind === "bookmark" ? "책갈피가 없습니다" : "목록이 없습니다"}</option> : null}
              {choices.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={go} disabled={!numbered && !name}>가기(D)</button>
        <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
      </div>
    </Frame>
  );
}
