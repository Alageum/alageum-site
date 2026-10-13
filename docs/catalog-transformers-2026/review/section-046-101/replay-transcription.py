import argparse,json,re,os
parser=argparse.ArgumentParser(description='Replay the reviewed section transcription with an explicit legacy inventory input.')
parser.add_argument('--old-records', required=True, help='Frozen 238-row legacy inventory JSON')
args=parser.parse_args()
from collections import defaultdict
ROOT=os.path.dirname(__file__)
I=[]; F={}; A={}; L={n:{'pdfPage':n,'printedPage':n if n not in [76,95,101] else None,'visualInspected':True,'render':f'pages/{n:03}.png','headings':[],'series':[],'productIds':[],'contentTypes':[],'notes':[]} for n in range(46,102)}
def spec(label,raw,unit,page):return {'label':label,'raw':str(raw),'unitAsPrinted':unit,'sourcePage':page}
def add(id,fid,name,pages,specs,asset=None,**kw):
 r={'id':'alageum-2026-'+id,'familyId':fid,'name':name,'sourceDesignation':name,'sku':None,'skuStatus':'No complete order SKU asserted; exact source designation retained.','manufacturer':None,'manufacturerStatus':'Not explicitly named on these product pages','brand':'Alageum electric','sourcePages':pages,'rawSpecs':specs,'assetFamilyIds':[asset] if asset else [],'recordType':'explicit-model-row','uncertainties':[],**kw};I.append(r)
 for p in pages:
  if p in L:L[p]['productIds'].append(r['id'])
 return r

def table_specs(vals,keys,page):return [spec(k[0],v,k[1],page) for k,v in zip(keys,vals)]
def asset(id,pages,description,reuse='shared-construction-parametric',notes=None):
 A[id]={'id':id,'evidencePages':pages,'evidenceType':'dimensioned-orthographic-drawing','description':description,'reusableType':reuse,'reuseConditions':['Use row-specific dimensions, terminals and electrical context; schematic construction is not proof of identical dimensions.'],'exclusions':notes or [],'productIds':[]}
def ledger(p,head,series,types,notes=[]):L[p].update(headings=[head] if head else [],series=series,contentTypes=types,notes=notes)
def rows(s):return [x.split() for x in s.strip().splitlines()]
EK=[('Pо','Вт'),('Pк','Вт'),('Uк','%'),('Iо','%'),('L',None),('B',None)]
DK=[('H',None),('A',None),('A1',None),('M',None),('K',None),('h',None),('h1',None),('Полная масса','кг'),('Масса масла','кг')]
asset('oil-tmg-twostage-small',[46],'ТМГ-25-630 с 2-х этажным переключателем: three views of compact corrugated hermetic tank, top bushings, switch, optional wheels.','shared-construction-parametric',['Product rows on preceding section44–45; no duplicate rows here.'])
asset('oil-tmg-twostage-large',[47],'ТМГ-1000-2500 с 2-х этажным переключателем: large corrugated tank, top terminal layout and wheels.','shared-construction-parametric',['Rows belong to preceding section.'])
ledger(46,'ТМГ-25-630 с 2-х этажным переключателем',['ТМГ'],['drawing','component-legend'],['Continuation of model table on pages44–45; no new model rows.'])
ledger(47,'ТМГ-1000-2500 с 2-х этажным переключателем',['ТМГ'],['drawing','component-legend'],['Continuation of model table on pages44–45; no new model rows.'])
asset('oil-isolating-tmg',[49],'Isolating ТМГ: corrugated rectangular tank, HV and LV top bushings, wheels; three views. Separate electrical family from distribution TMG.')
e=rows('''630 1100 8500 5,5 1,0 1485 862
1000 1500 12500 5,5 0,8 1644 1082
1250 1740 15000 6,0 0,6 1924 1144
1600 2350 18000 6,0 1,3 1940 1336
2000 2600 25000 6,0 0,5 2250 1300
2500 2800 28000 6,0 0,4 2247 1390
3200 3500 29500 6,0 0,4 2440 1500
4000 5000 33500 7,5 0,3 2520 1540
4500 5600 39500 7,5 0,3 2610 1540''')
d=rows('''1570 660 660 230 230 150 150 1850 413
1605 820 820 230 230 180 180 2550 520
1780 820 820 230 230 180 150 3020 645
1890 1070 1070 250 250 180 180 3755 865
2020 1070 1070 230 230 220 220 4980 1215
1995 1070 1070 260 260 220 220 5270 1140
2190 1070 1070 250 250 240 240 6990 1760
2250 1070 1070 240 300 230 285 8200 1805
2250 1070 1070 240 300 240 285 8560 1860''')
for j,(er,dr) in enumerate(zip(e,d)):
 p=er[0];add('isolating-tmg-'+p,'isolating-tmg','ТМГ-'+p,[48,49],table_specs(er[1:],EK,48)+table_specs(dr,DK,48 if j<3 else 49)+[spec('Номинальная мощность',p,'кВА',48),spec('Номинальное напряжение ВН','6-10','кВ',48),spec('Группа соединения обмоток','У/Д-11; Д/У-11',None,48)],'oil-isolating-tmg',series='ТМГ',context='Разделительные',powerKva=int(p),voltageRaw='ВН 6-10 кВ; НН не указан')
ledger(48,'Разделительные',['ТМГ'],['purpose','electrical-table','dimension-table'],['9 explicit rows630–4500; dimensions continue49. Dimensions L/B/H etc have no printed unit in table.'])
ledger(49,'Разделительные',['ТМГ'],['dimension-table-continuation','drawing','component-legend'])
asset('oil-tm-20kv-small',[52],'ТМ-100-40020кВ: rectangular corrugated tank and horizontal cylindrical conservator; top bushings and optional wheels, three views.')
asset('oil-tm-20kv-large',[53],'ТМ-630-2500 20кВ: larger corrugated tank, overhead conservator, top bushings, breather and wheels; three views.')
e=rows('''100 330 1620 6,5 1,5 1365 827
160 540 2600 6,5 1,4 1369 788
250 720 3600 6,5 1,2 1545 852
400 800 5400 6,5 0,6 1585 920
630 1150 7350 6,5 0,4 1667 962
1000 1500 11100 6,5 0,3 2039 1256
1250 1780 12700 6,5 0,25 2150 1220
1600 2000 16000 6,5 0,2 2159 1204
2000 2500 23000 6,5 0,35 2200 1322
2500 3200 26000 6,5 0,3 2326 1378''')
d=rows('''1390 550 550 90 260 150 150 789 261
1313 550 550 90 260 150 150 930 297
1567 550 550 110 280 160 160 1200 347
1688 660 660 150 280 160 180 1678 473
1858 660 660 150 280 180 180 2238 600
2204 820 820 190 280 200 190 3371 951
2234 820 820 200 280 200 195 3687 932
2372 1070 1070 210 280 205 200 4310 1083
2382 1070 1070 220 280 220 205 4915 1250
2565 1070 1070 145 280 230 220 5865 1474''')
for j,(er,dr) in enumerate(zip(e,d)):
 p=er[0];ap=52 if int(p)<=400 else 53;add('tm-20kv-'+p,'tm-20kv','ТМ-'+p,[50,51,ap],table_specs(er[1:],EK[:4]+[('L','мм'),('B','мм')],50)+table_specs(dr,[('H','мм')]+DK[1:],50 if j==0 else 51)+[spec('Номинальная мощность',p,'кВА',50),spec('Номинальное напряжение','20/0,4','кВ',50),spec('Группа соединения обмоток','У/Ун-0; Д/Ун-11',None,50)],'oil-tm-20kv-small' if ap==52 else 'oil-tm-20kv-large',series='ТМ',context='20 кВ',powerKva=int(p),voltageRaw='20/0,4 кВ')
ledger(50,'Трансформаторы ТМ-100-2500 кВА напряжением20кВ',['ТМ'],['purpose','electrical-table','dimension-table'],['Text says range40–2500 but explicit rows100–2500 only; do not manufacture TM40.'])
ledger(51,'Трансформаторы ТМГ-25-63 кВА напряжением20кВ с медными обмотками',['ТМ','ТМГ'],['dimension-table-continuation','purpose','electrical-table','dimension-table'])
ledger(52,'ТМ-100-400',['ТМ'],['drawing','component-legend']);ledger(53,'ТМ-630-2500',['ТМ'],['drawing','component-legend'])
asset('oil-tmg-20kv-small',[56],'ТМГ-25-630: compact corrugated hermetic rectangular tank, top bushings, oil tube, wheels, three views.')
asset('oil-tmg-20kv-large',[57],'ТМГ-1000-2500: larger corrugated hermetic tank, top bushings and terminal layout, wheels, three views.')
for er,dr in zip(rows('''25 180 700 6,0 3,2 964 674
40 190 770 6,0 3,0 996 680
63 280 1470 6,5 2,3 1015 705'''),rows('''1073 550 550 90 250 115 135 370 120
1129 550 550 90 250 115 145 480 150
1080 550 550 90 260 115 145 555 175''')):
 p=er[0];add('tmg-20kv-copper-'+p,'tmg-20kv-copper','ТМГ-'+p,[51,56],table_specs(er[1:],EK[:4]+[('L','мм'),('B','мм')],51)+table_specs(dr,[('H','мм')]+DK[1:],51)+[spec('Номинальная мощность',p,'кВА',51),spec('Номинальное напряжение','20/0,4','кВ',51),spec('Группа соединения обмоток','У/Ун-0' if p=='25' else 'У/Ун-0; Д/Ун-11',None,51),spec('Обмотки','медные',None,51)],'oil-tmg-20kv-small',series='ТМГ',context='20кВ, с медными обмотками',powerKva=int(p),voltageRaw='20/0,4 кВ')
