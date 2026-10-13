// Content migration inventory. Facts describe their cited publication, not live status.
export const contentSources = [
 {section:'История',source:'https://alageum.com/ru/kompaniya/istoriya',destination:'/company/history',material:'Общая история группы',status:'adapted'},
 {section:'Предприятия',source:'https://alageum.com/ru/predpriyatiya',destination:'/manufacturers',material:'Восемь профилей; исходные фотографии и специализация',status:'adapted'},
 {section:'Производство',source:'https://alageum.com/ru/napravleniya/elektromashinostroenie',destination:'/company/production',material:'Направления деятельности и технические возможности',status:'adapted'},
 {section:'Проекты',source:'https://alageum.com/images/katalog/2Imid_rus2024.pdf',destination:'/projects',material:'Исторические реализованные работы; роль и источник указаны в каждом кейсе',status:'adapted'},
 {section:'Поставки',source:'https://asiatrafo.kz/images/referent.pdf',destination:'/projects',material:'Референсы поставок 2019–2023 годов',status:'adapted'},
 {section:'Руководство',source:'https://alageum.com/ru/kompaniya/rukovodstvo',destination:'/company/team',material:'Портреты, имена, должности и ссылки на биографии',status:'adapted'},
 {section:'Достижения',source:'https://alageum.com/ru/kompaniya/dostizheniya',destination:'/company/achievements',material:'Исторические награды с указанием года',status:'adapted'},
 {section:'Социальные проекты',source:'https://alageum.com/ru/kompaniya/soc-otv',destination:'/company/social',material:'Направления социальной ответственности',status:'adapted'},
 {section:'Новости',source:'https://alageum.com/ru/novosti',destination:'/news',material:'Три публикации; локальная подборка от 12.10.2026',status:'adapted'},
 {section:'Вакансии',source:'https://alageum.com/ru/karera/aktualnye-vakansii',destination:'/careers/vacancies',material:'Две опубликованные позиции; актуальность уточняется у HR',status:'needs-current-confirmation'},
 {section:'Стажировки',source:'https://alageum.com/ru/karera/stazhirovki-dlya-studentov',destination:'/careers/internships',material:'Направления программы и контакт для резюме; устаревшие зарплатные данные не перенесены',status:'needs-current-confirmation'},
 {section:'Финансовые материалы',source:null,destination:'/investors',material:'Финансовая отчётность, инвестиционные параметры и специальный контакт',status:'needs-company-materials'},
 {section:'Истории сотрудников',source:null,destination:'/careers/team',material:'Интервью, условия работы и программы развития',status:'needs-company-materials'},
 {section:'Коммерческие документы',source:null,destination:'/client/documents',material:'Реквизиты, налоги, нумерация, подтверждение заказов и правила выпуска счёта',status:'needs-business-approval'},
];
export const implementationStages = [
 {id:'foundation',title:'Три сайта и единая навигация',deliverables:['Корпоративная главная','Каталог как отдельная главная','Карьерная главная','Языковые адреса и сохранение маршрута']},
 {id:'content',title:'Материалы и доверие',deliverables:['Реестр источников','Профили восьми предприятий','Руководство','Интерактивная карта','Новости и инвесторы']},
 {id:'journeys',title:'Локальные пользовательские сценарии',deliverables:['Проект и оборудование','Черновик запроса','Демонстрация согласования и заказа','Документы и локальные PDF','Контекстная поддержка','Отклик кандидата']},
 {id:'validation',title:'Проверка трёх языков и устройств',deliverables:['Словарь терминов','Проверка маршрутов','Проверка переполнений','Доступность форм и меню','Проверка основных сценариев']},
 {id:'integration',title:'Подключение компании — отдельный этап',deliverables:['Подтверждение актуальности вакансий','Утверждение реквизитов и документов','CRM и уведомления','Хранение и проверка файлов на сервере','Рабочие учётные записи и согласование публикации']},
];
