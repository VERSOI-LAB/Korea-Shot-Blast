-- 문의 저장을 submit-inquiry 함수(봇 인증 확인 후 service role 로 insert)로만 허용한다.
-- 브라우저에서 inquiries 테이블에 직접 insert 하던 경로를 닫아, 봇이 봇 인증을 건너뛰지 못하게 한다.
-- ⚠️ submit-inquiry 를 사용하는 새 homepage.html 이 배포된 뒤에 적용할 것.
--    (이전 홈페이지는 직접 insert 하므로, 먼저 적용하면 문의 접수가 실패한다)
drop policy if exists "anyone can submit inquiry" on public.inquiries;
