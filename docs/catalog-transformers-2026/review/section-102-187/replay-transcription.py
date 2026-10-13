import json,re,hashlib,os
from pathlib import Path
BASE=Path(__file__).parent
families=[];models=[];configurations=[];assets=[];ledger=[];notes=[]
trans=str.maketrans(dict(zip('абвгдеёзийклмнопрстуфхцчшщыэюяьъ','abvgdeezijklmnoprstufhccssyeua--')))
def slug(s):return re.sub('[^a-z0-9]+','-',s.lower().translate(trans)).strip('-')
def family(id,title,pages,manufacturer=None,execution='',series=None):
 f={'id':id,'designation':title,'title':title,'sourcePages':pages,'manufacturer':manufacturer,'execution':execution,'series':series or []};families.append(f);return id
def spec(label,value,unit,page):return {'label':label,'value':str(value),'unit':unit,'page':page}
def add(fid,name,page,vals,execution='',draw=None,variant='',kind='model',unc=None):
 identity=fid+'|'+name+'|'+variant
 mid='alageum-'+slug(name)[:90]+('-'+slug(variant) if variant else '')+'-'+hashlib.sha1(identity.encode()).hexdigest()[:8]
 f=next(f for f in families if f['id']==fid)
 r={'id':mid,'proposedStableId':mid,'familyId':fid,'designation':name,'name':name,'sku':name if kind=='model' else None,'execution':execution or f['execution'],'sourcePages':sorted(set([page]+(draw or []))),'sourceRow':{'pdfPage':page,'printedPage':page,'designation':name,'variant':variant or None},'technicalSpecs':[spec(k,v,u,page) for k,v,u in vals], 'manufacturer':f['manufacturer'],'manufacturerEvidencePages':[166] if f['manufacturer'] else [],'candidateOldIds':[],'recordType':kind,'uncertainties':unc or [],'drawingPages':draw or [],'assetFamilyId':None,'configurationLabel':variant or None}
 (models if kind=='model' else configurations).append(r);return r

def electrical(p,hv,lv,group,p0=None,pk=None,uk=None,io=None,mv=None,powerunit='кВА'):
 out=[('Номинальная мощность',p,powerunit),('Номинальное напряжение ВН',hv,'кВ'),('Номинальное напряжение НН',lv,'кВ'),('Схема и группа соединения обмоток',group,None)]
 if mv is not None:out.append(('Номинальное напряжение СН',mv,'кВ'))
 for k,v,u in [('Потери Х.Х.',p0,'кВт'),('Потери К.З.',pk,'кВт'),('Напряжение короткого замыкания',uk,'%'),('Ток холостого хода',io,'%')]:
  if v is not None:out.append((k,v,u))
 return out

def dims(r,page,L=None,B=None,H=None,total=None,oil=None,transport=None,other=None):
 for k,v,u in [('L',L,'мм'),('B',B,'мм'),('H',H,'мм'),('Полная масса',total,'кг'),('Масса масла',oil,'кг'),('Транспортная масса',transport,'кг')]:
  if v is not None:r['technicalSpecs'].append(spec(k,v,u,page))
 if other:
  for k,v in other.items():r['technicalSpecs'].append(spec(k,v,'мм',page))
 r['sourcePages']=sorted(set(r['sourcePages']+[page]))

def asset(aid,title,pages,records,justification,reusable='same-construction-family illustration',dimensions=False):
 ids=[r['id'] for r in records]; assets.append({'id':aid,'title':title,'evidencePages':pages,'type':'technical-line-drawing' if pages else 'not-illustrated','reusableType':reusable,'modelIds':ids,'justification':justification,'geometryStatus':'No fabricated geometry; exact dimensions must be read from linked source table/drawing','dimensionIdentityConfirmed':dimensions})
 for r in records:r['assetFamilyId']=aid

# PDF 102: explicit single-phase railway rows.
fid=family('omzh-27-5','Трансформаторы ОМЖ-2,5–10 кВА напряжением 27,5 кВ',[102],execution='однофазный масляный; естественное охлаждение',series=['ОМЖ'])
rs=[]
for name,p,p0,pk,uk,io,L,B,H,mass,oil in [('ОМЖ-2,5/27,5','2,5','24','136','5,5','5,4',730,560,1045,150,'53,8'),('ОМЖ-4/27,5',4,40,141,'5,0','4,0',860,560,1050,195,'68,6'),('ОМЖ-10/27,5',10,50,330,'5,5','3,5',850,560,1100,210,110)]:
 r=add(fid,name,102,[('Номинальная мощность',p,'кВА'),('Номинальное напряжение','27,5/0,23','кВ'),('Группа соединения обмоток','1/1-0',None),('P0',p0,'Вт'),('Pk',pk,'Вт'),('Uk',uk,'%'),('I0',io,'%')],draw=[102]);dims(r,102,L,B,H,mass,oil);rs.append(r)
asset('drawing-omzh-102','ОМЖ-2,5–10',[102],rs,'Page 102 labels one shared drawing for the three explicit rows; table dimensions differ.')

fid=family('tm-zh-35-27-5','Трансформаторы ТМ(Ж)-25–630 кВА напряжением 35(27,5) кВ',[103,104],series=['ТМ(Ж)'])
rs=[]
data=[(25,'Cu-Cu',180,650,'6,5','5,5',1100,1050,1655,530,195),(40,'Cu-Cu',280,1000,'6,5','4,0',1150,1040,1415,710,270),(63,'Cu-Cu',370,1400,'6,5','3,8',1175,850,1335,870,250),(100,'гофро',410,1970,'6,5','2,1',1185,780,1720,915,280),(160,'гофро',560,2650,'6,0','2,0',1285,1015,1715,1020,310),(250,'гофро',800,3700,'6,0','2,0',1630,930,1865,1540,520),(400,'гофро',1090,5900,'6,5','1,8',1585,950,1930,1994,675),(630,'гофро',1700,8500,'6,5','1,5',2025,1204,2205,3100,1025)]
for p,ex,p0,pk,uk,io,L,B,H,ma,oi in data:
 r=add(fid,f'ТМ(Ж)-{p}',103,[('Номинальная мощность',p,'кВА'),('Номинальное напряжение','35(27,5)/0,4','кВ'),('Группа соединения обмоток','У/Ун-0',None),('P0',p0,'Вт'),('Pk',pk,'Вт'),('Uk',uk,'%'),('I0',io,'%')],execution=ex,draw=[104],variant=ex);dims(r,103,L,B,H,ma,oi);rs.append(r)
asset('drawing-tmzh-104','ТМ(Ж)-25–630',[104],rs,'The source explicitly assigns a shared drawing to the family range; Cu-Cu and corrugated execution labels remain separate.')

fid=family('tmg-35','Трансформаторы ТМГ-25–2500 кВА напряжением 35 кВ',[105,106,107,108],series=['ТМГ'])
rs=[]
for p,p0,pk,uk,io,L,B,H,ma,oi in [(25,175,'0,61','6,0','5,5',1040,805,1415,640,170),(40,280,1000,'6,5','4,0',1150,805,1370,680,186),(63,370,1400,'6,5','3,8',1160,820,1420,720,220),(100,410,2270,'6,0','2,1',1185,780,1635,870,256),(160,560,3100,'6,0','2,0',1280,1015,1635,980,290),(250,800,4200,'6,5','2,0',1626,930,1645,1467,467),(400,1090,5900,'6,5','1,8',1585,950,1775,1944,650),(630,1700,8500,'6,5','1,5',1770,1050,2000,3028,985),(1000,2000,12200,'6,5','0,5',2182,1270,2010,3665,975),(1600,2050,18000,'8,0','0,5',2130,1330,2395,4565,1200),(2500,3500,28000,'7,5','1,0',2434,1498,2385,7000,1780)]:
 r=add(fid,f'ТМГ-{p}',105,[('Номинальная мощность',p,'кВА'),('Номинальное напряжение ВН/НН','35/0,4','кВ'),('Группа соединения обмоток','У/Ун-0',None),('P0',p0,'Вт'),('Pk',pk,'Вт'),('Uk',uk,'%'),('I0',io,'%')],draw=[107 if p<=400 else 108],variant='35 kV');dims(r,105,L,B);dims(r,106,H=H,total=ma,oil=oi);rs.append(r)
 if p==25:r['uncertainties'].append('Source Pk cell reads 0,61 under Вт header; preserved without correcting likely unit/value error.')
asset('drawing-tmg-35-small-107','ТМГ-25–400',[107],[r for r in rs if 107 in r['drawingPages']],'Explicit range heading on drawing; corrugated tank with tilted HV bushings.')
asset('drawing-tmg-35-large-108','ТМГ-630–2500',[108],[r for r in rs if 108 in r['drawingPages']],'Explicit range heading on drawing; upright bushings and larger tank layout.')

fid=family('aomzh-27-5x2','Автотрансформатор силовой однофазный двухобмоточный для железных дорог типа АОМЖ-10000÷16000/27,5х2-У1(УХЛ1)',[109,110],series=['АОМЖ'],execution='У1(УХЛ1); однофазный; естественное масляное охлаждение; без регулирования напряжения')
rs=[]
for p,p0,pk,L,B,H,ma,tr,oi in [(10000,'6,5',26,2770,2890,3970,12500,9300,2350),(16000,'9,0','33,5',2920,2980,4200,16500,13200,3700)]:
 r=add(fid,f'АОМЖ-{p}/2Х27,5',109,electrical(p,'27,5Х2','27,5','1 авто',p0,pk,'2,0','0,35'),draw=[110]);dims(r,109,L,B,H,ma,oi,tr);rs.append(r)
 r['uncertainties'].append('Heading uses 27,5х2; table and drawing use 2Х27,5. Both retained in family/title and designation.')
asset('drawing-aomzh-110','АОМЖ-10000÷16000/2х27,5',[110],rs,'Explicit source range-labelled railway autotransformer drawing.')

fid=family('tdtnsh-35','Трансформаторы силовые трехобмоточные с РПН типа ТДТНШ-16000/35-У1 (УХЛ1)',[111,112],series=['ТДТНШ'],execution='трехобмоточный; РПН; У1 (УХЛ1)')
r=add(fid,'ТДТНШ-16000/35',112,electrical(16000,'36,75','6,6','Ун/Д-Д-11-11',15,115,None,'0,3',mv='6,3')+[('Uk ВН-СН','8,0','%'),('Uk ВН-НН','16,5','%'),('Uk СН-НН','7,0','%')],draw=[112],unc=['Page 111 designation explanation/body repeatedly says ТДТНШ-16000/110 У1 despite /35 heading and table. No separate model inferred from contradictory prose.']);dims(r,112,total=30000,oil=8000,transport=25000);asset('drawing-tdtnsh-112','ТДТНШ-16000/35',[112],[r],'Single explicit model drawing on specification page.')

