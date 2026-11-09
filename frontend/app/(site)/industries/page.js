import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import {Story, Hero, Section, Jump} from '@/components/public/story/Story';
import {getCorporatePhoto, getManufacturerPhoto, getProjectPhoto} from '@/lib/public/photography';
import {industries} from '@/lib/public/industries';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import {storyPhotos} from '@/lib/public/story-photography';

export const metadata = companyPageMetadata({
  title: 'Отрасли',
  description: 'Оборудование и проекты Alageum Electric для энергетики, промышленности, строительства, инфраструктуры и ВИЭ.',
}, '/industries');

const photos = {
  corporate: getCorporatePhoto,
  manufacturers: getManufacturerPhoto,
  projects: getProjectPhoto,
};

export default function Industries() {
  return <Story name="industries">
    <Hero label="Отрасли" title="Оборудование по отрасли и задаче" lead="Выберите отрасль: здесь собраны подходящие направления оборудования, исходные данные для подбора и проекты группы." photo={getManufacturerPhoto('ktz')} variant="dark">
      <Jump href="#industry-list">Отрасли</Jump>
    </Hero>
    <Section id="industry-list" label="НАПРАВЛЕНИЯ" title="Для какого объекта нужно оборудование?">
      <div className="story-industry-grid">
        {industries.map(item => {
          const photo = item.id === 'renewables' ? storyPhotos.asiaEngineering : photos[item.photoGroup]?.(item.photoId);
          return <Link className="story-industry-card" key={item.id} href={item.href}>
            {photo && <CorporatePhoto photo={photo} className="story-industry-photo" sizes="(max-width: 760px) 100vw, (max-width: 1100px) 44vw, 29vw" />}
            <div className="story-industry-card-content">
              <E as="span" className="story-index" aria-hidden="true">{item.number}</E>
              <E as="h3">{item.title}</E>
              <E as="p">{item.description}</E>
              <E as="span" className="story-industry-card-action">Оборудование и проекты <CorporateArrow /></E>
            </div>
          </Link>;
        })}
      </div>
    </Section>
    <Section tone="paper" title="Уже есть спецификация?">
      <div className="story-columns">
        <E as="p" className="story-lead">Найдите оборудование по обозначению, мощности или напряжению.</E>
        <div><Jump href="/catalog">Перейти к каталогу</Jump><br/><Jump href="/contacts">Обсудить задачу с отделом продаж</Jump></div>
      </div>
    </Section>
  </Story>;
}
