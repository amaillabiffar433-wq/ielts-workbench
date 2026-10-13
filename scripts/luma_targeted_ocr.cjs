const fs=require('node:fs');
const path=require('node:path');
const {createWorker}=require('tesseract.js');
(async()=>{
 const root=path.resolve('delivery/luma-20260919-01');
 const worker=await createWorker('eng',1,{langPath:path.resolve('public/ocr'),gzip:false,cacheMethod:'none'});
 try {
  const results=[];
  for(const page of [6,9,10,31]) {
   const {data}=await worker.recognize(path.join(root,`private/c20-test1/ocr-page-${page}.png`));
   results.push({page,confidence:data.confidence,text:data.text});
  }
  fs.writeFileSync(path.join(root,'private/c20-test1/targeted-ocr.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(r=>({page:r.page,confidence:r.confidence,characters:r.text.length}))));
 }finally{await worker.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
