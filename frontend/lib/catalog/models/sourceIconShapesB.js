/**
 * Catalogue-only SVG symbols traced as simplified constructions from pages 60–98.
 * They do not add 3D models and never encode a SKU's dimensions or electrical layout.
 * All paths share the EquipmentIcon 64 × 64, 1.7 px, round-cap monoline treatment.
 */
const rect = (x, y, width, height) => `M${x} ${y}h${width}v${height}h-${width}z`;
const ring = (x, y, radius = 1.4) => `M${x - radius} ${y}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 -${radius * 2} 0`;
const bushing = (x, y, height = 9) => `M${x} ${y}v-${height}m-2 3h4m-5 3h6m-5 3h4`;
const horizontalBushing = (x, y, direction = 1, length = 8) => `M${x} ${y}h${length * direction}m${-2 * direction} -2v4m${-3 * direction} -5v6`;
const vents = (x, y, width) => `M${x} ${y}h${width}m-${width} 3h${width}m-${width} 3h${width}`;
const warning = (x, y) => `M${x} ${y}l-3 6h6z`;

export const sourceIconShapesB = Object.freeze({
  'battery-control-rack': {
    name: 'Шкаф оперативного тока с батарейной стойкой',
    paths: [
      'M7 14h23v42H7zM7 14l6-5h23l-6 5m0 0v42l6-5V9M7 36h23',
      rect(11, 20, 14, 11), rect(12, 42, 12, 9),
      ring(15, 17, 1), ring(22, 17, 1), 'M11 33h15M15 25h6M16 47h4',
      'M38 17h16v39H38zM38 17l5-5h16v39l-5 5m0-39 5-5M43 12v39M38 27h16l5-5H43M38 39h16l5-5H43M38 51h16l5-5H43',
      'M41 21h10v5H41zM41 33h10v5H41zM41 45h10v5H41zM5 58h26M36 58h20',
    ],
  },
  'open-distribution-panel': {
    name: 'Открытая распределительная панель',
    paths: [
      rect(15, 6, 35, 49), 'M15 6l4-2h35v47l-4 4M19 10h27v41H19zM14 55v4h37v-4',
      rect(29, 14, 8, 12), 'M31 18h4m-2-2v7M30 27v17m6-17v17',
      rect(22, 32, 5, 10), rect(39, 32, 5, 10),
      'M22 35h5m-5 4h5M39 35h5m-5 4h5M22 47h22M24 45v4m9-4v4m9-4v4',
    ],
  },
  'round-metering-post': {
    name: 'СКИП на круглой трубчатой стойке',
    paths: [
      'M20 18 32 5l12 13zM22 19h20v24H22zM25 22h14v18H25zM39 19v24',
      'M28 43v14q4 3 8 0V43M28 47q4 2 8 0M25 59h14', ring(28, 30, 1),
      'M19 25h3m20 0h3M19 36h3m20 0h3',
    ],
  },
  'railway-pole-single-phase': {
    name: 'Однофазная КТПЖ с боковой арматурой',
    paths: [
      'M29 5h4v54h-4zM14 17h19M15 17v-5h11v5M16 18l13 11M14 22h15M29 30h15M33 35h13M29 42h14M28 58h7',
      bushing(16, 13, 8), bushing(25, 13, 8),
      'M35 25h9v12h-9zM34 37h15M33 42h10v11H33zM36 45h4v5h-4zM44 31h8v6M49 41l-5 3',
      bushing(49, 31, 8), 'M36 28h5m-5 3h5m-5 3h5M9 59h43',
    ],
  },
  'railway-pole-mini-transformer': {
    name: 'Мачтовая однофазная МТПЖ с боковым трансформатором',
    paths: [
      'M36 5h4v54h-4zM10 13h31M12 15l17 15h12M16 15l15 11M35 34h7M35 45h7M35 54h7',
      bushing(13, 13, 7), bushing(29, 13, 7),
      'M28 28h8v10h-8zM28 31h8m-8 4h8M31 28v-4M18 41h10v12H18zM28 45h8m-8 5h8M33 53h3M33 58h10M10 59h40',
      bushing(22, 41, 9),
    ],
  },
  'railway-backboard-transformer': {
    name: 'МТПЖ с высоким шкафом и низким трансформатором',
    paths: [
      'M40 8h10v46H40zM40 8l5-3h10v46l-5 3M44 13h3v35h-3zM40 12 28 49',
      'M11 37h21v16H11zM9 35h25v3H9zM9 55h47v4H9zM15 53v2m13-2v2M16 42h10m-10 4h10m-10 4h10',
      bushing(19, 35, 12), 'M30 35v-5h3v5',
    ],
  },
  'railway-modular-building': {
    name: 'Блочно-модульное здание АТП с боковыми вводами',
    paths: [
      'M9 25h45v28H9zM7 21h49v4H7zM9 21l5-4h40l2 4M8 55h47v4H8zM32 25v28',
      rect(18, 28, 8, 25), rect(39, 28, 8, 25), 'M18 35h8m13 0h8M20 39v4m21-4v4M17 56h10m11 0h10',
      horizontalBushing(9, 32, -1, 5), horizontalBushing(54, 32, 1, 5),
      'M6 59h52',
    ],
  },
  'railway-sectioning-post': {
    name: 'Пост секционирования с наружной контактной группой',
    paths: [
      'M8 28h48v27H8zM6 24h52v4H6zM7 55h50v4H7zM42 28v27M46 35h5v20M47 43v4',
      'M10 8h31v27H10zM10 16h31M10 22h31M10 29h31M12 8v26m7-26v26m7-26v26m7-26v26m7-26v26',
      'M10 35h31v7H10zM11 36l7 6m1-6 7 6m1-6 7 6m1-6 6 5M11 41l7-5m1 6 7-6m1 6 7-6',
      'M12 45h11v10M25 45h13v10M17 47v3m13-3v3M10 8 8 5m33 3 2-3',
    ],
  },
  'railway-side-input-switchgear': {
    name: 'Железнодорожная ячейка КРУ с боковыми вводами',
    paths: [
      'M14 11h31v45H14zM14 11l5-4h31v45l-5 4M14 28h31M17 14h12v11H17zM32 14h10v11H32zM29 14v11',
      rect(21, 35, 16, 12), 'M28 51v3M17 31h3m19 0h3M17 52h3m19 0h3M14 58h33M28 7V4h5v3',
      horizontalBushing(50, 39), horizontalBushing(50, 49), 'M18 20h5m12-3v5m-2-3h4',
    ],
  },
  'mine-switchgear-window': {
    name: 'Рудничная ячейка со смотровым окном',
    paths: [
      'M16 9h29v45H16zM16 9l6-4h29v44l-6 5M16 31h29M19 12h23v16H19zM19 34h23v17H19z',
      'M26 16h9a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-1a4 4 0 0 1 4-4zM23 39v6',
      ring(27, 29, .8), ring(34, 29, .8), 'M14 54h39v5H14zM19 54v5m29-5v5',
    ],
  },
  'mine-fenced-switchgear': {
    name: 'ЯКНО с высокой сетчатой камерой на полозьях',
    paths: [
      'M21 13h24v24H21zM21 37h24v18H21zM21 43h24M24 39v2m0 5v6M9 56h46l-3 3H12zM18 55h30',
      'M22 15l20 20m-19-12 12 12m-5-21 14 14m-7-14 7 7M22 34l20-20m-20 12 12-12m-4 21 14-14m-7 14 7-7',
      bushing(24, 13, 9), bushing(33, 13, 9), bushing(42, 13, 9),
    ],
  },
  'mine-fenced-double-switchgear': {
    name: 'Широкая ЯКНО-20 с верхним сетчатым отсеком',
    paths: [
      'M14 11h36v25H14zM12 7h40v5H12zM12 36h40v22H12zM32 37v21M12 34h40M16 42v5m20-5v5M10 59h44',
      'M16 14l21 21m-21-13 13 13m-13-5 5 5m2-21 23 21m-15-21 17 16m-9-16 9 8m-1-8 1 1',
      'M16 35l21-21m-21 13 13-13m-13 5 5-5m2 21 23-21m-15 21 17-16m-9 16 9-8',
      'M19 31v4m12-4v4m12-4v4M20 4v3m12-3v3m12-3v3',
    ],
  },
  'mine-low-skid-substation': {
    name: 'Низкая шахтная подстанция на полозьях',
    paths: [
      'M5 48h54l-5 8H10zM7 30h12v18H7zM45 29h12v19H45zM20 26h24v22H20zM18 24h28v4H18zM8 30l3-7h5l3 7M45 29l3-6h6l3 6',
      'M23 30v15m4-15v15m4-15v15m4-15v15m4-15v15M21 46h22M25 21v3m15-3v3M9 36h7m-7 6h7M49 33v9h5M17 36h3m24 4h3',
      ring(11, 51, 1.4), ring(53, 51, 1.4), ring(12, 27, 1.2),
    ],
  },
  'wall-canopy-control': {
    name: 'Навесной БУЭСКН с козырьком и индикаторами',
    paths: [
      'M13 17h36v38H13zM11 11h40v6H11zM49 17l5-4v37l-5 5M51 11l3 2M11 20H8v9h3m0 14H8v9h3',
      'M16 26h30v26H16zM24 30h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V33a3 3 0 0 1 3-3z',
      ring(19, 21, 1.3), ring(27, 21, 1.1), ring(35, 21, 1.1), ring(43, 21, 1.3),
      'M18 24h3m4 0h4m4 0h4m4 0h3M25 43h11v4H25zM16 35h2m-2 11h2', warning(31, 34),
    ],
  },
  'long-service-container': {
    name: 'Длинный служебный контейнер с площадками и лестницами',
    paths: [
      'M10 26 46 13l10 6-36 13zM10 26v19l10 6V32M20 51l36-13V19M14 27v15l4 2V30M10 26l-1-3 5-2 5 3',
      'M24 33v15m4-16v15m4-17v16m4-17v15m4-17v16m4-17v15m4-17v16m4-17v15',
      'M6 42h8l6 4v5M6 36v14m8-10v10M6 38l7 3M8 46l12 7 5 6M9 49l10 6m-7-3 10 6M6 50l4 3m8-2 7 6M56 35l6 9m-6-3 5 6M57 39l3-1M58 42l3-1',
      'M13 21v-5l3-1v5M44 12V7l3-1v6M6 53v4m14-4v5',
    ],
  },
  'indoor-protection-enclosure': {
    name: 'Прямоугольный корпус ТДЕ без наружного козырька',
    paths: [
      'M13 17h34v36H13zM13 17l7-5h34v36l-7 5M47 17l7-5M18 22h24v26H18z',
      'M23 12V9m19 3V9M50 39h4m-4 4h4m-4 4h4M17 55h28',
    ],
  },
  'paired-protection-enclosures': {
    name: 'Два корпуса семейства ПТМ и ТДЕ',
    paths: [
      'M5 26h26v5H5zM7 31h22v22H7zM10 34h16v16H10zM9 54v4m18-4v4',
      ring(12, 37, 1), ring(12, 47, 1),
      'M36 25h20v29H36zM36 25l4-4h20v29l-4 4M40 29h12v21H40zM56 25l4-4M42 21v-3m12 3v-3M35 57h22',
    ],
  },
  'cable-protection-cabinet': {
    name: 'Условный шкаф защиты с кабельным вводом',
    paths: [
      'M18 12h28v37H18zM15 8h34v4H15zM22 17h20v26H22zM46 12l7-4v36l-7 5M24 30v7M18 51h28',
      'M27 51v5q0 4-5 4M37 51v5q0 4 5 4', warning(34, 22),
    ],
  },
});
