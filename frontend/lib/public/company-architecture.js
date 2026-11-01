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
 ['О компании','/company','Структура группы, история и признание'],
 ['Предприятия и производство','/manufacturers','Карта площадок и производственные технологии'],
 ['Руководство','/company/team','Люди и зоны ответственности'],
 ['Социальная ответственность','/company/social','Образование и общественные инициативы'],
 ['Новости','/news','Публикации компании и архив'],
 ['Карьера','/careers','Работа и развитие в Alageum'],
];
export const companyResources = [['Документы','/documents']];
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

export function investorRedirects(){return [
 {source:"/investors",destination:"/company#results",permanent:true},
 ...["ru","en","kk"].map(locale=>({source:`/${locale}/investors`,destination:`${locale==="ru"?"":"/"+locale}/company#results`,permanent:true})),
];}
