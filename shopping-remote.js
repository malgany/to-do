(function(root,factory){
  if(typeof module!=='undefined')module.exports=factory(require('./household-model'));
  else root.ShoppingRemote=factory(root.HouseholdModel);
})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  const fail=(message,code='invalid-argument')=>{const error=new Error(message);error.code='shopping/'+code;throw error;};
  function assert(condition,message='Dados de compra inválidos.'){if(!condition)fail(message);}
  function validateList(list,householdId){
    assert(list&&safeId(list.id)&&list.householdId===householdId&&list.purchaseId===list.id&&!list.shareCode);
    assert(['mercado','farmacia','pet'].includes(list.kind)&&typeof list.title==='string'&&list.title.length<=200);
    assert(Array.isArray(list.tasks)&&list.tasks.length<=500);
    const ids=new Set();
    for(const task of list.tasks){
      assert(task&&safeId(task.id)&&!ids.has(task.id));ids.add(task.id);
      assert(typeof task.text==='string'&&task.text.length<=500&&typeof task.done==='boolean');assert(!task.notHave||task.done);
      if(task.deletedAt)continue;
      assert(task.shopping&&safeId(task.shopping.productKey)&&safeId(task.shopping.categoryId)&&typeof task.shopping.name==='string'&&task.shopping.name.length<=500);
      if(task.shopping.quantity!==undefined)assert(Number.isFinite(task.shopping.quantity)&&task.shopping.quantity>0&&task.shopping.quantity<=100000);
      assert(!task.photos||(Array.isArray(task.photos)&&task.photos.length<=4&&task.photos.every(p=>p&&safeId(p.id)&&(!p.dataUrl||(typeof p.dataUrl==='string'&&p.dataUrl.length<=400000)))));
    }
    assert(JSON.stringify(list).length<=7000000,'Lista grande demais.');return list;
  }
  function unpack(record,id,householdId){
    if(!record)return null;
    try{
      const list=validateList(JSON.parse(record.list),householdId);assert(list.id===id);
      delete list.closedAt;delete list.pendingFinish;delete list.finishConflict;list.revision=record.revision;
      if(record.closedAt)list.closedAt=record.closedAt;
      if(record.deletedAt){list.deletedAt=record.deletedAt;list.deletedBy=record.deletedBy;}
      let purchase=null;
      if(record.purchase){
        const p=record.purchase;purchase=JSON.parse(p.data);
        assert(purchase.id===id&&purchase.listId===id&&purchase.kind===list.kind&&Array.isArray(purchase.items)&&purchase.items.length<=500);
        assert(typeof purchase.title==='string'&&purchase.items.every(i=>i&&safeId(i.taskId)&&safeId(i.productKey)&&typeof i.name==='string'&&typeof i.text==='string'&&['bought','missing','pending'].includes(i.outcome)));
        Object.assign(purchase,{mode:p.mode,occurredAt:p.occurredAt,revision:p.revision});delete purchase.deletedAt;delete purchase.localOnly;
        if(p.deletedAt)purchase.deletedAt=p.deletedAt;
      }
      return {list,purchase};
    }catch(error){fail('Há um registro compartilhado inválido. Revise os dados no Firebase.','data-loss');}
  }
  function fromHouse(h,householdId){
    const data={lists:{},purchases:{},preferences:h?.preferences||{}};
    for(const [id,record] of Object.entries(h?.records||{})){const value=unpack(record,id,householdId);data.lists[id]=value.list;if(value.purchase)data.purchases[id]=value.purchase;}
    return data;
  }
  function storedList(list){const value=copy(list);for(const key of ['closedAt','deletedAt','deletedBy','pendingFinish','finishConflict','revision','organization'])delete value[key];return JSON.stringify(value);}
  function mutate(record,name,args,now=Date.now()){
    const id=args.list?.id||args.listId||args.purchaseId;assert(safeId(id)&&safeId(args.householdId));
    const current=unpack(record,id,args.householdId);let next=record?copy(record):null;
    if(name==='syncHouseholdList'){
      validateList(args.list,args.householdId);
      const incoming=copy(args.list);delete incoming.closedAt;delete incoming.pendingFinish;delete incoming.finishConflict;
      const list=M.mergeList(current?.list,incoming);next=next||{revision:0};
      // Closed content is byte-for-byte immutable under the database rules.
      if(!record?.closedAt)next.list=storedList(list);
      if(list.deletedAt){next.deletedAt=record?.deletedAt||list.deletedAt;next.deletedBy=record?.deletedBy||list.deletedBy||'';}
      if(record&&next.list===record.list&&next.deletedAt===record.deletedAt)return null;
    }else if(name==='finishHouseholdPurchase'){
      if(!current||current.list.deletedAt)fail('A lista mudou. Revise antes de finalizar.','failed-precondition');
      if(current.purchase)return null;
      assert(['complete','quick'].includes(args.mode)&&Number.isFinite(args.occurredAt)&&args.occurredAt>0&&args.occurredAt<=now+60000);
      if(M.fingerprint(current.list)!==args.expected)fail('A lista mudou. Revise antes de finalizar.','failed-precondition');
      const purchase=M.purchase(current.list,args.mode,args.occurredAt,1);next.closedAt=now;
      next.purchase={data:JSON.stringify(purchase),mode:args.mode,occurredAt:args.occurredAt,revision:1};
    }else if(name==='reviseHouseholdPurchase'){
      const p=current?.purchase;if(!p||p.revision!==args.revision)fail('A compra mudou. Abra novamente para revisar.','failed-precondition');
      if(args.deleted){if(p.deletedAt)return null;next.purchase.deletedAt=now;}
      else{
        assert(!p.deletedAt&&['complete','quick'].includes(args.mode)&&Number.isFinite(args.occurredAt)&&args.occurredAt>0&&args.occurredAt<=now+60000);
        assert(Array.isArray(args.items)&&args.items.length===p.items.length&&new Set(args.items.map(i=>i.taskId)).size===p.items.length);
        p.items=p.items.map(item=>{const edit=args.items.find(i=>i.taskId===item.taskId);assert(edit&&['bought','missing','pending'].includes(edit.outcome));return {...item,outcome:edit.outcome};});
        next.purchase.data=JSON.stringify(p);next.purchase.mode=args.mode;next.purchase.occurredAt=args.occurredAt;
      }
      next.purchase.revision++;
    }else fail('Operação desconhecida.');
    next.revision=(record?.revision||0)+1;return next;
  }
  function result(record,name,args){const value=unpack(record,args.list?.id||args.listId||args.purchaseId,args.householdId);return name==='syncHouseholdList'?value?.list:value?.purchase;}
  return {safeId,validateList,unpack,fromHouse,mutate,result};
});
