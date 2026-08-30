-- 종류별로 근처에 몇 곳이 있는지 한 번에 센다.
-- 칩에 개수를 보여주려면 켜지지 않은 종류까지 세야 하므로
-- nearby_shelters 와 따로 둔다.
--
-- 여러 번 실행해도 안전합니다.

create or replace function nearby_counts(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer
) returns table (category text, n integer)
language sql stable security definer set search_path = public as $$
  with box as (
    select p_radius_m / 111320.0                                         as dlat,
           p_radius_m / (111320.0 * greatest(0.01, cos(radians(p_lat)))) as dlng
  )
  select s.category, count(*)::integer
  from shelters s, box b
  where s.lat between p_lat - b.dlat and p_lat + b.dlat
    and s.lng between p_lng - b.dlng and p_lng + b.dlng
    and 2 * 6371000 * asin(least(1, sqrt(
          power(sin(radians(s.lat - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(s.lat)) *
          power(sin(radians(s.lng - p_lng) / 2), 2)
        ))) <= p_radius_m
  group by s.category;
$$;

grant execute on function nearby_counts(double precision, double precision, integer)
  to anon, authenticated;

-- 확인: 의정부 호원동 반경 3km
select * from nearby_counts(37.7386, 127.0455, 3000);