fid=family('trdns-35','Трансформатор силовой двухобмоточный с расщепленными обмотками НН с РПН типа ТРДНС-25000/35-У1(УХЛ1)',[113,114,115,116],series=['ТРДНС'],execution='РПН; расщепленные НН; У1(УХЛ1)')
for p,p0,pk,io,ma,tr,oi,pg,grp in [(16000,14,90,'0,3',36000,31000,10500,114,'Ун/Д-Д-11-11'),(25000,17,115,'0,2',37000,34000,7700,115,'Ун/Д-Д-11-11'),(40000,21,170,'0,3',58100,48900,13600,116,'Д/Д-Д-0-0')]:
 r=add(fid,f'ТРДНС-{p}/35 Cu/Cu',113,electrical(p,'36,75','10,5-10,5; 6,3-10,5; 6,3-6,3',grp,p0,pk,None,io)+[('Uk ВН-НН1+НН2','12,7','%'),('Uk ВН-НН1 / ВН-НН2','23','%'),('Uk НН1-НН2','не менее 40','%')],draw=[pg]);dims(r,113,total=ma,oil=oi,transport=tr);asset(f'drawing-trdns-{p}-{pg}',f'ТРДНС-{p}/35',[pg],[r],'Different per-rating dimensional drawing; do not reuse exact geometry across ratings.')

fid=family('td-35','Трансформаторы силовые двухобмоточные с ПБВ типа ТД-10000÷16000/35-У1(УХЛ1)',[117,118],series=['ТД'],execution='ПБВ ±2х2,5%; У1(УХЛ1)')
rs=[]
for p,mat,p0,pk,uk,L,B,H,ma,tr,oi in [(10000,'Ал','8,5',65,'7,5',3990,2900,4420,18000,14000,7000),(16000,'Cu',13,90,'8,0',4310,2900,4725,28000,22000,7500)]:
 r=add(fid,f'ТД-{p}/35({mat})',117,electrical(p,'38,5','10,5; 6,3','У/Д-11',p0,pk,uk,'0,3'),draw=[118]);dims(r,117,L,B,H,ma,oi,tr);rs.append(r)
asset('drawing-td-35-118','ТД-10000÷16000/35',[118],rs,'Source explicitly groups the two material/rating rows beneath a shared range drawing.')

fid=family('tdns-35','Трансформаторы силовые двухобмоточные с РПН типа ТДНС-10000÷40000/35-У1(УХЛ1)',list(range(119,124)),series=['ТДНС'],execution='РПН ±8х1,5%; У1(УХЛ1)')
for p,mat,pg,p0,pk,uk,draw,L,B,H,ma,tr,oi in [(10000,'Ал-Ал',119,'8,5',60,'8,0',120,4540,2900,4420,18700,16000,6000),(10000,'Cu-Cu',119,'8,5',60,'8,0',120,4420,3130,4160,22600,18400,6500),(16000,'Ал-Ал',120,15,85,10,121,5010,3465,5100,30000,27500,8000),(16000,'Cu-Cu',120,15,85,10,121,4480,3430,4700,27500,22500,7500),(25000,'',120,17,115,'10,5',122,5360,3600,4650,36300,30800,8500),(40000,'Cu-Cu',120,23,170,'12,7',123,6100,4300,5200,59000,50500,15000)]:
 r=add(fid,f'ТДНС-{p}/35'+(' '+mat if mat else ''),pg,electrical(p,'36,75','10,5; 6,3','Ун/Д-11',p0,pk,uk,'0,3'),draw=[draw]);dims(r,119 if p==10000 else 121,L,B,H,ma,oi,tr)
 asset(f'drawing-tdns-{p}-{slug(mat) or "unspecified"}',f'ТДНС-{p}/35 {mat}',[draw],[r],'Source drawing labels rating only; material-specific dimensions differ in table. Illustration may represent rating; exact material geometry not proven.')

fid=family('tm-35-20-lv04','Трансформаторы силовые двухобмоточные ПБВ типа ТМ-1000÷4000/35(20)/0,4-У1(УХЛ1)',[124,125,126,127],series=['ТМ'],execution='ПБВ ±2х2,5%; НН 0,4 кВ; У1(УХЛ1)')
rs=[]
for p,mat,pg,p0,pk,uk,io,L,B,H,ma,tr,oi,dp in [(1000,'',124,2,'12,2','6,5','0,5',2280,2250,2500,3960,3960,1000,125),(1600,'',124,'2,05',18,'8,0','0,5',2530,2510,2780,5130,5130,1340,125),(2500,'(Ал)',125,'3,5',28,'7,5','0,5',2700,2340,2780,7200,6100,2000,126),(4000,'(Ал)',125,5,45,9,'0,3',2900,3250,3740,10950,7140,2650,127)]:
 r=add(fid,f'ТМ-{p}/35(20)/0,4'+mat,pg,electrical(p,'35(20)','0,4','У/Ун-0' if p<4000 else 'У/Ун-0; Д/Ун-11',p0,pk,uk,io),draw=[dp]);dims(r,pg,L,B,H,ma,oi,tr);rs.append(r)
for dp in [125,126,127]:asset(f'drawing-tm-lv04-{dp}',f'ТМ /35(20)/0,4 drawing {dp}',[dp],[r for r in rs if dp in r['drawingPages']],'Dedicated source voltage/execution heading; different ratings have separate drawings except explicit 1000–1600 range.')

# 35/20-kV and railway 27.5-kV variants: separate families despite similar drawings.
for rail in [False,True]:
 start=134 if rail else 128; s='ТМЖ' if rail else 'ТМ'; hv='27,5' if rail else '35(20)'
 fid=family('tmzh-27-5' if rail else 'tm-35-20',f'Трансформаторы силовые двухобмоточные с ПБВ типа {s}-1000÷6300/{hv}-У1(УХЛ1)',list(range(start,start+6)),series=[s],execution='ПБВ ±2х2,5%; У1(УХЛ1)'+('; для железных дорог' if rail else ''))
 rs=[]
 for p,pg,p0,pk,uk,L,B,H,ma,tr,oi,dp in [(1000,start,'2,1','10,0','6,5',2280,2250,2500,3970,None,1020,start+2),(1600,start,'2,5','16,5','6,5',2530,2260,2780,5040,None,1340,start+2),(2500,start+1,'4,1','23,5','6,5',2490,2350,2700,6800,5940,1900,start+3),(4000,start+1,'5,6','30,0' if rail else '33,5','7,5',2800,3080,3460,10280,6920,2360,start+4),(6300,start+1,'7,0','46,5','7,5',3220,3050,3760,12000,8750,2500,start+5)]:
  r=add(fid,f'{s}-{p}/{hv}',pg,electrical(p,hv,'6,3; 10,5','У/Д-11',p0,pk,uk,'0,3'),draw=[dp]);dims(r,pg,L,B,H,ma,oi,tr);rs.append(r)
 for dp in range(start+2,start+6):asset(f'drawing-{slug(s)}-{dp}',f'{s} drawing {dp}',[dp],[r for r in rs if dp in r['drawingPages']],'Same explicit drawing heading and matching rating group; analogous TM/TMЖ layout is not proof of identical geometry.')

fid=family('tmn-35-20','Трансформаторы силовые двухобмоточные с РПН типа ТМН-1000÷6300/35(20)-У1(УХЛ1)',[140,141,142,143],series=['ТМН'],execution='РПН ±4х2,5%; У1(УХЛ1)')
rs=[]
for p,pg,p0,pk,uk,L,B,H,ma,tr,oi,dp in [(1000,140,'2,1','11,6','6,5',2750,2280,2800,5025,3700,1250,141),(1600,140,'2,5','16,5','6,5',2800,2340,2935,5950,4740,1615,141),(2500,142,'4,1','23,5','6,5',3060,2350,2970,7880,6070,2060,143),(4000,142,'5,6','33,5','7,5',3207,3236,3440,12130,9790,2625,143),(6300,142,'7,0','46,55','7,5',3380,3250,3880,13900,9800,3500,143)]:
 r=add(fid,f'ТМН-{p}/35(20)',pg,electrical(p,'35(20)','11,0; 6,3','У/Д-11',p0,pk,uk,'0,2'),execution='с панельными радиаторами; РПН; У1(УХЛ1)' if p>=2500 else '',draw=[dp]);dims(r,pg,L,B,H,ma,oi,tr);rs.append(r)
asset('drawing-tmn-141','ТМН-1000÷1600/35(20)',[141],[r for r in rs if 141 in r['drawingPages']],'Source range-labelled drawing.')
asset('drawing-tmn-panel-143','ТМН-2500÷6300/35(20) панельный',[143],[r for r in rs if 143 in r['drawingPages']],'Explicit panel-radiator construction heading; not interchangeable with non-panel families.')

fid=family('tmn-110-small','Трансформаторы силовые двухобмоточные с РПН типа ТМН-2500÷6300/110-У1(УХЛ1)',[144,145,146,147,148],series=['ТМН'],execution='РПН; У1(УХЛ1)')
for p,mat,pg,p0,pk,ma,tr,oi,dp in [(2500,'(Ал)',144,'3,5',22,13300,11800,4100,146),(4000,'',145,'5,0',35,18000,14200,7200,147),(6300,'(Ал)',145,'6,5',44,20800,16800,8000,148)]:
 r=add(fid,f'ТМН-{p}/110'+mat,pg,electrical(p,115,'6,6; 11','Ун/Д-11',p0,pk,'10,5','0,2')+[('РПН','±8х2%' if p==2500 else '±9х1,78%',None)],draw=[dp]);dims(r,pg,total=ma,oil=oi,transport=tr);asset(f'drawing-tmn110-{dp}',f'ТМН-{p}/110',[dp],[r],'Per-model dimensional drawing. Numeric drawing callouts are retained as source evidence, not inferred as a generated mesh.')

fid=family('tmtn-110','Трансформатор силовой трехобмоточный с РПН типа ТМТН-6300/110-У1(УХЛ)',[149,150],series=['ТМТН'],execution='трехобмоточный; РПН ±9х1,78%; У1/УХЛ1')
r=add(fid,'ТМТН-6300/110',149,electrical(6300,115,'6,6; 11','Ун/Ун/Д-0-11',10,52,None,'0,5',mv='38,5')+[('Uk ВН-НН',17,'%'),('Uk ВН-СН','10,5','%'),('Uk СН-НН','6,0','%')],draw=[150]);dims(r,149,total=30720,oil=11000,transport=25500);asset('drawing-tmtn150','ТМТН-6300/110',[150],[r],'Single three-winding transformer drawing.')

fid=family('tdn-110-small','Трансформаторы силовые двухобмоточные с РПН типа ТДН-10000÷16000/110-У1(УХЛ1)',[151,152,153],series=['ТДН'],execution='РПН ±9х1,78%; У1(УХЛ1)')
rs=[]
for p,mat,p0,pk,io,L,B,H,ma,tr,oi,dp,dimpg in [(10000,'Ал',10,58,'0,2',5200,3190,5010,28300,24800,9000,152,151),(16000,'Cu-Cu',13,'79,5','0,3',5000,3600,4820,31900,27250,8150,153,152),(16000,'Ал-Ал',13,'79,5','0,3',5315,3780,4700,33850,29100,11500,153,152)]:
 r=add(fid,f'ТДН-{p}/110 '+mat,151,electrical(p,115,'6,6; 11','Ун/Д-11',p0,pk,'10,5',io),draw=[dp]);dims(r,dimpg,L,B,H,ma,oi,tr);rs.append(r)
