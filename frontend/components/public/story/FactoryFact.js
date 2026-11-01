import E from '@/components/locale/LocaleElement';
import AnimatedNumber from './AnimatedNumber';
export default function FactoryFact({value}){
 if(value==='400+')return <AnimatedNumber value={400} suffix="+"/>;
 const single=value.match(/^(до |>)?([\d ]+) (МВА\/год|МВА|кВА|кВ и выше)$/);
 if(single)return <><E className="spec-prefix">{single[1]||''}</E><AnimatedNumber value={Number(single[2].replaceAll(' ',''))}/><E className="spec-unit">{single[3]}</E></>;
 const range=value.match(/^([\d –/]+) (кВА|кВ)$/);if(range)return <><span className="spec-range">{range[1]}</span><E className="spec-unit">{range[2]}</E></>;
 return <span>{value}</span>;
}
