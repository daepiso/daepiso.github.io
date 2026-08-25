-- 1) 종류별 건수
select category, count(*) as 건수 from shelters group by category;

-- 2) 좌표가 한국 밖인 것 (0이어야 정상)
select count(*) as 좌표이상
from shelters
where lat not between 33 and 39 or lng not between 124 and 132;

-- 3) 강남역 반경 3km 대피소 (가까운 순 5곳)
select name, address, distance_m
from nearby_shelters(37.4979, 127.0276, 3000, array['civil_defense'])
limit 5;
