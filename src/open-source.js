// ClassingHWP 정보 창의 오픈 소스 목록. 빌드 결과(웹 앱과 WASM)에 들어가는 코드만 적는다.
// 라이선스 전문은 public/license/oss/<id>.txt 에 그 버전의 원문을 복사해 둔다. 버전을 올리면 전문도 다시 복사한다.

export const openSourceGroups = [
  {
    title: "문서 엔진 (WASM)",
    items: [
      { id: "skia", name: "Skia (M157)", license: "BSD-3-Clause", notice: "Copyright (c) 2011 Google Inc.", url: "https://skia.org" },
      { id: "dawn", name: "Dawn (WebGPU)", license: "BSD-3-Clause", notice: "Copyright 2017-2026 The Dawn & Tint Authors", url: "https://dawn.googlesource.com/dawn" },
      { id: "freetype", name: "FreeType 2.13.3", license: "FreeType License (FTL)", notice: "Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved.", url: "https://freetype.org" },
      { id: "brotli", name: "Brotli 1.1.0", license: "MIT", notice: "Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.", url: "https://github.com/google/brotli" },
      { id: "woff2", name: "WOFF2 1.0.2", license: "MIT", notice: "Copyright (c) 2013-2017 by the WOFF2 Authors.", url: "https://github.com/google/woff2" },
      { id: "miniz", name: "miniz 3.0.2", license: "MIT", notice: "Copyright 2013-2014 RAD Game Tools and Valve Software", url: "https://github.com/richgel999/miniz" },
      { id: "pugixml", name: "pugixml 1.14", license: "MIT", notice: "Copyright (c) 2006-2023 Arseny Kapoulkine", url: "https://pugixml.org" },
      { id: "lz4", name: "LZ4", license: "BSD-2-Clause", notice: "Copyright (C) 2011-2023, Yann Collet.", url: "https://github.com/lz4/lz4" },
      { id: "stb", name: "stb_image · stb_truetype", license: "MIT 또는 퍼블릭 도메인", notice: "Copyright (c) 2017 Sean Barrett", url: "https://github.com/nothings/stb" },
      { id: "emscripten", name: "Emscripten", license: "MIT", notice: "Copyright (c) 2010-2014 Emscripten authors", url: "https://emscripten.org" },
    ],
  },
  {
    title: "화면 (웹)",
    items: [
      { id: "react", name: "React 19.3", license: "MIT", notice: "Copyright (c) Meta Platforms, Inc. and affiliates.", url: "https://react.dev" },
      { id: "react-dom", name: "React DOM 19.3", license: "MIT", notice: "Copyright (c) Meta Platforms, Inc. and affiliates.", url: "https://react.dev" },
      { id: "scheduler", name: "scheduler 0.28", license: "MIT", notice: "Copyright (c) Meta Platforms, Inc. and affiliates.", url: "https://github.com/facebook/react" },
      { id: "react-router", name: "React Router 7.18", license: "MIT", notice: "Copyright (c) React Training LLC 2015-2019, Remix Software Inc. 2020-2021, Shopify Inc. 2022-2023", url: "https://reactrouter.com" },
      { id: "radix-ui", name: "Radix UI 1.8", license: "MIT", notice: "Copyright (c) 2022 WorkOS", url: "https://www.radix-ui.com" },
      { id: "floating-ui", name: "Floating UI", license: "MIT", notice: "Copyright (c) 2021-present Floating UI contributors", url: "https://floating-ui.com" },
      { id: "lucide", name: "Lucide 1.59", license: "ISC", notice: "Copyright (c) Lucide Icons and Contributors", url: "https://lucide.dev" },
      { id: "tailwindcss", name: "Tailwind CSS 4.3", license: "MIT", notice: "Copyright (c) Tailwind Labs, Inc.", url: "https://tailwindcss.com" },
      { id: "tailwind-merge", name: "tailwind-merge 3.7", license: "MIT", notice: "Copyright (c) 2021 Dany Castillo", url: "https://github.com/dcastil/tailwind-merge" },
      { id: "class-variance-authority", name: "class-variance-authority 0.7", license: "Apache-2.0", notice: "Copyright 2022 Joe Bell", url: "https://cva.style" },
      { id: "clsx", name: "clsx 2.1", license: "MIT", notice: "Copyright (c) Luke Edwards", url: "https://github.com/lukeed/clsx" },
    ],
  },
];
