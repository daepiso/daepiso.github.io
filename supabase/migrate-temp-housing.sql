-- '침수'를 '이재민 임시주거시설'로 바꾸면서 종류 이름을 고친다.
-- 전국 단위 침수 대피소 데이터가 존재하지 않아 대체한 것이다.
-- flood 로 저장된 데이터는 아직 없으므로 그냥 이름만 바꾸면 된다.

alter table shelters drop constraint if exists shelters_category_check;

alter table shelters add constraint shelters_category_check
  check (category in ('civil_defense','earthquake','heat_cold','temp_housing'));

-- 확인: 지금 들어 있는 종류
select category, count(*) from shelters group by category;
