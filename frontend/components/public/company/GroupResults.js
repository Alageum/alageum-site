import E from '@/components/locale/LocaleElement';
import {Section,Source} from '../story/Story';
import AnimatedNumber from '../story/AnimatedNumber';
import {companyMetricFacts,companyMetricsSource} from '@/lib/public/company-metrics';
import './group-results.css';
const financials=['Выручка','Чистая прибыль'].map(label=>companyMetricFacts.find(fact=>fact.label===label));
export default function GroupResults(){return (
  <Section id="results" className="group-results investor-results" title="Масштаб бизнеса">
    <div className="investor-results-grid">
      <div className="investor-financials">{financials.map(fact=><article key={fact.label}>
        <E as="h3">{fact.label}</E><strong><AnimatedNumber value={fact.value} decimals={fact.decimals}/><E as="span">{fact.unit}</E></strong>
      </article>)}<E as="p" className="investor-period">Результаты за 2024 год</E></div>
      <div className="investor-scale">
        <p><strong>25</strong><E as="span">место среди 75 крупнейших частных компаний Казахстана</E></p>
        <p><strong>4 100</strong><E as="span">сотрудников</E></p>
        <Source href={companyMetricsSource.href}>Forbes Kazakhstan · декабрь 2025</Source>
      </div>
    </div>
  </Section>
);}
