const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve('delivery/luma-20260919-01');
const phase=process.argv[2];
const assert=(v,m)=>{if(!v)throw Error(m);};
const save=(name,value)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value,null,2));
(async()=>{
 const browser=await chromium.connectOverCDP(process.env.CDP_ENDPOINT||'http://127.0.0.1:9259');
 try {
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'));
  assert(page,'Native page absent');
  const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  const initial=await invoke('get_bootstrap_state');
  assert(phase.startsWith('publish') ? initial.workspaceId==='a18137ae-5b67-4d6a-a77b-dbcb73f61a51' : initial.workspacePath?.includes('luma-20260919-01'), 'Wrong workspace');
  const navigate=async(route)=>{await page.evaluate(route=>location.hash='#'+route,route);await page.waitForTimeout(900);};
  const practice=async(test,skill='reading',mode='study')=>{
   const id=`cambridge-17-academic-test-${test}-luma-v2`;
   await navigate(`/practice/${skill}?packId=${id}&testId=${id}-test&mode=${mode}`);
   await page.locator('[data-question-id]').first().waitFor();
  };
  if(phase==='restore') {
   const restored=await invoke('initialize_workspace',{path:path.join(root,'private/restored-workspace')});
   const existing=await invoke('list_installed_packs');
   const results=[];
   for(const id of fs.readdirSync(path.join(root,'private/restored-archive/packs'))) {
    const source=path.join(root,'private/restored-archive/packs',id);
    const validated=await invoke('validate_pack_folder',{path:source});assert(validated.valid,JSON.stringify(validated));
    const installed=existing.find(p=>(p.id||p.packId)===id)||await invoke('install_pack',{path:source});
    const duplicate=await page.evaluate(async(source)=>{try{return{accepted:await window.__TAURI_INTERNALS__.invoke('install_pack',{path:source})};}catch(e){return{error:e};}},source);
    const duplicateRejected=duplicate.error?.code==='CONFLICT'&&duplicate.error.message.includes('already installed');
    assert(duplicateRejected,'Repeated pack was not rejected safely');
    results.push({id,sourceHash:installed.sourceHash,resourcesVerified:true,duplicateRejected});
   }
   const restoredPacks=await invoke('list_installed_packs');
   assert(results.length===36 && results.every(p=>restoredPacks.some(installed=>(installed.id||installed.packId)===p.id)),'Restore identity mismatch');
   const result=JSON.parse(fs.readFileSync(path.join(root,'PACK_RESTORE_RESULT.json'),'utf8'));
   save('PACK_RESTORE_RESULT',{...result,nativeReimport:'passed',restoredWorkspace:restored,packResults:results,additionalDemoPacks:restoredPacks.filter(p=>!results.some(r=>r.id===(p.id||p.packId))).map(p=>p.id||p.packId)});
   await invoke('initialize_workspace',{path:path.join(root,'private/native-workspace')});
   await page.reload();
   console.log('Native restored all 36 packs and rejected duplicate installs without duplicating records.');
  }
  if(['install-bulk','publish','install-writing','publish-writing'].includes(phase)) {
   const before=await invoke('list_installed_packs');const results=[];
   for(const id of fs.readdirSync(path.join(root,phase.includes('writing')?'private/WritingImportable':'private/BulkImportable'))) {
    const source=path.join(root,phase.includes('writing')?'private/WritingImportable':'private/BulkImportable',id);
    if(!fs.existsSync(path.join(source,'manifest.json')))continue;
    const validated=await invoke('validate_pack_folder',{path:source});assert(validated.valid,JSON.stringify(validated));
    const previous=before.find(p=>(p.id||p.packId)===id);
    if(previous) {assert(previous.sourceHash===validated.sourceHash,'Installed version differs');continue;}
    const installed=await invoke('install_pack',{path:source});results.push({id,sourceHash:installed.sourceHash});
   }
   save(phase.includes('writing')?(phase.startsWith('publish')?'FORMAL_WRITING_INSTALL':'NATIVE_WRITING_INSTALL'):(phase==='publish'?'FORMAL_BULK_INSTALL':'NATIVE_BULK_INSTALL'),{before:before.length,added:results,native:true});
   // Publishing never reloads or navigates the user's formal window.
   if(!phase.startsWith('publish'))await page.reload();
   console.log(JSON.stringify({phase,added:results.length}));
  }
  if(phase==='obsidian') {
   const vault=path.join(root,'private/obsidian-vault');
   const dir=path.join(vault,'课程学习','英语学习','雅思');fs.mkdirSync(dir,{recursive:true});
   const day=new Date().toLocaleDateString('sv-SE');
   const target=path.join(dir,day+'.md');
   const personal='Personal handwritten note retained.\n';
   if(!fs.existsSync(target))fs.writeFileSync(target,personal);
   await invoke('set_setting',{key:'integration.obsidianVault',value:vault});
   await navigate('/settings');
   await page.getByRole('button',{name:'Sync today / retry pending',exact:true}).click();
   await page.getByText(/^Synced:/).waitFor();
   const first=fs.readFileSync(target,'utf8');assert(first.startsWith(personal),'Personal text changed');assert(first.includes('Raw score: 40/40'),'Completed real-source sessions missing');
   await page.getByRole('button',{name:'Sync today / retry pending',exact:true}).click();
   await page.getByText(/^Synced:/).waitFor();await page.waitForTimeout(300);
   assert(fs.readFileSync(target,'utf8')===first,'Repeated sync is not idempotent');
   await invoke('set_setting',{key:'integration.obsidianVault',value:path.join(vault,'unavailable')});
   await navigate('/');await navigate('/settings');
   await page.getByRole('button',{name:'Sync today / retry pending',exact:true}).click();
   await page.getByText(/^Export failed/).waitFor();
   const pending=await invoke('get_setting',{key:'integration.obsidianPendingDates'});
   assert(JSON.stringify(pending).includes(day),'Failed date not queued');
   await invoke('set_setting',{key:'integration.obsidianVault',value:vault});
   await navigate('/');await navigate('/settings');
   await page.getByRole('button',{name:'Sync today / retry pending',exact:true}).click();
   await page.getByText(/^Synced:/).waitFor();
   assert(fs.readFileSync(target,'utf8')===first,'Retry damaged note');
   save('NATIVE_OBSIDIAN',{native:true,automated:true,target,sha256:crypto.createHash('sha256').update(first).digest('hex'),personalNotePreserved:true,idempotent:true,failureQueuedAndRetried:true});
   console.log('Native Obsidian sync preserved handwritten text, was idempotent, queued a missing vault, and retried.');
  }
  if(phase==='vocabulary') {
   await practice(3);
   const block=page.locator('[data-pane-scroll="left"] [data-content-block-id]').filter({hasText:/the /i}).first();
   await block.scrollIntoViewIfNeeded();
   const point=await block.evaluate(el=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
    while ((n=walker.nextNode())){const hit=/\bthe\b/i.exec(n.textContent);if(hit){const r=document.createRange();r.setStart(n,hit.index);r.setEnd(n,hit.index+3);const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}}
    throw Error('No word selection point');
   });
   await page.mouse.dblclick(point.x,point.y,{delay:70});
   await page.getByRole('button',{name:'Add to Vocabulary',exact:true}).click();
   await page.waitForTimeout(1100);
   const first=(await invoke('list_vocabulary_items')).find(v=>v.normalizedTerm==='the');assert(first,'UI word collection failed');
   // The second source is collected from another actual passage via the same UI.
   await page.getByRole('tab',{name:/Passage 2/}).click();
   const next=page.locator('[data-pane-scroll="left"] [data-content-block-id]').filter({hasText:/the /i}).first();await next.scrollIntoViewIfNeeded();
   const pt=await next.evaluate(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while ((n=w.nextNode())){const h=/\bthe\b/i.exec(n.textContent);if(h){const r=document.createRange();r.setStart(n,h.index);r.setEnd(n,h.index+3);const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}}throw Error('No second word');});
   await page.mouse.dblclick(pt.x,pt.y,{delay:70});await page.getByRole('button',{name:'Add to Vocabulary',exact:true}).click();await page.waitForTimeout(1100);
   await navigate('/vocabulary');
   const states=page.getByRole('combobox',{name:/Learning state for the/i});assert(await states.count()===1,'Repeated word was not grouped');
   await states.selectOption('mastered');await page.waitForTimeout(500);
   await page.getByRole('button',{name:/^Expand the$/i}).click();
   assert(await page.getByText('2 saved sources',{exact:true}).count()===1,'Both sources not retained');
   await page.getByRole('textbox',{name:'Definition / my notes'}).fill('My own review note');await page.getByRole('heading',{name:'Vocabulary',exact:true}).click();await page.waitForTimeout(500);
   const records=(await invoke('list_vocabulary_items')).filter(v=>v.normalizedTerm==='the');
   assert(records.length===2&&records.every(v=>v.learningState==='mastered'),'Word status not persisted across both sources');
   await page.screenshot({path:path.join(root,'screenshots/vocabulary-final.png'),fullPage:true});
   save('NATIVE_VOCABULARY',{native:true,automated:true,term:'the',sources:records.map(v=>({id:v.id,blockId:v.sourceBlockId,state:v.learningState})),distinctSourcesPreserved:true});
   console.log('Native word selection, two-source grouping, mastery, and note saving passed.');
  }
  if(phase==='interaction') {
   await practice(2);
   const left=page.locator('[data-pane-scroll="left"]'),right=page.locator('[data-pane-scroll="right"]');
   await left.evaluate(e=>e.scrollTop=0);await right.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(400);await left.hover({position:{x:20,y:20}});await page.mouse.wheel(0,480);await page.waitForTimeout(450);
   const leftTop=await left.evaluate(e=>e.scrollTop);assert(leftTop>100,'Left pane did not scroll');
   const beforeRight=await right.evaluate(e=>e.scrollTop);await right.hover({position:{x:20,y:20}});await page.mouse.wheel(0,370);await page.waitForTimeout(450);
   assert(await right.evaluate(e=>e.scrollTop)>beforeRight,'Right pane did not scroll');
   assert(Math.abs(await left.evaluate(e=>e.scrollTop)-leftTop)<2,'Right scroll changed left scroll');
   await page.getByRole('tab',{name:/Passage 2/}).click();await page.getByRole('tab',{name:/Passage 1/}).click();await page.waitForTimeout(350);
   assert(Math.abs(await left.evaluate(e=>e.scrollTop)-leftTop)<3,'Passage switching lost scroll');
   // A genuine composition event sequence exercises the React handler. OS IME remains separately untested.
   const q=page.locator('[data-question-id$="reading-q1"] input[type="text"]').first();await q.scrollIntoViewIfNeeded();await q.focus();
   await q.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''})));
   await page.keyboard.insertText('输入法');
   await q.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'输入法'})));
   await page.waitForTimeout(700);assert((await q.inputValue()).includes('输入法'),'Composition text lost');
   await practice(2,'listening','study');
   await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
   await page.getByLabel('Playback speed').selectOption('1.5');
   const volume=page.getByRole('slider',{name:'Volume',exact:true});await volume.fill('0.4');
   await page.getByRole('button',{name:'Play audio',exact:true}).click();await page.waitForTimeout(1200);
   const audio=await page.locator('audio').evaluate(a=>({time:a.currentTime,rate:a.playbackRate,volume:a.volume,duration:a.duration}));assert(audio.time>0&&audio.rate===1.5,'Local audio did not play');
   await page.getByRole('button',{name:'Pause audio',exact:true}).click();
   await page.getByRole('button',{name:/Part 2/}).first().click();
   assert(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-audio.time)<3,'Part switch reset audio');
   await practice(4,'listening','exam');
   assert(await page.getByLabel('Study audio controls').count()===0,'Exam exposes Study audio controls');
   assert(await page.getByLabel('Playback speed').count()===0,'Exam exposes rate');
   assert(await page.getByRole('button',{name:'Set A',exact:true}).count()===0,'Exam exposes A-B loop');
   assert(await page.getByText('Transcript',{exact:true}).count()===0,'Exam exposes transcript');
   save('NATIVE_INTERACTION',{native:true,automated:true,independentScroll:true,scrollRestoredOnPassageSwitch:true,compositionEvents:true,realWindowsImeTested:false,examStudyControlsAbsent:true,audio});
   console.log('Native independent scrolling, composition events, Exam restrictions, and audio preferences passed.');
   await page.getByRole('button',{name:'Submit Listening',exact:true}).click();
  }
  if(phase==='save-retry') {
   await practice(2);
   const input=page.locator('[data-question-id$="reading-q1"] input[type="text"]').first();
   const {spawn}=require('node:child_process');
   const locker=spawn('python',['-u','-c','import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute("BEGIN EXCLUSIVE");print("LOCKED",flush=True);sys.stdin.readline();c.rollback();c.close()',path.join(root,'private/native-workspace/ielts-workbench.sqlite3')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   await new Promise((resolve,reject)=>{locker.stdout.once('data',b=>String(b).includes('LOCKED')?resolve():reject(Error('Lock failed')));locker.once('error',reject);});
   const answer='retained after save failure';
   try {
    await input.fill('');await input.pressSequentially(answer,{delay:18});await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    assert(await input.inputValue()===answer,'Save failure discarded input');
   }finally{locker.stdin.end('\n');await new Promise(resolve=>locker.once('exit',resolve));}
   await page.getByRole('button',{name:'Retry save',exact:true}).click();
   await page.waitForTimeout(900);assert(await page.getByRole('button',{name:'Retry save',exact:true}).count()===0,'Retry did not clear failure');
   await page.reload();await input.waitFor();assert(await input.inputValue()===answer,'Retried answer was not durable');
   save('NATIVE_SAVE_RETRY',{native:true,automated:true,realIsolatedDatabaseLock:true,inputRetained:true,retryPersisted:true,reloadRestored:true});
  }
  if(phase==='annotation') {
   await practice(2);
   const pane=page.locator('.reading-pane').first();
   const block=pane.locator('[data-content-block-id]').filter({hasText:/the /i}).first();await block.scrollIntoViewIfNeeded();
   const point=await block.evaluate(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while ((n=w.nextNode())){const h=/\bthe\b/i.exec(n.textContent);if(h){const r=document.createRange();r.setStart(n,h.index);r.setEnd(n,h.index+3);const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}}throw Error('Word absent');});
   await page.mouse.dblclick(point.x,point.y,{delay:70});
   await pane.getByRole('textbox',{name:'Annotation note (optional)'}).fill('Stable source anchor test');
   await pane.getByRole('button',{name:'Add yellow highlight',exact:true}).click();await page.waitForTimeout(500);
   await page.locator('.reading-pane').nth(1).locator('.reading-pane__selector').selectOption('passage');
   await page.locator('.reading-pane').nth(1).locator('.reading-pane__passage-selector').selectOption(await page.locator('.reading-pane').first().locator('.reading-pane__passage-selector').inputValue());
   assert(await page.locator('.text-annotation--highlight-yellow').count()>=2,'Shared passage annotation not visible in both panes');
   save('NATIVE_ANNOTATION',{native:true,automated:true,bothPanesSynchronized:true,note:'Stable source anchor test',restartVerified:false});
  }
  if(phase==='layouts') {
   const client=await page.context().newCDPSession(page);
   const evidence=[];
   const routes=[['home','/'],['library','/library'],['reading','/practice/reading?packId=cambridge-17-academic-test-2-luma-v2&testId=cambridge-17-academic-test-2-luma-v2-test&mode=study'],['listening','/practice/listening?packId=cambridge-17-academic-test-2-luma-v2&testId=cambridge-17-academic-test-2-luma-v2-test&mode=study'],['vocabulary','/vocabulary']];
   for(const [width,height,scale] of [[1280,800,1.25],[1920,1080,1.5]]) {
    await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    for(const [name,route] of routes) {
     await navigate(route);await page.waitForTimeout(650);
     if(name==='vocabulary')await page.getByRole('button',{name:/^Expand the$/i}).click();
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=2,`${name} body overflows by ${overflow}`);
     const file=`${name}-${width}x${height}-${scale}.png`;
     await page.screenshot({path:path.join(root,'screenshots',file),fullPage:true});
     evidence.push({name,width,height,scale,file,bodyOverflow:overflow,native:true,deviceMetricsEmulated:true});
    }
    await navigate('/');await page.locator('.home-activity-list button').filter({hasText:/Test 1.*reading/i}).first().click();await page.getByRole('heading',{name:'Session results',exact:true}).waitFor();
    const file=`results-${width}x${height}-${scale}.png`;await page.screenshot({path:path.join(root,'screenshots',file),fullPage:true});
    evidence.push({name:'results',width,height,scale,file,native:true,deviceMetricsEmulated:true});
   }
   await client.send('Emulation.clearDeviceMetricsOverride');
   save('NATIVE_LAYOUTS',{automated:true,evidence,actualWindowsScaleTested:[200],windows125And150NotChangedOrTested:true});
   console.log('Native renderer screenshots passed at two viewport/scale emulations; OS scale was unchanged.');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
