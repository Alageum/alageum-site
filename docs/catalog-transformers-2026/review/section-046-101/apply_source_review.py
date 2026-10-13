"""Source-scoped review augmentation, used by the original inventory generator."""
import json
from pathlib import Path

def apply_model_additions(models, spec_factory, root):
    review=json.loads((Path(root)/'source-scoped-additions.json').read_text())
    groups=[]
    for index, source_group in enumerate(review['requiredCommonProseAdditions'],1):
        group=dict(source_group)
        group['id']=f'common-prose-{index:02}-p{group["sourcePage"]}'
        ids=group.get('rowIds')
        if ids is not None:
            targets=[r for r in models if r['id'] in ids]
            assert {r['id'] for r in targets}==set(ids),group['id']
        elif group['familyIds']==['dry-accessories']:
            selected=(['alageum-2026-relay-tr100','alageum-2026-sensor-pt100'] if group['sourcePage']==85 else ['alageum-2026-cooling-fans'])
            targets=[r for r in models if r['id'] in selected]
        else:
            targets=[r for r in models if r['familyId'] in group['familyIds'] and r['recordType']=='explicit-model-row']
        assert targets,group['id']
        assert all(r['familyId'] in group['familyIds'] for r in targets)
        group['appliedModelIds']=[r['id'] for r in targets if r['recordType']!='accessory-configuration-range']
        group['appliedConfigurationIds']=[r['id'] for r in targets if r['recordType']=='accessory-configuration-range']
        group['scopePolicy']='Only listed model/configuration IDs; no inheritance to other family records or drawing-only models.'
        for row in targets:
            for field in ([] if group.get('configurationOnly') else group['fields']):
                raw=spec_factory(field['label'],field['value'],field['unit'],field['page'])
                raw.update(sourceKind='common-prose',commonProseGroupId=group['id'])
                key=lambda s:(s['label'],s['raw'],s['unitAsPrinted'],s['sourcePage'])
                if not any(key(s)==key(raw) for s in row['rawSpecs']):row['rawSpecs'].append(raw)
            row.setdefault('commonProseGroupIds',[]).append(group['id'])
            if group['sourcePage']==72:
                warning='Page72 environmental condition literally says Не взрывоопасной и химически активной среде. Odd wording preserved without adding a missing не.'
                if warning not in row['uncertainties']:row['uncertainties'].append(warning)
            if group['sourcePage']==91:
                warning='The non-burning/no-toxic-smoke statement is a catalog claim, not an independently verified safety certification.'
                if warning not in row['uncertainties']:row['uncertainties'].append(warning)
        groups.append(group)
    # Numeric values on continuation87; printed voltage unit comes from header86.
    for row in models:
        if row['id'] in {f'alageum-2026-ts-{p}' for p in [16,25,40,63,100]}:
            for raw in row['rawSpecs']:
                if raw['label'] in ['ВН','НН']:
                    assert raw['sourcePage']==86 and raw['raw'] in ['380','220']
                    raw['sourcePage']=87
                    raw['unitHeaderSourcePage']=86
        if row['id'] in {'alageum-2026-om-'+p for p in ['0p63','1p25','2p5','4-p','10-p']}:
            for raw in row['rawSpecs']:
                if raw['label'] in ['Напряжение ступеней регулирования при6кВ','Напряжение ступеней регулирования при10кВ']:
                    assert raw['unitAsPrinted']=='кВ'
                    raw['unitAsPrinted']=None
                    raw['inferredUnit']='кВ'
                    raw['unitInferenceNote']='Tap-voltage column does not print a unit; кВ inferred from adjacent nominal-voltage header and values. No numerical conversion.'
        if row['id'] in ['alageum-2026-tmto80-original','alageum-2026-tmto80-modern']:
            for raw in row['rawSpecs']:
                if raw['label']=='Мощность/положение/напряжение ответвлений':
                    assert raw['unitAsPrinted']=='кВА / — / В'
                    raw['unitAsPrinted']='кВА / — / —'
                    raw['inferredUnit']='кВА / — / В'
                    raw['unitInferenceNote']='Only power subcolumn prints кВА; tap voltage В is inferred from adjacent nominal-voltage columns. No numerical conversion.'
    return groups

def apply_family_additions(families, models, configurations, ledger, groups):
    byid={r['id']:r for r in models}
    for group in groups:
        for family_id in group['familyIds']:
            family=families[family_id]
            model_ids=[rid for rid in group['appliedModelIds'] if byid[rid]['familyId']==family_id]
            config_ids=[cid for cid in group['appliedConfigurationIds'] if any(c['id']==cid and c['familyId']==family_id for c in configurations)]
            if not model_ids and not config_ids:continue
            entry={'id':group['id'],'sourcePage':group['sourcePage'],'appliesToModelIds':model_ids,'appliesToConfigurationIds':config_ids,'technicalSpecs':group['fields'],'scopePolicy':group['scopePolicy']}
            if group.get('configurationOnly'):
                entry['technicalSpecs']=[]
                entry['status']='verified-existing-configuration-without-duplicating-fields'
                entry['referencesConfigurationSpecs']=[{'configurationId':cid,'labels':['Количество','Увеличение мощности трансформатора']} for cid in config_ids]
            if group.get('note'):entry['note']=group['note']
            family.setdefault('sourceScopedCommonSpecs',[]).append(entry)
            family['sourcePages']=sorted(set(family['sourcePages']+[group['sourcePage']]))
        page=ledger[group['sourcePage']]
        page.setdefault('commonProseGroupIds',[]).append(group['id'])
        if 'common-prose' not in page['contentTypes']:page['contentTypes'].append('common-prose')
    families['tmpn-top']['designation']='ТМПН(Г)'
    families['tmpn-top']['title']='ТМПН(Г) — верхние выводы по чертежу66'
    families['ts-low-voltage']['title']='Трансформаторы серии ТС(З)'
