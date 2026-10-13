import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const root=path.resolve('delivery/luma-20260919-01');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {IELTSPackSchema}=await server.ssrLoadModule('/src/domain/pack/schemas.ts');
  const reports=[];
  for(const id of await fs.readdir(path.join(root,'private/BulkImportable'))) {
    const folder=path.join(root,'private/BulkImportable',id);
    let manifest;
    try {manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));} catch {continue;}
    const module=JSON.parse(await fs.readFile(path.join(folder,'modules/reading.json'),'utf8'));
    let withheldKeys=0;
    for(const section of module.sections) for(const group of section.questionGroups) for(const q of group.questions) {
      for(const field of ['correctOptionId','correctOptionIds','correctAnswer','acceptableAnswers']) {
        if(q[field]!==undefined) {withheldKeys++;delete q[field];}
      }
    }
    // Retain candidate mappings only as evidence, until independently checked.
    const evidence=path.join(root,'private','bulk-key-candidates',id+'.json');
    await fs.mkdir(path.dirname(evidence),{recursive:true});
    try {await fs.copyFile(path.join(folder,'modules/reading.json'),evidence,fs.constants.COPYFILE_EXCL);} catch(e) {if(e.code!=='EEXIST') throw e;}
    await fs.writeFile(path.join(folder,'modules/reading.json'),JSON.stringify(module,null,2));
    const result=IELTSPackSchema.safeParse({manifest,modules:[module]});
    if(!result.success) {console.log(JSON.stringify({id,issues:result.error.issues}));throw Error('Bulk schema invalid');}
    for(const asset of manifest.mediaAssets) {
      const bytes=await fs.readFile(path.join(folder,asset.relativePath));
      if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256) throw Error('Resource differs: '+id);
    }
    reports.push({packId:id,questionUnits:module.sections.flatMap(s=>s.questionGroups.flatMap(g=>g.questions)).length,withheldKeys,gradedUnits:0,ready:false,schemaAndAssetHashesVerified:true});
  }
  await fs.writeFile(path.join(root,'BULK_VALIDATION.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({draftPacks:reports.length,questionUnits:reports.reduce((n,p)=>n+p.questionUnits,0),gradedUnits:0,allValidated:true}));
} finally {await server.close();}
