// These catalog rendering harnesses test source data and provenance, not Next
// routing, translation or select interaction. Keep their existing native DOM
// boundaries compatible with the current locale/design wrapper imports.
// All catalog logic, property values, hrefs and children remain the real source.
export function stubRenderBoundaries(source) {
  const native = { LocaleLink: 'a', LocalResourceAnchor: 'a', LocaleImage: 'img', DesignSelect: 'select' };
  return source.replace(/import\s+([\w$]+)\s+from\s+(['"])(?:@\/|file:[^'"]*\/frontend\/)components\/(?:locale|ui)\/(LocaleElement|LocaleLink|LocalResourceAnchor|LocaleImage|DesignSelect)(?:\.js)?\2\s*;/g,
    (_, name, quote, kind) => kind === 'LocaleElement'
      ? `const ${name} = ({ as: Tag = 'span', children, ...props }) => <Tag {...props}>{children}</Tag>;`
      : `const ${name} = props => <${native[kind]} {...props}/>;`);
}
