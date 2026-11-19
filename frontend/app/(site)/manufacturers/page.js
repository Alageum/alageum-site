import { Suspense } from 'react';
import E from '@/components/locale/LocaleElement';
import { Story, Hero, Section } from '@/components/public/story/Story';
import CompanyAnchorRestore from '@/components/public/company/CompanyAnchorRestore';
import { companyPageMetadata } from '@/lib/public/company-metadata';
import EnterpriseDirectory from '@/components/public/EnterpriseDirectory';

const pageMetadata = {
  title: 'Предприятия и производство',
  description: 'Карта предприятий и офисов продаж Alageum Electric: адреса, контакты и специализации.',
};

export async function generateMetadata({ params }) {
  return companyPageMetadata(pageMetadata, '/manufacturers', (await params)?.locale || 'ru');
}

export default function Manufacturers() {
  return (
    <Story name="geography">
      <Hero label="Предприятия и производство" kicker={null} variant="wide" title="Заводы и проектные организации" lead="Выберите город или область на карте — появятся предприятия, адреса и телефоны." />
      <Section id="company-map" label="ПРЕДПРИЯТИЯ НА КАРТЕ">
        <Suspense fallback={<E as="p" role="status">Загружаем карту…</E>}>
          <EnterpriseDirectory />
        </Suspense>
      </Section>
      <CompanyAnchorRestore ids={['company-map']} waitFor=".corp-geography" />
    </Story>
  );
}
