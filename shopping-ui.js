(function(root){
  'use strict';
  const C=root.ShoppingCore, M=root.HouseholdModel;
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,fn,cls='btn')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
  const select=(values,value,label)=>{const s=node('select');s.setAttribute('aria-label',label);for(const [v,l] of values){const o=node('option',l);o.value=v;s.append(o);}s.value=value;return s;};
  const dateValue=time=>{const d=new Date(time);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  class ShoppingUI {
    constructor(bridge){
      this.b=bridge;this.products=C.catalog(root.ShoppingCatalog);this.quickExtras={};this.classifying=new Set();this.dragging=false;this.retryAfter=new Map();this.homeScope='local';
      this.store=new root.ShoppingStore(()=>this.changed());
      this.dialog=node('dialog',undefined,'shopping-dialog');this.dialog.setAttribute('aria-labelledby','shoppingDialogTitle');document.body.append(this.dialog);
      this.dialog.addEventListener('close',()=>this.returnFocus?.focus?.());
      this.dialog.addEventListener('click',e=>{if(e.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.dialog.close();}});
      const home=document.getElementById('screenLists');this.homeBar=node('div',undefined,'shopping-home-bar');home.prepend(this.homeBar);
      this.bar=node('div',undefined,'shopping-tools');document.getElementById('taskFilterChips').before(this.bar);
      this.quickBar=node('div',undefined,'shopping-quick-tools');document.getElementById('quickAccordion').before(this.quickBar);
      this.detail=node('div',undefined,'shopping-category-editor');document.getElementById('taskDetailText').after(this.detail);
      this.kindField=node('label','Tipo da lista','shopping-kind-field');this.kindSelect=select([['','Tarefas'],...Object.entries(C.kinds)],'','Tipo da lista');this.kindField.append(this.kindSelect);document.querySelector('#modalBackdrop .modal-body').append(this.kindField);
      this.changed();
      root.addEventListener('shopping-cloud-ready',()=>this.renderHome());root.addEventListener('shopping-cloud-error',()=>this.renderHome());
      root.addEventListener('online',()=>this.store.flush());
    }
    changed(){
      if(!this.store)return;
      const scope=(this.store.uid||'guest')+':'+(this.store.householdId||'');
      const scopeChanged=this.lastScope!==undefined && this.lastScope!==scope;
      if(scopeChanged){this.returnFocus=null;this.dialog?.close();this.quickExtras={};this.b.clearDraft?.();this.dragging=false;clearTimeout(this.changeTimer);}
      this.lastScope=scope;
      const active=document.activeElement;
      if(!scopeChanged && (this.dragging || active?.id==='taskDetailText')) {clearTimeout(this.changeTimer);this.changeTimer=setTimeout(()=>this.changed(),350);return;}
      if(scopeChanged){
        let saved='';try{saved=localStorage.getItem('todo_home_scope_v1_'+(this.store.uid||'guest'))||'';}catch(_){}
        this.homeScope=this.store.householdId?(saved==='local'||saved==='household'?saved:'household'):'local';
      }else if(!this.store.householdId&&this.homeScope==='household')this.homeScope='local';
      this.b.setHomeScope?.(this.homeScope);
      this.b.receiveHousehold(Object.values(this.store.data.lists).filter(l=>l.householdId===this.store.householdId&&!l.deletedAt),this.store.householdId,scopeChanged);
      if(scopeChanged)active?.blur?.();
      this.renderHome();this.b.refresh();
    }
    renderHome(){
      this.homeBar.replaceChildren();
      const lists=this.b.lists().filter(l=>!l.deletedAt),localCount=lists.filter(l=>!l.householdId).length,houseCount=lists.filter(l=>l.householdId===this.store.householdId).length;
      const tabs=node('div',undefined,'shopping-scope-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Origem das listas');
      const tab=(scope,label,count)=>{const active=this.homeScope===scope,b=button('',()=>this.setHomeScope(scope),'shopping-scope-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active));if(active)b.classList.add('active');b.append(node('span',label),node('span',String(count),'shopping-scope-count'));return b;};
      tabs.append(tab('local','Local',localCount),tab('household','Nossa casa',houseCount));
      const utilities=node('div',undefined,'shopping-home-utilities');
      utilities.append(node('p',this.homeScope==='household'?'Compartilhadas entre vocês':'Salvas somente neste aparelho','shopping-scope-description'));
      this.homeBar.append(tabs,utilities);
      const pending=this.store.pendingCount();
      if(pending || this.store.error)this.homeBar.append(node('small',this.store.error || `${pending} alterações aguardando sincronização`,'shopping-sync-status'));
    }
    setHomeScope(scope){
      if(scope==='household'&&!this.store.householdId){this.openHome();return;}
      this.homeScope=scope==='household'?'household':'local';
      try{localStorage.setItem('todo_home_scope_v1_'+(this.store.uid||'guest'),this.homeScope);}catch(_){}
      this.b.setHomeScope?.(this.homeScope);this.renderHome();this.b.refresh();
    }
    async run(fn){try{await fn();}catch(e){this.b.toast(e.message || 'Não foi possível concluir esta ação.');}}
    open(title,render){
      if(!this.dialog.open)this.returnFocus=document.activeElement;
      this.dialog.replaceChildren();const header=node('header',undefined,'shopping-dialog-header');const h=node('h2',title);h.id='shoppingDialogTitle';header.append(h,button('Fechar',()=>this.dialog.close()));this.dialog.append(header);
      const content=node('div',undefined,'shopping-dialog-body');this.dialog.append(content);render(content);if(!this.dialog.open)this.dialog.showModal();
    }
    openHome(){
      this.open('Ajustes',body=>{
        body.append(node('p',this.store.householdId?'Listas, compras e preferências compartilhadas entre vocês.':'Entre com Google para compartilhar compras e recuperar seu histórico em outro aparelho. As listas locais continuam disponíveis.'));
        if(!this.store.cloud){body.append(node('p','O acesso à conta está carregando ou indisponível. As compras locais continuam funcionando.'));return;}
        if(!this.store.uid){body.append(button('Entrar com Google',()=>this.run(async()=>{await this.store.cloud.signIn();this.openHome();}),'btn primary'));return;}
        if(!this.store.householdId){
          body.append(node('p','Sua conta ainda não foi vinculada à casa. Na configuração inicial, autorizaremos as duas contas; depois, basta entrar com Google.'));
          body.append(button('Copiar identificação da minha conta',()=>this.run(async()=>{await navigator.clipboard.writeText(this.store.uid);this.b.toast('Identificação copiada para configurar o compartilhamento.');})));
        }else{
          body.append(node('p','O acesso a esta casa é restrito às contas autorizadas na configuração inicial.'));
          const label=node('label',undefined,'shopping-toggle');const toggle=node('input');toggle.type='checkbox';toggle.checked=!!this.store.data.preferences._settings?.jevEnabled;
          toggle.disabled=!root.ShoppingConfig?.jevEndpoint;
          toggle.addEventListener('change',()=>this.store.preference('_settings',{jevEnabled:toggle.checked}));label.append(toggle,node('span','Usar Jev para itens desconhecidos'));body.append(label,node('small',root.ShoppingConfig?.jevEndpoint?'Envia nomes de produtos à TypeSafe para classificação. Desligado, o catálogo local continua funcionando.':'Jev ainda não configurado. Categorias e sugestões locais já funcionam sem ele.'));
        }
        const blocked=Object.entries(this.store.data.preferences).filter(([,p])=>p.blocked);
        if(blocked.length){body.append(node('h3','Itens que você ocultou'));for(const [key] of blocked){const name=this.products.find(p=>p.productKey===key)?.name || this.store.history().flatMap(p=>p.items).find(i=>i.productKey===key)?.name || 'Produto';body.append(button('Voltar a sugerir '+name,()=>{this.store.preference(key,{blocked:false});this.openHome();}));}}
        body.append(button('Sair da conta Google',()=>this.run(async()=>{if(this.store.pendingCount())throw new Error('Sincronize as alterações pendentes antes de sair.');await this.store.whenSaved();await this.store.cloud.signOut();this.dialog.close();})));
      });
    }
    isLocked(list){return !!(list?.closedAt || list?.pendingFinish || this.store.data.pendingFinishes[list?.id]);}
    guard(list){if(this.isLocked(list)){this.b.toast('Compra encerrada ou aguardando sincronização. Use o histórico para corrigir o registro.');return true;}return false;}
    attachList(list,kind){
      const toHouse=this.homeScope==='household'&&!!this.store.householdId;
      if(toHouse&&!kind)kind='mercado';
      if(!kind)return;list.kind=kind;list.purchaseId=list.id;
      if(toHouse)list.householdId=this.store.householdId;
      list.organization='categories';this.prepare(list);
    }
    prepare(list){
      if(!list?.kind || this.isLocked(list))return false;
      if(document.activeElement?.id==='taskDetailText')return false;
      let changed=false;
      for(const t of list.tasks||[]){if(t.deletedAt)continue;
        const old=t.shopping, info=C.identify(t.text,list.kind,this.products,this.store.data.preferences,old);
        if(old && JSON.stringify(Object.entries(old).sort())===JSON.stringify(Object.entries(info).sort()))continue;
        t.shopping=info;t.shoppingUpdatedAt=Date.now();t.shoppingUpdatedBy=this.b.clientId;changed=true;
      }
      if(changed){this.b.save();if(list.householdId)this.store.queueList(list);}
      return changed;
    }
    onMutation(list){if(!list)return;this.prepare(list);if(list.householdId)this.store.queueList(list);}
    save(lists){this.store.cacheLists(lists);}
    mode(){return 'categories';}
    setCreationMode(mode,kind){const toHouse=this.homeScope==='household'&&!!this.store.householdId;this.kindField.hidden=mode!=='create';this.kindSelect.options[0].disabled=toHouse;this.kindSelect.value=kind||(toHouse?'mercado':'');}
    renderBar(list){
      this.bar.replaceChildren();if(!list?.kind){
        if(list)this.bar.append(button('Organizar como compra',()=>this.chooseKind(list)));return;
      }
      if(this.isLocked(list)){
        if(!list.closedAt)this.bar.append(node('small','Aguardando sincronização','shopping-sync-status'));
      }else{
        const suggestions=this.getSuggestions(list.kind,list.id,this.items(list));
        this.bar.append(button(`Sugestões · ${suggestions.length}`,()=>this.openSuggestions(list.kind,list.id),'btn shopping-suggestions'),button('Finalizar compra',()=>this.openFinish(list),'btn primary shopping-finish'));
      }
      if(!list.householdId && this.store.householdId){
        const copy=this.householdCopy(list),pending=copy&&!!this.store.data.pendingLists[copy.id];
        if(copy){
          const notice=node('div',undefined,'shopping-copy-notice');
          notice.append(node('strong',pending?'Cópia aguardando sincronização':'Lista copiada para Nossa casa'),node('small',pending?(this.store.error||'A cópia está salva neste aparelho e será enviada quando houver conexão.'):'A versão local e a compartilhada são independentes.'));
          this.bar.append(notice);
        }else this.bar.append(button('Copiar para nossa casa',()=>this.run(()=>this.copyToHousehold(list)),'btn shopping-copy-house'));
      }
      if(list.finishConflict)this.bar.append(node('p','A lista mudou em outro aparelho. Revise os itens antes de finalizar novamente.','shopping-sync-status'));
      if(list.householdId && (this.store.pendingCount() || this.store.error))this.bar.append(node('small',this.store.error||'Aguardando sincronização','shopping-sync-status'));
      this.classify(list);
    }
    chooseKind(list){this.open('Organizar como compra',body=>{
      body.append(node('p','Escolha o tipo. As marcações atuais serão preservadas.'));
      const kind=select(Object.entries(C.kinds),'mercado','Tipo de compra');body.append(kind,button('Aplicar',()=>{list.kind=kind.value;list.purchaseId=list.shareCode?'legacy_'+list.shareCode:list.id;list.sourceRef=list.shareCode?'legacy_'+list.shareCode:list.id;this.prepare(list);this.b.save();this.dialog.close();this.b.refresh();},'btn primary'));
    });}
    householdCopy(list){
      const sourceRef=list.shareCode?'legacy_'+list.shareCode:list.id,originalId=list.shareCode?sourceRef:'import_'+list.id;
      return Object.values(this.store.data.lists).find(l=>l.householdId===this.store.householdId&&!l.deletedAt&&(l.sourceRef===sourceRef||l.id===originalId));
    }
    async copyToHousehold(list){
      if(!this.store.householdId)throw new Error('Entre na sua conta para copiar para Nossa casa.');
      const generation=this.store.generation;
      const existing=this.householdCopy(list);
      if(existing){
        if(this.store.data.pendingLists[existing.id]){
          const retry=JSON.parse(JSON.stringify(existing));
          this.prepareCopyItems(retry);root.ShoppingRemote.validateList(retry,this.store.householdId);this.store.queueList(retry);
          await this.store.whenSaved();if(this.store.generation!==generation)return;this.changed();
        }
        this.setHomeScope('household');this.b.openList(existing.id);return;
      }
      const clone=JSON.parse(JSON.stringify(list)),sourceRef=list.shareCode?'legacy_'+list.shareCode:list.id;
      let id=list.shareCode?sourceRef:'import_'+list.id;
      // Deleted records are immutable. A new copy must have a new identity.
      if(this.store.data.lists[id])id='copy_'+crypto.randomUUID();
      const now=Date.now();
      Object.assign(clone,{id,purchaseId:id,sourceRef,householdId:this.store.householdId,createdAt:now,metaUpdatedAt:now,metaUpdatedBy:this.b.clientId,shareCreated:false});
      for(const key of ['shareCode','imported','closedAt','pendingFinish','finishConflict','deletedAt','deletedBy','revision'])delete clone[key];
      this.prepareCopyItems(clone);
      root.ShoppingRemote.validateList(clone,this.store.householdId);
      // Persist the outbox before exposing the copy in the UI.
      this.store.queueList(clone);await this.store.whenSaved();
      if(this.store.generation!==generation)return;
      // A cloud notification may already have inserted the persisted copy.
      if(!this.b.lists().some(l=>l.id===clone.id))this.b.lists().push(clone);
      this.b.save();this.renderHome();this.b.refresh();
      this.b.toast('Cópia salva neste aparelho e aguardando sincronização.');
    }
    prepareCopyItems(list){
      for(const task of list.tasks||[]){
        if(task.deletedAt)continue;
        task.shopping=C.identify(task.text,list.kind,this.products,this.store.data.preferences,task.shopping);
        task.shoppingUpdatedAt=Date.now();task.shoppingUpdatedBy=this.b.clientId;
      }
    }
    items(list){return (list.tasks||[]).filter(t=>!t.deletedAt).map(t=>t.shopping||{productKey:C.keyFor(t.text)});}
    getSuggestions(kind,scope,items){return C.suggestions({history:this.store.history(),kind,currentItems:items,otherLists:this.b.lists().filter(l=>l.id!==scope),preferences:this.store.data.preferences,dismissed:this.store.data.dismissed[scope]||[]});}
    renderQuick(kind){
      this.quickBar.replaceChildren();if(!kind)return;
      const count=this.getSuggestions(kind,'draft_'+kind,this.b.quickItems()).length;
      this.quickBar.append(button(`Sugestões · ${count}`,()=>this.openSuggestions(kind,'draft_'+kind),'btn shopping-suggestions'));
      for(const item of this.quickExtras[kind]||[])this.quickBar.append(button('✓ '+item.text+' · Remover',()=>{this.quickExtras[kind]=this.quickExtras[kind].filter(i=>i.productKey!==item.productKey);this.b.refreshQuick();}));
    }
    resetQuick(){this.quickExtras={};for(const key of Object.keys(this.store.data.dismissed))if(key.startsWith('draft_'))delete this.store.data.dismissed[key];this.store.persist();}
    openSuggestions(kind,scope,showAll=false){
      const list=this.b.lists().find(l=>l.id===scope);const items=list?this.items(list):this.b.quickItems();
      const suggestions=this.getSuggestions(kind,scope,items);
      this.open('Sugestões para a lista',body=>{
        if(!suggestions.length){body.append(node('p','Nenhuma sugestão por enquanto. Após registrar suas compras, os itens habituais aparecem aqui.'));return;}
        const selected=new Map();const footer=node('footer',undefined,'shopping-dialog-footer');const add=button('Adicionar itens',()=>{
          // Recheck the live list/draft so another device or panel cannot add duplicates.
          const live=list?this.b.lists().find(l=>l.id===scope&&!l.deletedAt):null;
          if(list&&(!live||this.guard(live))){this.dialog.close();return;}
          const current=live?this.items(live):this.b.quickItems();const present=new Set(current.map(i=>i.productKey));
          for(const other of this.b.lists().filter(l=>l.id!==scope&&l.kind===kind&&!l.deletedAt&&!l.closedAt))for(const item of this.items(other))present.add(item.productKey);
          for(const item of selected.values())if(!present.has(item.productKey)){if(live)this.b.addItem(live,item);else this.b.selectQuick(kind,item);present.add(item.productKey);}
          this.b.save();if(live)this.onMutation(live);this.dialog.close();this.b.refresh();this.b.refreshQuick();
        },'btn primary');add.disabled=true;footer.append(add);let section='';
        for(const item of (showAll?suggestions:suggestions.slice(0,8))){
          const title=item.reason==='missing'?'Faltou na última compra':'Pode estar na hora';if(title!==section){body.append(node('h3',title));section=title;}
          const row=node('div',undefined,'shopping-suggestion-row');const label=node('label',undefined,'shopping-suggestion-label');const checkbox=node('input');checkbox.type='checkbox';checkbox.disabled=!!item.otherListId;
          const text=node('span');text.append(node('strong',item.name),node('small',item.otherListId?'Já está na lista '+item.otherListTitle:item.explanation));label.append(checkbox,text);row.append(label);
          const quantity=node('input');quantity.type='number';quantity.min='0.1';quantity.max='100000';quantity.step='any';quantity.value=String(item.quantity||1);quantity.setAttribute('aria-label','Quantidade de '+item.name);quantity.disabled=!!item.otherListId;
          const update=()=>{const q=Number(quantity.value);if(checkbox.checked&&q>0&&q<=100000)selected.set(item.productKey,{...item,quantity:q,unit:item.unit||'unidade'});else selected.delete(item.productKey);add.textContent=`Adicionar ${selected.size} ${selected.size===1?'item':'itens'}`;add.disabled=!selected.size;};
          checkbox.addEventListener('change',update);quantity.addEventListener('input',update);row.append(quantity,node('small',item.unit||'unidade'));
          const actions=node('div',undefined,'shopping-row-actions');
          if(item.otherListId)actions.append(button('Abrir lista',()=>{this.dialog.close();this.b.openList(item.otherListId);}));
          actions.append(button('Agora não',()=>{this.store.dismiss(scope,item.productKey);selected.delete(item.productKey);checkbox.checked=false;update();row.remove();this.b.refreshQuick();}),button('Não sugerir mais',()=>{this.store.preference(item.productKey,{blocked:true});selected.delete(item.productKey);checkbox.checked=false;update();row.remove();}));row.append(actions);body.append(row);
        }
        if(!showAll&&suggestions.length>8)body.append(button(`Ver todas (${suggestions.length})`,()=>this.openSuggestions(kind,scope,true)));
        body.append(footer);
      });
    }
    openFinish(list){
      if(this.guard(list))return;
      const previous=this.store.history().find(p=>!p.deletedAt && (p.sourceRef||p.listId)===(list.sourceRef||list.id));
      const expected=M.fingerprint(list), openedAt=previous?.occurredAt||Date.now(), openedDate=dateValue(openedAt);
      this.open('Finalizar compra',body=>{
        const tasks=list.tasks.filter(t=>!t.deletedAt);body.append(node('p',`${tasks.filter(t=>t.done&&!t.notHave).length} comprados · ${tasks.filter(t=>t.notHave).length} não encontrados · ${tasks.filter(t=>!t.done).length} pendentes`));
        const mode=select([['complete','Compra completa'],['quick','Reposição rápida']],'complete','Modalidade da compra');body.append(mode,node('small','Reposições rápidas atualizam os produtos comprados sem contar uma rodada para os demais.'));
        const date=node('input');date.type='datetime-local';date.value=openedDate;date.max=date.value;date.setAttribute('aria-label','Data da compra');body.append(node('label','Data da compra (ajuste para registrar uma compra anterior)'),date);
        for(const t of tasks)body.append(node('div',`${t.notHave?'Não encontrado':t.done?'Comprado':'Pendente'} · ${t.text}`,'shopping-review-item'));
        body.append(button('Registrar compra',()=>this.run(async()=>{
          const live=this.b.lists().find(l=>l.id===list.id);if(!live || M.fingerprint(live)!==expected){this.b.toast('A lista mudou. Revise os itens atualizados.');if(live)this.openFinish(live);return;}
          const occurredAt=date.value===openedDate?openedAt:new Date(date.value).getTime();if(!Number.isFinite(occurredAt)||occurredAt<=0||occurredAt>Date.now()+60000)throw new Error('Escolha uma data válida, até agora.');
          delete live.finishConflict;this.store.finish(live,mode.value,occurredAt);this.b.save();this.dialog.close();this.b.refresh();
        }),'btn primary'));
      });
    }
    openHistory(){this.open('Histórico de compras',body=>{
      const history=this.store.history().filter(p=>!p.deletedAt).sort((a,b)=>b.occurredAt-a.occurredAt);
      if(!history.length)body.append(node('p','Nenhuma compra registrada. Use “Finalizar compra” em uma lista de Mercado, Farmácia ou Pet. Para registrar uma lista antiga, abra-a e escolha “Organizar como compra”.'));
      for(const p of history){const count=p.items.filter(i=>i.outcome==='bought').length,source=p.localOnly?'Neste aparelho':'Nossa casa';const row=button('',()=>this.editPurchase(p),'shopping-history-row');row.append(node('strong',p.title),node('small',`${source} · ${new Date(p.occurredAt).toLocaleString('pt-BR')} · ${C.kinds[p.kind]} · ${p.mode==='quick'?'Reposição rápida':'Compra completa'}`),node('span',`${count} ${count===1?'item comprado':'itens comprados'}`));body.append(row);}
    });}
    editPurchase(p){this.open('Revisar compra',body=>{
      body.append(node('p',p.title));const mode=select([['complete','Compra completa'],['quick','Reposição rápida']],p.mode,'Modalidade');const date=node('input');date.type='datetime-local';date.value=dateValue(p.occurredAt);date.setAttribute('aria-label','Data da compra');body.append(mode,date);
      const edits=p.items.map(i=>{const row=node('label',undefined,'shopping-history-edit');row.append(node('span',i.text));const s=select([['bought','Comprado'],['missing','Não encontrado'],['pending','Pendente']],i.outcome,'Resultado de '+i.name);row.append(s);body.append(row);return {taskId:i.taskId,select:s};});
      body.append(button('Salvar correção',()=>this.run(async()=>{const occurredAt=new Date(date.value).getTime();if(!Number.isFinite(occurredAt)||occurredAt<=0||occurredAt>Date.now()+60000)throw new Error('Escolha uma data válida.');await this.store.revise(p,{mode:mode.value,occurredAt,items:edits.map(e=>({taskId:e.taskId,outcome:e.select.value}))});this.openHistory();}),'btn primary'));
      body.append(button('Remover do histórico',()=>{this.open('Remover registro?',content=>{content.append(node('p','Este registro deixará de participar das sugestões. A lista original será preservada.'),button('Cancelar',()=>this.editPurchase(p)),button('Remover registro',()=>this.run(async()=>{await this.store.revise(p,{deleted:true});this.openHistory();}),'btn danger'));});}));
    });}
    renderDetail(list,task){
      this.detail.replaceChildren();if(!list?.kind || !task)return;this.prepare(list);
      const label=node('label','Categoria');const s=select(C.categories(root.ShoppingCatalog,list.kind).map(c=>[c.id,c.label]),task.shopping?.categoryId||'outros','Categoria do item');s.disabled=this.isLocked(list);
      s.addEventListener('change',()=>{task.shopping.categoryId=s.value;task.shopping.source='manual';task.shoppingUpdatedAt=Date.now();task.shoppingUpdatedBy=this.b.clientId;this.store.preference(task.shopping.productKey,{categoryId:s.value});this.onMutation(list);this.b.save();this.b.refresh();});label.append(s);this.detail.append(label);
    }
    renderCategories(list,container,filter,build){
      if(!list.kind || this.mode(list)!=='categories')return false;
      const tasks=(list.tasks||[]).filter(t=>!t.deletedAt),active=tasks.filter(t=>!t.done);
      const cats=C.categories(root.ShoppingCatalog,list.kind),ids=new Set(cats.map(c=>c.id));
      if(filter!=='done')for(const cat of cats){const subset=active.filter(t=>(ids.has(t.shopping?.categoryId)?t.shopping.categoryId:'outros')===cat.id);if(!subset.length)continue;
        const section=node('section',undefined,'shopping-category');const h=node('h2',`${cat.label} · ${subset.length}`,'shopping-category-heading');const items=node('div',undefined,'shopping-category-items');items.dataset.categoryId=cat.id;
        for(const t of subset)items.append(build(t,false));section.append(h,items);container.append(section);
      }
      if(filter!=='active')for(const [title,subset] of [['Comprados',tasks.filter(t=>t.done&&!t.notHave)],['Não encontrados',tasks.filter(t=>t.notHave)]]){
        if(!subset.length)continue;const section=node('section',undefined,'shopping-status-section');section.append(node('h2',`${title} · ${subset.length}`,'shopping-category-heading'));for(const t of subset)section.append(build(t,true));container.append(section);
      }
      return true;
    }
    async classify(list){
      if(this.isLocked(list)||!list.householdId||!root.ShoppingConfig?.jevEndpoint||!this.store.data.preferences._settings?.jevEnabled||!this.store.cloud||!navigator.onLine||this.classifying.has(list.id)||document.activeElement?.id==='taskDetailText'||this.dragging)return;
      const pending=(list.tasks||[]).filter(t=>!t.deletedAt&&t.shopping?.source==='unknown'&&(this.retryAfter.get(t.shopping.sourceText)||0)<Date.now()).slice(0,25);if(!pending.length)return;
      this.classifying.add(list.id);const sources=new Map(pending.map(t=>[t.id,t.shopping.sourceText]));const generation=this.store.generation;
      try{
        const cache=this.store.data.categoryCache;const results={};const uncached=[];
        for(const t of pending){const key=list.kind+':v1:'+t.shopping.sourceText;if(cache[key])results[t.id]=cache[key];else uncached.push({id:t.id,text:C.baseName(t.text)});}
        if(uncached.length){const response=await this.store.cloud.call('classifyShoppingItems',{householdId:list.householdId,kind:list.kind,items:uncached});Object.assign(results,response.results);}
        if(generation!==this.store.generation || this.isLocked(list))return;
        for(const t of pending){this.retryAfter.set(sources.get(t.id),Date.now()+300000);const r=results[t.id];if(!r||t.shopping?.sourceText!==sources.get(t.id)||t.shopping.source==='manual'||this.store.data.preferences[t.shopping.productKey]?.categoryId||!C.categories(root.ShoppingCatalog,list.kind).some(c=>c.id===r.categoryId))continue;
          cache[list.kind+':v1:'+t.shopping.sourceText]=r;t.shopping={...t.shopping,categoryId:r.categoryId,source:'jev'};t.shoppingUpdatedAt=Date.now();t.shoppingUpdatedBy=this.b.clientId;
        }
        this.store.persist();this.onMutation(list);this.b.save();if(!this.dragging&&document.activeElement?.id!=='taskDetailText'){const y=root.scrollY;this.b.refresh();root.scrollTo(0,y);}
      }catch(_){for(const t of pending)this.retryAfter.set(sources.get(t.id),Date.now()+300000);}
      finally{this.classifying.delete(list.id);}
    }
  }
  root.ShoppingUI=ShoppingUI;
})(window);
