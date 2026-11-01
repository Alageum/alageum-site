import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import E from '@/components/locale/LocaleElement';
export default function DocumentShelf(){return <div className="visual-document-shelf">{[['group','/documents/alageum-group-2024.pdf','Каталог группы компаний',1000,717],['reference','/documents/asia-trafo-references-2019-2023.pdf','Референс-лист Asia Trafo',707,1000],['substations','/catalog/source?page=1','Шкафные конструкции',708,1000]].map(([id,href,label,width,height])=><Link href={href} key={id}><Image src={`/photography/stories/document-${id}.webp`} width={width} height={height} alt={label}/><E>{label}</E></Link>)}</div>;}
