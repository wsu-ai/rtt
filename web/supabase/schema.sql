-- 실시간 강의 통역 — 방(room) 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (이미 만들었어도 다시 Run 해도 안전)
-- 자막/언어분포는 Realtime Broadcast/Presence로 처리하므로 추가 테이블이 없습니다.

create table if not exists public.rooms (
  code        text primary key '12261105',             -- 입장 코드
  password    text not null,                -- 방 비밀번호 (RPC로만 검증)
  source_lang text not null default 'ko',   -- 교수 발화 언어 (BCP-47)
  title       text,                         -- 강의명
  status      text not null default 'live', -- (미사용, 호환용)
  created_at  timestamptz not null default now()
);

-- 하트비트 컬럼: 교수자 화면이 열려 있는 동안 갱신된다. 이미 있으면 무시.
alter table public.rooms add column if not exists last_seen timestamptz not null default now();

-- 직접 접근 차단(기본 거부). 모든 접근은 아래 security definer 함수로만.
alter table public.rooms enable row level security;

-- 방 생성: 오래된 방 먼저 정리 → 삽입. 같은 코드가 "살아있으면" 'taken'(가로채기 방지),
-- 죽은(만료된) 코드라면 정리됐으니 재사용 가능.
create or replace function public.create_room(
  p_code text, p_password text, p_source_lang text, p_title text
) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from public.rooms
   where last_seen < now() - interval '6 minutes'
      or created_at < now() - interval '3 hours';
  insert into public.rooms(code, password, source_lang, title, last_seen)
  values (p_code, p_password, p_source_lang, coalesce(p_title, ''), now());
  return 'created';
exception when unique_violation then
  return 'taken';
end; $$;

-- 입장 검증: 정리 후, "살아있는" 방(하트비트 6분 내 & 생성 3시간 내)만 반환. 비번은 노출 안 함.
create or replace function public.verify_room(
  p_code text, p_password text
) returns table(code text, source_lang text, title text)
language sql security definer set search_path = public as $$
  with del as (
    delete from public.rooms
     where last_seen < now() - interval '6 minutes'
        or created_at < now() - interval '3 hours'
    returning 1
  )
  select r.code, r.source_lang, r.title
  from public.rooms r
  where r.code = p_code and r.password = p_password
    and r.last_seen > now() - interval '6 minutes'
    and r.created_at > now() - interval '3 hours';
$$;

-- 하트비트: 교수자 화면이 열려 있는 동안 ~5분마다 호출(실패 시 클라이언트가 25초 간격 재시도).
-- 생성 3시간 지난 방은 되살리지 않음.
create or replace function public.touch_room(
  p_code text, p_password text
) returns void
language sql security definer set search_path = public as $$
  update public.rooms set last_seen = now()
  where code = p_code and password = p_password
    and created_at > now() - interval '3 hours';
$$;

-- 강의 종료: 즉시 삭제(교수가 뒤로 나가거나 탭 닫을 때).
create or replace function public.end_room(
  p_code text, p_password text
) returns void
language sql security definer set search_path = public as $$
  delete from public.rooms where code = p_code and password = p_password;
$$;

grant execute on function public.create_room(text, text, text, text) to anon;
grant execute on function public.verify_room(text, text) to anon;
grant execute on function public.touch_room(text, text) to anon;
grant execute on function public.end_room(text, text) to anon;
