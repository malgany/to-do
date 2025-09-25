(function(){
      // State
      let lists = []; // {id, title, tasks: [{id,text,done}]}
      let currentListId = null;
      let currentTaskId = null;
      let completedCollapsed = false;
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
      const modalBackdrop = el('modalBackdrop');
      const modalTitle = el('modalTitle');
      const listNameInput = el('listNameInput');
      const modalCancel = el('modalCancel');
      const modalPrimary = el('modalPrimary');
      const currentListName = el('currentListName');
      const appTitle = el('appTitle');
      const appMenuBtn = el('appMenuBtn');
      const appMenu = el('appMenu');
      const menuBackdrop = el('menuBackdrop');
      const shareListAction = el('shareListAction');
      const shareBackdrop = el('shareBackdrop');
      const shareCodeValue = el('shareCodeValue');
      const shareCopyBtn = el('shareCopyBtn');
      const shareCopyFeedback = el('shareCopyFeedback');
      const shareCloseBtn = el('shareCloseBtn');
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

      function lockScroll(){
        rootEl.classList.add('scroll-lock');
        document.body.classList.add('scroll-lock');
      }

      function unlockScroll(){
        rootEl.classList.remove('scroll-lock');
        document.body.classList.remove('scroll-lock');
      }

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
          globalBackBtn.hidden = true;
          globalBackBtn.onclick = null;
          appTitle.hidden = false;
          appTitle.textContent = DEFAULT_TITLE;
          btnNewList.hidden = false;
          setAppMenuVisibility(false);
        } else if(activeScreen===screenListDetail){
          globalBackBtn.hidden = false;
          globalBackBtn.onclick = handleBackToMain;
          appTitle.hidden = true;
          appTitle.textContent = '';
          btnNewList.hidden = true;
          setAppMenuVisibility(true);
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
        activeShareCode = generateShareCode();
        shareCodeValue.textContent = formatDisplayCode(activeShareCode);
        shareCopyFeedback.textContent='';
        shareCopyFeedback.classList.remove('error');
        shareBackdrop.style.display='flex';
        shareBackdrop.classList.add('show');
        lockScroll();
        shareCopyBtn.focus();
      }

      function closeShareDialog(){
        shareBackdrop.classList.remove('show');
        shareBackdrop.style.display='none';
        shareCopyFeedback.textContent='';
        shareCopyFeedback.classList.remove('error');
        activeShareCode='';
        if(copyFeedbackTimer){ clearTimeout(copyFeedbackTimer); copyFeedbackTimer=null; }
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

      function attemptCopyShareCode(){
        if(!activeShareCode) return;
        const formatted = formatDisplayCode(activeShareCode);
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(formatted).then(()=>{
            notifyCopyFeedback('Copiado!', false);
          }).catch(()=>{
            legacyCopy(formatted);
          });
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
          bullet.setAttribute('fill', '#000');
          svg.appendChild(bullet);

          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', '9');
          line.setAttribute('y1', String(y));
          line.setAttribute('x2', '19');
          line.setAttribute('y2', String(y));
          line.setAttribute('stroke', '#000');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-linecap', 'round');
          svg.appendChild(line);
        });

        return svg;
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

          if(incompleteCount>0){
            const countEl = document.createElement('div'); countEl.className='list-counter'; countEl.textContent = incompleteCount;
            card.appendChild(countEl);
          }

          listsContainer.appendChild(card);
        });
      }

      function openModal(mode, listId){
        // mode: 'create' or 'rename'
        modalBackdrop.style.display='flex';
        modalBackdrop.classList.add('show');
        lockScroll();
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
        unlockScroll();
      }

      function openCodeModal(){
        if(!codeBackdrop) return;
        codeBackdrop.style.display='flex';
        codeBackdrop.classList.add('show');
        lockScroll();
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
        composerInput.value=''; sendTask.disabled=true; saveState(); renderTasks(); renderLists();
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
      btnNewList.addEventListener('click', ()=>{ if(codeBackdrop && codeBackdrop.classList.contains('show')) closeCodeModal(); openModal('create'); });
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
      shareCopyBtn.addEventListener('click', attemptCopyShareCode);
      shareCloseBtn.addEventListener('click', closeShareDialog);
      shareBackdrop.addEventListener('click', (evt)=>{ if(evt.target===shareBackdrop) closeShareDialog(); });
      // code modal bindings
      if(btnImportCode){ btnImportCode.addEventListener('click', ()=>{ closeModal(); openCodeModal(); }); }
      if(codeCancel){ codeCancel.addEventListener('click', closeCodeModal); }
      if(codeBackdrop){ codeBackdrop.addEventListener('click', (evt)=>{ if(evt.target===codeBackdrop) closeCodeModal(); }); }
      if(codeImport){ codeImport.addEventListener('click', ()=>{/* no-op for now */}); }
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
