const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve('delivery/luma-20260919-01');
const phase = process.argv[2] || 'inspect';
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9259';
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => {
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://tauri.localhost'));
    assert(page, 'No native Tauri window');
    await page.waitForLoadState('domcontentloaded');
    assert(await page.evaluate(() => !!window.__TAURI_INTERNALS__), 'Native bridge missing');
    const invoke = (cmd, args={}) => page.evaluate(({cmd,args}) => window.__TAURI_INTERNALS__.invoke(cmd,args), {cmd,args});
    if(phase==='formal-library') {
      const bootstrap=await invoke('get_bootstrap_state');
      assert(bootstrap.workspaceId==='a18137ae-5b67-4d6a-a77b-dbcb73f61a51','Wrong formal workspace');
      await invoke('set_setting',{key:'integration.obsidianVault',value:'D:\\Obsidian\\warehouse'});
      await page.getByRole('link',{name:'Library',exact:true}).click();
      await page.locator('.book-tile').first().waitFor();
      console.log((await page.locator('body').innerText()).slice(0,2400));
      fs.writeFileSync(path.join(root,'FORMAL_BOOTSTRAP.json'),JSON.stringify(bootstrap,null,2));
    }
    if(phase==='resume-seed' || phase==='resume-verify') {
      const id='cambridge-17-academic-test-2-luma-v2',qid=id+'-reading-q1';
      await page.evaluate(id=>location.hash=`#/practice/reading?packId=${id}&testId=${id}-test&mode=study`,id);
      const input=page.locator(`[data-question-id="${qid}"] input[type="text"]`).first();
      await input.waitFor();
      if(phase==='resume-seed') {
        await input.fill(''); await input.pressSequentially('continuous typing 123',{delay:25});
        assert(await input.inputValue()==='continuous typing 123','Typed characters were lost');
        assert(await input.evaluate(e=>document.activeElement===e),'Typing lost focus');
        await page.keyboard.insertText(' 中文');
        await page.getByRole('button',{name:'Add review flag for question 1',exact:true}).click();
        const divider=page.getByRole('separator',{name:'Resize reading panes'}),box=await divider.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+70,box.y+box.height/2,{steps:12});await page.mouse.up();
        await page.getByRole('tab',{name:/Passage 2/}).click();await page.getByRole('tab',{name:/Passage 1/}).click();
        assert(await input.inputValue()==='continuous typing 123 中文','Passage switching lost the answer');
        const scroller=page.locator('.reading-pane__content').first();
        if(await scroller.count()) { await scroller.hover();await page.mouse.wheel(0,320); }
        await page.waitForTimeout(1200);
        const data={answer:await input.inputValue(),dividerX:(await divider.boundingBox()).x,native:true,automated:true};
        fs.writeFileSync(path.join(root,'NATIVE_RESUME_SEED.json'),JSON.stringify(data,null,2));
      } else {
        const seed=JSON.parse(fs.readFileSync(path.join(root,'NATIVE_RESUME_SEED.json'),'utf8'));
        assert(await input.inputValue()===seed.answer,'Restart lost the answer');
        assert(await page.getByRole('button',{name:'Remove review flag for question 1',exact:true}).count()===1,'Restart lost review flag');
        const dividerX=(await page.getByRole('separator',{name:'Resize reading panes'}).boundingBox()).x;
        assert(Math.abs(dividerX-seed.dividerX)<4,'Restart lost divider layout');
        fs.writeFileSync(path.join(root,'NATIVE_RESUME_RESULT.json'),JSON.stringify({answerRestored:true,flagRestored:true,splitRestored:true,native:true,automated:true,realOsImeNotTested:true},null,2));
        console.log('Restart restored answer, flag, and split layout in packaged native app.');
      }
    }
    if(phase==='verify-checkpoint') {
      const sessions=await invoke('list_recent_sessions');
      const results=[];
      for(const skill of ['reading','listening']) {
        const session=sessions.find(s=>s.packId==='cambridge-17-academic-test-1-luma-v2' && s.module===skill && s.status==='submitted');
        assert(session,`Missing submitted ${skill}`);
        await page.getByRole('link',{name:'Home',exact:true}).click();
        await page.locator('.home-activity-list button').filter({hasText:new RegExp(`Test 1.*${skill}`,'i')}).first().click();
        await page.getByRole('heading',{name:'Session results',exact:true}).waitFor();
        await page.waitForTimeout(500);
        const text=await page.locator('body').innerText();
        assert(text.includes(session.id),`Wrong ${skill} session displayed`);
        assert(text.includes('40/40'),`Missing 40/40 ${skill} result`);
        const loaded=await invoke('load_session',{sessionId:session.id});
        results.push({skill,sessionId:session.id,status:session.status,answerRecords:loaded.answers.length,points:'40/40',native:true,automated:true});
        await page.screenshot({path:path.join(root,'screenshots',`results-${skill}.png`),fullPage:true});
      }
      fs.writeFileSync(path.join(root,'NATIVE_CHECKPOINT.json'),JSON.stringify(results,null,2));
      console.log(JSON.stringify(results));
    }
    if (phase === 'fill-reading' || phase === 'fill-listening') {
      const skill=phase.replace('fill-',''), id='cambridge-17-academic-test-1-luma-v2';
      await page.evaluate(({id,skill})=>location.hash=`#/practice/${skill}?packId=${id}&testId=${id}-test&mode=study`,{id,skill});
      await page.locator('[data-question-id]').first().waitFor();
      const loaded=await invoke('load_pack',{packId:id});
      const questions=loaded.modules.find(m=>m.type===skill).sections.flatMap(s=>s.questionGroups.flatMap(g=>g.questions));
      for (const q of questions) {
        if(skill==='listening') {
          const index=loaded.modules.find(m=>m.type===skill).sections.findIndex(s=>s.questionGroups.some(g=>g.questions.some(candidate=>candidate.id===q.id)));
          await page.locator('.listening-sections button').nth(index).click();
        }
        const control=page.locator(`[data-question-id="${q.id}"]`).first();
        if (q.type==='multiple-choice') {
          for (const value of q.correctOptionIds) await control.locator(`input[value="${value}"]`).check();
        } else if (q.type==='matching') await control.locator('select').selectOption(q.correctOptionId);
        else if (['single-choice','true-false-not-given','yes-no-not-given'].includes(q.type)) await control.locator(`input[value="${q.correctOptionId||q.correctAnswer}"]`).check();
        else await control.locator('input[type="text"]').fill(q.acceptableAnswers[0]);
      }
      await page.waitForTimeout(1000);
      if (skill==='listening') {
        if(await page.getByRole('button',{name:'Pause audio',exact:true}).count()) await page.getByRole('button',{name:'Pause audio',exact:true}).click();
        if(await page.getByRole('button',{name:'Clear loop',exact:true}).count()) await page.getByRole('button',{name:'Clear loop',exact:true}).click();
        await page.getByRole('button',{name:'Play audio',exact:true}).click();
        await page.waitForTimeout(1500);
        const audio=await page.locator('audio').evaluate(a=>({currentTime:a.currentTime,duration:a.duration,paused:a.paused,readyState:a.readyState,error:a.error?.code}));
        assert(!audio.paused&&audio.currentTime>0&&audio.readyState>=2,'Local audio did not play');
        await page.getByRole('button',{name:'Pause audio',exact:true}).click();
        await page.getByLabel('Playback speed').selectOption('1.25');
        const seek=page.getByLabel('Audio position'); const box=await seek.boundingBox();
        await page.mouse.move(box.x+box.width*0.05,box.y+box.height/2);
        await page.mouse.down(); await page.mouse.move(box.x+box.width*0.25,box.y+box.height/2,{steps:12}); await page.mouse.up();
        await page.waitForFunction(()=>document.querySelector('audio').currentTime>100 && !document.querySelector('audio').seeking);
        const loopStart=await page.locator('audio').evaluate(a=>a.currentTime);
        await page.getByRole('button',{name:'Set A',exact:true}).click();
        await page.getByRole('button',{name:'Play audio',exact:true}).click(); await page.waitForTimeout(2000);
        await page.getByRole('button',{name:'Pause audio',exact:true}).click();
        const loopEnd=await page.locator('audio').evaluate(a=>a.currentTime);
        await page.getByRole('button',{name:'Set B',exact:true}).click();
        await page.getByRole('button',{name:'Play audio',exact:true}).click();
        await page.waitForTimeout(3000);
        const loopTime=await page.locator('audio').evaluate(a=>a.currentTime);
        assert(loopTime>=loopStart && loopTime<loopEnd+0.5,`AB loop did not wrap: ${loopTime} outside ${loopStart}..${loopEnd}`);
        await page.getByRole('button',{name:'Pause audio',exact:true}).click();
        await page.getByRole('button',{name:'Clear loop',exact:true}).click();
        fs.writeFileSync(path.join(root,'NATIVE_AUDIO_CHECKPOINT.json'),JSON.stringify({automated:true,audio,loopStart,loopEnd,loopTime,seekByMouseDrag:true,rate:1.25},null,2));
      }
      await page.screenshot({path:path.join(root,'screenshots',`${phase}.png`),fullPage:true});
      console.log(JSON.stringify({phase,questionObjects:questions.length,points:questions.reduce((n,q)=>n+q.points,0)}));
      await page.getByRole('button',{name:skill==='reading'?'Submit':'Submit Listening',exact:true}).click();
    }
    if (phase === 'install') {
      const installed = await invoke('list_installed_packs');
      const result=[];
      for (const id of fs.readdirSync(path.join(root,'private/Importable'))) {
        const source = path.join(root,'private/Importable',id);
        const check = await invoke('validate_pack_folder',{path:source});
        assert(check.valid, JSON.stringify(check));
        if (!installed.some(p => (p.packId||p.id) === id)) {
          result.push(await invoke('install_pack',{path:source}));
        }
      }
      console.log(JSON.stringify({installed:result.map(p=>({id:p.id,sourceHash:p.sourceHash})),bootstrap:await invoke('get_bootstrap_state')}));
      await page.reload();
    }
    if (phase === 'reading' || phase === 'listening') {
      const id='cambridge-17-academic-test-1-luma-v2';
      await page.evaluate(({id,phase})=>location.hash=`#/practice/${phase}?packId=${id}&testId=${id}-test&mode=study`,{id,phase});
      await page.locator('[data-question-id]').first().waitFor();
      await page.waitForTimeout(1200);
    }
    if (['inspect','install','reading','listening'].includes(phase)) {
      await page.waitForTimeout(800);
      console.log((await page.locator('body').innerText()).slice(0,1300));
      console.log(JSON.stringify({url:page.url(),size:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})),bootstrap:await invoke('get_bootstrap_state')}));
    }
    fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
    await page.screenshot({path:path.join(root,'screenshots',`${phase}.png`),fullPage:true});
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
