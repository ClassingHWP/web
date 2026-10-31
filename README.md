# ClassingHWP Web

한글 문서(`.hwp`, `.hwpx`)를 브라우저에서 보고 고치는 웹 앱이다. 문서 엔진은 [ClassingHWP/core](https://github.com/ClassingHWP/core) 를 서브모듈 `core/` 로 넣어 WebAssembly 로 빌드해 쓴다.

A browser-based viewer and editor for Hangul word processor documents (`.hwp`, `.hwpx`). The document engine comes from [ClassingHWP/core](https://github.com/ClassingHWP/core) as the `core/` submodule, compiled to WebAssembly. Source-available under Apache-2.0 with the Commons Clause.

> 아직 개발 중이다. 문서마다 한글과 다르게 보이는 곳이 있을 수 있다.

## 보기 전용과 편집기

앱은 두 화면으로 열린다.

| 화면 | 주소 | 하는 일 |
|---|---|---|
| 편집기 | https://ede.kr/hwp/editor | 문서를 열고 고치고, `.hwp`·`.hwpx` 로 저장한다 |
| 보기 전용 | https://ede.kr/hwp/viewer | 문서를 읽기만 한다. 고치는 메뉴가 없고, 편집기로 넘어가는 단추가 있다 |

직접 빌드해 띄운 앱도 같은 `/editor`, `/viewer` 주소를 쓴다.

### 주소로 문서 열기

`?file=` 에 문서 주소를 주면 그 문서를 바로 연다. 다른 곳의 문서는 `https` 주소여야 하고, 그 서버가 `Access-Control-Allow-Origin` 헤더를 보내야 한다.

```
https://ede.kr/hwp/viewer?file=https://example.com/공문.hwp
```

### 다른 페이지에 넣기

보기 전용 화면을 `iframe` 으로 넣으면 페이지 안에서 문서를 보여 줄 수 있다.

```html
<iframe src="https://ede.kr/hwp/viewer?file=https://example.com/공문.hwpx"
        width="100%" height="800" style="border: 0"></iframe>
```

화면 없이 엔진만 불러 문서를 그리거나 글자를 뽑으려면 [ClassingHWP/core 의 WASM 사용 예제](https://github.com/ClassingHWP/core#wasm-사용-예제) 를 본다.

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
