# @classinghwp/viewer

한글 문서(`.hwp`, `.hwpx`)를 웹 페이지 안에서 보여 주는 보기와 React 컴포넌트입니다. 문서는 브라우저 안의 WebAssembly 엔진이 읽고 그립니다. 문서를 서버로 보내지 않습니다.

## 1. 엔진 폴더 올리기

`engine/` 폴더를 내 사이트에 그대로 올립니다. 기본 주소는 `/chwp/` 입니다.

```bash
cp -r node_modules/@classinghwp/viewer/engine public/chwp
```

엔진은 스레드 워커를 띄워서, 페이지와 같은 출처에 있어야 합니다.

## 2. 멀티스레드로 돌리기

페이지가 아래 두 헤더를 보내면 여러 스레드로 돕니다. 보내지 않으면 단일 스레드로 떨어져 느려집니다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Next.js 는 `next.config.mjs` 에 둡니다.

```js
export default {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    }];
  },
};
```

`require-corp` 를 쓰면 페이지가 다른 출처에서 받는 이미지·글꼴·iframe 도 그쪽이 허락해야 실립니다(`Cross-Origin-Resource-Policy` 또는 CORS).

## 3. React

```jsx
import { HwpViewer } from "@classinghwp/viewer/react";
import "@classinghwp/viewer/viewer.css";

export default function Page() {
  return <HwpViewer file="/docs/공문.hwpx" zoom="width" style={{ height: 700 }} />;
}
```

Next.js App Router 에서도 그대로 씁니다. 컴포넌트가 `"use client"` 입니다.

| 속성 | 뜻 |
|---|---|
| `file` | 문서 주소, `File`·`Blob`, `ArrayBuffer`·`Uint8Array`. 바뀌면 새로 엽니다 |
| `zoom` | `150`, `"page"`(쪽 맞춤), `"width"`(폭 맞춤), `"in"`, `"out"` |
| `page` | 1부터 센 쪽, `"next"`, `"prev"`, `"first"`, `"last"` |
| `view` | `"auto"`, `"single"`, `"two"`, `"grid"`(`cols`·`rows`, 최대 8) |
| `readOnly` | 보기 전용(기본 `true`) |
| `engine` | 엔진 폴더 주소(기본 `/chwp/`) |
| `fonts` | 글꼴 서버(아래) |
| `onReady(state)`, `onChange(state)`, `onError(error)` | 연 뒤, 쪽·배율·쪽 모양이 바뀔 때, 열지 못했을 때 |
| `ref` | 보기 인스턴스(아래 메서드) |

`state` 에는 `page`(1부터), `pageCount`, `percent`, `zoomMode`, `zoomLabel`, `gridMode`, `gridCols`, `gridRows` 가 있습니다.

## 4. React 없이

```js
import { createViewer } from "@classinghwp/viewer";
import "@classinghwp/viewer/viewer.css";

const viewer = createViewer(document.getElementById("doc"), { query: "?zoom=width" });
viewer.addEventListener("viewport", (event) => console.log(event.detail.page, event.detail.pageCount));
await viewer.open("/docs/공문.hwpx");
viewer.zoom("150");
viewer.page("next");
viewer.view("two");
viewer.destroy();
```

그릇(`#doc`)에는 크기를 줍니다. 한 페이지에 여러 개를 띄울 수 있고, 하나마다 엔진을 따로 띄웁니다.

## 5. 글꼴

문서 글꼴은 글꼴 서버에서 필요한 것만 받습니다. 기본은 ClassingHWP 글꼴 서버(`https://ede.kr/hwp/fonts/`)입니다.

```jsx
// 다른 서버
<HwpViewer fonts="https://fonts.example.com/hwp/" … />

// 목록만 고쳐 쓰기: 우리 목록을 받아 고친 값을 넘기고, 파일은 base 에서 받습니다.
const index = await fetch("https://ede.kr/hwp/fonts/index.json").then((r) => r.json());
<HwpViewer fonts={{ base: "https://ede.kr/hwp/fonts/", index: myIndex }} … />
```

`fonts` 의 `index`, `licenseSwap`, `replace` 는 주소이거나 이미 읽은 JSON 값입니다. 주지 않으면 `base` 아래의 `index.json`, `license-swap.json`, `replace.json` 을 읽습니다. 다른 출처의 글꼴 서버는 `Access-Control-Allow-Origin` 과 `Cross-Origin-Resource-Policy: cross-origin` 을 보내야 합니다.