for dp in [152,153]:asset(f'drawing-tdn-{dp}',f'ТДН drawing {dp}',[dp],[r for r in rs if dp in r['drawingPages']],'Drawing identifies rating; material variants keep their separate tabulated dimensions.')

fid=family('tdtn-110-small','Трансформаторы силовые трехобмоточные с РПН типа ТДТН-10000÷16000/110-У1 (УХЛ1)',[154,155,156],series=['ТДТН'],execution='РПН ±9х1,78%; У1(УХЛ1)')
for p,mat,pg,p0,pk,io,L,B,H,ma,tr,oi,dp in [(10000,'(Ал)',154,'11,5',76,'0,2',5950,5424,5270,34000,29000,13730,155),(16000,'Cu-Cu',155,14,100,'0,3',5750,3820,4700,42500,38000,12000,156)]:
 r=add(fid,f'ТДТН-{p}/110 '+mat,pg,electrical(p,115,'6,6; 11','Ун/Ун/Д-0-11',p0,pk,None,io,mv='38,5')+[('Uk ВН-СН','10,5','%'),('Uk ВН-НН','17,5','%'),('Uk СН-НН','6,5','%')],draw=[dp]);dims(r,pg,L,B,H,ma,oi,tr);asset(f'drawing-tdtn-{dp}',f'ТДТН-{p}/110',[dp],[r],'Per-rating three-winding transformer drawing.')

fid=family('tdn-10-11','Трансформаторы силовые двухобмоточные с РПН типа ТДН-10000/10/11-У1(УХЛ1)',[157,158],series=['ТДН'],execution='РПН ±5х1,5%; У1(УХЛ1)')
r=add(fid,'ТДН-10000/10/11',157,electrical(10000,10,11,'Д/Д-0','8,0',70,8,'0,15'),draw=[158]);dims(r,157,total=20750,oil=7660,transport=17750);asset('drawing-tdn158','ТДН-10000/10/11',[158],[r],'Single model dimensional drawing.')

fid=family('tds-10000','Трансформаторы силовые двухобмоточные типа ТДС-10000/10/11-У1(УХЛ1)',[159,160],series=['ТДС'],execution='ПБВ ±2х2,5%; У1(УХЛ1)')
rs=[]
for hv,lv,grp,p0,pk,uk,L,B,H,ma,tr in [('10,5','3,15','Ун/Д-11','10,5',60,14,4140,3170,4180,20400,17400),('11','6,3','У/Д-11','8,6',72,'8,0',3870,2900,4420,21000,18000),('6,3','6,3','Д/Д-0','9,5',74,'8,0',3870,2900,4420,21500,18500)]:
 r=add(fid,f'ТДС-10000/{hv}/{lv}',159,electrical(10000,hv,lv,grp,p0,pk,uk,'0,15'),draw=[160],unc=['Drawing title on page 160 is ТДС-10000-6,3; broad family geometry only, not exact fit for each voltage arrangement.']);dims(r,159,L,B,H,ma,7200,tr);rs.append(r)
asset('drawing-tds160','ТДС-10000-6,3',[160],rs,'Source places one illustration after the three-voltage table; precise bushing dimensions vary by row. Reuse only as family illustration.')

fid=family('tm-4000-6300-10','Трансформаторы силовые двухобмоточные типа ТМ-4000÷6300/10-У1 (УХЛ1)',[161,162,163,164],series=['ТМ'],execution='ПБВ ±2х2,5%; У1(УХЛ1)')
rs=[]
for p,hv,lv,grp,pk,uk in [(4000,10,'3,15','У/Д-11','34,4','6,6'),(4000,10,'6,3','У/Д-11','33,5','7,5'),(4000,13,10,'Ун/Д-11','33,5','7,5'),(6300,11,'6,3','У/Д-11','46,5','7,5'),(6300,6,'6,3','Д/Д-0','46,5','7,5'),(6300,10,'3,15','У/Д-11','46,5','7,5')]:
 r=add(fid,f'ТМ-{p}-{hv}-{lv}',161,electrical(p,hv,lv,grp,'5,6' if p==4000 else '7,0',pk,uk,'0,15'),draw=[163 if p==4000 else 164]);dims(r,162,2770 if p==4000 else 3180,3080 if p==4000 else 3050,3280 if p==4000 else 3620,10280 if p==4000 else 12000,2360 if p==4000 else 2750,6920 if p==4000 else 8700);rs.append(r)
for dp in [163,164]:asset(f'drawing-tm-{dp}',f'ТМ {dp}',[dp],[r for r in rs if dp in r['drawingPages']],'Rating-level drawing; voltage-specific bushing callouts are retained in table and not merged.')
# Asia Trafo section. Each listed designation is explicit; list-valued voltage choices are retained, never expanded into invented SKUs.
MAN='ТОО «Asia Trafo»'
def hvfamily(id,title,pages,series,execution):return family(id,title,[166]+pages,MAN,execution,series)
def hvadd(fid,name,page,p,hv,lv,group,uk,io,mv='—',variant='',extras=None,kind='model'):
 r=add(fid,name,page,electrical(p,hv,lv,group,uk=uk,io=io,mv=mv)+(extras or []),variant=variant,kind=kind)
 r['assetStatus']='No model-linked photograph or dimensional drawing in this section; source explicitly offers dimensions and drawings on request (page 166).'
 if str(io)=='*' or str(uk).find('*')>=0:r['uncertainties'].append('Source uses an asterisk for unspecified characteristic; no numeric value inferred.')
 return r

fid=hvfamily('asia-two-winding-110-pbv','Двухобмоточные трансформаторы класса напряжения 110 кВ с ПБВ и без ПБВ, без регулирования напряжения',[167],['ТД','ТМ','ТДЦ'],'У1, УХЛ1; ПБВ и без ПБВ / без регулирования')
for p,prefixes,io in [(25000,['ТД','ТМ'],'0,4'),(32000,['ТД','ТМ'],'0,35'),(40000,['ТД','ТМ'],'0,3'),(63000,['ТД','ТМ'],'0,25'),(80000,['ТДЦ','ТД','ТМ'],'0,25'),(125000,['ТДЦ','ТД','ТМ'],'0,25')]:
 for pre in prefixes:hvadd(fid,f'{pre}-{p}/110',167,p,'121','6.3; 6.6; 10.5; 11; 22; 15.75; 38.5','Ун/Д-11','11' if p==125000 else '10,5',io,extras=[('ПБВ на стороне ВН','±2х2.5%',None)])
fid=hvfamily('asia-two-winding-110-rpn','Двухобмоточные трансформаторы класса напряжения 110 кВ с РПН',[167],['ТДН','ТМН','ТДЦН'],'У1, УХЛ1; РПН в нейтрали ВН ±9х1.78%')
for p,prefixes,io in [(25000,['ТДН','ТМН'],'0,4'),(32000,['ТДН','ТМН'],'0,35'),(40000,['ТДН','ТМН'],'0,3'),(63000,['ТДН','ТМН'],'0,25'),(80000,['ТДЦН','ТДН','ТМН'],'0,25'),(125000,['ТДЦН','ТДН','ТМН'],'0,25')]:
 for pre in prefixes:hvadd(fid,f'{pre}-{p}/110',167,p,'115','6.3; 6.6; 10.5; 11; 22; 38.5','Ун/Д-11','11' if p==125000 else '10,5',io)
fid=hvfamily('asia-split-110-rpn','Двухобмоточные трансформаторы с расщепленными обмотками НН класса напряжения 110 кВ с РПН',[168],['ТРДН','ТРМН','ТРДЦН'],'У1, УХЛ1; РПН в нейтрали ВН ±9х1.78%')
for p,prefixes,io in [(25000,['ТРДН','ТРМН'],'0,4'),(32000,['ТРДН','ТРМН'],'0,35'),(40000,['ТРДН','ТРМН'],'0,3'),(63000,['ТРДН','ТРМН'],'0,25'),(80000,['ТРДЦН','ТРДН','ТРМН'],'0,25'),(125000,['ТРДЦН','ТРДН','ТРМН'],'0,25')]:
 for pre in prefixes:hvadd(fid,f'{pre}-{p}/110',168,p,'115','6.3; 6.6; 10.5; 11; 22','Ун/Д-Д-11-11','11 / 21 / 30' if p==125000 else '10.5 / 20 / 30',io)
fid=hvfamily('asia-three-winding-110','Трехобмоточные трансформаторы класса напряжения 110 кВ с РПН',[168],['ТДТН','ТМТН','ТДЦТН'],'У1, УХЛ1; РПН в нейтрали ВН ±9х1.78%; ПБВ на стороне СН ±2х2.5%')
for p,prefixes,io,uk in [(25000,['ТДТН','ТМТН'],'0,45','10.5 / 17.5 / 6.5'),(40000,['ТДТН','ТМТН'],'0,35','10.5 / 17.5 / 6.5'),(63000,['ТДТН','ТМТН'],'0,3','10.5 / 18.0 / 7.0'),(80000,['ТДЦТН','ТДТН','ТМТН'],'0,25','11 / 18.5 / 7.0')]:
 for pre in prefixes:hvadd(fid,f'{pre}-{p}/110',168,p,'115','6.3; 6.6; 10.5; 11; 22','Ун/Ун/Д-0-11',uk,io,mv='38.5')

fid=hvfamily('asia-two-winding-220-pbv','Двухобмоточные трансформаторы класса напряжения 220 кВ с ПБВ и без ПБВ, без регулирования напряжения',[169],['ТД','ТЦ','ТДЦ'],'У1, УХЛ1; ПБВ на стороне ВН ±2х2.5%')
for p,pres,io in [(40000,['ТД','ТДЦ'],'0,35'),(63000,['ТД','ТДЦ'],'0,3'),(80000,['ТД','ТДЦ'],'0,25'),(125000,['ТД','ТДЦ'],'0,25'),(160000,['ТД','ТЦ','ТДЦ'],'*'),(200000,['ТД','ТЦ','ТДЦ'],'*'),(250000,['ТД','ТЦ','ТДЦ'],'*')]:
 for pre in pres:hvadd(fid,f'{pre}-{p}/220',169,p,242,'6.3; 6.6; 10.5; 11; 22; 15.75; 38.5','Ун/Д-11',11,io)
fid=hvfamily('asia-two-winding-220-rpn','Двухобмоточные трансформаторы класса напряжения 220 кВ с РПН',[169],['ТДН','ТЦН','ТДЦН'],'У1, УХЛ1; РПН в нейтрали ВН ±12х1%')
for p,pres,io in [(40000,['ТДН','ТДЦН'],'0,35'),(63000,['ТДН','ТДЦН'],'0,3'),(80000,['ТДН','ТДЦН'],'0,25'),(125000,['ТДН','ТДЦН'],'0,25'),(160000,['ТДН','ТЦН','ТДЦН'],'*'),(200000,['ТДН','ТЦН','ТДЦН'],'*'),(250000,['ТДН','ТЦН','ТДЦН'],'*')]:
 for pre in pres:hvadd(fid,f'{pre}-{p}/220',169,p,230,'6.3; 6.6; 10.5; 11; 22; 15.75; 38.5','Ун/Д-11','11,5' if p<=80000 else '12,5',io)
