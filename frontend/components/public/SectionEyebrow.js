import E from '@/components/locale/LocaleElement';

export default function SectionEyebrow({ number, label }) {
  return <E as="p" className="site-eyebrow">{number && <span>{number} / </span>}{label}</E>;
}
