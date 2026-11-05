import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import pkg from "../package.json";
import { fontBase } from "./font-base.js";
import { openSourceGroups } from "./open-source.js";
import { useWide } from "./ui-actions.js";

// ClassingHWP 정보 창. 정보 · 오픈 소스 · 글꼴 세 탭이다.
// 오픈 소스는 open-source.js 의 고정 목록이고, 글꼴은 웹 빌드가 만든 fonts/licenses.json 을 읽는다.
// 파일 메뉴의 「ClassingHWP 정보」가 chwp-open-about 이벤트로 연다.

const tabs = ["정보", "오픈 소스", "글꼴"];
const contact = "shimverz@naver.com";

export function openAbout() {
  window.dispatchEvent(new Event("chwp-open-about"));
}

// 누르면 라이선스 전문을 읽어 펼친다. 여러 파일이면 이름별로 나눠 보인다.
function LicenseText({ urls }) {
  const [texts, setTexts] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all(
      urls.map((url) =>
        fetch(url)
          .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
          .then((text) => [url, text])
          .catch(() => [url, "전문을 읽지 못했어요."]),
      ),
    ).then((list) => {
      if (alive) setTexts(list);
    });
    return () => {
      alive = false;
    };
  }, [urls]);
  if (!texts) return <p className="px-3 pb-3 text-[0.85em] text-[#737373]">읽는 중…</p>;
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {texts.map(([url, text]) => (
        <div key={url} className="flex flex-col gap-1">
          {texts.length > 1 ? <span className="text-[0.8em] text-[#737373]">{url.split("/").pop()}</span> : null}
          <pre className="max-h-[18em] overflow-auto rounded-[0.45em] bg-[#fafafa] p-3 text-[0.78em] leading-[1.5] whitespace-pre-wrap shadow-[inset_0_0_0_1px_#e5e5e5]">
            {text.replace(/^﻿/, "")}
          </pre>
        </div>
      ))}
    </div>
  );
}