fid=hvfamily('asia-split-220-rpn','Двухобмоточные трансформаторы класса напряжения 220 кВ с РПН (расщепленные НН по схеме)',[170],['ТРДН','ТРДНС','ТРДЦН'],'У1, УХЛ1; РПН в нейтрали ВН ±12х1%')
for p,pres,io,uk in [(32000,['ТРДН','ТРДНС'],'0,45','11.5 / 21 / 28'),(40000,['ТРДН','ТРДНС','ТРДЦН'],'0,4','11.5 / 21 / 28'),(63000,['ТРДН','ТРДЦН'],'0,4','11.5 / 21 / 28'),(80000,['ТРДН','ТРДЦН'],'0,3','12 / 22.5 / 38'),(125000,['ТРДН','ТРДЦН'],'0,25','12.5 / * / *'),(160000,['ТРДН','ТРДЦН'],'*','12.5 / * / *'),(200000,['ТРДН','ТРДЦН'],'*','12.5 / * / *'),(280000,['ТРДН','ТРДЦН'],'*','12.5 / * / *')]:
 for pre in pres:hvadd(fid,f'{pre}-{p}/220',170,p,230,'6.3; 6.6; 10.5; 11; 22; 15.75; 38.5','Ун/Д-Д-11-11',uk,io)
fid=hvfamily('asia-three-winding-220','Трехобмоточные трансформаторы класса напряжения 220 кВ с РПН',[170],['ТДТН','ТМТН','ТДЦТН'],'У1, УХЛ1; РПН в нейтрали ВН ±12х1%; ПБВ на стороне СН ±2х2.5%')
for p,pres,io,uk in [(25000,['ТДТН','ТМТН'],'0,4','12.5 / 20 / 6.5'),(40000,['ТДТН','ТМТН'],'0,3','12.5 / 22 / 9.5'),(63000,['ТДТН','ТДЦТН'],'0,3','12.5 / 22 / 9.5'),(80000,['ТДТН','ТДЦТН'],'*','*'),(125000,['ТДТН','ТДЦТН'],'*','*')]:
 for pre in pres:hvadd(fid,f'{pre}-{p}/220',170,p,230,'6.3; 6.6; 10.5; 11; 15.75; 22','Ун/Ун/Д-0-11',uk,io,mv='38.5')

