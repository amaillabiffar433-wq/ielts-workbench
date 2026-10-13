"""Merge disjoint archive worker manifests without downgrading verified objects."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]/'delivery/luma-20260919-01'
target=root/'CLOUD_ARCHIVE_MANIFEST.json'
merged=json.loads(target.read_text(encoding='utf-8'))
files={file['localPath']:file for file in merged['files']}
for path in sorted(root.glob('cloud-worker-*.json')):
    state=json.loads(path.read_text(encoding='utf-8'))
    assert state['remoteRoot']==merged['remoteRoot']
    for key,obj in state['objects'].items():
        previous=merged['objects'].get(key)
        if previous and previous.get('verified'):
            if obj.get('verified'): assert obj['sha256']==previous['sha256'] and obj['remotePath']==previous['remotePath']
        else: merged['objects'][key]=obj
    for file in state['files']:
        if file['localPath'] in files: assert files[file['localPath']]['objectKey']==file['objectKey']
        files[file['localPath']]=file
    for error in state['errors']:
        if error not in merged['errors']: merged['errors'].append(error)
merged['files']=list(files.values())
temporary=target.with_suffix('.merge.tmp')
temporary.write_text(json.dumps(merged,ensure_ascii=False,indent=2),encoding='utf-8')
temporary.replace(target)
print(json.dumps(dict(remoteRoot=merged['remoteRoot'],verifiedObjects=sum(o.get('verified',False) for o in merged['objects'].values()),mappedFiles=len(files),verifiedBytes=sum(o['size'] for o in merged['objects'].values() if o.get('verified')))))
