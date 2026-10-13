"""Expand source writing prompts; retain model answers solely as reference files."""
from pathlib import Path
import json,re,hashlib,fitz,shutil,zipfile,xml.etree.ElementTree as ET
from luma_speaking_writing_import import OUT,PRIVATE,source,pages,ref,norm
report={'sources':{},'entries':[]};index={}
def signature(text):return re.sub(r'[^a-z0-9]','',text.lower())
for folder in (PRIVATE/'WritingImportable').iterdir():
    if not folder.is_dir():continue
    module=json.loads((folder/'modules/writing.json').read_text(encoding='utf-8'))
    for section in module['sections']:
        for task in section['tasks']:
            if not task.get('imageAssetId'):index[signature(task['prompt'])]=folder.name
def install(digest,page,prompt,image=None,task_type='task-2',collection='Writing source collection'):
    if image is None and signature(prompt) in index:
        report['entries'].append({'sourceSha256':digest,'page':page,'result':'linked-existing-prompt','packId':index[signature(prompt)]});return
    identity=f'luma-writing-{digest[:12]}-prompt-{page}-v1';folder=PRIVATE/'WritingImportable'/identity;(folder/'modules').mkdir(parents=True,exist_ok=True)
    test_id=identity+'-test';module_id=identity+'-writing';assets=[]
    task=dict(id=identity+'-task',type=task_type,title=f'{collection} · Source page {page}',prompt=prompt,minimumWords=150 if task_type=='task-1' else 250,suggestedMinutes=20 if task_type=='task-1' else 40)
    if image:
        (folder/'media').mkdir(exist_ok=True);target=folder/'media/prompt.png';shutil.copy2(image,target);sha=hashlib.sha256(target.read_bytes()).hexdigest();asset_id=identity+'-image'
        from PIL import Image
        im=Image.open(target);assets=[dict(id=asset_id,type='image',relativePath='media/prompt.png',mimeType='image/png',width=im.width,height=im.height,sha256=sha,alt=f'Original writing prompt and chart where present, source PDF page {page}')];task['imageAssetId']=asset_id
    manifest=dict(schemaVersion=1,id=identity,title=f'{collection} · Prompt {page}',sourceLabel=f'User-owned writing material, source PDF page {page}. Reference essays are separate and are not a standard answer.',edition='Writing collection',language='en',modules=['writing'],createdAt='2026-09-19T09:00:00.000Z',attribution=f'Source SHA256 {digest}; PDF page {page}',tests=[dict(id=test_id,title=f'Prompt {page}',moduleIds=[module_id])],mediaAssets=assets)
    module=dict(schemaVersion=1,id=module_id,testId=test_id,type='writing',title=task['title'],sections=[dict(id=identity+'-section',title='Writing',tasks=[task])])
    for file,value in [('manifest.json',manifest),('modules/writing.json',module)]: (folder/file).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    report['entries'].append({'sourceSha256':digest,'page':page,'result':'source-image-prompt' if image else 'structured-prompt','packId':identity,'taskType':task_type})
    if image is None:index[signature(prompt)]=identity

digest='6fe5308ea81fe56ff4b666413d4cbbea76d95e54e79a968efa1c3d6b1792017b'
# These 32 crops were visually checked against their complete source pages and
# contact sheets. They contain the actual task, excluding the model essay below.
reviewed=[5,6,7,8,9,10,11,12,13,15,16,18,20,23,24,26,28,30,31,38,39,43,47,50,53,55,58,67,70,75,77,80]
for n in reviewed:install(digest,n,'Respond to the original writing question below. The model essay is available separately in Reference materials.',PRIVATE/f'writing-review/prompt-{n}.png')
unresolved=[]
for n,text in enumerate(pages(digest),1):
    if n<5 or n in reviewed:continue
    # Only the first paragraph after an explicit numbered source heading can
    # be a prompt. Never search within essay paragraphs for questions.
    lines=text.splitlines();first=next((i for i,v in enumerate(lines) if v.strip()),None)
    if first is None or not re.match(r'^\s*\d+\.',lines[first]):continue
    body='\n'.join(lines[first+1:]).strip();paragraph=norm(re.split(r'\n\s*\n',body,1)[0])
    if 40<len(paragraph)<1400 and re.search(r'\?|Discuss.*(?:views|opinion)|To what extent',paragraph,re.I) and not re.search(r'\bI (?:believe|think|agree|disagree)\b',paragraph,re.I):install(digest,n,paragraph)
    else:unresolved.append({'page':n,'reason':'Prompt boundary not safely resolved; complete source retained'})
