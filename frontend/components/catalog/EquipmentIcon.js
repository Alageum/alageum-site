import { protectionExampleIconDefinitions } from '@/lib/catalog/models/protectionExampleIcons';
import { measurementColumn2026IconDefinitions } from '@/lib/catalog/models/measurementColumn2026Icons';
import { accessory2026IconDefinitions } from '@/lib/catalog/models/accessory2026Icons';
import { transformer2026IconDefinitions } from '@/lib/catalog/models/transformer2026Icons';
import { sourceIconShapes, resolveIconType, equipmentIconName } from '@/lib/catalog/models/iconTypes';

// Small shared icon library, reused by construction rather than duplicated per SKU.
// Source-only 2D silhouettes deliberately do not create or claim matching 3D geometry.
const Bolt = ({ x = 32, y = 35 }) => <path d={`M${x + 2} ${y - 6}l-6 7h5l-2 6 7-9h-5z`} fill="currentColor" stroke="none"/>;
const Vents = ({ x = 20, y = 42, width = 23 }) => <path d={`M${x} ${y}h${width}m-${width} 4h${width}m-${width} 4h${width}`} opacity=".5"/>;
const Cabinet = ({ kind }) => <>
  <path d="M18 9h30v47H18z" fill="currentColor" fillOpacity=".045"/><path d="M18 9l6-4h30v47l-6 4m0-47 6-4M48 9v47M18 14h30M16 58h35"/>
  {kind === 'switchgear' ? <><path d="M21 27h24M21 43h24M24 18h5v5h-5zM35 18h5v5h-5zM25 31h15v8H25z"/><Bolt x={32} y={49}/></> :
    kind === 'control-cabinet' ? <><path d="M24 19h11v8H24z"/><circle cx="40" cy="21" r="1.4"/><circle cx="40" cy="27" r="1.4"/><path d="M22 35v7"/><Vents x={24} width={17}/></> :
    kind === 'compensation-cabinet' ? <><path d="M24 19h18v7H24zM23 33v8m5-8v8m8-8v8m5-8v8M21 37h2m5 0h8m5 0h3"/><Vents x={24} y={47} width={18}/></> :
    <><path d="M23 20h19v7H23zM22 34v7"/><Bolt/><Vents x={25} y={46} width={17}/></>}
</>;
const Insulator = ({ x, y }) => <><path d={`M${x} ${y}v-10m-3 4h6m-7 3h8m-7 3h6`}/></>;
const Transformer = ({ instrument = false }) => <>
  <path d={instrument ? 'M15 30h34v22H15zM12 27h40v4H12zM19 52v5m27-5v5' : 'M13 28h38v23H13zM10 25h44v4H10zM18 51v5m28-5v5M15 56h7m20 0h7'} fill="currentColor" fillOpacity=".04"/>
  {[21, 32, 43].map(x => <Insulator key={x} x={x} y={26}/>)}
  {instrument ? <path d="M25 36h14v8H25z"/> : <><Vents x={17} y={33} width={30}/><path d="M17 31v17m6-17v17m6-17v17m6-17v17m6-17v17m6-17v17"/></>}
</>;

