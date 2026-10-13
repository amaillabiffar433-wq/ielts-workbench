"""Copy every inventoried source into workspace-owned, hash-verified storage."""
from pathlib import Path
import hashlib,json,shutil
from luma_audit import OUT,SOURCE,digest,write

WORKSPACE=Path(r'D:\IELTS-Workbench')
def main():
    files=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']
    root=WORKSPACE/'library-assets';objects=root/'objects';objects.mkdir(parents=True,exist_ok=True)
    catalog=[]
    for i,f in enumerate(files):
        source=Path(f['path'])
        if not source.resolve().is_relative_to(SOURCE.resolve()) or source.is_symlink(): raise RuntimeError('Source boundary failure')
        name=f['sha256']+source.suffix.lower()
        target=objects/name
        if not target.exists():
            temporary=objects/(name+'.partial')
            shutil.copyfile(source,temporary)
            if digest(temporary)!=f['sha256']: raise RuntimeError('Copy hash mismatch')
            temporary.replace(target)
        else:
            if digest(target)!=f['sha256']: raise RuntimeError('Existing managed hash mismatch')
        status=f['status']
        if f['extension'] in ['.mp3','.wma','.m4a']: status='Reference audio · pairing not yet verified'
        elif f['extension']=='.docx': status='Reference document · subjective practice'
        elif status=='requires-targeted-ocr': status='Original pages · structured import needs OCR review'
        elif status=='text-layer-available': status='Original document · structured import under review'
        category=f['relativePath'].split('\\')[0]
        category={'写作':'Writing','口语':'Speaking','雅思真题4-20':'Test materials'}.get(category,'Other')
        catalog.append(dict(id=hashlib.sha256(f['relativePath'].encode('utf-8')).hexdigest(),title=source.name,category=category,sourceLabel=f['relativePath'],relativePath='objects/'+name,format=source.suffix.lower(),size=f['size'],sha256=f['sha256'],status=status))
        f['managedRelativePath']='library-assets/objects/'+name
        f['managedSha256Verified']=True
        f['retainedAsReference']=True
        if (i+1)%100==0: print('Managed and verified',i+1,flush=True)
    (root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    write('MANAGED_SOURCES.json',dict(workspace=str(WORKSPACE),files=files))
    print('Managed',len(catalog),'files, unique objects',len(list(objects.iterdir())),flush=True)

if __name__=='__main__':main()
