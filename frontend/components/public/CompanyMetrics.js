import E from '@/components/locale/LocaleElement';
import CorporatePhoto from './CorporatePhoto';
import SectionEyebrow from './SectionEyebrow';
import './CompanyMetrics.css';

const operations = [
  { value: '15', label: 'действующих заводов' },
  { value: '4500', label: 'сотрудников' },
  { value: '30+', label: 'предприятий' },
  { value: '20', label: 'сервисных центров' },
  { value: '6', label: 'международных представительств' },
  { value: '2', label: 'проектных института' },
  { value: '1', label: 'научно-инженерный центр' },
];

function OperationsFigures({ items, className }) {
  return <dl className={className}>
    {items.map(({ value, label }) => <div key={label}>
      <E as="dt">{label}</E>
      <dd>{value}</dd>
    </div>)}
  </dl>;
}

export default function CompanyMetrics({ number, operationsPhoto }) {
  return <section id="group-in-figures" className="company-metrics" aria-labelledby="company-operations-title">
    <div className="site-container">
      <div className="company-operations">
        <div className="company-operations-feature">
          <div className="company-operations-lead">
            <SectionEyebrow number={number} label="Компания в цифрах" />
            <E as="h2" id="company-operations-title">Компания в цифрах</E>
            <OperationsFigures items={operations.slice(0, 2)} className="company-operations-primary" />
            <E as="p" className="company-operations-founded">Группа основана в 1997 году.</E>
          </div>
          <CorporatePhoto photo={operationsPhoto} className="company-operations-photo" sizes="(max-width: 640px) 100vw, 45vw" />
        </div>
        <OperationsFigures items={operations.slice(2)} className="company-operations-secondary" />
      </div>
    </div>
  </section>;
}