e=rows('''100 330 1620 6,5 1,5 1192 820
160 540 2600 6,5 1,4 1216 788
250 720 3600 6,5 1,2 1402 852
400 800 5400 6,5 0,6 1563 920
630 1150 7350 6,5 0,4 1632 962
1000 1500 11100 6,5 0,3 1703 1080
1250 1780 12700 6,5 0,4 1850 1114
1600 2000 16000 6,5 0,4 1922 1242
2000 2500 23000 6,5 0,35 2108 1322
2500 3200 26000 6,5 0,3 2181 1398''')
d=rows('''1272 550 550 90 260 150 150 760 244
1272 550 550 90 260 150 150 880 265
1418 550 550 110 280 160 160 1165 325
1538 660 660 150 280 160 180 1640 447
1680 660 660 150 280 180 180 2185 565
1790 820 820 190 280 200 190 3200 810
1835 820 820 200 280 200 195 3520 850
1902 1070 1070 210 280 205 200 3990 920
2015 1070 1070 220 280 220 205 4400 1080
2060 1070 1070 145 280 230 220 5550 1350''')
for er,dr in zip(e,d):
 p=er[0];ap=56 if int(p)<=630 else 57;add('tmg-20kv-'+p,'tmg-20kv','ТМГ-'+p,[54,55,ap],table_specs(er[1:],EK[:4]+[('L','мм'),('B','мм')],54)+table_specs(dr,[('H','мм')]+DK[1:],55)+[spec('Номинальная мощность',p,'кВА',54),spec('Номинальное напряжение','20/0,4','кВ',54),spec('Группа соединения обмоток','У/Ун-0; Д/Ун-11',None,54)],'oil-tmg-20kv-small' if ap==56 else 'oil-tmg-20kv-large',series='ТМГ',context='20кВ',powerKva=int(p),voltageRaw='20/0,4 кВ')
ledger(54,'Трансформаторы ТМГ-100-2500 кВА напряжением20кВ',['ТМГ'],['purpose','electrical-table']);ledger(55,None,['ТМГ'],['dimension-table-continuation']);ledger(56,'ТМГ-25-630',['ТМГ'],['drawing','component-legend']);ledger(57,'ТМГ-1000-2500',['ТМГ'],['drawing','component-legend'])
asset('oil-tmgsu',[59],'ТМГСУ-63-250: compact corrugated tank, top bushings, oil tube and optional wheels; three views. Distinct balancing-device series.')
for er,dr in zip(rows('''63 220 1470 4,5 2,6 990 620
100 290 2270 4,5 2,2 1015 730
160 460 3100 5,0 1,9 1134 762
250 610 4200 4,5 1,9 1175 856'''),rows('''890 450 400 90 190 85 110 440 110
1005 550 550 90 190 95 110 534 130
1080 550 550 90 190 115 120 756 180
1145 550 550 110 230 110 115 1038 200''')):
 p=er[0];add('tmgsu-'+p,'tmgsu','ТМГСУ-'+p,[58,59],table_specs(er[1:],EK,58)+table_specs(dr,DK,58)+[spec('Номинальная мощность',p,'кВА',58),spec('Номинальное напряжение','6(10)/0,4','кВ',58),spec('Группа соединения обмоток','У/Ун-0',None,58)],'oil-tmgsu',series='ТМГСУ',context='с симметрирующим устройством',powerKva=int(p),voltageRaw='6(10)/0,4 кВ')
ledger(58,'Трансформаторы ТМГСУ-63-250кВА с симметрирующим устройством',['ТМГСУ'],['purpose','electrical-table','dimension-table']);ledger(59,'ТМГСУ-63-250',['ТМГСУ'],['drawing','component-legend'])
asset('oil-tmeg',[61],'ТМЭГ-40-250: corrugated tank, top bushings under protective hood, oil tube and wheels; three views. Hood is critical difference from regular TMG.')
for er,dr in zip(rows('''40 160 1000 4,5 2,8 880 515
63 210 1470 4,5 2,6 1128 530
100 280 2270 4,5 2,2 1154 682
160 450 2600 5,0 1,9 1190 692
250 610 4200 4,5 1,9 1322 786'''),rows('''1090 450 400 105 190 75 95 325 79
1040 450 400 90 190 85 110 380 85
1190 550 550 90 190 95 110 465 100
1177 550 550 90 190 115 120 660 145
1281 550 550 110 230 110 115 885 158''')):
 p=er[0];add('tmeg-'+p,'tmeg','ТМЭГ-'+p,[60,61],table_specs(er[1:],EK,60)+table_specs(dr,DK,60)+[spec('Номинальная мощность',p,'кВА',60),spec('Номинальное напряжение','6(6,3)','кВ',60),spec('Группа соединения обмоток','У/Ун-0',None,60)],'oil-tmeg',series='ТМЭГ',context='для питания электрооборудования экскаваторов',powerKva=int(p),voltageRaw='6(6,3) кВ; НН не указан')
