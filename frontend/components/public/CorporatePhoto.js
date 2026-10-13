import LocaleElement from "@/components/locale/LocaleElement";import Image from "@/components/locale/LocaleImage";

export default function CorporatePhoto({ photo, className = '', priority = false, caption = true, sizes = '(max-width: 760px) 100vw, 60vw' }) {
  if (!photo) return null;
  return <LocaleElement as="figure" className={`corp-photo ${className}`}>
    <Image src={photo.path} alt={photo.alt} width={photo.width} height={photo.height} preload={priority} sizes={sizes} style={{ objectFit: photo.fit || 'cover', objectPosition: photo.objectPosition || 'center' }} />
    {caption && <LocaleElement as="figcaption">{photo.caption}</LocaleElement>}
  </LocaleElement>;
}
