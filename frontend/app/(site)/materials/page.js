import {Story,Hero,Section,Jump} from '@/components/public/story/Story';
import ArchiveFeature from '@/components/public/story/ArchiveFeature';
import MaterialDirectory from '@/components/public/MaterialDirectory';
export const metadata={title:'Архив материалов компании'};
export default function Materials(){return <Story name="materials"><Hero label="Архив материалов" variant="split" visual={<ArchiveFeature/>} title="Найдите нужную публикацию." lead="Исторические материалы о предприятиях, людях и событиях. Сведения сохраняют дату исходной публикации и не заменяют текущий профиль компании."><Jump href="#archive-search">Поиск в архиве</Jump></Hero><Section id="archive-search" label="ПОИСК В АРХИВЕ"><MaterialDirectory/></Section></Story>;}
