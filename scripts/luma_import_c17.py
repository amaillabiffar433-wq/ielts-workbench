"""Source-bound Cambridge 17 adapter. No test text or answers are embedded in code.

The page/range map was checked against the user-owned edition. Original cropped
question regions accompany typed controls; source answer columns are extracted
independently and every 1..40 scoring unit must be accounted for before publishing.
"""
from pathlib import Path
import datetime, hashlib, json, re, shutil, subprocess, wave
import fitz, imageio_ffmpeg
from luma_audit import OUT, SOURCE, digest

INFO=json.loads((OUT/'private/c17/source.json').read_text(encoding='utf-8'))
PDF=Path(INFO['path'])
DOC=fitz.open(PDF)
DEST=OUT/'private/Importable'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

# (PDF page, first number, last number, control). p=paired choices; m=matching;
# s=single choice; g=gap; t=TFNG; y=YNNG. The range is the source scoring unit.
READING={
1: [([16,17],[(18,1,6,'g'),(19,7,13,'t')]),([20,21],[(22,14,17,'m'),(22,18,22,'g'),(23,23,24,'p'),(23,25,26,'p')]),([24,25],[(26,27,31,'m'),(26,32,35,'y'),(27,36,40,'s')])],
2: [([37,38],[(39,1,5,'g'),(40,6,13,'t')]),([41,42],[(43,14,18,'m'),(43,19,23,'m'),(44,24,26,'g')]),([45,46],[(47,27,31,'s'),(48,32,36,'y'),(49,37,40,'m')])],
3: [([59,60],[(61,1,5,'g'),(62,6,13,'t')]),([63,64],[(65,14,20,'m'),(65,21,22,'p'),(66,23,26,'g')]),([67,68],[(69,27,31,'s'),(70,32,35,'y'),(71,36,40,'m')])],
4: [([81,82],[(83,1,6,'t'),(84,7,13,'g')]),([85,86],[(87,14,18,'m'),(87,19,22,'g'),(88,23,24,'p'),(88,25,26,'p')]),([89,90],[(91,27,32,'m'),(91,33,36,'t'),(92,37,40,'g')])],
}
LISTENING={
1:[[(10,1,10,'g')],[(11,11,14,'s'),(12,15,16,'p'),(12,17,18,'p'),(12,19,20,'p')],[(13,21,26,'s'),(14,27,30,'m')],[(15,31,40,'g')]],
2:[[(31,1,7,'g'),(31,8,10,'g')],[(32,11,14,'s'),(33,15,20,'m')],[(34,21,22,'p'),(34,23,27,'m'),(35,28,30,'s')],[(36,31,40,'g')]],
3:[[(53,1,10,'g')],[(54,11,12,'p'),(54,13,15,'s'),(55,16,20,'m')],[(56,21,24,'s'),(57,25,30,'m')],[(58,31,40,'g')]],
4:[[(75,1,10,'g')],[(76,11,14,'s'),(77,15,20,'m')],[(78,21,22,'p'),(78,23,24,'p'),(79,25,30,'m')],[(80,31,40,'g')]],
}

def clean(text):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',text).strip()

def compact(text): return re.sub(r'\s+',' ',clean(text)).strip()

