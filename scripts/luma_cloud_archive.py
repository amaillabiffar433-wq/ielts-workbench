"""Private, resumable source upload with streamed SHA-256 read-back. Never deletes."""
from pathlib import Path
import datetime, hashlib, json, os, sys, time, tomllib, uuid
import requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery/luma-20260919-01'
MANIFEST=OUT/'CLOUD_ARCHIVE_MANIFEST.json'
WORKER=os.environ.get('LUMA_CLOUD_WORKER')
if WORKER is not None:
    if WORKER not in ['0','1']: raise SystemExit('Unknown worker')
    MANIFEST=OUT/f'cloud-worker-{WORKER}.json'
SOURCE=Path(r'D:\downloads\雅思')
CHUNK=4*1024*1024

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(CHUNK),b''): h.update(b)
    return h.hexdigest()

config=tomllib.loads((Path.home()/'.codex/config.toml').read_text(encoding='utf-8'))
token=next((s.get('env',{}).get('BAIDU_NETDISK_ACCESS_TOKEN') for n,s in config.get('mcp_servers',{}).items() if 'baidu' in n.lower()),None)
if not token: raise SystemExit('Existing authorized credential unavailable')
session=requests.Session()
session.headers['User-Agent']='pan.baidu.com'
state=json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else dict(schemaVersion=1,batch='luma-20260919-01',remoteRoot='/Luma/IELTS-Library/20260919-01-'+uuid.uuid4().hex[:8],verification='streamed-download-sha256',objects={},files=[],errors=[])

def save():
    temporary=MANIFEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(MANIFEST)

def api(method,endpoint='file',data=None,**params):
    for attempt in range(3):
        try:
            query=dict(method=method,access_token=token,**params)
            r=(session.post if data is not None else session.get)('https://pan.baidu.com/rest/2.0/xpan/'+endpoint,params=query,data=data,timeout=(20,60))
            r.raise_for_status()
            result=r.json()
            if result.get('errno',0): raise RuntimeError('Baidu errno='+str(result['errno']))
            return result
        except (requests.RequestException,ValueError):
            if attempt==2: raise RuntimeError('Baidu request failed (details redacted)') from None
            time.sleep(2*(attempt+1))

def mkdir(path):
    # rtype 0 is conflict-safe; only creates this batch's private directories.
    try: return api('create',data=dict(path=path,isdir=1,size=0,rtype=0))
    except RuntimeError as e:
        if 'errno=-8' not in str(e): raise

def verify_once(obj):
    result=api('filemetas','multimedia',fsids=json.dumps([obj['fsId']]),dlink=1)
    metas=result.get('list',[])
    if len(metas)!=1 or not metas[0].get('dlink'): raise RuntimeError('No authorized download link returned')
    link=metas[0]['dlink']
    from urllib.parse import urlparse
    host=urlparse(link).hostname or ''
    if not (host.endswith('.baidu.com') or host.endswith('.baidupcs.com')): raise RuntimeError('Unexpected download origin')
    h=hashlib.sha256(); length=0
    try:
        with session.get(link,params={'access_token':token},stream=True,timeout=(30,120)) as r:
            r.raise_for_status()
            for data in r.iter_content(CHUNK): h.update(data); length+=len(data)
    except requests.RequestException as e:
        code=e.response.status_code if e.response is not None else type(e).__name__
        raise RuntimeError('Authorized download failed: '+str(code)+' (URL redacted)') from None
    obj.update(downloadSha256=h.hexdigest(),downloadBytes=length,verified=h.hexdigest()==obj['sha256'] and length==obj['size'],verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if not obj['verified']: raise RuntimeError('Read-back content differs')

def verify(obj):
    for attempt in range(4):
        try:
            verify_once(obj)
            return
        except RuntimeError:
            if attempt==3: raise
            time.sleep(min(20,3*(attempt+1)))

def upload(path,category='Originals',expected=None):
    identity=sha(path)
    if expected and identity!=expected: raise RuntimeError('Source changed since inventory')
    key=category+':'+identity
    obj=state['objects'].get(key)
    if obj and obj.get('verified'): return key
    if not obj:
        obj=dict(sha256=identity,size=path.stat().st_size,remotePath=state['remoteRoot']+'/'+category+'/'+identity+path.suffix.lower(),verified=False)
        state['objects'][key]=obj; save()
    if not obj.get('fsId'):
        with path.open('rb') as f: blocks=[hashlib.md5(b).hexdigest() for b in iter(lambda:f.read(CHUNK),b'')]
        if not blocks: raise RuntimeError('Empty source requires separate review')
        pre=api('precreate',data=dict(path=obj['remotePath'],size=obj['size'],isdir=0,autoinit=1,rtype=0,block_list=json.dumps(blocks)))
        uploadid=pre.get('uploadid')
        if pre.get('return_type')==2 and pre.get('info',{}).get('fs_id'):
            result=pre['info']
        else:
            if not uploadid: raise RuntimeError('Upload ID unavailable')
            with path.open('rb') as f:
                for index in pre.get('block_list',range(len(blocks))):
                    f.seek(int(index)*CHUNK);data=f.read(CHUNK)
                    for attempt in range(3):
                        try:
                            r=session.post('https://d.pcs.baidu.com/rest/2.0/pcs/superfile2',params=dict(method='upload',access_token=token,type='tmpfile',path=obj['remotePath'],uploadid=uploadid,partseq=index),files={'file':('chunk',data,'application/octet-stream')},timeout=(20,120))
                            r.raise_for_status();part=r.json()
                            if part.get('md5')!=blocks[int(index)]: raise RuntimeError('Uploaded chunk checksum differs')
                            break
                        except (requests.RequestException,ValueError,RuntimeError):
                            if attempt==2: raise RuntimeError('Chunk upload failed (details redacted)') from None
                            time.sleep(2)
            result=api('create',data=dict(path=obj['remotePath'],size=obj['size'],isdir=0,uploadid=uploadid,block_list=json.dumps(blocks),rtype=0))
        obj['fsId']=result.get('fs_id'); obj['remotePath']=result.get('path',obj['remotePath']);obj['uploadedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    verify(obj);save();return key

def main():
    print('Credential check',api('uinfo','nas').get('errno',0),flush=True)
    parts=state['remoteRoot'].strip('/').split('/')
    for n in range(1,len(parts)+1): mkdir('/'+'/'.join(parts[:n]))
    for category in ['Originals','Importable','Manifests']: mkdir(state['remoteRoot']+'/'+category)
    save()
    if sys.argv[1]=='pilot':
        paths=sorted(SOURCE.rglob('*.pdf'),key=lambda p:p.stat().st_size)[:1]
    else:
        inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']
        paths=[Path(f['path']) for f in sorted(inventory,key=lambda f:(f['extension'] not in ['.pdf','.docx'],f['size'])) if f['extension'] in ['.pdf','.docx','.mp3','.wma','.m4a'] and (WORKER is None or int(f['sha256'][:2],16)%2==int(WORKER))]
    expected={f['path']:f['sha256'] for f in json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']}
    for path in paths:
        try:
            key=upload(path,expected=expected.get(str(path)))
            if not any(x['localPath']==str(path) for x in state['files']):
                state['files'].append(dict(localPath=str(path),relativePath=str(path.relative_to(SOURCE)),objectKey=key))
            save();print('Verified',len(state['files']),path.name,flush=True)
        except Exception as e:
            message=str(e) if isinstance(e,RuntimeError) else type(e).__name__
            state['errors'].append(dict(localPath=str(path),error=message));save();print('STOP:',message,flush=True)
            return

if __name__=='__main__': main()