ledger(60,'Трансформаторы ТМЭГ-40-250кВА (для питания электрооборудования экскаваторов)',['ТМЭГ'],['purpose','electrical-table','dimension-table']);ledger(61,'ТМЭГ-40-250',['ТМЭГ'],['drawing','component-legend'])
asset('oil-tmpn-top',[66],'ТМПН(Г)-25-665 drawing: tall corrugated tank, top terminals under hood, channel base, three views. Header25–665 differs from data section63–665; no25kVA model generated.')
asset('oil-tmpng-side',[67],'ТМПНГ(с боковыми выводами)-100-630: corrugated tank with prominent side terminal box, three views; not reusable with top-terminal hood variant.')
taps={
'921':'1143-1106-1069-1032-995-958-921-884-847-810-773-736-699-662-625-588-551-514-477-440',
'1250':'1690-1646-1602-1558-1514-1470-1426-1382-1338-1294-1250-1206-1162-1118-1074-1030-986-942-898-854-810-766-722-678-634',
'1900':'2136-2077-2018-1959-1900-1841-1782-1723-1664-1605-1546-1487-1428-1369-1310-1251-1192-1133-1074-1015-956-897-838-779-720',
'1902':'2402-2362-2316-2270-2224-2178-2132-2086-2040-1994-1948-1902-1856-1810-1764-1718-1672-1626-1580-1534-1488-1442-1396-1350-1304',
'2247':'2947-2897-2847-2797-2747-2697-2647-2597-2547-2497-2447-2397-2347-2297-2247-2197-2147-2097-2047-1997-1947-1897-1847-1797-1747',
'2005':'3100-3025-2945-2865-2790-2710-2630-2555-2475-2395-2320-2240-2165-2085-2005-1930-1850-1770-1695-1615-1535-1460-1380-1300-1225',
'3002':'3838-3762-3686-3610-3534-3458-3382-3306-3230-3154-3078-3002-2926-2850-2774-2698-2622-2546-2470-2394-2318-2242-2166-2090-2014',
'2998':'4510-4438-4366-4294-4222-4150-4078-4006-3934-3862-3790-3718-3646-3574-3502-3430-3358-3286-3214-3142-3070-2998-2926-2854-2782-2710-2638-2566-2494-2422-2350-2278-2206-2134-2062-1990',
'2810top':'3810-3700-3850-3490-3380-3240-3130-3020-2920-2810-2670-2560-2450-2350-2240-2100-1990-1890-1780-1670-1540-1430-1320-1210-1100',
'1360':'3596-3476-3346-3225-3096-2975-2855-2725-2604-2475-2354-2234-2104-1983-1854-1733-1613-1483-1362-1233-1112-992-862-742-612',
'2000':'3101-3028-2942-2868-2795-2709-2636-2550-2476-2403-2317-2243-2157-2084-2010-1925-1851-1765-1692-1618-1532-1459-1373-1299-1226',
'2810side':'3819-3705-3591-3477-3363-3268-3154-3040-2926-2812-2698-2584-2470-2356-2242-2128-2014-1900-1786-1672-1558-1444-1330-1216-1102'}
PK=[('Pо','Вт'),('Pк','Вт'),('Iо','%'),('Uк','%'),('L','мм'),('B','мм'),('H','мм'),('Полная масса','кг'),('Масса масла','кг')]
base=rows('''ТМПН-63/1 921 0,22 1,28 2,2 5,5 1090 552 1420 455 115
ТМПН-100/3 1250 0,29 1,97 5,5 5,5 1220 800 1400 630 204
ТМПН-160/3 1250 0,45 3,1 1,2 5,5 1350 905 1600 1020 300
ТМПН-160/3 1900 0,45 3,1 1,2 5,5 1350 905 1520 1076 319
ТМПН-160/3 1902 0,45 3,1 1,2 5,5 1350 905 1520 1079 319
ТМПН-250/3 2247 0,55 4,2 0,6 5,5 1394 996 1745 1375 370
ТМПН-250/3 2005 0,65 4,3 0,6 5,5 1394 996 1745 1320 370
ТМПНГ-100/3 1250 0,29 1,97 1,5 5,5 1000 800 1450 635 204''')
more=rows('''ТМПНГ-160/3 1900 0,45 3,1 1,2 5,5 1230 950 1395 1130 350
ТМПНГ-160/3 1902 0,45 3,1 1,2 5,5 1230 950 1395 1130 350
ТМПНГ-250/3 2247 0,54 4,2 0,6 5,5 1300 950 1530 1375 370
ТМПНГ-436/6 3002 0,8 6,8 0,6 7,0 1480 1385 1690 1980 610
ТМПНГ-426/6 2998 0,85 6,8 0,6 7,0 1335 1378 1724 2080 670
ТМПНГ-665/3 2810top 0,9 9,5 0,6 7,0 1845 1500 1770 2690 765
ТМПНГ-100/3 1250 0,35 2,9 1,5 5,5 1060 965 1125 680 440
ТМПНГ-160/3 1360 0,41 3,6 2,0 5,5 1270 1025 1135 1020 350
ТМПНГ-250/3 2000 0,65 4,1 1,9 7,0 1560 1135 1175 1240 400
ТМПНГ-630/3 2810side 1,1 9,4 1,6 7,0 1974 1355 1253 2145 600''')
for start,data in [(62,base),(64,more)]:
 for j,row in enumerate(data):
  n,v,*vals=row;side=start==64 and j>=6;vp=65 if start==64 and j>=8 else start;dimpage=63 if start==62 else 65;ar=67 if side else 66
  group='Ун/Д-11' if n=='ТМПНГ-426/6' else ('Ун/Ун-0' if start==64 and j>=3 else 'Ун/У-0')
  r=add(f'tmpn-p{start}-r{j+1}','tmpng-side' if side else 'tmpn-top',n+(' (боковой вывод)' if side else ''),sorted(set([vp,dimpage,ar])),table_specs(vals,PK,dimpage)+[spec('Количество ступеней регулирования','20' if n=='ТМПН-63/1' else '36' if n=='ТМПНГ-426/6' else '25',None,vp),spec('Номинальное напряжение НН','380','В',vp),spec('Номинальное напряжение ВН',v.replace('top','').replace('side',''),'В',vp),spec('Схема соединения',group,None,vp),spec('Напряжение ступеней регулирования',taps[v],'В',vp)],'oil-tmpng-side' if side else 'oil-tmpn-top',series=n.split('-')[0],context='боковой вывод' if side else 'верхние выводы по чертежу66',sourceRow={'page':vp,'table':'technical','row':j+1},powerKva=int(n.split('-')[1].split('/')[0]),voltageRaw='380/'+v.replace('top','').replace('side','')+' В')
  r['uncertainties'].append('Loss header literally says Вт although decimal magnitudes may indicate a source unit error; not converted.')
  if v=='2810top':r['uncertainties'].append('Tap list literally starts3810-3700-3850 and is nonmonotonic; preserved, not corrected.')
ledger(62,'Трансформаторы ТМПН(Г)-63-665кВА',['ТМПН','ТМПНГ'],['purpose','electrical-table'],['8 rows; repeated ТМПН-160/3 and250/3 are distinct nominal-voltage variants.'])
ledger(63,None,['ТМПН','ТМПНГ'],['electrical-table-continuation','dimension-table'],['Loss unit printed Вт but values0,22 etc retained.'])
ledger(64,'Трансформаторы ТМПН(Г)-63-665кВА',['ТМПНГ'],['purpose','electrical-table'],['8 rows plus2 continued65; 436/6 and426/6 explicitly distinct. Text range100–630 does not erase665 row.'])
ledger(65,None,['ТМПНГ'],['electrical-table-continuation','dimension-table']);ledger(66,'ТМПН(Г)-25-665',['ТМПН','ТМПНГ'],['drawing','component-legend'],['25 lower bound only in drawing heading; no25model table row.']);ledger(67,'ТМПНГ(с боковыми выводами)-100-630',['ТМПНГ'],['drawing','component-legend'])
for p,mod,io,mass,oil in [(68,False,'2,3','425','155'),(70,True,'3,2','365','125')]:
 aid='oil-tmto-modern' if mod else 'oil-tmto-three-winding';asset(aid,[p+1],'ТМТО-80 '+('modern two-winding version; flat steel tank, top terminals, height995,length890,width490,base500x400 as dimensioned.' if mod else 'three-winding version; flat steel tank, top terminals, height1060,length910,width500,base500x400 as dimensioned.'),'model-specific')
 r=add('tmto80-modern' if mod else 'tmto80-original','tmto-modern' if mod else 'tmto-original','ТМТО-80',[p,p+1],[spec('Designation in purpose','ТМТО-80/0,38-У1',None,p),spec('Обмотки','двухобмоточный' if mod else 'трехобмоточный',None,p),spec('Номинальное напряжение ВН','380','В',p),spec('Номинальный ток ВН','121,5','А',p),spec('Мощность/положение/напряжение ответвлений','77,5/V/95;69,34/IV/85;61,18/III/75;58,54/II/65;49,53/I/55','кВА / — / В',p),spec('Потери Х.Х','270','Вт',p),spec('Потери К.З','2200','Вт',p),spec('Ток холостого хода',io,'%',p),spec('Схема и группа соединения','У/Д-11' if mod else 'У/Д/Д-11/11',None,p),spec('Масса масла',oil,'кг',p),spec('Масса полная',mass,'кг',p)],aid,series='ТМТО',context='модернизированный' if mod else 'трехобмоточный',powerKva=80,voltageRaw='ВН380В; ответвления95/85/75/65/55В')
 if not mod:r['rawSpecs'] += [spec('Номинальный ток СН','471 (V–III);520 (II–I)','А',p),spec('Номинальная мощность НН','25','кВА',p),spec('Номинальное напряжение НН','42','В',p),spec('Номинальный ток НН','34,4','А',p)];r['uncertainties'].append('Source states25кВА,42В,34,4А for tertiary; retain incompatible-looking combination.')
 ledger(p,'Трансформатор типа ТМТО-80кВА'+(' (модернизированный)' if mod else ''),['ТМТО'],['purpose','electrical-table','mass-table']);ledger(p+1,'ТМТО-80кВА'+(' (модернизированный)' if mod else ''),['ТМТО'],['drawing','component-legend'])
asset('oil-omp',[74],'ОМП-4-10: rectangular tank with side HV bushings, cover LV connections; dimensioned views show580h,630overall horizontal,520tankwidth,270x350base. Source73 dimensions differ; keep conflict.','shared-construction-representative')
asset('oil-om',[75],'ОМ-0,63-2,5: cylindrical tank, top HV bushing, small LV bushing, pole-mount bracket; three views and small dimensional table.','shared-construction-parametric')
for vals in rows('''ОМ-0,63 0,63 27 17 45 6,0 40 470 327 630 40
ОМ-1,25 1,25 14 20 67 5,0 53 470 327 630 44
ОМ-2,5 2,5 15 28 87 4,5 87 510 440 650 61
ОМП-4 4 10 39 165 4,7 112 520 654 550 98
ОМП-10 10 6,0 70 318 3,5 116 520 654 580 105'''):
 n,p,io,po,pk,uk,m1,ll,b,h,m2=vals;omp=n.startswith('ОМП');a='oil-omp' if omp else 'oil-om';r=add('om-'+p.replace(',','p')+('-p' if omp else ''),'omp' if omp else 'om',n,[72,73,74 if omp else 75],[spec('Номинальная мощность',p,'кВА',72),spec('ВН options','6;10','кВ',72),spec('НН options','0,23;0,4' if omp else '0,23','кВ',72),spec('Напряжение ступеней регулирования при6кВ','6,3-6,0-5,7-5,4' if omp else '6,3-6,0-5,7','кВ',72),spec('Напряжение ступеней регулирования при10кВ','10,5-10,0-9,5-9,0' if omp else '10,5-10-9,5','кВ',72),spec('Схема и группа соединения','1/1-0',None,72),spec('Ток х.х',io,'%',72),spec('Потери Х.Х',po,'Вт',72),spec('Потери К.З',pk,'Вт',72),spec('Напряжение к.з',uk,'%',73),spec('Полная масса (first printed column)',m1,'кг',73),spec('L',ll,'мм',73),spec('B',b,'мм',73),spec('H',h,'мм',73),spec('Полная масса (last printed column)',m2,'кг',73)],a,series='ОМП' if omp else 'ОМ',context='однофазный масляный',powerKva=float(p.replace(',','.')),voltageRaw='6 или10 / '+('0,23 или0,4' if omp else '0,23')+' кВ')
 r['uncertainties'].append('Page73 prints two different columns both labeled Полная масса, кг. Neither is silently relabeled oil mass; drawings74/75 also differ from table dimensions.')