fid=hvfamily('asia-autotransformer-220','Трехобмоточные автотрансформаторы класса напряжения 220 кВ с РПН',[171],['АТМТН','АТДТН','АТДЦТН'],'У1, УХЛ1; РПН в линии СН')
for p,pres,lvpower,uk,io,reg in [(32000,['АТМТН','АТДТН'],'16','11 / 30 / 21','0,4','±8х1.5%'),(63000,['АТДТН','АТДЦТН'],'32','11 / 35 / 22','0,35','±8х1.5%'),(90000,['АТДТН','АТДЦТН'],'45','10 / 30 / 19','0,35','±6х2%'),(125000,['АТДТН','АТДЦТН'],'63','11 / 45 / 28','0,3','±6х2%'),(200000,['АТДТН','АТДЦТН'],'80; 100','11 / 32 / 20','0,3','±6х2%'),(250000,['АТДТН','АТДЦТН'],'100; 125','11 / 32 / 20','0,3','±6х2%')]:
 for pre in pres:
  r=add(fid,f'{pre}-{p}/220/110',171,[('Номинальная мощность ВН',p//1000,'МВА'),('Номинальная мощность СН',p//1000,'МВА'),('Номинальная мощность НН',lvpower,'МВА'),('Номинальное напряжение ВН',230,'кВ'),('Номинальное напряжение СН',121,'кВ'),('Номинальное напряжение НН','6.3; 6.6; 10.5; 11; 22; 38.5','кВ'),('Схема и группа соединения обмоток','Ун авто/Д-0-11',None),('Напряжение короткого замыкания',uk,'%'),('Ток холостого хода',io,'%'),('РПН в линии СН',reg,None)])

fid=hvfamily('asia-two-winding-330','Двухобмоточные трансформаторы типа ТД, ТЦ и ТДЦ',[172],['ТД','ТЦ','ТДЦ'],'У1, УХЛ1')
for name,p,lv,io in [('ТДЦ-125000/330',125000,'10,5; 13,8','0.55'),('ТДЦ-200000/330',200000,'13,8','0.50'),('ТЦ-200000/330',200000,'15,75; 18,0','0.50'),('ТДЦ-250000/330',250000,'13,8; 15,75; 18,0','0.50'),('ТЦ-250000/330',250000,'13,8; 15,75; 18,0','0.50')]:hvadd(fid,name,172,p,347,lv,'Ун/Д-11','11,0',io)
fid=hvfamily('asia-split-330','Двухобмоточные трансформаторы с РПН с расщепленными обмотками НН типа ТРДН, ТРДЦН и ТРДНС',[172],['ТРДН','ТРДЦН','ТРДНС'],'У1, УХЛ1; РПН; расщепленные НН')
for name,p,uk in [('ТРДНС-40000/330',40000,'11,0; 20,5; 28,0'),('ТРДЦН-63000/330',63000,'11,0; 18,5; 28,0')]:hvadd(fid,name,172,p,330,'6,3-6,3; 10,5-10,5; 10,5-6,3','Ун/Д-Д-11-11',uk,'0.80')
fid=hvfamily('asia-autotransformer-330','Трехобмоточные автотрансформаторы с РПН типа АТДТЦН и АОДТЦН',[173],['АТДЦТН','АОДЦТН'],'У1, УХЛ1; РПН')
for name,p,hv,mv,lv,grp,uk,io in [('АТДЦТН-125000/330','125000/63000','330','115','6,3; 6,6; 10,5; 11,0; 38,5','Унавто/Д-0-11','10,0; 35,0; 24,0','0.45'),('АТДЦТН-200000/330','200000/80000','330','115','6,3; 6,6; 10,5; 11,0; 38,5','Унавто/Д-0-11','10,5; 38,0; 25,0','0.45'),('АТДЦТН-250000/330','250000/100000','330','158','10,5; 38,5','Унавто/Д-0-11','10,5; 54,0; 42,0','0.45'),('АОДЦТН-133000/330','133000/33000','330/√3','230/√3','10,5; 38,5','1 авто/1-0-0','9,0; 60,0; 48,0','0.20')]:hvadd(fid,name,173,p,hv,lv,grp,uk,io,mv=mv)
fid=hvfamily('asia-two-winding-500','Двухобмоточные трансформаторы типа ТЦ и ТДЦ',[173],['ТЦ','ТДЦ'],'У1, УХЛ1')
for name,lv in [('ТДЦ-250000/500','13,8; 15,75; 20,0'),('ТЦ-250000/500','13,8; 15,75')]:hvadd(fid,name,173,250000,525,lv,'Ун/Д-11','13,0','0.45')
fid=hvfamily('asia-autotransformer-500','Трехобмоточные автотрансформаторы с РПН типа АТДТЦН и АОДТЦН',[174],['АТДЦТН','АОДЦТН'],'У1, УХЛ1; РПН')
hvadd(fid,'АТДЦТН-250000/500',174,'250000/100000',500,'10,5; 38,61','Унавто/Д-0-11','13,0; 33,0; 18,5','0.40',mv='121')['uncertainties'].append('НН cell visibly reads 38,61; retained rather than corrected to 38,5.')
for name,p,lv,uk in [('АОДЦТН-167000/500','167000/50000','10,5; 11,0; 38,5','11,0; 35,0; 21,5'),('АОДЦТН-167000/500','167000/67000','13,8','11,0; 35,0; 21,5'),('АОДЦТН-167000/500','167000/83000','15,75; 20,0','11,0; 35,0; 21,5'),('АОДЦТН-267000/500','267000/67000','10,5; 13,8; 38,5','11,5; 37,0; 23,0'),('АОДЦТН-267000/500','267000/83000','15,75','11,5; 37,0; 23,0'),('АОДЦТН-267000/500','267000/120000','20,0','11,5; 37,0; 23,0'),('АОДЦТН-167000/500','167000/33000','10,5; 38,5','9,5; 67,0; 61,0')]:
 hvadd(fid,name,174,p,'500/√3',lv,'1 авто/1-0-0',uk,'0,25',mv='330/√3' if p=='167000/33000' else '230/√3',variant=p+' кВА')

fid=hvfamily('asia-three-phase-railway-rpn','Трехобмоточные трехфазные трансформаторы с РПН',[175],['ТДТНЖ','ТДТНЖУ'],'трехобмоточный; трехфазный; РПН')
for name,p,hv,uks,io in [('ТДТНЖ-25000/110',25000,115,['10,5; 17,5; 6,5','17,5; 10,5; 6,5'],'0.3'),('ТДТНЖ-40000/110',40000,115,['10,5; 17,5; 6,5','17,5; 10,5; 6,5'],'0.3'),('ТДТНЖ-25000/220',25000,230,['12,5; 20,0; 6,5','20,0; 12,5; 6,5'],'0.5'),('ТДТНЖ-40000/220',40000,230,['12,5; 22,0; 9,5','22,0; 12,5; 9,5'],'0.3'),('ТДТНЖУ-25000/110',25000,115,['17,5; 10,5; 6,5','10,5; 17,5; 6,5'],'*'),('ТДТНЖУ-40000/110',40000,115,['17,5; 10,5; 6,5','10,5; 17,5; 6,5'],'0.3'),('ТДТНЖУ-25000/220',25000,230,['*','*'],'*'),('ТДТНЖУ-40000/220',40000,230,['*','*'],'*')]:
 for mv,lv,grp,uk in [('27,5','6,6; 11,0','Ун/Д/Д-11-11',uks[0]),('38,5','27,5','Ун/Ун/Д-0-11',uks[1])]:hvadd(fid,name,175,p,hv,lv,grp,uk,io,mv=mv,variant='СН '+mv+' кВ; НН '+lv+' кВ')
fid=hvfamily('asia-single-phase-railway-rpn','Двухобмоточные однофазные трансформаторы с РПН',[175],['ОРДНЖ','ОРДТНЖ'],'однофазный; РПН')
for name,hv,uk in [('ОРДНЖ-25000/110',115,'11,0; 11,0; 15,0'),('ОРДНЖ-25000/220',230,'11,5; 11,5; 24,0')]:hvadd(fid,name,175,25000,hv,'27,5-27,5','1/1-1-0',uk,'*')
for name,hv,uks in [('ОРДТНЖ-25000/110',115,['17,0; 9,6; 6,0','9,6; 17,0; 6,0']),('ОРДТНЖ-25000/220',230,['20,7; 13,2; 6,5','13,2; 20,7; 6,5'])]:
 for mv,lv,uk in [('38,5','27,5-27,5',uks[0]),('27,5-27,5','11,0',uks[1])]:hvadd(fid,name,175,25000,hv,lv,'1/1/1-1-0-0',uk,'0.3',mv=mv,variant='СН '+mv+' кВ; НН '+lv+' кВ')

fid=hvfamily('asia-shunt-reactor-configurations','Шунтирующие реакторы',[176],[],'generic named rating configurations; no explicit model code')
for hv in [110,220,500]:
 for p in [25000,50000,63000,100000,180000]:add(fid,'Шунтирующий реактор',176,[('Класс напряжения',hv,'кВ'),('Номинальная мощность',p,'кВАр'),('Стандарт','IEC 60076-6 (2007)',None)],variant=f'{hv} кВ; {p} кВАр',kind='configuration')
fid=hvfamily('asia-single-phase-shunt','Шунтирующие реакторы. Однофазные',[176],['РОМ'],'однофазный')
for name,p,v,i,z in [('РОМ-60000/500',60000,'525 / √3',198,1531),('РОМ-55000/400',55000,'420 / √3',227,1069)]:add(fid,name,176,[('Номинальная мощность',p,'кВАр'),('Номинальное напряжение ВН',v,'кВ'),('Номинальный ток',i,'А'),('Схема и группа соединения обмоток','-',None),('Импеданс',z,'Ом'),('Способ регулирования напряжения','-',None)])
fid=hvfamily('asia-three-phase-shunt','Шунтирующие реакторы. Трехфазные',[177],['РТМ','РТДЦ','РТД'],'трехфазный')
for name,p,v,i,z in [('РТМ-128000/550',128000,550,134,2363),('РТМ-65000/550',65000,550,68,4654),('РТМ-60000/550',60000,550,63,5042),('РТДЦ-100000/400',100000,400,144,1600),('РТМ-50000/400',50000,400,72,3200),('РТМ-45000/400',45000,400,65,3556),('РТМ-25000/230',25000,230,63,2116),('РТМ-10000/230',10000,230,'25,1',5290),('РТМ-50000/110',50000,110,262,242),('РТД-20000/35',20000,'38,5',300,74),('РТД-25000/20',25000,20,722,16)]:add(fid,name,177,[('Номинальная мощность',p,'кВАр'),('Номинальное напряжение ВН',v,'кВ'),('Номинальный ток',i,'А'),('Схема и группа соединения обмоток','Ун',None),('Импеданс',z,'Ом'),('Способ регулирования напряжения','-',None)])
fid=hvfamily('asia-controlled-shunt','Управляемые шунтирующие реакторы. Трехфазное исполнение электромагнитной части',[177],['РТУ'],'управляемый; трехфазное исполнение электромагнитной части')
for name,p,v,i in [('РТУ-180000/500',180000,525,198),('РТУ-180000/330',180000,347,300),('РТУ-100000/220',100000,242,239),('РТУ-25000/220',25000,242,60),('РТУ-63000/110',63000,121,300),('РТУ-25000/110',25000,121,119),('РТУ-25000/35',25000,'38,5',375)]:add(fid,name,177,[('Номинальная мощность',p,'кВАр'),('Номинальное напряжение ВН',v,'кВ'),('Номинальный ток',i,'А'),('Вид охлаждения','Д',None)])
# Final enlarged-render validation corrections, plus complete secondary tabulated dimensions.
def select(fid,contains=None):return [r for r in models if r['familyId']==fid and (contains is None or contains in r['designation'])]
def change(r,label,value):
 for s in r['technicalSpecs']:
  if s['label']==label:s['value']=str(value)
def extra(r,page,labels,values):
 for k,v in zip(labels.split(),values):r['technicalSpecs'].append(spec(k,v,'мм',page))
def find(fid,p):return next(r for r in select(fid) if re.search(r'-'+str(p)+r'(?:/|\b)',r['designation']))
change(find('tm-zh-35-27-5',25),'H',1555);change(find('tm-zh-35-27-5',250),'H',1800)
change(find('tmg-35',250),'Uk','6,0')
change(find('aomzh-27-5x2',16000),'B',3980)
change(find('td-35',16000),'Полная масса',26000)
change(find('tdns-35',25000),'H',4630)
change(find('tm-35-20-lv04',4000),'Транспортная масса',7440)
change(find('tmn-35-20',4000),'Транспортная масса',7900)
change(find('tdtn-110-small',10000),'B',3424)
for r in select('tm-zh-35-27-5'):
 r['designation'] += ' '+r['execution'];r['name']=r['designation'];r['sku']=r['designation'];r['sourceRow']['designation']=r['designation']
r=find('trdns-35',25000);r['designation']=r['name']=r['sku']=r['sourceRow']['designation']='ТРДНС-25000/35'
for r in select('tdn-110-small','10000'):r['designation']=r['name']=r['sku']=r['sourceRow']['designation']='ТДН-10000/110(Ал)'
for r in select('tds-10000')+select('tm-4000-6300-10'):
 for s in r['technicalSpecs']:
  if s['label'] in ['Потери Х.Х.','Потери К.З.']:s['unit']='Вт'
 r['uncertainties'].append('Loss table header explicitly says Вт despite numerical scale likely intended as кВт; raw unit is preserved without correction.')
for p,values in [(25,[550,550,80,460,400,140]),(40,[550,550,90,460,400,135]),(63,[550,550,90,460,400,135]),(100,[550,550,100,435,380,165]),(160,[660,660,100,560,510,145]),(250,[605,605,100,435,375,172]),(400,[760,760,150,480,400,156]),(630,[820,820,150,400,220,190])]:extra(find('tm-zh-35-27-5',p),103,'A A1 M K h h1',values)
for p,values in [(25,[550,550,80,460,400,140]),(40,[550,550,90,460,400,135]),(63,[550,550,90,460,400,135]),(100,[550,550,100,435,380,165]),(160,[660,660,100,560,510,145]),(250,[605,605,100,435,375,172]),(400,[760,760,150,450,400,156]),(630,[820,820,150,400,220,190]),(1000,[1070,1070,145,400,215,210]),(1600,[1070,1070,210,400,220,220]),(2500,[1070,1070,145,400,240,190])]:extra(find('tmg-35',p),106,'A A1 M K h h1',values)
for p,values in [(10000,[2512,850,1524,460,330,267]),(16000,[2717,850,1524,484,318,318])]:extra(find('aomzh-27-5x2',p),109,'H1 H2 A N b b1',values)
for p,values in [(10000,[2850,850,460,1524,510,260,350,365]),(16000,[3160,725,690,1524,570,260,390,385])]:extra(find('td-35',p),117,'H1 H2 H3 A N K b b1',values)
for selector,pg,values in [('10000/35 Ал-Ал',119,[2850,750,460,1524,1000,260,350,365]),('10000/35 Cu-Cu',119,[2620,750,460,1524,950,260,310,342]),('16000/35 Ал-Ал',121,[3270,850,585,1524,750,260,374,404]),('16000/35 Cu-Cu',121,[2870,850,585,1524,700,260,355,385]),('25000/35',121,[2766,720,660,1524,700,400,418,473]),('40000/35',121,[3300,1005,710,'1524; 2000',600,400,545,570])]:extra(select('tdns-35',selector)[0],pg,'H1 H2 H3 A N K b b1',values)
for p,pg,values in [(1000,124,[1545,470,350,400,1070,145,215,210]),(1600,124,[1760,470,425,400,1070,210,220,220]),(2500,125,[1925,470,360,400,1070,145,190,240]),(4000,125,[2425,708,418,400,1594,310,310,288])]:extra(find('tm-35-20-lv04',p),pg,'H1 H2 H3 M A K b b1',values)
for fid,start in [('tm-35-20',128),('tmzh-27-5',134)]:
 for p,values in [(1000,[1545,280,470,400,1070,200,215,210]),(1600,[1760,280,470,400,1070,200,220,235])]:extra(find(fid,p),start,'H1 H2 H3 M A K b b1',values)
 for p,values in [(2500,[1820,280,460,400,1070,200,240,280]),(4000,[2140,280,710,400,1594,240,245,285]),(6300,[2415,280,710,400,1594,240,260,310])]:extra(find(fid,p),start+1,'H1 H2 H3 N A K b b1',values)
for p,pg,values in [(1000,140,[1523,280,840,1070,400,200,190,235]),(1600,140,[1700,280,840,1070,400,200,190,235]),(2500,142,[1770,280,840,1070,400,200,280,205]),(4000,142,[2139,280,840,1594,400,240,285,230]),(6300,142,[2350,280,840,1594,400,240,300,260])]:extra(find('tmn-35-20',p),pg,'H1 H2 H3 A N K b b1',values)
for selector,pg,values in [('10000',151,[3152,462,660,1070,400,440,435]),('16000/110 Cu-Cu',152,[2876,650,790,1070,400,449,450]),('16000/110 Ал-Ал',152,[2750,582,820,1070,400,500,520])]:extra(select('tdn-110-small',selector)[0],pg,'H1 H2 A N K b b1',values)
for p,pg,values in [(10000,154,[3320,730,445,1130,1170,400,505,530]),(16000,155,[2756,850,582,987,1215,400,518,555])]:extra(find('tdtn-110-small',p),pg,'H1 H2 H3 A N K b b1',values)
for selector,values in [('10,5/3,15',[2615,275,690,440,510,260,1524,365,365]),('11/6,3',[2850,275,485,440,'-',260,1524,365,365]),('6,3/6,3',[2850,555,555,260,'-',260,1524,365,365])]:extra(select('tds-10000',selector)[0],159,'H1 H2 H3 M N K A b b1',values)
for selector,values in [('4000-10-3,15',[2140,280,485,300,1594,240,230,285]),('4000-10-6,3',[2140,280,280,300,1594,240,230,285]),('4000-13-10',[2140,468,280,300,1594,240,230,285]),('6300-11-6,3',[2412,280,280,400,1594,240,260,310]),('6300-6-6,3',[2412,280,280,400,1594,240,260,310]),('6300-10-3,15',[2412,280,600,400,1594,260,260,250])]:extra(select('tm-4000-6300-10',selector)[0],162,'H1 H2-ВН H3-НН M A K b b1',values)

# Independent review: shared RPN prose is on physical page144, not the continuation table145.
for r in models:
 if r['id'] in ['alageum-tmn-4000-110-f543a53e','alageum-tmn-6300-110-al-13266e63']:
  for sp in r['technicalSpecs']:
   if sp['label']=='РПН':
    assert sp['page']==145 and sp['value']=='±9х1,78%'
    sp['page']=144
  r['sourcePages']=sorted(set(r['sourcePages']+[144]))

# Source-scoped prose and labels confirmed by independent source review.
review_prose = {'scopePhysicalPages': [102, 187], 'status': 'reviewed-source-prose-additions', 'additions': [{'familyId': 'omzh-27-5', 'recordIds': ['alageum-om-2-5-27-5-5c844db4', 'alageum-om-4-27-5-dc449b1f', 'alageum-om-10-27-5-4afd1689'], 'technicalSpecs': [{'label': 'Частота', 'value': '50', 'unit': 'Гц', 'page': 102}, {'label': 'Климат', 'value': 'умеренный', 'unit': None, 'page': 102}, {'label': 'Высота установки над уровнем моря', 'value': 'не более 1000', 'unit': 'м', 'page': 102}, {'label': 'Температура окружающего воздуха', 'value': '−45 … +40', 'unit': '°C', 'page': 102}, {'label': 'Относительная влажность воздуха', 'value': 'не более 80% при +25 °C', 'unit': None, 'page': 102}, {'label': 'Стандарт', 'value': 'ГОСТ 11677-85', 'unit': None, 'page': 102}, {'label': 'Условия среды (дословно)', 'value': 'Не взрывоопасной и химически активной среде.', 'unit': None, 'page': 102}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': ['The printed environment wording says chemically active, not chemically inactive. Preserve verbatim and flag source ambiguity; do not silently correct.']}, {'familyId': 'tm-zh-35-27-5', 'recordIds': ['alageum-tm-25-cu-cu-0becb1cd', 'alageum-tm-40-cu-cu-757e760d', 'alageum-tm-63-cu-cu-e6ec72c3', 'alageum-tm-100-gofro-41550739', 'alageum-tm-160-gofro-0b7d356f', 'alageum-tm-250-gofro-b79053ec', 'alageum-tm-400-gofro-6de155e2', 'alageum-tm-630-gofro-5f8fa7bf'], 'technicalSpecs': [{'label': 'Частота', 'value': '50', 'unit': 'Гц', 'page': 103}, {'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 103}, {'label': 'Тип трансформатора', 'value': 'масляный', 'unit': None, 'page': 103}, {'label': 'Стандарт', 'value': 'ГОСТ 11677', 'unit': None, 'page': 103}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tmg-35', 'recordIds': ['alageum-tmg-25-35-kv-a5ee05cb', 'alageum-tmg-40-35-kv-cac6b2ce', 'alageum-tmg-63-35-kv-256cf341', 'alageum-tmg-100-35-kv-d09c147c', 'alageum-tmg-160-35-kv-61b8771f', 'alageum-tmg-250-35-kv-a39056bb', 'alageum-tmg-400-35-kv-14cfad3c', 'alageum-tmg-630-35-kv-e447452b', 'alageum-tmg-1000-35-kv-3495071a', 'alageum-tmg-1600-35-kv-a742f975', 'alageum-tmg-2500-35-kv-04053493'], 'technicalSpecs': [{'label': 'Частота', 'value': '50', 'unit': 'Гц', 'page': 105}, {'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 105}, {'label': 'Тип трансформатора', 'value': 'масляный', 'unit': None, 'page': 105}, {'label': 'Стандарт', 'value': 'ГОСТ 11677', 'unit': None, 'page': 105}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'aomzh-27-5x2', 'recordIds': ['alageum-aom-10000-2h27-5-34f40013', 'alageum-aom-16000-2h27-5-5c7dfe11'], 'technicalSpecs': [{'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 109}, {'label': 'Высота установки над уровнем моря', 'value': 'не более 1000', 'unit': 'м', 'page': 109}, {'label': 'Температура эксплуатации — умеренное исполнение', 'value': '−45 … +40', 'unit': '°C', 'page': 109}, {'label': 'Температура эксплуатации — холодное исполнение', 'value': '−60 … +40', 'unit': '°C', 'page': 109}, {'label': 'Стандарты климатических условий', 'value': 'ГОСТ 15543.1-89; ГОСТ 15150-69; ГОСТ 11677-85', 'unit': None, 'page': 109}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. The two temperature ranges are alternative climate-execution limits, not simultaneous operating conditions and not new model variants.', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tdtnsh-35', 'recordIds': ['alageum-tdtns-16000-35-413cb587'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 111}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 111}, {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 111}, {'label': 'ПБВ со стороны СН', 'value': '±2х2,5%', 'unit': None, 'page': 111}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': ['Page111 heading and top description identify /35 and36,75kV, but repeated designation explanation/body below says /110. Retain existing source-conflict warning. Do not synthesize a /110 model.']}, {'familyId': 'trdns-35', 'recordIds': ['alageum-trdns-16000-35-cu-cu-c98221d7', 'alageum-trdns-25000-35-cu-cu-c00985e2', 'alageum-trdns-40000-35-cu-cu-02971929'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 113}, {'label': 'Количество обмоток', 'value': '2; с расщепленной обмоткой НН', 'unit': None, 'page': 113}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 113}, {'label': 'РПН со стороны ВН', 'value': '±8х1,5%', 'unit': None, 'page': 113}], 'applicability': "Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. The descriptive prose and one table together cover the three explicit16000/25000/40000kVA rows; retain each row's printed material label, including no material label for25000.", 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'td-35', 'recordIds': ['alageum-td-10000-35-al-95689ec4', 'alageum-td-16000-35-cu-1bb1cab9'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 117}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 117}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 117}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2,5%', 'unit': None, 'page': 117}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tdns-35', 'recordIds': ['alageum-tdns-10000-35-al-al-56fe2ce9', 'alageum-tdns-10000-35-cu-cu-08098158', 'alageum-tdns-16000-35-al-al-85bcf09d', 'alageum-tdns-16000-35-cu-cu-1126f97d', 'alageum-tdns-25000-35-c61bf32b', 'alageum-tdns-40000-35-cu-cu-be3a3067'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 119}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 119}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 119}, {'label': 'РПН со стороны ВН', 'value': '±8х1,5%', 'unit': None, 'page': 119}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tm-35-20-lv04', 'recordIds': ['alageum-tm-1000-35-20-0-4-b2241a20', 'alageum-tm-1600-35-20-0-4-b63d4f1c', 'alageum-tm-2500-35-20-0-4-al-5976da1d', 'alageum-tm-4000-35-20-0-4-al-12253521'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 124}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 124}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 124}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2,5%', 'unit': None, 'page': 124}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tm-35-20', 'recordIds': ['alageum-tm-1000-35-20-4ba0ed12', 'alageum-tm-1600-35-20-2b2ae61f', 'alageum-tm-2500-35-20-0c7f151a', 'alageum-tm-4000-35-20-270a545a', 'alageum-tm-6300-35-20-425a84bf'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 128}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 128}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 128}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2,5%', 'unit': None, 'page': 128}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tmzh-27-5', 'recordIds': ['alageum-tm-1000-27-5-efeb321c', 'alageum-tm-1600-27-5-69aa0fa1', 'alageum-tm-2500-27-5-954eebc9', 'alageum-tm-4000-27-5-4babfea6', 'alageum-tm-6300-27-5-9c7e897f'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 134}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 134}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 134}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2,5%', 'unit': None, 'page': 134}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tmn-35-20', 'recordIds': ['alageum-tmn-1000-35-20-927a3377', 'alageum-tmn-1600-35-20-c4b0c4e2', 'alageum-tmn-2500-35-20-6c3eee06', 'alageum-tmn-4000-35-20-1487b233', 'alageum-tmn-6300-35-20-6b6ca37e'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 140}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 140}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 140}, {'label': 'РПН со стороны ВН', 'value': '±4х2,5%', 'unit': None, 'page': 140}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. Page140 family heading1000–6300covers all5explicit rows. Page142 independently repeats these same facts for2500–6300with panel radiators; panel-radiator execution itself applies only to the three rows on142.', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tmn-110-small', 'recordIds': ['alageum-tmn-2500-110-al-167e0957', 'alageum-tmn-4000-110-f543a53e', 'alageum-tmn-6300-110-al-13266e63'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 144}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 144}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 144}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. Do not give every model the same RPN value:2500usesНН±8х2%;4000and6300useВН±9х1,78%. Existing corrected record-level RPN specs carry the numeric values.', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tmtn-110', 'recordIds': ['alageum-tmtn-6300-110-928193ce'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 149}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 149}, {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 149}, {'label': 'ПБВ со стороны СН', 'value': '±2х2,5%', 'unit': None, 'page': 149}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tdn-110-small', 'recordIds': ['alageum-tdn-10000-110-al-0c1cc94a', 'alageum-tdn-16000-110-cu-cu-bd1c6d05', 'alageum-tdn-16000-110-al-al-3faf5b36'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 151}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 151}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 151}, {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 151}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tdtn-110-small', 'recordIds': ['alageum-tdtn-10000-110-al-bf7e49b4', 'alageum-tdtn-16000-110-cu-cu-4c61652b'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 154}, {'label': 'Количество обмоток', 'value': '3', 'unit': None, 'page': 154}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 154}, {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 154}, {'label': 'ПБВ со стороны СН', 'value': '±2х2,5%', 'unit': None, 'page': 154}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tdn-10-11', 'recordIds': ['alageum-tdn-10000-10-11-96820c70'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 157}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 157}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 157}, {'label': 'РПН со стороны ВН', 'value': '±5х1,5%', 'unit': None, 'page': 157}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tds-10000', 'recordIds': ['alageum-tds-10000-10-5-3-15-c5a29a24', 'alageum-tds-10000-11-6-3-e0817d26', 'alageum-tds-10000-6-3-6-3-f47b1777'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 159}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 159}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и принудительная циркуляция воздуха', 'unit': None, 'page': 159}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2,5%', 'unit': None, 'page': 159}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. ', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}, {'familyId': 'tm-4000-6300-10', 'recordIds': ['alageum-tm-4000-10-3-15-165b9408', 'alageum-tm-4000-10-6-3-a16e98c8', 'alageum-tm-4000-13-10-0ff1fca7', 'alageum-tm-6300-11-6-3-85710854', 'alageum-tm-6300-6-6-3-d9c19211', 'alageum-tm-6300-10-3-15-0c866f7d'], 'technicalSpecs': [{'label': 'Количество фаз', 'value': '3', 'unit': None, 'page': 161}, {'label': 'Количество обмоток', 'value': '2', 'unit': None, 'page': 161}, {'label': 'Охлаждение', 'value': 'естественная циркуляция масла и воздуха', 'unit': None, 'page': 161}, {'label': 'ПБВ со стороны ВН', 'value': '±2х2.5%', 'unit': None, 'page': 161}], 'applicability': 'Only the explicitly covered family and listed records; no propagation to other families, questionnaire pages, or manufacturer-wide product ranges. The±2 multiplier is clearly visible in the3xPDF crop even though it is hard to read in the optimized full-page image.', 'sourceType': 'printed descriptive prose, independently inspected pixels', 'confidence': 'high', 'warnings': []}], 'doNotPropagate': [{'physicalPage': 111, 'fact': '50Гц occurs in a paragraph calling the modelТДТНШ-16000/110, while the section heading and table are /35', 'recommendation': 'Do not automatically add frequency to /35 unless retaining a specific ambiguity warning; no separate /110model is warranted.'}, {'physicalPage': 166, 'fact': '10–500МВА and110–500кВ are manufacturer capability ranges', 'recommendation': 'Do not apply these as individual model ratings or expand them into records.'}, {'physicalPages': [178, 179, 180, 181, 182, 183, 184, 185], 'fact': 'Blank order questionnaires contain default options and reference values', 'recommendation': 'Do not create products or product specs from questionnaire defaults.'}], 'recordSpecificLabelRefinements': [{'recordId': 'alageum-tmn-2500-110-al-167e0957', 'oldLabel': 'РПН', 'technicalSpec': {'label': 'РПН со стороны НН', 'value': '±8х2%', 'unit': None, 'page': 144}, 'reason': 'Source distinguishes the winding carrying the tap changer.'}, {'recordId': 'alageum-tmn-4000-110-f543a53e', 'oldLabel': 'РПН', 'technicalSpec': {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 144}, 'reason': 'Source distinguishes the winding carrying the tap changer.'}, {'recordId': 'alageum-tmn-6300-110-al-13266e63', 'oldLabel': 'РПН', 'technicalSpec': {'label': 'РПН со стороны ВН', 'value': '±9х1,78%', 'unit': None, 'page': 144}, 'reason': 'Source distinguishes the winding carrying the tap changer.'}]}
record_lookup={r['id']:r for r in models+configurations}
family_lookup={f['id']:f for f in families}
def append_review_specs(target, specs):
 for spec in specs:
  if not any(all(old.get(k)==spec.get(k) for k in ['label','value','unit','page']) for old in target):target.append(dict(spec))
