const {test}=require('node:test');
const assert=require('node:assert/strict');
const worker=import('../jev-worker/worker.mjs');
const origin='https://malgany.github.io';
const payload={householdId:'our_house',kind:'mercado',items:[{id:'rice',text:'Arroz'}]};
function setup(overrides={},responses=[]) {
  const calls=[],limits=[];
  const env={ALLOWED_ORIGIN:origin,FIREBASE_DATABASE_URL:'https://demo.firebaseio.com',HOUSEHOLD_ID:'our_house',JEV_ENABLED:'true',JEV_API_KEY:'test-secret',RATE_LIMITER:{limit:async args=>{limits.push(args);return {success:true};}},...overrides};
  const fetch=async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;return next||Response.json(calls.length===1 ? {user1:true,user2:true} : calls.length===2 ? true : {answers:{rice:{type:'choice',choice:'basicos',confidence:.99,probabilities:{basicos:.99}}}});};
  const request=(body=payload,headers={})=>new Request('https://shopping.workers.dev',{method:'POST',headers:{Origin:origin,Authorization:'Bearer id.token.signature','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  return {env,calls,limits,fetch,request,run:async(req)=> (await worker).handleRequest(req,env,{fetch})};
}
test('Worker uses the same category IDs and labels as the local catalog',async()=>{
  const {CATEGORIES}=await worker;
  for(const template of require('../shopping-catalog'))assert.deepEqual(CATEGORIES[template.id],Object.fromEntries(template.groups.map(g=>[g.id,g.title])));
});
test('Jev is disabled by default and requires quota protection',async()=>{
  for(const overrides of [{JEV_ENABLED:undefined},{JEV_ENABLED:'false'},{RATE_LIMITER:undefined},{JEV_API_KEY:''}]){
    const s=setup(overrides),r=await s.run(s.request());assert.equal(r.status,503);assert.equal(s.calls.length,0);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
  }
});
test('Origin and Firebase membership gates never forward unauthorized requests to Jev',async()=>{
  const badOrigin=setup();assert.equal((await badOrigin.run(badOrigin.request(payload,{Origin:'https://evil.example'}))).status,403);assert.equal(badOrigin.calls.length,0);
  const missing=setup();assert.equal((await missing.run(missing.request(payload,{Authorization:''}))).status,401);assert.equal(missing.calls.length,0);
  for(const access of [new Response('Denied',{status:401}),Response.json(null),Response.json({user:true,other:false}),Response.json({a:true,b:true,c:true})]){
    const s=setup({},[access]);assert.equal((await s.run(s.request())).status,403);assert.equal(s.calls.length,1);assert.equal(s.limits.length,0);
  }
  const disabled=setup({},[Response.json({a:true}),Response.json(false)]);assert.equal((await disabled.run(disabled.request())).status,403);assert.equal(disabled.calls.length,2);assert.equal(disabled.limits.length,0);
});
test('Preflight never contacts Firebase or Jev',async()=>{
  const s=setup(),r=await s.run(new Request('https://shopping.workers.dev',{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(s.calls.length,0);
});
test('Malformed, duplicate, oversized and client-category input is rejected',async()=>{
  for(const body of ['{', {...payload,items:[]},{...payload,items:[payload.items[0],payload.items[0]]},{...payload,householdId:'other'}, {...payload,kind:'constructor'}, {...payload,categories:[{id:'arbitrary'}]}, {...payload,items:[{id:'__proto__',text:'abc'}]}, {...payload,items:[{id:'x',text:'x'.repeat(501)}]},' '.repeat(16385)]){
    const s=setup();assert.equal((await s.run(s.request(body))).status,400);assert.equal(s.calls.length,0);
  }
});
test('Authenticated member receives only accepted categories and no credentials',async()=>{
  const s=setup({},[Response.json({one:true,two:true}),Response.json(true),Response.json({model:'untrusted',answers:{rice:{type:'choice',choice:'basicos',confidence:.99,probabilities:{basicos:.95}},low:{type:'choice',choice:'limpeza',confidence:.84,probabilities:{limpeza:1}},fake:{type:'choice',choice:'arbitrary',confidence:1,probabilities:{arbitrary:1}},weak:{type:'choice',choice:'hortifruti',confidence:.99,probabilities:{hortifruti:.89}}}})]);
  const r=await s.run(s.request({...payload,items:['rice','low','fake','weak'].map(id=>({id,text:'produto'}))}));
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{results:{rice:{categoryId:'basicos',confidence:.99}},model:'jev-1.13.0'});
  assert.deepEqual(s.limits,[{key:'jev:our_house'}]);assert.match(s.calls[0].url,/householdAccess\/our_house.json\?auth=id.token.signature/);
  const upstream=s.calls[2];assert.equal(upstream.options.headers.Authorization,'Bearer test-secret');
  assert.equal(upstream.options.signal instanceof AbortSignal,true);assert.equal(JSON.parse(upstream.options.body).questions.rice.criteria.basicos,'Básicos');
  assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('Quota and unavailable rate limiter prevent model requests',async()=>{
  for(const [limit,status] of [[async()=>({success:false}),429],[async()=>{throw Error('secret error');},503]]){
    const s=setup({RATE_LIMITER:{limit}});const r=await s.run(s.request());assert.equal(r.status,status);assert.equal(s.calls.length,2);assert.doesNotMatch(await r.text(),/secret error/);
  }
});
test('Upstream failures and oversized output safely fall back to local classification',async()=>{
  for(const upstream of [new Error('secret upstream details'),new Response('private',{status:500}),new Response('{'),new Response(' '.repeat(131073))]){
    const s=setup({},[Response.json({one:true}),Response.json(true),upstream]),r=await s.run(s.request());
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{results:{},unavailable:true});
  }
});
