import SealedTransformer from './SealedTransformer';
import E from '@/components/locale/LocaleElement';
// Concept diagrams explain construction/process, not dimensions or performance.
export default function FactoryFocus({id}) {
 if(id==='utz')return <SealedTransformer/>;
 if(id==='asia-trafo')return <E as="figure" className="factory-focus focus-model"><div className="focus-model-fields">{['Электромагнитная модель','Тепловая модель','Динамическая модель'].map(text=><E key={text}>{text}</E>)}</div><div className="focus-model-output"><E>Конструкторская документация</E><span aria-hidden="true">→</span><E>Производство</E></div><E as="figcaption">По результатам расчётов инженеры готовят чертежи для изготовления трансформатора.</E></E>;
 if(id==='batys-electric')return <E as="figure" className="factory-focus focus-concrete"><div className="concrete-shell"><div className="concrete-room"><E>Электротехническая часть</E><i/><i/><i/></div><E className="concrete-label">Бетонная оболочка</E></div><E as="figcaption">Бетонный корпус и электротехническая часть БКТП. Схема без указания габаритов.</E></E>;
 if(id==='ural-electric')return <E as="figure" className="factory-focus focus-wire"><div className="wire-cross"><E>Провод</E><E>Эмалевое покрытие</E></div><E as="figcaption">Условное сечение эмалированного круглого провода. Толщина покрытия и диаметр не показаны в масштабе.</E></E>;
 return null;
}
