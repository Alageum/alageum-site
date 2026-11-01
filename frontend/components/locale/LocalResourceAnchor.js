'use client';
import E from './LocaleElement';
import {localResourceHref} from '@/lib/public/localResources';
export default function LocalResourceAnchor(props){return localResourceHref(props.href)===null?null:<E as="a" {...props}/>;}
