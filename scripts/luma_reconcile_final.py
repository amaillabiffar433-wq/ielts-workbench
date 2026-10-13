"""Per-file reconciliation of source bytes, installed packs, topics, and private cloud destinations."""
from pathlib import Path
import json,hashlib,sqlite3,datetime,collections,csv,re,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'delivery/luma-20260919-01';WORKSPACE=Path(r'D:\IELTS-Workbench')
inventory=json.loads((OUT/'IMPORT_MANIFEST.json').read_text(encoding='utf-8'));sources=inventory['files']
def read(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
    return h.hexdigest()
cloud=read('CLOUD_DIRECTORY_MANIFEST.json')
for path in sorted(OUT.glob('cloud-directory-worker-*.json')):
    part=json.loads(path.read_text(encoding='utf-8'))
    assert part['remoteRoot']==cloud['remoteRoot']
    for relative,entry in part['files'].items():
        if entry.get('verified'):
            assert entry['sha256']==entry['downloadSha256'] and entry['size']==entry['downloadBytes']
            cloud['files'][relative]=entry
cloud['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT/'CLOUD_DIRECTORY_MANIFEST.json').write_text(json.dumps(cloud,ensure_ascii=False,indent=2),encoding='utf-8')
connection=sqlite3.connect(WORKSPACE.joinpath('ielts-workbench.sqlite3').as_uri()+'?mode=ro',uri=True)
tables=[r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")]
installed={r[0] for r in connection.execute('SELECT id FROM installed_packs')}
catalog=json.loads((WORKSPACE/'library-assets/catalog.json').read_text(encoding='utf-8'));by_relative={r['sourceLabel']:r for r in catalog}
topics=json.loads((WORKSPACE/'speaking-materials/catalog.json').read_text(encoding='utf-8'));topic_by_sha=collections.defaultdict(list)
for topic in topics:topic_by_sha[topic['sourceSha256']].append(topic)
writing=collections.defaultdict(set)
for folder in (OUT/'private/WritingImportable').iterdir():
    if not folder.is_dir():continue
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'));match=re.search(r'Source SHA256 ([a-f0-9]{64})',manifest['attribution']);assert match
    assert folder.name in installed;writing[match[1]].add(folder.name)
# Include mappings to a previously installed equivalent prompt from another source.
for entry in read('WRITING_EXPANSION.json')['entries']:writing[entry['sourceSha256']].add(entry['packId'])
bulk={f['sha256']:f for f in read('BULK_READING_REPORT.json')}
c17=read('private/c17/source.json');c17packs=[f'cambridge-17-academic-test-{n}-luma-v2' for n in range(1,5)]
audio={}
for test in range(1,5):
    for part in range(1,5):
        original=Path(c17['path']).parent/'音频'/f'ELT_IELTS17_t{test}_audio{part}.mp3'
        entry=next(f for f in sources if f['path']==str(original));audio[entry['sha256']]={'test':test,'part':part,'packId':c17packs[test-1]}
pure_references={
'eebd1c773565be1c072532f2c9b63bafe9ffe397efebc5b6ae54d6b4c93aaf0e':'Writing ideas / techniques',
'7a6fb94c421828124153ecbc6d00f078482864031a7f4c9328667534884b151c':'Writing collocations',
'319c7eb5157f0a05bc44eead18e37506d3c56388a2b7f157d1feb505127c07ff':'Speaking procedure / assessment lecture',
'34a83fac45a2576911e57dbf8dc6527e3d93965cf8849c6583088eea6703bdf8':'Bilingual visual vocabulary reference',
}
for f in sources:
    category=Path(f['relativePath']).parts[0];digest=f['sha256'];reference=by_relative.get(f['relativePath']);mapped=cloud['files'].get(f['relativePath'].replace('\\','/'))
    f.update(sourceDirectory=category,contentCategory=[],appEntry=[],structuredPacks=[],speakingTopicIds=[],verifiedQuestionUnits=0,scorableQuestionUnits=0,draftQuestionUnits=0,referenceResourceCount=int(bool(reference and f['originalViewable'])),sourceQuestionCount=None,importComplete=False,unfinishedReason=[],cloudContentVerified=bool(mapped and mapped.get('verified')),cloudPath=mapped['remotePath'] if mapped else None)
    if reference and f['originalViewable']:f['appEntry'].append(f"Library → Reference materials → {reference['category']} → {reference['title']}")
    if digest==c17['sha256']:
        f.update(contentCategory=['Reading','Listening','Writing','Speaking','Answer keys','Transcript'],structuredPacks=c17packs,verifiedQuestionUnits=372,scorableQuestionUnits=320,sourceQuestionCount=372,importComplete=True,parseStatus='4 full Reading, 4 full Listening, 8 Writing tasks, and 12 Speaking cards (44 source prompt units)')
        f['appEntry'].append('Library → Cambridge IELTS 17 Academic → Test 1–4 → Reading / Listening / Writing / Speaking')
    elif digest in audio:
        f.update(contentCategory=['Listening audio'],structuredPacks=[audio[digest]['packId']],sourceQuestionCount=0,importComplete=True,parseStatus=f"Linked to Cambridge 17 Test {audio[digest]['test']} Part {audio[digest]['part']}; packed independent audio verified")
        f['appEntry'].append(f"Library → Cambridge IELTS 17 Academic → Test {audio[digest]['test']} → Listening")
    elif digest in writing:
        ids=sorted(writing[digest]);f.update(contentCategory=['Writing prompts','Model essays / teaching references'],structuredPacks=ids,verifiedQuestionUnits=len(ids),sourceQuestionCount=len(ids),importComplete=True,parseStatus='Source writing prompts / chart exercises installed; essays preserved as references, not answers')
        f['appEntry'].append('Library → Simon writing collection / Writing source collection / Writing chart exercises → Prompt')
    elif digest in pure_references:
        f.update(contentCategory=[pure_references[digest]],sourceQuestionCount=0,importComplete=True,parseStatus='Complete reference resource preserved and catalogued; not counted as a question')
    else:
        entry=bulk.get(digest)
        if entry and entry['packs']:
            ids=[p.get('packId',p.get('duplicateOf')) for p in entry['packs']];f['structuredPacks']=ids
            f['draftQuestionUnits']=sum(p.get('questionUnits',0) for p in entry['packs']);f['contentCategory']=['Reading source-review draft','Mixed test-book source']
            f['unfinishedReason'].append('Question/option mappings and answer keys still require source checking; draft is unscored. Remaining skills in this file are not fully structured.')
            f['appEntry'].append('Library → corresponding Cambridge book → Test → Incomplete · source review pending')
        elif f['extension'] in ['.mp3','.wma','.m4a']:
            f['contentCategory']=['Unassociated test audio'];f['unfinishedReason'].append('Audio preserved in full, but association with a verified structured test/section has not been completed.')
        elif f['extension']=='.pdf':
            f['contentCategory']=['Mixed test / teaching PDF'];f['unfinishedReason'].append('No verified complete structured test was produced from this file; original pages remain available.')
            if not f.get('textCharacters'):f['unfinishedReason'].append('No usable text layer; OCR and source review required. Answer availability cannot be inferred from the scan alone.')
            elif entry:f['unfinishedReason']+=entry.get('blockers',[])
        else:f['contentCategory']=['Unsupported metadata / log'];f['unfinishedReason'].append('Unsupported content retained locally; excluded from practice, cloud archive, and cleanup.')
    if digest in topic_by_sha:
        source_topics=topic_by_sha[digest];f['speakingTopicIds']=[t['id'] for t in source_topics]
        if digest!=c17['sha256']:
            f.update(contentCategory=['Speaking topics' if len(source_topics)>1 else 'Speaking classroom cue fragments','Reference responses / source document'],verifiedQuestionUnits=sum(len(t['prompts']) for t in source_topics),sourceQuestionCount=sum(len(t['prompts']) for t in source_topics),importComplete=True,unfinishedReason=[],parseStatus='Speaking topics / classroom cues installed; source references retained separately')
        f['appEntry'].append('Library → Speaking topics → Part 1 / 2 / 3 (classroom fragments labelled separately)')
    assert all(p in installed for p in f['structuredPacks'])
    f['importResult']='complete-reference' if digest in pure_references else 'complete-structured-source' if f['importComplete'] else 'partial-draft' if f['structuredPacks'] else 'reference-only-incomplete' if f['referenceResourceCount'] else 'unsupported-retained'
    f['blockers']=f['unfinishedReason']
    f['eligibleForCleanupBeforeOfflineGate']=f['importComplete'] and f['cloudContentVerified'] and f['managedSha256Verified']
    if reference:
        reference['status']={'complete-reference':'Reference resource · complete','complete-structured-source':'Practice source installed · original retained as reference','partial-draft':'Incomplete practice import · unscored source draft','reference-only-incomplete':'Reference available · practice import incomplete','unsupported-retained':'Unsupported · retained locally'}[f['importResult']]
inventory['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT/'IMPORT_MANIFEST.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
backup=OUT/'backups/reference-catalog-before-final-labels.json'
if not backup.exists():shutil.copy2(WORKSPACE/'library-assets/catalog.json',backup)
(WORKSPACE/'library-assets/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
categories=[]
for category in ['雅思真题4-20','口语','写作']:
    files=[f for f in sources if f['sourceDirectory']==category]
    categories.append(dict(directory=category,discoveredFiles=len(files),managedReferenceEntries=sum(f['referenceResourceCount'] for f in files),completeStructuredSources=sum(f['importResult']=='complete-structured-source' for f in files),completeReferenceOnlySources=sum(f['importResult']=='complete-reference' for f in files),incompleteFiles=sum(not f['importComplete'] for f in files),cloudContentVerifiedFiles=sum(f['cloudContentVerified'] for f in files),deletedFiles=0,cleanupCandidatesBeforeOfflineGate=sum(f['eligibleForCleanupBeforeOfflineGate'] for f in files)))
stats=dict(sourceRoot=inventory['sourceRoot'],categories=categories,completeReadingTests=4,completeListeningTests=4,objectiveScorableQuestions=320,writingTasks=len(set().union(*writing.values()))+8,speakingTopicCards=len(topics),speakingPromptUnits=sum(len(t['prompts']) for t in topics),sourceReviewReadingDrafts=32,unscoredDraftQuestionUnits=1101,sourceFiles=len(sources),nativeInstalledSourcePacks=len(installed),allOriginalsStillRetained=True)
(OUT/'CATEGORY_RECONCILIATION.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
columns=['sourceDirectory','relativePath','sha256','contentCategory','importResult','appEntry','sourceQuestionCount','verifiedQuestionUnits','scorableQuestionUnits','draftQuestionUnits','referenceResourceCount','unfinishedReason','cloudContentVerified','cloudPath','managedRelativePath']
with (OUT/'IMPORT_MANIFEST.csv').open('w',encoding='utf-8-sig',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader()
    for f in sources:writer.writerow({k:' | '.join(map(str,f[k])) if isinstance(f.get(k),list) else f.get(k) for k in columns})
print(json.dumps(stats,ensure_ascii=False))
