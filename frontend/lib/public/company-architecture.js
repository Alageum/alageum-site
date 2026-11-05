// One route map for menus, migrated links and HTTP redirects.
export const companyDestinations = Object.freeze({
 history: '/company#history',
 achievements: '/company#achievements',
 production: '/manufacturers#technology',
 assets: '/contacts#assets',
});
export const companyNavigation = [
 ['О компании','/company'],
 ['Предприятия и производство','/manufacturers'],
 ['Руководство','/company/team'],
 ['Социальная ответственность','/company/social'],
];
export const companyMenuLinks = [
 ['О нас','/company','Предприятия группы, история и результаты'],
 ['История','/company#history','Основные этапы развития'],
 ['Команда','/company/team','Руководители компании'],
 ['Новости','/news','События на предприятиях группы'],
 ['Документы','/documents','Каталоги и материалы компании'],
 ['Социальная ответственность','/company/social','Образование и общественные инициативы'],
 ['Карьера','/careers','Вакансии и стажировки'],
 ['Контакты','/contacts','Отделы продаж и региональные офисы'],
];
export const companyResources = [];
export function companyDestination(section,locale='ru') {
 const target=companyDestinations[section];
 return target ? (['en','kk'].includes(locale)?`/${locale}${target}`:target) : null;
}
export function companyRedirects(){
 return Object.entries(companyDestinations).flatMap(([section,target])=>[
  {source:`/company/${section}`,destination:target,permanent:true},
  ...['ru','en','kk'].map(locale=>({source:`/${locale}/company/${section}`,destination:companyDestination(section,locale),permanent:true})),
 ]);
}

// Investors is a standalone route in the current navigation.
export function investorRedirects(){return [];}
