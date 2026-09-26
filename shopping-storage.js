(function(root){
  'use strict';
  const values=new Map();let db=null,writing=Promise.resolve();
  const isShoppingKey=key=>key==='todo_shopping_guest_v1'||key.startsWith('todo_shopping_v1_');
  const transaction=(mode,action)=>new Promise((resolve,reject)=>{
    const tx=db.transaction('scopes',mode);action(tx.objectStore('scopes'));
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Falha no armazenamento de compras.'));
  });
  const storage={
    getItem(key){return db?(values.get(key)||null):localStorage.getItem(key);},
    setItem(key,value){
      if(!db){localStorage.setItem(key,value);return;}
      values.set(key,value);
      writing=writing.catch(()=>{}).then(()=>transaction('readwrite',store=>store.put(value,key)));
      // Consumers can await durability through whenSaved; keep background writes handled.
      writing.catch(()=>{});return writing;
    },
    whenSaved(){return writing;},
    ready:(async()=>{
      if(!root.indexedDB)return;
      const legacy=new Map();
      try{
        db=await new Promise((resolve,reject)=>{
          const request=root.indexedDB.open('todo-shopping-storage',1);
          request.onupgradeneeded=()=>request.result.createObjectStore('scopes');
          request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
          request.onblocked=()=>reject(new Error('Armazenamento em uso por outra versão.'));
        });
        db.onversionchange=()=>db.close();
        await transaction('readonly',store=>{
          const request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){values.set(cursor.key,cursor.value);cursor.continue();}};
        });
        for(let i=0;i<localStorage.length;i++){
          const key=localStorage.key(i);
          if(isShoppingKey(key)&&!values.has(key)){const value=localStorage.getItem(key);JSON.parse(value);legacy.set(key,value);}
        }
        if(legacy.size){
          await transaction('readwrite',store=>{for(const [key,value] of legacy)store.put(value,key);});
          for(const [key,value] of legacy){values.set(key,value);try{if(localStorage.getItem(key)===value)localStorage.removeItem(key);}catch(_){}}
        }
      }catch(error){
        // Leave original data untouched if opening or migration fails.
        db?.close();db=null;values.clear();console.warn('Armazenamento de compras usando compatibilidade local.',error);
      }
    })()
  };
  root.ShoppingStorage=storage;
})(window);
