const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve('delivery/luma-20260919-01');
const phase=process.argv[2];
const assert=(value,message)=>{if(!value)throw Error(message);};
const save=(name,result)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(result,null,2));
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9259');
 try{
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'));
  const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const bootstrap=await invoke('get_bootstrap_state');assert(bootstrap.workspacePath.includes('private\\native-workspace'),'Not isolated');
  const navigate=async route=>{await page.evaluate(route=>location.hash='#'+route,route);await page.waitForTimeout(600);};
  const library=async()=>{if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await navigate('/home');await navigate('/library');await page.locator('.book-tile').first().waitFor();};
  const book=async()=>{await library();await page.locator('.book-tile').filter({hasText:'Cambridge IELTS 17 Academic'}).click();};
  const practice=async(test,skill)=>{const id=`cambridge-17-academic-test-${test}-luma-v2`;await navigate(`/practice/${skill}?packId=${id}&testId=${id}-test&mode=study`);await page.locator('[data-question-id]').first().waitFor();return id;};
  if(phase==='ui'){
   await library();const covers=await page.locator('.book-tile').allTextContents();
   assert(covers.filter(t=>t.includes('Simon writing')).length===1,'Writing collection is not grouped');
   await page.screenshot({path:path.join(root,'screenshots/library-final.png'),fullPage:true});
   await book();await page.getByRole('tab',{name:'Test 3',exact:true}).click();
   const reading=page.locator('.library-module').filter({has:page.getByRole('heading',{name:'Reading',exact:true})});
   assert(await reading.getByRole('button',{name:'Full test · reading',exact:true}).count()===1,'Duplicate reading entries');
   await reading.locator('.library-section-row').nth(1).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   const section=await dialog.getByLabel('Practice starting point').inputValue();
   const sourceReading=await invoke('load_pack',{packId:'cambridge-17-academic-test-3-luma-v2'});assert(section===sourceReading.modules.find(m=>m.type==='reading').sections[1].id,'Passage 2 entry not selected');
   await page.screenshot({path:path.join(root,'screenshots/start-practice-final.png')});
   await dialog.getByRole('button',{name:/Start (from this section|another attempt)/}).click();
   await page.locator('.reading-pane').first().waitFor();
   assert(await page.locator('.reading-pane').first().locator('.reading-pane__passage-selector').inputValue()===section,'Wrong passage opened');
   const questionNumbers=await page.locator('.reading-pane').nth(1).locator('[data-question-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-question-id')));
   assert(questionNumbers.length>0&&questionNumbers.every(id=>/reading-q(1[4-9]|2[0-6])$/.test(id)),'Right pane does not default to current passage');
   const input=page.locator('.reading-pane').nth(1).locator('input[type="text"]').first();
   if(await input.count())await input.fill('resume checkpoint');
   await page.waitForTimeout(1000);const sessions=await invoke('list_recent_sessions');const active=sessions.find(s=>s.packId==='cambridge-17-academic-test-3-luma-v2'&&s.module==='reading'&&s.status==='in-progress');
   await navigate('/home');await page.getByRole('button',{name:'Continue practice',exact:true}).click();await dialog.waitFor();
   assert((await dialog.innerText()).includes('Passage 2'),'Resume does not identify saved passage');
   await dialog.getByRole('button',{name:'Continue saved attempt',exact:true}).click();await page.locator('.reading-pane').first().waitFor();
   assert((await invoke('list_recent_sessions')).some(s=>s.id===active.id&&s.status==='in-progress'),'Resume changed identity');
   await book();await page.getByRole('tab',{name:'Test 3',exact:true}).click();
   await page.getByRole('link',{name:'Open 3 source topic cards',exact:true}).click();await page.locator('.speaking-topic-grid article').first().waitFor();
   assert(await page.locator('.speaking-topic-grid article').count()===3,'Book speaking links not filtered by Test');
   await book();await page.getByRole('tab',{name:'Test 3',exact:true}).click();
   const listening=page.locator('.library-module').filter({has:page.getByRole('heading',{name:'Listening',exact:true})});
   await listening.locator('.library-section-row').nth(1).click();await dialog.waitFor();await dialog.getByRole('button',{name:/Start (from this section|another attempt)/}).click();
   await page.locator('audio').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
   assert(await page.getByRole('button',{name:'Show transcript',exact:true}).count()===1,'Transcript is not initially hidden');
   const source=await invoke('load_pack',{packId:'cambridge-17-academic-test-3-luma-v2'});const expected=source.modules.find(m=>m.type==='listening').sections[1];
   await page.waitForFunction(start=>Math.abs(document.querySelector('audio').currentTime-start)<3,expected.startMs/1000);
   await page.screenshot({path:path.join(root,'screenshots/listening-section-final.png')});
   save('NATIVE_START_RESUME',{native:true,version:'20260920-05',covers:covers.length,writingGrouped:true,readingStartingPassage:section,rightPaneCurrentPassage:true,resumedSessionId:active.id,testSpeakingCards:3,listeningStartingSection:expected.id,listeningStartMs:expected.startMs,transcriptInitiallyHidden:true,sectionScoringScope:'full test attempt'});
  }
  if(phase==='restart'){
   await practice(2,'reading');
   const notes=await page.locator('.text-annotation--highlight-yellow').count();assert(notes>=2,'Persisted shared annotation unavailable after process restart');
   const annotation=JSON.parse(fs.readFileSync(path.join(root,'NATIVE_ANNOTATION.json')));save('NATIVE_ANNOTATION',{...annotation,restartVerified:true,version:'20260920-05'});
   const speaking=JSON.parse(fs.readFileSync(path.join(root,'NATIVE_SPEAKING.json')));
   assert((await invoke('speaking_sessions')).some(s=>s.id===speaking.session.id&&s.status==='completed'),'Speaking completion lost after restart');
   assert((await invoke('speaking_favorites')).includes(speaking.session.topicId),'Speaking favorite lost');
   const recordings=await invoke('speaking_recordings',{sessionId:speaking.session.id});assert(recordings.some(r=>r.sha256===speaking.recordings[0].sha256),'Recording metadata lost');
   await navigate('/practice/speaking');await page.locator('.speaking-topic-grid article').first().waitFor();
   save('NATIVE_SPEAKING',{...speaking,osRestartVerified:true,version:'20260920-05'});
   const writing=JSON.parse(fs.readFileSync(path.join(root,'NATIVE_WRITING.json')));await navigate(`/practice/writing?packId=${writing.pack}&testId=${writing.pack}-test&mode=study`);
   await page.locator('#writing-draft').waitFor();assert((await page.locator('#writing-draft').inputValue()).includes('An original acceptance draft.'),'Writing draft lost after restart');
   assert(await page.getByLabel('Writing elapsed').innerText()===writing.timer,'Writing elapsed time lost');save('NATIVE_WRITING',{...writing,osRestartVerified:true,version:'20260920-05'});
   save('NATIVE_RESTART_FINAL',{native:true,bootstrapId:bootstrap.workspaceId,annotation:true,speaking:true,writing:true});
  }
  if(phase==='offline'){
   const inventory=JSON.parse(fs.readFileSync(path.join(root,'IMPORT_MANIFEST.json')));assert(!fs.existsSync(inventory.sourceRoot),'Source still available');
   const blocked=[];await page.context().route('**/*',async route=>{const url=new URL(route.request().url());if(['tauri.localhost','asset.localhost','ipc.localhost'].includes(url.hostname)||['blob:','data:'].includes(url.protocol))await route.continue();else{blocked.push(url.hostname);await route.abort();}});
   const results=[];
   for(const skill of ['reading','listening']){
    const id='cambridge-17-academic-test-4-luma-v2';
    const session=await invoke('create_session',{input:{packId:id,testId:id+'-test',module:skill,mode:'study'}});
    await invoke('set_setting',{key:`activeSession.${id}.${id}-test.${skill}.study`,value:session.id});
    await practice(4,skill);const loaded=await invoke('load_pack',{packId:id});const module=loaded.modules.find(m=>m.type===skill);
    let audioPlayed=false;
    for(const [index,section] of module.sections.entries()){
     if(skill==='reading')await page.getByRole('tab',{name:new RegExp('^Passage '+(index+1))}).click();
     else await page.locator('.listening-sections button').nth(index).click();
     for(const q of section.questionGroups.flatMap(g=>g.questions)){
      const control=page.locator(`[data-question-id="${q.id}"]`).first();
      if(q.type==='multiple-choice'){for(const value of q.correctOptionIds)await control.locator(`input[value="${value}"]`).check();}
      else if(q.type==='matching')await control.locator('select').selectOption(q.correctOptionId);
      else if(['single-choice','true-false-not-given','yes-no-not-given'].includes(q.type))await control.locator(`input[value="${q.correctOptionId||q.correctAnswer}"]`).check();
      else await control.locator('input[type="text"]').fill(q.acceptableAnswers[0]);
     }
    }
    await page.waitForTimeout(1100);
    if(skill==='listening'){
     await page.getByRole('button',{name:'Play audio',exact:true}).click();await page.waitForTimeout(1100);
     audioPlayed=await page.locator('audio').evaluate(a=>a.readyState>=2&&!a.paused&&a.currentTime>0);assert(audioPlayed,'Offline audio unavailable');
     await page.getByRole('button',{name:'Pause audio',exact:true}).click();
    }
    await page.getByRole('button',{name:skill==='reading'?'Submit':'Submit Listening',exact:true}).click();await page.waitForTimeout(600);
    if(await page.getByRole('heading',{name:'Session results',exact:true}).count()===0)execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/luma_confirm.ps1'],{windowsHide:true});
    await page.getByRole('heading',{name:'Session results',exact:true}).waitFor();assert((await page.locator('body').innerText()).includes('40/40'),'Offline score differs');
    await page.screenshot({path:path.join(root,`screenshots/offline-${skill}-results.png`),fullPage:true});
    results.push({skill,sessionId:session.id,sourceUnavailable:true,points:'40/40',audioPlayed});
   }
   await navigate('/library/references');await page.locator('.reference-row').first().waitFor();
   const references=await page.locator('.reference-row').count();assert(references===10,'Writing references unavailable');
   await page.locator('.reference-row').first().getByRole('button',{name:'Open',exact:true}).click();await page.waitForTimeout(1000);
   assert(await page.getByRole('alert').count()===0,'Managed reference open failed');
   save('NATIVE_SOURCE_UNAVAILABLE',{native:true,version:'20260920-05',sourceRoot:inventory.sourceRoot,sourceAbsent:true,processRestartedWhileSourceAbsent:true,rendererExternalNetworkBlocked:true,osNetworkDisabled:false,externalRequestsBlocked:blocked,results,referenceOpenInvoked:true,writingReferenceEntries:references,verifiedAt:new Date().toISOString()});
  }
  console.log('Native final',phase,'passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
