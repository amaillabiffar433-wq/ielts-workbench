"""Upload only generated content backups and source manifests, never local user DBs."""
import json,sys
from pathlib import Path
from pathlib import Path
from luma_cloud_archive import OUT,state,upload,save
mode=sys.argv[1]
if mode=='backup':
    paths=[(OUT/'private/luma-importable-20260919-01.zip','Importable'),(OUT/'PACK_BACKUP_MANIFEST.json','Manifests')]
elif mode=='manifests':
    inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf8'))
    destinations=json.loads((OUT/'CLOUD_DIRECTORY_MANIFEST.json').read_text(encoding='utf8'))['files']
    mapping=[]
    for file in inventory['files']:
        obj=destinations.get(file['relativePath'].replace('\\','/'))
        if obj and obj.get('verified'):
            mapping.append({'relativePath':file['relativePath'],'size':file['size'],'sha256':file['sha256'],'remotePath':obj['remotePath'],'fsId':obj['fsId'],'downloadSha256':obj['downloadSha256'],'verified':True,'managedRelativePath':file['managedRelativePath'],'structuredPacks':file['structuredPacks']})
    (OUT/'SOURCE_RECOVERY_MAP.json').write_text(json.dumps({'remoteRoot':state['remoteRoot'],'files':mapping},ensure_ascii=False,indent=2),encoding='utf8')
    paths=[(OUT/name,'Manifests') for name in ['SOURCE_RECOVERY_MAP.json','IMPORT_MANIFEST.json','BULK_VALIDATION.json','PACK_VALIDATION.json','CONTENT_BACKUP_AUDIT.json','CATEGORY_RECONCILIATION.json']]
elif mode=='content':
    result=json.loads((OUT/'CONTENT_BACKUP_RESULT.json').read_text(encoding='utf8'))
    assert result['personalLearningRecords']==0 and result['personalSettings']==0 and result['nativeRestoreVerified']
    paths=[(OUT/'private'/Path(result['archive']).name,'Importable'),(OUT/'CONTENT_BACKUP_AUDIT.json','Manifests')]
else:raise SystemExit('Unknown mode')
for file,category in paths:
    key=upload(file,category)
    if not any(f['localPath']==str(file) for f in state['files']):
        state['files'].append({'localPath':str(file),'relativePath':file.name,'objectKey':key})
    save();print('Verified',category,file.name,flush=True)
