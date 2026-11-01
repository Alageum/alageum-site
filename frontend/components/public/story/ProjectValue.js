import E from '@/components/locale/LocaleElement';
import AnimatedNumber from './AnimatedNumber';
export default function ProjectValue({value}){if(/^\d+$/.test(value))return <AnimatedNumber value={Number(value)}/>;const parts=value.match(/^([\d ×,.]+)\s+(кВ|МВА|МВт)$/);return parts?<><span>{parts[1]}</span><E className="project-value-unit">{parts[2]}</E></>:value;}
