/* Optional Node unit check of standalone script execution, without HTTP or a browser.
   This minimal DOM double is not a substitute for visual browser verification. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  for(let n=1;n<=9;n++){
    const pid=`DEMO-${String(n).padStart(3,'0')}`;
    const file=fs.readFileSync(path.join(root,'outputs','pitch',pid+'.html'),'utf8');
    const script=file.match(/<script>([\s\S]*)<\/script>/)[1];
    const elements=new Map();
    const document={getElementById(id){
      if(!elements.has(id))elements.set(id,{value:id==='filter'?'all':'',innerHTML:'',textContent:'',hidden:false,addEventListener(){}});
      return elements.get(id);
    }};
    let requests=0;
    await vm.runInNewContext(script,{document,fetch(){requests++;throw Error('Offline view attempted network request');},console,setTimeout});
    assert.equal(requests,0);
    assert.match(elements.get('overview').innerHTML,new RegExp(pid));
    assert.match(elements.get('overview').innerHTML,/FIXTURE REPLAY/);
    assert.equal(elements.get('analyse').hidden,true);
    assert.equal(elements.get('provider').hidden,true);
    assert.equal(elements.get('export').hidden,true);
    elements.get('filter').value='unresolved';elements.get('filter').onchange();
    assert.equal(requests,0);
    if(n===5)assert.match(elements.get('cards').innerHTML,/No tasks in this view/);
  }
  console.log('9 standalone scripts rendered and filtered without network requests (DOM double).');
})().catch(e=>{console.error(e);process.exitCode=1});
