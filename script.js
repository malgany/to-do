(function(){
      // State
      let lists = []; // {id, title, tasks: [{id,text,done,photos:[]}]} 
      let currentListId = null;
      let currentTaskId = null;
      let completedCollapsed = false;
      const COMPLETED_COLLAPSE_STORAGE_KEY = 'todo_completed_collapsed_v1';
      const LOCAL_ORDER_STORAGE_KEY = 'todo_local_order_v1';
      let completedCollapseByList = {};
      let localOrderByList = {};
      let lastValidTaskText = '';
      const el = id=>document.getElementById(id);
      const SVG_NS = 'http://www.w3.org/2000/svg';

      // ===== TASK GROUPS - Local Storage Only (Not Synced) =====
      const TASK_GROUPS_STORAGE_KEY = 'todo_task_groups_v1';
      
      // Paleta de cores para grupos (sequencial)
      const GROUP_COLORS = [
        { name: 'blue', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
        { name: 'yellow', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
        { name: 'green', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
        { name: 'pink', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
        { name: 'purple', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
        { name: 'orange', color: '#F97316', bg: 'rgba(249,115,22,0.12)' }
      ];

      // Carregar todos os grupos do localStorage
      function loadAllGroups() {
        try {
          const stored = localStorage.getItem(TASK_GROUPS_STORAGE_KEY);
          return stored ? JSON.parse(stored) : {};
        } catch (e) {
          console.error('Erro ao carregar grupos:', e);
          return {};
        }
      }

      // Salvar todos os grupos no localStorage
      function saveAllGroups(allGroups) {
        try {
          localStorage.setItem(TASK_GROUPS_STORAGE_KEY, JSON.stringify(allGroups));
        } catch (e) {
          console.error('Erro ao salvar grupos:', e);
        }
      }

      // Carregar grupos de uma lista específica
      function loadLocalGroups(listId) {
        if (!listId) return {};
        const allGroups = loadAllGroups();
        return allGroups[listId] || {};
      }

      // Salvar grupos de uma lista específica
      function saveLocalGroups(listId, groups) {
        if (!listId) return;
        const allGroups = loadAllGroups();
        allGroups[listId] = groups;
        saveAllGroups(allGroups);
      }

      // Obter próxima cor disponível na sequência
      function getNextGroupColor(listId) {
        const groups = loadLocalGroups(listId);
        const usedColors = new Set();
        Object.values(groups).forEach(group => {
          if (group.color) usedColors.add(group.color);
        });
        
        // Encontrar primeira cor não usada
        for (const colorObj of GROUP_COLORS) {
          if (!usedColors.has(colorObj.name)) {
            return colorObj;
          }
        }
        
        // Se todas estão usadas, retornar a primeira (ciclar)
        return GROUP_COLORS[0];
      }

      // Obter grupo que contém uma tarefa
      function getTaskGroup(listId, taskId) {
        if (!listId || !taskId) return null;
        const groups = loadLocalGroups(listId);
        for (const [groupId, group] of Object.entries(groups)) {
          if (group.taskIds && group.taskIds.includes(taskId)) {
            return { groupId, ...group };
          }
        }
        return null;
      }

      // Criar ID único para grupo
      function createGroupId() {
        return 'grp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      }

      // Criar novo grupo ou adicionar a existente
      function createOrAddToGroup(listId, draggedTaskId, targetTaskId) {
        if (!listId || !draggedTaskId || !targetTaskId) return;
        if (draggedTaskId === targetTaskId) return;
        
        const groups = loadLocalGroups(listId);
        
        // Verificar se o target já está em um grupo
        const targetGroup = getTaskGroup(listId, targetTaskId);
        
        if (targetGroup) {
          // Adicionar ao grupo existente se ainda não estiver nele
          if (!targetGroup.taskIds.includes(draggedTaskId)) {
            groups[targetGroup.groupId].taskIds.push(draggedTaskId);
          }
        } else {
          // Criar novo grupo
          const newGroupId = createGroupId();
          const colorObj = getNextGroupColor(listId);
          groups[newGroupId] = {
            taskIds: [targetTaskId, draggedTaskId],
            color: colorObj.name,
            createdAt: Date.now()
          };
        }
        
        // Limpar grupos vazios
        deleteEmptyGroups(listId, groups);
        saveLocalGroups(listId, groups);
        
        // Re-renderizar as tarefas para mostrar o agrupamento
        renderTasks();
      }

      // Remover tarefa de grupo (ao arrastar para fora)
      function removeFromGroup(listId, taskId) {
        if (!listId || !taskId) return;
        const groups = loadLocalGroups(listId);
        let changed = false;
        
        for (const groupId in groups) {
          const index = groups[groupId].taskIds.indexOf(taskId);
          if (index !== -1) {
            groups[groupId].taskIds.splice(index, 1);
            changed = true;
          }
        }
        
        if (changed) {
          deleteEmptyGroups(listId, groups);
          saveLocalGroups(listId, groups);
        }
      }

      // Limpar grupos com menos de 2 tarefas
      function deleteEmptyGroups(listId, groups) {
        if (!groups) groups = loadLocalGroups(listId);
        for (const groupId in groups) {
          if (!groups[groupId].taskIds || groups[groupId].taskIds.length < 2) {
            delete groups[groupId];
          }
        }
      }

      // Limpar grupos ao excluir uma tarefa
      function cleanupGroupsForTask(listId, taskId) {
        if (!listId || !taskId) return;
        const groups = loadLocalGroups(listId);
        for (const groupId in groups) {
          const index = groups[groupId].taskIds.indexOf(taskId);
          if (index !== -1) {
            groups[groupId].taskIds.splice(index, 1);
          }
        }
        deleteEmptyGroups(listId, groups);
        saveLocalGroups(listId, groups);
      }

      // Limpar TODOS os grupos de uma lista ao excluí-la
      function cleanupGroupsForList(listId) {
        if (!listId) return;
        const allGroups = loadAllGroups();
        delete allGroups[listId];
        saveAllGroups(allGroups);
      }

      // Obter objeto de cor pelo nome
      function getColorObject(colorName) {
        return GROUP_COLORS.find(c => c.name === colorName) || GROUP_COLORS[0];
      }
      // ===== FIM TASK GROUPS =====

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
      const MAX_PHOTOS_PER_TASK = 4;
      const composerOverlayEl = ()=> document.querySelector('.composer-overlay');
      const confirmBackdrop = el('confirmBackdrop');
      const confirmTitle = el('confirmTitle');
      const confirmMessage = el('confirmMessage');
      const confirmCancel = el('confirmCancel');
      const confirmPrimary = el('confirmPrimary');
      const toastContainer = el('toastContainer');
      const hiddenPhotoInputs = {
        camera: createHiddenPhotoInput({ capture: 'environment' }),
        gallery: createHiddenPhotoInput({})
      };
      let activePhotoId = null;
      const pendingPhotoIdsByListTask = Object.create(null);
      const removedPhotoIdsByListTask = Object.create(null);

      function getPendingPhotoSet(listId, taskId, createIfMissing){
        if(!listId || !taskId){ return null; }
        let perList = pendingPhotoIdsByListTask[listId];
        if(!perList){
          if(!createIfMissing){ return null; }
          perList = Object.create(null);
          pendingPhotoIdsByListTask[listId] = perList;
        }
        let set = perList[taskId];
        if(!set){
          if(!createIfMissing){ return null; }
          set = new Set();
          perList[taskId] = set;
        }
        return set;
      }

      function cleanupPendingPhotoEntry(listId, taskId){
        if(!listId){ return; }
        const perList = pendingPhotoIdsByListTask[listId];
        if(!perList){ return; }
        if(taskId){
          const set = perList[taskId];
          if(set && set.size===0){ delete perList[taskId]; }
        }
        if(Object.keys(perList).length===0){ delete pendingPhotoIdsByListTask[listId]; }
      }

      function getRemovedPhotoSet(listId, taskId, createIfMissing){
        if(!listId || !taskId){ return null; }
        let perList = removedPhotoIdsByListTask[listId];
        if(!perList){
          if(!createIfMissing){ return null; }
          perList = Object.create(null);
          removedPhotoIdsByListTask[listId] = perList;
        }
        let set = perList[taskId];
        if(!set){
          if(!createIfMissing){ return null; }
          set = new Set();
          perList[taskId] = set;
        }
        return set;
      }

      function cleanupRemovedPhotoEntry(listId, taskId){
        if(!listId){ return; }
        const perList = removedPhotoIdsByListTask[listId];
        if(!perList){ return; }
        if(taskId){
          const set = perList[taskId];
          if(set && set.size===0){ delete perList[taskId]; }
        }
        if(Object.keys(perList).length===0){ delete removedPhotoIdsByListTask[listId]; }
      }

      function markRemovedPhoto(listId, taskId, photoId){
        if(!listId || !taskId || !photoId){ return; }
        const set = getRemovedPhotoSet(listId, taskId, true);
        if(!set){ return; }
        try{ set.add(String(photoId)); }
        catch(_){ }
      }

      function clearRemovedPhotos(listId, taskId, photoIds){
        if(!listId || !taskId){ return; }
        const perList = removedPhotoIdsByListTask[listId];
        if(!perList){ return; }
        const set = perList[taskId];
        if(!set){ return; }
        if(Array.isArray(photoIds) && photoIds.length){
          photoIds.forEach((id)=>{
            try{ set.delete(String(id)); }
            catch(_){ }
          });
        } else {
          try{ set.clear(); }
          catch(_){ Array.from(set).forEach((value)=> set.delete(value)); }
        }
        cleanupRemovedPhotoEntry(listId, taskId);
      }

      function clearRemovedPhotosForList(listId){
        if(!listId){ return; }
        if(removedPhotoIdsByListTask[listId]){
          delete removedPhotoIdsByListTask[listId];
        }
      }

      function reconcileRemovedPhotosForList(list){
        if(!list || !list.id){ return; }
        const perList = removedPhotoIdsByListTask[list.id];
        if(!perList){ return; }
        const validTaskIds = new Set((Array.isArray(list.tasks) ? list.tasks : [])
          .map((task)=> task && task.id)
          .filter(Boolean));
        Object.keys(perList).forEach((taskId)=>{
          if(!validTaskIds.has(taskId)){
            delete perList[taskId];
            return;
          }
          const set = perList[taskId];
          if(set && set.size===0){ delete perList[taskId]; }
        });
        if(Object.keys(perList).length===0){ delete removedPhotoIdsByListTask[list.id]; }
      }

      function markPendingPhotos(listId, taskId, photos){
        if(!listId || !taskId){ return; }
        if(!Array.isArray(photos) || photos.length===0){ return; }
        const ids = photos
          .map((photo)=>{
            if(!photo || !photo.id){ return null; }
            try{ return String(photo.id); }
            catch(_){ return null; }
          })
          .filter(Boolean);
        if(!ids.length){ return; }
        const set = getPendingPhotoSet(listId, taskId, true);
        if(!set){ return; }
        ids.forEach((id)=> set.add(id));
      }

      function clearPendingPhotos(listId, taskId, photoIds){
        if(!listId || !taskId){ return; }
        const perList = pendingPhotoIdsByListTask[listId];
        if(!perList){ return; }
        const set = perList[taskId];
        if(!set){ return; }
        if(Array.isArray(photoIds) && photoIds.length){
          photoIds.forEach((id)=>{
            try{ set.delete(String(id)); }
            catch(_){ }
          });
        } else {
          try{ set.clear(); }
          catch(_){ Array.from(set).forEach((value)=> set.delete(value)); }
        }
        cleanupPendingPhotoEntry(listId, taskId);
      }

      function clearPendingPhotosForList(listId){
        if(!listId){ return; }
        if(pendingPhotoIdsByListTask[listId]){
          delete pendingPhotoIdsByListTask[listId];
        }
      }

      function reconcilePendingPhotosForList(list){
        if(!list || !list.id){ return; }
        const perList = pendingPhotoIdsByListTask[list.id];
        if(!perList){ return; }
        const validTaskIds = new Set((Array.isArray(list.tasks) ? list.tasks : [])
          .map((task)=> task && task.id)
          .filter(Boolean));
        Object.keys(perList).forEach((taskId)=>{
          if(!validTaskIds.has(taskId)){
            delete perList[taskId];
            return;
          }
          const set = perList[taskId];
          if(set && set.size===0){ delete perList[taskId]; }
        });
        if(Object.keys(perList).length===0){ delete pendingPhotoIdsByListTask[list.id]; }
      }

      // interaction guards
      function preventNativeZoom(){
        const stop = (evt)=>{ try{ evt.preventDefault(); }catch(_){ } };
        try{
          document.addEventListener('gesturestart', stop);
          document.addEventListener('gesturechange', stop);
          document.addEventListener('gestureend', stop);
        }catch(_){ }
        try{
          window.addEventListener('wheel', (evt)=>{
            if(evt.ctrlKey){ evt.preventDefault(); }
          }, { passive:false });
        }catch(_){ }
        try{
          document.addEventListener('touchmove', (evt)=>{
            if(evt.touches && evt.touches.length>1){ evt.preventDefault(); }
          }, { passive:false });
        }catch(_){ }
      }

      const SCREEN_KEYS = Object.freeze({
        LISTS: 'lists',
        LIST_DETAIL: 'listDetail',
        TASK_DETAIL: 'taskDetail'
      });
      let ignoreNextPopState = false;
      let exitPromptOpen = false;

      function pushHistoryState(screen, data){
        try{
          if(!window.history || !window.history.pushState){ return; }
          const state = Object.assign({ screen }, data||{});
          if(screen===SCREEN_KEYS.LISTS && typeof state.isRoot==='undefined'){
            state.isRoot = false;
          }
          window.history.pushState(state, document.title);
        }catch(_){ }
      }

      function replaceHistoryState(screen, data){
        try{
          if(!window.history || !window.history.replaceState){ return; }
          const state = Object.assign({ screen }, data||{});
          window.history.replaceState(state, document.title);
        }catch(_){ }
      }

      function restoreRootGuard(){
        pushHistoryState(SCREEN_KEYS.LISTS, { isRoot:false });
        currentTaskId = null;
        currentListId = null;
        hideComposer();
        showScreen(screenLists);
        renderLists();
      }

      async function handleExitAttempt(){
        if(exitPromptOpen){
          return;
        }
        exitPromptOpen = true;
        const shouldExit = await showConfirmDialog({
          title: 'Sair do aplicativo',
          message: 'Gostaria de sair?',
          confirmText: 'Sair',
          cancelText: 'Cancelar'
        });
        exitPromptOpen = false;
        if(shouldExit){
          ignoreNextPopState = true;
          try{ window.close(); }catch(_){ }
          try{ window.history.back(); }catch(_){ }
        } else {
          restoreRootGuard();
        }
      }

      function applyStateFromHistory(state){
        if(!state || !state.screen){
          restoreRootGuard();
          return;
        }
        switch(state.screen){
          case SCREEN_KEYS.LISTS:
            currentTaskId = null;
            currentListId = null;
            hideComposer();
            showScreen(screenLists);
            renderLists();
            break;
          case SCREEN_KEYS.LIST_DETAIL:
            if(state.listId && lists.some(l=>l.id===state.listId)){
              openList(state.listId, { fromHistory:true });
            } else {
              currentListId = null;
              currentTaskId = null;
              hideComposer();
              showScreen(screenLists);
              renderLists();
            }
            break;
          case SCREEN_KEYS.TASK_DETAIL:
            if(state.listId && lists.some(l=>l.id===state.listId)){
              currentListId = state.listId;
              openTaskDetail(state.taskId, { fromHistory:true });
            } else {
              currentListId = null;
              currentTaskId = null;
              hideComposer();
              showScreen(screenLists);
              renderLists();
            }
            break;
          default:
            currentListId = null;
            currentTaskId = null;
            hideComposer();
            showScreen(screenLists);
            renderLists();
        }
      }

      function handlePopState(event){
        if(ignoreNextPopState){
          ignoreNextPopState = false;
          return;
        }
        const state = event.state;
        if(state && state.screen){
          if(state.screen===SCREEN_KEYS.LISTS && state.isRoot){
            handleExitAttempt();
            return;
          }
          applyStateFromHistory(state);
        } else {
          handleExitAttempt();
        }
      }

      function initHistory(){
        try{
          if(!window.history || !window.history.replaceState){ return; }
          const initialState = window.history.state;
          if(!initialState || !initialState.screen){
            replaceHistoryState(SCREEN_KEYS.LISTS, { isRoot:true });
            pushHistoryState(SCREEN_KEYS.LISTS, { isRoot:false });
          } else if(initialState.screen===SCREEN_KEYS.LISTS && initialState.isRoot){
            pushHistoryState(SCREEN_KEYS.LISTS, { isRoot:false });
          }
        }catch(_){ }
      }

      // Code modal elements
      const codeBackdrop = el('codeBackdrop');
      const codeCancel = el('codeCancel');
      const codeImport = el('codeImport');
      let codeInputs = [];

      const taskDetailRow = el('taskDetailRow');
      const taskDetailCheckbox = el('taskDetailCheckbox');
      const taskDetailText = el('taskDetailText');
      const taskPhotoGrid = el('taskPhotoGrid');
      const photoLightbox = el('photoLightbox');
      const photoLightboxImage = el('photoLightboxImage');
      const photoLightboxClose = photoLightbox ? photoLightbox.querySelector('.photo-lightbox-btn.close') : null;
      const photoLightboxDelete = photoLightbox ? photoLightbox.querySelector('.photo-lightbox-btn.delete') : null;
      const cameraPhotoButton = document.querySelector('.task-media-footer .photo-action.primary');
      const galleryPhotoButton = document.querySelector('.task-media-footer .photo-action:not(.primary)');
      const taskPhotoGridEmpty = taskPhotoGrid ? taskPhotoGrid.querySelector('.photo-grid-empty') : null;

      // helpers
      let isMenuOpen = false;
      let activeShareCode = '';
      let copyFeedbackTimer = null;
      let confirmResolver = null;
      // Sync helpers
      let syncTimers = Object.create(null);
      let liveSubscriptions = Object.create(null);
      let realtimeRetryTimers = Object.create(null);

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
            let published = false;
            try{
              const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
              list._lastPushedAt = Date.now();
              const payload = buildSyncPayload(list);
              await window.firebaseShareList(code, payload);
              published = true;
            }catch(e){ /* ignore sync errors */ }
            finally{
              if(published){
                clearPendingPhotosForList(listId);
                clearRemovedPhotosForList(listId);
              }
              syncTimers[listId] = null;
            }
          }, wait);
        }catch(_){ }
      }

      function startRealtimeForList(listId){
        try{
          const list = lists.find(x=>x.id===listId);
          if(!list) return;
          const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
          if(!code || code.length!==6) return;
          const subscribeFn = (typeof window !== 'undefined') ? window.firebaseSubscribe : null;
          if(typeof subscribeFn !== 'function'){
            if(!realtimeRetryTimers[listId]){
              realtimeRetryTimers[listId] = setTimeout(()=>{
                realtimeRetryTimers[listId] = null;
                startRealtimeForList(listId);
              }, 180);
            }
            return;
          }
          if(liveSubscriptions[listId]) return; // já inscrito
          subscribeFn(code, (remote)=>{
            if(!remote) return;
            const pushedAt = list._lastPushedAt || 0;
            const remoteAt = (remote && remote.updatedAt) ? Number(remote.updatedAt) : 0;
            if(remoteAt && pushedAt && Math.abs(remoteAt - pushedAt) < 600){ return; }
            const newTitle = remote.title || 'Lista';
            const incoming = Array.isArray(remote.tasks)
              ? remote.tasks.map((task)=> normalizeIncomingTaskData(task))
              : [];
            // Preservar ordenação local por usuário: ordenar incoming por ranking local quando existir
            const localRank = getLocalOrderForList(list.id);
            const incomingActive = incoming.filter(t=>!t.done);
            const incomingDone = incoming.filter(t=>t.done);
            const keysActive = buildTaskKeys(incomingActive);
            const keysDone = buildTaskKeys(incomingDone);
            const indexedActive = incomingActive.map((t, idx)=>({ t, key: keysActive[idx], idx }));
            const indexedDone = incomingDone.map((t, idx)=>({ t, key: keysDone[idx], idx }));
            const sorter = (a,b)=>{
              const ra = localRank[a.key];
              const rb = localRank[b.key];
              if(ra!=null && rb!=null){ return ra - rb; }
              if(ra!=null) return -1;
              if(rb!=null) return 1;
              return a.idx - b.idx;
            };
            indexedActive.sort(sorter);
            indexedDone.sort(sorter);
            const orderedIncoming = [
              ...indexedActive.map((x)=> x.t),
              ...indexedDone.map((x)=> x.t)
            ];
            const mergedTasks = mergeIncomingTasks(list, orderedIncoming);
            list.title = newTitle;
            list.tasks = mergedTasks;
            reconcilePendingPhotosForList(list);
            reconcileRemovedPhotosForList(list);
            updateLocalOrderForList(list.id);
            saveState();
            renderLists();
            if(currentListId === list.id){
              currentListName.textContent = list.title;
              renderTasks();
              const activeScreen = [screenTaskDetail, screenListDetail, screenLists]
                .find((screen)=>screen && screen.classList && screen.classList.contains('active'))
                || screenLists;
              updateAppBar(activeScreen);
            }
          });
          liveSubscriptions[listId] = code;
          if(realtimeRetryTimers[listId]){
            clearTimeout(realtimeRetryTimers[listId]);
            delete realtimeRetryTimers[listId];
          }
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
          if(realtimeRetryTimers[listId]){
            clearTimeout(realtimeRetryTimers[listId]);
            delete realtimeRetryTimers[listId];
          }
        }catch(_){ }
      }

      function startRealtimeForExistingLists(){
        try{
          (lists||[]).forEach((l)=>{
            if(!l) return;
            const normalized = String(l.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase();
            if(normalized.length===6){
              startRealtimeForList(l.id);
            }
          });
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

      function isAnotherOverlayActive(){
        return (modalBackdrop && modalBackdrop.classList.contains('show')) ||
          (codeBackdrop && codeBackdrop.classList.contains('show')) ||
          (shareBackdrop && shareBackdrop.classList.contains('show'));
      }

      function hideConfirmBackdrop(){
        if(!confirmBackdrop) return;
        confirmBackdrop.classList.remove('show');
        confirmBackdrop.style.display='none';
        if(!isAnotherOverlayActive()){
          unlockScroll();
        }
      }

      function settleConfirm(result){
        if(typeof result === 'undefined'){ result = false; }
        if(confirmResolver){
          const resolver = confirmResolver;
          confirmResolver = null;
          hideConfirmBackdrop();
          try{ resolver(!!result); }catch(_){ }
        } else {
          hideConfirmBackdrop();
        }
      }

      function showConfirmDialog(options){
        const defaults = { title: 'Confirmar ação', message: '', confirmText: 'Confirmar', cancelText: 'Cancelar' };
        const config = Object.assign({}, defaults, options||{});
        if(!confirmBackdrop || !confirmMessage || !confirmPrimary || !confirmCancel){
          return Promise.resolve(window.confirm(config.message));
        }
        if(confirmResolver){ settleConfirm(false); }
        confirmTitle.textContent = config.title;
        confirmMessage.textContent = config.message;
        confirmPrimary.textContent = config.confirmText;
        confirmCancel.textContent = config.cancelText;
        confirmBackdrop.style.display='flex';
        confirmBackdrop.classList.add('show');
        lockScroll();
        return new Promise((resolve)=>{
          confirmResolver = resolve;
          setTimeout(()=>{
            try{ confirmPrimary.focus(); }catch(_){ }
          }, 30);
        });
      }

      if(confirmCancel){ confirmCancel.addEventListener('click', ()=>{ settleConfirm(false); }); }
      if(confirmPrimary){ confirmPrimary.addEventListener('click', ()=>{ settleConfirm(true); }); }
      if(confirmBackdrop){
        confirmBackdrop.addEventListener('click', (evt)=>{
          if(evt.target===confirmBackdrop){ settleConfirm(false); }
        });
      }

      function showToast(message, opts){
        if(!toastContainer){ return; }
        const options = Object.assign({ type: 'info', duration: 3200 }, opts||{});
        const toast = document.createElement('div');
        const typeClass = (options.type==='error') ? ' error' : (options.type==='success') ? ' success' : '';
        toast.className = 'toast'+typeClass;
        toast.setAttribute('role','status');
        toast.textContent = message;
        toastContainer.appendChild(toast);
        requestAnimationFrame(()=>{ toast.classList.add('show'); });
        const remove = ()=>{
          toast.classList.remove('show');
          setTimeout(()=>{ if(toast.parentNode){ toast.parentNode.removeChild(toast); } }, 180);
        };
        const timeout = Math.max(1500, Number(options.duration)||3200);
        const timer = setTimeout(remove, timeout);
        toast.addEventListener('click', ()=>{
          clearTimeout(timer);
          remove();
        });
      }

      function createHiddenPhotoInput(options){
        try{
          if(typeof document === 'undefined'){ return null; }
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.style.display = 'none';
          input.tabIndex = -1;
          if(options && options.capture){
            input.setAttribute('capture', options.capture);
          }
          document.body.appendChild(input);
          input.addEventListener('change', handlePhotoInputChange);
          return input;
        }catch(error){
          console.error('Não foi possível criar input oculto de foto.', error);
          return null;
        }
      }

      function getCurrentTask(){
        if(!currentListId || !currentTaskId) return null;
        const list = lists.find((x)=>x && x.id===currentListId);
        if(!list || !Array.isArray(list.tasks)) return null;
        return list.tasks.find((t)=>t && t.id===currentTaskId) || null;
      }

      function updatePhotoActionState(task){
        const photos = task && Array.isArray(task.photos) ? task.photos : [];
        const remaining = Math.max(0, MAX_PHOTOS_PER_TASK - photos.length);
        const disable = remaining <= 0;
        [cameraPhotoButton, galleryPhotoButton].forEach((btn)=>{
          if(!btn) return;
          btn.disabled = disable;
          btn.setAttribute('aria-disabled', disable ? 'true' : 'false');
          btn.title = disable ? 'Limite de 4 fotos por tarefa atingido' : '';
        });
        if(taskPhotoGrid){
          taskPhotoGrid.dataset.remaining = String(remaining);
        }
        if(taskPhotoGridEmpty){
          taskPhotoGridEmpty.style.display = photos.length ? 'none' : '';
        }
      }

      function renderTaskPhotos(task){
        if(!taskPhotoGrid) return;
        const photos = task && Array.isArray(task.photos) ? task.photos : [];
        taskPhotoGrid.querySelectorAll('.photo-grid-item').forEach((node)=> node.remove());
        if(!photos.length){
          if(taskPhotoGridEmpty){ taskPhotoGridEmpty.style.display = ''; }
          return;
        }
        if(taskPhotoGridEmpty){ taskPhotoGridEmpty.style.display = 'none'; }
        photos.forEach((photo)=>{
          if(!photo || !photo.dataUrl) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'photo-grid-item';
          button.dataset.photoId = photo.id;
          button.setAttribute('aria-label', 'Abrir foto em tela cheia');
          button.setAttribute('role', 'listitem');
          const img = document.createElement('img');
          img.src = photo.dataUrl;
          img.alt = 'Foto da tarefa';
          button.appendChild(img);
          button.addEventListener('click', ()=> openPhotoLightbox(photo.id));
          taskPhotoGrid.appendChild(button);
        });
      }

      function openPhotoPicker(kind){
        const task = getCurrentTask();
        if(!task){
          showToast('Abra uma tarefa para adicionar fotos.', { type: 'error' });
          return;
        }
        ensureTaskStructure(task);
        if(Array.isArray(task.photos) && task.photos.length >= MAX_PHOTOS_PER_TASK){
          updatePhotoActionState(task);
          showToast('Limite de 4 fotos por tarefa atingido.', { type: 'error' });
          return;
        }
        const input = hiddenPhotoInputs ? hiddenPhotoInputs[kind] : null;
        if(input){
          try{ input.value=''; }catch(_){ }
          input.click();
        } else {
          showToast('Não foi possível abrir a seleção de fotos.', { type: 'error' });
        }
      }

      function openPhotoLightbox(photoId){
        if(!photoLightbox || !photoLightboxImage){ return; }
        const task = getCurrentTask();
        if(!task){ return; }
        const photo = (task.photos || []).find((p)=>p && p.id===photoId);
        if(!photo){ return; }
        activePhotoId = photoId;
        photoLightboxImage.src = photo.dataUrl;
        photoLightbox.removeAttribute('hidden');
        photoLightbox.setAttribute('aria-hidden', 'false');
        photoLightbox.classList.add('show');
        if(!isAnotherOverlayActive()){ lockScroll(); }
      }

      function closePhotoLightbox(options){
        if(!photoLightbox){ return; }
        const opts = Object.assign({ skipPersist:false }, options||{});
        photoLightbox.classList.remove('show');
        photoLightbox.setAttribute('aria-hidden', 'true');
        photoLightbox.setAttribute('hidden', 'true');
        if(photoLightboxImage){ photoLightboxImage.src = ''; }
        activePhotoId = null;
        if(!isAnotherOverlayActive()){ unlockScroll(); }
        const task = getCurrentTask();
        if(task){
          updatePhotoActionState(task);
          if(!opts.skipPersist){
            ensureTaskStructure(task);
            saveState();
            requestSync(currentListId);
          }
        }
      }

      function deleteActivePhoto(){
        if(!currentListId || !currentTaskId || !activePhotoId) return;
        const list = lists.find((x)=>x && x.id===currentListId);
        if(!list || !Array.isArray(list.tasks)) return;
        const task = list.tasks.find((t)=>t && t.id===currentTaskId);
        if(!task || !Array.isArray(task.photos)) return;
        const idx = task.photos.findIndex((p)=>p && p.id===activePhotoId);
        if(idx===-1) return;
        task.photos.splice(idx, 1);
        clearPendingPhotos(list.id, task.id, [activePhotoId]);
        markRemovedPhoto(list.id, task.id, activePhotoId);
        ensureTaskStructure(task);
        renderTaskPhotos(task);
        updatePhotoActionState(task);
        saveState();
        requestSync(list.id);
        showToast('Foto removida.', { type: 'info' });
        closePhotoLightbox({ skipPersist:true });
      }

      async function handlePhotoInputChange(event){
        const input = event && event.target;
        const files = input && input.files ? Array.from(input.files) : [];
        if(input){ input.value=''; }
        if(!files.length){ return; }
        try{
          await addPhotosToCurrentTask(files);
        }catch(error){
          console.error('Erro ao adicionar fotos à tarefa', error);
          showToast('Não foi possível adicionar as fotos selecionadas.', { type: 'error' });
        }
      }

      async function addPhotosToCurrentTask(files){
        const task = getCurrentTask();
        if(!task){
          showToast('Abra uma tarefa para adicionar fotos.', { type: 'error' });
          return;
        }
        ensureTaskStructure(task);
        const currentCount = Array.isArray(task.photos) ? task.photos.length : 0;
        const availableSlots = Math.max(0, MAX_PHOTOS_PER_TASK - currentCount);
        if(availableSlots <= 0){
          updatePhotoActionState(task);
          showToast('Limite de 4 fotos por tarefa atingido.', { type: 'error' });
          return;
        }
        const filesToProcess = files.slice(0, availableSlots);
        const newPhotos = [];
        const previousIds = new Set((Array.isArray(task.photos) ? task.photos : [])
          .map((photo)=> (photo && photo.id ? String(photo.id) : null))
          .filter(Boolean));
        for(const file of filesToProcess){
          try{
            const dataUrl = await compressImageFile(file);
            if(!dataUrl){ throw new Error('compressão inválida'); }
            newPhotos.push({ id: createPhotoId(), dataUrl, createdAt: Date.now() });
          }catch(error){
            console.error('Erro ao comprimir imagem selecionada', error);
            showToast('Não foi possível adicionar a foto selecionada.', { type: 'error' });
          }
        }
        if(newPhotos.length){
          task.photos = (task.photos || []).concat(newPhotos).slice(0, MAX_PHOTOS_PER_TASK);
          ensureTaskStructure(task);
          const addedPhotos = (task.photos || [])
            .filter((photo)=> photo && !previousIds.has(String(photo.id)));
          markPendingPhotos(currentListId, task.id, addedPhotos);
          renderTaskPhotos(task);
          saveState();
          requestSync(currentListId);
        }
        updatePhotoActionState(task);
        if(files.length > filesToProcess.length){
          showToast('Algumas fotos não foram adicionadas (limite de 4 por tarefa).', { type: 'info' });
        }
      }

      async function compressImageFile(file){
        if(!file){ throw new Error('Arquivo inválido'); }
        const maxDimension = 1280;
        const quality = 0.82;
        let bitmap = null;
        if(typeof createImageBitmap === 'function'){
          try{ bitmap = await createImageBitmap(file); }
          catch(_){ bitmap = null; }
        }
        let width = bitmap ? bitmap.width : 0;
        let height = bitmap ? bitmap.height : 0;
        let imageElement = null;
        if(!bitmap){
          const dataUrl = await new Promise((resolve, reject)=>{
            const reader = new FileReader();
            reader.onload = ()=> resolve(reader.result);
            reader.onerror = ()=> reject(new Error('Erro ao ler arquivo de imagem'));
            try{ reader.readAsDataURL(file); }
            catch(e){ reject(e); }
          });
          imageElement = await new Promise((resolve, reject)=>{
            const img = new Image();
            img.onload = ()=> resolve(img);
            img.onerror = ()=> reject(new Error('Erro ao carregar imagem'));
            img.src = dataUrl;
          });
          width = imageElement.naturalWidth || imageElement.width;
          height = imageElement.naturalHeight || imageElement.height;
        }
        if(!width || !height){
          if(bitmap && typeof bitmap.close === 'function'){ bitmap.close(); }
          throw new Error('Dimensões inválidas para imagem');
        }
        const largestSide = Math.max(width, height);
        const scale = largestSide > maxDimension ? (maxDimension / largestSide) : 1;
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        let ctx = null;
        try{ ctx = canvas.getContext('2d', { alpha: false }); }
        catch(_){ ctx = null; }
        if(!ctx){ ctx = canvas.getContext('2d'); }
        if(!ctx){
          if(bitmap && typeof bitmap.close === 'function'){ bitmap.close(); }
          throw new Error('Canvas não suportado');
        }
        if(bitmap){
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          if(typeof bitmap.close === 'function'){ bitmap.close(); }
        } else if(imageElement){
          ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
        }
        try{
          return canvas.toDataURL('image/jpeg', quality);
        }catch(error){
          throw new Error('Não foi possível gerar imagem comprimida');
        }
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
          appTitle.hidden = false;
          appTitle.textContent = DEFAULT_TITLE;
          btnNewList.hidden = false;
          if(appSubtitle){ appSubtitle.hidden = false; }
          if(btnImportCode){ btnImportCode.style.display = ""; }
          setAppMenuVisibility(false);
        } else if(activeScreen===screenListDetail){
          globalBackBtn.hidden = false;
          appTitle.hidden = true;
          appTitle.textContent = '';
          btnNewList.hidden = true;
          if(appSubtitle){ appSubtitle.hidden = true; }
          if(btnImportCode){ btnImportCode.style.display = "none"; }
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
          if(btnImportCode){ btnImportCode.style.display = "none"; }
          setAppMenuVisibility(false);
        }
      }

      function createPhotoId(){
        return 'p_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 8);
      }

      function ensureTaskStructure(task){
        if(!task || typeof task !== 'object'){ return; }
        if(!task.id){ task.id = 't_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 8); }
        if(typeof task.text !== 'string'){ task.text = ''; }
        task.done = !!task.done;
        const normalizedPhotos = [];
        if(Array.isArray(task.photos)){
          const ids = new Set();
          task.photos.forEach((photo)=>{
            if(!photo || typeof photo.dataUrl !== 'string'){ return; }
            const dataUrl = String(photo.dataUrl || '');
            if(!dataUrl){ return; }
            let id = photo.id ? String(photo.id) : createPhotoId();
            while(ids.has(id)){ id = createPhotoId(); }
            const createdAtNum = Number(photo.createdAt);
            normalizedPhotos.push({
              id,
              dataUrl,
              createdAt: Number.isFinite(createdAtNum) ? createdAtNum : Date.now()
            });
            ids.add(id);
          });
        }
        task.photos = normalizedPhotos.slice(0, MAX_PHOTOS_PER_TASK);
      }

      function sanitizePhotoArrayForMerge(photos){
        const tmpTask = { id: 'tmp', text: '', done: false, photos: Array.isArray(photos) ? photos : [] };
        ensureTaskStructure(tmpTask);
        return tmpTask.photos.map((photo)=>({ id: photo.id, dataUrl: photo.dataUrl, createdAt: photo.createdAt }));
      }

      function mergePhotoArrays(listId, taskId, remotePhotos, localPhotos){
        const remoteList = sanitizePhotoArrayForMerge(remotePhotos);
        const localList = sanitizePhotoArrayForMerge(localPhotos);
        const combined = [];
        const seen = new Set();
        const pendingSet = (listId && taskId)
          ? getPendingPhotoSet(listId, taskId, false)
          : null;
        const removedSet = (listId && taskId)
          ? getRemovedPhotoSet(listId, taskId, false)
          : null;
        const filteredRemote = removedSet
          ? remoteList.filter((photo)=> photo && !removedSet.has(photo.id))
          : remoteList;
        filteredRemote.forEach((photo)=>{
          if(photo && !seen.has(photo.id)){
            combined.push(photo);
            seen.add(photo.id);
            if(pendingSet){ pendingSet.delete(photo.id); }
          }
        });
        if(pendingSet){
          if(pendingSet.size){
            localList.forEach((photo)=>{
              if(photo && pendingSet.has(photo.id) && !seen.has(photo.id)){
                combined.push(photo);
                seen.add(photo.id);
              }
            });
            const availableLocalIds = new Set(localList.map((photo)=> photo.id));
            const toRemove = [];
            pendingSet.forEach((id)=>{
              if(!availableLocalIds.has(id)){
                toRemove.push(id);
              }
            });
            if(toRemove.length){ toRemove.forEach((id)=> pendingSet.delete(id)); }
          }
          cleanupPendingPhotoEntry(listId, taskId);
          if(removedSet && filteredRemote.length){
            filteredRemote.forEach((photo)=>{ try{ removedSet.delete(photo.id); }catch(_){ } });
            cleanupRemovedPhotoEntry(listId, taskId);
          }
        } else {
          localList.forEach((photo)=>{
            if(photo && !seen.has(photo.id)){
              combined.push(photo);
              seen.add(photo.id);
            }
          });
        }
        if(removedSet && !filteredRemote.length){ cleanupRemovedPhotoEntry(listId, taskId); }
        return combined.slice(0, MAX_PHOTOS_PER_TASK);
      }

      function normalizeIncomingTaskData(task){
        return {
          text: task && typeof task.text === 'string' ? task.text : '',
          done: !!(task && task.done),
          photos: sanitizePhotoArrayForMerge(task && task.photos)
        };
      }

      function mergeIncomingTasks(list, incomingTasks){
        const result = [];
        const localTasks = Array.isArray(list && list.tasks) ? list.tasks.slice() : [];
        const localKeys = buildTaskKeys(localTasks);
        const buckets = Object.create(null);
        localTasks.forEach((task, idx)=>{
          const key = localKeys[idx];
          if(!buckets[key]){ buckets[key] = []; }
          buckets[key].push(task);
        });
        const incomingKeys = buildTaskKeys(incomingTasks);
        const baseTs = Date.now();
        incomingTasks.forEach((incomingTask, idx)=>{
          const key = incomingKeys[idx];
          const bucket = buckets[key];
          const localTask = bucket && bucket.length ? bucket.shift() : null;
          if(localTask){
            localTask.text = incomingTask.text;
            localTask.done = incomingTask.done;
            localTask.photos = mergePhotoArrays(list && list.id, localTask.id, incomingTask.photos, localTask.photos);
            ensureTaskStructure(localTask);
            result.push(localTask);
          } else {
            const newTaskId = 't_'+baseTs+'_'+idx;
            const mergedPhotos = mergePhotoArrays(list && list.id, newTaskId, incomingTask.photos, []);
            const newTask = {
              id: newTaskId,
              text: incomingTask.text,
              done: incomingTask.done,
              photos: mergedPhotos
            };
            ensureTaskStructure(newTask);
            result.push(newTask);
          }
        });
        return result;
      }

      function buildSyncPayload(list){
        const title = list && typeof list.title === 'string' ? list.title : 'Lista';
        const sourceTasks = Array.isArray(list && list.tasks) ? list.tasks : [];
        const tasks = sourceTasks.map((task)=>{
          ensureTaskStructure(task);
          return {
            text: typeof task.text === 'string' ? task.text : '',
            done: !!task.done,
            photos: sanitizePhotoArrayForMerge(task.photos)
          };
        });
        return { title, tasks };
      }

      function ensureListsStructure(){
        if(!Array.isArray(lists)){ lists = []; return; }
        lists.forEach((list)=>{
          if(!list || typeof list !== 'object'){ return; }
          if(!Array.isArray(list.tasks)){ list.tasks = []; return; }
          list.tasks.forEach((task)=> ensureTaskStructure(task));
        });
      }

      function saveState(){
        ensureListsStructure();
        localStorage.setItem('todo_lists_v3', JSON.stringify(lists));
      }

      function loadState(){
        try{
          const raw = localStorage.getItem('todo_lists_v3');
          if(raw){
            const parsed = JSON.parse(raw);
            lists = Array.isArray(parsed) ? parsed : [];
          }
        }catch(e){
          lists = [];
        }
        ensureListsStructure();
      }

      // Persistência de ordenação local (por dispositivo/usuário)
      function saveLocalOrderState(){
        try{ localStorage.setItem(LOCAL_ORDER_STORAGE_KEY, JSON.stringify(localOrderByList)); }
        catch(_){ }
      }
      function loadLocalOrderState(){
        try{
          const raw = localStorage.getItem(LOCAL_ORDER_STORAGE_KEY);
          localOrderByList = raw ? (JSON.parse(raw) || {}) : {};
          if(typeof localOrderByList !== 'object' || Array.isArray(localOrderByList)){
            localOrderByList = {};
          }
        }catch(_){ localOrderByList = {}; }
      }
      function getLocalOrderForList(listId){
        if(!listId) return {};
        const map = localOrderByList[listId];
        return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
      }
      function setLocalOrderForList(listId, map){
        if(!listId) return;
        if(!localOrderByList || typeof localOrderByList !== 'object'){ localOrderByList = {}; }
        localOrderByList[listId] = map || {};
        saveLocalOrderState();
      }
      function removeLocalOrderState(listId){
        if(!listId) return;
        if(localOrderByList && Object.prototype.hasOwnProperty.call(localOrderByList, listId)){
          delete localOrderByList[listId];
          saveLocalOrderState();
        }
      }
      function normalizeTextKey(text){
        try{ return String(text||'').trim(); }catch(_){ return ''; }
      }
      function buildTaskKeys(tasks){
        const counterByKey = Object.create(null);
        return (tasks||[]).map((t)=>{
          const base = (t && t.done ? '1' : '0') + '|' + normalizeTextKey(t && t.text);
          const count = (counterByKey[base]||0) + 1;
          counterByKey[base] = count;
          return base + '|' + count; // chave composta com índice de ocorrência
        });
      }
      function updateLocalOrderForList(listId){
        const list = lists.find(x=>x && x.id===listId); if(!list) return;
        const keys = buildTaskKeys(list.tasks||[]);
        const map = {};
        for(let i=0;i<keys.length;i++){ map[keys[i]] = (i+1); }
        setLocalOrderForList(listId, map);
      }

      function saveCompletedCollapseState(){
        try{ localStorage.setItem(COMPLETED_COLLAPSE_STORAGE_KEY, JSON.stringify(completedCollapseByList)); }
        catch(_){ }
      }

      function loadCompletedCollapseState(){
        try{
          const raw = localStorage.getItem(COMPLETED_COLLAPSE_STORAGE_KEY);
          if(!raw){ completedCollapseByList = {}; return; }
          const parsed = JSON.parse(raw);
          completedCollapseByList = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        }catch(_){
          completedCollapseByList = {};
        }
      }

      function getCompletedCollapseForList(listId){
        if(!listId) return false;
        return !!completedCollapseByList[listId];
      }

      function setCompletedCollapseForList(listId, collapsed){
        if(!listId) return;
        if(collapsed){
          completedCollapseByList[listId] = true;
        } else {
          delete completedCollapseByList[listId];
        }
        saveCompletedCollapseState();
      }

      function removeCompletedCollapseState(listId){
        if(!listId) return;
        if(Object.prototype.hasOwnProperty.call(completedCollapseByList, listId)){
          delete completedCollapseByList[listId];
          saveCompletedCollapseState();
        }
      }

      function hideAppMenu(){
        if(!isMenuOpen) return;
        appMenu.hidden = true;
        appMenuBtn.setAttribute('aria-expanded','false');
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

      async function openShareDialog(){
        if(!currentListId) return;
        const list = lists.find(x=>x.id===currentListId);
        if(list && list.imported){ return; }
        let needsSharing = false;
        
        if(list && list.shareCode){
          activeShareCode = String(list.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
        } else {
          activeShareCode = generateShareCode();
          if(list){ list.shareCode = activeShareCode; saveState(); }
          needsSharing = true;
          if(list){ startRealtimeForList(list.id); }
        }
        
        // Compartilhar com Firebase ao abrir o modal
        if(needsSharing && list && typeof window !== 'undefined' && typeof window.firebaseShareList === 'function'){
          try {
            shareCopyFeedback.textContent='Compartilhando lista...';
            shareCopyFeedback.classList.remove('error');
            await window.firebaseShareList(activeShareCode, { title: list.title, tasks: list.tasks });
            list.shareCreated = true;
            saveState();
            shareCopyFeedback.textContent='Lista compartilhada com sucesso!';
          } catch(err) {
            // Falha ao compartilhar, mas continua mostrando o diálogo
            console.error('Erro ao compartilhar:', err);
            shareCopyFeedback.textContent='Erro ao compartilhar a lista';
            shareCopyFeedback.classList.add('error');
          }
        }
        
        shareCodeValue.textContent = formatDisplayCode(activeShareCode);
        if(!shareCopyFeedback.textContent) {
          shareCopyFeedback.textContent='';
          shareCopyFeedback.classList.remove('error');
        }
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
        }, 3000);
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
        
        const onCopyOk = ()=> {
          const list = lists.find(x=>x.id===currentListId);
          const isNewlyShared = list && list.shareCreated === true;
          notifyCopyFeedback('Código copiado!', false);
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
          card.dataset.id = l.id; // Atributo data para sorting
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
        
        // Inicializar sortable para as listas após renderização
        initSortableLists();
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

      function updateCodeImportState(){
        try{
          if(!codeImport){ return; }
          if(!codeInputs || codeInputs.length===0){
            codeImport.disabled = true;
            return;
          }
          const filled = codeInputs.every(input=> (input.value||'').trim().length===1);
          codeImport.disabled = !filled;
        }catch(_){
          if(codeImport){ codeImport.disabled = true; }
        }
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
              updateCodeImportState();
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
              updateCodeImportState();
            });
          });
        } else {
          codeInputs.forEach(i=>i.value='');
        }
        updateCodeImportState();
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

      function openList(id, options){
        const opts = Object.assign({ fromHistory:false }, options||{});
        currentListId = id;
        const list = lists.find(x=>x.id===id);
        currentListName.textContent = list ? list.title : 'Lista';
        renderTasks();
        // ensure composer closed when opening
        hideComposer();
        showScreen(screenListDetail);
        if(!opts.fromHistory){
          pushHistoryState(SCREEN_KEYS.LIST_DETAIL, { listId: id });
        }
      }

      function openTaskDetail(taskId, options){
        const opts = Object.assign({ fromHistory:false }, options||{});
        currentTaskId = taskId;
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        const task = list.tasks.find(t=>t.id===taskId);
        if(!task) return;
        ensureTaskStructure(task);
        renderTaskPhotos(task);
        updatePhotoActionState(task);
        closePhotoLightbox({ skipPersist:true });
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
        if(opts.fromHistory){
          renderTasks();
        }
        if(!opts.fromHistory){
          pushHistoryState(SCREEN_KEYS.TASK_DETAIL, { listId: currentListId, taskId });
        }
      }

      function placeCaretAtEnd(el){
        if(!el) return;
        const range = document.createRange(); const sel = window.getSelection(); range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
      }

      // Renderizar tarefas com suporte a agrupamento visual
      function renderTasksWithGroups(tasks, container, groups, isDone) {
        // Criar mapa de taskId -> groupId
        const taskToGroup = {};
        for (const [groupId, group] of Object.entries(groups)) {
          if (group.taskIds) {
            group.taskIds.forEach(taskId => {
              taskToGroup[taskId] = groupId;
            });
          }
        }

        // Agrupar tarefas
        const groupedTasks = {}; // groupId -> [tasks]
        const ungroupedTasks = [];

        tasks.forEach(task => {
          const groupId = taskToGroup[task.id];
          if (groupId) {
            if (!groupedTasks[groupId]) {
              groupedTasks[groupId] = [];
            }
            groupedTasks[groupId].push(task);
          } else {
            ungroupedTasks.push(task);
          }
        });

        // Função auxiliar para criar um elemento de tarefa
        function createTaskElement(t, isDone) {
          const node = document.createElement('div');
          node.className = isDone ? 'task done' : 'task';
          node.dataset.id = t.id;

          const cb = document.createElement('button');
          if (isDone) {
            cb.className = 'checkbox-round checked';
            cb.setAttribute('aria-pressed', 'true');
            cb.title = 'Desmarcar';
            cb.innerHTML = '✓';
            cb.addEventListener('click', (ev) => { ev.stopPropagation(); animateAndToggle(cb, t.id, false); });
          } else {
            cb.className = 'checkbox-round';
            cb.setAttribute('aria-pressed', 'false');
            cb.title = 'Marcar como concluída';
            cb.addEventListener('click', (ev) => { ev.stopPropagation(); animateAndToggle(cb, t.id, true); });
          }

          const txt = document.createElement('div');
          txt.className = 'text';
          txt.textContent = t.text;
          txt.addEventListener('click', (ev) => { ev.stopPropagation(); openTaskDetail(t.id); });

          node.appendChild(cb);
          node.appendChild(txt);
          return node;
        }

        // Renderizar na ordem: grupos primeiro, depois tarefas sem grupo
        // Manter ordem original das tarefas
        const processedTasks = new Set();

        tasks.forEach(task => {
          if (processedTasks.has(task.id)) return;

          const groupId = taskToGroup[task.id];
          if (groupId && groupedTasks[groupId]) {
            // Renderizar grupo
            const groupTasks = groupedTasks[groupId];
            const group = groups[groupId];
            const colorObj = getColorObject(group.color);

            const groupContainer = document.createElement('div');
            groupContainer.className = 'task-group';
            groupContainer.dataset.groupId = groupId;
            groupContainer.style.setProperty('--group-color', colorObj.color);
            groupContainer.style.setProperty('--group-bg', colorObj.bg);

            // Adicionar tarefas do grupo na ordem original
            groupTasks.forEach(groupTask => {
              const taskEl = createTaskElement(groupTask, isDone);
              groupContainer.appendChild(taskEl);
              processedTasks.add(groupTask.id);
            });

            container.appendChild(groupContainer);
            delete groupedTasks[groupId]; // Evitar renderizar o mesmo grupo duas vezes
          } else if (!groupId) {
            // Renderizar tarefa sem grupo
            const taskEl = createTaskElement(task, isDone);
            container.appendChild(taskEl);
            processedTasks.add(task.id);
          }
        });
      }

      function renderTasks(){
        tasksContainer.innerHTML=''; completedList.innerHTML='';
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        completedCollapsed = getCompletedCollapseForList(list.id);
        const active = list.tasks.filter(t=>!t.done);
        const done = list.tasks.filter(t=>t.done);

        // Carregar grupos locais da lista
        const groups = loadLocalGroups(currentListId);

        if(active.length===0){ const elEmpty = document.createElement('div'); elEmpty.className='centered-empty'; elEmpty.textContent='Nenhuma tarefa ativa.'; tasksContainer.appendChild(elEmpty); }
        else{
          // Renderizar tarefas ativas com agrupamento visual
          renderTasksWithGroups(active, tasksContainer, groups, false);
        }

        if(done.length>0){
          completedGroup.style.display='block';
          completedCount.textContent = done.length;
          // update chevron direction
          chev.textContent = completedCollapsed ? '▸' : '▾';
          if(completedCollapsed){ completedList.style.display='none'; }
          else{ completedList.style.display='flex'; }

          // Renderizar tarefas concluídas com agrupamento visual
          renderTasksWithGroups(done, completedList, groups, true);
        } else {
          completedGroup.style.display='none';
        }
        
        // Inicializar sortable para as tarefas após renderização
        initSortableTasks();

        if(currentTaskId && screenTaskDetail.classList.contains('active')){
          const currentTask = list.tasks.find((t)=>t && t.id===currentTaskId);
          if(currentTask){
            ensureTaskStructure(currentTask);
            renderTaskPhotos(currentTask);
            updatePhotoActionState(currentTask);
            if(document.activeElement !== taskDetailText){
              const syncedText = currentTask.text || '';
              const displayedText = taskDetailText.textContent || '';
              if(displayedText !== syncedText){
                taskDetailText.textContent = syncedText;
                lastValidTaskText = syncedText;
              }
            }
          }
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
        
        // Obter listas separadas de tarefas ativas e concluídas (excluindo a tarefa atual)
        const activeTasks = list.tasks.filter(t => !t.done && t.id !== taskId);
        const doneTasks = list.tasks.filter(t => t.done && t.id !== taskId);
        
        // Atualizar o status da tarefa
        const task = list.tasks[idx];
        task.done = !!markDone;
        
        // Reorganizar as tarefas mantendo a ordem personalizada
        if(task.done) {
          // Se foi marcada como concluída, adicionar ao início das concluídas
          list.tasks = [...activeTasks, task, ...doneTasks];
        } else {
          // Se foi marcada como ativa, adicionar ao início das ativas
          list.tasks = [task, ...activeTasks, ...doneTasks];
        }
        updateLocalOrderForList(list.id);
        saveState();
        renderTasks();
        // Garantir que o Sortable seja reativado após mudança de status
        try{ initSortableTasks(); }catch(_){ }
        renderLists();
        requestSync(list.id);
        
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
        clearPendingPhotos(list.id, taskId);
        
        // Limpar grupos ao excluir tarefa
        cleanupGroupsForTask(list.id, taskId);
        
        list.tasks.splice(idx,1);
        updateLocalOrderForList(list.id);
        saveState(); renderTasks(); renderLists(); requestSync(list.id);
      }

      function attachSwipeToDelete(node, taskId){
        let startX = 0;
        let currentX = 0;
        let dragging = false;
        let width = 0;
        let preventedScroll = false;
        let moved = false;
        let isDragHandle = false;

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
          
          // Verificar se o clique foi no drag handle ou próximo a ele
          isDragHandle = e.target.classList.contains('drag-handle');
          if (isDragHandle) {
            return; // Não iniciar swipe se for no handle
          }
          
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
          if(!dragging || isDragHandle) return;
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
          if(!dragging || isDragHandle) return;
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
        list.tasks.unshift({id:'t_'+Date.now(), text, done:false, photos:[]});
        updateLocalOrderForList(list.id);
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
        updateLocalOrderForList(list.id);
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

      if(cameraPhotoButton){
        cameraPhotoButton.addEventListener('click', ()=> openPhotoPicker('camera'));
      }
      if(galleryPhotoButton){
        galleryPhotoButton.addEventListener('click', ()=> openPhotoPicker('gallery'));
      }
      if(taskPhotoGridEmpty){
        taskPhotoGridEmpty.addEventListener('click', ()=> openPhotoPicker('gallery'));
      }
      if(photoLightboxClose){
        photoLightboxClose.addEventListener('click', ()=> closePhotoLightbox());
      }
      if(photoLightbox){
        photoLightbox.addEventListener('click', (evt)=>{ if(evt.target===photoLightbox){ closePhotoLightbox(); } });
      }
      if(photoLightboxDelete){
        photoLightboxDelete.addEventListener('click', ()=> deleteActivePhoto());
      }

      async function deleteCurrentList(){
        if(!currentListId) return;
        const idx = lists.findIndex(x=>x.id===currentListId);
        if(idx===-1) return;
        const list = lists[idx];
        removeCompletedCollapseState(list && list.id);
        clearPendingPhotosForList(list && list.id);
        clearRemovedPhotosForList(list && list.id);
        
        // Limpar TODOS os grupos da lista ao excluí-la
        cleanupGroupsForList(list.id);
        
        // tentativa de exclusão remota (best-effort)
        try{
          if(list && list.shareCode && !list.imported && typeof window !== 'undefined' && typeof window.firebaseDeleteList === 'function'){
            const code = String(list.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase();
            if(code.length===6){ await window.firebaseDeleteList(code); }
          }
        }catch(e){ }
        // exclusão local
        stopRealtimeForList(list.id);
        removeLocalOrderState(list && list.id);
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
      // Keep focus on the input so the virtual keyboard stays open after sending.
      sendTask.addEventListener('mousedown', (event)=>{
        event.preventDefault();
        try{ composerInput.focus({ preventScroll: true }); }catch(_){ composerInput.focus(); }
      });
      sendTask.addEventListener('touchstart', (event)=>{
        event.preventDefault();
        try{ composerInput.focus({ preventScroll: true }); }catch(_){ composerInput.focus(); }
        if(!sendTask.disabled){ sendTaskNow(); }
      }, { passive: false });
      sendTask.addEventListener('click', sendTaskNow);

      // clicking backdrop closes composer (but not modal backdrop)
      composerBackdrop.addEventListener('click', (e)=>{ if(e.target===composerBackdrop) hideComposer(); });

      completedHeader.addEventListener('click', ()=>{
        if(!currentListId) return;
        const nextCollapsed = !getCompletedCollapseForList(currentListId);
        completedCollapsed = nextCollapsed;
        setCompletedCollapseForList(currentListId, nextCollapsed);
        renderTasks();
      });

      appMenuBtn.addEventListener('click', toggleAppMenu);
      shareListAction.addEventListener('click', ()=>{ hideAppMenu(); openShareDialog(); });
      if(deleteListAction){
        deleteListAction.addEventListener('click', async ()=>{
          hideAppMenu();
          if(!currentListId) return;
          const list = lists.find(x=>x.id===currentListId);
          const title = list ? (list.title || 'esta lista') : 'esta lista';
          const ok = await showConfirmDialog({
            title: 'Excluir lista',
            message: `Excluir "${title}"? Essa ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar'
          });
          if(!ok) return;
          await deleteCurrentList();
        });
      }
      if(resetAppAction){
        resetAppAction.addEventListener('click', async ()=>{
          hideAppMenu();
          const confirmReset = await showConfirmDialog({
            title: 'Resetar aplicativo',
            message: 'Isso limpará todos os dados locais e recarregará o app. Deseja continuar?',
            confirmText: 'Resetar',
            cancelText: 'Cancelar'
          });
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
            if(normalized.length!==6){
              updateCodeImportState();
              showToast('Informe um código de 6 caracteres.', { type: 'error' });
              setTimeout(()=>{ if(codeInputs[0]) codeInputs[0].focus(); }, 150);
              return;
            }
            if(typeof window === 'undefined' || typeof window.firebaseGetList !== 'function'){
              updateCodeImportState();
              showToast('Importação indisponível no momento.', { type: 'error' });
              setTimeout(()=>{ if(codeInputs[0]) codeInputs[0].focus(); }, 150);
              return;
            }
            codeImport.disabled = true;
            const remote = await window.firebaseGetList(normalized);
            updateCodeImportState();
            if(!remote){
              showToast('Código não encontrado.', { type: 'error' });
              setTimeout(()=>{ if(codeInputs[0]) codeInputs[0].focus(); }, 150);
              return;
            }
            const id = 'l_'+Date.now();
            const title = remote.title || 'Lista Importada';
            const tasks = [];
            if(Array.isArray(remote.tasks)){
              const baseTs = Date.now();
              remote.tasks.forEach((t, idx)=>{
                const normalizedTask = normalizeIncomingTaskData(t);
                const task = {
                  id: 't_'+baseTs+'_'+idx,
                  text: normalizedTask.text,
                  done: normalizedTask.done,
                  photos: normalizedTask.photos
                };
                ensureTaskStructure(task);
                tasks.push(task);
              });
            }
            const newList = { id, title, tasks, shareCode: normalized, imported: true };
            lists.push(newList);
            saveState(); renderLists(); closeCodeModal(); openList(id);
            startRealtimeForList(id);
          }catch(e){
            try{ updateCodeImportState(); }catch(_){ }
            showToast('Ocorreu um erro ao importar.', { type: 'error' });
            setTimeout(()=>{ if(codeInputs[0]) codeInputs[0].focus(); }, 150);
          }
        });
      }
      document.addEventListener('keydown', (evt)=>{
        if(evt.key==='Escape'){
          if(photoLightbox && photoLightbox.classList.contains('show')){
            evt.preventDefault();
            closePhotoLightbox();
            return;
          }
          if(confirmBackdrop && confirmBackdrop.classList.contains('show')){
            evt.preventDefault();
            settleConfirm(false);
            return;
          }
          if(isMenuOpen){ hideAppMenu(); }
          if(shareBackdrop && shareBackdrop.classList.contains('show')){ closeShareDialog(); }
          if(codeBackdrop && codeBackdrop.classList.contains('show')){ closeCodeModal(); }
        }
      });
      
      // Adicionar script Sortable.js para drag and drop
      function loadSortableJS() {
        return new Promise((resolve, reject) => {
          if (window.Sortable) {
            resolve(window.Sortable);
            return;
          }
          
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
          script.async = true;
          script.onload = () => resolve(window.Sortable);
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Função para inicializar a ordenação das listas
      let listsSortable = null;
      async function initSortableLists() {
        try {
          const Sortable = await loadSortableJS();
          
          if (listsSortable) {
            listsSortable.destroy();
          }
          
          listsSortable = new Sortable(listsContainer, {
            animation: 150,
            delay: 180,
            delayOnTouchOnly: true,
            touchStartThreshold: 3,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: function(evt) {
              // Atualizar a ordem das listas no array
              const listElements = Array.from(listsContainer.querySelectorAll('.list-card'));
              const newLists = [];
              
              listElements.forEach(el => {
                const id = el.dataset.id;
                const list = lists.find(l => l.id === id);
                if (list) {
                  newLists.push(list);
                }
              });
              
              lists = newLists;
              saveState();
            }
          });
        } catch (error) {
          console.error('Erro ao inicializar Sortable para listas:', error);
        }
      }
      
      // Variáveis para guardar as instâncias de Sortable
      let activeSortable = null;
      let completedSortable = null;
      let groupSortables = []; // Array para guardar instâncias de sortable dos grupos
      
      // Variáveis para controlar hover prolongado para agrupamento
      let hoverTimer = null;
      let hoverTarget = null;
      let draggedTaskId = null;
      
      // Função auxiliar para calcular se cursor está sobre a lixeira
      function isOverTrashZone(evt) {
        const trashZone = el('trashZone');
        if (!trashZone || trashZone.hasAttribute('hidden')) return false;
        
        const rect = trashZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Obter posição do cursor (touch ou mouse)
        let clientX, clientY;
        if (evt.originalEvent && evt.originalEvent.touches && evt.originalEvent.touches.length > 0) {
          clientX = evt.originalEvent.touches[0].clientX;
          clientY = evt.originalEvent.touches[0].clientY;
        } else if (evt.originalEvent) {
          clientX = evt.originalEvent.clientX;
          clientY = evt.originalEvent.clientY;
        } else {
          clientX = evt.clientX || 0;
          clientY = evt.clientY || 0;
        }
        
        // Calcular distância do centro da lixeira
        const distance = Math.sqrt(Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2));
        
        // Considera "sobre" se estiver dentro de 80px do centro
        return distance < 80;
      }
      
      // Função para inicializar a ordenação das tarefas
      async function initSortableTasks() {
        try {
          const Sortable = await loadSortableJS();
          const list = lists.find(x=>x.id===currentListId);
          if (!list) return;
          
          const trashZone = el('trashZone');
          
          // Destruir instâncias anteriores se existirem
          try{ if (activeSortable && activeSortable.el) { activeSortable.destroy(); } }catch(_){ }
          try{ if (completedSortable && completedSortable.el) { completedSortable.destroy(); } }catch(_){ }
          groupSortables.forEach(s => { try{ if(s && s.el) s.destroy(); }catch(_){} });
          activeSortable = null;
          completedSortable = null;
          groupSortables = [];
          
          // Configuração comum para ambos sortables
          const commonConfig = {
            animation: 150,
            delay: 180,
            delayOnTouchOnly: true,
            touchStartThreshold: 3,
            filter: '.checkbox-round',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onStart: function(evt) {
              // Guardar ID da tarefa sendo arrastada
              draggedTaskId = evt.item ? evt.item.dataset.id : null;
              
              // Limpar timer de hover se existir
              if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
              }
              if (hoverTarget) {
                hoverTarget.classList.remove('hover-grouping');
                hoverTarget = null;
              }
              
              // Mostrar lixeira quando começar a arrastar
              if (trashZone) {
                trashZone.removeAttribute('hidden');
                requestAnimationFrame(() => {
                  trashZone.classList.add('visible');
                });
              }
            },
            onMove: function(evt) {
              // Verificar se está sobre a lixeira e atualizar visual
              if (trashZone) {
                if (isOverTrashZone(evt)) {
                  trashZone.classList.add('drag-over');
                  // Cancelar hover de agrupamento se estiver sobre lixeira
                  if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    hoverTimer = null;
                  }
                  if (hoverTarget) {
                    hoverTarget.classList.remove('hover-grouping');
                    hoverTarget = null;
                  }
                } else {
                  trashZone.classList.remove('drag-over');
                }
              }
              
              // Lógica de hover prolongado para agrupamento
              const overTask = evt.related;
              
              // Verificar se está sobre uma tarefa (não sobre grupo ou container)
              if (overTask && overTask.classList.contains('task') && overTask.dataset.id && !isOverTrashZone(evt)) {
                const overTaskId = overTask.dataset.id;
                
                // Se for uma tarefa diferente do target anterior
                if (hoverTarget !== overTask) {
                  // Limpar timer anterior
                  if (hoverTimer) {
                    clearTimeout(hoverTimer);
                  }
                  if (hoverTarget) {
                    hoverTarget.classList.remove('hover-grouping');
                  }
                  
                  // Iniciar novo timer
                  hoverTarget = overTask;
                  hoverTarget.classList.add('hover-grouping');
                  
                  hoverTimer = setTimeout(() => {
                    // Criar ou adicionar ao grupo
                    if (draggedTaskId && overTaskId && draggedTaskId !== overTaskId) {
                      createOrAddToGroup(currentListId, draggedTaskId, overTaskId);
                      
                      // Limpar feedback visual
                      if (hoverTarget) {
                        hoverTarget.classList.remove('hover-grouping');
                        hoverTarget = null;
                      }
                    }
                    hoverTimer = null;
                  }, 1200);
                }
              } else {
                // Não está sobre uma tarefa, limpar timer
                if (hoverTimer) {
                  clearTimeout(hoverTimer);
                  hoverTimer = null;
                }
                if (hoverTarget) {
                  hoverTarget.classList.remove('hover-grouping');
                  hoverTarget = null;
                }
              }
              
              return true; // permite o movimento
            },
            onUnchoose: function(evt) {
              // Cancelar operação de agrupamento em andamento
              if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
              }
              if (hoverTarget) {
                hoverTarget.classList.remove('hover-grouping');
                hoverTarget = null;
              }
              
              // Limpar ID da tarefa arrastada
              draggedTaskId = null;
              
              // Esconder lixeira se cancelar o drag
              if (trashZone) {
                trashZone.classList.remove('visible', 'drag-over');
                setTimeout(() => {
                  if (!trashZone.classList.contains('visible')) {
                    trashZone.setAttribute('hidden', '');
                  }
                }, 160);
              }
            }
          };
          
          // Inicializar ordenação para tarefas ativas
          if (tasksContainer && tasksContainer.children.length > 1) {
            activeSortable = new Sortable(tasksContainer, {
              ...commonConfig,
              group: 'tasks',
              fallbackTolerance: 3,
              onEnd: function(evt) {
                // Limpar feedback visual de hover
                if (hoverTimer) {
                  clearTimeout(hoverTimer);
                  hoverTimer = null;
                }
                if (hoverTarget) {
                  hoverTarget.classList.remove('hover-grouping');
                  hoverTarget = null;
                }
                
                // Verificar se foi solto na lixeira
                const overTrash = trashZone && isOverTrashZone(evt);
                
                // Esconder lixeira
                if (trashZone) {
                  trashZone.classList.remove('visible', 'drag-over');
                  setTimeout(() => {
                    if (!trashZone.classList.contains('visible')) {
                      trashZone.setAttribute('hidden', '');
                    }
                  }, 160);
                }
                
                const taskEl = evt.item;
                const taskId = taskEl ? taskEl.dataset.id : null;
                
                if (overTrash) {
                  // Excluir tarefa
                  if (taskId) {
                    deleteTask(taskId);
                  }
                } else {
                  // Verificar se a tarefa foi arrastada para fora de um grupo
                  const oldParent = evt.from;
                  const newParent = evt.to;
                  const oldIsGroup = oldParent.classList.contains('task-group');
                  const newIsGroup = newParent.classList.contains('task-group');
                  
                  if (oldIsGroup && !newIsGroup && taskId) {
                    // Tarefa foi arrastada para fora do grupo
                    removeFromGroup(currentListId, taskId);
                  }
                  
                  // Reorganizar tarefas ativas
                  const taskElements = Array.from(tasksContainer.querySelectorAll('.task'));
                  const activeTasks = [];
                  const doneTasks = list.tasks.filter(t => t.done);
                  
                  taskElements.forEach(el => {
                    const id = el.dataset.id;
                    const task = list.tasks.find(t => t.id === id);
                    if (task) {
                      activeTasks.push(task);
                    }
                  });
                  
                  list.tasks = [...activeTasks, ...doneTasks];
                  updateLocalOrderForList(list.id);
                  saveState();
                  requestSync(list.id);
                }
                
                // Limpar ID da tarefa arrastada
                draggedTaskId = null;
              }
            });
          }
          
          // Inicializar ordenação para tarefas concluídas
          if (completedList && completedList.children.length > 0) {
            completedSortable = new Sortable(completedList, {
              ...commonConfig,
              onEnd: function(evt) {
                // Limpar feedback visual de hover
                if (hoverTimer) {
                  clearTimeout(hoverTimer);
                  hoverTimer = null;
                }
                if (hoverTarget) {
                  hoverTarget.classList.remove('hover-grouping');
                  hoverTarget = null;
                }
                
                // Verificar se foi solto na lixeira
                const overTrash = trashZone && isOverTrashZone(evt);
                
                // Esconder lixeira
                if (trashZone) {
                  trashZone.classList.remove('visible', 'drag-over');
                  setTimeout(() => {
                    if (!trashZone.classList.contains('visible')) {
                      trashZone.setAttribute('hidden', '');
                    }
                  }, 160);
                }
                
                const taskEl = evt.item;
                const taskId = taskEl ? taskEl.dataset.id : null;
                
                if (overTrash) {
                  // Excluir tarefa
                  if (taskId) {
                    deleteTask(taskId);
                  }
                } else {
                  // Verificar se a tarefa foi arrastada para fora de um grupo
                  const oldParent = evt.from;
                  const newParent = evt.to;
                  const oldIsGroup = oldParent.classList.contains('task-group');
                  const newIsGroup = newParent.classList.contains('task-group');
                  
                  if (oldIsGroup && !newIsGroup && taskId) {
                    // Tarefa foi arrastada para fora do grupo
                    removeFromGroup(currentListId, taskId);
                  }
                  
                  // Reorganizar tarefas concluídas
                  const taskElements = Array.from(completedList.querySelectorAll('.task'));
                  const activeTasks = list.tasks.filter(t => !t.done);
                  const doneTasks = [];
                  
                  taskElements.forEach(el => {
                    const id = el.dataset.id;
                    const task = list.tasks.find(t => t.id === id);
                    if (task) {
                      doneTasks.push(task);
                    }
                  });
                  
                  list.tasks = [...activeTasks, ...doneTasks];
                  updateLocalOrderForList(list.id);
                  saveState();
                  requestSync(list.id);
                }
                
                // Limpar ID da tarefa arrastada
                draggedTaskId = null;
              }
            });
          }
          
          // Inicializar sortable para task-groups (permitir drag dentro e entre grupos)
          const taskGroups = document.querySelectorAll('.task-group');
          taskGroups.forEach(groupEl => {
            try {
              const groupSortable = new Sortable(groupEl, {
                ...commonConfig,
                group: 'tasks',
                fallbackTolerance: 3,
                onEnd: function(evt) {
                  // Limpar feedback visual de hover
                  if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    hoverTimer = null;
                  }
                  if (hoverTarget) {
                    hoverTarget.classList.remove('hover-grouping');
                    hoverTarget = null;
                  }
                  
                  // Verificar se foi solto na lixeira
                  const overTrash = trashZone && isOverTrashZone(evt);
                  
                  // Esconder lixeira
                  if (trashZone) {
                    trashZone.classList.remove('visible', 'drag-over');
                    setTimeout(() => {
                      if (!trashZone.classList.contains('visible')) {
                        trashZone.setAttribute('hidden', '');
                      }
                    }, 160);
                  }
                  
                  const taskEl = evt.item;
                  const taskId = taskEl ? taskEl.dataset.id : null;
                  
                  if (overTrash) {
                    // Excluir tarefa
                    if (taskId) {
                      deleteTask(taskId);
                    }
                  } else {
                    // Verificar se a tarefa foi arrastada para fora do grupo
                    const oldParent = evt.from;
                    const newParent = evt.to;
                    const oldIsGroup = oldParent.classList.contains('task-group');
                    const newIsGroup = newParent.classList.contains('task-group');
                    
                    if (oldIsGroup && !newIsGroup && taskId) {
                      // Tarefa foi arrastada para fora do grupo
                      removeFromGroup(currentListId, taskId);
                    } else if (!oldIsGroup && newIsGroup && taskId) {
                      // Tarefa foi arrastada para dentro de um grupo
                      const groupId = newParent.dataset.groupId;
                      if (groupId) {
                        const groups = loadLocalGroups(currentListId);
                        if (groups[groupId] && !groups[groupId].taskIds.includes(taskId)) {
                          groups[groupId].taskIds.push(taskId);
                          deleteEmptyGroups(currentListId, groups);
                          saveLocalGroups(currentListId, groups);
                        }
                      }
                    } else if (oldIsGroup && newIsGroup && taskId) {
                      // Tarefa movida entre grupos
                      const oldGroupId = oldParent.dataset.groupId;
                      const newGroupId = newParent.dataset.groupId;
                      if (oldGroupId !== newGroupId) {
                        const groups = loadLocalGroups(currentListId);
                        // Remover do grupo antigo
                        if (groups[oldGroupId]) {
                          const idx = groups[oldGroupId].taskIds.indexOf(taskId);
                          if (idx !== -1) {
                            groups[oldGroupId].taskIds.splice(idx, 1);
                          }
                        }
                        // Adicionar ao novo grupo
                        if (groups[newGroupId] && !groups[newGroupId].taskIds.includes(taskId)) {
                          groups[newGroupId].taskIds.push(taskId);
                        }
                        deleteEmptyGroups(currentListId, groups);
                        saveLocalGroups(currentListId, groups);
                      }
                    }
                    
                    // Reorganizar tarefas conforme necessário
                    const allTaskElements = Array.from(document.querySelectorAll('#tasksContainer .task, #completedList .task'));
                    const reorderedTasks = [];
                    const doneTasks = list.tasks.filter(t => t.done);
                    const activeTasks = list.tasks.filter(t => !t.done);
                    
                    // Usar ordem existente como base
                    allTaskElements.forEach(el => {
                      const id = el.dataset.id;
                      const task = list.tasks.find(t => t.id === id);
                      if (task && !task.done && !reorderedTasks.includes(task)) {
                        reorderedTasks.push(task);
                      }
                    });
                    
                    list.tasks = [...reorderedTasks, ...doneTasks];
                    updateLocalOrderForList(list.id);
                    saveState();
                    requestSync(list.id);
                  }
                  
                  // Limpar ID da tarefa arrastada
                  draggedTaskId = null;
                  
                  // Re-renderizar para atualizar visual dos grupos
                  setTimeout(() => renderTasks(), 100);
                }
              });
              groupSortables.push(groupSortable);
            } catch (e) {
              console.error('Erro ao inicializar Sortable para grupo:', e);
            }
          });
          
        } catch (error) {
          console.error('Erro ao inicializar Sortable para tarefas:', error);
        }
      }

      if(globalBackBtn){
        globalBackBtn.addEventListener('click', ()=>{
          try{ window.history.back(); }catch(_){ }
        });
      }
      window.addEventListener('popstate', handlePopState);
      initHistory();
      preventNativeZoom();

      // initial load
      loadState();
      loadCompletedCollapseState();
      loadLocalOrderState();
      renderLists();
      updateSubtitle();
      updateAppBar(screenLists);
      startRealtimeForExistingLists();
      try{
        if(typeof window !== 'undefined' && !window.firebaseReady){
          window.addEventListener('firebase-ready', startRealtimeForExistingLists, { once: true });
        }
      }catch(_){ }

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
