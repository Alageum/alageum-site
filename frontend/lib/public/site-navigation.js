import { corporateProfileHref } from './content.js';
import {catalogEquipmentGroups, catalogDirectionById, catalogDirectionHref} from './catalog-directions.js';
import {industries} from './industries.js';
import {companyMenuLinks} from './company-architecture.js';

const enterpriseLinks = [
 ['АТ', '/manufacturers/asia-trafo', 'Asia Trafo'],
 ['КТЗ', '/manufacturers/ktz', 'Кентауский трансформаторный завод'],
 ['АЭМЗ', '/manufacturers/aemz', 'Алматинский электромеханический завод'],
 ['Batys Electric', '/manufacturers/batys-electric', 'Подстанции в бетонном корпусе'],
 ['Ural Electric', '/manufacturers/ural-electric', 'Распределительное оборудование'],
 ['УТЗ', '/manufacturers/utz', 'Уральский трансформаторный завод'],
 ['ПЭТЗ', '/manufacturers/petz', 'Петропавловский электротехнический завод'],
 ['Электромонтаж', '/manufacturers/elmo', 'Проектирование и строительство'],
 ['ПромЭнерго', '/manufacturers/promenergo', 'Проектный институт'],
 ['Энергия', '/manufacturers/energia', 'Научно-проектный партнёр'],
];
export const catalogMenuGroups = catalogEquipmentGroups.map(({ label, items }) => ({
  label,
  links: items.map(item => [item.label ?? catalogDirectionById(item.id).title, catalogDirectionHref(item.id)]),
}));

export const siteNavigation = [
 {href:'/company',label:'О компании',title:'Alageum Electric',note:'История, руководство, новости и контакты компании.',links:companyMenuLinks,resources:[['Корпоративный профиль (PDF)',corporateProfileHref]]},
 {href:'/directions',label:'Направления',title:'Направления деятельности',links:[]},
 {href:'/manufacturers',label:'Предприятия',title:'Заводы и проектные организации',note:'Продукция, компетенции и контакты. Статус проектных партнёров указан в их профилях.',links:enterpriseLinks},
 {href:'/catalog/directions',label:'Каталог',title:'Разделы оборудования',links:catalogMenuGroups.map(({ label, links }) => (
   links.length === 1 ? links[0] : [label, links[0][1], null, links]
 ))},
 {href:'/industries',label:'Отрасли',title:'Отрасли применения',note:'Задачи электроснабжения, оборудование и проекты для вашего объекта.',links:industries.map(item=>[item.title,item.href]),resources:[['Все проекты','/projects']]},
 {href:'/investors',label:'Инвесторам',title:'Инвесторам',note:'Показатели группы и контакт для делового обращения.',links:[],hidden:true},
 {href:'/documents',label:'Проектировщикам',title:'Документы и каталоги',links:[]},
 {href:'/contacts',label:'Контакты',title:'Контакты',links:[]},
].filter(section => !section.hidden);
export {enterpriseLinks};