function LicenseRow({ title, meta, notice, urls }) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-[0.55em] shadow-[inset_0_0_0_1px_#e5e5e5]">
      <button
        type="button"
        className="ui-ghost flex w-full items-start gap-2 rounded-[0.55em] px-3 py-[0.55em] text-left"
        aria-expanded={open}
        disabled={!urls.length}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className={`mt-[0.2em] size-[1em] flex-none text-[#737373] ${urls.length ? "" : "opacity-0"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-[0.15em]">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{title}</span>
            {meta ? <span className="text-[0.85em] text-[#737373]">{meta}</span> : null}
          </span>
          {notice ? <span className="text-[0.82em] leading-[1.45] break-words whitespace-pre-line text-[#525252]">{notice}</span> : null}
        </span>
      </button>
      {open ? <LicenseText urls={urls} /> : null}
    </div>
  );
}

function InfoPanel() {
  return (
    <div className="flex flex-col gap-4 leading-[1.6]">
      <div className="flex items-center gap-3">
        <img src="/icons/icon.svg" alt="" className="size-12 rounded-[0.6em]" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <div className="flex flex-col">
          <span className="text-[1.25em] font-bold">ClassingHWP</span>
          <span className="text-[0.9em] text-[#737373]">버전 {pkg.version}</span>
        </div>
      </div>
      <p>한글 문서(.hwp · .hwpx)를 브라우저에서 보고 고치는 편집기예요.</p>
      <section className="flex flex-col gap-1">
        <h3 className="font-bold">라이선스</h3>
        <p>
          소스 공개(source-available) 프로그램이에요. Apache License 2.0 에 Commons Clause 를 더한 조건으로 배포해요.
          개인·기관 내부 사용과 수정본의 무료 재배포는 자유롭고, 판매·유료 서비스·광고를 붙인 서비스는 따로 협의가 필요해요.
          정확한 조건은 저장소의 LICENSE 파일(영문)을 따라요.
        </p>
        <p>
          문의: <a className="underline" href={`mailto:${contact}`}>{contact}</a>
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="font-bold">알림</h3>
        <p>본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.</p>
        <p className="text-[0.9em] text-[#737373]">한글과 한컴오피스는 한글과컴퓨터의 상표예요. 이 프로그램은 한글과컴퓨터가 만들거나 보증하지 않아요.</p>
      </section>
    </div>
  );
}

function OpenSourcePanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9em] text-[#737373]">이 프로그램에 들어간 오픈 소스예요. 이름을 누르면 라이선스 전문을 볼 수 있어요.</p>
      {openSourceGroups.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h3 className="font-bold">{group.title}</h3>
          {group.items.map((item) => (
            <LicenseRow key={item.id} title={item.name} meta={item.license} notice={item.notice} urls={[`/license/oss/${item.id}.txt`]} />
          ))}
        </section>
      ))}
    </div>
  );
}

const fontKinds = [
  ["ui", "화면 글꼴", ""],
  ["font", "함께 넣은 글꼴", "문서에 쓰인 글꼴을 그대로 보여 주려고 함께 넣은 글꼴이에요."],
  ["standin", "대체 글꼴", "라이선스 때문에 넣을 수 없는 글꼴을 비슷하게 보여 주는 읽기용 글꼴이에요. 원래 글꼴과는 다른 글꼴이고, 문서를 고치기 시작하면 곡선을 가져온 원본 OFL 글꼴로 바뀌어요."],
  ["symbol", "기호 글꼴", "글머리표처럼 기호 몇 개만 그리는 글꼴이에요."],
];

function FontPanel() {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    let alive = true;
    fetch(fontBase + "licenses.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => { if (alive) setList(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
    };
  }, []);
  const shown = useMemo(() => {
    if (!list) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((entry) =>
      [entry.name, entry.notice, ...(entry.faces || [])].some((text) => String(text || "").toLowerCase().includes(needle)),
    );
  }, [list, query]);
  if (failed) return <p className="text-[#737373]">글꼴 목록을 읽지 못했어요. 웹 빌드를 다시 해 주세요.</p>;
  if (!list) return <p className="text-[#737373]">읽는 중…</p>;
  let budget = limit;
  return (
    <div className="flex flex-col gap-4">
      <label className="ui-box flex h-[var(--ui-h)] items-center gap-2 rounded-[0.45em] px-3">
        <Search className="size-[1em] flex-none text-[#737373]" />
        <span className="sr-only">글꼴 찾기</span>
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          placeholder={`글꼴 ${list.length}개에서 찾기`}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(60); }}
        />
      </label>
      {fontKinds.map(([kind, title, note]) => {
        const items = shown.filter((entry) => entry.kind === kind);
        if (!items.length) return null;
        const visible = items.slice(0, Math.max(0, budget));
        budget -= visible.length;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h3 className="font-bold">
              {title} <span className="font-normal text-[#737373]">{items.length}</span>
            </h3>
            {note ? <p className="text-[0.85em] leading-[1.5] text-[#737373]">{note}</p> : null}
            {visible.map((entry) => (
              <LicenseRow
                key={`${kind}-${entry.name}`}
                title={entry.name}
                meta={kind === "standin" || kind === "symbol" ? (entry.faces || []).join(", ") : ""}
                notice={entry.notice}
                urls={(entry.files || []).map((file) => fontBase + file)}
              />
            ))}
            {visible.length < items.length && budget <= 0 ? (
              <button type="button" className="ui-outline h-[var(--ui-h)] rounded-[0.45em]" onClick={() => setLimit((value) => value + 120)}>
                더 보기 ({items.length - visible.length}개 남음)
              </button>
            ) : null}
          </section>
        );
      })}
      {!shown.length ? <p className="text-[#737373]">찾는 글꼴이 없어요.</p> : null}
    </div>
  );
}

function Panel({ tab }) {
  if (tab === "오픈 소스") return <OpenSourcePanel />;
  if (tab === "글꼴") return <FontPanel />;
  return <InfoPanel />;
}

function TabList({ tab, onTab, phone }) {
  return (
    <div role="tablist" className={`flex flex-none gap-1 bg-[#f5f5f5] p-1 ${phone ? "mx-[14px] mt-2 mb-1 rounded-[12px]" : "rounded-[0.55em]"}`}>
      {tabs.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={name === tab}
          className={`min-w-0 flex-1 whitespace-nowrap ${phone ? "h-11 rounded-[9px] text-[15px]" : "h-[calc(var(--ui-h)-0.2em)] rounded-[0.45em]"} ${name === tab ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#737373]"}`}
          onClick={() => onTab(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function AboutDialog() {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(tabs[0]);
  useEffect(() => {
    const onOpen = () => {
      setTab(tabs[0]);
      setOpen(true);
    };
    window.addEventListener("chwp-open-about", onOpen);
    return () => window.removeEventListener("chwp-open-about", onOpen);
  }, []);
  const close = () => setOpen(false);
  const content = wide
    ? "toolbar-ui ui-chrome fixed top-1/2 left-1/2 z-[80] flex h-[min(42em,calc(100dvh-1.5rem))] w-[min(44em,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-[0.9em] rounded-[0.7em] bg-white px-[1.35em] pt-[1.2em] pb-[1.35em] shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)] outline-none"
    : "toolbar-ui ui-chrome fixed inset-x-0 top-[40px] bottom-0 z-[80] flex flex-col rounded-t-[18px] bg-white text-[17px] outline-none";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={content} onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogPrimitive.Description className="sr-only">ClassingHWP 의 버전, 라이선스, 오픈 소스와 글꼴 정보예요.</DialogPrimitive.Description>
          <div className={`flex flex-none items-center ${wide ? "" : "h-[54px] pt-[10px] pr-2 pl-5"}`}>
            <DialogPrimitive.Title className={`flex-1 font-bold ${wide ? "text-[1.15em]" : "text-[20px]"}`}>ClassingHWP 정보</DialogPrimitive.Title>
            <button
              type="button"
              className={`ui-ghost flex items-center justify-center ${wide ? "size-[var(--ui-h)] rounded-[0.45em]" : "size-12 rounded-[10px]"}`}
              aria-label="닫기"
              onClick={close}
            >
              <X className={wide ? "size-[1.1em]" : "size-6"} />
            </button>
          </div>
          <TabList tab={tab} onTab={setTab} phone={!wide} />
          <div role="tabpanel" aria-label={tab} className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] ${wide ? "pr-1" : "px-[18px] pt-4 pb-[max(24px,env(safe-area-inset-bottom))]"}`}>
            <Panel tab={tab} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
