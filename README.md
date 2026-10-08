# 강동 블로그 → 유튜브 제작기 v4

## 새 기능
- 선택한 사진으로 실제 영상 생성
- OpenAI AI 음성 자동 생성
- 사진 자동 확대/이동 효과
- 장면별 자막 자동 표시
- 시작 제목 화면
- 마지막 강동자바라 1577-6084 화면
- 브라우저가 MP4 녹화를 지원하면 MP4 생성
- MP4를 지원하지 않는 브라우저에서는 WebM으로 자동 대체

## 권장
- Windows Chrome 또는 Edge 최신 버전
- 첫 테스트는 720p
- 영상 제작 중 해당 탭을 그대로 열어두기
- 노트북 절전 방지

## 설치
ZIP 내용을 GitHub `kangdong-blog-video` 저장소에 같은 위치로 덮어쓰기 후 Commit changes.
Vercel이 자동 재배포됩니다.

필수 파일
- index.html
- package.json
- api/extract.js
- api/generate.js
- api/image.js
- api/tts.js

기존 `OPENAI_API_KEY` 환경변수는 그대로 사용합니다.

## 사용 순서
1. 블로그 읽기
2. 사용할 사진 직접 체크
3. 초안 + 사진 배치
4. 음성/속도/화질 선택
5. 영상 만들기
6. 미리보기 확인
7. 영상 다운로드

## 주의
OpenAI TTS 정책에 맞게 영상 설명란에 AI 음성 사용 고지 문구가 자동 포함되도록 구성했습니다.
