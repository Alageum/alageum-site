import {Story,Hero,Section,Jump} from '@/components/public/story/Story';
import ArchiveFeature from '@/components/public/story/ArchiveFeature';
import MaterialDirectory from '@/components/public/MaterialDirectory';
export const metadata={title:'Архив материалов компании'};
export default function Materials(){return <Story name="materials"><Hero label="Архив материалов" variant="split" visual={<ArchiveFeature/>} title="Архив публикаций Alageum Electric" lead="Новости предприятий, интервью и материалы об истории группы. Даты и сведения приведены по исходным публикациям."><Jump href="#archive-search">Поиск в архиве</Jump></Hero><Section id="archive-search" label="ПОИСК В АРХИВЕ"><MaterialDirectory/></Section></Story>;}
