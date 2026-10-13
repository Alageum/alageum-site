/** Catalog icon provenance only. Does not authorize or change any 3D mapping. */
export const sourceIconMapA = Object.freeze({
  "cat-ktp-25-250": {
    "type": "substation",
    "confidence": "source-based",
    "reason": "Сборка из двухъярусного шкафа с верхними вводами и открытого трансформатора на общей платформе; не мачтовая МТП. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      6
    ],
    "inherit": true
  },
  "cat-ktpn-25-3150": {
    "type": "compact-substation",
    "confidence": "source-based",
    "reason": "Закрытый прямоугольный корпус с двумя дверями, вентиляцией и двумя узлами ввода на крыше. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      8
    ],
    "inherit": true
  },
  "cat-2ktpn-25-3150": {
    "type": "double-compact-substation",
    "confidence": "source-based",
    "reason": "Две соседние закрытые трансформаторные секции с отдельными верхними вводами; одиночная КТПН не подставляется. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      10
    ],
    "inherit": true
  },
  "cat-ktpg-25-3150": {
    "type": "kiosk-substation",
    "confidence": "source-based",
    "reason": "Киоск с закрытым трансформаторным отсеком и парными дверями, без открытого бака снаружи. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      12
    ],
    "inherit": true
  },
  "cat-2ktpg-25-3150": {
    "type": "double-kiosk-substation",
    "confidence": "source-based",
    "reason": "Контур двух киосков с отдельным центральным шкафом АВР по габаритному чертежу на стр. 13; общий вид семейства, не точные размеры конкретной мощности.",
    "sourcePages": [
      13
    ],
    "inherit": true
  },
  "cat-ktpp-2ktpp-250-6300": {
    "type": "indoor-transformer-lineup",
    "confidence": "typical",
    "reason": "Показана характерная внутренняя линейка РУНН между двумя открытыми трансформаторами по стр. 15. Семейство объединяет КТПП и 2КТПП: число трансформаторов и секций конкретного исполнения не утверждается.",
    "sourcePages": [
      15
    ],
    "inherit": false
  },
  "cat-ktpo-4-10": {
    "type": "tall-single-phase-substation",
    "confidence": "source-based",
    "reason": "Трёхъярусный узкий корпус с двумя верхними вводами по общему виду КТПО на стр. 17; силуэт серии без переноса габаритов на конкретное обозначение.",
    "sourcePages": [
      17
    ],
    "inherit": true
  },
  "cat-ktpto-80": {
    "type": "heating-transformer-assembly",
    "confidence": "source-based",
    "reason": "Сборка переднего щита и находящегося за ним трансформаторного узла на общей раме по фронтальному и боковому видам стр. 18.",
    "sourcePages": [
      18
    ],
    "inherit": true
  },
  "cat-ktps-100-1600": {
    "type": "raised-outdoor-substation",
    "confidence": "source-based",
    "reason": "Открытая приподнятая площадка с рамой аппаратов 35 кВ, трансформатором, ограждением и лестницей по общим видам на стр. 19–20. Показана общая компоновка, размеры и аппаратура мощности не воспроизводятся.",
    "sourcePages": [
      19,
      20
    ],
    "inherit": true
  },
  "cat-mtp-25-100": {
    "type": "pole-substation",
    "confidence": "source-based",
    "reason": "Одна мачта с верхней траверсой, открытым трансформатором на кронштейне и нижним шкафом РУНН. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      21
    ],
    "inherit": true
  },
  "cat-mtpo-4-10": {
    "type": "single-phase-pole-substation",
    "confidence": "source-based",
    "reason": "Одна опора, разнесённые боковые кронштейны, одиночный трансформатор и нижний шкаф по габаритному виду МТПО на стр. 22; три фазных бака или ввода не добавлены.",
    "sourcePages": [
      22
    ],
    "inherit": true
  },
  "kso-366": {
    "type": "single-door-switchgear",
    "confidence": "source-based",
    "reason": "Высокая однодверная камера с отдельным верхним отсеком; повторяется общая закрытая конструкция КСО. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      23
    ],
    "inherit": true
  },
  "cat-kso-366m": {
    "type": "single-door-switchgear",
    "confidence": "source-based",
    "reason": "Однодверная высокая камера с отдельной верхней панелью; общий внешний контур с КСО-366, без вывода о внутренней схеме. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      24
    ],
    "inherit": true
  },
  "kso-2-10": {
    "type": "relay-panel-switchgear",
    "confidence": "source-based",
    "reason": "Отдельная верхняя релейная панель над высокой дверью силового отсека по фасаду КСО-2-10 на стр. 25; это двухзонная камера, а не фасад КСО-366.",
    "sourcePages": [
      25
    ],
    "inherit": true
  },
  "cat-kso-2-20": {
    "type": "open-vacuum-switchgear",
    "confidence": "source-based",
    "reason": "Сохранён именно открытый разрез со стр. 27: три вакуумных аппарата в раме и высокий правый короб с релейным отсеком. Закрытый фасад по этому разрезу не выдуман.",
    "sourcePages": [
      27
    ],
    "inherit": true
  },
  "kso-292": {
    "type": "mesh-top-relay-switchgear",
    "confidence": "source-based",
    "reason": "Верхняя сетчатая зона, средняя релейная панель и нижняя дверь повторяют видимые зоны КСО-292 на стр. 28; условная детализация приборов.",
    "sourcePages": [
      28
    ],
    "inherit": true
  },
  "cat-rmu-ae": {
    "type": "rmu-three-cell-lineup",
    "confidence": "source-based",
    "reason": "Три соседние ячейки с верхними шкафчиками, средней зоной органов управления и нижними кабельными дверями по вариантам RMU на стр. 30. Значок не передаёт конкретную электрическую схему.",
    "sourcePages": [
      30
    ],
    "inherit": true
  },
  "cat-krn-iv": {
    "type": "outdoor-roof-input-switchgear",
    "confidence": "source-based",
    "reason": "Двухъярусная наружная камера с верхними изоляторами, кровлей и боковым объёмом по двум проекциям КРН-IV на стр. 31.",
    "sourcePages": [
      31
    ],
    "inherit": true
  },
  "cat-grsh-04": {
    "type": "main-distribution-lineup",
    "confidence": "typical",
    "reason": "Типовой символ ряда напольных распределительных панелей. На стр. 32 есть описание и размеры ГРЩ, но нет изображения: число шкафов, дверей и приборов конкретного щита не подтверждено.",
    "sourcePages": [
      32
    ],
    "inherit": true
  },
  "cat-shcho-70": {
    "type": "distribution-cabinet",
    "confidence": "source-based",
    "reason": "Высокая распределительная панель с верхним рядом приборов, одной дверью и нижней коммутационной зоной. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      33
    ],
    "inherit": true
  },
  "cat-shnn": {
    "type": "open-sided-distribution-panel",
    "confidence": "source-based",
    "reason": "По левому примеру на стр. 35 показана приборная лицевая панель в открытой боковой раме. На той же странице есть другая линейная панель; один фасад не наследуется всем вводным, секционным и линейным обозначениям.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shchsu-04": {
    "type": "plain-floor-cabinet",
    "confidence": "source-based",
    "reason": "Высокий напольный однодверный корпус без верхних вводов и внешних приборных панелей. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      36
    ],
    "inherit": true
  },
  "cat-bktp-modular": {
    "type": "single-modular-building",
    "confidence": "typical",
    "reason": "Общая запись объединяет разные БКТП и 2БКТП. Здесь условно показано однотрансформаторное здание по стр. 38; два конкретно подписанных обозначения имеют отдельные значки по стр. 38 и 39.",
    "sourcePages": [
      38,
      39
    ],
    "inherit": false
  },
  "cat-bktp-concrete": {
    "type": "concrete-substation-building",
    "confidence": "source-based",
    "reason": "Бетонный блок с плоской плитой кровли, центральными парными и двумя крайними дверями по иллюстрации верхнего модуля на стр. 41; скрытый подземный цоколь не подменяет внешний вид здания.",
    "sourcePages": [
      41
    ],
    "inherit": true
  },
  "cat-kru-k07-ktz": {
    "type": "switchgear",
    "confidence": "source-based",
    "reason": "Внутренняя выкатная ячейка с верхней релейной панелью и нижним силовым отсеком; общая конструкция, не схема аппаратов. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      43
    ],
    "inherit": true
  },
  "cat-krun07-ktz": {
    "type": "outdoor-switchgear-shelter",
    "confidence": "source-based",
    "reason": "Наружная сборка ячеек под общей двускатной кровлей на опорах. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      43
    ],
    "inherit": true
  },
  "cat-kru-kerneu-6-10": {
    "type": "switchgear",
    "confidence": "source-based",
    "reason": "Глубокая трёхсекционная ячейка с верхними приборами и выкатным силовым отсеком; исходная основа этого визуального типа. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      45
    ],
    "inherit": true
  },
  "cat-kru-kerneu-35": {
    "type": "deep-35kv-switchgear",
    "confidence": "source-based",
    "reason": "Глубокий корпус 35 кВ с верхним релейным и большим нижним выкатным отсеком по фронтальной и боковой проекциям стр. 47. Фасад ячейки 6–10 кВ не наследуется.",
    "sourcePages": [
      47
    ],
    "inherit": true
  },
  "cat-k8m": {
    "type": "outdoor-switchgear-shelter",
    "confidence": "source-based",
    "reason": "Глубокая наружная камера в укрытии с двускатной крышей и опорными стойками; визуализируется внешний корпус. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      49
    ],
    "inherit": true
  },
  "cat-k59": {
    "type": "outdoor-switchgear-shelter",
    "confidence": "source-based",
    "reason": "Наружная камера под крышей на опорных стойках; общий внешний контур с К-8М, без переноса внутренней аппаратуры. Значок передаёт общий внешний контур семейства, не точное исполнение.",
    "sourcePages": [
      51
    ],
    "inherit": true
  },
  "cat-km7m": {
    "type": "open-drawout-switchgear",
    "confidence": "source-based",
    "reason": "Релейный шкаф над открытым выкатным силовым отсеком по стр. 53. В источнике прямо указано отсутствие двери отсека выкатного элемента, поэтому сплошная нижняя дверь не добавлена.",
    "sourcePages": [
      53
    ],
    "inherit": true
  },
  "cat-ktpb-k": {
    "type": "outdoor-switchyard-substation",
    "confidence": "source-based",
    "reason": "Силуэт открытой площадки с аппаратными рамами, трансформатором и отдельным РУ по примеру КТПБ(К) 35/10(6) на стр. 55. Это пример площадки 35 кВ, а не модульное здание и не подтверждённая компоновка исполнений 110/220 кВ.",
    "sourcePages": [
      55
    ],
    "inherit": false
  }
});

