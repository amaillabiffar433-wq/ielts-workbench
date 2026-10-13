"""Read all inventoried PDF text layers and record content-based import evidence."""
from pathlib import Path
import json,re
from luma_audit import OUT

inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))
unique={}
for file in inventory['files']:
    if file['extension']!='.pdf': continue
    pages=json.loads((OUT/'private/pdf-text'/f"{file['sha256']}.json").read_text(encoding='utf-8'))
    text='\n'.join(pages)
    evidence=[]
    for i,page in enumerate(pages,1):
        if re.search(r'(?i)READING\s+PASSAGE\s*1',page): evidence.append(dict(page=i,kind='reading-start'))
        if re.search(r'(?im)^\s*(?:Test\s*\d+\s*)?(?:LISTENING\s+AND\s+READING\s+ANSWER\s+KEYS?|Answer keys?|Listening and Reading answers?)',page): evidence.append(dict(page=i,kind='answer-key'))
    skills=[s for s in ['Reading','Listening','Writing','Speaking'] if re.search(r'(?i)\b'+s+r'\b',text)]
    file['skill']=skills or None
    file['contentEvidence']=evidence
    file['parseStatus']='source-preserved; '+('text-layer-inspected; structural mapping pending' if file.get('textCharacters',0)>1000 else 'scanned source; targeted OCR and answer verification required')
    file['managedResource']=f"library-assets/objects/{file['sha256']}{file['extension']}"
    titletext=' '.join(pages[:8])
    found=re.search(r'(?i)(?:Cambridge\s+)?IELTS\s*(\d{1,2})\s*(?:Academic|General)?',titletext)
    if found: file['book']={'series':'Cambridge IELTS','volume':int(found[1]),'evidence':'PDF text candidate; edition must be separately checked'}
    if re.search(r'(?i)general training',titletext): file['editionEvidence']='General Training phrase in introductory pages; not sufficient to classify combined editions'
    unique.setdefault(file['sha256'],dict(name=file['relativePath'],sha256=file['sha256'],pages=len(pages),textChars=file.get('textCharacters'),evidence=evidence,skills=skills,head=re.sub(r'\s+',' ',text)[:180]))
(OUT/'SOURCE_PARSE_AUDIT.json').write_text(json.dumps(list(unique.values()),ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'IMPORT_MANIFEST.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
for source in unique.values():
    if source['evidence']: print(json.dumps({k:v for k,v in source.items() if k!='head'},ensure_ascii=False))