for refinement in review_prose['recordSpecificLabelRefinements']:
 r=record_lookup[refinement['recordId']]
 old=next(sp for sp in r['technicalSpecs'] if sp['label']==refinement['oldLabel'])
 old.update(refinement['technicalSpec'])
for group in review_prose['additions']:
 f=family_lookup[group['familyId']]
 f.setdefault('proseTechnicalSpecGroups',[]).append(group)
 applicable=set(group['recordIds'])
 assert applicable <= set(record_lookup)
 assert all(record_lookup[rid]['familyId']==f['id'] for rid in applicable)
 if applicable==set(r['id'] for r in models+configurations if r['familyId']==f['id']):
  append_review_specs(f.setdefault('technicalSpecs',[]),group['technicalSpecs'])
 for rid in applicable:
  r=record_lookup[rid]
  append_review_specs(r['technicalSpecs'],group['technicalSpecs'])
  r['sourcePages']=sorted(set(r['sourcePages']+[sp['page'] for sp in group['technicalSpecs']]))
  for warning in group.get('warnings',[]):
   if warning not in r['uncertainties']:r['uncertainties'].append(warning)
 f['sourcePages']=sorted(set(f['sourcePages']+[sp['page'] for sp in group['technicalSpecs']]))
# The page111 prose conflict is /110; no /10 reading is supported by enlarged source.
for r in models:
 if r['id']=='alageum-tdtns-16000-35-413cb587':
  r['uncertainties']=[x.replace('/110 and /10','/110').replace('/110 or /10','/110').replace('/110 или /10','/110') for x in r['uncertainties']]