export default function EquipmentIcon({ type, size = 48, title, className = '', ...props }) {
  const resolved = resolveIconType(type);
  const columnIcon = Object.hasOwn(measurementColumn2026IconDefinitions, resolved) ? measurementColumn2026IconDefinitions[resolved] : null;
  const protectionIcon = Object.hasOwn(protectionExampleIconDefinitions, resolved) ? protectionExampleIconDefinitions[resolved] : null;
  let drawing;
  if (protectionIcon) drawing = <>{protectionIcon.layers.map(item => <path key={item.feature} data-feature={item.feature} d={item.d} transform={item.transform}/>)}</>;
  else if (columnIcon) drawing = <g transform="translate(2 1) scale(.94)">{columnIcon.layers.map(item => <path key={item.feature} data-feature={item.feature} d={item.d} fill={item.solid ? 'var(--equipment-icon-surface, #fff)' : undefined}/>)}</g>;
  else if (Object.hasOwn(accessory2026IconDefinitions, resolved)) drawing = <>{accessory2026IconDefinitions[resolved].paths.map((d, index) => <path key={index} d={d}/>)}</>;
  else if (Object.hasOwn(transformer2026IconDefinitions, resolved)) drawing = <>{transformer2026IconDefinitions[resolved].paths.map((d, index) => <path key={index} d={d}/>)}</>;
  else if (Object.hasOwn(sourceIconShapes, resolved)) drawing = <>{sourceIconShapes[resolved].paths.map((d, index) => <path key={index} d={d}/>)}</>;
  else if (resolved === 'oil-transformer' || resolved === 'instrument-transformer') drawing = <Transformer instrument={resolved === 'instrument-transformer'}/>;
  else if (resolved === 'dry-transformer') drawing = <><path d="M12 13h40v6H12zM12 47h40v6H12zM19 11v44m26-44v44"/>{[20,32,44].map(x => <g key={x}><rect x={x-5} y="21" width="10" height="23" rx="4" fill="currentColor" fillOpacity=".12"/><path d={`M${x-4} 27h8m-8 5h8m-8 5h8`}/></g>)}<path d="M16 54v4m32-4v4"/></>;
  else if (resolved === 'substation') drawing = <><path d="M9 32h22v23H9zM30 19h23v36H30zM28 18l13-6 14 6M7 56h49M33 35h17M35 39v7"/><Insulator x={36} y={15}/><Insulator x={46} y={15}/><Vents x={12} y={39} width={14}/><Bolt x={43} y={44}/></>;
  else if (resolved === 'modular-substation') drawing = <><path d="M5 22 32 12l27 10v5H5zM8 27h48v29H8zM26 27v29m17-29v29M29 33h11v23M31 42v5M5 57h54" fill="currentColor" fillOpacity=".035"/><Vents x={12} y={35} width={10}/><Vents x={46} y={35} width={6}/></>;
  else if (resolved === 'pole-substation') drawing = <><path d="M31 8h4v52h-4zM14 15h39M19 30h30v17H19zM16 48h36M36 53h12v9H36"/>{[20,32,44].map(x => <Insulator key={x} x={x} y={13}/>)}<Vents x={23} y={34} width={22}/><path d="M20 18v8m24-8v8M24 48l7 5"/></>;
  else if (resolved === 'disconnector') drawing = <><path d="M9 49h46M15 49v7m34-7v7"/>{[17,32,47].map(x=><g key={x}><Insulator x={x} y={44}/><path d={`M${x} 32l7-17m-9 0h8`}/></g>)}</>;
  else if (resolved === 'protection-cabinet') drawing = <><path d="M12 19h40v34H12zM10 15h44v4H10zM17 24h30v24H17zM16 54v5m32-5v5" fill="currentColor" fillOpacity=".05"/><circle cx="21" cy="29" r="1.4"/><circle cx="21" cy="43" r="1.4"/><Bolt x={34} y={35}/></>;
  else if (resolved === 'metering-box') drawing = <><path d="M28 15h8v44h-8zM21 15 32 5l11 10M23 24h18v21H23zM26 27h12v15H26zM23 59h18"/><circle cx="35" cy="34" r="1.4"/></>;
  else if (resolved === 'wall-box' || resolved === 'wall-control-box') drawing = <><path d="M14 15h34v38H14zM14 15l6-4h34v38l-6 4m0-38 6-4M48 15v38M12 20H8v8h4m0 14H8v8h4M52 18h5v8m-5 14h5v8" fill="currentColor" fillOpacity=".045"/><path d="M18 19h26v30H18zM21 32v7"/>{resolved === 'wall-control-box' && <><path d="M25 23h13v7H25z"/><circle cx="28" cy="36" r="2"/><circle cx="36" cy="36" r="2"/><circle cx="28" cy="43" r="2"/><circle cx="36" cy="43" r="2"/></>}</>;
  else if (resolved === 'plain-floor-cabinet' || resolved === 'single-door-switchgear') drawing = <><path d="M19 11h28v44H19zM19 11l6-5h28v43l-6 6m0-44 6-5M47 11v44M18 58h31M23 31v8" fill="currentColor" fillOpacity=".04"/>{resolved === 'single-door-switchgear' ? <><path d="M19 21h28M27 16h11M32 24v4"/><Bolt x={33} y={39}/></> : <Bolt x={33} y={35}/>}</>;
  else if (resolved === 'compact-substation' || resolved === 'double-compact-substation') drawing = <>{(resolved === 'double-compact-substation' ? [0, 28] : [14]).map((x, i) => <g key={i} transform={`translate(${x} 0)`}><path d="M4 28h23v26H4zM2 25h27v3H2zM3 56h25M15 29v24M10 33v4m10-4v4" fill="currentColor" fillOpacity=".04"/><Insulator x={8} y={25}/><Insulator x={23} y={25}/><Vents x={7} y={41} width={5}/><Vents x={18} y={41} width={5}/></g>)}</>;
  else if (resolved === 'kiosk-substation' || resolved === 'outdoor-switchgear-shelter') drawing = <><path d="M5 23 32 16l27 7M7 25h50v29H7zM5 57h54M16 27v25m17-25v25M42 27v25" fill="currentColor" fillOpacity=".04"/>{resolved === 'kiosk-substation' ? <><path d="M35 29h19v25M44 30v23M40 38v5m8-5v5"/><Bolt x={49} y={34}/></> : <><path d="M7 54v5m50-5v5M25 25v29M9 27h14v10H9zM28 40h12v12H28z"/></>}</>;
  else if (resolved === 'wall-canopy-box') drawing = <><path d="M16 18h32v33H16zM13 13h38v5H13zM16 22h-6v5h6m0 14h-6v5h6M48 19l7-4v32l-7 4M51 13l4 2M25 24h14v5H25zM21 34v7" fill="currentColor" fillOpacity=".04"/><Bolt x={33} y={39}/></>;
  else if (resolved === 'mining-skid-substation') drawing = <><path d="M5 54h53l-3 5H8zM8 29h47v25H8zM6 26h51v4H6zM30 26V9h23v17M33 12l16 12m0-12L33 24M11 34h18v17H11zM38 34h13v17H38z" fill="currentColor" fillOpacity=".04"/><Vents x={15} y={38} width={10}/><Bolt x={45} y={42}/><Insulator x={41} y={24}/></>;
  else if (resolved === 'railway-frame-substation') drawing = <><path d="M5 55h55v5H5zM10 55V13h5v42M10 14h23M27 14v41M17 35h25v19H17zM42 29h8v26h-8M50 43h8v12h-8" fill="currentColor" fillOpacity=".04"/><Insulator x={13} y={14}/><Insulator x={27} y={14}/><Vents x={21} y={38} width={17}/><path d="M15 24l10 30"/></>;
  else if (resolved === 'upper-input-protection') drawing = <><path d="M20 34h25v23H20zM18 32h29v3H18zM23 11h19v21H23zM23 12h19M23 22h19M21 59h23M24 38v12M42 24l7 8" fill="currentColor" fillOpacity=".04"/><Insulator x={26} y={12}/><Insulator x={39} y={12}/><Bolt x={34} y={46}/></>;
  else if (resolved === 'outdoor-floor-cabinet') drawing = <><path d="M17 14h30v40H17zM15 9h34v5H15zM17 54v5h30v-5M47 14l7-5v40l-7 5M49 9h5M21 20h22v30H21zM25 32v8" fill="currentColor" fillOpacity=".04"/><Bolt x={34} y={30}/></>;
  else if (resolved === 'equipment') drawing = <><path d="M13 20 32 10l20 10v29L32 59 13 49zM13 20l19 11 20-11M32 31v28"/><Bolt x={24} y={37}/></>;
  else drawing = <Cabinet kind={resolved}/>;
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={protectionIcon ? "1.4" : columnIcon ? "1.1" : "1.7"} strokeLinecap="round" strokeLinejoin="round" className={`equipment-icon ${className}`} role={title ? 'img' : undefined} aria-label={title ? (typeof title === 'string' ? title : equipmentIconName(resolved)) : undefined} aria-hidden={title ? undefined : true} focusable="false" data-equipment-type={resolved} {...props}>{title && <title>{typeof title === 'string' ? title : equipmentIconName(resolved)}</title>}{drawing}</svg>;
}
