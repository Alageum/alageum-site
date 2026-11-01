# Публичные корпоративные страницы: источники

Проверено 1 октября 2026 года. Эта версия дополняет исходный реестр
`public-content-sources.md`; исходные продуктовые данные не изменены.

## Корпоративная информация

- https://alageum.com/ru/kompaniya/o-nas — направления, полный цикл и миссия группы.
- https://alageum.com/ru/kompaniya/istoriya — начало истории в 1997 году, управляющая компания в 2012 году.
- https://alageum.com/ru/predpriyatiya/too-aemz — присоединение АЭМЗ в 1999 году.
- https://alageum.com/ru/predpriyatiya/too-petropavlovskij-elektrotekhnicheskij-zavod — открытие ПЭТЗ в 2021 году.
- Ранее проверенные шесть профилей предприятий, источники каждой записи в `frontend/lib/public/content.js`, сохранены.
- Количество 238 на главной вычисляется из существующего справочного каталога; это не число утверждённых товарных SKU.
- Количество 5 относится к направлениям каталога. Не добавлены неподтверждённые показатели выручки, сотрудников, филиалов, экспорта или мощностей.

## Контактная информация

https://alageum.com/ru/kontakty повторно просмотрена 01.10.2026.

Сохранён единый отдел продаж: +7 771 005 22 22 / sales@alageum.com.
Добавлены опубликованные отделы продаж в Актау, Атырау, Туркестане, Актобе,
Уральске, Усть-Каменогорске, Караганде, Павлодаре к ранее существовавшим Астане,
Алматы, Шымкенту. Использован один опубликованный номер для каждого города.
Названия улиц приведены с нормализованной пунктуацией.

Контакты шести предприятий вынесены отдельно от городских отделов продаж.
КТЗ и Asia Trafo: телефон отдела продаж, электронная почта приёмной, явно
помеченная в интерфейсе. Для Asia Trafo добавочный 208 виден, а телефонная ссылка
набирает основной номер. АЭМЗ: опубликованный адрес **отдела продаж** на Земнухова,
не утверждение о заводской проходной. ЭЛМО: общий контакт, адрес в Алматы;
производственная деятельность по Казахстану в старом профиле сохранена.

Персональные менеджеры, SLA, часы работы, автоматическая доставка обращения,
точные маршруты до проходных и адреса отгрузки не заявлены.

## География

Виджет загружается полностью с сайта, без стороннего SDK, геолокации, запросов
к внешним картам и cookies картографического сервиса. Города фильтруют реальные
профили предприятий; URL сохраняет выбор, поддерживает Back/Forward.

Граница Казахстана: Natural Earth 1:110m, public domain.
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
https://www.naturalearthdata.com/about/terms-of-use/

Граница преобразована в статический SVG path; эквидистантная цилиндрическая
проекция применяется одинаково к контуру и центрам городов. Это обзорная карта,
не навигационная карта или план предприятия.

Центры городов: GeoNames, CC BY 4.0; ссылки на GeoNames и Natural Earth доступны
непосредственно под картой. Координаты относятся **только к городам**.

- Кентау: 43.51672, 68.50463 — https://www.geonames.org/1522751/kentau.html
- Шымкент: 42.31, 69.6 — https://www.geonames.org/KZ/largest-cities-in-kazakhstan.html
- Алматы: 43.25248866, 76.911499 — https://www.geonames.org/advanced-search.html?q=Almaty%2CKazakhstan
- Уральск: 51.24601485, 51.42557596 — https://www.geonames.org/search.html?q=Oral%2F
- Петропавловск: 54.87343494, 69.15064943 — https://www.geonames.org/search.html?country=KZ

## Фотографии

Использованы реальные изображения с официальных профилей предприятий, без
генерации несуществующего производства. Локальные WebP оптимизированы из JPEG;
файлы не содержат внешних запросов/метаданных посетителя. В интерфейсе указаны
предприятия, к которым относятся фотографии. Фотографии исторические, не
подтверждение текущей комплектации цеха или персонального состава.

- `frontend/public/company/ktz-production.webp`: фото из профиля КТЗ
  https://alageum.com/images/zavodi/ktz/2.jpg
  https://alageum.com/ru/predpriyatiya/ao-ktz
