// Firebase Spark: authenticated client transactions; no Cloud Functions or billing.
(function(){
  'use strict';
  let starting=false;
  async function start(){
    if(starting||window.ShoppingCloud||!window.firebaseReady||!window.todoFirebaseApp)return;
    starting=true;
    const base='https://www.gstatic.com/firebasejs/10.14.1/';
    const [A,D,AC]=await Promise.all([import(base+'firebase-auth.js'),import(base+'firebase-database.js'),import(base+'firebase-app-check.js')]);
    const auth=A.getAuth(window.todoFirebaseApp),db=D.getDatabase(window.todoFirebaseApp),R=window.ShoppingRemote;
    const error=(message,code)=>Object.assign(new Error(message),{code:'shopping/'+code});
    async function call(name,args){
      const user=auth.currentUser;if(!user)throw error('Entre com Google.','unauthenticated');
      if(!R.safeId(args.householdId))throw error('Espaço inválido.','invalid-argument');
      if(name==='classifyShoppingItems'){
        const endpoint=window.ShoppingConfig?.jevEndpoint;
        if(!endpoint||!endpoint.startsWith('https://'))throw error('Jev ainda não configurado.','failed-precondition');
        const token=await user.getIdToken();
        if(auth.currentUser!==user)throw error('A conta mudou.','cancelled');
        if(!window.todoAppCheck)throw error('App Check indisponível.','unavailable');
        const appCheckToken=(await AC.getToken(window.todoAppCheck)).token;
        if(auth.currentUser!==user)throw error('A conta mudou.','cancelled');
        const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Firebase-AppCheck':appCheckToken,'Content-Type':'application/json'},body:JSON.stringify({householdId:args.householdId,kind:args.kind,items:args.items}),signal:AbortSignal.timeout(8000),credentials:'omit'});
        if(!response.ok)throw error('Classificação indisponível.','unavailable');
        return response.json();
      }
      if(!navigator.onLine)throw error('Sem conexão.','unavailable');
      if(name==='setHouseholdPreference'){
        if(!R.safeId(args.key))throw error('Preferência inválida.','invalid-argument');
        const target=D.ref(db,`households/${args.householdId}/preferences/${args.key}`);
        const value={...args.value,updatedBy:user.uid};
        await D.runTransaction(target,old=>{
          if(auth.currentUser!==user)return;
          if(old&&(old.updatedAt>value.updatedAt||(old.updatedAt===value.updatedAt&&old.updatedBy>=user.uid)))return;
          return {...old,...value};
        },{applyLocally:false});
        return {ok:true};
      }
      if(!['syncHouseholdList','finishHouseholdPurchase','reviseHouseholdPurchase'].includes(name))throw error('Esta operação não está disponível.','invalid-argument');
      const id=args.list?.id||args.listId||args.purchaseId;if(!R.safeId(id))throw error('Lista inválida.','invalid-argument');
      const target=D.ref(db,`households/${args.householdId}/records/${id}`);
      const seed=(await D.get(target)).val();let failure;
      const transaction=await D.runTransaction(target,record=>{
        failure=null;
        if(auth.currentUser!==user){failure=error('A conta mudou.','cancelled');return;}
        try{return R.mutate(record||seed,name,args)||undefined;}catch(e){failure=e;return;}
      },{applyLocally:false});
      if(failure)throw failure;
      return R.result(transaction.snapshot.val()||seed,name,args);
    }
    window.ShoppingCloud={auth,call,
      signIn:()=>A.signInWithPopup(auth,new A.GoogleAuthProvider()),signOut:()=>A.signOut(auth),
      onAuth:fn=>A.onAuthStateChanged(auth,fn),
      watchProfile:(uid,fn,error)=>D.onValue(D.ref(db,'householdUsers/'+uid),s=>fn(s.val()),error),
      watchHouse:(id,fn,error)=>D.onValue(D.ref(db,'households/'+id),s=>{try{fn(R.fromHouse(s.val(),id));}catch(e){error?.(e);}},error)
    };
    window.dispatchEvent(new Event('shopping-cloud-ready'));
  }
  const failed=()=>{starting=false;window.dispatchEvent(new Event('shopping-cloud-error'));};
  window.addEventListener('firebase-ready',()=>start().catch(failed));
  start().catch(failed);
})();
