import json,pathlib,re,hashlib,fitz,argparse
from PIL import Image
from catalog_data import write_catalog_data
parser=argparse.ArgumentParser(description='Rebuild reviewed 2024 ALAGEUM catalog data and family crops')
parser.add_argument('--pdf',required=True,type=pathlib.Path,help='Authorized original PDF path')
parser.add_argument('--extractions',type=pathlib.Path,help='Reviewed extracted-*.json directory')
args=parser.parse_args()
BASE=pathlib.Path(__file__).resolve().parents[1];SRC=args.extractions or BASE/'docs/catalog-import';PDF=args.pdf;OUT=BASE/'frontend/lib/catalog';DOC=BASE/'docs/catalog-import';DOC.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(PDF.read_bytes()).hexdigest()=='5cc9f57bf3ed16be6f168c0fff25f02a444675146919bfd277b7e722e640cefc','Unexpected source PDF; re-review before import'
files=['extracted-06-29.json','extracted-30-53.json','extracted-54-74.json','extracted-75-104.json']
allf={}; coverage=[];issues=[]
for filename in files:
 data=json.loads((SRC/filename).read_text());(DOC/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 for f in data['families']:
  if f['id'] in allf:
   old=allf[f['id']]
   for key in ['pages','specifications','models','notes']: old[key]=old.get(key,[])+f.get(key,[])
   if not old.get('image'):old['image']=f.get('image')
  else:allf[f['id']]=f
 coverage+=data['coverage'];issues+=data['issues']
# Keep stable URLs for existing reference families/models already held in browser selections.
id_alias={'cat-kso-366':'kso-366','cat-kso-292':'kso-292','cat-kso-2-10':'kso-2-10'}
for k,f in allf.items():
 if f.get('designation')=='КСО-366': id_alias[k]='kso-366'
 if f.get('designation')=='КСО-292': id_alias[k]='kso-292'
 if f.get('designation')=='КСО-2-10': id_alias[k]='kso-2-10'
ref='https://drive.google.com/file/d/1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr/view'
records=[];families=[];models=[]
doc=fitz.open(PDF);imgout=BASE/'frontend/public/catalog-products';imgout.mkdir(parents=True,exist_ok=True)
def ss(x,pg):
 return [dict(label=str(s['label']),value=str(s['value']) if s.get('value') is not None else '—',unit=s.get('unit') or '',page=s.get('page',pg)) for s in x]
def canonical(x):return re.sub(r'\s+',' ',str(x)).strip()
def power(ss):
 for s in ss:
  if s['unit']=='кВА' and 'мощност' in s['label'].lower() and not any(w in s['label'].lower() for w in ['потребля','потреблен','потреблён']):
   v=str(s['value']).replace(',','.').replace(' ','')
   if re.fullmatch(r'\d+(\.\d+)?',v):return float(v) if '.' in v else int(v)
 return None
def voltage(v):
 if v is None:return None,''
 v=str(v).strip()
 m=re.search(r'\s*(кВ|В|kV|V)\s*$',v)
 if m and not re.search(r'кВ|(?<![А-Яа-яA-Za-z])[ВV](?![А-Яа-яA-Za-z])',v[:m.start()]):return v[:m.start()].strip(),m[1]
 if re.search(r'кВ|(?<![А-Яа-яA-Za-z])[ВV](?![А-Яа-яA-Za-z])',v):return v,''
 return v,'кВ'
for f in allf.values():
 if f['category']=='other' or f['id'] in ['cat-ukzv','cat-ukzn']:f['category']='protection'
 fid=id_alias.get(f['id'],f['id']);f['pages']=sorted(set(f['pages'])); v,vu=voltage(f.get('voltage'));sp=ss(f.get('specifications',[]),f['pages'][0]); notes=[n.replace(' и перечислены в issues','') for n in f.get('notes',[]) if 'требуется объединение' not in n]
 for issue in issues:
  if issue.get('family')==f['id'] and issue.get('issue') not in notes:notes.append(issue['issue'])
 image=None
 if f.get('image'):
  box=f['image']['box'];pix=doc[f['image']['page']-1].get_pixmap(clip=fitz.Rect(*box),dpi=180)
  im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
  if fid=='cat-ktpp-2ktpp-250-6300':im=im.rotate(-90,expand=True)
  im.thumbnail((1100,1000));im.save(imgout/(fid+'.webp'),quality=90,method=4);image='/catalog-products/'+fid+'.webp'
 item=dict(id=fid,sku=f['designation'],name=f['name'],category=f['category'],subtype=f.get('subtype') or ('Шкафы и низковольтное оборудование' if f['category']=='cabinets' else 'Распределительные устройства' if f['category']=='switchgear' else 'Комплектные подстанции'),power=power(sp),voltage=v,voltageUnit=vu,cooling=None,installation=f.get('installation'),source='official',sourceKind='supplied-pdf',sourceUrl=ref,sourceTitle='Шкафные конструкции · 02.09.2024',sourceCheckedAt='2026-09-30',sourcePages=f['pages'],series=f['designation'],manufacturer=None,manufacturers=[],image=image,imageCaption='Иллюстрация серии из каталога · не фото конкретного исполнения',imageSourcePage=f.get('image',{}).get('page') if f.get('image') else None,documentCount=1,recordType='catalog-family',recordKind='family',isOrderableSku=False,description=f['description'],technicalSpecs=sp,notes=notes,variantIds=[],configurations=[])
 families.append(item);records.append(item)
 for i,m in enumerate(f.get('models',[])):
  mid=fid+f'-v{i+1:03}';d=canonical(m['designation'])
  if m.get('kind')!='model':
   item['configurations'].append({**m,'specifications':ss(m.get('specifications',[]),m.get('page',f['pages'][0]))});continue
  if d=='ПКТП-400':mid='pktp-400'
  if d=='ПКТП-1000':mid='pktp-1000'
  ms=ss(m.get('specifications',[]),m.get('page',f['pages'][0]))
  # A row retains its exact printed label; a descriptive prefix is presentation, never a manufactured SKU.
  name=d if re.search(r'[А-Яа-яA-Za-z]{2,}[-\s]?\d|^(УК|КТП|ПКТП|ШНН|МТП)',d) and not re.fullmatch(r'[\d, .–—-]+\s*(кВА|кВт|А|мм)',d) else f['designation']+' · '+d
  vs=[s for s in ms if 'напряж' in s['label'].lower() and s['unit'] in ['В','кВ']]
  mv,mvu=item['voltage'],item['voltageUnit']
  if vs:
   if len(vs)==1:mv,mvu=vs[0]['value'],vs[0]['unit']
   elif len(vs)==2 and len(set(s['unit'] for s in vs))==1:mv,mvu=' → '.join(s['value'] for s in vs),vs[0]['unit']
   else:mv,mvu='; '.join(s['label']+': '+s['value']+' '+s['unit'] for s in vs),''
  merged={s['label']+'|'+s['unit']:s for s in sp}
  for s in ms:merged[s['label']+'|'+s['unit']]=s
  mi={**item,'id':mid,'sku':d,'name':name,'recordType':'catalog-listed-variant','recordKind':'variant','familyId':fid,'familyName':f['designation'],'voltage':mv,'voltageUnit':mvu,'power':power(ms) if power(ms) is not None else item['power'],'sourcePages':sorted(set([m.get('page',f['pages'][0])]+f['pages'])),'technicalSpecs':list(merged.values()),'variantSpecs':ms,'notes':notes+(m.get('notes') or []),'variantIds':[],'description':f['description']+' Каталожное обозначение (включая печатные шаблоны): '+d+'. Полная комплектация и код заказа уточняются.'}
  item['variantIds'].append(mid);models.append(mi);records.append(mi)
# Complete all 104 source pages, including unmarketed front matter and documentary appendices.
front=[(1,'cover','Обложка «Шкафные конструкции»'),(2,'blank','Пустая страница'),(3,'overview','Обзор направлений производства, без моделей'),(4,'contents','Содержание'),(5,'contents','Содержание')]
coverage=[dict(page=p,type=t,families=[],notes=[n]) for p,t,n in front]+coverage
for c in coverage:c['families']=[id_alias.get(x,x) for x in c.get('families',[])]
coverage.sort(key=lambda x:x['page'])
assert [x['page'] for x in coverage]==list(range(1,105)),[x['page'] for x in coverage]
assert len({x['id'] for x in records})==len(records),'Duplicate ids'
metadata=dict(title='Шкафные конструкции',edition='02.09.2024',sourceUrl=ref,sourceFileId='1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr',sourceBytes=(PDF).stat().st_size,sourceSha256=hashlib.sha256((PDF).read_bytes()).hexdigest(),pageCount=104,familyCount=len(families),listedModelCount=len(models),configurationCount=sum(len(f['configurations']) for f in families),listedVariantCount=len(models)+sum(len(f['configurations']) for f in families),recordCount=len(records),verifiedOrderableSkuCount=0,contentsHeadingCount=62,allPagesReviewed=True,allContentsHeadingsMapped=True,unresolvedLabels=[dict(page=30,family='cat-rmu-ae',count=2,reason='Две подписи над габаритными чертежами повреждены в исходном PDF и не расшифрованы. Серия RMU AE, её параметры, схемы и полная страница сохранены; отдельные коды по нечитаемым подписям не выдуманы.')],imagesCount=sum(bool(f['image']) for f in families),coverage=coverage,issues=issues)
write_catalog_data(records,metadata,BASE)
print(json.dumps({k:v for k,v in metadata.items() if k not in ['coverage','issues']},ensure_ascii=False,indent=2));print('ID replacements:',id_alias)
