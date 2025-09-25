(function(){
      // State
      let lists = []; // {id, title, tasks: [{id,text,done}]}
      let currentListId = null;
      let currentTaskId = null;
      let completedCollapsed = false;
      const el = id=>document.getElementById(id);

      // Elements
      const screenLists = el('screenLists');
      const screenListDetail = el('screenListDetail');
      const screenTaskDetail = el('screenTaskDetail');
      const listsContainer = el('listsContainer');
      const noLists = el('noLists');
      const btnNewList = el('btnNewList');
      const modalBackdrop = el('modalBackdrop');
      const modalTitle = el('modalTitle');
      const listNameInput = el('listNameInput');
      const modalCancel = el('modalCancel');
      const modalPrimary = el('modalPrimary');
      const currentListName = el('currentListName');
      const appTitle = el('appTitle');
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

      const taskDetailRow = el('taskDetailRow');
      const taskDetailCheckbox = el('taskDetailCheckbox');
      const taskDetailText = el('taskDetailText');

      // helpers
      function showScreen(screen){
        [screenLists, screenListDetail, screenTaskDetail].forEach(s=>s.classList.remove('active'));
        screen.classList.add('active');
        updateAppBar(screen);
      }

      function updateAppBar(activeScreen){
        if(activeScreen===screenLists){
          globalBackBtn.hidden = true;
          globalBackBtn.onclick = null;
          appTitle.hidden = false;
          appTitle.textContent = DEFAULT_TITLE;
          btnNewList.hidden = false;
        } else if(activeScreen===screenListDetail){
          globalBackBtn.hidden = false;
          globalBackBtn.onclick = handleBackToMain;
          appTitle.hidden = true;
          appTitle.textContent = '';
          btnNewList.hidden = true;
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

          const ico = document.createElement('div'); ico.className='list-icon'; ico.textContent='L';
          const txt = document.createElement('div'); txt.textContent=l.title;

          card.appendChild(ico); card.appendChild(txt);
          listsContainer.appendChild(card);
        });
      }

      function openModal(mode, listId){
        // mode: 'create' or 'rename'
        modalBackdrop.style.display='flex';
        modalBackdrop.classList.add('show');
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
        modalBackdrop.dataset.mode = mode;
        if(listId) modalBackdrop.dataset.listId = listId; else delete modalBackdrop.dataset.listId;
      }

      function closeModal(){
        modalBackdrop.classList.remove('show');
        modalBackdrop.style.display='none';
        listNameInput.removeEventListener('input', onModalInput);
        delete modalBackdrop.dataset.mode; delete modalBackdrop.dataset.listId;
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
        if(!task.text || task.text.trim().length===0){ taskDetailText.classList.add('placeholder'); taskDetailText.textContent = 'Renomear Tarefa'; }
        else { taskDetailText.classList.remove('placeholder'); }
        // checkbox state
        if(task.done){ taskDetailCheckbox.classList.add('checked'); taskDetailCheckbox.innerHTML='✓'; }
        else { taskDetailCheckbox.classList.remove('checked'); taskDetailCheckbox.innerHTML=''; }
        showScreen(screenTaskDetail);
        // focus contenteditable when opening
        setTimeout(()=>{ taskDetailText.focus(); placeCaretAtEnd(taskDetailText); },120);
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
          else{ completedList.style.display='block'; }

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
        saveState(); renderTasks(); renderLists();
        // if we're in task detail for this task, update detail checkbox and text style
        if(currentTaskId===taskId && screenTaskDetail.classList.contains('active')){
          if(task.done){ taskDetailCheckbox.classList.add('checked'); taskDetailCheckbox.innerHTML='✓'; }
          else{ taskDetailCheckbox.classList.remove('checked'); taskDetailCheckbox.innerHTML=''; }
          // keep user on task detail
        }
      }

      // Composer controls (overlay)
      function showComposer(){
        composerBackdrop.style.display='flex';
        composerBackdrop.classList.add('show');
        composerBackdrop.setAttribute('aria-hidden','false');
        // focus input to open keyboard on mobile
        setTimeout(()=>{ composerInput.focus(); },60);
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
      }

      function toggleComposer(){
        if(composerBackdrop.style.display==='flex' || composerBackdrop.classList.contains('show')) hideComposer(); else showComposer();
      }

      function sendTaskNow(){
        const text = composerInput.value.trim(); if(!text) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        // add to top of active tasks
        list.tasks.unshift({id:'t_'+Date.now(), text, done:false});
        composerInput.value=''; sendTask.disabled=true; saveState(); renderTasks();
        // keep composer open and keep keyboard up by focusing again quickly
        setTimeout(()=>composerInput.focus(),40);
      }

      // Task Detail: inline edit
      taskDetailText.addEventListener('input', ()=>{
        if(!currentListId || !currentTaskId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
        const val = taskDetailText.textContent.trim();
        if(val.length===0){ task.text = ''; taskDetailText.classList.add('placeholder'); taskDetailText.textContent = 'Renomear Tarefa'; placeCaretAtEnd(taskDetailText); }
        else { task.text = taskDetailText.textContent; taskDetailText.classList.remove('placeholder'); }
        saveState(); renderLists(); renderTasks();
      });

      taskDetailText.addEventListener('focus', ()=>{
        if(taskDetailText.classList.contains('placeholder')){ taskDetailText.textContent=''; taskDetailText.classList.remove('placeholder'); }
      });

      taskDetailText.addEventListener('blur', ()=>{
        // if empty, keep placeholder but save empty text
        if(!currentListId || !currentTaskId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = list.tasks.find(t=>t.id===currentTaskId); if(!task) return;
        const val = taskDetailText.textContent.trim();
        if(val.length===0){ task.text = ''; taskDetailText.classList.add('placeholder'); taskDetailText.textContent = 'Renomear Tarefa'; }
        else { task.text = taskDetailText.textContent; }
        saveState(); renderLists(); renderTasks();
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

      // Events
      btnNewList.addEventListener('click', ()=>openModal('create'));
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

      // initial load
      loadState();
      renderLists();
      updateAppBar(screenLists);

      // Keep saving on unload
      window.addEventListener('beforeunload', saveState);

      // Register service worker for offline support
      if('serviceWorker' in navigator){
        window.addEventListener('load', ()=>{
          navigator.serviceWorker.register('service-worker.js').catch((err)=>{
            console.error('Service worker registration failed', err);
          });
        });
      }

    })();
