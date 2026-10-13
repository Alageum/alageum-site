import argparse, json, os, pathlib
parser=argparse.ArgumentParser(description='Replay the reviewed section transcription into an explicit output directory.')
parser.add_argument('--output', type=pathlib.Path, required=True, help='Directory for replayed inventory and review outputs')
parser.add_argument('--old-records', type=pathlib.Path, required=True, help='Frozen 238-row legacy inventory JSON')
parser.add_argument('--source-pdf', default=os.environ.get('ALAGEUM_SOURCE_PDF', 'https://drive.google.com/file/d/113q2las1R18OJ6g6laJ5ZN4PFPsY635f/view'), help='Local PDF path or source reference; defaults to ALAGEUM_SOURCE_PDF or the verified Drive URL')
args=parser.parse_args()
SOURCE_PDF_REFERENCE=str(args.source_pdf)
D=args.output
D.mkdir(parents=True, exist_ok=True)
source={'id':'alageum-technical-catalog-2026-03-18','filePath':SOURCE_PDF_REFERENCE,'catalogBrand':'Alageum electric','date':'2026-03-18','dateProvenance':'Assignment; this section does not repeat the cover date','pdfPageCount':187,'assignedPhysicalPages':[6,45],'pageNumbering':'Physical PDF and printed pages match throughout 6–45','method':'All 40 rendered pages visually inspected; numeric tables manually transcribed from rendered source. Auxiliary Russian/English OCR retained separately and is not authoritative.'}
F=[]; P=[]; pages={n:{'pdfPage':n,'printedPage':str(n),'visualInspected':True,'renderPath':f'renders/p{n:03d}.png','productIds':[],'familyIds':[],'headings':[],'pageType':None,'drawings':[],'notes':[]} for n in range(6,46)}
G3=['У/Ун-0','У/Zн-11','Д/Ун-11']; G2=['У/Ун-0','Д/Ун-11']

def rows(s):
 return [x.strip().split('|') for x in s.strip().splitlines() if x.strip()]
def family(fid,series,qualifier,heading,pgs,electrical,dimensions,elec_pages,dim_page,drawings,groups='two',manufacturer=None,notes=None,description=None):
 f={'id':fid,'seriesRaw':series,'variantLabel':qualifier,'headingRaw':heading,'sourcePages':pgs,'manufacturer':manufacturer,'manufacturerStatus':'explicit' if manufacturer else 'not stated on assigned family pages','brand':'Alageum electric','descriptionSource':description,'configurationPolicy':'Each explicit table row retained separately; connection alternatives remain configurations within that row. Power ranges are not expanded. Short designation is not a complete order code.','drawingEvidencePages':drawings,'notes':notes or []}
 F.append(f)
 er=rows(electrical); dr={int(r[0]):r[1:] for r in rows(dimensions)}
 for r in er:
  power=int(r[0]); po,pk,uk,io,l,b=r[1:]; ep=elec_pages.get(power,elec_pages.get('default')); dp=dim_page
  model=(series+'-'+str(power)) if series!='ТМГ и' else 'ТМГ и-'+str(power)
  if fid=='tmgs-pole':model+=' столбовой'
  gid=G3 if groups=='small-three' and power<=250 else G2
  if fid=='tmgs-pole': gid=G3
  if fid=='tmgin-x4k3':gid=['Д/Ун-11']
  if fid=='tmg-switch-6-10':gid=['При 10 кВ - У/Ун-0','При 6 кВ Д/Ун-11']
  p={'id':f'alageum-{fid}-{power}','familyId':fid,'name':f'{model} ({qualifier})','modelDesignationRaw':model,'sku':None,'skuStatus':'No complete orderable SKU specified; designation is exact table row identifier','series':series,'variantLabel':qualifier,'nominalPowerKva':power,'manufacturer':manufacturer,'brand':'Alageum electric','sourceId':source['id'],'sourcePages':sorted(set([ep,dp]+drawings)),'dataPages':sorted(set([ep,dp])),'sourceTableRow':model,'rawSourceSpecs':[],'configurations':[],'assetMapping':None,'reconciliation':[],'notes':[]}
  def spec(label,value,unit,page,table):p['rawSourceSpecs'].append({'label':label,'value':value,'unit':unit,'pdfPage':page,'printedPage':str(page),'table':table})
  spec('Номинальная мощность',str(power),'кВА',ep,'electrical')
  volt='10/0,4' if fid=='tmgin-x4k3' else '6(10)/0,4'
  spec('Номинальное напряжение',volt,'кВ',ep,'electrical')
  spec('Группа соединения обмоток','\n'.join(gid),None,ep,'electrical')
  spec('Р о',po,'Вт',ep,'electrical');spec('Рк',pk.replace(';','\n'),'Вт',ep,'electrical');spec('U к',uk.replace(';','\n'),'%',ep,'electrical');spec('I о',io,'%',ep,'electrical');spec('L',l,None,ep,'electrical');spec('B',b,None,ep,'electrical')
  dims=dr[power]; labels=['H','A','A1','M','K','h','h1','Полная масса','Масса масла'] if len(dims)==9 else ['H','Полная масса','Масса масла']
  for k,v in zip(labels,dims):spec(k,v,'кг' if 'масса' in k.lower() else None,dp,'dimensions-and-masses')
  for i,g in enumerate(gid):
   p['configurations'].append({'connectionGroupRaw':g,'PkWRaw':pk.split(';')[i] if len(pk.split(';'))==len(gid) else pk,'UkPercentRaw':uk.split(';')[i] if len(uk.split(';'))==len(gid) else uk,'scope':'Printed connection option; no synthetic SKU generated'})
  p['notes'].append('L, B, H and other lettered dimensional columns carry no explicit unit in these tables; unit left null rather than assumed.')
  P.append(p)
  for pg in p['dataPages']:
   pages[pg]['productIds'].append(p['id']);pages[pg]['pageType']='technical-tables';
   if fid not in pages[pg]['familyIds']:pages[pg]['familyIds'].append(fid)
  for pg in pgs:
   if pg in pages and fid not in pages[pg]['familyIds']:pages[pg]['familyIds'].append(fid)
  if pgs[0] in pages and heading not in pages[pgs[0]]['headings']:pages[pgs[0]]['headings'].append(heading)
 return f

