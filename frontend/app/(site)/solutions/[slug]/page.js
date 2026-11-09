import { Fragment } from 'react';
import {PhotoEssay} from '@/components/public/story/Visuals';
import {factoryPhotoEssays} from '@/lib/public/engineering-photography';
import {getManufacturerPhoto,getCorporatePhoto} from '@/lib/public/photography';
import SolutionCircuit from '@/components/public/story/SolutionCircuit';
import E from '@/components/locale/LocaleElement';
import {notFound} from 'next/navigation';
import {Story,Hero,Section,ChapterNav,Jump,ReadingLinks,Source} from '@/components/public/story/Story';
import {solutions,solutionById} from '@/lib/public/solutions';
const scenarios={
 distribution:{title:'Оборудование для распределительных сетей',question:'Что важно при выборе трансформатора',text:'Для подбора трансформатора нужны расчётная нагрузка, напряжение на входе и выходе, условия установки. Эти данные определяют мощность и исполнение оборудования.',checks:[['Нагрузка меняется в течение суток','Приложите график или описание нагрузки. Укажите планируемое расширение и режим максимального потребления.'],['Место установки ограничено','Опишите площадку, климат и доступ для обслуживания. Отдельно отметьте требования к шуму и потерям.']],links:[['/manufacturers/utz','Герметичные трансформаторы','Конструкция ТМГ и номенклатура Уральского завода.'],['/manufacturers/ktz','Трансформаторное производство','Продукция и производство Кентауского трансформаторного завода.']]},
 industry:{title:'Электроснабжение предприятия',question:'Как работает ваше производство?',text:'При подборе учитывают пусковые токи, непрерывность производства и резервное питание. Подготовьте однолинейную схему и сведения об основных потребителях.',checks:[['Производство нельзя останавливать','Укажите, какое оборудование нельзя отключать, на какое время допустим перерыв и откуда поступает резервное питание.'],['Площадка реконструируется','Передайте действующую схему, данные существующего оборудования и ограничения по монтажу.']],links:[['/manufacturers/aemz','Распределение и управление','Распределительные устройства и шкафное оборудование АЭМЗ.'],['/manufacturers/elmo','Работы на действующем объекте','Проектирование, монтаж и пусконаладка.']]},
 infrastructure:{title:'Электроснабжение зданий и районов',question:'Где планируете установить подстанцию?',text:'Для нового объекта подбирают подстанцию и распределительное оборудование по техническим условиям подключения, расчётной нагрузке и плану участка.',checks:[['Проектируется новая застройка','Подготовьте технические условия, план участка и расчётную нагрузку. Отметьте очередность строительства.'],['Нужна подстанция в готовом корпусе','Согласуйте габариты, транспортировку, основание и доступ к оборудованию с проектировщиком.']],links:[['/manufacturers/batys-electric','Подстанция в бетонном корпусе','Блочное исполнение Батыс Электрик.'],['/projects/expo-2017','Электроснабжение EXPO','Пример поставки сухих трансформаторов.']]}
};
const productionExamples={
 distribution:{photos:factoryPhotoEssays.utz,text:'УТЗ выпускает масляные и сухие трансформаторы классов 6, 10 и 20 кВ мощностью до 2 500 кВА. На фотографиях — сборка обмоток и намоточное оборудование завода.',source:'https://alageum.com/ru/predpriyatiya/too-utz',label:'Продукция и производство УТЗ'},
 industry:{photos:factoryPhotoEssays.aemz,text:'АЭМЗ выпускает оборудование 0,4–35 кВ: КРУ внутренней и наружной установки, подстанции КТП, камеры КСО и шкафные конструкции. На фотографиях — модульное оборудование и коллектив завода.',source:'https://alageum.com/ru/predpriyatiya/too-aemz',label:'Продукция и производство АЭМЗ'},
 infrastructure:{photos:factoryPhotoEssays['batys-electric'],text:'Батыс Электрик в Актау выпускает блочные комплектные подстанции в бетонном корпусе мощностью 250–2 500 кВА. На фотографиях — корпус подстанции и распределительное оборудование из галереи предприятия.',source:'https://alageum.com/ru/predpriyatiya/too-aktauskij-transformatornyj-zavod',label:'Подстанции Батыс Электрик'},
};
export const dynamicParams=false;
export function generateStaticParams(){return solutions.map(item=>({slug:item.id}));}
export async function generateMetadata({params}){const item=solutionById((await params).slug);return {title:item?.title||'Решение',description:item?.description};}
const layouts = {
  distribution: { variant: 'split', order: ['principle', 'conditions', 'inputs', 'suppliers'] },
  industry: { variant: 'dark', order: ['conditions', 'principle', 'inputs', 'suppliers'] },
  infrastructure: { variant: 'wide', order: ['inputs', 'conditions', 'principle', 'suppliers'] },
};

