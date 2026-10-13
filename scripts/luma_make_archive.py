"""Build a content-only pack backup and safe, hash-checked restore fixture."""
from pathlib import Path, PurePosixPath
import hashlib,json,zipfile,datetime
from luma_audit import OUT,digest
root=Path(__file__).resolve().parents[1]
backup=OUT/'private/luma-importable-20260919-01.zip'
restore=OUT/'private/restored-archive'
files=[]
for collection in ['Importable','BulkImportable']:
    for manifest in sorted((OUT/'private'/collection).glob('*/manifest.json')):
        folder=manifest.parent
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                files.append((path,'packs/'+str(path.relative_to(folder.parent)).replace('\\','/')))
manifest={'schemaVersion':1,'ieltsPackSchemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containsLearningRecords':False,'packs':36,'completeScoredTests':4,'sourceReviewDrafts':32,'files':[{'path':name,'size':p.stat().st_size,'sha256':digest(p)} for p,name in files]}
(OUT/'PACK_BACKUP_MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
instructions='''# Luma content-only recovery

This archive contains four complete C17 Academic packs and 32 unscored Reading source drafts, plus all their media. It contains no practice database, vocabulary, notes, configuration, or credentials. Drafts remain incomplete and must not be treated as full scored tests.

Extract into a new empty directory. Check every file against PACK_BACKUP_MANIFEST.json using SHA-256. Reject absolute paths, links, or .. components. In Luma choose Settings / existing IELTSPack import and select each packs/<pack-id> directory, or use the Library import tools. The native validator must accept each pack before installation. Repeating an unchanged pack preserves its stable identity; conflicting versions must not overwrite historical session targets.

Originals are separately preserved in the private batch Originals directory as SHA-256 filenames. SOURCE_RECOVERY_MAP.json maps each source-relative path to its exact cloud path, size, and SHA-256. Recover source files by that mapping and verify downloaded contents before use. The full originals retain Writing, Speaking, answer pages, transcripts, and attachments not yet structured for practice.

Formal workspace D:\\IELTS-Workbench and all personal study data remain local. Back it up consistently before any restore into a live workspace; this content archive does not restore private learning records.
'''
with zipfile.ZipFile(backup,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
    for path,name in files:z.write(path,name)
    z.writestr('PACK_BACKUP_MANIFEST.json',json.dumps(manifest,indent=2))
    z.writestr('RESTORE.md',instructions)
    z.write(root/'docs/DATA_FORMAT.md','DATA_FORMAT.md')
with zipfile.ZipFile(backup) as z:
    assert z.testzip() is None
    for entry in z.infolist():
        p=PurePosixPath(entry.filename)
        assert not p.is_absolute() and '..' not in p.parts and ':' not in str(p) and '\\' not in str(p)
        target=restore.joinpath(*p.parts)
        assert target.resolve().is_relative_to(restore.resolve())
        target.parent.mkdir(parents=True,exist_ok=True)
        with z.open(entry) as source,target.open('wb') as out:
            while data:=source.read(4*1024*1024):out.write(data)
for file in manifest['files']:
    path=restore/file['path'];assert path.stat().st_size==file['size'] and digest(path)==file['sha256']
result={'archive':str(backup),'sha256':digest(backup),'bytes':backup.stat().st_size,'filesVerified':len(files),'extractedTo':str(restore),'allExtractedFileHashesMatch':True,'nativeReimport':'pending'}
(OUT/'PACK_RESTORE_RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