# Enrichment and source-only semantic classification.
for r in models+configurations:
 f=next(f for f in families if f['id']==r['familyId'])
 r['brand']='Alageum Electric'
 r['productKind']='reactor' if 'shunt' in r['familyId'] else ('autotransformer' if ('autotransformer' in r['familyId'] or r['familyId']=='aomzh-27-5x2') else 'transformer')
 r['sourceDocument']='ALAGEUM transformer technical catalog, 2026-03-18'
 r['sourceEvidence']=[{'pdfPage':p,'printedPage':168 if p==166 else p,'localAssetPath':f'alageum-catalog-assets-next/frontend/public/catalog-source/transformers-2026/page-{p:03}.webp','appAssetPath':f'/catalog-source/transformers-2026/page-{p:03}.webp'} for p in r['sourcePages']]
 r['technicalSpecCoverage']='All tabulated electrical characteristics and readable tabulated dimensional/mass fields; untranscribed numeric drawing callouts remain available in source drawing assets.'
 r['sourceRow']['tableModelIndexOnPage']=sum(1 for q in (models+configurations)[:(models+configurations).index(r)] if q['sourceRow']['pdfPage']==r['sourceRow']['pdfPage'])+1
 r['rawSpecs']=r['technicalSpecs']
 if r['manufacturer'] is None:r['manufacturerStatus']='unknown within assigned pages; Alageum logo alone is not factory attribution'
 else:r['manufacturerStatus']='explicit section manufacturer introduction on physical page 166 (printed 168)'
 if r['sourceRow']['pdfPage']>=167:r['assetStatus']='No product-linked drawing or photograph in the Asia Trafo specification tables. Page 166 states mass, dimensions and drawings are supplied on request.'
 for s in r['technicalSpecs']:
  if s['page'] in [103,105,106] and s['unit']=='мм':
   s['unit']=None;s['unitNote']='Source table dimension header does not print a unit; no unit inferred.'
# Independent review: page176 lists generic ratings before its two named ROM models.
p176=[r for r in configurations if r['sourceRow']['pdfPage']==176]+[r for r in models if r['sourceRow']['pdfPage']==176]
assert len(p176)==17
for position,r in enumerate(p176,1):r['sourceRow']['tableModelIndexOnPage']=position
for f in families:
 f['productKind']='reactor' if 'shunt' in f['id'] else ('autotransformer' if ('autotransformer' in f['id'] or f['id']=='aomzh-27-5x2') else 'transformer')
 f['modelIds']=[r['id'] for r in models if r['familyId']==f['id']]
 f['configurationIds']=[r['id'] for r in configurations if r['familyId']==f['id']]
 f['rangeExpansionPolicy']='Only explicitly named table models or configurations enumerated. No new SKU synthesized from family ranges, climate options or voltage lists.'
for a in assets:
 a['sourceAssets']=[{'page':p,'appAssetPath':f'/catalog-source/transformers-2026/page-{p:03}.webp','localAssetPath':f'alageum-catalog-assets-next/frontend/public/catalog-source/transformers-2026/page-{p:03}.webp'} for p in a['evidencePages']]
 a['reuseRestrictions']=['Reusable as a source-grounded family illustration only','Do not represent variants as dimensionally identical','A drawing is not a photograph or validated 3D CAD model']