export const sourceIconVariantMapA = Object.freeze({
  "cat-bktp-modular-v001": {
    "type": "single-modular-building",
    "confidence": "source-based",
    "reason": "Здание с большими парными воротами слева и отдельной дверью справа прямо подписано БКТП-2500/10-0,4 УХЛ1 на стр. 38; конструкция 2БКТП не наследуется.",
    "sourcePages": [
      38
    ],
    "inherit": false
  },
  "cat-bktp-modular-v002": {
    "type": "double-modular-building",
    "confidence": "source-based",
    "reason": "Трёхмодульное здание с центральным дверным проёмом соответствует прямо подписанной 2БКТП-2500/10-0,4 УХЛ1 на стр. 39; не однотрансформаторная БКТП.",
    "sourcePages": [
      39
    ],
    "inherit": false
  },
  "cat-ktps-100-1600-v007": {
    "type": "raised-outdoor-substation",
    "confidence": "source-based",
    "reason": "Общая открытая площадка с ограждением и лестницей прямо показана для КТПС 1000–1600/35 кВ на стр. 20. Значок сохраняет конструкцию без геометрии конкретной мощности.",
    "sourcePages": [
      20
    ],
    "inherit": false
  },
  "cat-ktpb-k-v001": {
    "type": "outdoor-switchyard-substation",
    "confidence": "source-based",
    "reason": "Исполнение КТПБ(К) 35/10(6) прямо указано в подписи примера общего вида открытой площадки на стр. 55; число аппаратов и размеры площадки условны.",
    "sourcePages": [
      55
    ],
    "inherit": false
  },
  "cat-ktpb-k-v002": {
    "type": "outdoor-switchyard-substation",
    "confidence": "typical",
    "reason": "Типовой символ открытой подстанции; использован контур примера 35 кВ со стр. 55. Конструкция исполнения 110/35/10(6) этим просмотренным общим видом не подтверждается.",
    "sourcePages": [
      55
    ],
    "inherit": false
  },
  "cat-ktpb-k-v003": {
    "type": "outdoor-switchyard-substation",
    "confidence": "typical",
    "reason": "Типовой символ открытой подстанции; использован контур примера 35 кВ со стр. 55. Конструкция исполнения 220/35/10(6) этим просмотренным общим видом не подтверждается.",
    "sourcePages": [
      55
    ],
    "inherit": false
  },
  "cat-shnn-v001": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v002": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v003": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v004": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v005": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v006": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v007": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v008": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v009": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v010": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v011": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v012": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v013": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v014": {
    "type": "open-sided-distribution-panel",
    "confidence": "typical",
    "reason": "Условный силуэт панели с автоматическим выключателем по левому примеру на стр. 35. Рисунок не связан однозначно с конкретным вводным или секционным обозначением; фасад исполнения не подтверждён.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v015": {
    "type": "open-sided-feeder-panel",
    "confidence": "typical",
    "reason": "Условный силуэт линейной панели по правому примеру с отходящими линиями на стр. 35. Этот пример не подписан конкретным обозначением ШНН-Л; число приборов и линий данного исполнения не утверждается.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v016": {
    "type": "open-sided-feeder-panel",
    "confidence": "typical",
    "reason": "Условный силуэт линейной панели по правому примеру с отходящими линиями на стр. 35. Этот пример не подписан конкретным обозначением ШНН-Л; число приборов и линий данного исполнения не утверждается.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v017": {
    "type": "open-sided-feeder-panel",
    "confidence": "typical",
    "reason": "Условный силуэт линейной панели по правому примеру с отходящими линиями на стр. 35. Этот пример не подписан конкретным обозначением ШНН-Л; число приборов и линий данного исполнения не утверждается.",
    "sourcePages": [
      35
    ],
    "inherit": false
  },
  "cat-shnn-v018": {
    "type": "open-sided-feeder-panel",
    "confidence": "typical",
    "reason": "Условный силуэт линейной панели по правому примеру с отходящими линиями на стр. 35. Этот пример не подписан конкретным обозначением ШНН-Л; число приборов и линий данного исполнения не утверждается.",
    "sourcePages": [
      35
    ],
    "inherit": false
  }
});
