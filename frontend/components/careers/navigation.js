// The careers navigation has four destinations, not aliases of page sections.
// Shared chrome consumes this configuration; copy and legacy addresses live here.
export const careerSections = [
  {
    href: "/careers",
    label: "Карьера",
    title: "Работа в группе",
    note: "Профессии и рабочая среда",
    links: [],
  },
  {
    href: "/careers/vacancies",
    label: "Вакансии",
    title: "Вакансии",
    note: "Поиск и требования",
    links: [],
  },
  {
    href: "/careers/internships",
    label: "Стажировки",
    title: "Студентам и выпускникам",
    note: "Программа и подготовка",
    links: [],
  },
  {
    href: "/careers/apply",
    label: "Отклик",
    title: "Подготовить отклик",
    note: "Резюме и письмо HR",
    links: [],
  },
];
export const careerFooterGroups = [
  [
    "Карьера",
    [
      ["Карьера", "/careers"],
      ["Вакансии", "/careers/vacancies"],
    ],
  ],
  [
    "Кандидатам",
    [
      ["Стажировки", "/careers/internships"],
      ["Отклик", "/careers/apply"],
    ],
  ],
  [
    "Alageum Electric",
    [
      ["Предприятия", "/manufacturers"],
      ["Контакты", "/contacts"],
    ],
  ],
];
export const careerLegacyDestinations = {
  about: "/careers",
  team: "/careers#workplaces",
  workplaces: "/careers#workplaces",
  learning: "/careers#learning",
  process: "/careers/apply#preparation",
};
export function careerSectionIndex(pathname) {
  const path = pathname.replace(/^\/(ru|kk|en)(?=\/|$)/, "").split(/[?#]/)[0];
  let found = -1;
  careerSections.forEach(({ href }, index) => {
    if (path === href || path.startsWith(href + "/")) {
      if (found < 0 || href.length > careerSections[found].href.length)
        found = index;
    }
  });
  return found;
}
