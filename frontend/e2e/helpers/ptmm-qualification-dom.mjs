// Self-contained so Playwright can evaluate this exact function in the page.
// Unit counterexamples execute the same function against measured DOM doubles.
export function measurePtmmReadability(element, { requireTargetInViewport = false } = {}) {
  const violations = [], tolerance = 1, maxFragments = 256, maxAncestors = 64;
  const offending = [], maxDiagnostics = 8;
  let omittedDiagnostics = 0;
  const bounds = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  const fail = (code, part, boundary) => {
    if (!violations.includes(code)) violations.push(code);
    if (part) {
      if (offending.length < maxDiagnostics) offending.push({ code, rect: bounds(part), word: part.word, textNode: part.textNode, start: part.start, end: part.end,
        ...(boundary ? { boundary: bounds(boundary) } : {}) });
      else omittedDiagnostics++;
    }
  };
  // Detail unit text is a sibling of dd; API comparison units live in th.
  const cell = element.closest('td, dd, th') || element.closest('.technical-specs > div');
  if (!cell) return { readable: false, violations: ['missing-cell'], fragments: 0, ancestors: 0, diagnostics: { target: bounds(element.getBoundingClientRect()), cell: null } };
  const range = document.createRange(); range.selectNodeContents(element);
  const fullFragments = [...range.getClientRects()];
  if (fullFragments.length > maxFragments) fail('fragment-limit');
  // pre-wrap preserves spaces that may hang past a soft line break. A full
  // text-node Range includes their advance width; measure the visible words
  // separately without changing text, styles or any containment tolerance.
  const fragments = [], walker = document.createTreeWalker(element, 4);
  let textNode, textNodes = 0, words = 0, characters = 0;
  while ((textNode = walker.nextNode())) {
    if (++textNodes > 64) { fail('text-node-limit'); break; }
    characters += textNode.data.length;
    if (characters > 8192) { fail('text-character-limit'); break; }
    for (const match of textNode.data.matchAll(/[^ \t\r\n\f]+/g)) {
      if (++words > maxFragments) { fail('word-limit'); break; }
      range.setStart(textNode, match.index); range.setEnd(textNode, match.index + match[0].length);
      let visibleParts = 0;
      for (const part of range.getClientRects()) {
        if (part.width <= 0 || part.height <= 0) continue;
        visibleParts++;
        if (fragments.length >= maxFragments) { fail('fragment-limit'); break; }
        fragments.push({ ...bounds(part), width: part.width, height: part.height, word: match[0].slice(0, 48), textNode: textNodes - 1, start: match.index, end: match.index + match[0].length });
      }
      if (!visibleParts) fail('missing-word-geometry');
      if (violations.includes('fragment-limit')) break;
    }
    if (violations.includes('word-limit') || violations.includes('fragment-limit')) break;
  }
  if (!fragments.length) fail('missing-text');
  const rect = cell.getBoundingClientRect();
  if (cell.clientWidth <= 0 || cell.clientHeight <= 0) fail('empty-cell');
  if (cell.scrollWidth > cell.clientWidth + tolerance) fail('cell-horizontal-overflow');
  if (cell.scrollHeight > cell.clientHeight + tolerance) fail('cell-vertical-overflow');
  const insideX = (part, box) => part.left >= box.left - tolerance && part.right <= box.right + tolerance;
  const insideY = (part, box) => part.top >= box.top - tolerance && part.bottom <= box.bottom + tolerance;
  const viewport = { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
  for (const part of fragments) {
    if (![part.left, part.right, part.top, part.bottom].every(Number.isFinite)) fail('invalid-text-geometry', part);
    if (!insideX(part, rect)) fail('text-outside-cell-width', part, rect);
    if (!insideY(part, rect)) fail('text-outside-cell-height', part, rect);
    if (!insideX(part, viewport)) fail('text-outside-horizontal-viewport', part, viewport);
    if (requireTargetInViewport && !insideY(part, viewport)) fail('target-outside-vertical-viewport', part, viewport);
  }
  // Vertical viewport clipping is normal page scrolling. The whole caveat may
  // be taller than the viewport, but its entire range must remain reachable.
  const scrolling = document.scrollingElement || document.documentElement;
  const documentHeight = scrolling.scrollHeight;
  for (const part of fragments) {
    if (part.top + window.scrollY < -tolerance || part.bottom + window.scrollY > documentHeight + tolerance) fail('text-outside-document-scroll-range', part, { left: 0, right: window.innerWidth, top: -window.scrollY, bottom: documentHeight - window.scrollY });
  }
  let ancestors = 0;
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    if (++ancestors > maxAncestors) { fail('ancestor-limit'); break; }
    const style = getComputedStyle(ancestor);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.contentVisibility === 'hidden' || Number(style.opacity) === 0) fail('hidden-content');
    if ((style.clipPath && style.clipPath !== 'none') || (style.clip && style.clip !== 'auto')) fail('unmeasured-css-clip');
    const bounds = ancestor.getBoundingClientRect();
    const scaleX = ancestor.offsetWidth ? bounds.width / ancestor.offsetWidth : 1;
    const scaleY = ancestor.offsetHeight ? bounds.height / ancestor.offsetHeight : 1;
    // The root's rectangle moves with document scroll; its actual scrollport
    // stays at viewport origin. Do not subtract document scroll twice.
    const rootScroller = ancestor === scrolling;
    const client = rootScroller ? { left: 0, right: ancestor.clientWidth, top: 0, bottom: ancestor.clientHeight }
      : { left: bounds.left + ancestor.clientLeft * scaleX, right: bounds.left + (ancestor.clientLeft + ancestor.clientWidth) * scaleX,
        top: bounds.top + ancestor.clientTop * scaleY, bottom: bounds.top + (ancestor.clientTop + ancestor.clientHeight) * scaleY };
    const paintClip = /(?:^|\s)(?:paint|strict|content)(?:\s|$)/.test(style.contain || '');
    const overflowX = style.overflowX || 'visible', overflowY = style.overflowY || 'visible';
    const clipsX = paintClip || ['hidden', 'clip', 'auto', 'scroll'].includes(overflowX);
    const clipsY = paintClip || ['hidden', 'clip'].includes(overflowY);
    const scrollsY = !paintClip && ['auto', 'scroll'].includes(overflowY);
    for (const part of fragments) {
      if (clipsX && !insideX(part, client)) fail('ancestor-horizontal-clipping', part, client);
      if (clipsY && !insideY(part, client)) fail('ancestor-vertical-clipping', part, client);
      if (scrollsY) {
        const scrollTop = rootScroller ? window.scrollY : ancestor.scrollTop, verticalScale = rootScroller ? 1 : scaleY;
        const reachable = { top: client.top - scrollTop * verticalScale, bottom: client.top + (ancestor.scrollHeight - scrollTop) * verticalScale };
        if (!insideY(part, reachable)) fail('text-outside-ancestor-scroll-range', part, reachable);
        if (requireTargetInViewport && !insideY(part, client)) fail('target-outside-ancestor-scroll-viewport', part, client);
      }
    }
  }
  const rawOutsideCell = fullFragments.filter(part => part.width > 0 && part.height > 0 && !insideX(part, rect));
  const targetStyle = getComputedStyle(element);
  const diagnostics = { target: bounds(element.getBoundingClientRect()), targetTag: element.tagName, cell: bounds(rect), cellTag: cell.tagName,
    cellScroll: { width: cell.scrollWidth, height: cell.scrollHeight, clientWidth: cell.clientWidth, clientHeight: cell.clientHeight },
    whiteSpace: targetStyle.whiteSpace, font: targetStyle.font, tolerance, words, textNodes,
    wordBounds: fragments.length ? { left: Math.min(...fragments.map(part => part.left)), right: Math.max(...fragments.map(part => part.right)),
      top: Math.min(...fragments.map(part => part.top)), bottom: Math.max(...fragments.map(part => part.bottom)) } : null,
    fullRangeFragments: fullFragments.length, rawCellWidthOverflow: rawOutsideCell.length,
    rawOutsideCell: rawOutsideCell.slice(0, maxDiagnostics).map(bounds),
    rawOutsideCellOmitted: Math.max(0, rawOutsideCell.length - maxDiagnostics),
    offending, omittedDiagnostics };
  return { readable: violations.length === 0, violations, fragments: fragments.length, ancestors, requireTargetInViewport, diagnostics };
}

// Read only the actual unit-bearing DOM location, never the caveat or fixture.
// The spec separately measures visibility/clipping on that same unit node.
export function measurePtmmRenderedUnit(element, { mode, label, value, family }) {
  const detail = element.closest('dd');
  let kind, actual = '', expected;
  if (detail) {
    kind = 'detail';
    const unit = detail.parentElement.querySelector(':scope > span.catalog-spec-text');
    actual = unit ? [...unit.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() : '';
    expected = 'мм';
  } else if (mode === 'static') {
    kind = 'static-comparison';
    actual = element.firstElementChild?.textContent.trim() || '';
    expected = `${family} в таблице источника: ${value} мм.`;
  } else if (mode === 'api') {
    kind = 'api-comparison';
    actual = element.closest('tr')?.querySelector('th')?.textContent.trim() || '';
    expected = `${label}, мм`;
  } else return { valid: false, kind: 'unknown', actual, expected: 'unit-bearing DOM node' };
  return { valid: actual === expected, kind, actual, expected };
}