const chapters = {
  principle: ['#solution-principle', 'Схема электроснабжения'],
  conditions: ['#solution-conditions', 'Условия работы'],
  inputs: ['#solution-inputs', 'Данные для подбора'],
  suppliers: ['#solution-suppliers', 'Предприятия'],
};

export default async function SolutionPage({ params }) {
  const item = solutionById((await params).slug);
  if (!item) notFound();
  const scenario = scenarios[item.id];
  const example = productionExamples[item.id];
  const layout = layouts[item.id];
  const photo = item.id === 'industry' ? getManufacturerPhoto('aemz') : item.id === 'distribution' ? getCorporatePhoto('category-transformers') : getManufacturerPhoto('batys-electric');

  const sections = {
    principle: <Section id="solution-principle" className="solution-principle" label="СХЕМА ЭЛЕКТРОСНАБЖЕНИЯ">
      <SolutionCircuit id={item.id} />
    </Section>,
    conditions: <Section id="solution-conditions" label="УСЛОВИЯ РАБОТЫ" title={scenario.question}>
      <div className="story-decision">{scenario.checks.map(([title, text]) =>
        <div key={title}><E as="h3">{title}</E><E as="p" style={{ marginTop: 22 }}>{text}</E></div>)}
      </div>
      <PhotoEssay photos={example.photos} />
      <E as="p">{example.text}</E>
      <Source href={example.source}>{example.label}</Source>
    </Section>,
    inputs: <Section id="solution-inputs" tone="paper" label="ДАННЫЕ ДЛЯ ПОДБОРА" title="Что прислать инженеру">
      <div className="story-columns">
        <ol className="story-checklist">{item.inputs.map(text => <E as="li" key={text}>{text}</E>)}</ol>
        <div>
          <E as="h3">Подходящее оборудование</E>
          <ul className="story-checklist">{item.equipment.map(text => <E as="li" key={text}>{text}</E>)}</ul>
          <Jump href={`/catalog?category=${item.category}`}>Перейти к оборудованию</Jump>
          <br />
          <Jump href={`/inquiry?intent=selection&solution=${item.id}`}>Подготовить запрос на подбор</Jump>
        </div>
      </div>
      <E as="p" className="story-note">Окончательное исполнение и комплектность оборудования определяются проектом.</E>
    </Section>,
    suppliers: <Section id="solution-suppliers" title="Кто выпускает и поставляет оборудование"><ReadingLinks items={scenario.links} /></Section>,
  };

  return <Story name={`solution-${item.id}`}>
    <Hero label={item.title} kicker={null} parent={{ href: '/solutions', label: 'Решения' }} variant={layout.variant} photo={photo} title={scenario.title} lead={scenario.text}>
      <Jump href={chapters[layout.order[0]][0]}>{chapters[layout.order[0]][1]}</Jump>
    </Hero>
    <ChapterNav items={layout.order.map(section => chapters[section])} />
    {layout.order.map(section => <Fragment key={section}>{sections[section]}</Fragment>)}
  </Story>;
}
