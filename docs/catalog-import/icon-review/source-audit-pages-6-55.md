# ALAGEUM icon audit A: source pages 6–55

Inspected 2026-10-01. Scope: 32 families; 31 original family image crops plus text-only ГРЩ page 32. All records and all 3D mappings remain unchanged.

## Deliverables
- `frontend/lib/catalog/models/sourceIconShapesA.js`: 20 reusable, standalone SVG path constructions at 64 × 64; fill none, currentColor stroke 1.7, round joins/caps.
- `frontend/lib/catalog/models/sourceIconMapA.js`: 32 family maps and 24 explicit variant maps.
- `/workspace/shared/alageum-icon-audit-a.png`: visual review sheet at 40 px and 128 px.

## Meaning and guardrails
- `source-based`: the visible family construction is derived from inspected source artwork; never a dimensional drawing or exact SKU façade.
- `typical`: approximate family example or variant whose exact construction is not bound to the inspected picture.
- Source scans remain the reference for connections, technical details, proportions, and specific executions.
- Every source-matched existing construction is reused without changing the original 3D registry.

## Special decisions
- БКТП and 2БКТП: generic family icon is typical. v001 uses the single-transformer building on p38 with wide paired gates and a separate side door. v002 uses the three-module elevation with a central opening on p39. No cross-inheritance.
- КТПП/2КТПП: p15 depicts a double-ended indoor lineup with transformers outside the central RU rows. Its family icon is typical because the family includes single- and double-transformer layouts.
- КСО-2-20: p27 is a cutaway, so the icon preserves the open frame, three apparatus columns, and raised side relay box; no fabricated closed front.
- КМ-7М: p53 explicitly says the drawout compartment has no door. The icon keeps that compartment visibly open.
- ШНН: both p35 example constructions are represented (single front panel/open side frame and gridded feeder panel). All 18 variant icons are typical: no exact designation is asserted by an unlabeled example.
- КТПС: inspected p19 for 100–630 and p20 for 1000–1600; shared raised platform/rail/ladder construction. v007 is explicitly anchored to p20.
- ГРЩ: p32 has text/tables and no external-view drawing. A clearly typical multi-panel switchboard symbol is used.
- КТПБ(К): p55 is an outdoor switchyard example for 35 kV, not a modular building. v001 is source-based; v002/v003 are typical pending a separately confirmed 110/220 kV view.

