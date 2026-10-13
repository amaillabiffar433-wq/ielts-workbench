"""Conservative source-page Reading adapter; ambiguous fields remain unscored.

Runs against every inventoried PDF, records every rejection, never guesses keys,
and publishes source-backed draft modules separately from manually checked tests.
"""
from pathlib import Path
import datetime,hashlib,json,re
import fitz
from luma_audit import OUT,digest

inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']
destination=OUT/'private/BulkImportable'
reports=[]; seen=set(); fingerprints={}
now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

def tidy(text): return re.sub(r'\s+',' ',text).strip()
def normalized(text): return tidy(re.sub(r'(?m)^\s*(?:\d+|Test\s*\d+)\s*$','',text)).lower()

def answer_columns(page):
    keys={}; conflicts=set()
    for left,right in [(0,page.rect.width/2),(page.rect.width/2,page.rect.width)]:
        words=sorted([w for w in page.get_text('words') if left<=w[0]<right],key=lambda w:(w[1],w[0]))
        lines=[]
        for w in words:
            if not lines or abs(w[1]-lines[-1][0])>2.5: lines.append([w[1],[w]])
            else: lines[-1][1].append(w)
        for _,row in lines:
            text=tidy(' '.join(w[4] for w in sorted(row,key=lambda w:w[0])))
            match=re.match(r'^(\d{1,2})\s+(.+)$',text)
            if not match or not 1<=int(match[1])<=40: continue
            n=int(match[1]);value=match[2].strip()
            if n in keys and keys[n]!=value: conflicts.add(n)
            keys[n]=value
    for n in conflicts: keys.pop(n,None)
    return keys

def question_headers(page):
    result=[]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            text=''.join(s['text'] for s in line['spans']).strip()
            match=re.match(r'^Questions?\s+(\d{1,2})\s*(?:[–—-]|and)\s*(\d{1,2})\s*$',text,re.I)
            if match: result.append((line['bbox'][1],int(match[1]),int(match[2])))
    return sorted(set(result))