family('tmg-standard','ТМГ','стандартный','Трансформаторы ТМГ-16-3200 кВА стандартный',[6,7,12,13],'''
16|90|440;500;500|4,5;4,7;4,7|4|767|498
25|120|600;690;690|4,5;4,7;4,7|3,0|836|490
40|160|880;1000;1000|4,5;4,7;4,7|2,8|880|515
63|210|1280;1470;1470|4,5;4,7;4,7|2,6|920|530
100|280|1900;2270;2270|4,5;4,7;4,5|2,2|962|682
160|450|2600;3100;3100|5,0;5,5;5,0|1,9|1072|692
250|610|3700;4200;4200|4,5;4,7;4,5|1,9|1109|786
400|780|5500;5900|4,5|1,4|1309|774
630|1070|7900;8500|5,5|1,0|1421|1023
1000|1470|12200|5,5|0,8|1639|1195
1250|1740|15000|6,0|0,6|1654|1224
1600|1750|18000|6,0|0,5|1732|1168
2000|2600|25000|6,0|0,5|1813|1358
2500|2770|28000|6,5|0,4|1976|1325
3200|3500|29500|6,5|0,4|2440|1500
''','''
16|810|450|400|90|190|80|95|225|60
25|890|450|400|90|190|80|95|275|70
40|895|450|400|105|190|75|95|305|70
63|935|450|400|90|190|85|110|350|87
100|1005|550|550|90|190|95|110|445|100
160|1080|550|550|90|190|115|120|630|145
250|1200|550|550|110|190|110|115|865|185
400|1295|660|660|150|230|130|130|1165|230
630|1305|660|660|170|230|185|170|1580|328
1000|1450|820|820|190|230|160|180|2230|474
1250|1610|820|820|180|230|190|180|2600|541
1600|1782|820|820|260|250|160|200|3050|560
2000|1825|820|820|260|250|200|210|3800|770
2500|1970|1070|1070|145|260|160|235|4505|880
3200|2370|1070|1070|280|250|240|192|6990|1760
''',{'default':6,1600:7,2000:7,2500:7,3200:7},7,[12,13],groups='small-three',description={'pdfPage':6,'text':'Трехфазные силовые масляные трансформаторы; герметичное исполнение; гофрированные стенки; расширитель и воздушная или газовая подушка отсутствуют; наружная или внутренняя установка; высота не более 1000 м.'})
family('tmg-01','ТМГ','01','Трансформаторы ТМГ-63-2500 кВА (01)',[8,9,12,13],'''
63|230|1410;1550;1410|4,0;4,0;4,7|3,1|900|520
100|310|2090;2500;2090|4,5;4,5;4,5|2,6|942|678
160|470|2860;3300;2860|4,0;5,0;4,0|2,2|1011|672
250|670|4200;4600;4200|4,0;4,5;4,0|2,1|1084|767
400|930|6000;6500|4,0|1,8|1262|770
630|1100|8500;9300|5,0|1,3|1392|858
1000|1700|13000|5,0|1,04|1614|1084
1250|1830|15500|5,5|0,7|1692|1216
1600|1850|20800|5,5|0,6|1818|1336
2000|2660|25500|5,5|0,6|2035|1337
2500|2900|28500|5,5|0,5|2035|1348
''','''
63|935|450|400|90|190|85|110|355|80
100|1005|550|550|90|190|95|110|430|95
160|1080|550|550|90|190|115|120|615|140
250|1165|550|550|110|190|110|115|825|184
400|1275|660|660|150|230|130|130|1104|236
630|1515|660|660|150|230|150|150|1610|366
1000|1650|820|820|190|230|180|150|2232|434
1250|1710|820|820|200|230|180|150|2595|567
1600|1870|1070|1070|210|280|180|160|3380|770
2000|1942|1070|1070|230|230|200|170|4160|860
2500|2070|1070|1070|145|260|220|170|4895|1050
''',{'default':8},9,[12,13],groups='small-three',description={'pdfPage':8,'text':'ТМГ (01); герметичное исполнение; полностью заполнены трансформаторным маслом.'})
family('tmg-x1k1','ТМГ','Х1К1','Трансформаторы ТМГ-63-2500 кВА (Х1К1)',[10,11,12,13],'''
63|175|1280|4,5|2,6|950|560
100|260|1970|4,0|2,2|962|682
160|375|2900|5,0|1,9|1073|692
250|520|3700|4,5|1,9|1109|787
400|750|5400|4,5|1,4|1306|774
630|1000|7600|5,5|1,0|1422|870
1000|1400|10600|5,5|0,8|1600|1100
1250|1500|13500|6,0|0,8|1716|1176
1600|1950|16500|6,5|0,5|1940|1225
2500|2600|26500|6,5|0,5|2145|1350
''','''
63|960|450|400|90|190|85|110|396|98
100|1005|550|550|90|190|95|110|445|100
160|1080|550|550|90|190|115|120|630|145
250|1200|550|550|110|190|110|115|865|185
400|1295|660|660|150|230|130|130|1165|230
630|1460|660|660|150|230|150|150|1645|390
1000|1650|820|820|190|230|180|150|2415|510
1250|1700|820|820|200|230|180|150|2657|587
1600|1870|1070|1070|210|280|180|160|3670|775
2500|2070|1070|1070|145|260|220|170|5230|1110
''',{'default':10},11,[12,13],notes=['There is no ТМГ-2000 row for Х1К1; do not interpolate it from the heading range.'],description={'pdfPage':10,'text':'Потери соответствуют СТО 34.01-3.2-011-2017 ПАО «Россети».'})
family('tm-standard','ТМ','стандартный','Трансформаторы ТМ-16-2500 кВА стандартный',[14,15,16,17],'''
16|90|440;500;500|4,5;4,7;4,7|4|994|498
25|120|600;690;690|4,5;4,7;4,7|3,0|1050|490
40|160|880;1000;1000|4,5;4,7;4,7|2,8|1055|515
63|210|1280;1470;1470|4,5;4,7;4,7|2,6|1080|530
100|280|1900;2270;2270|4,5;4,7;4,5|2,2|1145|682
160|450|2600;3100;3100|5,0;5,5;5,0|1,9|1192|692
250|610|3700;4200;4200|4,5;4,7;4,5|1,9|1180|786
400|780|5500;5900|4,5|1,4|1385|762
630|1070|7900;8500|5,5|1,0|1500|1023
1000|1470|12200|5,5|0,8|1705|1195
1250|1740|15000|6,0|0,6|1820|1274
1600|1750|18000|6,0|0,5|1950|1168
2000|2600|25000|6,0|0,5|1940|1358
2500|2770|28000|6,5|0,4|2115|1325
''','''
16|936|450|400|90|190|80|95|237|66
25|1010|450|400|90|190|80|95|290|80
40|1015|450|400|105|190|75|95|335|85
63|1055|450|400|90|190|85|110|373|92
100|1100|550|550|90|190|95|110|461|106
160|1210|550|550|90|190|115|120|640|150
250|1310|550|550|110|190|110|115|889|173
400|1440|660|660|150|230|130|130|1192|248
630|1460|660|660|170|230|185|170|1582|333
1000|1830|820|820|190|230|160|180|2323|544
1250|1820|820|820|180|230|190|180|2686|611
1600|2150|820|820|260|250|160|200|3180|635
2000|2245|820|820|260|250|200|210|4020|870
2500|2410|1070|1070|145|260|160|235|4725|980
''',{'default':14,1600:15,2000:15,2500:15},15,[16,17],groups='small-three',notes=['Heading and table include 16 кВА, but body states Диапазон мощности – 25–2500 кВА. Both preserved; not corrected.'],description={'pdfPage':14,'text':'Маслорасширитель установлен на крышке бака; вентиляционное отверстие соединенное через воздухоочиститель; регулирование ПБВ со стороны ВН ±2x2,5%; У1.'})
family('tmge-x2k1','ТМГэ','Х2К1','ТМГэ-энергосберегающие трансформаторы с уровнем потерь Х2К1 согласно стандарта ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017',[18,19,22,23],'''
63|160|1280|4,5|2,6|960|580
100|217|1970|4,5|1,5|1015|710
160|300|2900|4,5|1,2|1060|690
250|425|3700|4,0|1,0|1150|790
400|565|5400|4,5|1,0|1353|771
630|696|7600|5,5|1,0|1490|959
1000|957|10600|5,5|0,8|1668|998
1250|1350|13500|6,5|0,8|1920|1150
1600|1478|16500|6,0|0,5|2325|1380
2500|2130|26500|6,5|0,4|2190|1360
''','''
63|1050|450|400|90|190|80|115|402|104
100|995|550|550|90|190|95|110|550|140
160|1130|550|550|90|190|115|120|695|155
250|1300|550|550|110|230|110|115|965|220
400|1425|660|660|150|230|130|130|1440|290
630|1430|660|660|150|230|150|150|1750|400
1000|1740|820|820|190|230|180|150|2920|610
1250|1770|820|820|200|250|210|160|3200|600
1600|1835|1070|1070|210|250|180|160|4055|880
2500|2070|1070|1070|145|260|220|200|5500|1100
''',{'default':18},19,[22,23],description={'pdfPage':18,'text':'Энергоэффективный, класс Х2К1; 63–2500 кВА; трехфазный силовой масляный.'})
family('tmge-x2k2','ТМГэ','Х2К2','ТМГэ-энергосберегающие трансформаторы с уровнем потерь Х2К2 согласно стандарта ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017',[20,21,22,23],'''
40|130|775|4,5|2,8|892|520
63|160|1270|4,5|2,6|957|572
100|217|1591|4,5|1,5|1050|724
160|300|2136|4,5|1,5|1110|704
250|425|2955|4,5|1,0|1174|804
400|565|4182|4,5|1,4|1385|785
630|696|6136|5,5|1,0|1572|923
1000|957|9545|5,5|0,8|1892|1102
1250|1350|13250|6,0|0,9|1784|1150
1600|1478|15455|6,0|0,5|1930|1330
2500|2130|23182|6,5|0,4|2215|1362
''','''
40|966|450|400|105|190|85|110|364|100
63|1010|450|400|90|190|80|115|402|104
100|1032|550|450|90|190|95|110|570|136
160|1215|550|550|90|190|115|120|730|150
250|1303|550|550|110|230|110|115|1025|232
400|1372|660|660|150|230|130|130|1398|305
630|1435|660|660|150|230|150|150|1920|410
1000|1633|820|820|190|230|180|150|2738|551
1250|1775|820|820|200|250|210|160|3012|600
1600|1835|1070|1070|210|250|180|160|3980|950
2500|2043|1070|1070|145|260|220|200|5210|1150
''',{'default':20,1600:21,2500:21},21,[22,23],description={'pdfPage':20,'text':'Энергоэффективный, класс Х2К2; 40–2500 кВА; потери ниже стандартных в среднем на 25%.'})
family('tmgve-x3k2','ТМГвэ','Х3К2','ТМГвэ-энергосберегающие трансформаторы с уровнем потерь Х3К2 согласно стандарта ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017',[24,25],'''
63|128|1270|4,5|2,6|957|572
100|180|1591|4,5|1,5|1050|724
160|260|2136|4,5|1,5|1110|704
250|360|2955|4,5|1,0|1174|804
400|520|4182|4,5|1,4|1385|785
630|696|6136|5,5|1,0|1620|940
1000|940|9545|5,5|0,8|1892|1102
1250|1150|13250|6,0|0,9|2050|1250
1600|1450|15455|6,0|0,5|2120|1410
2500|2100|23182|6,5|0,4|2290|1380
''','''
63|1010|450|400|90|190|80|115|402|104
100|1032|550|550|90|190|95|110|570|136
160|1215|550|550|90|190|115|120|730|150
250|1303|550|550|110|230|110|115|1025|232
400|1372|660|660|150|230|130|130|1398|305
630|1475|660|660|150|230|150|150|2110|480
1000|1625|820|820|190|230|180|150|2850|600
1250|1850|820|820|200|250|210|160|3600|850
1600|1850|1070|1070|210|250|180|160|4480|970
2500|2043|1070|1070|145|260|220|200|5610|1350
''',{'default':24},25,[],notes=['No drawing explicitly labels Х3К2 in pages 6–45. Pages 30–31 label Х3К3 и Х4К3; do not silently reuse as a verified Х3К2 drawing.'],description={'pdfPage':24,'text':'Высокоэнергоэффективный, класс Х3К2; 63–2500 кВА.'})
family('tmgve-x3k3','ТМГвэ','Х3К3','ТМГвэ-энергосберегающие трансформаторы с уровнем потерь Х3К3 согласно стандарта ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017',[26,27,30,31],'''
63|128|1031|4,5|1,2|970|550
100|180|1475|4,5|1,1|1030|724
160|260|2000|4,5|1,0|1150|750
250|360|2750|4,5|1,0|1300|950
400|520|3850|4,5|1,0|1495|810
630|696|5600|5,5|0,8|1620|940
1000|940|9000|5,5|0,8|1892|1102
1250|1150|11000|6,5|0,9|2050|1250
1600|1450|14000|6,0|0,5|2120|1410
2500|2100|22000|6,5|0,4|2290|1380
''','''
63|1115|450|400|110|85|190|90|510|120
100|1215|550|550|90|190|95|110|710|170
160|1300|550|550|90|190|115|120|900|100
250|1400|550|550|110|230|110|115|1150|140
400|1335|660|660|150|230|130|130|1550|350
630|1475|660|660|150|230|150|150|2110|480
1000|1625|820|820|190|230|180|150|2850|600
1250|1850|820|820|200|250|210|160|3600|850
1600|1850|1070|1070|210|250|180|160|4480|970
2500|2043|1070|1070|145|260|220|200|5610|1350
''',{'default':26},27,[30,31],notes=['Page 27 ТМГвэ-63 unusual dimensional sequence M=110,K=85,h=190,h1=90 retained exactly.','Drawing heading on page 30 includes 40 кВА, but no 40 кВА Х3К3 table row appears; no product manufactured from range.'],description={'pdfPage':26,'text':'Высокоэнергоэффективный, класс Х3К3; 63–2500 кВА.'})
family('tmgi-x4k3','ТМГ и','Х4К3','ТМГи-энергосберегающие трансформаторы с уровнем потерь Х4К3 согласно стандарта ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017',[28,29,30,31],'''
63|104|1031|4,5|1,2|970|550
100|145|1475|4,5|1,1|1030|724
160|210|2000|4,5|1,0|1150|750
250|300|2750|4,5|1,0|1300|950
400|430|3850|4,5|1,0|1495|810
630|560|5600|5,5|0,8|1620|940
1000|770|9000|5,5|0,8|1892|1102
1250|950|11000|6,5|0,9|2050|1250
1600|1200|14000|6,0|0,5|2120|1410
2500|1750|22000|6,5|0,4|2290|1380
''','''
63|1115|450|400|110|85|190|90|510|120
100|1215|550|550|90|190|95|110|710|170
160|1300|550|550|90|190|115|120|900|100
250|1400|550|550|110|230|110|115|1150|140
400|1335|660|660|150|230|130|130|1550|350
630|1475|660|660|150|230|150|150|2110|480
1000|1625|820|820|190|230|180|150|2850|600
1250|1850|820|820|200|250|210|160|3600|850
1600|1850|1070|1070|210|250|180|160|4480|970
2500|2043|1070|1070|145|260|220|200|5610|1350
''',{'default':28},29,[30,31],notes=['Heading uses ТМГи; table row lettering has a visible space, transcribed ТМГ и.','Pages 30–31 label ТМГвэ while expressly including Х4К3; cross-family label inconsistency retained.','Page 29 ТМГ и-63 unusual dimensional sequence M=110,K=85,h=190,h1=90 retained exactly.'],description={'pdfPage':28,'text':'и — инновационный; потери холостого хода и короткого замыкания снижены на 40% и 30% соответственно относительно стандартных.'})
family('tmgin-x4k3','ТМГиН','с РПН Х4К3','Трансформатор с РПН ТМГиН-630/10-0,4 с классом энергоэффективности Х4К3',[32,33],'''
630|560|5600|5,5|0,5|1590|930
''','''
630|1550|2214|590
''',{'default':32},32,[33],manufacturer='АО «КТЗ»',description={'pdfPage':32,'text':'АО «КТЗ» осуществило изготовление ТМГиН мощностью 630 кВА, 10 кВ; автоматическое регулирование напряжения под нагрузкой; цифровой мониторинг; управление переключением через мобильное приложение; электропривод с вакуумными коммутационными элементами.'})
family('tmgs-pole','ТМГС','столбового исполнения','Трансформаторы ТМГС-25-160 столбового исполнения',[34,35],'''
25|120|600;690;690|4,5;4,7;4,7|3,0|850|615
40|160|880;1000;1000|4,5;4,7;4,7|2,8|895|620
63|210|1280;1470;1470|4,5;4,7;4,7|2,6|928|675
100|280|1900;2270;2270|4,5;4,7;4,5|2,2|1250|720
160|450|2600;3100;3100|5,0;5,5;5,0|1,9|1345|750
''','''
25|925|450|400|90|190|80|95|215|75
40|915|450|400|105|190|75|95|340|79
63|935|450|400|90|190|85|110|376|85
100|1005|550|550|90|190|95|110|480|100
160|1080|550|550|90|190|115|120|645|145
''',{'default':34},34,[35],groups='small-three',description={'pdfPage':34,'text':'С возможностью крепления непосредственно на железобетонной опоре; комплект крепежных элементов и монтажная траверса.'})
family('tmz-panel','ТМЗ','с панельным радиатором','Трансформаторы ТМЗ-400-2500 кВА с панельным радиатором',[36,37],'''
400|900|6500|4,5|1,4|1490|1510
630|1070|8500|5,5|1,0|1390|1260
1000|1470|12500|5,5|0,8|1960|1320
1600|1750|18500|6,0|0,5|2155|1380
2500|3000|28000|6,5|0,4|2005|1840
''','''
400|1355|1590|490
630|1240|2090|530
1000|1735|2892|817
1600|1965|3980|995
2500|2093|5380|1330
''',{'default':36},36,[37],description={'pdfPage':36,'text':'Герметичное исполнение с сухим азотом между зеркалом масла и крышкой; панельные радиаторы; диапазон ручного регулирования ±2x2,5%.'})
family('tmgf','ТМГФ','6(10)/0,4 кВ','Трансформаторы ТМГФ-400-2500кВА',[38,39],'''
400|780|6000|4,5|1,4|1350|872
630|1070|8600|5,5|1,0|1440|890
1000|1470|12500|5,5|0,8|1990|1150
1250|1740|15500|6,0|0,5|1765|1145
1600|1750|18200|6,0|0,5|1952|1260
2500|3000|28000|6,5|0,4|2070|1408
''','''
400|1445|1550|310
630|1610|1800|500
1000|1770|2915|860
1250|2038|3310|850
1600|2078|3863|1015
2500|2390|5860|1300
''',{'default':38},38,[39],description={'pdfPage':38,'text':'Масляная серия ТМГФ для открытых электроустановок; У1 и УХЛ1; 6 или 10 кВ.'})
family('tmg-copper','ТМГ','с медными обмотками','Трансформаторы ТМГ-25-2500 кВА с медными обмотками',[40,41,42,43],'''
25|120|650|4,0|3,0|800|499
40|160|1000|4,7|2,8|860|525
63|230|1280|4,0|2,6|915|560
100|310|1910|4,0|2,2|972|694
160|430|2670|4,0|1,9|1010|664
250|590|3700|4,0|1,8|1262|812
400|800|5500|4,0|1,2|1440|914
630|1000|8400|5,5|1,0|1568|866
1000|1470|12200|6,0|0,8|1744|995
1250|1950|13500|5,0|0,6|2058|1188
1600|1800|18000|6,0|0,5|1978|1128
2000|2400|20000|6,0|0,4|2100|1270
2500|2800|28000|6,5|0,4|2237|1424
''','''
25|845|450|400|90|190|80|95|255|80
40|949|450|400|105|190|82|102|282|70
63|925|500|400|90|190|85|110|410|94
100|955|550|450|90|190|95|110|535|110
160|980|550|550|90|190|115|120|672|136
250|1206|550|550|110|230|110|115|1049|293
400|1234|660|660|150|230|130|130|1310|247
630|1400|660|660|150|230|150|140|1695|340
1000|1550|820|820|190|230|180|150|2700|470
1250|1760|820|820|200|230|180|150|3650|700
1600|1798|820|820|210|250|180|170|3730|850
2000|1950|1070|1070|210|250|180|160|4810|970
2500|1951|1070|1070|145|260|220|170|5600|1300
''',{'default':40,1600:41,2000:41,2500:41},41,[42,43],description={'pdfPage':40,'text':'Медные обмотки; герметичное исполнение; полностью заполнен трансформаторным маслом; гофрированные стенки; без расширителя и газовой подушки.'})
family('tmg-switch-6-10','ТМГ','6↔10 кВ, с 2-х этажным переключателем','Трансформаторы ТМГ-25-2500 кВА с возможностью переключения на стороне ВН 6 кВ на 10 кВ с 2-х этажным переключателем',[44,45,46,47],'''
25|120|690|4,5|2,8|890|520
40|160|1000|4,5|2,8|900|535
63|210|1470|4,5|2,6|930|590
100|280|2270|4,5|2,2|970|660
160|450|3100|5,0|1,9|1120|790
250|610|4200|4,5|1,0|1140|820
400|780|5900|4,5|1,4|1310|805
630|1070|8500|5,5|1,0|1460|910
1000|1500|12500|5,5|1,0|1900|1060
1250|1740|15000|6,0|0,6|1950|1180
1600|1750|18000|6,5|0,5|1995|1390
2000|2600|25000|6,0|0,5|2040|1250
2500|2800|28000|6,5|0,5|2370|1480
''','''
25|980|450|400|105|190|90|100|490|95
40|995|450|400|105|190|90|100|510|100
63|1040|450|400|105|190|90|100|585|120
100|1090|550|550|90|190|95|110|645|160
160|1150|550|550|90|190|95|110|830|195
250|1225|550|550|110|230|110|115|935|240
400|1350|660|660|150|230|130|130|1395|275
630|1532|660|660|150|230|150|150|2650|750
1000|1760|820|820|190|230|190|160|3190|880
1250|1910|820|820|190|230|190|160|3980|950
1600|2117|1070|1070|210|250|180|160|4260|980
2000|1940|1070|1070|230|230|200|170|5440|1310
2500|2196|1070|1070|145|260|250|170|6065|1695
''',{'default':44,1600:45,2000:45,2500:45},45,[46,47],notes=['Drawings on pages 46–47 verified by neighboring section worker, outside assigned visual inspection range.'],description={'pdfPage':44,'text':'Переключение со стороны ВН 6 на 10 кВ и обратно; при 10 кВ У/Ун-0, при 6 кВ Д/Ун-11; переключение 15–20 минут; передвижные и перемещаемые установки.'})
source['sha256']='8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e'
source['filePath']=SOURCE_PDF_REFERENCE
source['catalogBrand']='Alageum Electric'
source['catalogBrandProvenance']='Parent verification of source page 3; Alageum electric logo on every assigned page'
# Drawing grouping is at construction-type level, never an asserted identical 3D mesh.
ASSETS=[
 {'id':'sealed-corrugated-small','title':'Small sealed corrugated-tank transformer, upper HV/LV bushings','evidencePages':[12,22,30,42],'reuseType':'parameterized construction template; source drawing illustration','scope':'Table models through 630 кВА under headings expressly linked to these drawings','observedFeatures':['Rectangular corrugated tank','HV/LV bushings on lid','Side oil-fill pipe and safety valve','Base channels, optional transport rollers','No conservator shown'],'limit':'Do not assume identical fin count, proportions, bushing spacing, or optional parts across powers. Use each model’s table measurements; lettered dimension units remain unspecified in source tables.'},
 {'id':'sealed-corrugated-large','title':'Large sealed corrugated-tank transformer, upper HV/LV bushings','evidencePages':[13,23,31,43],'reuseType':'parameterized construction template; source drawing illustration','scope':'Models 1000 кВА and above expressly associated with these drawings','observedFeatures':['Tall corrugated tank','Top-mounted HV and LV bushings','Base rollers/channels','Top instruments and optional protective equipment'],'limit':'A reusable topology, not one exact mesh. Drawing captions span different power ranges and variants; retain model-specific dimensions.'},
 {'id':'tm-conservator-small','title':'ТМ small corrugated tank with conservator','evidencePages':[16],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМ-16–400 table models','observedFeatures':['Cylindrical conservator above lid','Corrugated tank','Upper bushings','Transport rollers'],'limit':'Do not reuse sealed ТМГ image as exact TM: conservator is a source-grounded distinguishing feature.'},
 {'id':'tm-conservator-large','title':'ТМ large corrugated tank with conservator','evidencePages':[17],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМ-630–2500 table models','observedFeatures':['Large elevated conservator','Corrugated tank','Breather and optional gas relay','Transport rollers'],'limit':'Distinct from small ТМ drawing; use source-specific attachments rather than invent geometry.'},
 {'id':'tmgin-rpn-630','title':'ТМГиН-630 with on-load tap changer','evidencePages':[33],'reuseType':'single-source model illustration / construction template','scope':'ТМГиН-630, РПН Х4К3','observedFeatures':['Corrugated sealed tank','РПН identified in top view','Side-mounted box shown','Upper bushings and transport rollers'],'limit':'Do not merge with ordinary 630 кВА body without retaining РПН layout.'},
 {'id':'tmgs-pole-mount','title':'ТМГС with pole-mounting bracket','evidencePages':[35],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМГС-25–160 столбовой table models','observedFeatures':['Mounting bracket identified as item 21','Corrugated sealed tank','Upper bushings','Side mounting structure visible in front and plan views'],'limit':'Pole bracket distinguishes this construction from standard ТМГ.'},
 {'id':'tmz-panel-radiator','title':'ТМЗ nitrogen-cushion tank with panel radiators','evidencePages':[37],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМЗ-400–2500 table models','observedFeatures':['Panel radiators identified as item 20','Side-mounted HV/LV bushings','Oil indicator, nitrogen filling plug, manovacuummeter','Transport wheels'],'limit':'Separate topology from corrugated-tank ТМГ. No dimensions beyond source table values should be inferred.'},
 {'id':'tmgf-separated-bushings','title':'ТМГФ tank with HV/LV groups on opposite ends of lid','evidencePages':[39],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМГФ-400–2500 table models','observedFeatures':['Corrugated tank','HV and LV bushings on opposed short ends in plan','Top instrument group','Transport rollers'],'limit':'Do not label as flange configuration beyond literal series name; prose does not define Ф. Distinct terminal layout is visually explicit.'},
 {'id':'tmg-switch-small','title':'ТМГ 6↔10 kV, two-level switch, small construction','evidencePages':[46],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМГ-25–630 с 2-х этажным переключателем','observedFeatures':['Three orthogonal views of small corrugated-tank construction'],'limit':'Page evidence supplied by neighboring section 046–101; this worker did not visually review page 46. Retain distinct switch configuration.'},
 {'id':'tmg-switch-large','title':'ТМГ 6↔10 kV, two-level switch, large construction','evidencePages':[47],'reuseType':'parameterized construction template; source drawing illustration','scope':'ТМГ-1000–2500 с 2-х этажным переключателем','observedFeatures':['Three orthogonal views of larger corrugated-tank construction'],'limit':'Page evidence supplied by neighboring section 046–101; this worker did not visually review page 47. Retain distinct switch configuration.'},
]
DRAWTITLES={12:'ТМГ-16-630 стандартный, ТМГ Х1К1 и ТМГ(01)',13:'ТМГ-1000-3200 стандартный, ТМГ Х1К1 и ТМГ(01)',16:'ТМ-16-400',17:'ТМ-630-2500',22:'ТМГэ-40-630 Х2К1 и Х2К2',23:'ТМГэ-1000-2500 Х2К1 и Х2К2',30:'ТМГвэ-40-630 Х3К3 и Х4К3',31:'ТМГвэ-1000-2500 Х3К3 и Х4К3',33:'ТМГиН-630 с РПН Х4К3',35:'ТМГС-25-160',37:'ТМЗ-400-2500',39:'ТМГФ-400-2500',42:'ТМГ-25-630',43:'ТМГ-1000-2500'}
for pg,title in DRAWTITLES.items():
 pages[pg]['headings']=[title];pages[pg]['pageType']='dimensioned-construction-drawing';pages[pg]['drawings']=[{'titleRaw':title,'views':['front','side','plan'],'dimensioning':'Lettered dimension callouts; numerical values come from associated technical tables','photo':False,'page':pg,'assetFamilyIds':[a['id'] for a in ASSETS if pg in a['evidencePages']]}]
 pages[pg]['notes'].append('Part-number callouts and parts legend visually inspected. Drawing is source evidence, not a dimensional CAD model.')

def mapping(p):
 fid=p['familyId']; power=p['nominalPowerKva']; small=power<=630
 if fid in ['tmg-standard','tmg-01','tmg-x1k1']:return ('sealed-corrugated-small' if small else 'sealed-corrugated-large',12 if small else 13,'explicit drawing heading groups this variant')
 if fid=='tm-standard':return ('tm-conservator-small' if power<=400 else 'tm-conservator-large',16 if power<=400 else 17,'explicit power-group drawing')
 if fid in ['tmge-x2k1','tmge-x2k2']:return ('sealed-corrugated-small' if small else 'sealed-corrugated-large',22 if small else 23,'explicit Х2К1/Х2К2 drawing heading')
 if fid in ['tmgve-x3k3','tmgi-x4k3']:return ('sealed-corrugated-small' if small else 'sealed-corrugated-large',30 if small else 31,'drawing expressly lists Х3К3 and Х4К3; series label discrepancy retained')
 if fid=='tmgve-x3k2':return (None,None,'No explicit Х3К2 drawing found; structurally similar candidates are not sufficient for verified mapping')
 if fid=='tmgin-x4k3':return ('tmgin-rpn-630',33,'specific model drawing')
 if fid=='tmgs-pole':return ('tmgs-pole-mount',35,'explicit pole-mount family drawing')
 if fid=='tmz-panel':return ('tmz-panel-radiator',37,'explicit panel-radiator family drawing')
 if fid=='tmgf':return ('tmgf-separated-bushings',39,'explicit family drawing and observed terminal layout')
 if fid=='tmg-copper':return ('sealed-corrugated-small' if small else 'sealed-corrugated-large',42 if small else 43,'drawings directly follow copper-winding tables; same visible construction topology')
 if fid=='tmg-switch-6-10':return ('tmg-switch-small' if small else 'tmg-switch-large',46 if small else 47,'explicit continuation drawing confirmed by section 046–101 source review')

OLD=json.load(open(args.old_records))
CONFIGS=[]
for p in P:
 a,pg,why=mapping(p)
 p['assetMapping']={'assetFamilyId':a,'evidencePages':[pg] if pg else [],'basis':why,'reuseLevel':'construction topology and source illustration only' if a else 'unverified','geometryVerified':False,'exactMeshReuseAllowed':False}
 p['assetMapping']['dimensionalUnitsVerified']=False
 p['assetMapping']['dimensionAccurateMeshAuthorizedByEvidence']=False
 p['assetMapping']['executionBinding']='explicit-caption' if a else 'unverified'
 p['assetMapping']['executionBindingUncertain']=False if a else True
 if p['familyId']=='tmg-copper':
  p['assetMapping']['executionBinding']='adjacent-family-context; caption names broad ТМГ only'
  p['assetMapping']['executionBindingUncertain']=True
 if p['familyId']=='tmgi-x4k3':
  p['assetMapping']['executionBinding']='Х4К3 explicitly named; caption series ТМГвэ conflicts with table series ТМГи'
  p['assetMapping']['executionBindingUncertain']=True
 if p['familyId']=='tmg-switch-6-10':
  p['assetMapping']['executionBinding']='explicit continuation caption verified by neighboring section worker'
 p['sourcePages']=sorted(set(p['dataPages']+([pg] if pg else [])))
 p['designation']=p['modelDesignationRaw'];p['execution']=p['variantLabel'];p['sourceRow']={'designation':p['designation'],'electricalTablePage':p['rawSourceSpecs'][0]['pdfPage'],'dimensionsTablePage':next(s['pdfPage'] for s in p['rawSourceSpecs'] if s['label']=='H')}
 p['technicalSpecs']=[{'label':s['label'],'value':s['value'],'unit':s['unit'],'page':s['pdfPage']} for s in p['rawSourceSpecs']]
 if p['familyId']=='tmgf':
  p['execution']=None;p['variantLabel']=None;p['name']=p['modelDesignationRaw']
 if p['familyId']=='tmg-switch-6-10':
  p['execution']='с возможностью переключения на стороне ВН 6 кВ на 10 кВ с 2-х этажным переключателем'
 p['candidateOldIds']=[]
 series=p['series'].replace(' ','')
 for o in OLD:
  if o.get('series')==series and o.get('power')==p['nominalPowerKva'] and o.get('voltage')=='6/10 → 0,4':
   p['candidateOldIds'].append(o['id'])
   ambiguous=series=='ТМГ'
   p['reconciliation'].append({'oldId':o['id'],'status':'ambiguous-generic-reference' if ambiguous else 'strong-candidate-needs-provenance-check','matchedEvidence':['Same named series','Same nominal power','Equivalent 6/10-to-0.4-kV voltage choices','Both sourced to Alageum catalog/website'],'differencesOrGaps':['Old record has a broad multi-manufacturer claim; new source does not assign legal manufacturer for this family','Old record lacks electrical losses and dimensions to establish exact execution']+(['Old generic designation can match standard, 01, Х1К1, copper-winding, or switchable variants; these are separate new-source records'] if ambiguous else []),'automaticMergeAllowed':False,'recommendedAction':'Retain source-specific variant; review old identity before enrichment or merge'})
 for i,c in enumerate(p['configurations'],1):CONFIGS.append({'id':p['id']+'-connection-'+str(i),'modelId':p['id'],'familyId':p['familyId'],'page':p['sourceRow']['electricalTablePage'],**c})
 if p['familyId']=='tmgin-x4k3':p['designationAliases']=[{'designation':'ТМГиН-630/10-0,4','page':32,'location':'heading'}]
 if p['familyId']=='tmgi-x4k3':p['seriesHeadingRaw']='ТМГи'
 if pg in pages:pages[pg]['productIds'].append(p['id'])
 if p['familyId']=='tmgve-x3k2':p['notes'].append('Construction asset left unresolved; no assigned drawing explicitly covers Х3К2.')

for f in F:
 if f['id']=='tmgf':f['variantLabel']=None
 f['designation']=f['headingRaw'];f['title']=f['headingRaw'];f['modelCount']=sum(p['familyId']==f['id'] for p in P)
 f['modelIds']=[p['id'] for p in P if p['familyId']==f['id']]
 f['technicalSpecs']=[]
 pg=f['sourcePages'][0]
 if f['id'] in ['tmg-standard','tmg-01','tmg-x1k1','tm-standard','tmge-x2k1','tmge-x2k2','tmg-copper','tmg-switch-6-10']:
  f['technicalSpecs'] += [{'label':'Температура умеренного климата','value':'от +40°C до -45°C','unit':'°C','page':pg},{'label':'Температура холодного климата','value':'от +40°C до -60°C','unit':'°C','page':pg},{'label':'Установка','value':'наружной или внутренней','unit':None,'page':pg}]
 if f['id'] in ['tmg-standard','tmg-01','tm-standard','tmg-copper']:
  f['technicalSpecs'] += [{'label':'Высота установки над уровнем моря','value':'не более 1000','unit':'м','page':pg}]
 if f['id'] in ['tmg-standard','tmg-copper']:
  f['technicalSpecs'] += [{'label':'Исполнение','value':'герметичное; внутренний объем не имеет сообщения с окружающей средой','unit':None,'page':pg},{'label':'Заполнение','value':'полностью заполнены трансформаторным маслом','unit':None,'page':pg},{'label':'Стенки','value':'гофрированные, для увеличения поверхности охлаждения и компенсации температурного расширения масла','unit':None,'page':pg},{'label':'Расширитель / газовая подушка','value':'Расширитель и воздушная или газовая «подушка» отсутствуют','unit':None,'page':pg},{'label':'Подготовка масла','value':'перед заливкой в трансформатор дегазируется','unit':None,'page':pg}]
 if f['id']=='tmg-01':
  f['technicalSpecs'] += [{'label':'Исполнение','value':'герметичное; внутренний объем не имеет сообщения с окружающей средой','unit':None,'page':8},{'label':'Заполнение','value':'полностью заполнены трансформаторным маслом','unit':None,'page':8},{'label':'Подготовка масла','value':'перед заливкой в трансформатор дегазируется','unit':None,'page':8}]
 if f['id'] in ['tmg-standard','tmg-01','tm-standard','tmg-copper']:
  f['technicalSpecs'] += [{'label':'Исключенные условия работы','value':'тряска, вибрация, удары, химически активная среда','unit':None,'page':pg}]
 if f['id'] in ['tmg-x1k1','tmge-x2k1','tmge-x2k2','tmgve-x3k2','tmgve-x3k3','tmgi-x4k3']:
  f['technicalSpecs'] += [{'label':'Стандарт потерь','value':'ПАО «РОССЕТИ» СТО 34.01-3.2-011-2017','unit':None,'page':pg},{'label':'Класс / уровень потерь','value':f['variantLabel'],'unit':None,'page':pg}]
 if f['id']=='tmgin-x4k3':
  f['technicalSpecs'] += [{'label':'РПН','value':'система автоматического регулирования напряжения под нагрузкой','unit':None,'page':32},{'label':'Мониторинг','value':'цифровой мониторинг технологических параметров','unit':None,'page':32},{'label':'Управление','value':'посредством мобильного приложения в автоматическом либо дистанционном режиме','unit':None,'page':32},{'label':'Переключатель ступеней','value':'электроприводной; вакуумные коммутационные элементы; цифровой контроллер','unit':None,'page':32},{'label':'Питание привода и контроля','value':'непосредственно от трансформатора при его подключении к электрической сети','unit':None,'page':32}]
 if f['id']=='tm-standard':
  f['technicalSpecs'] += [{'label':'Регулирование напряжения ПБВ со стороны ВН','value':'±2x2,5','unit':'%','page':14},{'label':'Климатическое исполнение','value':'У1','unit':None,'page':14},{'label':'Маслорасширитель','value':'установлен на крышке бака; вентиляционное отверстие соединенное через воздухоочиститель','unit':None,'page':14},{'label':'Диапазон мощности (текст)','value':'25–2500','unit':'кВА','page':14}]
 if f['id']=='tmgs-pole':f['technicalSpecs'] += [{'label':'Крепление','value':'непосредственно на железобетонной опоре','unit':None,'page':34}]
 if f['id']=='tmz-panel':f['technicalSpecs'] += [{'label':'Защита масла','value':'сухой азот между зеркалом масла и крышкой трансформатора','unit':None,'page':36},{'label':'Диапазон регулирования','value':'±2x2,5','unit':'%','page':36}]
 if f['id']=='tmgf':f['technicalSpecs'] += [{'label':'Климатическое исполнение','value':'У1 и УХЛ1','unit':None,'page':38},{'label':'Установка','value':'в открытых электроустановках','unit':None,'page':38}]
 if f['id']=='tmg-copper':f['technicalSpecs'] += [{'label':'Материал обмоток','value':'медные','unit':None,'page':40}]
 if f['id']=='tmg-switch-6-10':f['technicalSpecs'] += [{'label':'Длительность переключения','value':'15–20','unit':'минут','page':44},{'label':'Переключение ВН','value':'с 6 кВ на 10 кВ и наоборот с 10 на 6 кВ','unit':'кВ','page':44}]

for pg,p in pages.items():
 p['productIds']=sorted(set(p['productIds']));p['explicitTableRowCount']=sum(pg==m['sourceRow']['electricalTablePage'] for m in P);p['dimensionsTableRowCount']=sum(pg==m['sourceRow']['dimensionsTablePage'] for m in P)
 p['ocrTextPath']=f'ocr/p{pg:03d}.txt'
 if p['pageType']=='technical-tables' and not p['headings']:p['headings']=['Технические характеристики / продолжение таблицы']
 p['namedSeries']=sorted(set(f['seriesRaw'] for f in F if f['id'] in p['familyIds']))
 p['explicitModelDesignations']=[m['designation'] for m in P if pg in m['dataPages']]
 if pg in [24,25]:p['notes'].append('Х3К2 has no explicitly linked drawing in this section.')
 if pg in [30,31]:p['notes'].append('Caption says ТМГвэ for both Х3К3 and Х4К3; tables call Х4К3 ТМГи. Preserved discrepancy, not corrected.')
 if pg==14:p['notes'].append('Body range starts at 25 кВА, heading/table include 16 кВА.')
 if pg in [27,29]:p['notes'].append('63-кВА dimension sequence M=110,K=85,h=190,h1=90 appears unusual but is as printed.')

for a in ASSETS:
 a['modelIds']=[p['id'] for p in P if p['assetMapping']['assetFamilyId']==a['id']]
 a['modelCount']=len(a['modelIds']);a['familyIds']=sorted(set(p['familyId'] for p in P if p['assetMapping']['assetFamilyId']==a['id']))
 a['sourcePhotoEvidence']=False;a['sourceDrawingEvidence']=True;a['exactMeshClaim']=False;a['dimensionAccurateMeshAllowed']=False;a['perModelExecutionBindingMustBeChecked']=True

NOTES=[
 '144 explicit table rows across 15 named execution groups. A row is a product-model variant, not a generated complete SKU.',
 'Every physical page 6–45 visually inspected. Printed numbers equal physical page numbers. Drawings on 46–47 are continuation evidence supplied by adjacent section worker.',
 'Connection choices, 6/10 voltage choices, climatic choices, and heading ranges are not expanded into synthetic products.',
 'No legal manufacturer inferred from catalog brand. АО «КТЗ» is explicitly stated only for ТМГиН-630 on page 32 within this section.',
 'Dimension columns L, B, H, A, A1, M, K, h, h1 do not show a unit in these source tables or drawing captions. Values preserved, units null; do not silently assume mm.',
 'No complete ordering SKU is invented from short row designation + voltage + execution. Full heading alias ТМГиН-630/10-0,4 is preserved for that model.',
 'For standard, 01, and pole variants, multiple connection groups and their vertically aligned Pк/Uк values remain bounded configurations of one table row.',
 'Х3К2 construction mapping is unresolved because drawings expressly mention Х3К3 and Х4К3. Do not add Х3К2 without further source evidence.',
 'Pages 30–31 call both Х3К3 and Х4К3 ТМГвэ, whereas pages 28–29 call Х4К3 ТМГи; preserved source inconsistency.',
 'ТМ page 14 prose says 25–2500 кВА while heading and table include 16 кВА. Source table row retained.',
 'Unusual dimension or oil-mass values preserved as printed, particularly the 63-кВА rows on pages 27 and 29; no numerical corrections invented.',
 'Candidate old overlaps are based on exact series, rated power and equivalent voltage values, plus shared Alageum source, never fuzzy category matching. Eight unique old IDs have candidates; exact execution/manufacturer identity remains unproven.',
 'No assigned pages contain product photographs; all construction evidence is line drawings. Asset reuse is limited to parameterized construction topology/source illustration, not an identical detailed 3D model.'
]
obj={'source':source,'families':F,'models':P,'configurations':CONFIGS,'notes':NOTES,'summary':{'familyCount':len(F),'explicitModelCount':len(P),'configurationCount':len(CONFIGS),'inspectedPageCount':len(pages),'assetConstructionFamilyCount':len(ASSETS),'unresolvedAssetModelCount':sum(p['assetMapping']['assetFamilyId'] is None for p in P),'candidateOldIds':sorted(set(x for p in P for x in p['candidateOldIds']))}}
json.dump(obj,open(D/'inventory.json','w'),ensure_ascii=False,indent=2)
json.dump({'sourceId':source['id'],'range':[6,45],'pages':list(pages.values())},open(D/'page-ledger.json','w'),ensure_ascii=False,indent=2)
json.dump({'sourceId':source['id'],'assetFamilies':ASSETS,'unresolved':[{'familyId':'tmgve-x3k2','reason':'No explicitly labelled Х3К2 construction drawing in assigned pages','modelIds':[p['id'] for p in P if p['familyId']=='tmgve-x3k2']}],'rules':['Use source dimensions only; do not derive dimensions or detailed geometry from page scale','No complete SKU generated','Construction template reuse does not mean exact mesh reuse']},open(D/'asset-families.json','w'),ensure_ascii=False,indent=2)
(D/'notes.md').write_text('# Pages 6–45 extraction\n\n'+'\n'.join('- '+n for n in NOTES)+'\n\n## Counts\n\n'+'\n'.join('- '+f['id']+': '+str(f['modelCount'])+' explicit rows' for f in F)+'\n\n## Files\n\n- inventory.json: complete family, model, configuration and candidate-overlap records\n- page-ledger.json: all 40 inspected pages\n- asset-families.json: construction-level evidence and mappings\n- renders/: source visual review images\n- ocr/: auxiliary non-authoritative Russian/English OCR and higher-resolution renders\n',encoding='utf-8')
assert len(P)==144
assert len(pages)==40 and all(x['pageType'] for x in pages.values())
assert len({x['id'] for x in P})==len(P)
assert all(x['technicalSpecs'] and x['designation'] and x['sourcePages'] for x in P)
print(json.dumps(obj['summary'],ensure_ascii=False))