ledger(72,'Однофазный трансформатор типа ОМ(П)',['ОМ','ОМП'],['purpose','electrical-table'],['5 named models;6/10kV and selectable secondary values retained as configurations, not invented full SKUs.']);ledger(73,None,['ОМ','ОМП'],['dimension-table','mass-table'],['Duplicate Полная масса header with differing numbers.']);ledger(74,'ОМП-4-10',['ОМП'],['drawing','component-legend']);ledger(75,'ОМ-0,63-2,5',['ОМ'],['drawing','dimension-table','component-legend']);ledger(76,'СУХИЕ ТРАНСФОРМАТОРЫ6-35кВ',[],['section-divider','factory-photo'],['No named product/model attribution for factory photo.'])
asset('dry-tsl-open-6-10',[80],'ТСЛ IP00: open three cast coils and laminated core, upper/lower clamping beams, wheel base; three orthographic views plus size-specific LV busbar layouts. Do not reuse enclosure geometry.')
asset('dry-tslz-enclosed-6-10',[81],'ТСЛЗ IP21/IP31: rectangular wheeled enclosure with mesh upper/lower vents, side terminal opening; front/side plus size-specific terminal drawings.','shared-construction-parametric',['Exact IP31 punctuation in heading is printed IP31,); no geometry equivalence implied between different enclosure/IP options.'])
asset('dry-tsl-open-20',[84],'ТСЛ20кВ IP00: open three cast coils and core, clamping beams/wheel base; three views and size-specific LV busbar layouts. Keep separate electrical/dimensional family from6–10kV.')
DC=[('L','мм'),('B','мм'),('H','мм'),('МО','мм'),('h','мм'),('h1','мм'),('c','мм'),('l','мм'),('b','мм'),('Масса','кг')]
DE=[('Pо','кВт'),('Pк','кВт'),('Iо','%'),('Uк','%')]
std=rows('''25 190 700 2 4
40 200 850 2 4,5
63 300 1400 1,8 6,5
100 550 1800 1,8 4
160 600 2700 1,4 4,5
250 800 3200 1,2 4,0
400 1150 4400 0,8 4,0
630 1500 6500 0,7 6,0
1000 2000 9400 0,5 6,0
1250 2400 11500 0,5 6,0
1600 2800 13500 0,5 6,0
2000 3500 16500 0,4 6,0
2500 3800 20000 0,4 6,0
3150 4500 24500 0,4 7,0
4000 5500 34500 0,4 8,0''')
# Raw slash pairs retained; no assumption about a universally defined pair order.
dims=rows('''25 815/1100 550/770 915/1310 280 595 - - 500 400 325/470
40 825/1100 550/770 925/1320 280 605 - - 500 400 375/490
63 980/1185 670/780 985/1340 330 712 - - - 520 425/560
100 1060/1200 670/785 1166/1521 350 850 - - - 520 616/720
160 1125/1315 670/795 1170/1525 385 1170 - - - 520 780/940
250 1212/1525 730/855 1215/1554 405 905 1270 110 550 550 1030/1200
400 1352/1740 850/910 1360/1590 450 1005 1390 110 670 670 1470/1790
630 1472/1870 850/925 1340/1700 495 970 1405 110 670 670 1685/1955
1000 1627/1955 1000/1015 1615/1980 550 1170 1685 130 820 820 2560/2840
1250 1692/1960 1000/1015 1756/2135 565 1305 1835 130 820 820 2910/3180
1600 1732/2085 1000/1015 1920/2450 575 1455 1975 130 820 820 3520/3765
2000 1816/2120 1250/1265 2020/2385 610 1530 2100 155 1070 1070 4215/4685
2500 1916/2302 1250/1270 2230/2565 635 1676 2255 155 1070 1070 5055/5560
3150 2096/2360 1250/1262 2275/2565 690 1690 2255 155 1070 1070 5685/6015
4000 2156/2460 1250/1262 2275/2575 720 1695 2270 155 1070 1070 6370/7280''')
dmap={x[0]:x[1:] for x in dims}
energy=rows('''63 210 1280 1,8 6,5
100 350 1970 1,8 4
160 400 2700 1,4 4,5
250 540 3700 1,2 4,0
400 750 4250 0,8 4,0
630 1050 7600 0,7 6,0
1000 1550 10500 0,5 6,0
1250 1850 13250 0,5 6,0
1600 2370 13450 0,5 6,0
2000 2800 16250 0,4 6,0
2500 3300 20000 0,4 6,0''')
eweights={'100':'685/789','160':'890/1050','250':'1115/1285','400':'1550/1870','630':'1785/2055','1000':'2750/3030','1250':'3030/3300','1600':'3815/4060','2000':'4560/5030','2500':'5465/5970'}
for level,data,pg in [('C',std,77),('A',energy,79)]:
 for er in data:
  p=er[0];power=int(p);sp=table_specs(er[1:],DE,pg)+[spec('Номинальная мощность',p,'кВА',pg),spec('ВН','6-10','кВ',pg),spec('НН','0,23;0,4;0,69;0,72','кВ',pg),spec('Схема и группа соединения','У/Ун-0;Д/Ун-11;У/Zн-11' if power<=250 else 'У/Ун-0;Д/Ун-11' if power<=1250 else 'Д/Ун-11',None,pg)]
  if level=='C':sp+=table_specs(dmap[p],DC,78)
  elif p in eweights:
   ds=list(dmap[p]);ds[-1]=eweights[p];sp+=table_specs(ds,DC,79)
  r=add(f'tsl-{level.lower()}-{p}','tsl-loss-'+level,'ТСЛ(З)-'+p,[77,78,80,81] if level=='C' else [78,79,80,81],sp,'dry-tsl-open-6-10',series='ТСЛ(З)',context='с уровнем потерь '+('С (стандарный)' if level=='C' else 'А (энергоэффективный)'),powerKva=power,voltageRaw='6-10 / 0,23;0,4;0,69;0,72 кВ',explicitExecutions=['ТСЛ без кожуха (IP00)','ТСЛЗ с кожухом (IP21, IP31)'])
  r['assetFamilyIds'].append('dry-tslz-enclosed-6-10');r['uncertainties']=['Loss unit printed кВт with magnitudes190 etc; retained without silently converting to watts.','Dimension slash-pairs retained verbatim; likely open/enclosed order from headings, but pair mapping not explicitly labeled in table.','Merged l/b cells show a single value spanning columns; repeated in extraction only as shared cell, not two independent measurements.']
  if level=='A' and p=='63':r['uncertainties'].append('Energy-efficient63 has electrical row but no dimensional row on79; standard-class dimensions not substituted.')
