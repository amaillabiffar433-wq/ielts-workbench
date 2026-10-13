"""Package only the native-restored, empty-learner content workspace backup."""
from pathlib import Path,PurePosixPath
import json,hashlib,sqlite3,zipfile,datetime
OUT=Path(__file__).resolve().parents[1]/'delivery/luma-20260919-01'
detail=json.loads((OUT/'NATIVE_CONTENT_BACKUP.json').read_text(encoding='utf-8'))
backup=Path(detail['backup']['path']);assert detail['allNativeRestoreIdentitiesMatch']
manifest=json.loads((backup/'backup-manifest.json').read_text(encoding='utf-8'))
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
database=Path(str(backup/'database.sqlite3').removeprefix('\\\\?\\'))
c=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True)
tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
counts={table:c.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0] for table in tables}
allowed={'schema_migrations','installed_packs','sqlite_sequence'}
assert all(count==0 for table,count in counts.items() if table not in allowed),counts
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok';c.close()
assert not (backup/'speaking.sqlite3').exists(),'Speaking learner state must not enter this content archive'
for entry in manifest['files']:
    relative=PurePosixPath(entry['path']);assert not relative.is_absolute() and '..' not in relative.parts
    file=backup.joinpath(*relative.parts);assert file.stat().st_size==entry['byteLength'] and digest(file)==entry['sha256']
instructions='''# Luma content backup — 2026-09-20

This is a native-restorable content library, built from a fresh empty workspace and restored successfully by Luma before packaging. It contains no personal sessions, answers, annotations, vocabulary, essays, recordings, settings, secrets or account configuration. The SQLite file contains only migrations and installed-pack registration records. Original demo packs are identified separately in CONTENT_AUDIT.json.

Extract into a NEW empty directory. Open Luma → Settings → Workspace backup / restore, select this extracted directory (containing backup-manifest.json), then choose an existing destination parent outside your active workspace. Luma checks every file SHA-256 and restores into a new uniquely named workspace. Your existing learning workspace must be kept separately; this archive intentionally contains no learning history.

Included: all structured practice packs, unscored Reading source drafts, Speaking topic cards, all Writing/Speaking source references, and the Cambridge 17 source book. Incomplete Reading drafts remain unscored. Other unstructured Cambridge books/audio are separately preserved under the private cloud Originals/雅思真题4-20 directory and listed in SOURCE_RECOVERY_MAP.json. This content backup does not claim those unstructured sources are completed tests.

Writing reference essays are not a standard answer. Speaking classroom fragments and the January–April 2026 collection retain their source/version labels.
'''
audit={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeRestoreVerified':True,'practicePacks':detail['practicePacks'],'additionalDemoPacks':detail['additionalDemoPacks'],'speakingTopicCards':detail['speakingTopicCards'],'referenceEntries':detail['referenceEntries'],'databaseTableCounts':counts,'personalLearningRecords':0,'personalSettings':0,'sourceFilesSha256Verified':len(manifest['files'])}
archive=OUT/'private/luma-content-backup-20260920-02.zip'
assert not archive.exists(),'Use a new immutable archive version instead of overwriting'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
    for entry in manifest['files']:z.write(backup/entry['path'],entry['path'])
    z.write(backup/'backup-manifest.json','backup-manifest.json');z.writestr('RESTORE.md',instructions);z.writestr('CONTENT_AUDIT.json',json.dumps(audit,indent=2))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
result={**audit,'archive':str(archive),'bytes':archive.stat().st_size,'sha256':digest(archive),'nativeBackupDirectory':str(backup),'nativeRestoredWorkspace':detail['restored'],'cloudUpload':'pending'}
(OUT/'CONTENT_BACKUP_RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'CONTENT_BACKUP_AUDIT.json').write_text(json.dumps(audit,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
