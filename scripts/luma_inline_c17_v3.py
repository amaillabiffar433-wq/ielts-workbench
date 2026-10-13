"""Create a new immutable pack version; retain every existing pack/session ID.

Gap anchors come from the source PDF's number + blank line structure. Ordinary
numbers inside sentences (dates, ages, prices) must never become answer slots.
"""
import datetime,json,re,shutil
from luma_import_c17 import OUT,DEST,READING,LISTENING,region,compact

report=[]
for test in range(1,5):
    old=f'cambridge-17-academic-test-{test}-luma-v2';new=old[:-1]+'3'
    target=DEST/new
    assert not target.exists(),f'Immutable destination already exists: {new}'
    shutil.copytree(DEST/old,target)
    for file in [target/'manifest.json',*(target/'modules').glob('*.json')]:
        value=json.loads(file.read_text(encoding='utf-8').replace(old,new))
        if file.name=='manifest.json':value['createdAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        file.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    for skill,specs in [('reading',[sp for _,groups in READING[test] for sp in groups]),('listening',[sp for groups in LISTENING[test] for sp in groups])]:
        file=target/'modules'/f'{skill}.json';module=json.loads(file.read_text(encoding='utf-8'))
        for page,lo,hi,kind in specs:
            if kind!='g':continue
            raw=region(page,lo,hi)[2]
            # Footer page numbers are printed in a separate em-space line.
            raw=re.split(r'\n\d+\u2003',raw)[0]
            instructions=list(re.finditer(r'(?mi)^.*(?:answer sheet\.|for each answer\.?\s*$).*$',raw))
            assert instructions,(page,'Missing instruction boundary')
            body=raw[instructions[-1].end():].strip()
            slots=list(re.finditer(r'(?<![\w\d,])('+'|'.join(map(str,range(lo,hi+1)))+r')(?=[ \t\u00a0]*(?:£[ \t]*)?\n[ \t]*\n)',body))
            assert [int(s[1]) for s in slots]==list(range(lo,hi+1)),(page,[s[1] for s in slots])
            group=next(g for s in module['sections'] for g in s['questionGroups'] if g['questions'][0]['number']==lo)
            gid=group['id'];parts=[];cursor=0
            for index,slot in enumerate(slots):
                before=body[cursor:slot.start()]
                # Blank space after the previous answer is typographic padding;
                # preserve bullet/heading newlines while joining that blank.
                before=re.sub(r'^([ \t\u00a0]*(?:£[ \t]*)?)\n[ \t]*\n[ \t]*',r'\1 ',before)
                before=re.sub(r'•[ \t]*\n[ \t]*','• ',before)
                before=re.sub(r'[ \t\u00a0]+',' ',before)
                if before:parts.append(dict(id=f'{gid}-inline-text-{index}',kind='text',text=before))
                parts.append(dict(id=f'{gid}-inline-answer-{slot[1]}',kind='answer',questionId=f'{new}-{skill}-q{slot[1]}'))
                cursor=slot.end()
            tail=re.sub(r'^([ \t\u00a0]*(?:£[ \t]*)?)\n[ \t]*\n[ \t]*',r'\1 ',body[cursor:])
            tail=re.sub(r'•[ \t]*\n[ \t]*','• ',tail)
            if tail:parts.append(dict(id=gid+'-inline-tail',kind='text',text=tail))
            group['contextBlocks']=[dict(id=gid+'-inline-source',type='completion',style='notes',parts=parts),*[b for b in group['contextBlocks'] if b['type']!='completion']]
            group['instructions']=compact(raw[:instructions[-1].end()])
            report.append(dict(packId=new,skill=skill,sourcePage=page,questions=list(range(lo,hi+1)),allSlotsBoundExactlyOnce=True))
        for section in module['sections']:
            for group in section['questionGroups']:
                bound=[p['questionId'] for b in group['contextBlocks'] if b['type']=='completion' for p in b['parts'] if p['kind']=='answer']
                gaps=[q['id'] for q in group['questions'] if q['type'] in ['short-answer','fill-blank']]
                assert sorted(bound)==sorted(gaps),(new,group['id'],'Unbound/duplicate gap')
        file.write_text(json.dumps(module,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'INLINE_SOURCE_VALIDATION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'newPacks':4,'gapGroups':len(report),'inlineQuestionUnits':sum(len(r['questions']) for r in report),'oldPacksPreserved':True}))