def key_for(page_number):
    page=DOC[page_number-1]
    words=page.get_text('words')
    stop=min([w[1] for w in words if w[4]=='If' and w[1]>300] or [page.rect.height-60])
    result={};pairs={}
    for left,right in [(40,250),(260,525)]:
        selected=sorted([w for w in words if left<=w[0]<right and 190<w[1]<stop],key=lambda w:(w[1],w[0]))
        lines=[]
        for w in selected:
            if not lines or abs(w[1]-lines[-1][0])>4: lines.append([w[1],[w]])
            else: lines[-1][1].append(w)
        pending=None
        for _,ws in lines:
            line=compact(' '.join(w[4] for w in sorted(ws,key=lambda w:w[0])))
            pair=re.match(r'^(\d+)&(\d+)\s+IN EITHER ORDER',line)
            normal=re.match(r'^(\d{1,2})\s+(.+)$',line)
            if pair:
                pending=[int(pair[1]),int(pair[2])];pairs[pending[0]]=[]
            elif pending and re.fullmatch('[A-J]',line):
                pairs[pending[0]].append(line)
                if len(pairs[pending[0]])==2:
                    result[pending[0]]=pairs[pending[0]][0];result[pending[1]]=pairs[pending[0]][1];pending=None
            elif normal and 1<=int(normal[1])<=40:
                number=int(normal[1]);assert number not in result,(page_number,number,line)
                result[number]=normal[2]
    assert set(result)==set(range(1,41)),(page_number,'missing keys',set(range(1,41))-set(result),result)
    return result,pairs

def region(page_number,lo,hi):
    page=DOC[page_number-1]
    lines=[]
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines',[]):
            txt=''.join(s['text'] for s in line['spans'])
            if re.match(r'^Questions\s+\d+',txt.strip()):
                nums=re.findall(r'\d+',txt)
                if len(nums)>=2: lines.append((line['bbox'][1],int(nums[0]),int(nums[1])))
    hits=[y for y,a,b in lines if a==lo and b==hi]
    top=min(hits) if hits else 65
    bottom=min([y-7 for y,a,b in lines if y>top+5 and (a,b)!=(lo,hi)] or [page.rect.height-22])
    box=fitz.Rect(43,max(40,top-6),page.rect.width-35,bottom)
    return page,box,clean(page.get_text(clip=box,sort=False))

def answers(raw):
    variants=[]
    for value in re.split(r'\s*/\s*',raw):
        if '(' in value and ')' in value:
            variants += [compact(re.sub(r'\([^)]*\)','',value)),compact(value.replace('(','').replace(')',''))]
        else: variants.append(compact(value))
    return list(dict.fromkeys(v for v in variants if v))

def numbered_prompts(raw,lo,hi):
    starts=list(re.finditer(r'(?m)^\s*(\d{1,2})[\t\u00a0 ]*(?:\n|\t| {2,})',raw))
    starts=[m for m in starts if lo<=int(m[1])<=hi]
    out={}
    for i,m in enumerate(starts):
        end=starts[i+1].start() if i+1<len(starts) else len(raw)
        out[int(m[1])]=raw[m.end():end].strip()
    return out

def option_map(raw):
    matches=list(re.finditer(r'(?m)^\s*([A-J])[\t ]*(?:\n|\t| {2,})',raw))
    opts={}
    for i,m in enumerate(matches):
        text=compact(raw[m.end():matches[i+1].start() if i+1<len(matches) else len(raw)])
        # A shared list can precede the numbered prompts.
        text=re.split(r'\s+\d{1,2}\s+',text)[0].strip()
        if text: opts[m[1]]=text
    return opts