ledger(77,'ТСЛ(З)-25-4000кВА с уровнем потерь С (стандарный)',['ТСЛ','ТСЛЗ'],['purpose','electrical-table'],['15model rows; title spelling стандарный preserved; loss units printed кВт.'])
ledger(78,'ТСЛ(З)-25-4000кВА с уровнем потерь А (энергоэффективный)',['ТСЛ','ТСЛЗ'],['dimension-table','purpose'],['Top table belongs to standard class C preceding77; lower heading starts A. Heading range25–4000 not expanded: A electrical rows only63–2500 on79.'])
ledger(79,None,['ТСЛ','ТСЛЗ'],['electrical-table','dimension-table'],['11A electrical rows63–2500;10dimension rows100–2500.']);ledger(80,'Чертеж трансформатора без кожуха ТСЛ (IP00)',['ТСЛ'],['drawing','busbar-details']);ledger(81,'Чертеж трансформатора с кожухом ТСЛЗ (IP21, IP31,)',['ТСЛЗ'],['drawing','busbar-details'])
e20=rows('''100 600 1900 2 6
160 650 2700 2 6
250 1050 3600 0,6 6
400 1500 4500 0,8 6
630 1900 6000 0,8 6
1000 2800 8500 0,4 6
1250 3000 11000 0,4 6
1600 3400 12500 0,4 6
2000 4000 15000 0,4 6
2500 5000 20000 0,4 6
3150 5000 25000 0,4 7
4000 5800 35500 0,4 8''')
d20=rows('''435 1260 670 1226 865 760
445 1280 670 1265 865 940
510 1502 730 1265 880 1250
515 1532 850 1450 1055 1650
590 1732 850 1460 1035 2330
625 1842 1000 1670 1200 3130
620 1827 1000 1820 1335 3380
637 1876 1000 2005 1500 3975
656 1936 1250 2105 1575 4630
670 1976 1250 2295 1720 5525
710 2096 1250 2290 1725 5940
780 2306 1250 2390 1740 7240''')
for er,dr in zip(e20,d20):
 p=er[0];r=add('tsl-20kv-'+p,'tsl-20kv','ТСЛ-'+p,[82,83,84],table_specs(er[1:],DE,82)+table_specs(dr,[('МО','мм'),('L','мм'),('B','мм'),('H','мм'),('h','мм'),('Масса','кг')],83)+[spec('Номинальная мощность',p,'кВА',82),spec('ВН','20','кВ',82),spec('НН','0,4','кВ',82),spec('Схема и группа соединения','Д/Ун-11',None,82)],'dry-tsl-open-20',series='ТСЛ',context='класса напряжения20кВ',powerKva=int(p),voltageRaw='20/0,4 кВ');r['uncertainties']=['Loss unit printed кВт with magnitudes600 etc; preserve source.','Purpose mentions ТСЛЗ enclosure option, but explicit table rows/dimensions name ТСЛ and drawing84 is IP00; do not apply these dimensions to enclosure.']
ledger(82,'Трансформаторы типа ТСЛ-100-4000кВА класса напряжения20кВ',['ТСЛ','ТСЛЗ'],['purpose','electrical-table']);ledger(83,'Условное обозначение сухих трансформаторов типа ТСЛ(З)-6,10,20кВ',['ТСЛ','ТСЛЗ'],['dimension-table','designation-key']);ledger(84,'Чертеж трансформатора без кожуха ТСЛ-20кВ (IP00)',['ТСЛ'],['drawing','busbar-details'])
# Named components are accessory records, never standalone transformer SKUs.
for id,n,page,sp in [
 ('relay-tr100','Цифровое температурное реле ТР-100',85,[spec('Питание','24–255','В',85),spec('Число датчиков','3 или4',None,85)]),
 ('sensor-pt100','Датчики сопротивления pt-100',85,[spec('Номинальное сопротивление','100','Ом',85),spec('При температуре','0','°C',85)]),
 ('damper-ek290','Виброопора ЕК-290',85,[spec('Допустимая нагрузка на один амортизатор','10','кН',85),spec('Число опор на трансформатор','4',None,85),spec('Уменьшение уровня вибрации','не менее20','dB',85),spec('Цвет','RAL7000',None,85)]),
 ('thermal-cabinet','Шкаф тепловой защиты (ШТЗ)',86,[spec('Контроль','реле ТР-100 с датчиками',None,86)]),
 ('cooling-fans','Вентиляторы для охлаждения обмоток',86,[spec('Количество','от2-х до6-ти',None,86),spec('Увеличение мощности трансформатора','до25','%',86)])]:
 aid='accessory-'+id;asset(aid,[page],n+' product photograph only; no dimensioned reconstruction evidence.','photo-reference-only');A[aid]['evidenceType']='photograph';add(id,'dry-accessories',n,[page],sp,aid,recordType='accessory' if id!='cooling-fans' else 'accessory-configuration-range',context='standard' if page==85 and id in ['relay-tr100','sensor-pt100'] else 'optional',series=n)
ledger(85,'Комплектность/Дополнительное оснащение трансформатора типа ТСЛ(З)-6,10,20кВ',['ТР-100','pt-100','ЕК-290'],['accessories','product-photos']);ledger(86,'ШТЗ; Вентиляторы; Трансформаторы серии ТС(З)',['ШТЗ','ТС','ТСЗ'],['accessories','product-photos','purpose','electrical-table'])
asset('dry-ts-open',[88],'ТС open dry core-and-three-coil construction with clamping beams and mounting base; three views and HV/LV bus arrangement with54±1 and45±1 spacings.')
asset('dry-tsz-enclosed',[87],'ТСЗ compact ventilated rectangular enclosure with lifting eyes, side terminal area and base; three views.')
for j,row in enumerate(rows('''10 2,8 450/593 500/566 320/376 100/120
16 3,0 475/638 500/566 320/376 115/135
25 3,0 570/738 500/566 334/391 154/180
40 3,0 580/748 345/636 600/401 210/235
63 4,0 600/768 365/669 660/421 210/315
100 4,0 680/848 380/776 730/436 400/435''')):
 p,uk,h,ll,b,m=row;pg=86 if j==0 else 87;r=add('ts-'+p,'ts-low-voltage','ТС(З)',[pg,87,88],[spec('Мощность',p,'кВА',pg),spec('ВН','380','кВ',86),spec('НН','220','кВ',86),spec('Напряжение короткого замыкания',uk,'%',pg),spec('H',h,'мм',pg),spec('L',ll,'мм',pg),spec('B',b,'мм',pg),spec('Масса',m,'кг',pg),spec('Класс напряжения','0,66','кВ',86)],'dry-ts-open',series='ТС(З)',context='мощность '+p+'кВА, класс0,66кВ',powerKva=int(p),voltageRaw='380/220 (header кВ)',explicitExecutions=['ТС без кожуха','ТСЗ с кожухом']);r['assetFamilyIds'].append('dry-tsz-enclosed');r['uncertainties']=['Voltage header literally кВ while values380/220 appear inconsistent with0,66кВ class; retained without correction.','Slash dimension/mass pairs not explicitly mapped to executions; retain raw.']
ledger(87,'Трансформаторы серии ТСЗ',['ТС','ТСЗ'],['electrical-table-continuation','dimension-table','designation-key','drawing'],['Designation-key title says ТСЛ(З)-6,10,20кВ but actual key ТС(З); preserve source mismatch.']);ledger(88,'Трансформаторы серии ТС',['ТС'],['drawing','busbar-details'])
asset('dry-tsi-unproven',[89],'ТСИ open variants are named in89 but no unambiguous matching geometry drawing on89–90. Do not reuse ТС/ТСН drawings solely by category.','insufficient-evidence');A['dry-tsi-unproven']['evidenceType']='named-table-only'
asset('dry-tszi-top-bushing',[90],'ТСЗИ explicitly named in90 prose: rectangular louvered enclosure, three prominent HV top bushings and LV terminals, base rails; three views.')
for vals in rows('''ТСИ-1,6 20 324 278 34
ТСИ-2,5 15 324 306 37
ТСИ-4,0 10 324 387 48
ТСЗИ-1,6 20 398 407 40
ТСЗИ-2,5 15 398 407 43
ТСЗИ-4,0 10 398 407 55'''):
 n,io,ll,h,m=vals;enclosed=n.startswith('ТСЗИ');r=add('tsi-'+n.split('-')[1].replace(',','p')+('-enclosed' if enclosed else '-open'),'tsi-tools',n,[89,90] if enclosed else [89],[spec('Первичные напряжения','380/220','В',89),spec('Вторичные напряжения','220/127;42;36;12','В',89),spec('Ток холостого хода',io,'%',89),spec('L',ll,'мм',89),spec('H',h,'мм',89),spec('Масса',m,'кг',89),spec('Частота','50','Гц',89)],'dry-tszi-top-bushing' if enclosed else 'dry-tsi-unproven',series='ТСЗИ' if enclosed else 'ТСИ',context='для питания электроинструмента',powerKva=None,voltageRaw='380/220 → 220/127;42;36;12 В');r['uncertainties']=['Page89 enclosure drawing and terminal details are labeled ТСНЗ-400,630, inconsistent with nearby ТСИ1,6–4,0 table; not assigned as exact TSI geometry. Power inferred from name is not normalized absent explicit power column.']
