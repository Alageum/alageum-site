export default function CorporateArrow({ direction = 'up-right' }) {
  const paths = { 'up-right': 'M4 12 12 4M4 4h8v8', right: 'M3 8h10M9 4l4 4-4 4', down: 'M8 3v10M4 9l4 4 4-4' };
  return <svg className="corp-arrow" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[direction] || paths['up-right']} /></svg>;
}
