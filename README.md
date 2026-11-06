# ClassingHWP Web

한글 문서(`.hwp`, `.hwpx`)를 브라우저에서 보고 고치는 웹 앱이다. 문서 엔진은 [ClassingHWP/core](https://github.com/ClassingHWP/core) 를 서브모듈 `core/` 로 넣어 WebAssembly 로 빌드해 쓴다.

A browser-based viewer and editor for Hangul word processor documents (`.hwp`, `.hwpx`). The document engine comes from [ClassingHWP/core](https://github.com/ClassingHWP/core) as the `core/` submodule, compiled to WebAssembly. Source-available under Apache-2.0 with the Commons Clause.

> 아직 개발 중이다. 문서마다 한글과 다르게 보이는 곳이 있을 수 있다.

## 보기 전용과 편집기

앱은 두 화면으로 열린다.

| 화면 | 주소 | 하는 일 |
|---|---|---|
| 편집기 | https://ede.kr/hwp/editor | 문서를 열고 고치고, `.hwp`·`.hwpx` 로 저장한다 |
| 보기 전용 | [https://ede.kr/hwp/viewer](https://ede.kr/hwp/viewer?file=/hwp/samples/math-curriculum.hwp) | 문서를 읽기만 한다. 고치는 메뉴가 없다. 편집기로 넘어가는 단추는 `edit=1` 을 줄 때만 보인다 |

보기 전용 링크는 교육부 고시 「수학과 교육과정」(제2022-33호 [별책 8])을 열어 보여 준다. 직접 빌드해 띄운 앱도 같은 `/editor`, `/viewer` 주소를 쓴다.

### 주소로 문서 열기

`?file=` 에 문서 주소를 주면 그 문서를 바로 연다. 다른 곳의 문서는 `https` 주소여야 하고, 그 서버가 `Access-Control-Allow-Origin` 헤더를 보내야 한다.

```
https://ede.kr/hwp/viewer?file=https://example.com/공문.hwp
```

### 다른 페이지에 넣기

보기 전용 화면을 `iframe` 으로 넣으면 페이지 안에서 문서를 보여 줄 수 있다.

```html
<iframe src="https://ede.kr/hwp/viewer?file=https://example.com/공문.hwpx&zoom=width"
        width="100%" height="800" style="border: 0"></iframe>
```

#### 처음 보기 정하기

주소에 붙이면 문서를 연 뒤 쪽 모양, 배율, 쪽 차례로 맞춘다. 모르는 값은 건너뛴다.

| 인자 | 값 | 뜻 |
|---|---|---|
| `zoom` | `150`, `150%` | 배율(10~800%) |
| | `page`, `width` | 쪽 맞춤, 폭 맞춤 |
| `page` | `3`, `first`, `last` | 열 쪽(1부터). 넘치면 끝 쪽 |
| `view` | `auto`, `single`, `two`, `grid` | 쪽 모양: 자동, 한 쪽, 두 쪽, 여러 쪽 |
| `cols`, `rows` | `3`, `2` | `view=grid` 의 칸 수(최대 8, 주지 않으면 4×3) |
| `edit` | `1`, `0` | 편집기로 넘어가는 「편집」 단추를 보인다. 주지 않으면 숨긴다 |

```
https://ede.kr/hwp/viewer?file=https://example.com/공문.hwp&view=two&zoom=page&page=5
```

#### 페이지에서 다루기

열린 뒤에는 `postMessage` 로 명령을 보내고 알림을 받는다. 모든 메시지는 `chwp` 칸에 종류를 적는다.

보내는 명령:

| 메시지 | 하는 일 |
|---|---|
| `{ chwp: "zoom", value: 150 }` | 배율. `value` 는 `"150%"`, `"page"`, `"width"`, `"in"`(한 단계 확대), `"out"`(한 단계 축소)도 된다 |
| `{ chwp: "page", value: 5 }` | 쪽 이동. `"next"`, `"prev"`(한 줄씩), `"first"`, `"last"` 도 된다 |
| `{ chwp: "view", value: "grid", cols: 3, rows: 2 }` | 쪽 모양. `"auto"`, `"single"`, `"two"`, `"grid"` |
| `{ chwp: "edit", value: true }` | 「편집」 단추를 보인다. `false` 면 숨긴다 |
| `{ chwp: "state" }` | 지금 상태를 `state` 알림으로 받는다 |

받는 알림:

| `chwp` | 언제 |
|---|---|
| `ready` | 문서를 다 열었을 때. 이 뒤에 보낸 명령만 듣는다 |
| `change` | 배율, 쪽, 쪽 모양이 바뀔 때. 사용자가 휠·손가락으로 바꿔도 온다 |
| `state` | `{ chwp: "state" }` 에 대한 답 |
| `error` | 문서를 열지 못했을 때. `message` 에 까닭이 있다 |

`ready`·`change`·`state` 에 담기는 값:

| 칸 | 뜻 |
|---|---|
| `page`, `pageCount` | 지금 쪽(1부터, 화면 가운데 쪽)과 전체 쪽 수 |
| `percent` | 지금 배율(%) |
| `zoomMode` | `percent`, `fitPage`(쪽 맞춤), `fitWidth`(폭 맞춤) |
| `zoomLabel` | 화면에 보일 배율 글(`150%`, `쪽 맞춤`) |
| `view`, `cols`, `rows` | 쪽 모양과 칸 수 |
| `edit` | 「편집」 단추가 보이는지 |

배율이 부드럽게 바뀌는 동안에는 `change` 가 여러 번 온다. 알림에는 문서 내용이 없다.

```html
<button id="out">−</button> <span id="info"></span> <button id="in">+</button>
<iframe id="doc" src="https://ede.kr/hwp/viewer?file=https://example.com/공문.hwpx"
        width="100%" height="800" style="border: 0"></iframe>
<script>
  const doc = document.getElementById("doc");
  const send = (msg) => doc.contentWindow.postMessage(msg, "https://ede.kr");
  document.getElementById("in").onclick = () => send({ chwp: "zoom", value: "in" });
  document.getElementById("out").onclick = () => send({ chwp: "zoom", value: "out" });
  window.addEventListener("message", (event) => {
    if (event.source !== doc.contentWindow) return;
    const { chwp, page, pageCount, zoomLabel } = event.data || {};
    if (chwp === "ready" || chwp === "change") {
      document.getElementById("info").textContent = `${page} / ${pageCount}쪽 · ${zoomLabel}`;
    }
  });
</script>
```

### 내 페이지에 직접 넣기 (React·Next.js)

iframe 없이 내 사이트에서 엔진까지 돌리려면 보기 패키지 `@classinghwp/viewer` 를 쓴다. [릴리스](https://github.com/ClassingHWP/web/releases)의 `classinghwp-viewer-<버전>.tgz` 를 바로 설치한다.

```bash
npm install https://github.com/ClassingHWP/web/releases/download/v0.2.2/classinghwp-viewer-0.2.2.tgz
cp -r node_modules/@classinghwp/viewer/engine public/chwp
```

```jsx
import { HwpViewer } from "@classinghwp/viewer/react";
import "@classinghwp/viewer/viewer.css";

<HwpViewer file="/docs/공문.hwpx" zoom="width" style={{ height: 700 }} onChange={(s) => console.log(s.page)} />
```

- `engine/` 폴더는 내 사이트의 `/chwp/` 에 올린다. 엔진의 스레드 워커는 같은 출처에서만 뜬다.
- 여러 스레드로 돌리려면 페이지가 `Cross-Origin-Opener-Policy: same-origin` 과 `Cross-Origin-Embedder-Policy: require-corp` 를 보낸다. 보내지 않으면 단일 스레드로 떨어진다.
- 글꼴은 기본으로 ClassingHWP 글꼴 서버에서 받는다. `fonts` 로 다른 서버를 가리키거나 고친 글꼴 목록을 넘길 수 있다.
- React 없이는 `createViewer(element, options)` 를 쓴다. 속성·메서드·알림은 패키지의 README(`viewer-package.md`)에 있다.

패키지는 `npm run build:viewer` 로 만들고 `build/viewer` 에 생긴다(엔진 WASM 을 먼저 빌드한다).

화면 없이 엔진만 불러 문서를 그리거나 글자를 뽑으려면 [ClassingHWP/core 릴리스](https://github.com/ClassingHWP/core/releases)의 WASM 파일을 쓴다. 부르는 법은 이 저장소의 `src/core-worker.js` 를 본다.

## 받기

```bash
git clone --recursive https://github.com/ClassingHWP/web.git
```

이미 받았다면 서브모듈을 따로 받는다.

```bash
git submodule update --init
```

## 빌드

### 1. 문서 엔진 (WebAssembly)

`core/` 의 [README](https://github.com/ClassingHWP/core#readme) 순서대로 Skia 를 준비하고 WASM 을 빌드한다. 결과물은 `core/build/wasm-release/bindings/wasm/` 에 생긴다.

```bash
cd core
source <emsdk>/emsdk_env.sh
cmake --preset wasm-release
cmake --build build/wasm-release
cd ..
```

### 2. 웹 앱

Node.js 22 가 필요하다.

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # build/web 에 결과물
```

경로는 `paths.mjs` 가 정한다.

## 글꼴

저장소에는 글꼴이 없다. 앱은 `.env` 의 `VITE_FONT_BASE` 가 가리키는 글꼴 서버(`https://ede.kr/hwp/fonts/`)에서 글꼴 목록과 파일, 라이선스 글을 받는다. 글꼴마다의 라이선스와 출처는 앱의 **파일 → ClassingHWP 정보 → 글꼴** 에 있다.

## 라이선스

[Apache License 2.0](LICENSE) 에 **Commons Clause** 조건을 더한 소스 공개(source-available) 라이선스다. OSI 오픈 소스가 아니다.

- 개인 사용, 회사·기관 내부 사용, 수정본의 무료 재배포는 자유롭다.
- 판매, 유료·광고 서비스, 유료 제품 번들은 따로 협의해야 한다.

한국어 요약은 [LICENSE.ko.md](LICENSE.ko.md), 함께 들어간 라이브러리와 글꼴은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 를 본다.

## 알림

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

한글과 한컴오피스는 한글과컴퓨터의 상표다. 이 프로그램은 한글과컴퓨터가 만들거나 보증하지 않는다.

## 문의

shimverz@naver.com