ledger(89,'Трансформаторы серии ТСЗ(И)',['ТСИ','ТСЗИ','ТСНЗ'],['purpose','electrical-table','dimension-table','drawing','busbar-details'],['6named rows. Drawing labels ТСНЗ400/630 contradict TSI table; record as unassigned/cross-family evidence, not TSI geometry.']);ledger(90,None,['ТСЗИ'],['construction-description','drawing','terminal-details'])
asset('dry-tsn-open',[92],'ТСН open three-coil Nomex transformer, upper/lower clamps and wheel base, front/side/top-detail; HV/LV busbar details.')
asset('dry-tsnz-mesh',[93],'ТСНЗ-400,630 mesh-vent enclosure with wheels and side terminal opening; front/side and400/630busbar details.','shared-construction-parametric',['Page89 repeats same TSNЗ-labeled geometry under unrelated TSI heading;93 is authoritative matching heading.'])
asset('dry-tsnz-top-bushing',[94],'ТСНЗ-160,250(400,630): louvered enclosure with HV top bushings, LV top terminals and base rails. This is a separate construction option from mesh enclosure93.')
for vals in rows('''160 670 1715 4,0 1270/1475 600/880 1250/1450 940
250 680 1985 4,0 1430/1720 730/890 1260/1520 1185
400 1150 3890 4,0 1560/1730 850/980 1440/1670 1820
630 1500 6400 6,0 1820/1990 850/980 1460/1725 2230'''):
 p,po,pk,uk,ll,b,h,m=vals;r=add('tsn-'+p,'tsn-nomex','ТСН(З)-'+p,[91,92,94]+([93] if int(p)>=400 else []),[spec('Номинальная мощность',p,'кВА',91),spec('ВН','6,10','кВ',91),spec('НН','0,4','кВ',91),spec('Потери холостого хода',po,'Вт',91),spec('Потери короткого замыкания',pk,'Вт',91),spec('Напряжение короткого замыкания',uk,'%',91),spec('L',ll,'мм',91),spec('B',b,'мм',91),spec('H',h,'мм',91),spec('Масса',m,'кг',91),spec('Изоляция','Номекс',None,91),spec('Превышение температуры','180','°C',91),spec('Нагрузка','133 от номинальной','%',91)],'dry-tsn-open',series='ТСН(З)',context='с изоляцией Номекс',powerKva=int(p),voltageRaw='6,10/0,4 кВ',explicitExecutions=['ТСН без кожуха','ТСНЗ с кожухом']);r['assetFamilyIds'].append('dry-tsnz-top-bushing');
 if int(p)>=400:r['assetFamilyIds'].append('dry-tsnz-mesh')
 r['uncertainties']=['Dimensions have slash-pairs but mass is single value; mass split across executions not supplied.','For400/630 two enclosure drawings93/94 exist; retain alternative construction choices, not one universal geometry.']
ledger(91,'Трансформаторы серии ТСН(З)',['ТСН','ТСНЗ'],['purpose','electrical-table','dimension-table','designation-key']);ledger(92,'Трансформатор ТСН',['ТСН'],['drawing','busbar-details']);ledger(93,'Трансформатор ТСНЗ-400,630',['ТСНЗ'],['drawing','busbar-details']);ledger(94,'Трансформатор ТСНЗ-160,250 (400,630)',['ТСНЗ'],['drawing','terminal-details']);ledger(95,'ИЗМЕРИТЕЛЬНЫЕ ТРАНСФОРМАТОРЫ',[],['section-divider','factory-photo'])
asset('measurement-ntmi',[96],'НТМИ-6-10: rounded polygonal/cylindrical tank with three HV top bushings and several LV terminals; front and top plus344×270 mounting layout, diameter456,diagonal495. Height varies396/486.')
for vals in rows('''6 75 150 300 630 396 80
10 150 300 500 1000 486 85'''):
 v,p05,p1,p3,pm,h,m=vals;r=add('ntmi-'+v,'ntmi','НТМИ-'+v,[96],[spec('ВН',v,'кВ',96),spec('НН основная','0,1','кВ',96),spec('НН дополнительная','0,1/3','кВ',96),spec('Мощность в классе0,5',p05,'ВА',96),spec('Мощность в классе1,0',p1,'ВА',96),spec('Мощность в классе3,0',p3,'ВА',96),spec('Максимальная(предельная) мощность',pm,'кВА',96),spec('H',h,'мм',96),spec('Масса',m,'кг',96)],'measurement-ntmi',series='НТМИ',context='измерительный',voltageRaw=v+'/0,1;0,1/3 кВ',sourceAliases=['НТМИ-'+v+'-У3']);r['uncertainties']=['Maximum power unit printed кВА and values630/1000, unlike adjacent rated VA; retain suspected source unit error.']
asset('measurement-nom',[97],'НОМ-6-10: round tank with two HV top bushings, small LV terminal group; front/side/top and dimension table. Diagram table also explicitly includes НОМ-3.')
for vals in rows('''6 6000 50 75 200 400 440 155 325
10 10000 75 150 300 720 495 215 340'''):
 v,hv,p05,p1,p3,pm,h,h1,m=vals;r=add('nom-'+v,'nom','НОМ-'+v,[97],[spec('Первичная обмотка',hv,'В',97),spec('Вторичная обмотка','100','В',97),spec('Мощность в классе0,5',p05,'В.А',97),spec('Мощность в классе1,0',p1,'В.А',97),spec('Мощность в классе3,0',p3,'В.А',97),spec('Макс.(предельная) мощность',pm,'ВА',97),spec('Схема и группа соединения','1/1-0',None,97),spec('H',h,'мм',97),spec('H1',h1,'мм',97),spec('Масса',m,'кг',97),spec('Drawing L','286',None,97),spec('Drawing L1','272',None,97),spec('Drawing A','250',None,97),spec('Drawing A1','152',None,97),spec('Drawing h',h1,None,97)],'measurement-nom',series='НОМ',context='однофазный измерительный',voltageRaw=hv+'/100 В');r['uncertainties']=['Mass325/340kg preserved exactly despite unexpectedly large values for shown dimensions; no inferred decimal correction.']
r=add('nom-3-drawing','nom','НОМ-3',[97],[spec('H','440',None,97),spec('L','286',None,97),spec('L1','272',None,97),spec('A','250',None,97),spec('A1','152',None,97),spec('h','155',None,97)],'measurement-nom',series='НОМ',context='named only in small drawing table shared with НОМ-6',recordType='drawing-only-model');r['uncertainties']=['НОМ-3 explicitly present in dimension-table row; absent from electrical table. Do not infer voltage or mass from6kV variant. Drawing table does not print units.']
asset('measurement-nami',[98],'НАМИ-6-10: rectangular oil tank with three top HV bushings and LV terminal row; front/side/top, footprint labels404/290 and overall top515×335; height555/615.')
for v,h,m in rows('''6 555 106
10 615 115'''):
 add('nami-'+v,'nami','НАМИ-'+v,[98],[spec('ВН',v,'кВ',98),spec('НН основная','0,1','кВ',98),spec('НН дополнительная','0,1','кВ',98),spec('Мощность основная','75','ВА',98),spec('Мощность дополнительная','30','ВА',98),spec('Класс точности в номинальном режиме','0,2',None,98),spec('H',h,'мм',98),spec('Масса',m,'кг',98)],'measurement-nami',series='НАМИ',context='трехфазный измерительный',voltageRaw=v+'/0,1;0,1 кВ')
asset('measurement-zom-znom',[99,100],'ЗОМ1,25/35 andЗНОМ35 drawings show same tall single porcelain-column arrangement on rectangular oil tank, cylindrical top conservator. Exact shared dimension callouts948height,458×318baseoutline,420×160mounting,4holesØ11.','shared-construction-parametric',['Electrical winding/spec differences retained as separate models. No source proof of equal internal construction.'])
r=add('zom-1p25-35','zom','ЗОМ-1,25/35',[99],[spec('Номинальная мощность','1,25','кВ',99),spec('ВН','27,5','кВ',99),spec('НН','0,23','кВ',99),spec('Схема и группа соединения','1/1-0',None,99),spec('Масса не более полная','20','кг',99),spec('Масса не более масла','80','кг',99)],'measurement-zom-znom',series='ЗОМ',context='измерительный, railway',voltageRaw='27,5/0,23кВ',sourceAliases=['ЗОМ-1,25-35']);r['uncertainties']=['Power column unit printed кВ (not кВА).','Mass cells literally full20kg/oil80kg, inconsistent; preserved and require confirmation.','Drawing title uses ЗОМ-1,25-35 whereas table designation uses slash.']
for j,(hv,lv,aux) in enumerate([('27,5','0,1','0,127'),('35/√3','0,1/√3','0,1/3')],1):
 add('znom35-config'+str(j),'znom','ЗНОМ-35',[100],[spec('Предельная мощность','1,0','кВА',100),spec('Схема и группа соединения','1/1/1-0-0',None,100),spec('Мощность в классе0,5','0,15','кВА',100),spec('Мощность в классе1','0,25','кВА',100),spec('Мощность в классе3','0,6','кВА',100),spec('ВН',hv,'кВ',100),spec('НН основная',lv,'кВ',100),spec('НН дополнительная',aux,'кВ',100),spec('Масса не более полная','80','кг',100),spec('Масса не более масла','20','кг',100)],'measurement-zom-znom',series='ЗНОМ',context='nominal-winding-voltage option'+str(j),sourceRow={'page':100,'table':'technical','row':1,'voltageSubrow':j},voltageRaw=hv+'/'+lv+';'+aux+' кВ')
