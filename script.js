(function(){
      // State
      let lists = []; // {id, title, tasks: [{id,text,done}]}
      let currentListId = null;
      let currentTaskId = null;
      let completedCollapsed = false;
      let lastValidTaskText = '';
      const el = id=>document.getElementById(id);
      const SVG_NS = 'http://www.w3.org/2000/svg';

      // Elements
      const screenLists = el('screenLists');
      const screenListDetail = el('screenListDetail');
      const screenTaskDetail = el('screenTaskDetail');
      const listsContainer = el('listsContainer');
      const noLists = el('noLists');
      const btnNewList = el('btnNewList');
      const btnImportCode = el('btnImportCode');
      const emptyStateCta = noLists ? noLists.querySelector('.empty-cta') : null;
      const modalBackdrop = el('modalBackdrop');
      const modalTitle = el('modalTitle');
      const listNameInput = el('listNameInput');
      const modalCancel = el('modalCancel');
      const modalPrimary = el('modalPrimary');
      const currentListName = el('currentListName');
      const appTitle = el('appTitle');
      const appSubtitle = el('appSubtitle');
      const appMenuBtn = el('appMenuBtn');
      const appMenu = el('appMenu');
      const menuBackdrop = el('menuBackdrop');
      const shareListAction = el('shareListAction');
      const shareBackdrop = el('shareBackdrop');
      const shareCodeValue = el('shareCodeValue');
      const shareCopyBtn = el('shareCopyBtn');
      const shareCopyFeedback = el('shareCopyFeedback');
      const shareCloseBtn = el('shareCloseBtn');
      const resetAppAction = el('resetAppAction');
      const deleteListAction = el('deleteListAction');
      const globalBackBtn = el('globalBackBtn');
      const DEFAULT_TITLE = appTitle.textContent;
      const openComposer = el('openComposer');
      const composerBackdrop = el('composerBackdrop');
      const composerInput = el('taskInput');
      const composerCheckbox = el('composerCheckbox');
      const sendTask = el('sendTask');
      const tasksContainer = el('tasksContainer');
      const completedGroup = el('completedGroup');
      const completedHeader = el('completedHeader');
      const completedList = el('completedList');
      const completedCount = el('completedCount');
      const chev = el('chev');
      const rootEl = document.documentElement;
      const composerOverlayEl = ()=> document.querySelector('.composer-overlay');

      // Code modal elements
      const codeBackdrop = el('codeBackdrop');
      const codeCancel = el('codeCancel');
      const codeImport = el('codeImport');
      let codeInputs = [];

      const taskDetailRow = el('taskDetailRow');
      const taskDetailCheckbox = el('taskDetailCheckbox');
      const taskDetailText = el('taskDetailText');

      // helpers
      let isMenuOpen = false;
      let activeShareCode = '';
      let copyFeedbackTimer = null;
      let pendingSharedCode = null;
      // Sync helpers
      let syncTimers = Object.create(null);
      let liveSubscriptions = Object.create(null);

      function canSyncList(list){
        if(!list) return false;
        const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
        if(!code || code.length!==6) return false;
        return (typeof window !== 'undefined' && typeof window.firebaseShareList === 'function');
      }

      function requestSync(listId, delayMs){
        try{
          const list = lists.find(x=>x.id===listId);
          if(!canSyncList(list)) return;
          const wait = typeof delayMs === 'number' ? Math.max(0, delayMs) : 250;
          if(syncTimers[listId]){ clearTimeout(syncTimers[listId]); }
          syncTimers[listId] = setTimeout(async ()=>{
            try{
              const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
              list._lastPushedAt = Date.now();
              await window.firebaseShareList(code, { title: list.title, tasks: list.tasks });
            }catch(e){ /* ignore sync errors */ }
            finally{ syncTimers[listId] = null; }
          }, wait);
        }catch(_){ }
      }

      function startRealtimeForList(listId){
        try{
          const list = lists.find(x=>x.id===listId);
          if(!list) return;
          const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
          if(!code || code.length!==6) return;
          if(!window || typeof window.firebaseSubscribe !== 'function') return;
          if(liveSubscriptions[listId]) return; // já inscrito
          window.firebaseSubscribe(code, (remote)=>{
            if(!remote) return;
            const pushedAt = list._lastPushedAt || 0;
          const remoteAt = (remote && remote.updatedAt) ? Number(remote.updatedAt) : 0;
          if(remoteAt && pushedAt && Math.abs(remoteAt - pushedAt) < 600){ return; }
            const newTitle = remote.title || 'Lista';
            const newTasks = Array.isArray(remote.tasks)
              ? remote.tasks.map((t, idx)=>({ id: 't_'+Date.now()+'_'+idx, text: t && t.text ? String(t.text) : '', done: !!(t && t.done) }))
              : [];
            list.title = newTitle;
            list.tasks = newTasks;
            saveState();
            renderLists();
            if(currentListId === list.id){
              currentListName.textContent = list.title;
              renderTasks();
              updateAppBar(screenListDetail.classList.contains('active') ? screenListDetail : screenLists);
            }
          });
          liveSubscriptions[listId] = code;
        }catch(_){ }
      }

      function stopRealtimeForList(listId){
        try{
          const code = liveSubscriptions[listId];
          if(!code) return;
          if(window && typeof window.firebaseUnsubscribe === 'function'){
            window.firebaseUnsubscribe(code);
          }
          delete liveSubscriptions[listId];
        }catch(_){ }
      }

      function lockScroll(){
        rootEl.classList.add('scroll-lock');
        document.body.classList.add('scroll-lock');
      }

      function unlockScroll(){
        rootEl.classList.remove('scroll-lock');
        document.body.classList.remove('scroll-lock');
      }

      // Keyboard avoidance for overlays (modals/composer/share)
      function getKeyboardBottomInset(){
        try{
          const vv = window.visualViewport;
          if(!vv) return 0;
          const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
          return Math.max(0, Math.floor(inset));
        }catch(_){ return 0; }
      }

      function applyKeyboardInset(){
        const bottomInset = getKeyboardBottomInset();
        // Composer (should move with keyboard)
        try{
          const overlay = composerOverlayEl();
          if(overlay && composerBackdrop && composerBackdrop.classList.contains('show')){
            overlay.style.transform = bottomInset ? `translateY(-${bottomInset}px)` : '';
          }
        }catch(_){ }
        // Create/Rename modal
        try{
          if(modalBackdrop && modalBackdrop.classList.contains('show')){
            const modal = modalBackdrop.querySelector('.modal');
            if(modal && bottomInset > 0){ 
              modal.style.marginTop = Math.max(20, 150 - bottomInset * 0.5) + 'px';
            }
          }
        }catch(_){ }
        // Code modal
        try{
          if(codeBackdrop && codeBackdrop.classList.contains('show')){
            const modal = codeBackdrop.querySelector('.modal');
            if(modal && bottomInset > 0){ 
              modal.style.marginTop = Math.max(20, 150 - bottomInset * 0.5) + 'px';
            }
          }
        }catch(_){ }
        // Share dialog
        try{
          if(shareBackdrop && shareBackdrop.classList.contains('show')){
            const dialog = shareBackdrop.querySelector('.share-dialog');
            if(dialog && bottomInset > 0){ 
              dialog.style.marginTop = Math.max(20, 150 - bottomInset * 0.5) + 'px';
            }
          }
        }catch(_){ }
      }

      function clearKeyboardInset(){
        try{ const overlay = composerOverlayEl(); if(overlay){ overlay.style.transform = ''; } }catch(_){ }
        try{ const m = modalBackdrop && modalBackdrop.querySelector('.modal'); if(m){ m.style.marginTop='150px'; } }catch(_){ }
        try{ const m = codeBackdrop && codeBackdrop.querySelector('.modal'); if(m){ m.style.marginTop='150px'; } }catch(_){ }
        try{ const d = shareBackdrop && shareBackdrop.querySelector('.share-dialog'); if(d){ d.style.marginTop='150px'; } }catch(_){ }
      }

      // listen to viewport changes to re-apply inset while keyboard animates
      try{
        if(window.visualViewport){
          window.visualViewport.addEventListener('resize', applyKeyboardInset);
          window.visualViewport.addEventListener('scroll', applyKeyboardInset);
        }
      }catch(_){ }

      function showScreen(screen){
        [screenLists, screenListDetail, screenTaskDetail].forEach(s=>s.classList.remove('active'));
        screen.classList.add('active');
        updateAppBar(screen);
      }

      function setAppMenuVisibility(visible){
        if(!visible){
          hideAppMenu();
          appMenuBtn.hidden = true;
          appMenuBtn.style.display = 'none';
          return;
        }
        appMenuBtn.hidden = false;
        appMenuBtn.style.display = 'inline-flex';
      }

      function updateAppBar(activeScreen){
        if(activeScreen===screenLists){
          updateSubtitle();
          globalBackBtn.hidden = true;
          globalBackBtn.onclick = null;
          appTitle.hidden = false;
          appTitle.textContent = DEFAULT_TITLE;
          btnNewList.hidden = false;
          if(appSubtitle){ appSubtitle.hidden = false; }
          if(btnImportCode){ btnImportCode.hidden = false; }
          setAppMenuVisibility(false);
        } else if(activeScreen===screenListDetail){
          globalBackBtn.hidden = false;
          globalBackBtn.onclick = handleBackToMain;
          appTitle.hidden = true;
          appTitle.textContent = '';
          btnNewList.hidden = true;
          if(appSubtitle){ appSubtitle.hidden = true; }
          if(btnImportCode){ btnImportCode.hidden = false; }
          setAppMenuVisibility(true);
          const list = lists.find(x=>x.id===currentListId);
          if(shareListAction){
            const isImported = !!(list && list.imported);
            shareListAction.disabled = isImported;
            if(isImported){ shareListAction.title = 'Não é possível compartilhar listas importadas'; }
            else { shareListAction.title = ''; }
          }
        } else if(activeScreen===screenTaskDetail){
          globalBackBtn.hidden = false;
          globalBackBtn.onclick = handleBackToList;
          const list = lists.find(x=>x.id===currentListId);
          if(list){
            appTitle.hidden = false;
            appTitle.textContent = list.title;
          } else {
            appTitle.hidden = true;
            appTitle.textContent = '';
          }
          btnNewList.hidden = true;
          if(appSubtitle){ appSubtitle.hidden = true; }
          if(btnImportCode){ btnImportCode.hidden = true; }
          setAppMenuVisibility(false);
        }
      }

      function handleBackToMain(){
        currentTaskId = null;
        currentListId = null;
        hideComposer();
        showScreen(screenLists);
      }

      function handleBackToList(){
        currentTaskId = null;
        hideComposer();
        showScreen(screenListDetail);
        renderTasks();
      }

      function saveState(){ localStorage.setItem('todo_lists_v3', JSON.stringify(lists)); }
      function loadState(){ try{ const raw = localStorage.getItem('todo_lists_v3'); if(raw){ lists = JSON.parse(raw); } }catch(e){ lists = []; } }

      function hideAppMenu(){
        if(!isMenuOpen) return;
        appMenu.hidden = true;
        appMenuBtn.setAttribute('aria-expanded','false');
        if(menuBackdrop){ menuBackdrop.classList.remove('show'); menuBackdrop.style.display='none'; }
        document.removeEventListener('click', handleOutsideMenuClick, true);
        document.removeEventListener('keydown', handleMenuKeyDown);
        isMenuOpen = false;
      }

      function toggleAppMenu(){
        if(appMenuBtn.hidden) return;
        if(isMenuOpen){
          hideAppMenu();
        } else {
          appMenu.hidden = false;
          appMenuBtn.setAttribute('aria-expanded','true');
          isMenuOpen = true;
          document.addEventListener('click', handleOutsideMenuClick, true);
          document.addEventListener('keydown', handleMenuKeyDown);
          shareListAction.focus();
          if(menuBackdrop){ menuBackdrop.style.display='block'; menuBackdrop.classList.add('show'); }
        }
      }

      function handleOutsideMenuClick(evt){
        if(!appMenu.contains(evt.target) && evt.target!==appMenuBtn){ hideAppMenu(); }
      }

      function handleMenuKeyDown(evt){
        if(evt.key==='Escape'){ hideAppMenu(); appMenuBtn.focus(); }
      }

      function generateShareCode(){
        let code='';
        const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for(let i=0;i<6;i++){
          if(Math.random()<0.5){ code += alphabet[Math.floor(Math.random()*alphabet.length)]; }
          else { code += Math.floor(Math.random()*10); }
        }
        return code;
      }

      function formatDisplayCode(code){
        const sanitized = (code||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
        if(sanitized.length<=3) return sanitized;
        return sanitized.slice(0,3)+' '+sanitized.slice(3);
      }

      function openShareDialog(){
        if(!currentListId) return;
        const list = lists.find(x=>x.id===currentListId);
        if(list && list.imported){ return; }
        if(list && list.shareCode){
          activeShareCode = String(list.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
          pendingSharedCode = null; // já existe código, não criar/atualizar remoto
        } else {
          activeShareCode = generateShareCode();
          if(list){ list.shareCode = activeShareCode; saveState(); }
          pendingSharedCode = activeShareCode; // indica primeira criação
          if(list){ startRealtimeForList(list.id); }
        }
        shareCodeValue.textContent = formatDisplayCode(activeShareCode);
        shareCopyFeedback.textContent='';
        shareCopyFeedback.classList.remove('error');
        shareBackdrop.style.display='flex';
        shareBackdrop.classList.add('show');
        lockScroll();
        applyKeyboardInset();
        shareCopyBtn.focus();
      }

      function closeShareDialog(){
        shareBackdrop.classList.remove('show');
        shareBackdrop.style.display='none';
        shareCopyFeedback.textContent='';
        shareCopyFeedback.classList.remove('error');
        activeShareCode='';
        if(copyFeedbackTimer){ clearTimeout(copyFeedbackTimer); copyFeedbackTimer=null; }
        clearKeyboardInset();
        unlockScroll();
      }

      function notifyCopyFeedback(message, isError){
        shareCopyFeedback.textContent=message;
        shareCopyFeedback.classList.toggle('error', !!isError);
        if(copyFeedbackTimer){ clearTimeout(copyFeedbackTimer); }
        copyFeedbackTimer = setTimeout(()=>{
          shareCopyFeedback.textContent='';
          shareCopyFeedback.classList.remove('error');
          copyFeedbackTimer=null;
        }, 2000);
      }

      async function resetApp(){
        try{
          // Unregister all service workers
          if('serviceWorker' in navigator){
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=>r.unregister()));
          }
          // Clear caches
          if('caches' in window){
            const keys = await caches.keys();
            await Promise.all(keys.map(k=>caches.delete(k)));
          }
          // Clear local storage/state
          try { localStorage.clear(); } catch(e){}
          try { sessionStorage.clear(); } catch(e){}
          // Clear IndexedDB (best-effort)
          if('indexedDB' in window && indexedDB.databases){
            try{
              const dbs = await indexedDB.databases();
              await Promise.all((dbs||[]).map(db => {
                if(db && db.name){
                  return new Promise((resolve)=>{
                    const req = indexedDB.deleteDatabase(db.name);
                    req.onsuccess = req.onerror = req.onblocked = ()=>resolve();
                  });
                }
              }));
            }catch(e){ /* ignore */ }
          }
        } finally {
          location.reload();
        }
      }

      async function attemptCopyShareCode(){
        if(!activeShareCode) return;
        const formatted = formatDisplayCode(activeShareCode);
        let sharedOk = true;
        let attemptedRemote = false;
        try{
          const list = lists.find(x=>x.id===currentListId);
          const hasExisting = !!(list && list.shareCreated);
          const shouldCreate = !!(list && !hasExisting && pendingSharedCode && pendingSharedCode === activeShareCode);
          if(shouldCreate && typeof window !== 'undefined' && typeof window.firebaseShareList === 'function'){
            attemptedRemote = true;
            await window.firebaseShareList(activeShareCode, { title: list.title, tasks: list.tasks });
            list.shareCreated = true;
            saveState();
            startRealtimeForList(list.id);
          }
        }catch(err){
          sharedOk = false;
        }
        const onCopyOk = ()=> {
          if(attemptedRemote){
            notifyCopyFeedback(sharedOk ? 'Copiado e compartilhado!' : 'Copiado! (falha ao compartilhar)', !sharedOk);
          } else {
            notifyCopyFeedback('Copiado!', false);
          }
        };
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(formatted).then(onCopyOk).catch(()=>{ legacyCopy(formatted); });
        } else {
          legacyCopy(formatted);
        }
      }

      function legacyCopy(text){
        const temp = document.createElement('textarea');
        temp.style.position='fixed';
        temp.style.opacity='0';
        temp.value=text;
        document.body.appendChild(temp);
        temp.select();
        try{ document.execCommand('copy'); notifyCopyFeedback('Copiado!', false); }
        catch(e){ notifyCopyFeedback('Não foi possível copiar.', true); }
        document.body.removeChild(temp);
      }

      function createListIconSvg(){
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        [6, 12, 18].forEach((y)=>{
          const bullet = document.createElementNS(SVG_NS, 'circle');
          bullet.setAttribute('cx', '5');
          bullet.setAttribute('cy', String(y));
          bullet.setAttribute('r', '1.8');
          bullet.setAttribute('fill', 'currentColor');
          svg.appendChild(bullet);

          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', '9');
          line.setAttribute('y1', String(y));
          line.setAttribute('x2', '19');
          line.setAttribute('y2', String(y));
          line.setAttribute('stroke', 'currentColor');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-linecap', 'round');
          svg.appendChild(line);
        });

        return svg;
      }

      function formatSubtitleDate(){
        try{
          const now = new Date();
          const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now);
          let dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(now);
          dayMonth = dayMonth.replace(' de ', ' ').replace('.', '');
          const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
          return `${capitalizedWeekday}, ${dayMonth}`;
        }catch(_){
          return 'Hoje';
        }
      }

      function updateSubtitle(){
        if(appSubtitle){
          appSubtitle.textContent = formatSubtitleDate();
        }
      }

      function renderLists(){
        listsContainer.innerHTML='';
        if(lists.length===0){
          listsContainer.appendChild(noLists);
          return;
        }
        lists.forEach(l=>{
          const card = document.createElement('div');
          card.className='list-card';
          card.tabIndex=0;
          card.addEventListener('click', ()=>openList(l.id));
          card.addEventListener('keydown', (e)=>{ if(e.key==='Enter') openList(l.id) });

          const ico = document.createElement('div');
          ico.className='list-icon';
          ico.appendChild(createListIconSvg());
          const txt = document.createElement('div'); txt.className='list-title'; txt.textContent=l.title;
          const incompleteCount = Array.isArray(l.tasks)
            ? l.tasks.reduce((total, task)=> total + (task && task.done ? 0 : 1), 0)
            : 0;

          card.appendChild(ico);
          card.appendChild(txt);

          const countEl = document.createElement('div');
          countEl.className='list-counter';
          countEl.textContent = incompleteCount;
          countEl.setAttribute('aria-label', `${incompleteCount} ${(incompleteCount===1)?'tarefa pendente':'tarefas pendentes'}`);
          card.appendChild(countEl);

          listsContainer.appendChild(card);
        });
      }

      function openModal(mode, listId){
        // mode: 'create' or 'rename'
        modalBackdrop.style.display='flex';
        modalBackdrop.classList.add('show');
        lockScroll();
        applyKeyboardInset();
        modalBackdrop.dataset.mode = mode;
        if(mode==='create'){
          modalTitle.textContent='Nova Lista';
          modalPrimary.textContent='Criar lista';
          modalPrimary.disabled=true;
          listNameInput.value='';
        } else {
          modalTitle.textContent='Renomear Lista';
          modalPrimary.textContent='Salvar';
          const list = lists.find(x=>x.id===listId);
          listNameInput.value = list ? list.title : '';
          modalPrimary.disabled = listNameInput.value.trim().length===0;
          setTimeout(()=>{ listNameInput.focus(); const len=listNameInput.value.length; listNameInput.setSelectionRange(len,len); },40);
        }
        setTimeout(()=>{ listNameInput.focus(); },50);
        listNameInput.addEventListener('input', onModalInput);
        if(listId) modalBackdrop.dataset.listId = listId; else delete modalBackdrop.dataset.listId;
      }

      function closeModal(){
        modalBackdrop.classList.remove('show');
        modalBackdrop.style.display='none';
        listNameInput.removeEventListener('input', onModalInput);
        delete modalBackdrop.dataset.mode; delete modalBackdrop.dataset.listId;
        clearKeyboardInset();
        unlockScroll();
      }

      function openCodeModal(){
        if(!codeBackdrop) return;
        codeBackdrop.style.display='flex';
        codeBackdrop.classList.add('show');
        lockScroll();
        applyKeyboardInset();
        // collect inputs on first open
        if(codeInputs.length===0){
          codeInputs = Array.from(codeBackdrop.querySelectorAll('input.code-input'));
          // attach handlers
          codeInputs.forEach((input, idx)=>{
            input.addEventListener('input', (e)=>{
              const val = input.value.toUpperCase().replace(/[^0-9A-Z]/g,'');
              input.value = val.slice(0,1);
              if(val && idx<codeInputs.length-1){ codeInputs[idx+1].focus(); }
            });
            input.addEventListener('keydown', (e)=>{
              if(e.key==='Backspace' && !input.value && idx>0){ codeInputs[idx-1].focus(); }
              if(e.key==='ArrowLeft' && idx>0){ e.preventDefault(); codeInputs[idx-1].focus(); }
              if(e.key==='ArrowRight' && idx<codeInputs.length-1){ e.preventDefault(); codeInputs[idx+1].focus(); }
              if(e.key==='Enter'){ e.preventDefault(); }
              if(e.key.length===1){
                // allow typing to replace and jump next
                input.value = '';
              }
            });
            input.addEventListener('paste', (e)=>{
              e.preventDefault();
              const text = (e.clipboardData || window.clipboardData).getData('text') || '';
              const clean = text.replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
              for(let i=0;i<codeInputs.length;i++){
                codeInputs[i].value = clean[i] || '';
              }
              const nextIndex = Math.min(clean.length, codeInputs.length-1);
              codeInputs[nextIndex].focus();
            });
          });
        } else {
          codeInputs.forEach(i=>i.value='');
        }
        setTimeout(()=>{ if(codeInputs[0]) codeInputs[0].focus(); }, 40);
      }

      function closeCodeModal(){
        if(!codeBackdrop) return;
        codeBackdrop.classList.remove('show');
        codeBackdrop.style.display='none';
        clearKeyboardInset();
        unlockScroll();
      }

      function onModalInput(){ modalPrimary.disabled = listNameInput.value.trim().length===0; }

      function createListFromModal(){
        const title = listNameInput.value.trim(); if(!title) return;
        const id = 'l_'+Date.now();
        const newList = {id, title, tasks:[]};
        lists.push(newList);
        saveState(); renderLists(); closeModal(); openList(id);
      }

      function saveRenameFromModal(){
        const id = modalBackdrop.dataset.listId; const title = listNameInput.value.trim(); if(!title) return;
        const list = lists.find(x=>x.id===id); if(list){ list.title = title; }
        saveState(); renderLists(); if(currentListId===id){ currentListName.textContent = title; }
        if(list){ requestSync(list.id); }
        closeModal();
      }

      function openList(id){
        currentListId = id;
        const list = lists.find(x=>x.id===id);
        currentListName.textContent = list ? list.title : 'Lista';
        renderTasks();
        // ensure composer closed when opening
        hideComposer();
        showScreen(screenListDetail);
      }

      function openTaskDetail(taskId){
        currentTaskId = taskId;
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        const task = list.tasks.find(t=>t.id===taskId);
        if(!task) return;
        // populate task
        taskDetailText.textContent = task.text || '';
        taskDetailText.setAttribute('data-placeholder','Renomear tarefa');
        lastValidTaskText = task.text || '';
        // checkbox state
        if(task.done){ taskDetailCheckbox.classList.add('checked'); taskDetailCheckbox.innerHTML='✓'; }
        else { taskDetailCheckbox.classList.remove('checked'); taskDetailCheckbox.innerHTML=''; }
        showScreen(screenTaskDetail);
        // focus contenteditable when opening
        setTimeout(()=>{ 
          taskDetailText.focus(); 
          if(taskDetailText.textContent && taskDetailText.textContent.length>0){ 
            placeCaretAtEnd(taskDetailText); 
          }
        },120);
      }

      function placeCaretAtEnd(el){
        if(!el) return;
        const range = document.createRange(); const sel = window.getSelection(); range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
      }

      function renderTasks(){
        tasksContainer.innerHTML=''; completedList.innerHTML='';
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        const active = list.tasks.filter(t=>!t.done);
        const done = list.tasks.filter(t=>t.done);

        if(active.length===0){ const elEmpty = document.createElement('div'); elEmpty.className='centered-empty'; elEmpty.textContent='Nenhuma tarefa ativa.'; tasksContainer.appendChild(elEmpty); }
        else{
          active.forEach(t=>{
            const node = document.createElement('div'); node.className='task'; node.dataset.id=t.id;
            const cb = document.createElement('button'); cb.className='checkbox-round'; cb.setAttribute('aria-pressed','false'); cb.title='Marcar como concluída';
            cb.addEventListener('click', (ev)=>{ ev.stopPropagation(); animateAndToggle(cb, t.id, true); });
            const txt = document.createElement('div'); txt.className='text'; txt.textContent=t.text;
            // clicking the text opens detail
            txt.addEventListener('click', (ev)=>{ ev.stopPropagation(); openTaskDetail(t.id); });
            node.appendChild(cb); node.appendChild(txt);
            tasksContainer.appendChild(node);
          });
        }

        if(done.length>0){
          completedGroup.style.display='block';
          completedCount.textContent = done.length;
          // update chevron direction
          chev.textContent = completedCollapsed ? '▸' : '▾';
          if(completedCollapsed){ completedList.style.display='none'; }
          else{ completedList.style.display='flex'; }

          done.forEach(t=>{
            const node = document.createElement('div'); node.className='task done'; node.dataset.id=t.id;
            const cb = document.createElement('button'); cb.className='checkbox-round checked'; cb.setAttribute('aria-pressed','true'); cb.title='Desmarcar'; cb.innerHTML='✓'; cb.addEventListener('click', (ev)=>{ ev.stopPropagation(); animateAndToggle(cb, t.id, false); });
            const txt = document.createElement('div'); txt.className='text'; txt.textContent=t.text;
            txt.addEventListener('click', (ev)=>{ ev.stopPropagation(); openTaskDetail(t.id); });
            node.appendChild(cb); node.appendChild(txt);
            completedList.appendChild(node);
          });
        } else {
          completedGroup.style.display='none';
        }
      }

      // animation helper: add pop class then toggle state
      function animateAndToggle(buttonEl, taskId, markDone){
        buttonEl.classList.add('pop');
        setTimeout(()=>{ buttonEl.classList.remove('pop'); toggleTaskDone(taskId, markDone); }, 180);
      }

      function toggleTaskDone(taskId, markDone){
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const idx = list.tasks.findIndex(t=>t.id===taskId); if(idx===-1) return;
        list.tasks[idx].done = !!markDone;
        // move item: remove and then place accordingly
        const [task] = list.tasks.splice(idx,1);
        if(task.done) list.tasks.push(task); // completed at end
        else list.tasks.unshift(task); // active to top
        saveState(); renderTasks(); renderLists(); requestSync(list.id);
        // if we're in task detail for this task, update detail checkbox and text style
        if(currentTaskId===taskId && screenTaskDetail.classList.contains('active')){
          if(task.done){ taskDetailCheckbox.classList.add('checked'); taskDetailCheckbox.innerHTML='✓'; }
          else{ taskDetailCheckbox.classList.remove('checked'); taskDetailCheckbox.innerHTML=''; }
          // keep user on task detail
        }
      }

      function deleteTask(taskId){
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const idx = list.tasks.findIndex(t=>t.id===taskId); if(idx===-1) return;
        list.tasks.splice(idx,1);
        saveState(); renderTasks(); renderLists(); requestSync(list.id);
      }

      function attachSwipeToDelete(node, taskId){
        let startX = 0;
        let currentX = 0;
        let dragging = false;
        let width = 0;
        let preventedScroll = false;
        let moved = false;

        function setTranslate(x){
          node.style.transform = `translateX(${x}px)`;
        }

        function setProgressBg(ratio){
          const clamped = Math.max(0, Math.min(1, ratio));
          const alpha = 0.08 + clamped * 0.6; // start slight red, get stronger
          node.style.background = `rgba(255,0,0,${alpha})`;
          node.style.borderColor = `rgba(255,0,0,${Math.min(0.35 + clamped * 0.4, 0.8)})`;
        }

        function clearStyles(){
          node.style.transform = '';
          node.style.background = '';
          node.style.borderColor = '';
        }

        function onPointerDown(e){
          if(e.button !== undefined && e.button !== 0) return; // only left button
          dragging = true;
          moved = false;
          preventedScroll = false;
          startX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
          currentX = startX;
          width = node.offsetWidth || 1;
          try{ node.setPointerCapture && node.setPointerCapture(e.pointerId); }catch(_){ }
          node.classList.remove('swipe-anim');
        }

        function onPointerMove(e){
          if(!dragging) return;
          const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
          const dx = x - startX;
          if(Math.abs(dx) > 6) moved = true;
          // only allow swipe to left for delete
          const tx = Math.min(0, dx);
          if(!preventedScroll && Math.abs(dx) > 10){
            // lock vertical scroll while swiping horizontally
            if(e.cancelable) e.preventDefault();
            preventedScroll = true;
          }
          setTranslate(tx);
          const ratio = Math.min(Math.abs(tx) / width, 1);
          setProgressBg(ratio);
        }

        function onPointerUp(e){
          if(!dragging) return;
          dragging = false;
          const endX = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || currentX;
          const dx = Math.min(0, endX - startX);
          const ratio = Math.min(Math.abs(dx) / (width || 1), 1);
          node.classList.add('swipe-anim');
          if(ratio > 0.5){
            // animate out then delete
            setTranslate(-Math.max(width * 1.2, 200));
            setTimeout(()=>{ deleteTask(taskId); }, 160);
          } else {
            // revert
            setTranslate(0);
            setProgressBg(0);
            setTimeout(()=>{ clearStyles(); node.classList.remove('swipe-anim'); }, 180);
          }
        }

        node.addEventListener('pointerdown', onPointerDown, { passive: true });
        node.addEventListener('pointermove', onPointerMove);
        node.addEventListener('pointerup', onPointerUp);
        node.addEventListener('pointercancel', onPointerUp);
        // prevent accidental click after swipe
        node.addEventListener('click', (ev)=>{ if(moved){ ev.stopPropagation(); ev.preventDefault(); } });
      }

      // Composer controls (overlay)
      function showComposer(){
        composerBackdrop.style.display='flex';
        composerBackdrop.classList.add('show');
        composerBackdrop.setAttribute('aria-hidden','false');
        // focus input to open keyboard on mobile
        setTimeout(()=>{ composerInput.focus(); applyKeyboardInset(); },60);
        // change fab text to X
        openComposer.textContent='✕';
      }
      function hideComposer(){
        composerBackdrop.classList.remove('show');
        composerBackdrop.style.display='none';
        composerBackdrop.setAttribute('aria-hidden','true');
        openComposer.textContent='+';
        // blur input so keyboard hides
        try{ composerInput.blur(); }catch(e){}
        clearKeyboardInset();
      }

      function toggleComposer(){
        if(composerBackdrop.style.display==='flex' || composerBackdrop.classList.contains('show')) hideComposer(); else showComposer();
      }

      function sendTaskNow(){
        const text = composerInput.value.trim(); if(!text) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        // add to top of active tasks
        list.tasks.unshift({id:'t_'+Date.now(), text, done:false});
        composerInput.value=''; sendTask.disabled=true; saveState(); renderTasks(); renderLists();
        requestSync(list.id);
        // keep composer open and keep keyboard up by focusing again quickly
        setTimeout(()=>composerInput.focus(),40);
      }

      // Task Detail: inline edit
      taskDetailText.addEventListener('input', ()=>{
        if(!currentListId || !currentTaskId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
        const raw = taskDetailText.textContent || '';
        const trimmed = raw.trim();
        if(trimmed.length===0){
          task.text = '';
        } else {
          task.text = raw;
        }
        saveState(); renderLists(); renderTasks();
      });

      taskDetailText.addEventListener('focus', ()=>{
        try{
          if(!currentListId || !currentTaskId) return;
          const list = lists.find(x=>x.id===currentListId); if(!list) return;
          const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
          // snapshot do valor no momento do foco
          lastValidTaskText = task.text || '';
        }catch(_){ }
      });

      taskDetailText.addEventListener('blur', ()=>{
        // não permitir salvar vazio; restaurar último título válido
        if(!currentListId || !currentTaskId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
        const trimmed = (taskDetailText.textContent || '').trim();
        if(trimmed.length===0){
          task.text = lastValidTaskText || '';
          taskDetailText.textContent = lastValidTaskText || '';
        } else {
          task.text = taskDetailText.textContent;
          lastValidTaskText = task.text;
        }
        saveState(); renderLists(); renderTasks(); requestSync(list.id);
      });

      // task detail checkbox toggle (without leaving screen)
      taskDetailCheckbox.addEventListener('click', ()=>{
        if(!currentTaskId || !currentListId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
        const newDone = !task.done;
        // animate
        taskDetailCheckbox.classList.add('pop');
        setTimeout(()=>{ taskDetailCheckbox.classList.remove('pop'); toggleTaskDone(currentTaskId, newDone); }, 180);
      });

      async function deleteCurrentList(){
        if(!currentListId) return;
        const idx = lists.findIndex(x=>x.id===currentListId);
        if(idx===-1) return;
        const list = lists[idx];
        // tentativa de exclusão remota (best-effort)
        try{
          if(list && list.shareCode && !list.imported && typeof window !== 'undefined' && typeof window.firebaseDeleteList === 'function'){
            const code = String(list.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase();
            if(code.length===6){ await window.firebaseDeleteList(code); }
          }
        }catch(e){ }
        // exclusão local
        stopRealtimeForList(list.id);
        lists.splice(idx,1);
        saveState();
        currentTaskId = null;
        currentListId = null;
        hideComposer();
        showScreen(screenLists);
        renderLists();
        updateAppBar(screenLists);
      }

      // Events
      btnNewList.addEventListener('click', ()=>{ if(codeBackdrop && codeBackdrop.classList.contains('show')) closeCodeModal(); openModal('create'); });
      if(emptyStateCta){ emptyStateCta.addEventListener('click', ()=>{ btnNewList.click(); }); }
      modalCancel.addEventListener('click', ()=>closeModal());
      modalPrimary.addEventListener('click', ()=>{ const mode = modalBackdrop.dataset.mode; if(mode==='create') createListFromModal(); else saveRenameFromModal(); });
      listNameInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !modalPrimary.disabled){ modalPrimary.click(); } });
      modalBackdrop.addEventListener('click', (e)=>{ if(e.target===modalBackdrop) closeModal(); });

      currentListName.addEventListener('click', ()=>{ if(!currentListId) return; openModal('rename', currentListId); setTimeout(()=>{ const len=listNameInput.value.length; listNameInput.setSelectionRange(len,len); },50); });
      currentListName.addEventListener('keydown', (e)=>{ if(e.key==='Enter') currentListName.click(); });

      openComposer.addEventListener('click', toggleComposer);
      composerInput.addEventListener('input', ()=>{ sendTask.disabled = composerInput.value.trim().length===0; });
      composerInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !sendTask.disabled){ sendTask.click(); } });
      sendTask.addEventListener('click', sendTaskNow);

      // clicking backdrop closes composer (but not modal backdrop)
      composerBackdrop.addEventListener('click', (e)=>{ if(e.target===composerBackdrop) hideComposer(); });

      completedHeader.addEventListener('click', ()=>{ completedCollapsed = !completedCollapsed; renderTasks(); });

      appMenuBtn.addEventListener('click', toggleAppMenu);
      shareListAction.addEventListener('click', ()=>{ hideAppMenu(); openShareDialog(); });
      if(deleteListAction){
        deleteListAction.addEventListener('click', async ()=>{
          hideAppMenu();
          if(!currentListId) return;
          const list = lists.find(x=>x.id===currentListId);
          const title = list ? (list.title || 'esta lista') : 'esta lista';
          const ok = confirm(`Excluir "${title}"? Essa ação não pode ser desfeita.`);
          if(!ok) return;
          await deleteCurrentList();
        });
      }
      if(resetAppAction){
        resetAppAction.addEventListener('click', async ()=>{
          hideAppMenu();
          const confirmReset = confirm('Isso limpará todos os dados locais e recarregará o app. Continuar?');
          if(confirmReset){ await resetApp(); }
        });
      }
      shareCopyBtn.addEventListener('click', attemptCopyShareCode);
      shareCloseBtn.addEventListener('click', closeShareDialog);
      shareBackdrop.addEventListener('click', (evt)=>{ if(evt.target===shareBackdrop) closeShareDialog(); });
      // code modal bindings
      if(btnImportCode){ btnImportCode.addEventListener('click', ()=>{ closeModal(); openCodeModal(); }); }
      if(codeCancel){ codeCancel.addEventListener('click', closeCodeModal); }
      if(codeBackdrop){ codeBackdrop.addEventListener('click', (evt)=>{ if(evt.target===codeBackdrop) closeCodeModal(); }); }
      if(codeImport){
        codeImport.addEventListener('click', async ()=>{
          try{
            if(!codeInputs || codeInputs.length===0){ return; }
            const raw = codeInputs.map(i=> (i.value||'').toUpperCase().replace(/[^0-9A-Z]/g,'')).join('');
            const normalized = raw.slice(0,6);
            if(normalized.length!==6){ alert('Informe um código de 6 caracteres.'); return; }
            if(typeof window === 'undefined' || typeof window.firebaseGetList !== 'function'){
              alert('Importação indisponível no momento.'); return;
            }
            codeImport.disabled = true;
            const remote = await window.firebaseGetList(normalized);
            codeImport.disabled = false;
            if(!remote){ alert('Código não encontrado.'); return; }
            const id = 'l_'+Date.now();
            const title = remote.title || 'Lista Importada';
            const tasks = Array.isArray(remote.tasks) ? remote.tasks.map((t, idx)=>({ id: 't_'+Date.now()+'_'+idx, text: t && t.text ? String(t.text) : '', done: !!(t && t.done) })) : [];
            const newList = { id, title, tasks, shareCode: normalized, imported: true };
            lists.push(newList);
            saveState(); renderLists(); closeCodeModal(); openList(id);
            startRealtimeForList(id);
          }catch(e){
            try{ codeImport.disabled = false; }catch(_){ }
            alert('Ocorreu um erro ao importar.');
          }
        });
      }
      document.addEventListener('keydown', (evt)=>{
        if(evt.key==='Escape'){
          if(isMenuOpen){ hideAppMenu(); }
          if(shareBackdrop.classList.contains('show')){ closeShareDialog(); }
          if(codeBackdrop && codeBackdrop.classList.contains('show')){ closeCodeModal(); }
        }
      });

      if(menuBackdrop){ menuBackdrop.addEventListener('click', hideAppMenu); }

      // initial load
      loadState();
      renderLists();
      updateSubtitle();
      updateAppBar(screenLists);
      try{ (lists||[]).forEach(l=>{ if(l && l.shareCode && String(l.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6).length===6){ startRealtimeForList(l.id); } }); }catch(_){ }

      // Keep saving on unload
      window.addEventListener('beforeunload', saveState);

      // Register service worker for offline support (only https or localhost)
      const isLocalhost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      const isSecureContext = (location.protocol === 'https:' || isLocalhost);
      if('serviceWorker' in navigator && isSecureContext){
        window.addEventListener('load', ()=>{
          navigator.serviceWorker.register('service-worker.js').catch((err)=>{
            console.error('Service worker registration failed', err);
          });
        });
      }

    })();
