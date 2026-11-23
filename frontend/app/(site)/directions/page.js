import E from '@/components/locale/LocaleElement';
import { Story, Hero, Section } from '@/components/public/story/Story';
import { activityDirections } from '@/lib/public/activity-directions';

export const metadata = { title: 'Направления деятельности' };

export default function DirectionsPage() {
  return (
    <Story name="directions">
      <Hero label="Направления" kicker={null} variant="wide" title="Направления деятельности" />
      <Section>
        <ul className="activity-directions-list">
          {activityDirections.map(({ id, title }) => <E as="li" key={id} id={id}>{title}</E>)}
        </ul>
      </Section>
    </Story>
  );
}