def create_pack(test_number):
    pack_id=f'cambridge-17-academic-test-{test_number}-luma-v2'
    folder=DEST/pack_id
    folder.mkdir(parents=True,exist_ok=True)
    for sub in ['modules','media/images','media/audio']: (folder/sub).mkdir(parents=True,exist_ok=True)
    media=[];evidence=[]
    tid=pack_id+'-test'
    def image(page_number,box,identity):
        pix=DOC[page_number-1].get_pixmap(matrix=fitz.Matrix(1.8,1.8),clip=box,alpha=False)
        data=pix.tobytes('png');sha=hashlib.sha256(data).hexdigest();rel=f'media/images/{sha}.png'
        (folder/rel).write_bytes(data)
        aid=pack_id+'-image-'+sha[:16]
        if not any(x['id']==aid for x in media): media.append(dict(id=aid,type='image',relativePath=rel,mimeType='image/png',width=pix.width,height=pix.height,alt=f'Source page {page_number}',sha256=sha))
        return dict(id=identity,type='snapshot',assetId=aid,altText=f'Original questions · page {page_number}',sourcePage=page_number)

    def group(skill,spec,key,pairs):
        pn,lo,hi,kind=spec
        page,box,raw=region(pn,lo,hi)
        gid=f'{pack_id}-{skill}-g{lo}'
        context=[image(pn,box,gid+'-source')]
        prompts=numbered_prompts(raw,lo,hi)
        shared=option_map(raw)
        if kind=='m' and ('Which section contains' in raw or 'Which paragraph contains' in raw):
            match=re.search(r'(?:sections|paragraphs),?\s+A[–-]([A-J])',raw)
            assert match,(pn,lo,'No section letters')
            shared={chr(c):f'Section {chr(c)}' for c in range(65,ord(match[1])+1)}
        questions=[]
        for n in ([lo] if kind=='p' else range(lo,hi+1)):
            qid=f'{pack_id}-{skill}-q{n}'
            chunk=prompts.get(n,'')
            prompt=compact(re.split(r'(?m)^\s*[A-J][\t ]*(?:\n|\t| {2,})',chunk)[0])
            if not prompt or len(prompt)>1500 or kind in ['g','p']:
                prompt=f'Question {n}: '+('Choose TWO answers from the original options above.' if kind=='p' else 'Complete the numbered blank in the source above.')
            q=dict(id=qid,number=n,prompt=prompt,points=1)
            if kind in ['t','y']:
                q.update(type='true-false-not-given' if kind=='t' else 'yes-no-not-given',correctAnswer=key[n].lower().replace(' ','-'))
            elif kind in ['s','m','p']:
                opts=option_map(chunk) if kind=='s' else shared
                # Retain source options visually if PDF text ordering is ambiguous.
                if len(opts)<2:
                    match=re.search(r'(?:letter|letters).*?A(?:,|[–-])\s*([C-J])',compact(raw))
                    if not match: match=re.search(r'A, B(?:, C)?(?: or |,? and )([C-J])',compact(raw))
                    assert match,(pn,n,'No reliable option range',raw)
                    opts={chr(c):f'{chr(c)} · see source option above' for c in range(65,ord(match[1])+1)}
                q.update(options=[dict(id=qid+'-'+label,label=label,text=text) for label,text in sorted(opts.items())])
                if kind=='p':
                    assert lo in pairs and hi==lo+1,(pn,lo,pairs)
                    assert all(k in opts for k in pairs[lo]),(pn,lo,opts,pairs[lo])
                    q.update(type='multiple-choice',points=2,selectionCount=2,additionalNumbers=[hi],scoringMode='per-correct-option',correctOptionIds=[qid+'-'+a for a in pairs[lo]])
                else:
                    assert key[n] in opts,(pn,n,key[n],opts)
                    q.update(type='single-choice' if kind=='s' else 'matching',correctOptionId=qid+'-'+key[n])
                    if kind=='m': q.update(matchingKind='information' if 'Which ' in raw else 'features',allowOptionReuse=True)
            else:
                limit=2 if re.search('TWO WORDS',raw) else 1
                vals=answers(key[n])
                # "AND/OR A NUMBER" permits the explicitly printed spelled number.
                if 'NUMBER' in raw: limit=max([limit]+[len(a.split()) for a in vals])
                q.update(type='short-answer',acceptableAnswers=vals,maxWords=limit)
            questions.append(q)
            evidence.append(dict(questionId=qid,numbers=[n,hi] if kind=='p' else [n],sourcePage=pn,answerPage=118+2*(test_number-1)+(1 if skill=='listening' else 2),sourceSha256=INFO['sha256'],sourceKey=[key[x] for x in ([n,hi] if kind=='p' else [n])]))
        instruction='Use the original instructions and answer limit shown below.'
        if kind=='g':
            text=re.sub(r'(?m)^\s*(?:\d+|PART\s+\d|Questions\s+\d+[–-]\d+)\s*\n','',raw,count=1)
            end=list(re.finditer(r'(?mi)^.*(?:answer sheet\.|for each answer\.|for each answer\s*$).*$',text))
            if end:
                instruction=compact(text[:end[-1].end()])
                text=text[end[-1].end():]
            text=re.split(r'\s+p\.\s*\d',text)[0].strip()
            # Numeric slots must occur exactly once in the extracted question body.
            matches=list(re.finditer(r'(?<![\d\w])('+ '|'.join(str(n) for n in range(lo,hi+1)) +r')(?![\d\w])',text))
            if sorted(int(m[1]) for m in matches)==list(range(lo,hi+1)):
                parts=[]; cursor=0
                for j,m in enumerate(matches):
                    before=text[cursor:m.start()]
                    before=re.sub(r'[ \t\u00a0]+',' ',before)
                    before=re.sub(r'\n\s*\n+',' ',before)
                    if before.strip(): parts.append(dict(id=f'{gid}-text{j}',kind='text',text=before))
                    parts.append(dict(id=f'{gid}-slot{m[1]}',kind='answer',questionId=f'{pack_id}-{skill}-q{m[1]}'))
                    cursor=m.end()
                if text[cursor:].strip(): parts.append(dict(id=gid+'-tail',kind='text',text=re.sub(r'\s+',' ',text[cursor:])) )
                context=[dict(id=gid+'-completion',type='completion',style='notes',parts=parts),*context]
        return dict(id=gid,title=f'Questions {lo}–{hi}',instructions=instruction,contextBlocks=context,questions=questions)

    rkey,rpairs=key_for(120+2*(test_number-1));lkey,lpairs=key_for(119+2*(test_number-1))
    rsections=[]
    for si,(pages,specs) in enumerate(READING[test_number],1):
        blocks=[]
        for pn in pages:
            page=DOC[pn-1]
            for bi,b in enumerate(page.get_text('blocks',sort=True)):
                if b[6]!=0 or b[1]<60 or b[3]>page.rect.height-35: continue
                txt=clean(b[4])
                if not txt or re.match(r'(Test \d|Reading$|READING PASSAGE|You should spend)',txt) or re.search('[\u4e00-\u9fff]',txt): continue
                blocks.append(dict(id=f'{pack_id}-r-p{pn}-b{bi}',kind='paragraph',text=compact(txt)))
        assert blocks
        rsections.append(dict(id=f'{pack_id}-reading-section-{si}',title=f'Passage {si}',contentBlocks=blocks,questionGroups=[group('reading',sp,rkey,rpairs) for sp in specs]))
    reading=dict(schemaVersion=4,id=pack_id+'-reading',testId=tid,type='reading',title=f'Cambridge 17 · Test {test_number} · Reading',sections=rsections)

    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    audio_dir=PDF.parent/'音频'; offset=0;sections=[];wav_paths=[]
    cache=OUT/'private/audio-cache';cache.mkdir(exist_ok=True)
    transcript_start={1:96,2:101,3:107,4:113}[test_number]
    transcript_end={1:100,2:106,3:112,4:118}[test_number]
    transcript='\n'.join(DOC[p-1].get_text(sort=True) for p in range(transcript_start,transcript_end+1))
    tsplits=re.split(r'(?m)^\s*PART\s+([1-4])\s*$',transcript)
    transcripts={int(tsplits[i]):clean(tsplits[i+1]) for i in range(1,len(tsplits)-1,2)}
    for si,specs in enumerate(LISTENING[test_number],1):
        audio=audio_dir/f'ELT_IELTS17_t{test_number}_audio{si}.mp3'
        wav=cache/f't{test_number}-s{si}.wav'
        if not wav.exists(): subprocess.run([ffmpeg,'-y','-v','error','-i',str(audio),'-ac','1','-ar','44100',str(wav)],check=True,creationflags=0x08000000)
        with wave.open(str(wav),'rb') as f: duration=round(f.getnframes()/f.getframerate()*1000)
        section=dict(id=f'{pack_id}-listening-section-{si}',title=f'Part {si}',startMs=offset,endMs=offset+duration,contentBlocks=[],questionGroups=[group('listening',sp,lkey,lpairs) for sp in specs])
        if si in transcripts: section['transcriptText']=transcripts[si]
        sections.append(section);offset+=duration;wav_paths.append(wav)
    joined=cache/f't{test_number}-complete.wav'
    if not joined.exists():
        with wave.open(str(joined),'wb') as target:
            target.setnchannels(1);target.setsampwidth(2);target.setframerate(44100)
            for wav in wav_paths:
                with wave.open(str(wav),'rb') as f:
                    while True:
                        chunk=f.readframes(44100*10)
                        if not chunk: break
                        target.writeframes(chunk)
    audio_rel='media/audio/listening.mp3'
    if not (folder/audio_rel).exists(): subprocess.run([ffmpeg,'-y','-v','error','-i',str(joined),'-codec:a','libmp3lame','-b:a','96k',str(folder/audio_rel)],check=True,creationflags=0x08000000)
    audio_id=pack_id+'-audio';media.append(dict(id=audio_id,type='audio',relativePath=audio_rel,mimeType='audio/mpeg',durationMs=offset,sha256=digest(folder/audio_rel)))
    listening=dict(schemaVersion=2,id=pack_id+'-listening',testId=tid,type='listening',title=f'Cambridge 17 · Test {test_number} · Listening',audioAssetId=audio_id,sections=sections)
    writing_pages={1:[28,29],2:[50,51],3:[72,73],4:[93,94]}[test_number]
    tasks=[]
    for task,pn in enumerate(writing_pages,1):
        visual=image(pn,fitz.Rect(40,60,DOC[pn-1].rect.width-30,DOC[pn-1].rect.height-25),f'{pack_id}-writing-task{task}-source')
        tasks.append(dict(id=f'{pack_id}-writing-task{task}',type=f'task-{task}',title=f'Writing Task {task}',prompt=clean(DOC[pn-1].get_text(sort=True)),minimumWords=150 if task==1 else 250,suggestedMinutes=20 if task==1 else 40,imageAssetId=visual['assetId']))
    writing=dict(schemaVersion=1,id=pack_id+'-writing',testId=tid,type='writing',title=f'Cambridge 17 · Test {test_number} · Writing',sections=[dict(id=pack_id+'-writing-section',title='Writing',tasks=tasks)])
    cover=image(1,DOC[0].rect,pack_id+'-cover-source')['assetId']
    for module in [reading,listening]:
        qs=[q for s in module['sections'] for g in s['questionGroups'] for q in g['questions']]
        numbers=[n for q in qs for n in [q['number']]+q.get('additionalNumbers',[])]
        assert sorted(numbers)==list(range(1,41)),(test_number,module['type'],numbers)
        assert sum(q['points'] for q in qs)==40
        (folder/'modules'/f"{module['type']}.json").write_text(json.dumps(module,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'modules/writing.json').write_text(json.dumps(writing,ensure_ascii=False,indent=2),encoding='utf-8')
    manifest=dict(schemaVersion=1,id=pack_id,title=f'Cambridge IELTS 17 Academic · Test {test_number}',sourceLabel='User-owned Cambridge IELTS 17 Academic PDF and corresponding audio; private local import',edition='Academic 17',language='en',modules=['reading','listening','writing'],createdAt=NOW,tests=[dict(id=tid,title=f'Test {test_number}',moduleIds=[reading['id'],listening['id'],writing['id']])],mediaAssets=media,coverImageAssetId=cover)
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/f'private/c17/evidence-test{test_number}.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(pack=pack_id,scoringUnits=80,resources=len(media),audioMs=offset,transcriptParts=len(transcripts)),ensure_ascii=False),flush=True)

if __name__=='__main__':
    import sys
    for test in ([int(sys.argv[1])] if len(sys.argv)>1 else range(1,5)): create_pack(test)
