# 강동 블로그 → 유튜브 제작기 v2.1 사진 미리보기 수정

이번 수정은 사진 '수집'이 아니라 사진 '표시 방식'을 바꾼 버전입니다.

현재 증상:
- 사진 URL 60장 수집 성공
- 사진 카드에는 '불러오기 실패'

수정:
1. 사진 미리보기는 Naver 이미지 URL을 브라우저에서 직접 표시
2. referrerpolicy=no-referrer 적용
3. 직접 표시가 실패할 때만 /api/image 프록시로 1회 재시도
4. 장면 구성 썸네일도 같은 방식 적용
5. AI 사진 분석도 원본 Naver 이미지 URL을 우선 사용
6. 화면 버전 표시를 v2.1로 변경

적용 방법:
- 압축을 풀어 GitHub kangdong-blog-video 저장소의 파일을 같은 위치에 덮어쓰기
- index.html
- api/generate.js
- api/image.js (기존 유지 가능)
- api/extract.js (기존 v2 유지)
- Commit changes
- Vercel 자동 재배포 후 화면 상단에서 v2.1 확인
