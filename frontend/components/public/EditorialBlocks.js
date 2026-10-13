import { validatePageBlocks } from '../../lib/public/pages.js';

function Text({ node }) {
  let text = node.text;
  if (node.code) text = <code>{text}</code>;
  if (node.bold) text = <strong>{text}</strong>;
  if (node.italic) text = <em>{text}</em>;
  if (node.underline) text = <u>{text}</u>;
  if (node.strikethrough) text = <s>{text}</s>;
  return text;
}

function Nodes({ nodes, listParent = false }) {
  return nodes.map((node, index) => {
    const children = node.children ? <Nodes nodes={node.children} listParent={node.type === 'list'} /> : null;
    switch (node.type) {
      case 'text': return <Text key={index} node={node} />;
      case 'link': return <a key={index} href={node.url} rel="noopener noreferrer">{children}</a>;
      case 'paragraph': return <p key={index}>{children}</p>;
      case 'heading': { const Heading = `h${Math.max(2, node.level)}`; return <Heading key={index}>{children}</Heading>; }
      case 'quote': return <blockquote key={index}>{children}</blockquote>;
      case 'code': return <pre key={index}><code>{children}</code></pre>;
      case 'list': {
        const List = node.format === 'ordered' ? 'ol' : 'ul';
        return listParent ? <li key={index} className="editorial-list-nested"><List>{children}</List></li> : <List key={index}>{children}</List>;
      }
      case 'list-item': return <li key={index}>{children}</li>;
      default: return null;
    }
  });
}
export default function EditorialBlocks({ body }) { return <div className="editorial-body"><Nodes nodes={validatePageBlocks(body)} /></div>; }
