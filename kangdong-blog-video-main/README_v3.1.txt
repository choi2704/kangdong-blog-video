강동 블로그 → 유튜브 제작기 v3.1

이번 수정은 화면에 나온 오류:
400 Error while downloading file. Upstream status code: 404
를 해결하기 위한 버전입니다.

원인:
AI가 /api/image 또는 외부 이미지 URL을 직접 다운로드하려 할 때
일부 이미지가 404를 반환하면서 사진 묶음 전체 분석이 중단됐습니다.

v3.1 해결 방식:
1. Vercel 서버가 네이버 사진을 먼저 직접 다운로드
2. 사진을 base64 이미지 데이터로 바꿔 AI에게 전달
3. AI가 외부 URL을 다시 다운로드하지 않음
4. 60장을 10장씩 나눠 분석
5. 특정 사진/묶음이 실패해도 나머지 사진은 계속 분석
6. 다운로드 실패 사진은 자동 건너뜀
7. 화면 상단 버전 표시 v3.1

적용:
ZIP 전체를 GitHub kangdong-blog-video 저장소에 같은 위치로 덮어쓰기
→ Commit changes
→ Vercel 자동 재배포
→ 화면 상단 v3.1 확인

테스트:
블로그 읽기 → AI 사진 자동선택
