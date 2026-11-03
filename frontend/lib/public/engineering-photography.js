import {storyPhotos} from './story-photography';
import {getCorporatePhoto} from './photography';

// All frames already exist in the local archive. sourcePage/sourceImage retain
// their origin; captions identify the real plant, not a generic project site.
const archivePhoto = (path, alt, caption, sourcePage, sourceImage) => ({
  path: `/content/legacy-media/${path}.jpg`, width: 1000, height: 600,
  alt, caption, sourcePage: `https://alageum.com/ru/predpriyatiya/${sourcePage}`,
  sourceImage: `https://alageum.com/images/zavodi/${sourceImage}`, historical: true,
});
export const factoryPhotoEssays = {
  ktz: [storyPhotos.ktzProcess, storyPhotos.ktzProducts],
  'asia-trafo': [storyPhotos.asiaEngineering, storyPhotos.asiaLine],
  utz: [
    archivePhoto('0391879c1b80780b90b8f720', 'Работницы УТЗ собирают обмотки трансформатора в цехе', 'УТЗ · сборка обмоток', 'too-utz', 'utz/1.jpg'),
    archivePhoto('ae01fb214b251f30a5e8631c', 'Работница УТЗ у намоточного оборудования', 'УТЗ · намоточное оборудование', 'too-utz', 'utz/3.jpg'),
  ],
  aemz: [
    getCorporatePhoto('category-substations'),
    archivePhoto('23ce306a5d05ac28761fb7c3', 'Коллектив АЭМЗ на территории предприятия рядом с модульным оборудованием', 'АЭМЗ · коллектив завода, архивный кадр', 'too-aemz', 'aemz/2.jpg'),
  ],
  elmo: [
    archivePhoto('3e1a0f0b0f06f06ddc61ae29', 'Ряд электротехнических шкафов из официальной галереи Электромонтажа', 'Электромонтаж · шкафное оборудование из галереи предприятия', 'too-elektromontazh', 'elmo/1.jpg'),
    archivePhoto('2a9c6734df9a017e305f4535', 'Трансформатор с вентиляторами охлаждения из галереи Электромонтажа', 'Электромонтаж · установленный трансформатор из галереи предприятия', 'too-elektromontazh', 'elmo/2.jpg'),
  ],
  'batys-electric': [
    archivePhoto('342f9f1c7a168004e0c42f76', 'Корпус подстанции из официальной галереи Батыс Электрик', 'Батыс Электрик · корпус подстанции', 'too-aktauskij-transformatornyj-zavod', 'atz/Atz1.jpg'),
    archivePhoto('367ddf938a0bee141148b70a', 'Распределительное оборудование внутри подстанции из галереи Батыс Электрик', 'Батыс Электрик · распределительное оборудование', 'too-aktauskij-transformatornyj-zavod', 'atz/Atz3.jpg'),
  ],
  'ural-electric': [
    archivePhoto('4824fd5080c9d7494a7a6347', 'Работник Ural Electric выполняет гибку листового металла на прессе', 'Ural Electric · гибка листового металла', 'ural-electric', 'ue/14.jpg'),
    archivePhoto('c1289192d1124abcdc0cd3e5', 'Специалист Ural Electric у ячеек распределительного устройства', 'Ural Electric · распределительные ячейки', 'ural-electric', 'ue/11.jpg'),
  ],
};
