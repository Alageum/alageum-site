import E from '@/components/locale/LocaleElement';
import {EcoHero,EcoSection} from '@/components/ecosystem/Parts';
import MaterialDirectory from '@/components/public/MaterialDirectory';
import './[slug]/materials.css';
export const metadata={title:'Материалы компании'};
export default function Materials(){return <E as="div" className="eco-page"><EcoHero label="МАТЕРИАЛЫ" title="Публикации и опыт компании." text="Сохранённые материалы о предприятиях, проектах, руководстве и общественных инициативах. Исторические сведения относятся к периоду публикации."/><EcoSection><MaterialDirectory/></EcoSection></E>;}