ledger(96,'Измерительные трансформаторы; НТМИ-6-10',['НТМИ'],['purpose','electrical-table','drawing','dimension-table','component-legend'],['2models; drawing adds У3 suffix aliases. Max power unit printed кВА.'])
ledger(97,'Измерительные трансформаторы; НОМ-6-10',['НОМ'],['purpose','electrical-table','drawing','dimension-table','component-legend'],['2electrical rows and additional НОМ-3 explicitly in drawing table;325/340kg mass retained.'])
ledger(98,'Измерительные трансформаторы НАМИ; НАМИ-6-10',['НАМИ'],['purpose','electrical-table','drawing','dimension-table','component-legend'])
ledger(99,'Измерительные трансформаторы ЗОМ; ЗОМ-1,25-35',['ЗОМ'],['purpose','electrical-table','drawing','component-legend'],['Full20kg/oil80kg inconsistent; power unitкВ inconsistent; retain source.'])
ledger(100,'Измерительные трансформаторы ЗНОМ; ЗНОМ-35',['ЗНОМ'],['purpose','electrical-table','drawing','component-legend'],['One named model with2explicit winding-voltage configurations, each distinct inventory entry.'])
ledger(101,'СИЛОВЫЕ ТРАНСФОРМАТОРЫ35-110кВ',[],['section-divider','factory-photo'],['No attributable model table row; next section begins102.'])
# Drawing-only ОМ-2,0 variation missed if only electrical tables were read.
r=add('om-2p0-drawing','om','ОМ 2,0',[75],[spec('Drawing grouped designation','ОМ 2,0; 2,5/6–10',None,75),spec('H','680',None,75),spec('H1','430',None,75),spec('B','360',None,75),spec('L','470',None,75)],'oil-om',series='ОМ',context='drawing-only row',recordType='drawing-only-model');r['uncertainties']=['ОМ2,0 present only in drawing75; absent electrical72 and dimension73 tables. No full SKU or electrical values inferred.']
L[75]['notes'].append('Small diagram table names ОМ2,0 additionally. Diagram values differ from73; kept distinct raw measurements.')
for r in I:
 if r['familyId']=='om' and r['name'] in ['ОМ-0,63','ОМ-1,25','ОМ-2,5']:
  vals=['630','380','325','450'] if r['name']!='ОМ-2,5' else ['680','430','360','470'];r['rawSpecs']+=table_specs(vals,[(k,None) for k in ['Drawing H','Drawing H1','Drawing B','Drawing L']],75)
# Preserve merged dimension cells instead of fabricating two independently printed values.
for r in I:
 if r['familyId'].startswith('tsl-loss-') and r.get('powerKva',0)>=63:
  out=[]; shared=None
  for s in r['rawSpecs']:
   if s['label'] in ['l','b'] and s['sourcePage'] in [78,79]:
    if s['raw']!='-':shared=s
   else:out.append(s)
  if shared:out.append(spec('l / b (merged source cell)',shared['raw'],'мм',shared['sourcePage']))
  r['rawSpecs']=out
from apply_source_review import apply_model_additions, apply_family_additions
COMMON_PROSE_GROUPS=apply_model_additions(I,spec,ROOT)
# All model-level manufacturer fields remain unknown. The brand/logo does not identify a producing legal entity.
C=[]; old=json.load(open(args.old_records))
for r in I:
 r['designation']=r['sourceDesignation'];r['execution']=r.get('context','');r['candidateOldIds']=[];r['overlapAssessment']=[]
 r['sourcePages']=sorted(set(r['sourcePages']+[s['sourcePage'] for s in r['rawSpecs']]))
 for p in r['sourcePages']:
  if p in L and r['id'] not in L[p]['productIds']:L[p]['productIds'].append(r['id'])
 r['sourceRow']=r.get('sourceRow',{'page':r['rawSpecs'][0]['sourcePage'] if r['rawSpecs'] else r['sourcePages'][0],'designation':r['designation'],'execution':r['execution'],'kind':r['recordType']})
 r['technicalSpecs']=[{'label':s['label'],'value':s['raw'],'unit':s['unitAsPrinted'],'page':s['sourcePage'],**{k:s[k] for k in ['sourceKind','commonProseGroupId','inferredUnit','unitInferenceNote','unitHeaderSourcePage'] if k in s}} for s in r['rawSpecs']]
 # Exact source series + model identity and voltage support; no category-only matches.
 if r['series']=='НТМИ' and r['designation'] in ['НТМИ-6','НТМИ-10']:
  oid='ntmi-'+r['designation'].split('-')[1];r['candidateOldIds']=[oid];r['overlapAssessment']=[{'oldId':oid,'status':'strong-model-identity-candidate','evidence':'Exact model designation; HV6/10 and main secondary0.1kV match old web-reference. PDF adds raw technical/drawing evidence. Manufacturer not stated in product source pages, so legal-entity match remains unverified.','autoMerge':False}]
 elif r['series']=='ТМЭГ' and r.get('powerKva')==250:
  r['candidateOldIds']=['tmeg-250'];r['overlapAssessment']=[{'oldId':'tmeg-250','status':'candidate-with-narrower-voltage-evidence','evidence':'Exact ТМЭГ-250 designation and excavator purpose. Old web reference lists6/6.3/10/10.5→0.4kV; PDF table only6(6.3), noLV. Do not overwrite broader official web voltage or claim same full order execution.','autoMerge':False}]
 elif r['familyId'].startswith('tsl-loss-') and r.get('powerKva') in [630,1600]:
  oid='tsl-'+str(r['powerKva']);r['candidateOldIds']=[oid];r['overlapAssessment']=[{'oldId':oid,'status':'family-model-candidate-execution-unresolved','evidence':'Same ТСЛ family/power,6–10kV and0.4kV among listed secondaries. Old web reference does not distinguish lossC/A or open/enclosed execution; several new source rows could relate, so no automatic deduplication.','autoMerge':False}]
 if r['id']=='alageum-2026-thermal-cabinet':
  r['candidateOldIds']=['cat-shtz'];r['overlapAssessment']=[{'oldId':'cat-shtz','status':'strong-family-purpose-candidate-execution-unresolved','evidence':'Old cabinet catalog63 and new transformer catalog86 both explicitly name ШТЗ and describe thermal protection/control of transformer forced-cooling fans. New86 shows a door display, rotary controls and red/green lamps and internal control apparatus. New86 supplies no cabinet voltage, dimensions, mass or IP rating, so old220V,400×500×200mm,≤25kg,У3/IP34 cannot be attributed to the photographed new execution without further evidence.','autoMerge':False,'oldSourcePages':[63],'newSourcePages':[86]}]
 if r['series']=='ТМГ' and r.get('powerKva') in [400,630,1000,2500]:
  oid='tmg-'+str(r['powerKva']);r['overlapAssessment'].append({'oldId':oid,'status':'do-not-merge','evidence':'Shared abbreviated ТМГ power label is insufficient: source is isolating construction or20kV execution, while old reference is6/10→0.4kV distribution.','autoMerge':False})
 if r['series']=='ТМГСУ' and r.get('powerKva') in [63,160]:r['overlapAssessment'].append({'oldId':'tmgs-'+str(r['powerKva']),'status':'do-not-merge','evidence':'ТМГСУ with symmetrizing device is a different explicit series from old ТМГС.','autoMerge':False})
 for aid in r['assetFamilyIds']:A[aid]['productIds'].append(r['id'])
 fid=r['familyId']
 if fid not in F:F[fid]={'id':fid,'designation':r['series'],'title':r['series']+' — '+r.get('context',''),'sourcePages':[],'modelIds':[],'manufacturer':None,'brand':'Alageum electric'}
 F[fid]['sourcePages']=sorted(set(F[fid]['sourcePages']+r['sourcePages']));F[fid]['modelIds'].append(r['id'])
 for n,exe in enumerate(r.get('explicitExecutions',[]),1):
  C.append({'id':r['id']+'-execution-'+str(n),'modelId':r['id'],'familyId':fid,'kind':'explicit-construction-execution','designation':exe,'sourcePages':r['sourcePages'],'sku':None,'note':'Named execution, not an invented full order SKU. Raw slash-pair dimensions remain unassigned unless source explicitly maps them.'})
 if fid in ['om','omp'] and r['recordType']=='explicit-model-row':C.append({'id':r['id']+'-voltage-options','modelId':r['id'],'familyId':fid,'kind':'explicit-voltage-options','highVoltageOptionsKv':['6','10'],'lowVoltageOptionsKv':['0,23','0,4'] if fid=='omp' else ['0,23'],'sourcePages':[72],'sku':None,'note':'Source choices retained as choices, not Cartesian-expanded SKU list.'})
