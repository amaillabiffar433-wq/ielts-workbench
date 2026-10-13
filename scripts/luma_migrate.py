"""Validate additive released migrations on an online snapshot before formal use."""
from pathlib import Path
import datetime, hashlib, json, shutil, sqlite3
from luma_audit import ROOT, OUT, digest, write

FORMAL=Path(r'D:\IELTS-Workbench')
STAGE=OUT/'private/migration-workspace'
TABLES=['practice_sessions','answers','annotations','writing_drafts','writing_versions','vocabulary_items','installed_packs','app_settings']

def rows(con,table,columns=None):
    if columns is None: columns=[r[1] for r in con.execute('pragma table_info('+table+')')]
    return sorted([tuple(r) for r in con.execute('select '+','.join(columns)+' from '+table)],key=repr)

def migrate(db):
    with sqlite3.connect(db) as con:
        con.execute('pragma foreign_keys=on')
        before={t:([r[1] for r in con.execute('pragma table_info('+t+')')],rows(con,t)) for t in TABLES}
        current=con.execute('select max(version) from schema_migrations').fetchone()[0]
        assert current<=5
        for version,name in [(4,'vocabulary_context'),(5,'review_schedule')]:
            if version<=current: continue
            sql=(ROOT/f'src-tauri/migrations/{version:04d}_{name}.sql').read_text(encoding='utf-8')
            con.executescript('BEGIN IMMEDIATE;\n'+sql+f"\nINSERT INTO schema_migrations VALUES ({version},'{name}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));\nCOMMIT;")
        assert con.execute('pragma integrity_check').fetchall()==[('ok',)]
        assert con.execute('pragma foreign_key_check').fetchall()==[]
        for t,(columns,old) in before.items(): assert rows(con,t,columns)==old, 'Existing rows changed: '+t
        return dict(beforeVersion=current,afterVersion=5,existingRowsPreserved={t:len(v[1]) for t,v in before.items()},integrity='ok',foreignKeys=[])

if __name__=='__main__':
    STAGE.mkdir(parents=True,exist_ok=True)
    staged_db=STAGE/'ielts-workbench.sqlite3'
    assert not staged_db.exists(),'Migration test already exists; do not overwrite'
    shutil.copy2(OUT/'backups/IELTS-Workbench/ielts-workbench.sqlite3',staged_db)
    staged=migrate(staged_db)
    repeated=migrate(staged_db)
    assert repeated['beforeVersion']==5
    formal=migrate(FORMAL/'ielts-workbench.sqlite3')
    # Preserve acceptance-only rows in their immutable backup; never guess that
    # automated acceptance sessions are the learner's actual practice events.
    conflicts=[]
    with sqlite3.connect(OUT/'backups/IELTS-Workbench/ielts-workbench.sqlite3') as baseline:
        for label in ['IELTS-Workbench-Daily-Acceptance-20260916','IELTS-Workbench-Acceptance-20260905']:
            with sqlite3.connect(OUT/f'backups/{label}/ielts-workbench.sqlite3') as other:
                for table in TABLES:
                    columns=[r[1] for r in baseline.execute('pragma table_info('+table+')')]
                    extra=set(rows(other,table,columns))-set(rows(baseline,table,columns))
                    if extra: conflicts.append(dict(workspace=label,table=table,differentOrAdditionalRows=len(extra),resolution='retained in full consistent snapshot; acceptance data not merged into learner Progress'))
    resources=[]
    with sqlite3.connect(FORMAL/'ielts-workbench.sqlite3') as con:
        for pid,install in con.execute('select id,install_path from installed_packs'):
            folder=FORMAL/install
            assert folder.resolve().is_relative_to(FORMAL.resolve())
            manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
            for asset in manifest['mediaAssets']:
                p=folder/asset['relativePath'];assert p.is_file()
                actual=digest(p)
                assert not asset.get('sha256') or asset['sha256'].lower()==actual
                resources.append(dict(packId=pid,relativePath=asset['relativePath'],sha256=actual))
    write('MIGRATION_RESULT.json',dict(staged=staged,idempotent=True,formal=formal,acceptanceDifferences=conflicts,existingResources=resources))
    print(json.dumps(formal))
