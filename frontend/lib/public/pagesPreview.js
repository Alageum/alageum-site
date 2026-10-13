// Reimplemented disposable-preview fixture, never an API-error fallback.
// Title/body/SEO text is verbatim from the verified existing company page.
// Dates describe its review snapshot, not a CMS publication.
export const previewPageProvenance = Object.freeze({ sourceFile: 'frontend/components/public/StaticCompanyPage.js', sourceUrl: 'https://alageum.com/ru/kompaniya/o-nas', reviewedAt: '2026-10-12' });
const paragraph = text => ({ type: 'paragraph', children: [{ type: 'text', text }] });
const aboutRu = {
  slug: 'about', title: 'О компании', locale_code: 'ru',
  body: [
    paragraph('Alageum Electric объединяет электротехнические, проектные и строительные предприятия Казахстана. Общая история группы началась в 1997 году.'),
    paragraph('Alageum Electric — электротехническая группа Казахстана. Предприятия работают в электроэнергетике, электромашиностроении и строительстве.'),
    paragraph('Производственные площадки выпускают трансформаторное и распределительное оборудование. Инженерные компании сопровождают проектирование, строительство, монтаж и пусконаладку.'),
    paragraph('Заказчик может обратиться к компетенциям группы на разных этапах: от проектирования и выбора оборудования до монтажа и технического обслуживания.'),
    { type: 'heading', level: 2, children: [{ type: 'text', text: 'НАПРАВЛЕНИЕ РАЗВИТИЯ' }] },
    paragraph('Миссия, заявленная группой: предлагать потребителям инновационные и эффективные решения в электромашиностроении.'),
    paragraph('Alageum Electric — наименование группы. Производитель, продавец и сторона договора определяются отдельно для каждого проекта.'),
  ],
  seo_title: 'О компании', seo_description: 'История ALAGEUM Electric с 1997 года. Электротехническое производство, проектирование, монтаж и сервис предприятий группы.',
  published_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z',
};
export function getPreviewPage(locale, slug) { return locale === 'ru' && slug === 'about' ? structuredClone(aboutRu) : null; }
export function previewPageParams() { return [{ locale: 'ru', slug: 'about' }]; }
