강동 블로그 → 유튜브 제작기 v3.2

문제:
v3.1은 AI 사진 자동선택 한 번에 60장을 다운로드하고 여러 번 AI 분석까지 해서
Vercel 함수 한 요청이 너무 오래 걸렸습니다.
화면에는 'AI가 사진 60장을 비교하는 중...'에서 멈춘 것처럼 보였습니다.

v3.2:
- 사진을 8장씩 나눠 분석
- 브라우저가 분석 API를 여러 번 호출
- 한 번에 최대 2묶음만 동시 처리
- 진행상태: 'AI 사진 분석 3/8 묶음 완료'처럼 표시
- 이미지 분석이 끝난 뒤 텍스트 결과만 최종 선택 API로 전달
- 최종 약 18장 자동 체크

추가 API:
api/analyze-images.js
api/final-select.js

적용:
ZIP 전체를 GitHub kangdong-blog-video 저장소에 덮어쓰기 → Commit changes
→ Vercel 자동 배포 → 화면 상단 v3.2 확인
