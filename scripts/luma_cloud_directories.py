"""Preserve physical source hierarchy in the private cloud batch; verify each destination."""
from pathlib import PurePosixPath
import datetime,json,time,os
import luma_cloud_archive as cloud

worker=os.environ.get('LUMA_DIRECTORY_WORKER')
if worker is not None and worker not in ['0','1','2']:raise SystemExit('Invalid worker')
base=cloud.OUT/'CLOUD_DIRECTORY_MANIFEST.json'
output=cloud.OUT/f'cloud-directory-worker-{worker}.json' if worker is not None else base
initial=output if output.exists() else base
state=json.loads(initial.read_text(encoding='utf-8')) if initial.exists() else {'remoteRoot':cloud.state['remoteRoot'],'files':{},'errors':[],'verification':'full-destination-download-sha256'}
def save():
    temp=output.with_suffix('.tmp');temp.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(output)
directories=set()
listings={}
def ensure(folder):
    parts=PurePosixPath(folder).parts
    for i in range(2,len(parts)+1):
        current=str(PurePosixPath(*parts[:i]))
        if current not in directories:cloud.mkdir(current);directories.add(current)
def listing(folder,refresh=False):
    if folder not in listings or refresh:
        files=[];start=0
        while True:
            result=cloud.api('list',dir=folder,start=start,limit=1000,order='name')['list'];files+=result
            if len(result)<1000:break
            start+=1000
        listings[folder]={f['path']:f for f in files}
    return listings[folder]
inventory=json.loads((cloud.OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'))['files']
for source in inventory:
    if worker is not None and int(source['sha256'][:8],16)%3!=int(worker):continue
    if source['extension'] not in ['.pdf','.docx','.mp3','.m4a','.wma']:continue
    relative=str(cloud.Path(source['path']).relative_to(cloud.SOURCE)).replace('\\','/')
    previous=state['files'].get(relative)
    if previous and previous.get('verified'):continue
    obj=cloud.state['objects'].get('Originals:'+source['sha256'])
    if not obj or not obj.get('verified'):continue
    # Baidu trims leading/trailing ASCII spaces. Encode those bytes explicitly,
    # retaining the exact original name in this reversible manifest.
    def cloud_name(name):
        leading=len(name)-len(name.lstrip(' '));trailing=len(name)-len(name.rstrip(' '))
        return '%20'*leading+name.strip(' ')+'%20'*trailing
    remote_relative='/'.join(cloud_name(part) for part in relative.split('/'))
    destination=cloud.state['remoteRoot']+'/Originals/'+remote_relative
    folder=str(PurePosixPath(destination).parent)
    try:
        ensure(folder);found=listing(folder).get(destination)
        if not found:
            result=cloud.api('filemanager',opera='copy',data={'async':0,'ondup':'fail','filelist':json.dumps([{'path':obj['remotePath'],'dest':folder,'newname':PurePosixPath(destination).name,'ondup':'fail'}],ensure_ascii=False)})
            if any(i.get('errno',0)!=0 for i in result.get('info',[])):raise RuntimeError('Server copy returned a per-file error')
            for retry in range(4):
                found=listing(folder,True).get(destination)
                if found:break
                time.sleep(2)
        if not found or found.get('isdir') or found['size']!=source['size']:raise RuntimeError('Exact destination unavailable or size differs')
        verified={'localPath':source['path'],'relativePath':relative,'remotePath':destination,'fsId':found['fs_id'],'sha256':source['sha256'],'size':source['size'],'verified':False}
        cloud.verify(verified);state['files'][relative]=verified;save();print('Directory verified',len(state['files']),relative,flush=True)
    except Exception as e:
        error=str(e) if isinstance(e,RuntimeError) else type(e).__name__
        state['errors'].append({'relativePath':relative,'error':error,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()});save();print('STOP',error,flush=True);break
print('Verified destinations',len(state['files']),flush=True)
