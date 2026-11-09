import E from '@/components/locale/LocaleElement';

export default function WorkspaceHeading({title, children}) {
  return <header className="b2b-heading">
    <div>
      <E as="p" className="b2b-heading-label">B2B кабинет</E>
      <E as="h1">{title}</E>
    </div>
    {children}
  </header>;
}
