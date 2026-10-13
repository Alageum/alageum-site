/**
 * Catalog-only 64 × 64 monoline symbols, inspected against source pages 6–55.
 * Paths describe visible family construction, not dimensions or connection schemes.
 * Render with fill="none", strokeWidth={1.7}, round joins/caps, currentColor.
 * Deliberately independent of the procedural 3D model registry.
 */
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h-${w}z`;
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`;
const vents = (x, y, w) => `M${x} ${y}h${w}m-${w} 3h${w}m-${w} 3h${w}`;
const bushing = (x, y) => `M${x} ${y}v-8m-2 3h4m-5 3h6`;
const kiosk = (x) => [
  `M${x} 24l10-3 10 3M${x + 1} 25h18v29h-18z`,
  `M${x + 4} 29h12v22h-12zM${x + 10} 29v22M${x + 7} 36v4m6-4v4`,
  vents(x + 5, 44, 3), vents(x + 12, 44, 3),
];
const panelFrame = [
  'M15 12h27v44H15zM15 12l9-7h27v44l-9 7M42 12l9-7M42 56V12',
  'M46 11v37m0-16 5-4M42 36l9-7M42 53l9-7',
];

export const sourceIconShapesA = Object.freeze({
  'double-kiosk-substation': {
    name: 'Два киоска с центральным шкафом АВР',
    paths: [...kiosk(5), ...kiosk(39), rect(27, 38, 10, 16), 'M5 57h54M30 42h4m-4 4h4'],
  },
  'indoor-transformer-lineup': {
    name: 'Внутренняя подстанция с линейкой РУНН',
    paths: [
      'M5 25h6v29H5zM53 25h6v29h-6zM11 39h4m34 0h4M5 57h54',
      'M15 35h8v19h-8zM41 35h8v19h-8zM13 33h12m14 0h12',
      'M17 38v13m3-13v13m24-13v13m3-13v13M18 33v-5m26 5v-5',
      'M24 29h16v25H24zM28 29v25m4-25v25m4-25v25M24 38h16M24 47h16',
      'M26 33h1m3 0h1m3 0h1m3 0h1',
    ],
  },
  'tall-single-phase-substation': {
    name: 'Высокая трёхъярусная однофазная подстанция',
    paths: [
      'M21 14h22v42H21zM19 12h26M43 14l6-3v43l-6 2M21 29h22M21 43h22M19 59h26',
      bushing(25, 12), bushing(39, 12), rect(29, 48, 6, 4),
      'M24 34v5M33 32l-5 8h10zM32 35v2M22 56v3m20-3v3',
    ],
  },
  'heating-transformer-assembly': {
    name: 'Станция прогрева с трансформатором на общей раме',
    paths: [
      'M9 22h28v31H9zM8 19h30v3H8zM37 22l6-4v33l-6 2M7 54h49l-4 4H11z',
      'M43 22h11v28H43M43 18h13v5H43M47 26v21m3-21v21M43 50h12',
      rect(19, 28, 8, 5), 'M21 38l-4 7h9zM12 25v25M34 25v25',
    ],
  },
  'raised-outdoor-substation': {
    name: 'Открытая подстанция 35 кВ на площадке с лестницей',
    paths: [
      'M8 57h50v3H8zM15 55V22m6 0v33M12 24h23M17 22V9h15v15',
      bushing(13, 23), bushing(25, 23),
      'M25 38h19V27H25zM23 25h23M30 25v-6m10 6v-6M28 31v5m5-5v5m5-5v5',
      'M20 41h33M20 45h33M20 34v21m11-16v16M52 29v26M20 35h32',
      'M46 36v19m6-19v19M46 42h6m-6 5h6m-6 5h6',
    ],
  },
  'single-phase-pole-substation': {
    name: 'Однофазная мачтовая подстанция с боковым трансформатором',
    paths: [
      'M38 7h4v53h-4zM12 14h32M15 14l15 10h14M14 13q6-8 16-2',
      bushing(16, 13), bushing(30, 13),
      'M21 32h11v12H21zM19 31h15M15 45h29M17 45l13 8h14M18 36h3M15 33v6m-3-5v4m-3-3v2',
      'M33 25h5v6h-5M34 27h4m-4 2h4M42 49h8v8h-8M45 52v2M35 60h17',
    ],
  },
  'relay-panel-switchgear': {
    name: 'Камера КСО с верхней релейной панелью',
    paths: [
      'M18 12h27v44H18zM18 12l7-6h27v44l-7 6M45 12l7-6M45 12v44M17 59h30M18 29h27',
      rect(22, 17, 8, 7), rect(35, 17, 6, 7),
      'M22 27h2m4 0h2m4 0h2m4 0h1M22 36v7M39 36v7',
      rect(28, 36, 7, 4), rect(29, 48, 5, 3),
    ],
  },
  'open-vacuum-switchgear': {
    name: 'Открытый разрез камеры с тремя вакуумными аппаратами',
    paths: [
      'M10 17h34v40H10zM44 7h7v50h-7zM51 10h5v16h-5M10 33h34M11 53h33M8 59h45',
      ...[18, 28, 38].flatMap(x => [
        bushing(x, 31), `M${x - 3} 29h6v4h-6zM${x} 33v6`,
        rect(x - 3, 39, 6, 12), `M${x - 3} 43h6m-6 5h6`,
      ]),
      'M13 55h28M47 11v42',
    ],
  },
  'mesh-top-relay-switchgear': {
    name: 'Камера с сетчатым верхним отсеком и релейным фасадом',
    paths: [
      'M17 13h30v44H17zM17 13l8-6h29v44l-7 6M47 13l7-6M47 13v44M15 60h34M17 23h30M17 43h30',
      rect(20, 16, 24, 4), 'M24 16v4m5-4v4m5-4v4m5-4v4',
      rect(21, 26, 22, 14), rect(28, 30, 8, 7),
      'M23 28h1m3 0h1m3 0h1m3 0h1m3 0h1M23 34v3M22 46v7',
      rect(28, 46, 8, 4),
    ],
  },
  'rmu-three-cell-lineup': {
    name: 'Трёхсекционное распределительное устройство RMU',
    paths: [
      'M9 12h45v44H9zM9 12l5-5h45v44l-5 5M54 12l5-5M24 12v44M39 12v44M9 22h45M9 41h45M7 59h49',
      ...[13, 28, 43].flatMap(x => [
        `M${x} 26h5v6h5M${x} 36h5v-4m0 6h5M${x + 1} 46h6`,
        rect(x + 6, 26, 3, 3),
      ]),
    ],
  },
  'outdoor-roof-input-switchgear': {
    name: 'Наружная двухъярусная камера с вводами на кровле',
    paths: [
      'M18 18h28v39H18zM16 17h32M46 18l9-5v39l-9 5M18 36h28M16 60h33',
      'M16 17V7m32 10V7M16 7h32M48 7l7 6',
      bushing(22, 17), bushing(32, 17), bushing(42, 17),
      rect(22, 23, 20, 10), rect(22, 40, 20, 13),
      'M27 26h10M25 44v5',
    ],
  },
  'main-distribution-lineup': {
    name: 'Типовой многопанельный главный распределительный щит',
    paths: [
      'M7 16h49v39H7zM6 58h52M23 16v39m17-39v39M7 29h49',
      rect(11, 20, 8, 5), rect(27, 20, 9, 5), rect(44, 20, 8, 5),
      'M11 36v8m16-8v8m17-8v8M15 47h4m12 0h4m12 0h4',
    ],
  },
  'open-sided-distribution-panel': {
    name: 'Низковольтная панель с открытой боковой рамой',
    paths: [
      ...panelFrame, rect(23, 27, 12, 10),
      'M19 41v7M20 17h3v4h-3zM26 17h3v4h-3zM32 17h3v4h-3zM46 34v13M46 25l4-3M13 59h31',
    ],
  },
  'open-sided-feeder-panel': {
    name: 'Линейная низковольтная панель с открытой рамой',
    paths: [
      ...panelFrame, 'M15 32h27M15 47h27M18 35h21m-21 8h21M22 33v13m6-13v13m6-13v13',
      rect(22, 17, 13, 10), 'M26 17v10m5-10v10M22 22h13M13 59h31',
      'M28 49l-3 5h6z',
    ],
  },
  'single-modular-building': {
    name: 'Однотрансформаторная БКТП: ворота и боковая дверь',
    paths: [
      'M5 23 32 16l27 7v3H5zM8 26h48v29H8zM6 58h52',
      'M11 29h25v24H11zM23 29v24M40 32h10v21H40zM43 39v5M40 29h10',
      'M18 19v-2m29 2v-2M36 27v28',
    ],
  },
  'double-modular-building': {
    name: 'Двухтрансформаторная 2БКТП с центральным проёмом',
    paths: [
      'M5 23 32 18l27 5v3H5zM8 26h48v29H8zM6 58h52',
      'M24 26v29m16-29v29M26 34h12v20H26zM32 34v20M29 41v4m6-4v4',
      'M11 29h10v23H11zM43 29h10v23H43zM17 21v-3m30 3v-3',
    ],
  },
  'concrete-substation-building': {
    name: 'БКТП в бетонном здании с плоской плитой кровли',
    paths: [
      'M5 22 38 11l21 10-33 11zM7 25v25l19 9 31-11V24M26 32v27M7 38l19 9 31-11M26 44l31-11',
      'M10 28v20l5 2V30M18 31v20l6 3V34M21 33v19',
      'M11 35l2 1m-2 3 2 1M19 37l4 2m-4 4 4 2M41 29v23M7 50l19 9 31-11',
    ],
  },
  'deep-35kv-switchgear': {
    name: 'Глубокая камера 35 кВ с релейным и выкатным отсеками',
    paths: [
      'M14 15h26v42H14zM14 15l17-10h26v42L40 57M40 15 57 5M40 15v42M14 29h26M13 59h30',
      'M42 30l15-9M48 10v40M16 18h21v8H16zM18 21h4m4 0h3m4 0h2M18 34v13',
      circle(28, 38, 1.5), circle(28, 47, 1.5),
      'M44 9h5m3-2h3',
    ],
  },
  'open-drawout-switchgear': {
    name: 'Выкатная камера с открытым нижним силовым отсеком',
    paths: [
      'M18 9h27v48H18zM18 9l7-4h27v47l-7 5M45 9l7-4M45 9v48M18 27h27M16 60h33',
      rect(22, 14, 8, 6), rect(35, 14, 6, 6),
      'M23 23h1m4 0h1m4 0h1m4 0h1M22 31h19v23H22zM24 44v-6q4-7 8 0q4-7 7 0v6',
      'M23 44h17M25 45v6m12-6v6M24 51h15',
    ],
  },
  'outdoor-switchyard-substation': {
    name: 'Открытая блочная подстанция с аппаратными рамами',
    paths: [
      'M5 57h54M7 36h19M10 36v18m13-18v18M7 54h19',
      bushing(11, 35), bushing(21, 35), 'M11 28h10M30 15v40m-2-40h4M27 24h6',
      'M26 30q4-10 11 0M37 34h12v17H37zM35 32h16M40 37v11m4-11v11M43 32v-8',
      'M50 40h9v14h-9M49 39l5-4 6 4M43 23q7-7 12 12M28 55h5M35 54h16',
    ],
  },
});