report['sources'][digest]={'imagePromptsVisuallyVerified':32,'unresolved':unresolved}

lecture='29725b714525409afaea26ddc3c7c9c5a0a7e014433d333059ea879ad9e944df'
for n in [22,52]:
    text=pages(lecture)[n-1];start=text.find('The charts' if n==22 else 'The bar chart');prompt=norm(text[start:]);prompt=re.sub(r'\(C12T5W1\)$','',prompt).strip()
    install(lecture,n,prompt,PRIVATE/f'writing-review/lecture-{n}.png','task-1','Writing chart exercises')
lecture_pdf=fitz.open(source(lecture)['path'])
for n,xref in [(18,124),(21,146),(47,299)]:
    image=PRIVATE/f'writing-review/chart-practice-{n}.png'
    if n==47:
        lecture_pdf[n-1].get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(165,0,796,344)).save(image)
        prompt=norm(pages(lecture)[n-1].splitlines()[0])
    elif n==18:
        fitz.Pixmap(lecture_pdf,xref).save(image)
        prompt=norm(lecture_pdf[n-1].get_text(clip=fitz.Rect(0,62,533,159)))
    else:
        fitz.Pixmap(lecture_pdf,xref).save(image)
        prompt='Respond to the original writing prompt and chart below.'
    install(lecture,n,prompt,image,'task-1','Writing chart exercises')
report['sources'][lecture]={'chartExercises':5,'sourcePages':[18,21,22,47,52],'embeddedChartXrefs':{'18':124,'21':146},'referenceOnly':'Remaining lecture examples, reformulations, techniques and marking descriptors remain viewable in the preserved PDF; classroom chart exercises are labelled separately from verified official test packs.'}

# Classroom speaking notes contain authentic short cues, mixed with model
# responses. Preserve their original wording; never turn response sentences
# into new questions. These are explicitly labelled fragments.
h='6ec2e57f01b5c3dcf21fedfb03932480edab5f7ffa08f2f0e64225f5ce19238f'
with zipfile.ZipFile(source(h)['path']) as z:
    xml=ET.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in xml.findall('.//w:p',ns)]
catalog_path=PRIVATE/'SpeakingImportable/catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'));cues=[]
for line in paragraphs:
    if '?' not in line and '？' not in line:continue
    # The source's own cue before the answer/explanation separator.
    cue=re.split(r'\s+[–-]\s+',line,1)[0].strip()
    if re.search(r'[？?]',cue):
        match=re.match(r'^(.*?[？?])',cue)
        if match:cues.append(match[1])
identity='speaking-'+hashlib.sha256((h+'classroom-cues').encode()).hexdigest()[:24]
catalog.append(dict(id=identity,title='Hometown, study & accommodation · classroom cues',part=1,category='Classroom prompt fragments',prompts=cues,sourceTitle=Path(source(h)['path']).name,sourceSha256=h,sourcePage=None,referenceId=ref(h),sourceVersion='Source classroom notes; abbreviated cues'))
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8');report['sources'][h]={'topicCards':1,'abbreviatedCues':len(cues),'modelResponsesCountedAsQuestions':0}
(OUT/'WRITING_EXPANSION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'newWritingPrompts':sum(x['result']!='linked-existing-prompt' for x in report['entries']),'linkedExisting':sum(x['result']=='linked-existing-prompt' for x in report['entries']),'unresolvedPages':len(unresolved),'speakingTopicCards':len(catalog)}))