for source in inventory:
    if source['extension']!='.pdf' or source['sha256'] in seen: continue
    seen.add(source['sha256'])
    report={'sha256':source['sha256'],'source':source['relativePath'],'packs':[],'blockers':[]}
    reports.append(report)
    if source['sha256']=='ed158d15034bec9bb4a484c237b69c6ac3c964cb506505e0106b1b4cadbf1ef1':
        report['status']='handled-by-verified-c17-adapter';continue
    pages=json.loads((OUT/'private/pdf-text'/f"{source['sha256']}.json").read_text(encoding='utf-8'))
    if sum(len(p) for p in pages)<10000:
        report['blockers'].append('No sufficiently complete text layer; needs targeted OCR and source-key verification');continue
    starts=[(i,int(m[1])) for i,text in enumerate(pages) if (m:=re.search(r'(?m)^\s*READING\s+PASSAGE\s+([123])\s*$',text))]
    if not starts:
        report['blockers'].append('No unambiguous Academic passage boundaries; General Training, teaching materials, or OCR layout need a separate adapter');continue
    if any(word in Path(source['path']).stem for word in ['精讲','解析']):
        report['blockers'].append('Commentary/answer-interleaved source; retained for viewing, excluded from blind practice extraction');continue
    doc=fitz.open(source['path'])
    if any(page.rect.width/page.rect.height>1.3 for page in doc):
        report['blockers'].append('Spread layout requires independent page/column mapping');continue
    key_candidates=[]
    for i,text in enumerate(pages):
        if re.search(r'(?mi)^\s*(?:ACADEMIC\s+)?READING\s*$',text) and re.search(r'(?i)CORRECT SPELLING|If you score|Ifyou score',text):
            keys=answer_columns(doc[i])
            if len(keys)>=20:key_candidates.append((i,keys))
    tests=[]
    for index,(start,number) in enumerate(starts):
        if number!=1:continue
        triple=starts[index:index+3]
        if [n for _,n in triple]!=[1,2,3]:continue
        stop=next((i for i in range(triple[-1][0]+1,min(len(pages),triple[-1][0]+15)) if re.search(r'(?i)WRITING\s+TASK\s+1',pages[i])),None)
        if stop is None: report['blockers'].append(f'Passage at PDF page {start+1}: Writing boundary is unclear');continue
        tests.append((triple,stop))
    for test_index,(triple,stop) in enumerate(tests):
        text='\n'.join(pages[triple[0][0]:stop])
        # Garbled OCR is not promoted to editable canonical prose.
        bad=sum(c in '「」�' or '\u4e00'<=c<='\u9fff' for c in text)
        if bad/max(len(text),1)>0.001:
            report['blockers'].append(f'Test candidate {test_index+1}: corrupt OCR characters in question/passage text ({bad}); preserve original pages for manual repair');continue
        keys=key_candidates[test_index][1] if len(key_candidates)==len(tests) else {}
        keypage=key_candidates[test_index][0]+1 if keys else None
        fingerprint=hashlib.sha256((normalized(text)+json.dumps(keys,sort_keys=True)).encode()).hexdigest()
        if fingerprint in fingerprints:
            report['packs'].append({'duplicateOf':fingerprints[fingerprint],'sourceContentHash':fingerprint});continue
        volume=re.search(r'(?:真题|雅思|IELTS\s*)(\d{1,2})',Path(source['path']).stem,re.I)
        volume=volume[1] if volume else source['sha256'][:6]
        packid=f'luma-source-{source["sha256"][:16]}-reading-t{test_index+1}-v1'
        folder=destination/packid;(folder/'modules').mkdir(parents=True,exist_ok=True);(folder/'media/images').mkdir(parents=True,exist_ok=True)
        media=[];issues=[];sections=[];numbers=set();scored=0
        def image(pn,clip=None):
            pix=doc[pn].get_pixmap(matrix=fitz.Matrix(1.7,1.7),clip=clip,alpha=False)
            data=pix.tobytes('png');sha=hashlib.sha256(data).hexdigest();rel=f'media/images/{sha}.png';(folder/rel).write_bytes(data)
            aid=packid+'-image-'+sha[:16]
            if not any(a['id']==aid for a in media):media.append(dict(id=aid,type='image',relativePath=rel,mimeType='image/png',width=pix.width,height=pix.height,alt=f'Original PDF page {pn+1}',sha256=sha))
            return dict(type='snapshot',assetId=aid,sourcePage=pn+1,altText=f'Original PDF page {pn+1}')
        for si,(start,_) in enumerate(triple):
            end=triple[si+1][0] if si<2 else stop
            blocks=[];groups=[]
            for pn in range(start,end):
                blocks.append(dict(id=f'{packid}-p{pn+1}',kind='paragraph',text=f'Original passage and question source · PDF page {pn+1}',visual=image(pn)))
                headers=question_headers(doc[pn])
                for gi,(top,lo,hi) in enumerate(headers):
                    if not 1<=lo<=hi<=40 or any(n in numbers for n in range(lo,hi+1)):continue
                    bottom=headers[gi+1][0]-4 if gi+1<len(headers) else doc[pn].rect.height-18
                    box=fitz.Rect(10,max(0,top-3),doc[pn].rect.width-10,bottom)
                    raw=doc[pn].get_text(clip=box,sort=True);upper=raw.upper();kind=None
                    if all(x in upper for x in ['TRUE','FALSE','NOT GIVEN']):kind='true-false-not-given'
                    elif all(x in upper for x in ['YES','NO','NOT GIVEN']):kind='yes-no-not-given'
                    elif re.search(r'(?i)(?:ONE|TWO|THREE) WORD|NO MORE THAN|ONE NUMBER',raw):kind='short-answer'
                    elif re.search(r'(?i)Choose (?:TWO|THREE|FOUR) letters',raw):
                        issues.append(f'Q{lo}-{hi}: multi-select scoring requires manual group/key mapping');continue
                    elif re.search(r'(?i)letter|heading|match',raw):kind='matching' if re.search(r'(?i)match|heading|list|paragraph|section|A\s*[–-]\s*[D-Z]',raw) else 'single-choice'
                    if not kind:issues.append(f'Q{lo}-{hi}: instruction/type unresolved');continue
                    gid=f'{packid}-g{lo}';questions=[]
                    roman='heading' in raw.lower()
                    labels=re.findall(r'(?m)^\s*([A-Z]|[ivx]{1,6})\s+(?=\S)',raw)
                    if roman:labels=[v for v in labels if v.islower()]
                    else:
                        limit=re.search(r'\bA\s*[–-]\s*([B-Z])\b',raw)
                        if limit:labels=[chr(n) for n in range(65,ord(limit[1])+1)]
                        elif re.search(r'A,?\s*B,?\s*(?:C,?\s*)?(?:or|and)\s*D',raw):labels=list('ABCD')
                        elif re.search(r'A,?\s*B\s*(?:or|and)\s*C',raw):labels=list('ABC')
                        else:labels=[v for v in labels if v.isupper()]
                    labels=list(dict.fromkeys(labels))
                    if kind in ['matching','single-choice'] and len(labels)<2:issues.append(f'Q{lo}-{hi}: option identities unresolved');continue
                    for n in range(lo,hi+1):
                        qid=f'{packid}-q{n}';q=dict(id=qid,number=n,type=kind,prompt=f'Question {n} · use the original prompt and options above.',points=1)
                        key=keys.get(n,'');safe=bool(key) and not re.search(r'IN EITHER|BOTH|ORDER|REQUIRED|[「」�\u4e00-\u9fff]|\sI\s',key)
                        if kind in ['matching','single-choice']:
                            q['options']=[dict(id=qid+'-'+label,label=label,text=f'{label} · original option above') for label in labels]
                            if kind=='matching':q.update(matchingKind='headings' if roman else 'features',allowOptionReuse=True)
                            label=key.lower() if roman else key.upper()
                            if safe and label in labels:q['correctOptionId']=qid+'-'+label;scored+=1
                        elif kind in ['true-false-not-given','yes-no-not-given']:
                            label=key.lower().replace(' ','-')
                            if safe and label in (['true','false','not-given'] if kind.startswith('true') else ['yes','no','not-given']):q['correctAnswer']=label;scored+=1
                        else:
                            q['maxWords']=3 if 'THREE WORD' in upper else 2 if 'TWO WORD' in upper else 1
                            variants=[tidy(v) for v in key.split('/')]
                            if safe and all(0<len(v.split())<=q['maxWords'] and '(' not in v and ')' not in v for v in variants):q['acceptableAnswers']=variants;scored+=1
                        questions.append(q);numbers.add(n)
                    groups.append(dict(id=gid,title=f'Questions {lo}–{hi}',instructions='Source mapping awaiting final review. Follow the original printed instructions; missing keys are unscored.',contextBlocks=[dict(id=gid+'-source',**image(pn,box))],questions=questions))
            if not groups:issues.append(f'Passage {si+1}: no supported question groups')
            else:sections.append(dict(id=f'{packid}-section{si+1}',title=f'Passage {si+1}',contentBlocks=blocks,questionGroups=groups))
        if not sections:
            report['blockers'].append(f'Test candidate {test_index+1}: no reliably mapped groups');continue
        tid=packid+'-test';module=dict(schemaVersion=4,id=packid+'-reading',testId=tid,type='reading',title=f'Cambridge {volume} · Test {test_index+1} · Source draft',sections=sections)
        manifest=dict(schemaVersion=1,id=packid,title=f'Cambridge IELTS {volume} Academic · Test {test_index+1} · Source draft',sourceLabel='SOURCE REVIEW PENDING · user-owned PDF; original page retained; ambiguous answer fields remain unscored',edition='Academic source draft',language='en',modules=['reading'],createdAt=now,tests=[dict(id=tid,title=f'Test {test_index+1}',moduleIds=[module['id']])],mediaAssets=media)
        (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        (folder/'modules/reading.json').write_text(json.dumps(module,ensure_ascii=False,indent=2),encoding='utf-8')
        result=dict(packId=packid,questionUnits=len(numbers),mappedAnswerUnits=scored,sourceKeyPage=keypage,sourceContentHash=fingerprint,issues=issues,ready=False)
        report['packs'].append(result);fingerprints[fingerprint]=packid
    doc.close()
(OUT/'BULK_READING_REPORT.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(uniquePdfs=len(reports),draftModules=len(fingerprints),questionUnits=sum(p.get('questionUnits',0) for r in reports for p in r['packs']),mappedAnswerUnits=sum(p.get('mappedAnswerUnits',0) for r in reports for p in r['packs'])),ensure_ascii=False))
