"""Read-only source audit and SQLite online snapshots for the Luma delivery."""
from pathlib import Path
import collections, datetime, hashlib, json, shutil, sqlite3, sys
import fitz

ROOT = Path(__file__).resolve().parents[1]
BATCH = 'luma-20260919-01'
OUT = ROOT / 'delivery' / BATCH
SOURCE = Path(r'D:\downloads\雅思')

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4*1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()

def write(name, value):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def databases():
    summary = []
    for path in map(Path, [r'D:\IELTS-Workbench', r'D:\IELTS-Workbench-Daily-Acceptance-20260916', r'D:\IELTS-Workbench-Acceptance-20260905']):
        target = OUT / 'backups' / path.name
        target.mkdir(parents=True, exist_ok=True)
        db = path / 'ielts-workbench.sqlite3'
        backup = target / db.name
        if backup.exists():
            raise RuntimeError('Backup already exists; will not overwrite it')
        with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(backup) as dst:
            src.backup(dst)
        with sqlite3.connect(backup) as con:
            tables = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
            counts = {t: con.execute('select count(*) from "'+t+'"').fetchone()[0] for t in tables}
            record = dict(workspace=str(path), backup=str(backup), sha256=digest(backup), integrity=con.execute('pragma integrity_check').fetchall(), foreignKeys=con.execute('pragma foreign_key_check').fetchall(), counts=counts)
            con.row_factory=sqlite3.Row
            record['migrations'] = [dict(r) for r in con.execute('select * from schema_migrations')]
            record['sessions'] = [dict(r) for r in con.execute('select * from practice_sessions')]
            record['packs'] = [dict(r) for r in con.execute('select id,title,install_path,source_hash from installed_packs')]
        shutil.copy2(path/'workspace.json',target/'workspace.json')
        summary.append(record)
    config = Path.home()/'AppData/Roaming/com.ieltsworkbench.desktop/bootstrap.json'
    shutil.copy2(config, OUT/'backups/bootstrap.json')
    shutil.copy2(ROOT/'docs/EXECUTION_PLAN.md', OUT/'backups/EXECUTION_PLAN.md')
    write('DATABASE_AUDIT.json',summary)
    for r in summary:
        print(json.dumps({k:v for k,v in r.items() if k not in ['sessions','packs']},ensure_ascii=False))

def inventory():
    entries=[]
    seen={}
    cache=OUT/'private/pdf-text'
    cache.mkdir(parents=True,exist_ok=True)
    for i,path in enumerate(sorted(SOURCE.rglob('*'))):
        if not path.is_file(): continue
        if path.is_symlink() or not path.resolve().is_relative_to(SOURCE.resolve()):
            raise RuntimeError('Unexpected source link')
        st=path.stat()
        sha=digest(path)
        row=dict(path=str(path),relativePath=str(path.relative_to(SOURCE)),size=st.st_size,sha256=sha,extension=path.suffix.lower(),modifiedNs=st.st_mtime_ns,status='inventoried',book=None,test=None,skill=None,source='user-authorized-local',dependencies=[],archiveMembers=[])
        if sha in seen: row['duplicateOf']=seen[sha]
        else: seen[sha]=str(path)
        if path.suffix.lower()=='.pdf':
            try:
                with fitz.open(path) as doc:
                    row['pages']=len(doc)
                    row['encrypted']=bool(doc.needs_pass)
                    texts=[p.get_text(sort=True) for p in doc]
                    row['textCharacters']=sum(len(t.strip()) for t in texts)
                    row['textPageCounts']=[len(t.strip()) for t in texts]
                    row['status']='text-layer-available' if row['textCharacters']>len(doc)*150 else 'requires-targeted-ocr'
                    textfile=cache/(sha+'.json')
                    if not textfile.exists(): textfile.write_text(json.dumps(texts,ensure_ascii=False),encoding='utf-8')
            except Exception as exc: row.update(status='pdf-error',error=type(exc).__name__)
        entries.append(row)
        if len(entries)%100==0: print('Inventoried',len(entries),flush=True)
    write('IMPORT_MANIFEST.json',dict(batch=BATCH,sourceRoot=str(SOURCE),createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=entries))
    print(json.dumps(dict(files=len(entries),bytes=sum(x['size'] for x in entries),uniqueHashes=len(seen),types=dict(collections.Counter(x['extension'] for x in entries))),ensure_ascii=False))
    for row in entries:
        if row['extension']=='.pdf' and 'duplicateOf' not in row:
            print(json.dumps({k:row[k] for k in ['relativePath','pages','textCharacters','status'] if k in row},ensure_ascii=False))

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    {'databases':databases,'inventory':inventory}[sys.argv[1]]()