- `frontend/public/company/aemz-engineers.webp`: фото из профиля АЭМЗ
  https://alageum.com/images/elmenti/almatinskiy.jpg
  https://alageum.com/ru/predpriyatiya/too-aemz

До производственной публикации владелец сайта должен подтвердить возможность
повторного использования этих корпоративных фотографий и окончательную редакцию
текстов. Публичная доступность исходника сама по себе не устанавливает лицензию.


### Enterprise map boundaries — 2026-11-01

`frontend/lib/public/enterprise-map-boundaries.js` contains local projected SVG
geometry from © OpenStreetMap contributors, licensed under ODbL 1.0
(https://www.openstreetmap.org/copyright). The map includes 17 oblasts, Astana,
Almaty and Shymkent, plus the administrative outlines of the six enterprise
cities / municipalities. The Kentau outline is its municipal administration.
OSM relation IDs are retained with every path.

Retrieved through https://nominatim.openstreetmap.org/search using structured
city/state queries restricted to `countrycodes=kz`, `format=geojson`,
`polygon_geojson=1`, `limit=1`. Region geometry uses `polygon_threshold=0.01`;
city geometry uses `0.002` (Almaty: `0.005`). SVG projection matches `cityPoint`:
x = (longitude - 45) / 44 * 820; y = (57 - latitude) / 18 * 460.
These are generalized administrative outlines, not factory locations.
No runtime map provider requests are needed.

The enterprise-map schematic hides republican-city borders. Display-only paths
fill the Almaty, Shymkent and Astana enclaves in their surrounding oblasts; original
administrative paths remain unchanged in the source dataset. This is a visual
grouping for enterprise navigation, not a change to administrative status.


### Enterprise map: production sites and sales offices — 2026-11-01

The user supplied 18 2GIS search results (two residential listings excluded;
the two Kentau listings refer to one address). Map-only records live in
`frontend/lib/public/enterprise-map-locations.js`; canonical manufacturer
profiles and the separate public contacts directory are preserved.

The resulting map has 18 locations in 12 cities: 8 existing enterprises and
10 additional sales/company locations. Shared-address listings are represented
with aliases / co-location notes, not duplicate markers. Alageum Trade at
Utegen Batyra 7/1 is noted alongside the existing Elektromontazh site; no
legal-entity identity is inferred. The Aktau plant address is attached to the
existing Batys Electric profile, whose official source URL already identifies
the Aktau transformer plant.

Added cities: Astana, Karaganda, Oskemen, Pavlodar, Atyrau, Aktobe. Centres
come from OpenStreetMap via Nominatim, with source URLs retained in mapCities.
Markers identify cities and never claim precise street-address geocoding.
Astana follows the existing schematic visual grouping with Akmola, without
changing its administrative status.

Supplied 2GIS sources (tracking parameters removed):
- https://2gis.kz/search/Alageum
- https://2gis.kz/pavlodar/firm/70000001084532750
- https://2gis.kz/atyrau/firm/70000001035476240
- https://2gis.kz/aktobe/firm/70000001032733799
- https://2gis.kz/uralsk/firm/70000001025237296
- https://2gis.kz/aktau/firm/70000001030328909

Office contacts are reused from the established official contacts register
https://alageum.com/ru/kontakty when address/site matches. Other listings use
the explicitly labelled central sales contact, without inventing branch numbers.
Karaganda's supplied Bukhar-Zhyrau 92/2 address differs from the official
Kamsskaya 85 listing; both are shown in one card with sources. Shymkent's
Zhibek Zholy 142/2 listing also retains the official Tassay 142/2 description.
Ratings, opening hours, reviews and residential developments are not imported.


### Shared company metrics — Forbes profile, December 2025

Updated 2026-11-01 from https://forbes.kz/ranking/object/1044 (the 2025 edition,
not the historical sections below it). The shared CompanyMetrics component on
the home, company and investor pages now uses 4,100 staff, rank 25 out of 75,
revenue KZT 198.47 billion and net profit KZT 26.64 billion. Financial figures
refer to 2024, distinct from the December 2025 publication. Staff is labelled
as the publication’s figure, not a verified current 2026 headcount.

Corporate-profile charts (14 factories, 40 offices, 6 international
representative offices, 2 engineering centres and 80% local content) retain
their separate original provenance and unspecified reporting period. These
counts are not attributed to Forbes or inferred from the website’s map.
The historical source material is preserved.
