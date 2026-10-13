"""Attach explicit import, preservation, and package-member evidence to every source."""
from pathlib import Path
import json,zipfile,hashlib,datetime
from luma_audit import OUT,digest
inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf8'))
managed=json.loads((OUT/'MANAGED_SOURCES.json').read_text(encoding='utf8'))
managed_by_path={f['path']:f for f in managed['files']}
bulk={f['sha256']:f for f in json.loads((OUT/'BULK_READING_REPORT.json').read_text(encoding='utf8'))}
c17=json.loads((OUT/'private/c17/source.json').read_text(encoding='utf8'))
preservation=[]
for file in inventory['files']:
    retained=managed_by_path[file['path']]
    destination=Path(managed['workspace'])/retained['managedRelativePath']
    verified=destination.is_file() and destination.stat().st_size==file['size'] and digest(destination)==file['sha256']
    assert verified,file['relativePath']
    file.update(managedRelativePath=retained['managedRelativePath'],managedSha256Verified=True,sourcePreservedInFull=True,structuredPacks=[],scoredQuestionUnits=0,originalViewable=file['extension'] in ['.pdf','.docx','.mp3','.wma','.m4a'])
    entry=bulk.get(file['sha256'])
    if entry:
        file['structuredPacks']=[p.get('packId',p.get('duplicateOf')) for p in entry['packs']]
        file['blockers']=entry['blockers']+[issue for p in entry['packs'] for issue in p.get('issues',[])]
        if file['structuredPacks']:
            file['parseStatus']='unscored source-review draft installed; full original retained'
            file['test']=[i+1 for i in range(len(entry['packs']))]
            file['blockers'].append('Draft question/option mapping and all answer mappings require source review; excluded from Ready count')
    if file['sha256']==c17['sha256']:
        file.update(book='Cambridge IELTS 17 Academic',test=[1,2,3,4],skill=['Reading','Listening','Writing','Speaking'],structuredPacks=[f'cambridge-17-academic-test-{n}-luma-v2' for n in range(1,5)],scoredQuestionUnits=320,parseStatus='4 complete Reading + Listening tests and 8 Writing tasks; full Speaking/reference content preserved',blockers=[])
    if file['extension']=='.docx':
        with zipfile.ZipFile(destination) as z:
            assert z.testzip() is None
            members=[]
            for name in z.namelist():
                content=z.read(name)
                members.append({'name':name,'size':len(content),'sha256':hashlib.sha256(content).hexdigest()})
            file['archiveMembers']=members
            file['parseStatus']='Complete Office package preserved and ZIP members CRC/SHA256 verified; available as reference'
    if file['extension'] in ['.mp3','.wma','.m4a']:
        file['skill']=['Listening'];file['parseStatus']='Full audio preserved; only explicitly mapped C17 audio used in complete tests'
        file['identityConfidence']='Source-relative filename retained; unspecified book/test/section mapping remains unverified'
    if not file['originalViewable']:
        file['blockers']=['Unknown/log/metadata content retained locally; excluded from cloud upload and deletion']
    preservation.append({'path':file['path'],'managedPath':str(destination),'sha256':file['sha256'],'size':file['size'],'fullCopyVerified':verified,'viewable':file['originalViewable'],'membersVerified':len(file.get('archiveMembers',[]))})
inventory['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT/'IMPORT_MANIFEST.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'SOURCE_PRESERVATION_CHECK.json').write_text(json.dumps(preservation,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'files':len(preservation),'fullCopiesVerified':sum(f['fullCopyVerified'] for f in preservation),'viewable':sum(f['viewable'] for f in preservation),'officePackageMembers':sum(f['membersVerified'] for f in preservation)}))
