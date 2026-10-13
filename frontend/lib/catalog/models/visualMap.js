import { getProtectionExampleAsset, getRejectedProtectionExampleAsset } from './protectionExampleRuntime.js';
import { getMeasurementColumn2026Completion } from './measurementColumn2026Completion.js';
import { getSourceAssetCompletion } from './sourceAssetCompletion.js';
import { getReviewedTransformerAsset, isTransformer2026Record } from './transformer2026Runtime.js';
import { sourceRecordVisuals } from './sourceConstructions.js';
import { getReviewedLegacyCompletion } from './legacyAssetCompletion.js';

/**
 * Construction audit of all 65 imported families and their 59 unchanged images.
 * Inspected 2026-10-01. This map is intentionally independent of navigation types.
 * A match means shared outer construction, never exact dimensions, CAD or internals.
 */
const baselineVisualAudit = Object.freeze({
  "cat-ktp-25-250": {
    "type": "substation",
    "sourcePages": [
      6
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktp-25-250.webp",
    "reason": "Сборка из двухъярусного шкафа с верхними вводами и открытого трансформатора на общей платформе; не мачтовая МТП.",
    "inherit": true
  },
  "cat-ktpn-25-3150": {
    "type": "compact-substation",
    "sourcePages": [
      8
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpn-25-3150.webp",
    "reason": "Закрытый прямоугольный корпус с двумя дверями, вентиляцией и двумя узлами ввода на крыше.",
    "inherit": true
  },
  "cat-2ktpn-25-3150": {
    "type": "double-compact-substation",
    "sourcePages": [
      10
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-2ktpn-25-3150.webp",
    "reason": "Две соседние закрытые трансформаторные секции с отдельными верхними вводами; одиночная КТПН не подставляется.",
    "inherit": true
  },
  "cat-ktpg-25-3150": {
    "type": "kiosk-substation",
    "sourcePages": [
      12
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpg-25-3150.webp",
    "reason": "Киоск с закрытым трансформаторным отсеком и парными дверями, без открытого бака снаружи.",
    "inherit": true
  },
  "cat-2ktpg-25-3150": {
    "type": null,
    "sourcePages": [
      13
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-2ktpg-25-3150.webp",
    "reason": "Чертёж показывает два киоска и центральный шкаф АВР; одиночный киоск не соответствует этой сборке.",
    "inherit": false
  },
  "cat-ktpp-2ktpp-250-6300": {
    "type": null,
    "sourcePages": [
      15
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpp-2ktpp-250-6300.webp",
    "reason": "Протяжённая внутренняя сборка КТПП/2КТПП с линейкой РУНН; в одном семействе разные компоновки.",
    "inherit": false
  },
  "cat-ktpo-4-10": {
    "type": null,
    "sourcePages": [
      17
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpo-4-10.webp",
    "reason": "Узкий высокий трёхсекционный корпус с верхними вводами; отличается от МТП на опоре и обычного шкафа.",
    "inherit": false
  },
  "cat-ktpto-80": {
    "type": null,
    "sourcePages": [
      18
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpto-80.webp",
    "reason": "Станция прогрева с открытым трансформатором за низким шкафом; обычная КТП не отражает эту компоновку.",
    "inherit": false
  },
  "cat-ktps-100-1600": {
    "type": null,
    "sourcePages": [
      19
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktps-100-1600.webp",
    "reason": "Открытая площадка 35 кВ с ограждением, лестницей и высоковольтной рамой; не компактная КТП.",
    "inherit": false
  },
  "cat-mtp-25-100": {
    "type": "pole-substation",
    "sourcePages": [
      21
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-mtp-25-100.webp",
    "reason": "Одна мачта с верхней траверсой, открытым трансформатором на кронштейне и нижним шкафом РУНН.",
    "inherit": true
  },
  "cat-mtpo-4-10": {
    "type": null,
    "sourcePages": [
      22
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-mtpo-4-10.webp",
    "reason": "Однофазная опорная компоновка с боковыми аппаратами и отличающимися траверсами; трёхфазная МТП не подставляется.",
    "inherit": false
  },
  "kso-366": {
    "type": "single-door-switchgear",
    "sourcePages": [
      23
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/kso-366.webp",
    "reason": "Высокая однодверная камера с отдельным верхним отсеком; повторяется общая закрытая конструкция КСО.",
    "inherit": true
  },
  "cat-kso-366m": {
    "type": "single-door-switchgear",
    "sourcePages": [
      24
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kso-366m.webp",
    "reason": "Однодверная высокая камера с отдельной верхней панелью; общий внешний контур с КСО-366, без вывода о внутренней схеме.",
    "inherit": true
  },
  "kso-2-10": {
    "type": null,
    "sourcePages": [
      25
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/kso-2-10.webp",
    "reason": "Релейная панель и силовой отсек отличаются от однодверной КСО-366 и трёхсекционного KERNEU; показан исходный чертёж.",
    "inherit": false
  },
  "cat-kso-2-20": {
    "type": null,
    "sourcePages": [
      27
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-kso-2-20.webp",
    "reason": "Иллюстрация представляет открытый разрез с вакуумными аппаратами; закрытый фасад из неё не восстанавливается.",
    "inherit": false
  },
  "kso-292": {
    "type": null,
    "sourcePages": [
      28
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/kso-292.webp",
    "reason": "Высокая камера с верхней сетчатой зоной и собственной лицевой панелью; исходная конструкция сохранена.",
    "inherit": false
  },
  "cat-rmu-ae": {
    "type": null,
    "sourcePages": [
      30
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-rmu-ae.webp",
    "reason": "Многосекционный RMU с газоизолированными ячейками; одиночный шкаф не представляет эту сборку.",
    "inherit": false
  },
  "cat-krn-iv": {
    "type": null,
    "sourcePages": [
      31
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-krn-iv.webp",
    "reason": "Наружная двухсекционная ячейка с уклонной крышей и вводами на крыше; не обычный внутренний шкаф.",
    "inherit": false
  },
  "cat-grsh-04": {
    "type": null,
    "sourcePages": [
      32
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "На странице приведены характеристики, но проверенного изображения конструкции нет.",
    "inherit": false
  },
  "cat-shcho-70": {
    "type": "distribution-cabinet",
    "sourcePages": [
      33
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-shcho-70.webp",
    "reason": "Высокая распределительная панель с верхним рядом приборов, одной дверью и нижней коммутационной зоной.",
    "inherit": true
  },
  "cat-shnn": {
    "type": null,
    "sourcePages": [
      35
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-shnn.webp",
    "reason": "Чертёж показывает рамную панель с открытыми боковыми зонами; вводные, секционные и линейные исполнения различаются.",
    "inherit": false
  },
  "cat-shchsu-04": {
    "type": "plain-floor-cabinet",
    "sourcePages": [
      36
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-shchsu-04.webp",
    "reason": "Высокий напольный однодверный корпус без верхних вводов и внешних приборных панелей.",
    "inherit": true
  },
  "cat-bktp-modular": {
    "type": null,
    "sourcePages": [
      38,
      39
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-bktp-modular.webp",
    "reason": "Страницы 38 и 39 показывают разные здания БКТП и 2БКТП; общий значок не подтверждает конкретную компоновку.",
    "inherit": false
  },
  "cat-bktp-concrete": {
    "type": null,
    "sourcePages": [
      41
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-bktp-concrete.webp",
    "reason": "Бетонное здание с собственной кровлей и расположением проёмов; не заменяется условным металлическим модулем.",
    "inherit": false
  },
  "cat-kru-k07-ktz": {
    "type": "switchgear",
    "sourcePages": [
      43
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kru-k07-ktz.webp",
    "reason": "Внутренняя выкатная ячейка с верхней релейной панелью и нижним силовым отсеком; общая конструкция, не схема аппаратов.",
    "inherit": true
  },
  "cat-krun07-ktz": {
    "type": "outdoor-switchgear-shelter",
    "sourcePages": [
      43
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-krun07-ktz.webp",
    "reason": "Наружная сборка ячеек под общей двускатной кровлей на опорах.",
    "inherit": true
  },
  "cat-kru-kerneu-6-10": {
    "type": "switchgear",
    "sourcePages": [
      45
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kru-kerneu-6-10.webp",
    "reason": "Глубокая трёхсекционная ячейка с верхними приборами и выкатным силовым отсеком; исходная основа этого визуального типа.",
    "inherit": true
  },
  "cat-kru-kerneu-35": {
    "type": null,
    "sourcePages": [
      47
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-kru-kerneu-35.webp",
    "reason": "Крупногабаритная глубокая ячейка 35 кВ имеет другую компоновку; геометрия 6–10 кВ не наследуется.",
    "inherit": false
  },
  "cat-k8m": {
    "type": "outdoor-switchgear-shelter",
    "sourcePages": [
      49
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-k8m.webp",
    "reason": "Глубокая наружная камера в укрытии с двускатной крышей и опорными стойками; визуализируется внешний корпус.",
    "inherit": true
  },
  "cat-k59": {
    "type": "outdoor-switchgear-shelter",
    "sourcePages": [
      51
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-k59.webp",
    "reason": "Наружная камера под крышей на опорных стойках; общий внешний контур с К-8М, без переноса внутренней аппаратуры.",
    "inherit": true
  },
  "cat-km7m": {
    "type": null,
    "sourcePages": [
      53
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-km7m.webp",
    "reason": "Разрез выкатной камеры показывает открытую нижнюю зону и особый релейный отсек; сохранён исходник.",
    "inherit": false
  },
  "cat-ktpb-k": {
    "type": null,
    "sourcePages": [
      55
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpb-k.webp",
    "reason": "Открытая подстанция 35/110/220 кВ с порталами и разными схемами площадки; не модульное здание БКТП.",
    "inherit": false
  },
  "cat-vru": {
    "type": null,
    "sourcePages": [
      60
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "Проверенного изображения конструкции нет; назначение ВРУ не определяет число и вид шкафов.",
    "inherit": false
  },
  "cat-shsn-04": {
    "type": null,
    "sourcePages": [
      61
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "Проверенного изображения конструкции нет; данные не подтверждают конкретный фасад шкафа.",
    "inherit": false
  },
  "cat-shuot": {
    "type": null,
    "sourcePages": [
      62
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-shuot.webp",
    "reason": "Сборка из приборного шкафа и отдельной открытой батарейной стойки; одиночный шкаф не соответствует.",
    "inherit": false
  },
  "cat-shtz": {
    "type": "wall-control-box",
    "sourcePages": [
      63
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-shtz.webp",
    "reason": "Неглубокий навесной ящик с верхними креплениями, дверными приборами и кнопками; не напольный шкаф.",
    "inherit": true
  },
  "cat-pr-shr11": {
    "type": null,
    "sourcePages": [
      64
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-pr-shr11.webp",
    "reason": "Показана открытая панель распределения, а ПР, ПР-11 и ШР11 объединены на странице; закрытый фасад не подтверждён.",
    "inherit": false
  },
  "cat-yatp": {
    "type": "wall-control-box",
    "sourcePages": [
      65
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-yatp.webp",
    "reason": "Навесной ящик с передней дверью и наружной коммутационной арматурой; общая форма корпуса, не расположение конкретных разъёмов.",
    "inherit": true
  },
  "cat-ya5000-rusm5000": {
    "type": "wall-box",
    "sourcePages": [
      66
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ya5000-rusm5000.webp",
    "reason": "На общем габаритном чертеже — небольшой навесной прямоугольный бокс; семейство повторяет корпус, не напольный шкаф.",
    "inherit": true
  },
  "cat-yauo": {
    "type": null,
    "sourcePages": [
      67
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "Текст подтверждает навесной ящик, но нет проверенного чертежа фасада и его органов управления.",
    "inherit": false
  },
  "cat-rusm-5100-5400": {
    "type": null,
    "sourcePages": [
      67
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "Текст описывает металлические ящики нескольких габаритов; конкретный фасад и пропорции не показаны.",
    "inherit": false
  },
  "cat-ptm-tded": {
    "type": null,
    "sourcePages": [
      69
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ptm-tded.webp",
    "reason": "Страница 69 содержит разные корпуса ПТМ(Д)-У1 и ТДЕ(Д)-9-У3; наследование одного корпуса всем обозначениям запрещено.",
    "inherit": false
  },
  "cat-bdrm": {
    "type": "wall-canopy-box",
    "sourcePages": [
      70
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-bdrm.webp",
    "reason": "Наружный навесной блок с козырьком, передней дверью и задними крепёжными планками. Общий чертёж страницы 70 связан с размерной таблицей; два обозначения только из схем отдельно исключены.",
    "inherit": true
  },
  "cat-pusk-3m": {
    "type": "control-cabinet",
    "sourcePages": [
      72
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-pusk-3m.webp",
    "reason": "Напольный шкаф на ножках с отделённой верхней приборной панелью и передней дверью.",
    "inherit": true
  },
  "cat-shueng": {
    "type": null,
    "sourcePages": [
      72,
      73
    ],
    "confidence": "unverified",
    "fallbackImage": null,
    "reason": "Даны текст и габариты, но отсутствует проверенный чертёж внешней конструкции.",
    "inherit": false
  },
  "cat-kik": {
    "type": "metering-box",
    "sourcePages": [
      74
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-kik.webp",
    "reason": "Квадратная стойка с небольшой дверцей и двускатным козырьком; отдельная от СКИП форма.",
    "inherit": true
  },
  "cat-skip": {
    "type": null,
    "sourcePages": [
      74
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-skip.webp",
    "reason": "Круглая трубчатая стойка с прямоугольной головкой и треугольной крышей; квадратная КИК не подставляется.",
    "inherit": false
  },
  "cat-ktpzh-2-4": {
    "type": null,
    "sourcePages": [
      75
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpzh-2-4.webp",
    "reason": "Опорная однофазная железнодорожная сборка с боковой арматурой; трёхфазная МТП не соответствует.",
    "inherit": false
  },
  "cat-ktpzh-25-1000": {
    "type": "railway-frame-substation",
    "sourcePages": [
      76
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpzh-25-1000.webp",
    "reason": "Повторяемая наружная сборка на общей платформе: высокая вводная рама, открытый трансформатор и шкафы НН. Общий вид серии со страницы 76, не чертёж отдельной мощности.",
    "inherit": true
  },
  "cat-mtpzh-1-25-2-5": {
    "type": null,
    "sourcePages": [
      77
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-mtpzh-1-25-2-5.webp",
    "reason": "Одна опора с одиночным боковым трансформатором; отсутствуют три ввода и большой бак трёхфазной МТП.",
    "inherit": false
  },
  "cat-mtpzh-10": {
    "type": null,
    "sourcePages": [
      78
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-mtpzh-10.webp",
    "reason": "Компактная сборка высокого шкафа и отдельного низкого трансформатора; название МТПЖ не означает мачтовую силуэтную форму.",
    "inherit": false
  },
  "cat-atp-2x25": {
    "type": null,
    "sourcePages": [
      81
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-atp-2x25.webp",
    "reason": "Закрытое блочно-модульное здание АТП с двумя дверями, цоколем и боковыми вводами на странице 81; внутренний разрез не выносится наружу.",
    "inherit": false
  },
  "cat-psk-27-5": {
    "type": null,
    "sourcePages": [
      84
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-psk-27-5.webp",
    "reason": "Пост секционирования с несколькими компоновками и высоковольтными аппаратами; нужен исходный чертёж.",
    "inherit": false
  },
  "cat-kru-27-5": {
    "type": null,
    "sourcePages": [
      86
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-kru-27-5.webp",
    "reason": "Железнодорожная ячейка с боковыми изоляторами и собственным фасадом; внутреннее КРУ 6–10 кВ не подставляется.",
    "inherit": false
  },
  "cat-pktp": {
    "type": "mining-skid-substation",
    "sourcePages": [
      87
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-pktp.webp",
    "reason": "Повторяемая передвижная сборка на полозьях: боковой шкаф, трансформатор и верхняя сетчатая зона вводов. Контур общего вида серии со страницы 87; размеры исполнения не переносятся.",
    "inherit": true
  },
  "cat-kru-rn": {
    "type": null,
    "sourcePages": [
      89
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-kru-rn.webp",
    "reason": "Рудничная ячейка с характерным смотровым окном и монтажной рамой; исходный чертёж сохраняет конструкцию.",
    "inherit": false
  },
  "cat-yakno-6-10": {
    "type": null,
    "sourcePages": [
      90
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-yakno-6-10.webp",
    "reason": "Шкаф на полозьях с высоким сетчатым ограждением вводов; обычный шкаф не представляет верхнюю защитную зону.",
    "inherit": false
  },
  "cat-yakno-20": {
    "type": null,
    "sourcePages": [
      91
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-yakno-20.webp",
    "reason": "Высокий трёхсекционный шкаф с сетчатой верхней камерой; отличается от ЯКНО 6–10 кВ и обычного КРУ.",
    "inherit": false
  },
  "cat-ktpshg": {
    "type": null,
    "sourcePages": [
      92
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ktpshg.webp",
    "reason": "Низкая шахтная горизонтальная сборка на полозьях с центральным баком; общий силуэт КТП не подходит.",
    "inherit": false
  },
  "cat-ukzv": {
    "type": null,
    "sourcePages": [
      93
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-ukzv.webp",
    "reason": "Высокая двухъярусная наружная установка с верхними изоляторами; не низкий шкаф катодной защиты.",
    "inherit": false
  },
  "cat-ukzn": {
    "type": "outdoor-floor-cabinet",
    "sourcePages": [
      93
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ukzn.webp",
    "reason": "Наружный высокий однодверный шкаф с козырьком на фундаменте; на странице 93 прямо отделён от двухъярусной УКЗВ. Отсутствующие у УКЗН верхние изоляторы не добавляются.",
    "inherit": true
  },
  "cat-bueskn": {
    "type": null,
    "sourcePages": [
      95
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-bueskn.webp",
    "reason": "Навесной блок с козырьком, верхними индикаторами и отдельной фасадной дверцей; сохранён исходный рисунок.",
    "inherit": false
  },
  "cat-bushk-2m": {
    "type": "plain-floor-cabinet",
    "sourcePages": [
      96
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-bushk-2m.webp",
    "reason": "Высокий узкий напольный однодверный шкаф; общая внешняя форма корпуса, приборы и вентиляция исполнения остаются в исходнике.",
    "inherit": true
  },
  "cat-ktpnd": {
    "type": "substation",
    "sourcePages": [
      97
    ],
    "confidence": "source-matched",
    "fallbackImage": "/catalog-products/cat-ktpnd.webp",
    "reason": "Двухъярусный шкаф с верхними вводами и открытым трансформатором за ним на общей платформе; форма родственна КТП 25–250.",
    "inherit": true
  },
  "cat-modular-oil": {
    "type": null,
    "sourcePages": [
      98
    ],
    "confidence": "source-only",
    "fallbackImage": "/catalog-products/cat-modular-oil.webp",
    "reason": "Длинный контейнер с лестницами и площадками; условная БКТП не отражает внешний вид.",
    "inherit": false
  }
});

// Update reviewed families, while keeping inheritance disabled for new constructions.
export const equipmentVisualAudit = Object.freeze(Object.fromEntries(
  Object.entries(baselineVisualAudit).map(([id, visual]) => [id, { ...visual, ...(sourceRecordVisuals[id] || {}) }]),
));

const explicitVariantVisuals = {
  'cat-bdrm-v010': { type: null, sourcePages: [70, 71], confidence: 'source-only', reason: 'Обозначение БДРМ-25-2-22 приведено только на принципиальной схеме и отличается от размерной таблицы; одинаковый корпус не утверждается.' },
  'cat-bdrm-v011': { type: null, sourcePages: [70, 71], confidence: 'source-only', reason: 'Обозначение БДРМ-25-4-41 приведено только на принципиальной схеме; его механическое исполнение отдельно не подтверждено.' },
  'cat-ukzv-v001': { type: 'upper-input-protection', sourcePages: [93], confidence: 'source-matched', reason: 'Буква В прямо означает воздушный ввод; верхние вводные изоляторы соответствуют общему виду УКЗВ на странице 93.' },
  'cat-ukzv-v003': { type: 'upper-input-protection', sourcePages: [93], confidence: 'source-matched', reason: 'Буква В прямо означает воздушный ввод; верхние вводные изоляторы соответствуют общему виду УКЗВ на странице 93.' },
  'cat-ukzv-v005': { type: 'upper-input-protection', sourcePages: [93], confidence: 'source-matched', reason: 'Буква В прямо означает воздушный ввод; верхние вводные изоляторы соответствуют общему виду УКЗВ на странице 93.' },
  'cat-bktp-modular-v001': { type: null, sourcePages: [38], confidence: 'source-only', fallbackImage: '/catalog-source/page-038.webp', reason: 'Однотрансформаторная БКТП прямо подписана на странице 38; чертёж двухтрансформаторной 2БКТП со страницы 39 не наследуется.' },
  'cat-bktp-modular-v002': { type: null, sourcePages: [39], confidence: 'source-only', reason: 'Двухтрансформаторная 2БКТП прямо подписана на странице 39; сохранён соответствующий исходный чертёж.' },
  'cat-ptm-tded-v012': { type: 'protection-cabinet', sourcePages: [69], confidence: 'source-matched', reason: 'На странице 69 этот корпус с козырьком прямо подписан ПТМ(Д)-У1; совпадение не распространяется на ТДЕ(Д)-9-У3.' },
};

const genericType = (product) => {
  if (product.category === 'transformers') {
    if (product.series === 'НТМИ') return 'instrument-transformer';
    return product.cooling === 'Сухое' || product.series === 'ТСЛ' ? 'dry-transformer' : 'oil-transformer';
  }
  if (product.series === 'РЛНД') return 'disconnector';
  return 'equipment';
};

/** Source-family visual evidence; do not substitute equipmentTypeFor() for this. */
export function getEquipmentVisual(product = {}) {
  const protectionExample = getProtectionExampleAsset(product, 'geometry');
  if (protectionExample) return protectionExample;
  const rejectedProtectionExample = getRejectedProtectionExampleAsset(product, 'geometry');
  if (rejectedProtectionExample) return rejectedProtectionExample;
  const columnCompletion = getMeasurementColumn2026Completion(product, 'geometry');
  if (columnCompletion) return columnCompletion;
  const sourceCompletion = getSourceAssetCompletion(product, 'geometry');
  if (sourceCompletion) return sourceCompletion;
  const completion = getReviewedLegacyCompletion(product, 'geometry');
  if (completion) return completion;
  if (isTransformer2026Record(product)) {
    const asset = getReviewedTransformerAsset(product, 'geometry');
    return { type: asset?.type || null, sourceFamilyId: product.familyId || product.id, sourcePages: asset?.sourcePages || product.sourcePages || [], confidence: asset ? 'source-matched' : 'source-only', fallbackImage: asset?.sourceImage || product.image || null, reason: asset ? (asset.reason || 'Иллюстративная компоновка по проверенному чертежу; не CAD, не размеры и не точная модель исполнения.') : 'Источник доступен постранично. Конструкция этого исполнения не подтверждена для 3D-модели.' };
  }
  const familyId = product.familyId || product.id;
  const audited = product.sourceKind === 'supplied-pdf' && Object.hasOwn(equipmentVisualAudit, familyId) ? equipmentVisualAudit[familyId] : null;
  if (audited) {
    const override = Object.hasOwn(sourceRecordVisuals, product.id) ? sourceRecordVisuals[product.id]
      : Object.hasOwn(explicitVariantVisuals, product.id) ? explicitVariantVisuals[product.id] : null;
    const canInherit = product.recordKind !== 'variant' || audited.inherit || override;
    return {
      type: canInherit ? (override ? override.type : audited.type) : null,
      sourceFamilyId: familyId,
      sourcePages: [...(override?.sourcePages || audited.sourcePages)],
      confidence: override?.confidence || (!canInherit && audited.confidence === 'source-matched' ? (audited.fallbackImage ? 'source-only' : 'unverified') : audited.confidence),
      fallbackImage: override?.fallbackImage || audited.fallbackImage || null,
      reason: override?.reason || audited.reason,
    };
  }
  const type = genericType(product);
  return {
    type,
    sourceFamilyId: null,
    sourcePages: [],
    confidence: type === 'equipment' ? 'unverified' : 'generic',
    fallbackImage: null,
    reason: type === 'equipment'
      ? 'Конструкция не сопоставлена с проверенным чертежом. Условный символ оборудования.'
      : 'Типовая иллюстрация: конкретная конструкция этой позиции не подтверждена просмотренным чертежом.',
  };
}
