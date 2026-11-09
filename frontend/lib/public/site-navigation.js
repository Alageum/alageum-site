import { corporateProfileHref } from './content.js';
import {topCatalogDirections, catalogDirectionById, catalogDirectionHref} from './catalog-directions.js';
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
export const siteNavigation = [
 {href:'/catalog/directions',label:'Каталог',title:'Каталог оборудования',note:'Выберите тип оборудования. Внутри — исполнения, опубликованные позиции и проекты.',links:topCatalogDirections.map(item=>[item.title,catalogDirectionHref(item.id),null,item.children.map(id=>{const child=catalogDirectionById(id);return [child.title,catalogDirectionHref(id)];})]),resources:[['Весь каталог','/catalog'],['Каталог оборудования','/catalog/directions'],['Моя подборка','/selection']]},
 {href:'/industries',label:'Отрасли',title:'Оборудование по отраслям',note:'Задачи электроснабжения, оборудование и проекты для вашего объекта.',links:industries.map(item=>[item.title,item.href]),resources:[['Все проекты','/projects']]},
 {href:'/manufacturers',label:'Предприятия',title:'Заводы и проектные организации',note:'Продукция, компетенции и контакты. Статус проектных партнёров указан в их профилях.',links:enterpriseLinks},
 {href:'/investors',label:'Инвесторам',title:'Инвесторам',note:'Показатели группы и контакт для делового обращения.',links:[]},
 {href:'/documents',label:'Проектировщикам',title:'Документы и каталоги',links:[]},
 {href:'/company',label:'Компания',title:'Alageum Electric',note:'История, руководство, новости и контакты компании.',links:companyMenuLinks,resources:[['Корпоративный профиль (PDF)',corporateProfileHref]]},
];
export {enterpriseLinks};
