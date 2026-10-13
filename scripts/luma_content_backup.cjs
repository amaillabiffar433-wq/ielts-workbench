const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {chromium}=require('playwright');const root=path.resolve('delivery/luma-20260919-01');
const assert=(v,m)=>{if(!v)throw Error(m);};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9259');
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'));
 const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 const original=await invoke('get_bootstrap_state');assert(original.workspacePath.includes('private\\native-workspace'),'Not the isolated app');
 try{
  await page.evaluate(()=>location.hash='#/home');await page.waitForTimeout(1000);
  const workspace=path.join(root,'private/content-only-workspace');await invoke('initialize_workspace',{path:workspace});await page.reload();await page.waitForTimeout(1200);
  const prior=await invoke('list_installed_packs');const imported=[];
  for(const collection of ['Importable','BulkImportable','WritingImportable'])for(const id of fs.readdirSync(path.join(root,'private',collection))){
   const folder=path.join(root,'private',collection,id);if(!fs.existsSync(path.join(folder,'manifest.json')))continue;
   const validated=await invoke('validate_pack_folder',{path:folder});assert(validated.valid,'Invalid source pack '+id);
   const existing=prior.find(p=>p.id===id);if(existing)assert(existing.sourceHash===validated.sourceHash,'Changed pack '+id);else await invoke('install_pack',{path:folder});
   imported.push({id,sourceHash:validated.sourceHash});
  }
  const sourceLibrary='D:\\IELTS-Workbench\\library-assets';const catalog=JSON.parse(fs.readFileSync(path.join(sourceLibrary,'catalog.json'),'utf8')).filter(r=>['Speaking','Writing'].includes(r.category)||r.sha256==='ed158d15034bec9bb4a484c237b69c6ac3c964cb506505e0106b1b4cadbf1ef1');
  const destination=path.join(workspace,'library-assets');fs.mkdirSync(path.join(destination,'objects'),{recursive:true});
  for(const entry of catalog){assert(/^objects\/[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.relativePath),'Unsafe reference path');const from=path.join(sourceLibrary,entry.relativePath);const to=path.join(destination,entry.relativePath);if(!fs.existsSync(to))fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);assert(hash(to)===entry.sha256,'Reference hash differs');}
  fs.writeFileSync(path.join(destination,'catalog.json'),JSON.stringify(catalog,null,2));
  fs.mkdirSync(path.join(workspace,'speaking-materials'),{recursive:true});fs.copyFileSync(path.join(root,'private/SpeakingImportable/catalog.json'),path.join(workspace,'speaking-materials/catalog.json'));
  const topics=await invoke('speaking_topics');assert(topics.length===148,'Speaking catalog count differs');
  const backupParent=path.join(root,'private/content-backups');const restoreParent=path.join(root,'private/content-restores');fs.mkdirSync(backupParent,{recursive:true});fs.mkdirSync(restoreParent,{recursive:true});
  const backup=await invoke('create_workspace_backup',{destinationParent:backupParent});
  const restored=await invoke('restore_workspace_backup',{backupPath:backup.path,destinationParent:restoreParent});
  const restoredPacks=await invoke('list_installed_packs');assert(imported.every(p=>restoredPacks.some(r=>r.id===p.id&&r.sourceHash===p.sourceHash)),'Restored pack identity differs');
  assert((await invoke('speaking_topics')).length===148,'Restored speaking catalog differs');assert((await invoke('list_reference_materials')).length===catalog.length,'Restored reference catalog differs');
  const detail={native:true,backup,restored,practicePacks:imported.length,additionalDemoPacks:restoredPacks.filter(p=>!imported.some(i=>i.id===p.id)).map(p=>p.id),speakingTopicCards:148,referenceEntries:catalog.length,resourcesIncluded:'All Writing and Speaking references plus the C17 source book; unstructured Cambridge sources are separately archived under Originals.',imported,allNativeRestoreIdentitiesMatch:true,learningRecordAudit:'pending-before-upload'};
  fs.writeFileSync(path.join(root,'NATIVE_CONTENT_BACKUP.json'),JSON.stringify(detail,null,2));console.log(JSON.stringify({packs:imported.length,topics:148,references:catalog.length,backup:backup.path,restored:restored.workspacePath}));
 }finally{
  await invoke('initialize_workspace',{path:original.workspacePath});await page.reload();await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
