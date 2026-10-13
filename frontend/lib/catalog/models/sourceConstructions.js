/**
 * Original crops AND complete source pages visually reviewed on 2026-10-05.
 * The registry describes shared constructions, not SKU/rating-derived geometry.
 * recordIds is a closed allowlist: new variants never inherit these interpretations.
 * Arbitrary scene proportions, simplified fittings, no hidden interiors or CAD claims.
 * The PTM/TDE comparison overview is deliberately absent (two different enclosures).
 */
export const sourceConstructionDefinitions = Object.freeze({
  "mesh-top-relay-switchgear": {
    "name": "Камера с сетчатым верхним отсеком и релейным фасадом",
    "reference": "/catalog-products/kso-292.webp",
    "sourcePages": [
      28
    ],
    "recordIds": [
      "kso-292"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Верхняя сетчатая зона, средняя релейная панель и нижняя дверь повторяют видимые зоны КСО-292 на стр. 28; условная детализация приборов."
  },
  "relay-panel-switchgear": {
    "name": "Камера КСО с верхней релейной панелью",
    "reference": "/catalog-products/kso-2-10.webp",
    "sourcePages": [
      25
    ],
    "recordIds": [
      "kso-2-10"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Отдельная верхняя релейная панель над высокой дверью силового отсека по фасаду КСО-2-10 на стр. 25; это двухзонная камера, а не фасад КСО-366."
  },
  "double-kiosk-substation": {
    "name": "Два киоска с центральным шкафом АВР",
    "reference": "/catalog-products/cat-2ktpg-25-3150.webp",
    "sourcePages": [
      13
    ],
    "recordIds": [
      "cat-2ktpg-25-3150"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Контур двух киосков с отдельным центральным шкафом АВР по габаритному чертежу на стр. 13; общий вид семейства, не точные размеры конкретной мощности."
  },
  "tall-single-phase-substation": {
    "name": "Высокая трёхъярусная однофазная подстанция",
    "reference": "/catalog-products/cat-ktpo-4-10.webp",
    "sourcePages": [
      17
    ],
    "recordIds": [
      "cat-ktpo-4-10",
      "cat-ktpo-4-10-v001",
      "cat-ktpo-4-10-v002",
      "cat-ktpo-4-10-v003",
      "cat-ktpo-4-10-v004"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение."
  },
  "heating-transformer-assembly": {
    "name": "Станция прогрева с трансформатором на общей раме",
    "reference": "/catalog-products/cat-ktpto-80.webp",
    "sourcePages": [
      18
    ],
    "recordIds": [
      "cat-ktpto-80"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Сборка переднего щита и находящегося за ним трансформаторного узла на общей раме по фронтальному и боковому видам стр. 18."
  },
  "raised-outdoor-substation": {
    "name": "Открытая подстанция 35 кВ на площадке с лестницей",
    "reference": "/catalog-products/cat-ktps-100-1600.webp",
    "sourcePages": [
      19,
      20
    ],
    "recordIds": [
      "cat-ktps-100-1600",
      "cat-ktps-100-1600-v007"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Открытая приподнятая площадка с рамой аппаратов 35 кВ, трансформатором, ограждением и лестницей по общим видам на стр. 19–20. Показана общая компоновка, размеры и аппаратура мощности не воспроизводятся."
  },
  "single-phase-pole-substation": {
    "name": "Однофазная мачтовая подстанция с боковым трансформатором",
    "reference": "/catalog-products/cat-mtpo-4-10.webp",
    "sourcePages": [
      22
    ],
    "recordIds": [
      "cat-mtpo-4-10"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Одна опора, разнесённые боковые кронштейны, одиночный трансформатор и нижний шкаф по габаритному виду МТПО на стр. 22; три фазных бака или ввода не добавлены."
  },
  "open-vacuum-switchgear": {
    "name": "Открытый разрез камеры с тремя вакуумными аппаратами",
    "reference": "/catalog-products/cat-kso-2-20.webp",
    "sourcePages": [
      27
    ],
    "recordIds": [
      "cat-kso-2-20"
    ],
    "viewMode": "illustrative-cutaway",
    "reviewed": "2026-10-05",
    "evidence": "Сохранён именно открытый разрез со стр. 27: три вакуумных аппарата в раме и высокий правый короб с релейным отсеком. Закрытый фасад по этому разрезу не выдуман."
  },
  "rmu-three-cell-lineup": {
    "name": "Трёхсекционное распределительное устройство RMU",
    "reference": "/catalog-products/cat-rmu-ae.webp",
    "sourcePages": [
      30
    ],
    "recordIds": [
      "cat-rmu-ae"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Три соседние ячейки с верхними шкафчиками, средней зоной органов управления и нижними кабельными дверями по вариантам RMU на стр. 30. Значок не передаёт конкретную электрическую схему."
  },
  "outdoor-roof-input-switchgear": {
    "name": "Наружная двухъярусная камера с вводами на кровле",
    "reference": "/catalog-products/cat-krn-iv.webp",
    "sourcePages": [
      31
    ],
    "recordIds": [
      "cat-krn-iv"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Двухъярусная наружная камера с верхними изоляторами, кровлей и боковым объёмом по двум проекциям КРН-IV на стр. 31."
  },
  "open-sided-distribution-panel": {
    "name": "Низковольтная панель с открытой боковой рамой",
    "reference": "/catalog-products/cat-shnn.webp",
    "sourcePages": [
      35
    ],
    "recordIds": [
      "cat-shnn"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По левому примеру на стр. 35 показана приборная лицевая панель в открытой боковой раме. На той же странице есть другая линейная панель; один фасад не наследуется всем вводным, секционным и линейным обозначениям."
  },
  "single-modular-building": {
    "name": "Однотрансформаторная БКТП: ворота и боковая дверь",
    "reference": "/catalog-source/page-038.webp",
    "sourcePages": [
      38
    ],
    "recordIds": [
      "cat-bktp-modular-v001"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Здание с большими парными воротами слева и отдельной дверью справа прямо подписано БКТП-2500/10-0,4 УХЛ1 на стр. 38; конструкция 2БКТП не наследуется."
  },
  "double-modular-building": {
    "name": "Двухтрансформаторная 2БКТП с центральным проёмом",
    "reference": "/catalog-products/cat-bktp-modular.webp",
    "sourcePages": [
      39
    ],
    "recordIds": [
      "cat-bktp-modular-v002"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Трёхмодульное здание с центральным дверным проёмом соответствует прямо подписанной 2БКТП-2500/10-0,4 УХЛ1 на стр. 39; не однотрансформаторная БКТП."
  },
  "concrete-substation-building": {
    "name": "БКТП в бетонном здании с плоской плитой кровли",
    "reference": "/catalog-products/cat-bktp-concrete.webp",
    "sourcePages": [
      41
    ],
    "recordIds": [
      "cat-bktp-concrete"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Бетонный блок с плоской плитой кровли, центральными парными и двумя крайними дверями по иллюстрации верхнего модуля на стр. 41; скрытый подземный цоколь не подменяет внешний вид здания."
  },
  "deep-35kv-switchgear": {
    "name": "Глубокая камера 35 кВ с релейным и выкатным отсеками",
    "reference": "/catalog-products/cat-kru-kerneu-35.webp",
    "sourcePages": [
      47
    ],
    "recordIds": [
      "cat-kru-kerneu-35"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Глубокий корпус 35 кВ с верхним релейным и большим нижним выкатным отсеком по фронтальной и боковой проекциям стр. 47. Фасад ячейки 6–10 кВ не наследуется."
  },
  "open-drawout-switchgear": {
    "name": "Выкатная камера с открытым нижним силовым отсеком",
    "reference": "/catalog-products/cat-km7m.webp",
    "sourcePages": [
      53
    ],
    "recordIds": [
      "cat-km7m"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Релейный шкаф над открытым выкатным силовым отсеком по стр. 53. В источнике прямо указано отсутствие двери отсека выкатного элемента, поэтому сплошная нижняя дверь не добавлена."
  },
  "outdoor-switchyard-substation": {
    "name": "Открытая блочная подстанция с аппаратными рамами",
    "reference": "/catalog-products/cat-ktpb-k.webp",
    "sourcePages": [
      55
    ],
    "recordIds": [
      "cat-ktpb-k",
      "cat-ktpb-k-v001"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "Силуэт открытой площадки с аппаратными рамами, трансформатором и отдельным РУ по примеру КТПБ(К) 35/10(6) на стр. 55. Это пример площадки 35 кВ, а не модульное здание и не подтверждённая компоновка исполнений 110/220 кВ."
  },
  "battery-control-rack": {
    "name": "Шкаф оперативного тока с батарейной стойкой",
    "reference": "/catalog-products/cat-shuot.webp",
    "sourcePages": [
      62
    ],
    "recordIds": [
      "cat-shuot"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По изображению ШУОТ на странице 62: приборный шкаф и расположенная рядом открытая многоярусная батарейная стойка. Показана конструкция серии, не размеры исполнения."
  },
  "open-distribution-panel": {
    "name": "Открытая распределительная панель",
    "reference": "/catalog-products/cat-pr-shr11.webp",
    "sourcePages": [
      64
    ],
    "recordIds": [
      "cat-pr-shr11"
    ],
    "viewMode": "illustrative-cutaway",
    "reviewed": "2026-10-05",
    "evidence": "По открытому фронтальному виду страницы 64: рама панели, центральный аппарат и боковые коммутационные группы. Иллюстрация общая для страницы ПР/ШР11; конкретное исполнение не подписано."
  },
  "indoor-protection-enclosure": {
    "name": "Прямоугольный корпус ТДЕ без наружного козырька",
    "reference": "/catalog-products/cat-ptm-tded.webp",
    "sourcePages": [
      69
    ],
    "recordIds": [
      "cat-ptm-tded-v013"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "На странице 69 прямоугольный корпус без козырька прямо подписан ТДЕ(Д)-9-У3. Не наследует наружный корпус ПТМ(Д)-У1."
  },
  "round-metering-post": {
    "name": "СКИП на круглой трубчатой стойке",
    "reference": "/catalog-products/cat-skip.webp",
    "sourcePages": [
      74
    ],
    "recordIds": [
      "cat-skip",
      "cat-skip-v001",
      "cat-skip-v002"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По отдельному чертежу СКИП на странице 74: круглая трубчатая стойка, прямоугольная головка с дверцей и треугольная крыша. Общий вид серии не задаёт размеры СКИП-1 или СКИП-2."
  },
  "railway-pole-single-phase": {
    "name": "Однофазная КТПЖ с боковой арматурой",
    "reference": "/catalog-products/cat-ktpzh-2-4.webp",
    "sourcePages": [
      75
    ],
    "recordIds": [
      "cat-ktpzh-2-4",
      "cat-ktpzh-2-4-v001",
      "cat-ktpzh-2-4-v002"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По двум видам страницы 75: одна опора, верхняя траверса, боковой однофазный трансформатор с арматурой и отдельный нижний щиток. Трёхфазная мачтовая КТП не подставляется."
  },
  "railway-pole-mini-transformer": {
    "name": "Мачтовая однофазная МТПЖ с боковым трансформатором",
    "reference": "/catalog-products/cat-mtpzh-1-25-2-5.webp",
    "sourcePages": [
      77
    ],
    "recordIds": [
      "cat-mtpzh-1-25-2-5",
      "cat-mtpzh-1-25-2-5-v001",
      "cat-mtpzh-1-25-2-5-v002"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По чертежу страницы 77: одна опора, верхняя консоль с раскосом и одиночный боковой трансформатор. Сохранён однофазный силуэт без трёхфазного бака."
  },
  "railway-backboard-transformer": {
    "name": "МТПЖ с высоким шкафом и низким трансформатором",
    "reference": "/catalog-products/cat-mtpzh-10.webp",
    "sourcePages": [
      78
    ],
    "recordIds": [
      "cat-mtpzh-10",
      "cat-mtpzh-10-v001"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По боковому виду МТПЖ-10 страницы 78: высокий шкаф или щит за отдельным низким трансформатором на общей раме. Мачта не дорисовывается из названия."
  },
  "railway-modular-building": {
    "name": "Блочно-модульное здание АТП с боковыми вводами",
    "reference": "/catalog-products/cat-atp-2x25.webp",
    "sourcePages": [
      81
    ],
    "recordIds": [
      "cat-atp-2x25"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По наружному фасаду АТП-2×25 в блочно-модульном здании на странице 81: длинный закрытый корпус, две двери, цоколь и боковые вводы. Вид прочитан после поворота исходного чертежа; внутренние аппараты не выносятся наружу."
  },
  "railway-sectioning-post": {
    "name": "Пост секционирования с наружной контактной группой",
    "reference": "/catalog-products/cat-psk-27-5.webp",
    "sourcePages": [
      84
    ],
    "recordIds": [
      "cat-psk-27-5",
      "cat-psk-27-5-v001"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По видам ПСК-27,5-5 У1 на странице 84: закрытый модуль на основании и высокая наружная контактная группа с защитной сеткой. Другие проекции не считаются отдельными вариантами."
  },
  "railway-side-input-switchgear": {
    "name": "Железнодорожная ячейка КРУ с боковыми вводами",
    "reference": "/catalog-products/cat-kru-27-5.webp",
    "sourcePages": [
      86
    ],
    "recordIds": [
      "cat-kru-27-5"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По фасаду однополюсной КРУ-27,5 на странице 86: два яруса дверей, окно нижнего отсека, верхний и два боковых ввода. Вид разреза не используется как внешний фасад."
  },
  "mine-switchgear-window": {
    "name": "Рудничная ячейка со смотровым окном",
    "reference": "/catalog-products/cat-kru-rn.webp",
    "sourcePages": [
      89
    ],
    "recordIds": [
      "cat-kru-rn"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По фасаду КРУ-РН на странице 89: высокий двухъярусный корпус со скруглённым смотровым окном и монтажным основанием. Электрические аппараты бокового разреза не показываются снаружи."
  },
  "mine-fenced-switchgear": {
    "name": "ЯКНО с высокой сетчатой камерой на полозьях",
    "reference": "/catalog-products/cat-yakno-6-10.webp",
    "sourcePages": [
      90
    ],
    "recordIds": [
      "cat-yakno-6-10"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По чертежу ЯКНО 6(10) страницы 90: узкий шкаф на полозьях с высокой сетчатой камерой и тремя верхними вводами."
  },
  "mine-fenced-double-switchgear": {
    "name": "Широкая ЯКНО-20 с верхним сетчатым отсеком",
    "reference": "/catalog-products/cat-yakno-20.webp",
    "sourcePages": [
      91
    ],
    "recordIds": [
      "cat-yakno-20"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По фасаду ЯКНО-20 страницы 91: широкий нижний двухдверный шкаф и высокая сетчатая камера под верхним кожухом. Силуэт отделён от узкой ЯКНО 6(10)."
  },
  "mine-low-skid-substation": {
    "name": "Низкая шахтная подстанция на полозьях",
    "reference": "/catalog-products/cat-ktpshg.webp",
    "sourcePages": [
      92
    ],
    "recordIds": [
      "cat-ktpshg"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По общему виду КТПШГ страницы 92: низкая горизонтальная сборка с центральным ребристым баком и двумя боковыми блоками на полозьях. Верхняя вводная башня отсутствует."
  },
  "wall-canopy-control": {
    "name": "Навесной БУЭСКН с козырьком и индикаторами",
    "reference": "/catalog-products/cat-bueskn.webp",
    "sourcePages": [
      95
    ],
    "recordIds": [
      "cat-bueskn"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По фасаду БУЭСКН на странице 95: навесной блок с козырьком, рядом четырёх индикаторов, большой вставкой в двери и задними креплениями."
  },
  "long-service-container": {
    "name": "Длинный служебный контейнер с площадками и лестницами",
    "reference": "/catalog-products/cat-modular-oil.webp",
    "sourcePages": [
      98
    ],
    "recordIds": [
      "cat-modular-oil"
    ],
    "viewMode": "illustrative-construction",
    "reviewed": "2026-10-05",
    "evidence": "По перспективному изображению страницы 98: длинный ребристый контейнер с входной площадкой, лестницами по торцам и выступающими кровельными трубами. Это иллюстрация общего корпуса без вывода о внутренней планировке."
  }
});

export const sourceRecordVisuals = Object.freeze({
  "kso-292": {
    "type": "mesh-top-relay-switchgear",
    "sourcePages": [
      28
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/kso-292.webp",
    "reason": "Верхняя сетчатая зона, средняя релейная панель и нижняя дверь повторяют видимые зоны КСО-292 на стр. 28; условная детализация приборов. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "kso-2-10": {
    "type": "relay-panel-switchgear",
    "sourcePages": [
      25
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/kso-2-10.webp",
    "reason": "Отдельная верхняя релейная панель над высокой дверью силового отсека по фасаду КСО-2-10 на стр. 25; это двухзонная камера, а не фасад КСО-366. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-2ktpg-25-3150": {
    "type": "double-kiosk-substation",
    "sourcePages": [
      13
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-2ktpg-25-3150.webp",
    "reason": "Контур двух киосков с отдельным центральным шкафом АВР по габаритному чертежу на стр. 13; общий вид семейства, не точные размеры конкретной мощности. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpo-4-10": {
    "type": "tall-single-phase-substation",
    "sourcePages": [
      17
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpo-4-10-v001": {
    "type": "tall-single-phase-substation",
    "sourcePages": [
      17
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpo-4-10-v002": {
    "type": "tall-single-phase-substation",
    "sourcePages": [
      17
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpo-4-10-v003": {
    "type": "tall-single-phase-substation",
    "sourcePages": [
      17
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpo-4-10-v004": {
    "type": "tall-single-phase-substation",
    "sourcePages": [
      17
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpto-80": {
    "type": "heating-transformer-assembly",
    "sourcePages": [
      18
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpto-80.webp",
    "reason": "Сборка переднего щита и находящегося за ним трансформаторного узла на общей раме по фронтальному и боковому видам стр. 18. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktps-100-1600": {
    "type": "raised-outdoor-substation",
    "sourcePages": [
      19,
      20
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktps-100-1600.webp",
    "reason": "Открытая приподнятая площадка с рамой аппаратов 35 кВ, трансформатором, ограждением и лестницей по общим видам на стр. 19–20. Показана общая компоновка, размеры и аппаратура мощности не воспроизводятся. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktps-100-1600-v007": {
    "type": "raised-outdoor-substation",
    "sourcePages": [
      20
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-source/page-020.webp",
    "reason": "Общая открытая площадка с ограждением и лестницей прямо показана для КТПС 1000–1600/35 кВ на стр. 20. Значок сохраняет конструкцию без геометрии конкретной мощности. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpo-4-10": {
    "type": "single-phase-pole-substation",
    "sourcePages": [
      22
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpo-4-10.webp",
    "reason": "Одна опора, разнесённые боковые кронштейны, одиночный трансформатор и нижний шкаф по габаритному виду МТПО на стр. 22; три фазных бака или ввода не добавлены. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-kso-2-20": {
    "type": "open-vacuum-switchgear",
    "sourcePages": [
      27
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kso-2-20.webp",
    "reason": "Сохранён именно открытый разрез со стр. 27: три вакуумных аппарата в раме и высокий правый короб с релейным отсеком. Закрытый фасад по этому разрезу не выдуман. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-rmu-ae": {
    "type": "rmu-three-cell-lineup",
    "sourcePages": [
      30
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-rmu-ae.webp",
    "reason": "Три соседние ячейки с верхними шкафчиками, средней зоной органов управления и нижними кабельными дверями по вариантам RMU на стр. 30. Значок не передаёт конкретную электрическую схему. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-krn-iv": {
    "type": "outdoor-roof-input-switchgear",
    "sourcePages": [
      31
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-krn-iv.webp",
    "reason": "Двухъярусная наружная камера с верхними изоляторами, кровлей и боковым объёмом по двум проекциям КРН-IV на стр. 31. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-shnn": {
    "type": "open-sided-distribution-panel",
    "sourcePages": [
      35
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-shnn.webp",
    "reason": "По левому примеру на стр. 35 показана приборная лицевая панель в открытой боковой раме. На той же странице есть другая линейная панель; один фасад не наследуется всем вводным, секционным и линейным обозначениям. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-bktp-modular-v001": {
    "type": "single-modular-building",
    "sourcePages": [
      38
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-source/page-038.webp",
    "reason": "Здание с большими парными воротами слева и отдельной дверью справа прямо подписано БКТП-2500/10-0,4 УХЛ1 на стр. 38; конструкция 2БКТП не наследуется. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-bktp-modular-v002": {
    "type": "double-modular-building",
    "sourcePages": [
      39
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-bktp-modular.webp",
    "reason": "Трёхмодульное здание с центральным дверным проёмом соответствует прямо подписанной 2БКТП-2500/10-0,4 УХЛ1 на стр. 39; не однотрансформаторная БКТП. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-bktp-concrete": {
    "type": "concrete-substation-building",
    "sourcePages": [
      41
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-bktp-concrete.webp",
    "reason": "Бетонный блок с плоской плитой кровли, центральными парными и двумя крайними дверями по иллюстрации верхнего модуля на стр. 41; скрытый подземный цоколь не подменяет внешний вид здания. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-kru-kerneu-35": {
    "type": "deep-35kv-switchgear",
    "sourcePages": [
      47
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kru-kerneu-35.webp",
    "reason": "Глубокий корпус 35 кВ с верхним релейным и большим нижним выкатным отсеком по фронтальной и боковой проекциям стр. 47. Фасад ячейки 6–10 кВ не наследуется. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-km7m": {
    "type": "open-drawout-switchgear",
    "sourcePages": [
      53
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-km7m.webp",
    "reason": "Релейный шкаф над открытым выкатным силовым отсеком по стр. 53. В источнике прямо указано отсутствие двери отсека выкатного элемента, поэтому сплошная нижняя дверь не добавлена. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpb-k": {
    "type": "outdoor-switchyard-substation",
    "sourcePages": [
      55
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpb-k.webp",
    "reason": "Силуэт открытой площадки с аппаратными рамами, трансформатором и отдельным РУ по примеру КТПБ(К) 35/10(6) на стр. 55. Это пример площадки 35 кВ, а не модульное здание и не подтверждённая компоновка исполнений 110/220 кВ. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpb-k-v001": {
    "type": "outdoor-switchyard-substation",
    "sourcePages": [
      55
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpb-k.webp",
    "reason": "Исполнение КТПБ(К) 35/10(6) прямо указано в подписи примера общего вида открытой площадки на стр. 55; число аппаратов и размеры площадки условны. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-shuot": {
    "type": "battery-control-rack",
    "sourcePages": [
      62
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-shuot.webp",
    "reason": "По изображению ШУОТ на странице 62: приборный шкаф и расположенная рядом открытая многоярусная батарейная стойка. Показана конструкция серии, не размеры исполнения. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-pr-shr11": {
    "type": "open-distribution-panel",
    "sourcePages": [
      64
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-pr-shr11.webp",
    "reason": "По открытому фронтальному виду страницы 64: рама панели, центральный аппарат и боковые коммутационные группы. Иллюстрация общая для страницы ПР/ШР11; конкретное исполнение не подписано. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ptm-tded-v013": {
    "type": "indoor-protection-enclosure",
    "sourcePages": [
      69
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ptm-tded.webp",
    "reason": "На странице 69 прямоугольный корпус без козырька прямо подписан ТДЕ(Д)-9-У3. Не наследует наружный корпус ПТМ(Д)-У1. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-skip": {
    "type": "round-metering-post",
    "sourcePages": [
      74
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-skip.webp",
    "reason": "По отдельному чертежу СКИП на странице 74: круглая трубчатая стойка, прямоугольная головка с дверцей и треугольная крыша. Общий вид серии не задаёт размеры СКИП-1 или СКИП-2. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-skip-v001": {
    "type": "round-metering-post",
    "sourcePages": [
      74
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-skip.webp",
    "reason": "По отдельному чертежу СКИП на странице 74: круглая трубчатая стойка, прямоугольная головка с дверцей и треугольная крыша. Общий вид серии не задаёт размеры СКИП-1 или СКИП-2. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-skip-v002": {
    "type": "round-metering-post",
    "sourcePages": [
      74
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-skip.webp",
    "reason": "По отдельному чертежу СКИП на странице 74: круглая трубчатая стойка, прямоугольная головка с дверцей и треугольная крыша. Общий вид серии не задаёт размеры СКИП-1 или СКИП-2. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpzh-2-4": {
    "type": "railway-pole-single-phase",
    "sourcePages": [
      75
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpzh-2-4.webp",
    "reason": "По двум видам страницы 75: одна опора, верхняя траверса, боковой однофазный трансформатор с арматурой и отдельный нижний щиток. Трёхфазная мачтовая КТП не подставляется. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpzh-2-4-v001": {
    "type": "railway-pole-single-phase",
    "sourcePages": [
      75
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpzh-2-4.webp",
    "reason": "По двум видам страницы 75: одна опора, верхняя траверса, боковой однофазный трансформатор с арматурой и отдельный нижний щиток. Трёхфазная мачтовая КТП не подставляется. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpzh-2-4-v002": {
    "type": "railway-pole-single-phase",
    "sourcePages": [
      75
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpzh-2-4.webp",
    "reason": "По двум видам страницы 75: одна опора, верхняя траверса, боковой однофазный трансформатор с арматурой и отдельный нижний щиток. Трёхфазная мачтовая КТП не подставляется. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpzh-1-25-2-5": {
    "type": "railway-pole-mini-transformer",
    "sourcePages": [
      77
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpzh-1-25-2-5.webp",
    "reason": "По чертежу страницы 77: одна опора, верхняя консоль с раскосом и одиночный боковой трансформатор. Сохранён однофазный силуэт без трёхфазного бака. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpzh-1-25-2-5-v001": {
    "type": "railway-pole-mini-transformer",
    "sourcePages": [
      77
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpzh-1-25-2-5.webp",
    "reason": "По чертежу страницы 77: одна опора, верхняя консоль с раскосом и одиночный боковой трансформатор. Сохранён однофазный силуэт без трёхфазного бака. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpzh-1-25-2-5-v002": {
    "type": "railway-pole-mini-transformer",
    "sourcePages": [
      77
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpzh-1-25-2-5.webp",
    "reason": "По чертежу страницы 77: одна опора, верхняя консоль с раскосом и одиночный боковой трансформатор. Сохранён однофазный силуэт без трёхфазного бака. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpzh-10": {
    "type": "railway-backboard-transformer",
    "sourcePages": [
      78
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpzh-10.webp",
    "reason": "По боковому виду МТПЖ-10 страницы 78: высокий шкаф или щит за отдельным низким трансформатором на общей раме. Мачта не дорисовывается из названия. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-mtpzh-10-v001": {
    "type": "railway-backboard-transformer",
    "sourcePages": [
      78
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtpzh-10.webp",
    "reason": "По боковому виду МТПЖ-10 страницы 78: высокий шкаф или щит за отдельным низким трансформатором на общей раме. Мачта не дорисовывается из названия. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-atp-2x25": {
    "type": "railway-modular-building",
    "sourcePages": [
      81
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-atp-2x25.webp",
    "reason": "По наружному фасаду АТП-2×25 в блочно-модульном здании на странице 81: длинный закрытый корпус, две двери, цоколь и боковые вводы. Вид прочитан после поворота исходного чертежа; внутренние аппараты не выносятся наружу. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-psk-27-5": {
    "type": "railway-sectioning-post",
    "sourcePages": [
      84
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-psk-27-5.webp",
    "reason": "По видам ПСК-27,5-5 У1 на странице 84: закрытый модуль на основании и высокая наружная контактная группа с защитной сеткой. Другие проекции не считаются отдельными вариантами. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-psk-27-5-v001": {
    "type": "railway-sectioning-post",
    "sourcePages": [
      84
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-psk-27-5.webp",
    "reason": "По видам ПСК-27,5-5 У1 на странице 84: закрытый модуль на основании и высокая наружная контактная группа с защитной сеткой. Другие проекции не считаются отдельными вариантами. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-kru-27-5": {
    "type": "railway-side-input-switchgear",
    "sourcePages": [
      86
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kru-27-5.webp",
    "reason": "По фасаду однополюсной КРУ-27,5 на странице 86: два яруса дверей, окно нижнего отсека, верхний и два боковых ввода. Вид разреза не используется как внешний фасад. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-kru-rn": {
    "type": "mine-switchgear-window",
    "sourcePages": [
      89
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kru-rn.webp",
    "reason": "По фасаду КРУ-РН на странице 89: высокий двухъярусный корпус со скруглённым смотровым окном и монтажным основанием. Электрические аппараты бокового разреза не показываются снаружи. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-yakno-6-10": {
    "type": "mine-fenced-switchgear",
    "sourcePages": [
      90
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-yakno-6-10.webp",
    "reason": "По чертежу ЯКНО 6(10) страницы 90: узкий шкаф на полозьях с высокой сетчатой камерой и тремя верхними вводами. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-yakno-20": {
    "type": "mine-fenced-double-switchgear",
    "sourcePages": [
      91
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-yakno-20.webp",
    "reason": "По фасаду ЯКНО-20 страницы 91: широкий нижний двухдверный шкаф и высокая сетчатая камера под верхним кожухом. Силуэт отделён от узкой ЯКНО 6(10). Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ktpshg": {
    "type": "mine-low-skid-substation",
    "sourcePages": [
      92
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpshg.webp",
    "reason": "По общему виду КТПШГ страницы 92: низкая горизонтальная сборка с центральным ребристым баком и двумя боковыми блоками на полозьях. Верхняя вводная башня отсутствует. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-bueskn": {
    "type": "wall-canopy-control",
    "sourcePages": [
      95
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-bueskn.webp",
    "reason": "По фасаду БУЭСКН на странице 95: навесной блок с козырьком, рядом четырёх индикаторов, большой вставкой в двери и задними креплениями. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-modular-oil": {
    "type": "long-service-container",
    "sourcePages": [
      98
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-modular-oil.webp",
    "reason": "По перспективному изображению страницы 98: длинный ребристый контейнер с входной площадкой, лестницами по торцам и выступающими кровельными трубами. Это иллюстрация общего корпуса без вывода о внутренней планировке. Иллюстративная геометрия по видимой конструкции; не CAD и не модель конкретного исполнения.",
    "inherit": false
  },
  "cat-ukzv": {
    "type": "upper-input-protection",
    "sourcePages": [
      93
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ukzv.webp",
    "reason": "Представитель смешанного семейства: показана только конструкция УКЗВ с воздушным вводом на странице 93. Семейство содержит также кабельные исполнения; геометрия не подтверждает их внешний вид и им не наследуется. Иллюстративная модель типа; не CAD.",
    "inherit": false
  }
});
