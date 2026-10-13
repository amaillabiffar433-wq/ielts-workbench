const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve('delivery/luma-20260919-01');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9259');
 try{
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'));
  const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  assert((await invoke('get_bootstrap_state')).workspacePath.includes('private\\native-workspace'),'Not the isolated workspace');
  const navigate=async route=>{await page.evaluate(route=>location.hash='#'+route,route);await page.waitForTimeout(800);};
  if(process.argv[2]==='speaking'){
   await navigate('/library');await page.getByRole('link',{name:'Speaking topics',exact:true}).click();
   await page.getByRole('button',{name:'Part 2',exact:true}).click();
   const card=page.locator('.speaking-topic-grid article').first();const title=await card.locator('h2').innerText();
   if(await card.getByRole('button',{name:'Favorite',exact:true}).count())await card.getByRole('button',{name:'Favorite',exact:true}).click();
   await card.getByRole('button',{name:/^(Practise|Continue)$/}).click();
   await page.getByRole('button',{name:'Start timer',exact:true}).click();
   const notes='Isolated native acceptance: timer, notes and recording persistence.';
   await page.getByRole('textbox',{name:'Practice notes'}).fill(notes);await page.waitForTimeout(2300);
   // This fixture intentionally uses generated audio, never the user's microphone.
   await page.evaluate(()=>{window.__lumaOriginalGetUserMedia=navigator.mediaDevices.getUserMedia;window.__lumaAudioContext=new AudioContext();const destination=window.__lumaAudioContext.createMediaStreamDestination();const oscillator=window.__lumaAudioContext.createOscillator();const gain=window.__lumaAudioContext.createGain();gain.gain.value=0.02;oscillator.connect(gain).connect(destination);oscillator.start();navigator.mediaDevices.getUserMedia=async()=>destination.stream;});
   await page.getByRole('button',{name:'Record',exact:true}).click();await page.waitForTimeout(1500);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
   await page.getByRole('button',{name:'Play recording 1',exact:true}).waitFor();
   await page.evaluate(async()=>{navigator.mediaDevices.getUserMedia=window.__lumaOriginalGetUserMedia;await window.__lumaAudioContext.close();});
   await page.getByRole('button',{name:'Pause timer',exact:true}).click();
   await page.getByRole('button',{name:'Complete practice',exact:true}).click();await page.getByText('Completed · self practice, no automatic score',{exact:true}).waitFor();
   const sessions=await invoke('speaking_sessions');const saved=sessions.find(s=>s.notes===notes&&s.status==='completed');assert(saved&&saved.elapsedSeconds>=3,'Speaking completion not durable');
   const recordings=await invoke('speaking_recordings',{sessionId:saved.id});assert(recordings.length===1&&recordings[0].byteLength>1000,'Recording not saved');
   await page.getByRole('button',{name:'Play recording 1',exact:true}).click();await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
   await page.locator('audio').evaluate(a=>a.play());await page.waitForTimeout(500);const played=await page.locator('audio').evaluate(a=>a.currentTime);assert(played>0,'Recording playback did not advance');
   await page.screenshot({path:path.join(root,'screenshots/speaking-completed-v4.png')});
   await page.reload();await page.locator('.speaking-topic-grid').waitFor();assert((await invoke('speaking_favorites')).includes(saved.topicId),'Favorite did not survive reload');
   fs.writeFileSync(path.join(root,'NATIVE_SPEAKING.json'),JSON.stringify({native:true,title,session:saved,recordings,syntheticAudioFixture:true,realMicrophonePermissionTested:false,playbackAdvanced:played,reloadPersisted:true,osRestartVerified:false},null,2));
  }
  if(process.argv[2]==='writing'){
   const pack='luma-writing-a23915bf8152-prompt-1-v1';await navigate(`/practice/writing?packId=${pack}&testId=${pack}-test&mode=study`);
   const editor=page.locator('#writing-draft');await editor.waitFor();const text='An original acceptance draft. This checks autosave and word counting, and must remain only in the isolated test workspace.';
   await editor.fill(text);await page.getByRole('button',{name:'Start timer',exact:true}).click();await page.waitForTimeout(2500);await page.getByRole('button',{name:'Pause timer',exact:true}).click();await page.waitForTimeout(1100);
   assert((await page.locator('.word-count').innerText()).includes('19'),'Word count differs');
   const elapsed=await page.getByLabel('Writing elapsed').innerText();assert(elapsed!=='0:00','Writing timer did not advance');
   await page.screenshot({path:path.join(root,'screenshots/writing-draft-v4.png')});
   await page.reload();await editor.waitFor();assert(await editor.inputValue()===text,'Draft failed reload');assert(await page.getByLabel('Writing elapsed').innerText()===elapsed,'Timer failed reload');
   fs.writeFileSync(path.join(root,'NATIVE_WRITING.json'),JSON.stringify({native:true,pack,wordCount:19,draftRestored:true,timer:elapsed,osRestartVerified:false},null,2));
  }
  console.log('Native',process.argv[2],'passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