## Family-by-family review
- cat-ktp-25-250: substation; source-based; pp. 6; inherit=true. Сборка из двухъярусного шкафа с верхними вводами и открытого трансформатора на общей платформе; не мачтовая МТП. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-ktpn-25-3150: compact-substation; source-based; pp. 8; inherit=true. Закрытый прямоугольный корпус с двумя дверями, вентиляцией и двумя узлами ввода на крыше. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-2ktpn-25-3150: double-compact-substation; source-based; pp. 10; inherit=true. Две соседние закрытые трансформаторные секции с отдельными верхними вводами; одиночная КТПН не подставляется. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-ktpg-25-3150: kiosk-substation; source-based; pp. 12; inherit=true. Киоск с закрытым трансформаторным отсеком и парными дверями, без открытого бака снаружи. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-2ktpg-25-3150: double-kiosk-substation; source-based; pp. 13; inherit=true. Контур двух киосков с отдельным центральным шкафом АВР по габаритному чертежу на стр. 13; общий вид семейства, не точные размеры конкретной мощности.
- cat-ktpp-2ktpp-250-6300: indoor-transformer-lineup; typical; pp. 15; inherit=false. Показана характерная внутренняя линейка РУНН между двумя открытыми трансформаторами по стр. 15. Семейство объединяет КТПП и 2КТПП: число трансформаторов и секций конкретного исполнения не утверждается.
- cat-ktpo-4-10: tall-single-phase-substation; source-based; pp. 17; inherit=true. Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение.
- cat-ktpto-80: heating-transformer-assembly; source-based; pp. 18; inherit=true. Сборка переднего щита и находящегося за ним трансформаторного узла на общей раме по фронтальному и боковому видам стр. 18.
- cat-ktps-100-1600: raised-outdoor-substation; source-based; pp. 19, 20; inherit=true. Открытая приподнятая площадка с рамой аппаратов 35 кВ, трансформатором, ограждением и лестницей по общим видам на стр. 19–20. Показана общая компоновка, размеры и аппаратура мощности не воспроизводятся.
- cat-mtp-25-100: pole-substation; source-based; pp. 21; inherit=true. Одна мачта с верхней траверсой, открытым трансформатором на кронштейне и нижним шкафом РУНН. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-mtpo-4-10: single-phase-pole-substation; source-based; pp. 22; inherit=true. Одна опора, разнесённые боковые кронштейны, одиночный трансформатор и нижний шкаф по габаритному виду МТПО на стр. 22; три фазных бака или ввода не добавлены.
- kso-366: single-door-switchgear; source-based; pp. 23; inherit=true. Высокая однодверная камера с отдельным верхним отсеком; повторяется общая закрытая конструкция КСО. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-kso-366m: single-door-switchgear; source-based; pp. 24; inherit=true. Однодверная высокая камера с отдельной верхней панелью; общий внешний контур с КСО-366, без вывода о внутренней схеме. Значок передаёт общий внешний контур семейства, не точное исполнение.
- kso-2-10: relay-panel-switchgear; source-based; pp. 25; inherit=true. Отдельная верхняя релейная панель над высокой дверью силового отсека по фасаду КСО-2-10 на стр. 25; это двухзонная камера, а не фасад КСО-366.
- cat-kso-2-20: open-vacuum-switchgear; source-based; pp. 27; inherit=true. Сохранён именно открытый разрез со стр. 27: три вакуумных аппарата в раме и высокий правый короб с релейным отсеком. Закрытый фасад по этому разрезу не выдуман.
- kso-292: mesh-top-relay-switchgear; source-based; pp. 28; inherit=true. Верхняя сетчатая зона, средняя релейная панель и нижняя дверь повторяют видимые зоны КСО-292 на стр. 28; условная детализация приборов.
- cat-rmu-ae: rmu-three-cell-lineup; source-based; pp. 30; inherit=true. Три соседние ячейки с верхними шкафчиками, средней зоной органов управления и нижними кабельными дверями по вариантам RMU на стр. 30. Значок не передаёт конкретную электрическую схему.
- cat-krn-iv: outdoor-roof-input-switchgear; source-based; pp. 31; inherit=true. Двухъярусная наружная камера с верхними изоляторами, кровлей и боковым объёмом по двум проекциям КРН-IV на стр. 31.
- cat-grsh-04: main-distribution-lineup; typical; pp. 32; inherit=true. Типовой символ ряда напольных распределительных панелей. На стр. 32 есть описание и размеры ГРЩ, но нет изображения: число шкафов, дверей и приборов конкретного щита не подтверждено.
- cat-shcho-70: distribution-cabinet; source-based; pp. 33; inherit=true. Высокая распределительная панель с верхним рядом приборов, одной дверью и нижней коммутационной зоной. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-shnn: open-sided-distribution-panel; source-based; pp. 35; inherit=false. По левому примеру на стр. 35 показана приборная лицевая панель в открытой боковой раме. На той же странице есть другая линейная панель; один фасад не наследуется всем вводным, секционным и линейным обозначениям.
- cat-shchsu-04: plain-floor-cabinet; source-based; pp. 36; inherit=true. Высокий напольный однодверный корпус без верхних вводов и внешних приборных панелей. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-bktp-modular: single-modular-building; typical; pp. 38, 39; inherit=false. Общая запись объединяет разные БКТП и 2БКТП. Здесь условно показано однотрансформаторное здание по стр. 38; два конкретно подписанных обозначения имеют отдельные значки по стр. 38 и 39.
- cat-bktp-concrete: concrete-substation-building; source-based; pp. 41; inherit=true. Бетонный блок с плоской плитой кровли, центральными парными и двумя крайними дверями по иллюстрации верхнего модуля на стр. 41; скрытый подземный цоколь не подменяет внешний вид здания.
- cat-kru-k07-ktz: switchgear; source-based; pp. 43; inherit=true. Внутренняя выкатная ячейка с верхней релейной панелью и нижним силовым отсеком; общая конструкция, не схема аппаратов. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-krun07-ktz: outdoor-switchgear-shelter; source-based; pp. 43; inherit=true. Наружная сборка ячеек под общей двускатной кровлей на опорах. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-kru-kerneu-6-10: switchgear; source-based; pp. 45; inherit=true. Глубокая трёхсекционная ячейка с верхними приборами и выкатным силовым отсеком; исходная основа этого визуального типа. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-kru-kerneu-35: deep-35kv-switchgear; source-based; pp. 47; inherit=true. Глубокий корпус 35 кВ с верхним релейным и большим нижним выкатным отсеком по фронтальной и боковой проекциям стр. 47. Фасад ячейки 6–10 кВ не наследуется.
- cat-k8m: outdoor-switchgear-shelter; source-based; pp. 49; inherit=true. Глубокая наружная камера в укрытии с двускатной крышей и опорными стойками; визуализируется внешний корпус. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-k59: outdoor-switchgear-shelter; source-based; pp. 51; inherit=true. Наружная камера под крышей на опорных стойках; общий внешний контур с К-8М, без переноса внутренней аппаратуры. Значок передаёт общий внешний контур семейства, не точное исполнение.
- cat-km7m: open-drawout-switchgear; source-based; pp. 53; inherit=true. Релейный шкаф над открытым выкатным силовым отсеком по стр. 53. В источнике прямо указано отсутствие двери отсека выкатного элемента, поэтому сплошная нижняя дверь не добавлена.
- cat-ktpb-k: outdoor-switchyard-substation; source-based; pp. 55; inherit=false. Силуэт открытой площадки с аппаратными рамами, трансформатором и отдельным РУ по примеру КТПБ(К) 35/10(6) на стр. 55. Это пример площадки 35 кВ, а не модульное здание и не подтверждённая компоновка исполнений 110/220 кВ.

## Verification
- Rendered every new SVG path set via Sharp; all 20 render without error.
- Inspected the resulting sheet at both 40 px and 128 px: no clipping, missing paths, unexpected fill, or indistinguishable empty placeholders.
- Metadata check passed: all 56 map entries refer to actual imported IDs and registered/new icon keys; confidence, source pages, reasons, and inheritance fields are present.
- Targeted ESLint passed for both new JavaScript files.

## Source images inspected
- All 31 non-null image crops for the 32 families listed above.
- Full-page source review for pages 15, 16, 18, 19, 20, 22, 27, 30, 31, 32, 35, 38, 39, 41, 47, 53, and 55. Original crops supply the reviewed construction detail on the remaining family pages.
