(function(root,factory){const api=factory(); if(typeof module!=='undefined') module.exports=api; else root.HouseholdModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const version=(a,b,p)=>Number(a?.[p+'At']||0)-Number(b?.[p+'At']||0) || String(a?.[p+'By']||'').localeCompare(String(b?.[p+'By']||''));
  function mergeTask(a,b){
    if(!a) return clone(b); if(!b) return clone(a);
    const r={...a};
    for(const [prefix,fields] of [['textUpdated',['text']],['doneUpdated',['done']],['notHaveUpdated',['notHave']],['shoppingUpdated',['shopping']]]){
      if(version(b,a,prefix)>0) for(const k of [...fields,prefix+'At',prefix+'By']) if(b[k]!==undefined) r[k]=clone(b[k]);
    }
    const deletionA={deletionUpdatedAt:a.deletionUpdatedAt||a.deletedAt||0,deletionUpdatedBy:a.deletionUpdatedBy||a.deletedBy||''};
    const deletionB={deletionUpdatedAt:b.deletionUpdatedAt||b.deletedAt||0,deletionUpdatedBy:b.deletionUpdatedBy||b.deletedBy||''};
    if(version(deletionB,deletionA,'deletionUpdated')>0){r.deletedAt=b.deletedAt||null;r.deletedBy=b.deletedBy||'';r.deletionUpdatedAt=deletionB.deletionUpdatedAt;r.deletionUpdatedBy=deletionB.deletionUpdatedBy;}
    const photos=new Map((a.photos||[]).map(p=>[p.id,p]));
    for(const p of b.photos||[]){const old=photos.get(p.id);if(!old || version(p,old,'updated')>0)photos.set(p.id,p);}
    r.photos=[...photos.values()];
    if(r.notHave && (Number(r.notHaveUpdatedAt||0)<Number(r.doneUpdatedAt||0) || (r.notHaveUpdatedAt===r.doneUpdatedAt && String(r.notHaveUpdatedBy||'')<String(r.doneUpdatedBy||''))))r.notHave=false;
    r.notHave=!!r.done && !!r.notHave;
    r.updatedAt=Math.max(a.updatedAt||0,b.updatedAt||0,r.shoppingUpdatedAt||0);
    return r;
  }
  function mergeList(a,b){
    if(!a) return {...clone(b),revision:0};
    if(a.deletedAt) return clone(a);
    if(a.closedAt) return b.deletedAt ? {...clone(a),deletedAt:b.deletedAt,deletedBy:b.deletedBy} : clone(a);
    const r=version(b,a,'metaUpdated')>0 ? {...a,title:b.title,metaUpdatedAt:b.metaUpdatedAt,metaUpdatedBy:b.metaUpdatedBy} : {...a};
    const tasks=new Map((a.tasks||[]).map(t=>[t.id,t]));
    for(const t of b.tasks||[])tasks.set(t.id,mergeTask(tasks.get(t.id),t));
    r.tasks=[...tasks.values()];
    if(b.deletedAt){r.deletedAt=b.deletedAt;r.deletedBy=b.deletedBy;}
    return r;
  }
  // Canonical purchase contents, independent of local task order and photo/UI changes.
  function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!=null).map(k=>[k,canonical(value[k])]));
    return value;
  }
  function fingerprint(list){
    return JSON.stringify(canonical({kind:list.kind,title:list.title,items:(list.tasks||[]).filter(t=>!t.deletedAt).map(t=>({id:t.id,text:t.text,done:!!t.done,notHave:!!t.notHave,shopping:t.shopping||null})).sort((a,b)=>a.id.localeCompare(b.id))}));
  }
  function purchase(list,mode,occurredAt,revision){
    return {id:list.purchaseId||list.id,listId:list.id,sourceRef:list.sourceRef||list.id,kind:list.kind,title:list.title,mode,occurredAt,revision,
      items:(list.tasks||[]).filter(t=>!t.deletedAt).map(t=>({...t.shopping,taskId:t.id,text:t.text,outcome:t.notHave?'missing':t.done?'bought':'pending'}))};
  }
  function finalize(house,listId,expected,mode,occurredAt,now){
    const list=house.lists?.[listId]; if(!list)throw new Error('not-found');
    const id=list.purchaseId||list.id;
    if(list.closedAt && house.purchases?.[id])return house.purchases[id];
    if(list.deletedAt || fingerprint(list)!==expected)throw new Error('conflict');
    const p=purchase(list,mode,occurredAt,1);
    house.purchases=house.purchases||{};
    house.purchases[id]=p; list.closedAt=now;list.revision=(list.revision||0)+1;
    return p;
  }
  return {mergeTask,mergeList,fingerprint,purchase,finalize};
});
