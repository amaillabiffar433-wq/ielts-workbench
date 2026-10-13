"""Private source-derived topic and writing import. No reference essays become answers."""
from pathlib import Path
import json,re,hashlib,datetime,fitz
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'delivery/luma-20260919-01';PRIVATE=OUT/'private'
inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']
references=json.loads(Path(r'D:\IELTS-Workbench\library-assets\catalog.json').read_text(encoding='utf-8'))
def source(digest):return next(f for f in inventory if f['sha256']==digest)
def ref(digest):return next(f['id'] for f in references if f['sha256']==digest)
def pages(digest):return json.loads((PRIVATE/'pdf-text'/f'{digest}.json').read_text(encoding='utf-8'))
def norm(s):return re.sub(r'\s+',' ',s).strip()
topics=[];seen=set();report={'sources':{},'writing':[]}
def add_topic(digest,title,part,category,prompts,page,version):
    title=norm(title);prompts=[p.strip() for p in prompts if p.strip()]
    fingerprint=hashlib.sha256((digest+'|'+str(part)+'|'+title+'|'+''.join(prompts)).encode()).hexdigest()[:24]
    if fingerprint in seen or not prompts:return
    seen.add(fingerprint);topics.append(dict(id='speaking-'+fingerprint,title=title,part=part,category=category,prompts=prompts,sourceTitle=Path(source(digest)['path']).name,sourceSha256=digest,sourcePage=page,referenceId=ref(digest),sourceVersion=version))
digest='1e17f934fce98d9baa57be70ab4d119a356ef9c776e7a9875f7d41d0a44e4a9a'
lines=[]
for n,page in enumerate(pages(digest),1):
    if n<5:continue
    for line in page.splitlines():
        line=line.strip()
        if not line or line.isdigit() or any(s in line for s in ['新航道国际','Institute of Teaching','打造具有','IELTS Speaking','Part 1 必考话题']):continue
        lines.append((n,line))
category='General';title=None;title_page=None;questions=[];cue=[];mode='p1';has_cue=False
def flush():
    if not title:return
    if mode=='p1':add_topic(digest,title,1,category,questions,title_page,'2026 January–April source collection')
    elif has_cue:
        add_topic(digest,title,2,category,[title+'\nYou should say:\n'+'\n'.join(cue)],title_page,'2026 January–April source collection')
        add_topic(digest,title,3,category,questions,title_page,'2026 January–April source collection')
for page,line in lines:
    if line in ['PEOPLE','PLACE','OBJECT','EVENTS','EVENT','ABSTRACT']:
        flush();title=None;questions=[];cue=[];has_cue=False;category=line.title();continue
    header=re.match(r'^\d+\.\s*(.+)',line)
    subheading=re.match(r'^(Study|Work)\s*(?:\[old\])?$',line)
    if header or (subheading and page<16):
        # Work is a subheading of Work or Studies; Study has its own question set.
        flush();title=header[1] if header else subheading[1];title=re.sub(r'\s*\[(?:old|new)\]\s*','',title);title_page=page;questions=[];cue=[];has_cue=False;mode='p1' if page<16 else 'p2';continue
    if not title:continue
    if re.match(r'^You should say\s*:',line,re.I):has_cue=True;mode='cue';continue
    if line=='Part 3':mode='p3';continue
    q=re.match(r'^\d+\)\s*(.+)',line)
    if mode in ['p1','p3']:
        if q:questions.append(q[1])
        elif questions and re.search(r'[A-Za-z]',line):questions[-1]+=' '+line
    elif mode=='cue':cue.append(line)
    elif mode=='p2' and re.search(r'[A-Za-z]',line):title=norm(title+' '+re.sub(r'\[(?:old|new)\]','',line))
flush()
report['sources'][digest]={'topicCards':len(topics),'part1Questions':sum(len(t['prompts']) for t in topics if t['part']==1),'part2Cards':sum(t['part']==2 for t in topics),'part3Questions':sum(len(t['prompts']) for t in topics if t['part']==3),'referenceOnlySections':'cover and topic index pages; no index entries counted'}