for p in L:
 L[p]['productIds']=list(dict.fromkeys(L[p]['productIds']));L[p]['assetFamilyIds']=[a for a,v in A.items() if p in v['evidencePages']]
 L[p]['explicitModelRowCount']=sum(1 for r in I if r['sourceRow']['page']==p)
 L[p]['namedModelDesignations']=list(dict.fromkeys(r['designation'] for r in I if p in r['sourcePages']))
# Explicit family/range statements are ledger/configuration evidence, not generated model SKUs.
for fid,label,p,lo,hi in [('tm-20kv','ТМ-100-2500',50,100,2500),('tsl-loss-A','ТСЛ(З)-25-4000',78,25,4000),('tmpn-top','ТМПН(Г)-25-665',66,25,665)]:C.append({'id':fid+'-heading-range','familyId':fid,'kind':'heading-range-only','designation':label,'sourcePages':[p],'rangeKva':[lo,hi],'expandedToModels':False})
# Per-page cited component labels, supplementary to transformer row inventory.
for p in [46,47,49,52,53,56,57,59,61,66,67,69,71,74,75,96,97,98,99,100]:L[p]['componentLegendPresent']=True
L[47]['namedComponentDesignations']=['МВТС-16','ТКП-160','ТТЖ-М'];L[49]['namedComponentDesignations']=['МВТС-16','ТКП-160','ТТЖ-М'];L[53]['namedComponentDesignations']=['ТКП-160Сг','МВТС-16'];L[57]['namedComponentDesignations']=['МВТС-16','ТКП-160'];
L[85]['namedComponentDesignations']=['ТР-100','pt-100','ЕК-290'];L[86]['namedComponentDesignations']=['ШТЗ','ТР-100','Вентиляторы для охлаждения обмоток']
N=[
 'Scope physicalPDF46–101 inclusive,56 pages. Printed numbers match PDF on numbered pages. Unnumbered factory dividers76,95,101 have printedPage:null.',
 'All56 pages visually reviewed as rendered sheets and all numeric-heavy data pages additionally inspected individually. SourcePDF text extraction is empty (outlined vectors). Russian+English OCR was an aid only; raw OCR files are not authoritative.',
 'No manufacturer legal entity is explicitly named on these product pages; all manufacturer fields unknown. Alageum electric logo is brand evidence only.',
 'No full order SKUs are invented. Repeated short model labels retain execution/page/row identities. Named voltage/range choices are not Cartesian-expanded. Two ЗНОМ winding-voltage subrows are separate explicit variations.',
 'Source-data errors are preserved: dry loss headersкВт with190… values; ТМПН loss headersВт with0.22… values; ТС(З) voltage headerкВ with380/220; НТМИ maxpowerкВА with630/1000; ЗОМ powerкВ andfull20/oil80kg; ОМ duplicate mass headers; drawing/table dimension differences; mismatchedTSНЗ drawing underTSИ heading89.',
 'ОМ2,0 andНОМ3 appear only in drawing tables75/97, respectively. These were retained as evidence-limited drawing-only model records and not filled with nearby models electrical values.',
 'Asset family reuse is construction-specific, never category-wide. Drawings reveal multiple dry enclosure layouts and oil terminal/tank patterns. Asset descriptions do not authorize guessed dimensions or claim as-builtCAD fidelity.',
 'Baseline comparison used model,series,power and voltage, not fuzzycategory.2НТМИ strong identity candidates,1ТМЭГ candidate and4ТСЛ loss-specific rows relate to2oldТСЛ references; unresolved execution/manufacturer keeps autoMerge:false. Old224cabinet records mostly distinct; ШТЗ accessory is a strong cabinet-family-purpose candidate for cat-shtz, with exact execution still unresolved.'
]
C.append({'id':'tslz-20kv-mentioned-execution','familyId':'tsl-20kv','kind':'family-execution-mentioned','designation':'ТСЛЗ (с кожухом), класс20кВ','sourcePages':[82],'sku':None,'assetFamilyIds':[],'note':'Purpose text explicitly names enclosed execution, but tables82/83 and drawing84 nameТСЛ. No unlistedТСЛЗ power-specific SKU or enclosed dimensions generated.'})
# A ventilation range is accessory configuration evidence, never an explicit product card.
fan=next(r for r in I if r['recordType']=='accessory-configuration-range')
I.remove(fan)
C.append({'id':fan['id'],'familyId':fan['familyId'],'designation':fan['designation'],'kind':'accessory-system-range','sourcePages':fan['sourcePages'],'technicalSpecs':fan['technicalSpecs'],'assetFamilyIds':fan['assetFamilyIds'],'sku':None,'note':'2–6 fans according to transformer power; not a named individual orderable model.'})
for f in F.values():f['modelIds']=[x for x in f['modelIds'] if x!=fan['id']]
F['dry-accessories']['designation']='Комплектность и дополнительное оснащение сухих трансформаторов'
F['dry-accessories']['title']=F['dry-accessories']['designation']
F['tsi-tools']['designation']='ТСИ / ТСЗИ'
A['accessory-cooling-fans']['productIds']=[];A['accessory-cooling-fans']['configurationIds']=[fan['id']]
for p in L:
 L[p]['productIds']=[x for x in L[p]['productIds'] if x!=fan['id']]
 L[p]['configurationIds']=[c['id'] for c in C if p in c.get('sourcePages',[])]
 L[p]['inventoryRowCount']=sum(1 for r in I if r['sourceRow']['page']==p)
 L[p]['explicitModelRowCount']=sum(1 for r in I if r['sourceRow']['page']==p and r['recordType']=='explicit-model-row')
 L[p]['namedModelDesignations']=list(dict.fromkeys(r['designation'] for r in I if p in r['sourcePages']))
A['dry-tszi-top-bushing']['reusableType']='shared-construction-representative'
A['dry-tszi-top-bushing']['exclusions'].append('Table89 lists small0.38kV tool transformers while drawings89/90 resemble larger HV enclosures;90 prose explicitly saysТСЗИ but do not claim dimensionally faithful3D without resolving this conflict.')
for aid in ['oil-tmg-twostage-small','oil-tmg-20kv-small','oil-tmgsu']:
 A[aid]['sameConstructionTemplateCandidate']='corrugated-hermetic-small-top-bushings'
 A[aid]['sameConstructionEvidence']='Pages46,56,59 repeat the same three-view arrangement and20-item legend: corrugated tank, three largeHV bushings, LV terminal row, talloil tube, channel/wheelbase. Shared parametric template is defensible with row-specific dimensions and electrical terminal details retained.'
for aid in ['oil-tmg-twostage-large','oil-tmg-20kv-large']:
 A[aid]['sameConstructionTemplateCandidate']='corrugated-hermetic-large-top-bushings'
 A[aid]['sameConstructionEvidence']='Pages47/57 share the same three orthographic views and terminal/tank layout; preserve size-specific dimensions and switch execution.'
A['accessory-thermal-cabinet']['oldAssetCandidate']={'oldId':'cat-shtz','oldPage':63,'newPage':86,'type':'representative-family-only','reason':'Same thermal-protection/fan-control purpose and similar front control arrangement. Newphoto does not verify old dimensions or all controls.'}
apply_family_additions(F,I,C,L,COMMON_PROSE_GROUPS)
N.append('Independent review additions:19 source-scoped common-prose groups. Pump limits remain row-scoped:62=-45…+40°C,64=-60…+40°C. Drawing-only models receive no unsupported prose inheritance. Printed-versus-inferred unit metadata and TC87 voltage provenance are synchronized across aliases.')
for fname,obj in [('inventory.json',{'source':'ALAGEUM transformer technical catalog March18 2026','sectionPdfPages':[46,101],'families':list(F.values()),'models':I,'configurations':C,'notes':N}),('page-ledger.json',list(L.values())),('asset-families.json',{'families':list(A.values()),'notes':['Construction evidence only; no generated3D/icon assets or site edits.']})]:
 with open(os.path.join(ROOT,fname),'w') as f:json.dump(obj,f,ensure_ascii=False,indent=2)
with open(os.path.join(ROOT,'notes.md'),'w') as f:
 f.write('# Pages46–101 extraction\n\n'+f'{len(I)} inventory entries; {len(F)} product families; {len(C)} configuration/range entries; {len(A)} construction/photograph evidence groups.\n\n')
 f.write('\n'.join('- '+n for n in N)+'\n\n## Inspection and scope\n\n56pages visually reviewed; contact sheets retained in pages/sheet-NNN.jpg. Individual1.5x pagePNG and selected3xOCR renders are evidence-only. No application checkout or published assets edited. All outputs machine-readable and source-page-grounded.\n')
print(json.dumps({'models':len(I),'families':len(F),'configurations':len(C),'assetFamilies':len(A),'pages':len(L),'recordTypes':dict(__import__('collections').Counter(r['recordType'] for r in I)),'baselineCandidates':{r['id']:r['candidateOldIds'] for r in I if r['candidateOldIds']}},ensure_ascii=False,indent=2))
