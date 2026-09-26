(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const empty=()=>({lists:{},purchases:{},preferences:{},pendingLists:{},pendingFinishes:{},pendingPreferences:{},dismissed:{},categoryCache:{}});
  const array=x=>Array.isArray(x)?x:(x&&typeof x==='object'?Object.values(x):[]);
  const normalizeList=l=>({...l,tasks:array(l.tasks).filter(Boolean).map(t=>({...t,photos:array(t.photos).filter(Boolean)}))});
  const normalizePurchase=p=>({...p,items:array(p.items).filter(Boolean)});
  class ShoppingStore {
    constructor(onChange){this.onChange=onChange;this.uid=null;this.householdId=null;this.key='todo_shopping_guest_v1';this.data=this.read();this.error='';this.generation=0;this.authGeneration=0;this.flushing=false;this.flushToken=null;this.retryTimer=null;this.retryAttempt=0;this.cloud=null;
      root.addEventListener('online',()=>{this.resetRetry();this.flush();});root.addEventListener('shopping-cloud-ready',()=>this.connect());this.connect();
    }
    read(key=this.key){try{const data={...empty(),...JSON.parse(localStorage.getItem(key)||'{}')};for(const [id,l] of Object.entries(data.lists))data.lists[id]=normalizeList(l);for(const [id,p] of Object.entries(data.purchases))data.purchases[id]=normalizePurchase(p);return data;}catch(_){return empty();}}
    persist(){try{localStorage.setItem(this.key,JSON.stringify(this.data));}catch(_){this.error='Não foi possível salvar neste aparelho. Libere espaço antes de continuar.';throw new Error(this.error);}}
    notify(){this.onChange?.(this);}
    localData(){return this.key==='todo_shopping_guest_v1'?this.data:this.read('todo_shopping_guest_v1');}
    persistLocal(data){try{localStorage.setItem('todo_shopping_guest_v1',JSON.stringify(data));}catch(_){this.error='Não foi possível salvar neste aparelho. Libere espaço antes de continuar.';throw new Error(this.error);}if(this.key==='todo_shopping_guest_v1')this.data=data;}
    history(){
      const purchases=new Map(Object.values(this.localData().purchases).map(p=>[p.sourceRef||p.id,{...normalizePurchase(p),localOnly:true}]));
      if(this.key!=='todo_shopping_guest_v1')for(const p of Object.values(this.data.purchases))purchases.set(p.sourceRef||p.id,{...normalizePurchase(p),...(!this.householdId?{localOnly:true}:{})});
      return [...purchases.values()];
    }
    linkedHousehold(uid){try{return localStorage.getItem('todo_shopping_link_v1_'+uid)||null;}catch(_){return null;}}
    rememberHousehold(uid,id){try{const key='todo_shopping_link_v1_'+uid;if(id)localStorage.setItem(key,id);else localStorage.removeItem(key);}catch(_){}}
    resetRetry(){if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;this.retryAttempt=0;}
    scheduleRetry(networkFailure){
      if(this.retryTimer || !this.pendingCount() || !this.householdId || !navigator.onLine)return;
      if(networkFailure && this.retryAttempt>=6)return;
      const generation=this.generation,delay=networkFailure?Math.min(30000,1000*2**this.retryAttempt++):50;
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;if(generation===this.generation)this.flush();},delay);
    }
    switchScope(uid,id){
      this.resetRetry();this.generation++;this.flushToken=null;this.flushing=false;this.uid=uid;this.householdId=id;this.key=uid?'todo_shopping_v1_'+uid+'_'+(id||'unlinked'):'todo_shopping_guest_v1';this.data=this.read();this.error='';this.notify();this.flush();
    }
    subscribeHouse(id){
      if(!id)return;const generation=this.generation;
      this.stopHouse=this.cloud.watchHouse(id,h=>{if(generation!==this.generation)return;this.receive(h);},()=>{if(generation!==this.generation)return;this.error='Não foi possível acessar o espaço. Verifique sua conexão ou acesso.';this.notify();});
    }
    connect(){
      if(this.cloud || !root.ShoppingCloud)return;this.cloud=root.ShoppingCloud;
      this.cloud.onAuth(user=>{
        const authGeneration=++this.authGeneration;
        this.stopProfile?.();this.stopHouse?.();this.stopProfile=null;this.stopHouse=null;
        const cachedId=user?this.linkedHousehold(user.uid):null;
        this.switchScope(user?.uid||null,cachedId);this.subscribeHouse(cachedId);
        if(user)this.stopProfile=this.cloud.watchProfile(user.uid,profile=>{
          if(authGeneration!==this.authGeneration || this.uid!==user.uid)return;
          // A null initial snapshot can be an empty offline cache, not a revoked link.
          // Keep the cached scope until an explicit profile arrives; server rules enforce access.
          if(profile==null && this.householdId)return;
          const id=profile?.householdId||null;
          this.rememberHousehold(user.uid,id);
          if(this.uid===user.uid && this.householdId===id)return;
          this.stopHouse?.();this.switchScope(user.uid,id);
          this.subscribeHouse(id);
        },()=>{if(authGeneration!==this.authGeneration || this.uid!==user.uid)return;this.error='O espaço doméstico ainda não está disponível. Confira a configuração do Firebase.';this.notify();});
      });
    }
    receive(h){
      if(!h)return;
      for(const [id,raw] of Object.entries(h.lists||{})){
        const remote=normalizeList(raw);
        const pending=this.data.pendingLists[id];
        this.data.lists[id]=pending ? root.HouseholdModel.mergeList(remote,pending) : remote;
      }
      this.data.purchases=Object.fromEntries(Object.entries(h.purchases||{}).map(([id,p])=>[id,normalizePurchase(p)]));
      this.data.preferences={...(h.preferences||{}),...this.data.pendingPreferences};
      this.persist();this.notify();this.flush();
    }
    cacheLists(lists){
      if(!this.householdId)return;
      for(const l of lists)if(l.householdId===this.householdId)this.data.lists[l.id]=copy(l);
      this.persist();
    }
    queueList(list){
      if(!list.householdId || list.householdId!==this.householdId)return;
      this.data.lists[list.id]=copy(list);this.data.pendingLists[list.id]=copy(list);this.persist();this.resetRetry();this.flush();
    }
    pendingCount(){return Object.keys(this.data.pendingLists).length+Object.keys(this.data.pendingFinishes).length+Object.keys(this.data.pendingPreferences).length;}
    preference(key,value){
      const v={...(this.data.preferences[key]||{}),...value,updatedAt:Date.now(),updatedBy:this.uid||'local'};
      this.data.preferences[key]=v;if(this.householdId)this.data.pendingPreferences[key]=v;this.persist();this.resetRetry();this.notify();this.flush();
    }
    dismiss(scope,key){this.data.dismissed[scope]=[...new Set([...(this.data.dismissed[scope]||[]),key])];this.persist();}
    finish(list,mode,occurredAt){
      if(!list.householdId){const p={...root.ShoppingCore.snapshot(list,{mode,occurredAt}),localOnly:true};const local=this.localData();local.purchases[p.id]=p;this.persistLocal(local);list.closedAt=Date.now();this.notify();return;}
      const expected=root.HouseholdModel.fingerprint(list);
      this.queueList(list);
      this.data.pendingFinishes[list.id]={listId:list.id,expected,mode,occurredAt};
      list.pendingFinish=true;this.data.lists[list.id]=copy(list);this.persist();this.notify();this.flush();
    }
    async revise(p,changes){
      if(this.householdId && !p.localOnly){
        if(!navigator.onLine)throw new Error('Conecte-se para corrigir o histórico compartilhado.');
        const generation=this.generation;
        const result=await this.cloud.call('reviseHouseholdPurchase',{householdId:this.householdId,purchaseId:p.id,revision:p.revision,...changes});
        if(generation!==this.generation)return;this.data.purchases[p.id]=normalizePurchase(result);
      }else{
        const local=this.localData();const current=local.purchases[p.id]||(!this.householdId?this.data.purchases[p.id]:null);
        if(!current || current.revision!==p.revision)throw new Error('A compra mudou. Abra novamente.');
        local.purchases[p.id]=changes.deleted?{...p,localOnly:true,revision:p.revision+1,deletedAt:Date.now()}:{...p,...changes,localOnly:true,items:array(p.items).map(i=>({...i,outcome:array(changes.items).find(e=>e.taskId===i.taskId)?.outcome||i.outcome})),revision:p.revision+1};
        this.persistLocal(local);if(this.key!=='todo_shopping_guest_v1' && !this.householdId)delete this.data.purchases[p.id];
      }
      this.persist();this.notify();
    }
    async flush(){
      if(this.flushing || !this.cloud || !this.householdId || !navigator.onLine)return;
      this.flushing=true;const token={};this.flushToken=token;const generation=this.generation,id=this.householdId;let networkFailure=false,failed=false;
      try{
        for(const [key,value] of Object.entries(this.data.pendingPreferences)){
          await this.cloud.call('setHouseholdPreference',{householdId:id,key,value});if(generation!==this.generation)return;
          if(this.data.pendingPreferences[key]===value)delete this.data.pendingPreferences[key];this.persist();
        }
        for(const [key,value] of Object.entries(this.data.pendingLists)){
          const result=normalizeList(await this.cloud.call('syncHouseholdList',{householdId:id,list:value}));if(generation!==this.generation)return;
          if(this.data.pendingLists[key]===value){delete this.data.pendingLists[key];this.data.lists[key]=result;}
          else if(this.data.pendingLists[key]){this.data.lists[key]=root.HouseholdModel.mergeList(result,this.data.pendingLists[key]);}
          this.persist();
        }
        for(const [key,value] of Object.entries(this.data.pendingFinishes)){
          if(this.data.pendingLists[key])continue;
          try{
            const result=await this.cloud.call('finishHouseholdPurchase',{householdId:id,...value});if(generation!==this.generation)return;
            this.data.purchases[result.id]=normalizePurchase(result);
            if(this.data.pendingFinishes[key]===value){
              delete this.data.pendingFinishes[key];
              if(this.data.lists[key]){this.data.lists[key].closedAt=Date.now();delete this.data.lists[key].pendingFinish;}
            }
          }catch(e){
            if(generation!==this.generation)return;
            if(['shopping/failed-precondition','functions/failed-precondition'].includes(e.code)){
              if(this.data.pendingFinishes[key]===value){delete this.data.pendingFinishes[key];if(this.data.lists[key]){delete this.data.lists[key].pendingFinish;this.data.lists[key].finishConflict=true;}this.error='A lista mudou em outro aparelho. Revise e finalize novamente.';}
            }else throw e;
          }
          this.persist();
        }
        if(!this.data.lists || !Object.values(this.data.lists).some(l=>l.finishConflict))this.error='';
      }catch(e){
        failed=true;networkFailure=!e.code || ['shopping/unavailable','disconnected','network-error','functions/unavailable','functions/deadline-exceeded','functions/internal','functions/unknown','auth/network-request-failed'].includes(e.code);
        if(generation===this.generation)this.error=['PERMISSION_DENIED','permission_denied','shopping/permission-denied','functions/permission-denied'].includes(e.code)?'Sem acesso ao espaço doméstico. Confira as contas autorizadas no Firebase.':'Aguardando sincronização. Seus dados continuam neste aparelho.';
      }finally{
        if(generation===this.generation && this.flushToken===token){
          // Keep the guard through notification: UI callbacks may enqueue more work.
          if(!failed)this.retryAttempt=0;
          try{this.notify();}finally{if(generation===this.generation && this.flushToken===token){this.flushing=false;this.flushToken=null;if(!failed || networkFailure)this.scheduleRetry(networkFailure);}}
        }
      }
    }
  }
  root.ShoppingStore=ShoppingStore;
})(window);
