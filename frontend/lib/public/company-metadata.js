import {editorialMetadata} from './pages.js';
import {localizedHref} from '../i18n/routing.js';
// Preserve the project's explicit-origin policy and noindex local environment.
export function companyPageMetadata(metadata,path,locale='ru',origin=process.env.PAGES_SITE_ORIGIN){
 if(!origin)return metadata;
 const validated=editorialMetadata({locale_code:'ru',slug:'about',title:metadata.title},origin);
 const base=validated.alternates.canonical;
 return {...metadata,alternates:{canonical:new URL(localizedHref(path,locale),base).href,languages:Object.fromEntries(['ru','en','kk','zh','uz'].map(lang=>[lang,new URL(localizedHref(path,lang),base).href]))}};
}