assets.append({'id':'photo-section-165','title':'Силовые трансформаторы, автотрансформаторы и реакторы 110–500 кВ','type':'photograph','evidencePages':[165],'modelIds':[],'reusableType':'section-level editorial image only','justification':'Photograph accompanies section cover; no specific model designation is connected to the pictured equipment.','sourceAssets':[{'page':165,'appAssetPath':'/catalog-source/transformers-2026/page-165.webp'}]})
assets.append({'id':'photo-factory-166','title':'Asia Trafo factory','type':'factory-photograph','evidencePages':[166],'modelIds':[],'reusableType':'manufacturer-level editorial image only','justification':'Explicit Asia Trafo manufacturer introduction; image is a factory building, not a product.','sourceAssets':[{'page':166,'appAssetPath':'/catalog-source/transformers-2026/page-166.webp'}]})
# Page headings and classification; all physical pages were inspected as rendered images.
headings={
102:'Трансформаторы ОМЖ-2,5–10 кВА напряжением 27,5кВ; ОМЖ-2,5–10',103:'Трансформаторы ТМ(Ж)-25–630 кВА напряжением 35(27,5) кВ',104:'ТМ(Ж)-25–630',105:'Трансформаторы ТМГ-25–2500 кВА напряжением 35 кВ',106:'Продолжение таблицы габаритных размеров ТМГ',107:'ТМГ-25–400',108:'ТМГ-630–2500',109:'Автотрансформатор силовой однофазный двухобмоточный для железных дорог типа АОМЖ-10000÷16000/27,5х2-У1(УХЛ1)',110:'АОМЖ-10000÷16000/2х27,5-У1(УХЛ1)',111:'Трансформаторы силовые трехобмоточные с РПН типа ТДТНШ-16000/35-У1 (УХЛ1)',112:'Технические характеристики; ТДТНШ-16000/35-У1 (УХЛ1)',113:'Трансформатор силовой двухобмоточный с расщепленными обмотками НН с РПН типа ТРДНС-25000/35-У1(УХЛ1)',114:'ТРДНС-16000/35-У1(УХЛ1)',115:'ТРДНС-25000/35-У1(УХЛ1)',116:'ТРДНС-40000/35-У1(УХЛ1)',117:'Трансформаторы силовые двухобмоточные с ПБВ типа ТД-10000÷16000/35-У1(УХЛ1)',118:'ТД-10000÷16000/35-У1(УХЛ1)',119:'Трансформаторы силовые двухобмоточные с РПН типа ТДНС-10000÷40000/35-У1(УХЛ1)',120:'ТДНС-10000/35-У1 (УХЛ1); Технические характеристики типа ТДНС-16000÷40000/35-У1 (УХЛ1)',121:'Продолжение габаритной таблицы; типа ТДНС-16000/35-У1 (УХЛ1)',122:'типа ТДНС-25000/35-У1 (УХЛ1)',123:'ТДНС-40000/35-У1(УХЛ1)',124:'Трансформаторы силовые двухобмоточные ПБВ типа ТМ-1000÷4000/35(20)/0,4-У1(УХЛ1)',125:'Технические характеристики типа ТМ-2500/35(20)/0,4-У1 (УХЛ1); ТМ-1000÷1600/35(20)/0,4-У1 (УХЛ1)',126:'ТМ-2500/35(20)/0,4-У1 (УХЛ1)',127:'ТМ-4000/35(20)/0,4-У1(УХЛ1)',128:'Трансформаторы силовые двухобмоточные с ПБВ типа ТМ-1000÷6300/35(20)-У1(УХЛ1)',129:'Технические характеристики типа ТМ-2500/35(20)-У1(УХЛ1); ТМ-4000÷6300/35(20)-У1(УХЛ1)',130:'ТМ-1000÷1600/35(20)-У1(УХЛ1)',131:'ТМ-2500/35(20)-У1(УХЛ1)',132:'ТМ-4000/35(20)-У1(УХЛ1)',133:'ТМ-6300/35(20)-У1(УХЛ1)',134:'Трансформаторы силовые двухобмоточные с ПБВ типа ТМЖ-1000÷6300/27,5-У1(УХЛ1) для железных дорог',135:'Технические характеристики ТМЖ-2500/27,5-У1(УХЛ1); ТМЖ-4000÷6300/27,5-У1(УХЛ1)',136:'ТМЖ-1000÷1600/27,5-У1(УХЛ1)',137:'ТМЖ-2500/27,5-У1(УХЛ1)',138:'ТМЖ-4000÷6300/27,5-У1(УХЛ1)',139:'ТМЖ-6300/27,5-У1 (УХЛ1)',140:'Трансформаторы силовые двухобмоточные с РПН типа ТМН-1000÷6300/35(20)-У1(УХЛ1)',141:'ТМН-1000÷1600/35(20)-У1(УХЛ1)',142:'Трансформаторы силовые двухобмоточные с РПН типа ТМН-2500÷6300/35(20)-У1(УХЛ1) с панельными радиаторами',143:'ТМН-2500÷6300/35(20)-У1(УХЛ1) панельный',144:'Трансформаторы силовые двухобмоточные с РПН типа ТМН-2500÷6300/110-У1(УХЛ1)',145:'Технические характеристики ТМН-4000/110-У1 (УХЛ1); ТМН-6300/110-У1 (УХЛ1)',146:'ТМН-2500/110-У1(УХЛ1)',147:'ТМН-4000/110-У1 (УХЛ1)',148:'ТМН-6300/110-У1 (УХЛ1)',149:'Трансформатор силовой трехобмоточный с РПН типа ТМТН-6300/110-У1(УХЛ)',150:'ТМТН-6300/110-У1(УХЛ1)',151:'Трансформаторы силовые двухобмоточные с РПН типа ТДН-10000÷16000/110-У1(УХЛ1)',152:'Продолжение габаритной таблицы ТДН-16000/110; ТДН-10000/110-У1 (УХЛ1)',153:'ТДН-16000/110-У1 (УХЛ1)',154:'Трансформаторы силовые трехобмоточные с РПН типа ТДТН-10000÷16000/110-У1 (УХЛ1)',155:'Технические характеристики типа ТДТН-16000/110-У1(УХЛ1); ТДТН-10000/110-У1(УХЛ1)',156:'ТДТН-16000/110-У1(УХЛ1)',157:'Трансформаторы силовые двухобмоточные с РПН типа ТДН-10000/10/11-У1(УХЛ1)',158:'ТДН-10000/10/11-У1(УХЛ1)',159:'Трансформаторы силовые двухобмоточные типа ТДС-10000/10/11-У1(УХЛ1)',160:'ТДС-10000-6,3-У1(УХЛ1)',161:'Трансформаторы силовые двухобмоточные типа ТМ-4000÷6300/10-У1 (УХЛ1)',162:'Продолжение габаритной таблицы ТМ-4000/ТМ-6300',163:'ТМ-4000/10-У1 (УХЛ1)',164:'ТМ-6300/10-У1(УХЛ1)',165:'Силовые трансформаторы, автотрансформаторы и реакторы 110–500 кВ',166:'Alageum Electric Asia Trafo; ТОО «Asia Trafo»',167:'Двухобмоточные трансформаторы класса напряжения 110 кВ с ПБВ и без ПБВ, без регулирования напряжения; Двухобмоточные трансформаторы класса напряжения 110 кВ с РПН',168:'Двухобмоточные трансформаторы с расщепленными обмотками НН класса напряжения 110 кВ с РПН; Трехобмоточные трансформаторы класса напряжения 110 кВ с РПН',169:'Двухобмоточные трансформаторы класса напряжения 220 кВ с ПБВ и без ПБВ, без регулирования напряжения; Двухобмоточные трансформаторы класса напряжения 220 кВ с РПН',170:'Двухобмоточные трансформаторы класса напряжения 220 кВ с РПН; Трехобмоточные трансформаторы класса напряжения 220 кВ с РПН',171:'Трехобмоточные автотрансформаторы класса напряжения 220 кВ с РПН',172:'Двухобмоточные трансформаторы типа ТД, ТЦ и ТДЦ; Двухобмоточные трансформаторы с РПН с расщепленными обмотками НН типа ТРДН, ТРДЦН и ТРДНС',173:'Трехобмоточные автотрансформаторы с РПН типа АТДТЦН и АОДТЦН; Двухобмоточные трансформаторы типа ТЦ и ТДЦ',174:'Трехобмоточные автотрансформаторы с РПН типа АТДТЦН и АОДТЦН',175:'Трехобмоточные трехфазные трансформаторы с РПН; Двухобмоточные однофазные трансформаторы с РПН',176:'Шунтирующие реакторы; Шунтирующие реакторы. Однофазные',177:'Шунтирующие реакторы. Трехфазные; Управляемые шунтирующие реакторы. Трехфазное исполнение электромагнитной части',178:'Опросный лист на изготовление трансформатора типа ТДНС',179:'Опросный лист ТДНС, продолжение',180:'Опросный лист на изготовление трансформатора типа ТМ',181:'Опросный лист ТМ, продолжение',182:'Опросный лист на изготовление трансформатора типа ТМН',183:'Опросный лист ТМН, продолжение',184:'Опросный лист на изготовление трансформатора типа ТМГ',185:'Опросный лист на изготовление трансформатора типа ТСЛ',186:'Миссия Alageum Electric; Саидулла Кожабаев',187:'Blank final page'}
drawingonly={104,107,108,110,114,115,116,118,122,123,126,127,130,131,132,133,136,137,138,139,141,143,146,147,148,150,153,156,158,160,163,164}
tableanddrawing={102,112,120,121,125,152,155}
for p in range(102,188):
 relevant=[r for r in models+configurations if p in r['sourcePages']]
 fs=[f for f in families if p in f['sourcePages']]
 kind='drawing' if p in drawingonly else ('table-and-drawing' if p in tableanddrawing else 'technical-specification')
 if p in [111]:kind='product-description'
 if p==165:kind='section-cover-photograph'
 if p==166:kind='manufacturer-profile'
 if 178<=p<=185:kind='blank-questionnaire'
 if p==186:kind='corporate-back-matter'
 if p==187:kind='blank-page'
 ledger.append({'pdfPage':p,'printedPage':None if p in [165,186,187] else (168 if p==166 else p),'heading':headings[p],'pageType':kind,'visualReview':'reviewed full page render; dense specification tables also reviewed individually enlarged','pageImage':f'/catalog-source/transformers-2026/page-{p:03}.webp','familyIds':[f['id'] for f in fs],'namedSeries':sorted(set(s for f in fs for s in f['series'])),'modelIds':[r['id'] for r in relevant if r['recordType']=='model'],'configurationIds':[r['id'] for r in relevant if r['recordType']=='configuration'],'explicitTableModelDesignations':[r['designation'] for r in relevant if r['sourceRow']['pdfPage']==p],'specificationFieldsTranscribed':sum(1 for r in relevant for s in r['technicalSpecs'] if s['page']==p),'dimensionalDrawingEvidence':p in drawingonly or p in tableanddrawing,'photographEvidence':p in [165,166,186],'assetFamilyIds':[a['id'] for a in assets if p in a['evidencePages']],'notes':(['Footer prints 168 although physical PDF page is 166. Manufacturer introduction, not a product row.'] if p==166 else (['Blank order questionnaire, not a product or new SKU.'] if 178<=p<=185 else []))})

# Source presentation anomalies retained without silently rewriting the source.
for r in models:
 if r['familyId'] in ['asia-autotransformer-330','asia-autotransformer-500']:
  r['uncertainties'].append('Section heading spells АТДТЦН / АОДТЦН while the model rows spell АТДЦТН / АОДЦТН. Record designation follows the explicit table row.')
 if r['sourceRow']['pdfPage'] in [102,103,105]:
  for sp in r['technicalSpecs']:
   if sp['label']=='Номинальная мощность':sp['valueBasis']='Power value parsed from explicit model designation; row label occupies the nominal-power column.'
 if r['familyId']=='tdns-35' and '40000' in r['designation']:
  r['sourceRow']['designation']='ТДНС-40000/35'
  r['sourceDesignations']=[{'page':120,'designation':'ТДНС-40000/35'},{'page':121,'designation':'ТДНС-40000/35 Cu-Cu'}]
for p in ledger:
 if p['pdfPage']==138:p['notes'].append('Heading includes 4000÷6300, but the following page provides a dedicated 6300 drawing. The 6300 model preferentially maps to page139; range heading on page138 is retained as secondary applicability evidence.')
 if p['pdfPage'] in [178,179]:p['namedSeries']=['ТДНС']
 if p['pdfPage'] in [180,181]:p['namedSeries']=['ТМ']
 if p['pdfPage'] in [182,183]:p['namedSeries']=['ТМН']
 if p['pdfPage']==184:p['namedSeries']=['ТМ','ТМГ']
 if p['pdfPage']==185:p['namedSeries']=['ТСЛ','ТСЗ']

old=json.load(open(BASE.parent.parent/'source-inventory/old-records.json'))
rejected=[]
for r in select('tmg-35'):
 p=next(s['value'] for s in r['technicalSpecs'] if s['label']=='Номинальная мощность')
 for o in old:
  if o.get('series')=='ТМГ' and str(o.get('power'))==p:
   rejected.append({'newId':r['id'],'newDesignation':r['designation'],'oldId':o['id'],'oldDesignation':o.get('sku'),'decision':'distinct-model-context','evidence':'New source specifies 35/0,4 кВ on page 105. Old reference specifies 6/10 → 0,4 кВ. Equal power and prefix do not establish identity.'})
notes=[
'All 86 physical PDF pages 102–187 inspected visually. Tables were manually transcribed from enlarged renders; OCR was not authoritative.',
'Physical page 166 is printed as 168; physical page 177 has reactors. Blank questionnaires start at page 178.',
'The manufacturer for physical pages 102–164 remains unknown within this assigned range. Generic Alageum branding is not factory evidence. The explicitly named Asia Trafo section begins on page 166.',
'List-valued nominal voltages and climate choices remain list-valued. No Cartesian expansion into SKUs. Explicit cooling-type designations are separate model records.',
'Repeated model designations on page 174 and separate winding-configuration rows on page 175 are retained as separate model variations with configurationLabel; their SKU text is not fabricated.',
'Page 176 gives 15 generic shunt-reactor rating configurations without model codes. They are configurations[], not invented models.',
'No accepted matches to old baseline. Four overlapping ТМГ power ratings are specifically rejected because new models are 35/0.4 kV while old official references are 6/10 to 0.4 kV.',
'Source typos/contradictions are preserved. Examples: ТМГ-25 Pk=0,61 under Вт; pages159/161 losses labeled Вт; page111 ТДТНШ /35 heading versus /110 prose; page174 НН 38,61; numerous Asia Trafo asterisk values.',
'Technical line drawings support family illustrations and parameter extraction, not an assertion of a supplied photograph or exact ready-made 3D asset. The high-voltage section contains no model-linked drawings, and page166 states dimensions/drawings supplied upon request.'
]
result={'source':{'title':'ALAGEUM transformer technical catalog','date':'2026-03-18','physicalPageRange':[102,187],'pageCountReviewed':86},'families':families,'models':models,'configurations':configurations,'notes':notes,'oldBaselineComparison':{'oldRecordCount':len(old),'acceptedMatches':[],'rejectedCandidatePairs':rejected},'counts':{'families':len(families),'models':len(models),'configurations':len(configurations),'assets':len(assets),'pages':len(ledger)}}
for name,obj in [('inventory.json',result),('page-ledger.json',ledger),('asset-families.json',assets)]:
 (BASE/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
(BASE/'notes.md').write_text('# Section 102–187 extraction\n\n'+ '\n\n'.join(notes)+'\n\n## Counts\n\n'+json.dumps(result['counts'],indent=2)+'\n\n## Scope and reliability\n\nThe inventory transcribes explicit source rows and contextual execution labels. Source drawings were inspected across the assigned pages. Electrical/specification tables received enlarged visual review. Remaining numeric drawing callouts have not all been transcribed; their source assets are linked. No drawing geometry is guessed, no rendering is presented as a validated engineering mesh, and no blank questionnaire is counted as a product.\n')
print(json.dumps(result['counts']));print('Rejected old pairs',len(rejected));print('Unique model ids',len(set(r['id'] for r in models)))