# Cambridge 17: use geometric PDF text blocks to separate the cue card from
# examiner instructions in the adjacent column, never use coordinates as IDs.
c17='ed158d15034bec9bb4a484c237b69c6ac3c964cb506505e0106b1b4cadbf1ef1'
doc=fitz.open(source(c17)['path']);before=len(topics)
for test,page_number in enumerate([30,52,74,95],1):
    blocks=sorted(doc[page_number-1].get_text('blocks'),key=lambda b:(b[1],b[0]));phase=0;p1=[];p2=[];p3=[]
    for b in blocks:
        text=b[4].strip()
        if re.fullmatch(r'PART [123]',text):phase=int(text[-1]);continue
        if phase==1 and '•' in text:p1.extend(norm(q) for q in text.split('•') if q.strip())
        if phase==2 and b[0]<350:p2.append(text)
        if phase==3 and 'Example questions:' in text:p3.extend(norm(q)+'?' for q in text.split('Example questions:',1)[1].split('?') if len(norm(q))>4)
    assert len(p1)>=4 and len(p2)>=2 and len(p3)>=5,(test,len(p1),len(p2),len(p3))
    for part,prompts in [(1,p1),(2,['\n'.join(p2)]),(3,p3)]:add_topic(c17,f'Cambridge 17 · Test {test} · Part {part}',part,'Cambridge 17',prompts,page_number,'Cambridge IELTS 17 Academic')
report['sources'][c17]={'topicCards':len(topics)-before,'tests':4,'sourcePages':[30,52,74,95]}

# A source explicitly marks the prompt and the model essay separately.
writing_hash='a23915bf8152b25fde04baced803b0a95f9e78594af6a84e02621d6cfb3cbc53'
for page_number,text in enumerate(pages(writing_hash),1):
    match=re.search(r'(\d+)\s*[.．]\s*题目\s*[：:]?\s*(.*?)(?:考官)?范文\s*[：:;；]',text,re.S)
    if not match:report['writing'].append({'page':page_number,'status':'manual-review-required'});continue
    prompt=norm(match[2]);assert 50<len(prompt)<2000 and ('?' in prompt or '？' in prompt or 'discuss' in prompt.lower())
    number=int(match[1]);identity=f'luma-writing-{writing_hash[:12]}-prompt-{number}-v1';test_id=identity+'-test';module_id=identity+'-writing'
    folder=PRIVATE/'WritingImportable'/identity;(folder/'modules').mkdir(parents=True,exist_ok=True)
    manifest=dict(schemaVersion=1,id=identity,title=f'Simon writing collection · Prompt {number}',sourceLabel='Writing prompt extracted from user-owned reference material. Model essays are reference only; no automatic writing score.',edition='Writing collection',language='en',modules=['writing'],createdAt='2026-09-19T09:00:00.000Z',attribution=f"Source SHA256 {writing_hash}; PDF page {page_number}; source question {number}",tests=[dict(id=test_id,title=f'Prompt {number}',moduleIds=[module_id])],mediaAssets=[])
    module=dict(schemaVersion=1,id=module_id,testId=test_id,type='writing',title=f'Writing prompt {number}',sections=[dict(id=identity+'-section',title='Task 2',tasks=[dict(id=identity+'-task',type='task-2',title=f'Writing prompt {number}',prompt=prompt,minimumWords=250,suggestedMinutes=40)])])
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');(folder/'modules/writing.json').write_text(json.dumps(module,ensure_ascii=False,indent=2),encoding='utf-8')
    report['writing'].append({'page':page_number,'promptNumber':number,'packId':identity,'taskCount':1,'status':'structured-prompt','scorableCount':0})
report['sources'][writing_hash]={'writingPrompts':sum(r['status']=='structured-prompt' for r in report['writing']),'modelEssaysCountedAsQuestions':0}
folder=PRIVATE/'SpeakingImportable';folder.mkdir(exist_ok=True);(folder/'catalog.json').write_text(json.dumps(topics,ensure_ascii=False,indent=2),encoding='utf-8')
report.update(speakingTopicCards=len(topics),speakingPromptUnits=sum(len(t['prompts']) for t in topics),writingPacks=sum(r['status']=='structured-prompt' for r in report['writing']),installed=False)
(OUT/'SPEAKING_WRITING_IMPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['writing','sources']}))
