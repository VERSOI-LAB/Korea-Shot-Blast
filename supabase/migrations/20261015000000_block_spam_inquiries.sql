-- 홈페이지 문의 스팸봇 차단.
-- homepage.html / send-inquiry-email 함수와 같은 기준으로, 스팸으로 판단되면 저장 자체를 거부한다.
-- (봇이 홈페이지를 거치지 않고 API 로 직접 insert 하는 경우까지 막기 위함)

create or replace function public.inquiry_looks_random(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    length(btrim(v)) >= 10
    and btrim(v) ~ '^[A-Za-z]+$'
    and regexp_count(btrim(v), '[a-z][A-Z]') >= 2,
    false
  );
$$;

create or replace function public.inquiry_is_spam(r public.inquiries)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- 연락처: 0(국내) 또는 +(해외)로 시작, 숫자 8~15자리
    not coalesce(
      btrim(r.phone) ~ '^[0-9+()\s.-]+$'
      and btrim(r.phone) ~ '^(\+|0)'
      and length(regexp_replace(r.phone, '\D', '', 'g')) between 8 and 15,
      false
    )
    -- 점이 4개 이상 들어간 gmail 주소
    or coalesce(
      lower(btrim(r.email)) ~ '^[^@]*(\.[^@]*){4,}@(gmail|googlemail)\.com$',
      false
    )
    -- 무작위 대소문자 문자열이 2칸 이상
    or (
      public.inquiry_looks_random(r.company)::int
      + public.inquiry_looks_random(r.contact_name)::int
      + public.inquiry_looks_random(r.product_size)::int
      + public.inquiry_looks_random(r.daily_qty)::int
      + public.inquiry_looks_random(r.processing_qty)::int
      + public.inquiry_looks_random(r.message)::int
    ) >= 2;
$$;

create or replace function public.reject_spam_inquiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.inquiry_is_spam(new) then
    raise exception 'inquiry rejected as spam' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_spam_inquiry on public.inquiries;
create trigger reject_spam_inquiry
  before insert on public.inquiries
  for each row execute function public.reject_spam_inquiry();
