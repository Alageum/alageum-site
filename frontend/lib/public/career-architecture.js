import {careerLegacyDestinations} from '../../components/careers/navigation.js';
export function careerRedirects(){
 const aliases=Object.entries(careerLegacyDestinations).flatMap(([slug,target])=>['','ru','kk','en','zh','uz'].map(locale=>({source:`${locale?'/'+locale:''}/careers/${slug}`,destination:`${['kk','en','zh','uz'].includes(locale)?'/'+locale:''}${target}`,permanent:true})));
 const legacy=['ru','kz','kk','en','zh','uz'].flatMap(locale=>[['aktualnye-vakansii','vacancies'],['stazhirovki-dlya-studentov','internships']].map(([old,slug])=>({source:`/${locale}/karera/${old}`,destination:`${['en','zh','uz'].includes(locale)?'/'+locale:['kz','kk'].includes(locale)?'/kk':''}/careers/${slug}`,permanent:true})));
 return [...aliases,...legacy];
}
