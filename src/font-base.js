// 글꼴 목록과 파일을 받는 곳. 기본은 이 앱과 같은 곳의 /fonts/ 이고, VITE_FONT_BASE 로 다른 서버를 가리킬 수 있다.
// 다른 출처의 서버는 Access-Control-Allow-Origin 과 Cross-Origin-Resource-Policy: cross-origin 을 보내야 한다.
export const fontBase = (import.meta.env.VITE_FONT_BASE || "/fonts/").replace(/\/?$/, "/");
