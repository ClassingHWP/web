import { useEffect, useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { pageControl, pageControlFields, toast } from "./ui-actions.js";

// 메모(한글 2024 InsertFieldMemo·메모 고치기). 블록(없으면 캐럿 자리)에 메모를 걸고 메모 글을 넣는다.
// 고치기는 캐럿이 든 메모의 글을 바꾼다. 상자 배치와 저장은 코어가 한다(insertMemo·editMemo·deleteMemo).
// 작성자 이름은 이 브라우저에만 기억해 둔다.

const authorKey = "chwp-memo-author";

function storedAuthor() {
  try {
    return window.localStorage.getItem(authorKey) || "";
  } catch {
    return "";
  }
}

function rememberAuthor(name) {
  try {
    window.localStorage.setItem(authorKey, name);
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다.
  }
}

export function openMemoDialog(mode = "insert") {
  window.dispatchEvent(new CustomEvent("chwp-open-memo-dialog", { detail: mode }));
}

export function deleteMemo() {
  return pageControl("deleteMemo");
}

export function MemoDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("insert");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  useEffect(() => {
    const onOpen = (event) => {
      const next = event.detail === "edit" ? "edit" : "insert";
      if (next === "edit") {
        void pageControlFields("editMemo").then((view) => {
          if (!view?.inMemo) {
            toast("캐럿 자리에 메모가 없습니다.", "info", null, { key: "memo" });
            return;
          }
          setMode("edit");
          setText(typeof view.text === "string" ? view.text : "");
          setAuthor(typeof view.author === "string" ? view.author : "");
          setOpen(true);
        });
        return;
      }
      setMode("insert");
      setText("");
      setAuthor(storedAuthor());
      setOpen(true);
    };
    window.addEventListener("chwp-open-memo-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-memo-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    if (mode === "insert") rememberAuthor(author);
    void pageControl(mode === "edit" ? "editMemo" : "insertMemo", { text, author }).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  return (
    <Frame open={open} onClose={close} title={mode === "edit" ? "메모 고치기" : "메모 넣기"}
      description="메모 글을 쓰면 본문 오른쪽 메모 영역에 상자로 보입니다." onApply={apply}>
      <label className="flex flex-col gap-1">
        <span>작성자</span>
        <input className="ui-box h-9 rounded-md px-2 disabled:opacity-60" aria-label="작성자" value={author}
          disabled={mode === "edit"} onChange={(event) => setAuthor(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>메모 글</span>
        <textarea className="ui-box min-h-[8em] rounded-md p-2" aria-label="메모 글" value={text}
          onChange={(event) => setText(event.target.value)} />
      </label>
    </Frame>
  );
}
