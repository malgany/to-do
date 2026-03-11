(function(){
      // State
      let lists = []; // {id, title, tasks: [{id,text,done,photos:[], ...syncMeta}]} 
      let currentListId = null;
      let currentTaskId = null;
      let completedCollapsed = false;
      const LIST_STORAGE_KEY = 'todo_lists_v4';
      const LEGACY_LIST_STORAGE_KEY = 'todo_lists_v3';
      const THEME_PREFERENCE_STORAGE_KEY = 'todo_theme_preference_v1';
      const COMPLETED_COLLAPSE_STORAGE_KEY = 'todo_completed_collapsed_v1';
      const LOCAL_ORDER_STORAGE_KEY = 'todo_local_order_v2';
      const LEGACY_LOCAL_ORDER_STORAGE_KEY = 'todo_local_order_v1';
      const SYNC_OUTBOX_STORAGE_KEY = 'todo_sync_outbox_v1';
      const CLIENT_ID_STORAGE_KEY = 'todo_client_id_v1';
      const SHARED_SCHEMA_VERSION = 2;
      let completedCollapseByList = {};
      let localOrderByList = {};
      let syncOutboxByList = {};
      let lastValidTaskText = '';
      const clientId = loadOrCreateClientId();
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
        
        // Debug: mostrar quantas tarefas tem em cada grupo
        console.log('📦 Grupos salvos para lista', listId, ':');
        for (const [groupId, group] of Object.entries(groups)) {
          console.log(`  - Grupo ${groupId}: ${group.taskIds.length} tarefas`, group.taskIds);
        }
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
      function createOrAddToGroup(listId, draggedTaskId, targetTaskId, fromHover = false) {
        if (!listId || !draggedTaskId || !targetTaskId) return;
        if (draggedTaskId === targetTaskId) return;
        
        const groups = loadLocalGroups(listId);
        
        // IMPORTANTE: Verificar se o target já está em um grupo ANTES de remover
        let targetGroupId = null;
        for (const [groupId, group] of Object.entries(groups)) {
          if (group.taskIds && group.taskIds.includes(targetTaskId)) {
            targetGroupId = groupId;
            break;
          }
        }
        
        // Remover draggedTask de qualquer grupo que ela já esteja
        // para garantir que uma tarefa só esteja em um grupo por vez
        for (const groupId in groups) {
          const index = groups[groupId].taskIds.indexOf(draggedTaskId);
          if (index !== -1) {
            groups[groupId].taskIds.splice(index, 1);
          }
        }
        
        if (targetGroupId) {
          // Adicionar ao grupo existente se ainda não estiver nele
          if (!groups[targetGroupId].taskIds.includes(draggedTaskId)) {
            groups[targetGroupId].taskIds.push(draggedTaskId);
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
        // IMPORTANTE: Não renderizar durante hover para evitar destruir Sortable ativo
        if (!fromHover) {
          renderTasks();
        }
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

      function removeTasksFromGroups(listId, taskIds, groups) {
        if (!listId) return groups || {};
        const targetIds = new Set(Array.isArray(taskIds) ? taskIds.filter(Boolean) : []);
        const source = groups || loadLocalGroups(listId);
        for (const groupId in source) {
          source[groupId].taskIds = (source[groupId].taskIds || []).filter((taskId)=> !targetIds.has(taskId));
        }
        deleteEmptyGroups(listId, source);
        return source;
      }

      function getGroupSnapshotForTask(listId, taskId) {
        if (!listId || !taskId) return null;
        const groups = loadLocalGroups(listId);
        for (const [groupId, group] of Object.entries(groups)) {
          if (Array.isArray(group.taskIds) && group.taskIds.includes(taskId)) {
            return {
              groupId,
              taskIds: group.taskIds.slice(),
              color: group.color,
              createdAt: group.createdAt
            };
          }
        }
        return null;
      }

      function restoreTaskGroupSnapshot(listId, snapshot) {
        if (!listId || !snapshot || !snapshot.groupId || !Array.isArray(snapshot.taskIds)) return;
        const groups = removeTasksFromGroups(listId, snapshot.taskIds);
        groups[snapshot.groupId] = {
          taskIds: snapshot.taskIds.slice(),
          color: snapshot.color || getColorObject().name,
          createdAt: snapshot.createdAt || Date.now()
        };
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
      const selectTasksAction = el('selectTasksAction');
      const themeToggleAction = el('themeToggleAction');
      const shareListAction = el('shareListAction');
      const shareBackdrop = el('shareBackdrop');
      const shareCodeValue = el('shareCodeValue');
      const shareCopyBtn = el('shareCopyBtn');
      const shareCopyFeedback = el('shareCopyFeedback');
      const shareRetryBtn = el('shareRetryBtn');
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
      const selectionToolbar = el('selectionToolbar');
      const selectionCount = el('selectionCount');
      const groupSelectionButton = el('groupSelectionButton');
      const ungroupSelectionButton = el('ungroupSelectionButton');
      const cancelSelectionButton = el('cancelSelectionButton');
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
      const pendingDeleteUndos = new Map();
      let isSelectionMode = false;
      let selectedTaskIds = new Set();
      let activePhotoId = null;
      const PHOTO_SYNC_STATE_STORAGE_KEY = 'todo_photo_sync_state_v1';
      const pendingPhotoIdsByListTask = Object.create(null);
      const removedPhotoIdsByListTask = Object.create(null);

      function serializePhotoSyncMap(source){
        const out = Object.create(null);
        Object.keys(source || {}).forEach((listId)=>{
          const perList = source[listId];
          if(!perList || typeof perList !== 'object'){ return; }
          const serializedList = Object.create(null);
          Object.keys(perList).forEach((taskId)=>{
            const set = perList[taskId];
            if(!set || typeof set.forEach !== 'function' || set.size===0){ return; }
            const ids = [];
            set.forEach((id)=>{
              try{
                const normalized = String(id);
                if(normalized){ ids.push(normalized); }
              }catch(_){ }
            });
            if(ids.length){ serializedList[taskId] = ids; }
          });
          if(Object.keys(serializedList).length){ out[listId] = serializedList; }
        });
        return out;
      }

      function restorePhotoSyncMap(target, raw){
        if(!raw || typeof raw !== 'object'){ return; }
        Object.keys(raw).forEach((listId)=>{
          const perList = raw[listId];
          if(!perList || typeof perList !== 'object'){ return; }
          const restoredList = Object.create(null);
          Object.keys(perList).forEach((taskId)=>{
            const ids = Array.isArray(perList[taskId]) ? perList[taskId] : [];
            const set = new Set();
            ids.forEach((id)=>{
              try{
                const normalized = String(id);
                if(normalized){ set.add(normalized); }
              }catch(_){ }
            });
            if(set.size){ restoredList[taskId] = set; }
          });
          if(Object.keys(restoredList).length){ target[listId] = restoredList; }
        });
      }

      function savePhotoSyncState(){
        try{
          const payload = {
            pending: serializePhotoSyncMap(pendingPhotoIdsByListTask),
            removed: serializePhotoSyncMap(removedPhotoIdsByListTask)
          };
          localStorage.setItem(PHOTO_SYNC_STATE_STORAGE_KEY, JSON.stringify(payload));
        }catch(_){ }
      }

      function loadPhotoSyncState(){
        try{
          const raw = localStorage.getItem(PHOTO_SYNC_STATE_STORAGE_KEY);
          if(!raw){ return; }
          const parsed = JSON.parse(raw);
          restorePhotoSyncMap(pendingPhotoIdsByListTask, parsed && parsed.pending);
          restorePhotoSyncMap(removedPhotoIdsByListTask, parsed && parsed.removed);
        }catch(_){ }
      }

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
        savePhotoSyncState();
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
        savePhotoSyncState();
      }

      function markRemovedPhoto(listId, taskId, photoId){
        if(!listId || !taskId || !photoId){ return; }
        const set = getRemovedPhotoSet(listId, taskId, true);
        if(!set){ return; }
        try{ set.add(String(photoId)); }
        catch(_){ }
        savePhotoSyncState();
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
          savePhotoSyncState();
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
        savePhotoSyncState();
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
        savePhotoSyncState();
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
          savePhotoSyncState();
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
        savePhotoSyncState();
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
      const codeInputField = el('codeInputField');

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
      const taskDeleteButton = el('taskDeleteButton');
      const taskPhotoGridEmpty = taskPhotoGrid ? taskPhotoGrid.querySelector('.photo-grid-empty') : null;

      // helpers
      let isMenuOpen = false;
      let themePreference = 'system';
      const themeMediaQuery = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
      let activeShareCode = '';
      let copyFeedbackTimer = null;
      let confirmResolver = null;
      // Sync helpers
      let syncTimers = Object.create(null);
      let syncFlushes = Object.create(null);
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
            try{
              const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
              list._lastPushedAt = Date.now();
              const payload = buildSyncPayload(list);
              await window.firebaseShareList(code, payload);
            }catch(e){ /* ignore sync errors */ }
            finally{
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
            const lastRemoteAt = list._lastRemoteAt || 0;
            if(remoteAt && lastRemoteAt && remoteAt < lastRemoteAt){ return; }
            if(remoteAt && pushedAt && remoteAt < pushedAt){ return; }
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
            if(remoteAt){ list._lastRemoteAt = remoteAt; }
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
        const options = Object.assign({ type: 'info', duration: 3200, actionLabel: '', onAction: null }, opts||{});
        const toast = document.createElement('div');
        const typeClass = (options.type==='error') ? ' error' : (options.type==='success') ? ' success' : '';
        toast.className = 'toast'+typeClass;
        toast.setAttribute('role','status');
        const label = document.createElement('span');
        label.className = 'toast-message';
        label.textContent = message;
        toast.appendChild(label);
        let actionButton = null;
        if(options.actionLabel && typeof options.onAction === 'function'){
          actionButton = document.createElement('button');
          actionButton.type = 'button';
          actionButton.className = 'toast-action';
          actionButton.textContent = options.actionLabel;
          actionButton.addEventListener('click', (event)=>{
            event.stopPropagation();
            clearTimeout(timer);
            try{ options.onAction(); }catch(_){ }
            remove();
          });
          toast.appendChild(actionButton);
        }
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
        return {
          dismiss: ()=>{
            clearTimeout(timer);
            remove();
          },
          actionButton
        };
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
        return findTaskById(list, currentTaskId, false);
      }

      function updatePhotoActionState(task){
        const photos = getVisiblePhotos(task);
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
        const photos = getVisiblePhotos(task);
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
        if(getVisiblePhotos(task).length >= MAX_PHOTOS_PER_TASK){
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
        const photo = findPhotoById(task, photoId, false);
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
        const task = findTaskById(list, currentTaskId, false);
        if(!task || !Array.isArray(task.photos)) return;
        const ts = nowTs();
        touchListMeta(list, ts, clientId);
        const photo = markPhotoDeleted(task, activePhotoId, ts, clientId);
        if(!photo) return;
        ensureTaskStructure(task);
        enqueueSyncOperation(list, buildPhotoPatch(list, task, photo), [
          { kind:'photo_delete', taskId: task.id, photoId: photo.id, at: photo.deletedAt, by: photo.deletedBy }
        ]);
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
        const currentCount = getVisiblePhotos(task).length;
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
          const list = lists.find((entry)=> entry && entry.id===currentListId);
          const ts = nowTs();
          if(list){ touchListMeta(list, ts, clientId); }
          const addedPhotos = [];
          newPhotos.forEach((photo)=>{
            const upserted = upsertTaskPhoto(task, photo, ts, clientId);
            if(upserted && !previousIds.has(String(upserted.id))){
              addedPhotos.push(upserted);
            }
          });
          ensureTaskStructure(task);
          if(list){
            addedPhotos.forEach((photo)=>{
              enqueueSyncOperation(list, buildPhotoPatch(list, task, photo), [
                { kind:'photo_upsert', taskId: task.id, photoId: photo.id, at: photo.updatedAt, by: photo.updatedBy }
              ]);
            });
          }
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
        if(screen!==screenListDetail && isSelectionMode){
          exitSelectionMode({ rerender:false });
        }
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
        const remoteIds = new Set(remoteList.map((photo)=> photo && photo.id).filter(Boolean));
        const localIds = new Set(localList.map((photo)=> photo && photo.id).filter(Boolean));
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
          localList.forEach((photo)=>{
            if(photo && pendingSet.has(photo.id) && !seen.has(photo.id)){
              combined.push(photo);
              seen.add(photo.id);
            }
          });
          if(pendingSet.size){
            const settledPending = [];
            pendingSet.forEach((id)=>{
              if(remoteIds.has(id) || !localIds.has(id)){
                settledPending.push(id);
              }
            });
            if(settledPending.length){ clearPendingPhotos(listId, taskId, settledPending); }
          }
          cleanupPendingPhotoEntry(listId, taskId);
        }
        if(removedSet && removedSet.size){
          const settledRemoved = [];
          removedSet.forEach((id)=>{
            if(!remoteIds.has(id)){
              settledRemoved.push(id);
            }
          });
          if(settledRemoved.length){ clearRemovedPhotos(listId, taskId, settledRemoved); }
          cleanupRemovedPhotoEntry(listId, taskId);
        }
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

      function loadOrCreateClientId(){
        try{
          const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
          if(existing && String(existing).trim()){
            return String(existing).trim();
          }
          const created = 'client_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 8);
          localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
          return created;
        }catch(_){
          return 'client_ephemeral';
        }
      }

      function nowTs(){
        return Date.now();
      }

      function normalizeTimestamp(value, fallback){
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      }

      function normalizeActor(value, fallback){
        try{
          const normalized = String(value || '').trim().slice(0, 96);
          return normalized || String(fallback || '').trim().slice(0, 96) || clientId;
        }catch(_){
          return String(fallback || clientId);
        }
      }

      function compareVersion(aAt, aBy, bAt, bBy){
        const at = normalizeTimestamp(aAt, 0);
        const bt = normalizeTimestamp(bAt, 0);
        if(at !== bt){ return at - bt; }
        const actorA = String(aBy || '');
        const actorB = String(bBy || '');
        if(actorA === actorB){ return 0; }
        return actorA > actorB ? 1 : -1;
      }

      function pickLatestVersion(entries, fallback){
        let winner = {
          at: normalizeTimestamp(fallback && fallback.at, nowTs()),
          by: normalizeActor(fallback && fallback.by, clientId)
        };
        (entries || []).forEach((entry)=>{
          if(!entry){ return; }
          const at = normalizeTimestamp(entry.at, 0);
          const by = normalizeActor(entry.by, winner.by);
          if(compareVersion(at, by, winner.at, winner.by) > 0){
            winner = { at, by };
          }
        });
        return winner;
      }

      function createTaskId(){
        return 't_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 8);
      }

      function isTaskDeleted(task){
        return !!(task && task.deletedAt != null);
      }

      function isPhotoDeleted(photo){
        return !!(photo && photo.deletedAt != null);
      }

      function getVisibleTasks(list){
        if(!list || !Array.isArray(list.tasks)){ return []; }
        return list.tasks.filter((task)=> task && !isTaskDeleted(task));
      }

      function getVisiblePhotos(task){
        if(!task || !Array.isArray(task.photos)){ return []; }
        return task.photos.filter((photo)=> photo && !isPhotoDeleted(photo) && typeof photo.dataUrl === 'string' && photo.dataUrl);
      }

      function findTaskById(list, taskId, includeDeleted){
        if(!list || !Array.isArray(list.tasks) || !taskId){ return null; }
        const allowDeleted = !!includeDeleted;
        return list.tasks.find((task)=> task && task.id===taskId && (allowDeleted || !isTaskDeleted(task))) || null;
      }

      function findPhotoById(task, photoId, includeDeleted){
        if(!task || !Array.isArray(task.photos) || !photoId){ return null; }
        const allowDeleted = !!includeDeleted;
        return task.photos.find((photo)=> photo && photo.id===photoId && (allowDeleted || !isPhotoDeleted(photo))) || null;
      }

      function ensurePhotoStructure(photo, fallbackActor, options){
        if(!photo || typeof photo !== 'object'){ return null; }
        const opts = Object.assign({ allowDeletedWithoutData:true }, options||{});
        const actor = normalizeActor(fallbackActor, clientId);
        const deletedAt = photo.deletedAt == null ? null : normalizeTimestamp(photo.deletedAt, null);
        const rawDataUrl = typeof photo.dataUrl === 'string' ? String(photo.dataUrl) : '';
        if(!deletedAt && !rawDataUrl){ return null; }
        if(!photo.id){ photo.id = createPhotoId(); }
        const createdAt = normalizeTimestamp(photo.createdAt, nowTs());
        photo.createdAt = createdAt;
        photo.updatedAt = Math.max(createdAt, normalizeTimestamp(photo.updatedAt, createdAt));
        photo.updatedBy = normalizeActor(photo.updatedBy, actor);
        photo.deletedAt = deletedAt;
        photo.deletedBy = deletedAt == null ? '' : normalizeActor(photo.deletedBy, photo.updatedBy);
        photo.dataUrl = deletedAt != null && opts.allowDeletedWithoutData ? (rawDataUrl || null) : rawDataUrl;
        return photo;
      }

      function refreshTaskAggregateMetadata(task){
        if(!task || typeof task !== 'object'){ return; }
        const latest = pickLatestVersion([
          { at: task.textUpdatedAt, by: task.textUpdatedBy },
          { at: task.doneUpdatedAt, by: task.doneUpdatedBy },
          { at: task.deletedAt, by: task.deletedBy },
          ...(Array.isArray(task.photos) ? task.photos.map((photo)=> photo ? ({ at: photo.updatedAt, by: photo.updatedBy }) : null) : [])
        ], { at: task.updatedAt || task.createdAt || nowTs(), by: task.updatedBy || task.textUpdatedBy || clientId });
        task.updatedAt = latest.at;
        task.updatedBy = latest.by;
      }

      function ensureTaskStructure(task, fallbackActor){
        if(!task || typeof task !== 'object'){ return; }
        const actor = normalizeActor(fallbackActor, clientId);
        if(!task.id){ task.id = createTaskId(); }
        if(typeof task.text !== 'string'){ task.text = ''; }
        task.done = !!task.done;
        task.createdAt = normalizeTimestamp(task.createdAt, nowTs());
        task.textUpdatedAt = Math.max(task.createdAt, normalizeTimestamp(task.textUpdatedAt, normalizeTimestamp(task.updatedAt, task.createdAt)));
        task.textUpdatedBy = normalizeActor(task.textUpdatedBy, actor);
        task.doneUpdatedAt = Math.max(task.createdAt, normalizeTimestamp(task.doneUpdatedAt, normalizeTimestamp(task.updatedAt, task.createdAt)));
        task.doneUpdatedBy = normalizeActor(task.doneUpdatedBy, actor);
        task.deletedAt = task.deletedAt == null ? null : normalizeTimestamp(task.deletedAt, null);
        task.deletedBy = task.deletedAt == null ? '' : normalizeActor(task.deletedBy, actor);
        const normalizedPhotos = [];
        const seen = new Set();
        if(Array.isArray(task.photos)){
          task.photos.forEach((photo)=>{
            const normalized = ensurePhotoStructure(photo, actor);
            if(!normalized){ return; }
            let id = String(normalized.id || '');
            if(!id){ id = createPhotoId(); }
            while(seen.has(id)){ id = createPhotoId(); }
            normalized.id = id;
            seen.add(id);
            normalizedPhotos.push(normalized);
          });
        }
        task.photos = normalizedPhotos.slice(0, MAX_PHOTOS_PER_TASK);
        task.updatedBy = normalizeActor(task.updatedBy, actor);
        refreshTaskAggregateMetadata(task);
      }

      function ensureListStructure(list){
        if(!list || typeof list !== 'object'){ return; }
        if(!list.id){ list.id = 'l_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 6); }
        if(typeof list.title !== 'string' || !list.title.trim()){ list.title = 'Lista'; }
        if(!Array.isArray(list.tasks)){ list.tasks = []; }
        list.clientId = normalizeActor(list.clientId, clientId);
        list.metaUpdatedAt = normalizeTimestamp(list.metaUpdatedAt, normalizeTimestamp(list.updatedAt, nowTs()));
        list.metaUpdatedBy = normalizeActor(list.metaUpdatedBy, list.clientId);
        if(typeof list.shareCreated !== 'boolean' && String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().length===6){
          list.shareCreated = true;
        }
        list.tasks.forEach((task)=> ensureTaskStructure(task, list.clientId));
      }

      function touchListMeta(list, timestamp, actor){
        if(!list){ return; }
        list.metaUpdatedAt = normalizeTimestamp(timestamp, nowTs());
        list.metaUpdatedBy = normalizeActor(actor, clientId);
      }

      function setTaskTextCommit(task, text, timestamp, actor){
        if(!task){ return; }
        task.text = typeof text === 'string' ? text : '';
        task.textUpdatedAt = normalizeTimestamp(timestamp, nowTs());
        task.textUpdatedBy = normalizeActor(actor, clientId);
        refreshTaskAggregateMetadata(task);
      }

      function setTaskDoneCommit(task, done, timestamp, actor){
        if(!task){ return; }
        task.done = !!done;
        task.doneUpdatedAt = normalizeTimestamp(timestamp, nowTs());
        task.doneUpdatedBy = normalizeActor(actor, clientId);
        refreshTaskAggregateMetadata(task);
      }

      function markTaskDeleted(task, timestamp, actor){
        if(!task){ return; }
        task.deletedAt = normalizeTimestamp(timestamp, nowTs());
        task.deletedBy = normalizeActor(actor, clientId);
        refreshTaskAggregateMetadata(task);
      }

      function restoreTaskDeletedState(task, timestamp, actor){
        if(!task){ return; }
        task.deletedAt = null;
        task.deletedBy = '';
        task.updatedAt = normalizeTimestamp(timestamp, nowTs());
        task.updatedBy = normalizeActor(actor, clientId);
      }

      function upsertTaskPhoto(task, photo, timestamp, actor){
        if(!task || !photo){ return null; }
        const ts = normalizeTimestamp(timestamp, nowTs());
        const by = normalizeActor(actor, clientId);
        const normalized = ensurePhotoStructure({
          id: photo.id || createPhotoId(),
          dataUrl: photo.dataUrl,
          createdAt: normalizeTimestamp(photo.createdAt, ts),
          updatedAt: ts,
          updatedBy: by,
          deletedAt: null,
          deletedBy: ''
        }, by);
        if(!normalized){ return null; }
        if(!Array.isArray(task.photos)){ task.photos = []; }
        const existing = findPhotoById(task, normalized.id, true);
        if(existing){
          existing.dataUrl = normalized.dataUrl;
          existing.createdAt = Math.min(existing.createdAt || normalized.createdAt, normalized.createdAt);
          existing.updatedAt = normalized.updatedAt;
          existing.updatedBy = normalized.updatedBy;
          existing.deletedAt = null;
          existing.deletedBy = '';
        } else {
          task.photos.push(normalized);
        }
        refreshTaskAggregateMetadata(task);
        return findPhotoById(task, normalized.id, true);
      }

      function markPhotoDeleted(task, photoId, timestamp, actor){
        if(!task || !photoId){ return null; }
        const photo = findPhotoById(task, photoId, true);
        if(!photo){ return null; }
        photo.deletedAt = normalizeTimestamp(timestamp, nowTs());
        photo.deletedBy = normalizeActor(actor, clientId);
        photo.updatedAt = photo.deletedAt;
        photo.updatedBy = photo.deletedBy;
        photo.dataUrl = photo.dataUrl || null;
        refreshTaskAggregateMetadata(task);
        return photo;
      }

      function mergePhotoEntities(localPhoto, remotePhoto, fallbackActor){
        const actor = normalizeActor(fallbackActor, clientId);
        const left = localPhoto ? Object.assign({}, localPhoto) : null;
        const right = remotePhoto ? Object.assign({}, remotePhoto) : null;
        if(left){ ensurePhotoStructure(left, actor); }
        if(right){ ensurePhotoStructure(right, actor); }
        if(!left && !right){ return null; }
        if(!left){ return right; }
        if(!right){ return left; }
        const base = compareVersion(right.updatedAt, right.updatedBy, left.updatedAt, left.updatedBy) > 0 ? right : left;
        const other = base === right ? left : right;
        const merged = Object.assign({}, other, base);
        merged.id = left.id || right.id;
        merged.createdAt = Math.min(normalizeTimestamp(left.createdAt, nowTs()), normalizeTimestamp(right.createdAt, nowTs()));
        const deleteWinner = compareVersion(right.deletedAt, right.deletedBy, left.deletedAt, left.deletedBy) > 0
          ? { at: right.deletedAt, by: right.deletedBy }
          : { at: left.deletedAt, by: left.deletedBy };
        if(deleteWinner.at != null){
          merged.deletedAt = deleteWinner.at;
          merged.deletedBy = normalizeActor(deleteWinner.by, merged.updatedBy);
          merged.dataUrl = merged.dataUrl || null;
        } else {
          merged.deletedAt = null;
          merged.deletedBy = '';
        }
        return ensurePhotoStructure(merged, actor);
      }

      function mergeTaskEntities(localTask, remoteTask, fallbackActor){
        const actor = normalizeActor(fallbackActor, clientId);
        const left = localTask ? JSON.parse(JSON.stringify(localTask)) : null;
        const right = remoteTask ? JSON.parse(JSON.stringify(remoteTask)) : null;
        if(left){ ensureTaskStructure(left, actor); }
        if(right){ ensureTaskStructure(right, actor); }
        if(!left && !right){ return null; }
        if(!left){ return right; }
        if(!right){ return left; }
        const useRemoteText = compareVersion(right.textUpdatedAt, right.textUpdatedBy, left.textUpdatedAt, left.textUpdatedBy) > 0;
        const useRemoteDone = compareVersion(right.doneUpdatedAt, right.doneUpdatedBy, left.doneUpdatedAt, left.doneUpdatedBy) > 0;
        const merged = {
          id: left.id || right.id,
          text: useRemoteText ? right.text : left.text,
          done: useRemoteDone ? right.done : left.done,
          createdAt: Math.min(normalizeTimestamp(left.createdAt, nowTs()), normalizeTimestamp(right.createdAt, nowTs())),
          textUpdatedAt: useRemoteText ? right.textUpdatedAt : left.textUpdatedAt,
          textUpdatedBy: useRemoteText ? right.textUpdatedBy : left.textUpdatedBy,
          doneUpdatedAt: useRemoteDone ? right.doneUpdatedAt : left.doneUpdatedAt,
          doneUpdatedBy: useRemoteDone ? right.doneUpdatedBy : left.doneUpdatedBy,
          deletedAt: null,
          deletedBy: '',
          photos: []
        };
        const photoMap = Object.create(null);
        (left.photos || []).forEach((photo)=>{ if(photo && photo.id){ photoMap[photo.id] = { local: photo, remote: null }; } });
        (right.photos || []).forEach((photo)=>{
          if(!photo || !photo.id){ return; }
          if(!photoMap[photo.id]){ photoMap[photo.id] = { local: null, remote: photo }; }
          else { photoMap[photo.id].remote = photo; }
        });
        Object.keys(photoMap).forEach((photoId)=>{
          const mergedPhoto = mergePhotoEntities(photoMap[photoId].local, photoMap[photoId].remote, actor);
          if(mergedPhoto){ merged.photos.push(mergedPhoto); }
        });
        const deleteWinner = compareVersion(right.deletedAt, right.deletedBy, left.deletedAt, left.deletedBy) > 0
          ? { at: right.deletedAt, by: right.deletedBy }
          : { at: left.deletedAt, by: left.deletedBy };
        if(deleteWinner.at != null){
          merged.deletedAt = deleteWinner.at;
          merged.deletedBy = normalizeActor(deleteWinner.by, actor);
        }
        ensureTaskStructure(merged, actor);
        return merged;
      }

      function normalizeIncomingTaskData(task){
        const cloned = task ? JSON.parse(JSON.stringify(task)) : null;
        if(!cloned){ return null; }
        ensureTaskStructure(cloned, clientId);
        return cloned;
      }

      function sortTasksForDisplay(list, tasks, remoteOrder){
        const rank = getLocalOrderForList(list && list.id);
        const existingOrder = Object.create(null);
        (list && Array.isArray(list.tasks) ? list.tasks : []).forEach((task, idx)=>{
          if(task && task.id){ existingOrder[task.id] = idx; }
        });
        const remoteRank = remoteOrder || Object.create(null);
        return (tasks || []).slice().sort((a,b)=>{
          const aDeleted = isTaskDeleted(a);
          const bDeleted = isTaskDeleted(b);
          if(aDeleted !== bDeleted){ return aDeleted ? 1 : -1; }
          const rankA = Object.prototype.hasOwnProperty.call(rank, a.id) ? rank[a.id] : null;
          const rankB = Object.prototype.hasOwnProperty.call(rank, b.id) ? rank[b.id] : null;
          if(rankA != null && rankB != null){ return rankA - rankB; }
          if(rankA != null){ return -1; }
          if(rankB != null){ return 1; }
          const existingA = Object.prototype.hasOwnProperty.call(existingOrder, a.id) ? existingOrder[a.id] : null;
          const existingB = Object.prototype.hasOwnProperty.call(existingOrder, b.id) ? existingOrder[b.id] : null;
          if(existingA != null && existingB != null){ return existingA - existingB; }
          if(existingA != null){ return -1; }
          if(existingB != null){ return 1; }
          const remoteA = Object.prototype.hasOwnProperty.call(remoteRank, a.id) ? remoteRank[a.id] : null;
          const remoteB = Object.prototype.hasOwnProperty.call(remoteRank, b.id) ? remoteRank[b.id] : null;
          if(remoteA != null && remoteB != null){ return remoteA - remoteB; }
          if(remoteA != null){ return -1; }
          if(remoteB != null){ return 1; }
          return compareVersion(a.createdAt, a.id, b.createdAt, b.id);
        });
      }

      function mergeIncomingTasks(list, incomingTasks){
        const localMap = Object.create(null);
        const remoteMap = Object.create(null);
        const remoteOrder = Object.create(null);
        (Array.isArray(list && list.tasks) ? list.tasks : []).forEach((task)=>{
          if(task && task.id){ localMap[task.id] = task; }
        });
        (incomingTasks || []).forEach((task, idx)=>{
          if(!task || !task.id){ return; }
          remoteMap[task.id] = task;
          remoteOrder[task.id] = idx;
        });
        const ids = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
        const merged = [];
        ids.forEach((taskId)=>{
          const mergedTask = mergeTaskEntities(localMap[taskId], remoteMap[taskId], (list && list.clientId) || clientId);
          if(mergedTask){ merged.push(mergedTask); }
        });
        return sortTasksForDisplay(list, merged, remoteOrder);
      }

      function buildTaskRecordPatch(task){
        ensureTaskStructure(task, clientId);
        const base = `tasks/${task.id}`;
        return {
          [`${base}/id`]: task.id,
          [`${base}/text`]: task.text,
          [`${base}/done`]: !!task.done,
          [`${base}/createdAt`]: task.createdAt,
          [`${base}/updatedAt`]: task.updatedAt,
          [`${base}/updatedBy`]: task.updatedBy,
          [`${base}/deletedAt`]: task.deletedAt == null ? null : task.deletedAt,
          [`${base}/deletedBy`]: task.deletedAt == null ? null : task.deletedBy || '',
          [`${base}/textUpdatedAt`]: task.textUpdatedAt,
          [`${base}/textUpdatedBy`]: task.textUpdatedBy,
          [`${base}/doneUpdatedAt`]: task.doneUpdatedAt,
          [`${base}/doneUpdatedBy`]: task.doneUpdatedBy,
        };
      }

      function buildMetaPatch(list, includeTitle){
        const patch = {
          'meta/updatedAt': list.metaUpdatedAt,
          'meta/updatedBy': list.metaUpdatedBy,
          'meta/schemaVersion': SHARED_SCHEMA_VERSION
        };
        if(includeTitle !== false){
          patch['meta/title'] = list.title;
        }
        return patch;
      }

      function buildTaskFieldPatch(list, task, kind){
        ensureTaskStructure(task, list && list.clientId);
        if(kind === 'text'){
          return {
            'meta/updatedAt': list.metaUpdatedAt,
            'meta/updatedBy': list.metaUpdatedBy,
            'meta/schemaVersion': SHARED_SCHEMA_VERSION,
            [`tasks/${task.id}/text`]: task.text,
            [`tasks/${task.id}/textUpdatedAt`]: task.textUpdatedAt,
            [`tasks/${task.id}/textUpdatedBy`]: task.textUpdatedBy,
            [`tasks/${task.id}/updatedAt`]: task.updatedAt,
            [`tasks/${task.id}/updatedBy`]: task.updatedBy
          };
        }
        if(kind === 'done'){
          return {
            'meta/updatedAt': list.metaUpdatedAt,
            'meta/updatedBy': list.metaUpdatedBy,
            'meta/schemaVersion': SHARED_SCHEMA_VERSION,
            [`tasks/${task.id}/done`]: !!task.done,
            [`tasks/${task.id}/doneUpdatedAt`]: task.doneUpdatedAt,
            [`tasks/${task.id}/doneUpdatedBy`]: task.doneUpdatedBy,
            [`tasks/${task.id}/updatedAt`]: task.updatedAt,
            [`tasks/${task.id}/updatedBy`]: task.updatedBy
          };
        }
        if(kind === 'delete'){
          return {
            'meta/updatedAt': list.metaUpdatedAt,
            'meta/updatedBy': list.metaUpdatedBy,
            'meta/schemaVersion': SHARED_SCHEMA_VERSION,
            [`tasks/${task.id}/deletedAt`]: task.deletedAt,
            [`tasks/${task.id}/deletedBy`]: task.deletedBy,
            [`tasks/${task.id}/updatedAt`]: task.updatedAt,
            [`tasks/${task.id}/updatedBy`]: task.updatedBy
          };
        }
        return Object.assign({}, buildMetaPatch(list, false), buildTaskRecordPatch(task));
      }

      function buildPhotoPatch(list, task, photo){
        ensureTaskStructure(task, list && list.clientId);
        ensurePhotoStructure(photo, list && list.clientId);
        return {
          'meta/updatedAt': list.metaUpdatedAt,
          'meta/updatedBy': list.metaUpdatedBy,
          'meta/schemaVersion': SHARED_SCHEMA_VERSION,
          [`tasks/${task.id}/updatedAt`]: task.updatedAt,
          [`tasks/${task.id}/updatedBy`]: task.updatedBy,
          [`tasks/${task.id}/photos/${photo.id}/id`]: photo.id,
          [`tasks/${task.id}/photos/${photo.id}/dataUrl`]: photo.deletedAt == null ? photo.dataUrl : null,
          [`tasks/${task.id}/photos/${photo.id}/createdAt`]: photo.createdAt,
          [`tasks/${task.id}/photos/${photo.id}/updatedAt`]: photo.updatedAt,
          [`tasks/${task.id}/photos/${photo.id}/updatedBy`]: photo.updatedBy,
          [`tasks/${task.id}/photos/${photo.id}/deletedAt`]: photo.deletedAt == null ? null : photo.deletedAt,
          [`tasks/${task.id}/photos/${photo.id}/deletedBy`]: photo.deletedAt == null ? null : photo.deletedBy || ''
        };
      }

      function buildSyncPayload(list){
        ensureListStructure(list);
        return {
          title: list.title,
          updatedAt: list.metaUpdatedAt,
          updatedBy: list.metaUpdatedBy,
          metaUpdatedAt: list.metaUpdatedAt,
          metaUpdatedBy: list.metaUpdatedBy,
          clientId: list.clientId,
          tasks: (list.tasks || []).map((task)=>{
            ensureTaskStructure(task, list.clientId);
            return JSON.parse(JSON.stringify(task));
          })
        };
      }

      function saveSyncOutboxState(){
        try{
          localStorage.setItem(SYNC_OUTBOX_STORAGE_KEY, JSON.stringify(syncOutboxByList || {}));
        }catch(_){ }
      }

      function loadSyncOutboxState(){
        try{
          const raw = localStorage.getItem(SYNC_OUTBOX_STORAGE_KEY);
          if(!raw){
            syncOutboxByList = {};
            return;
          }
          const parsed = JSON.parse(raw);
          syncOutboxByList = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        }catch(_){
          syncOutboxByList = {};
        }
      }

      function getOutboxForList(listId, createIfMissing){
        if(!listId){ return null; }
        if(!syncOutboxByList || typeof syncOutboxByList !== 'object'){ syncOutboxByList = {}; }
        if(!syncOutboxByList[listId]){
          if(!createIfMissing){ return null; }
          syncOutboxByList[listId] = [];
        }
        return syncOutboxByList[listId];
      }

      function cleanupOutbox(listId){
        if(!listId || !syncOutboxByList || !Object.prototype.hasOwnProperty.call(syncOutboxByList, listId)){ return; }
        const queue = syncOutboxByList[listId];
        if(!Array.isArray(queue) || queue.length===0){
          delete syncOutboxByList[listId];
          saveSyncOutboxState();
        }
      }

      function enqueueSyncOperation(list, patch, targets){
        if(!list || !patch || typeof patch !== 'object'){ return; }
        const code = String(list.shareCode || '').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0, 6);
        if(code.length !== 6){ return; }
        const queue = getOutboxForList(list.id, true);
        queue.push({
          id: 'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2, 7),
          code,
          patch,
          targets: Array.isArray(targets) ? targets : [],
          sentAt: 0
        });
        saveSyncOutboxState();
      }

      function isTargetAcknowledged(target, remote){
        if(!target || !remote){ return false; }
        if(target.kind === 'meta'){
          return compareVersion(remote.updatedAt, remote.updatedBy, target.at, target.by) >= 0;
        }
        const remoteTask = Array.isArray(remote.tasks) ? remote.tasks.find((task)=> task && task.id===target.taskId) : null;
        if(!remoteTask){ return false; }
        if(target.kind === 'task_create'){
          return compareVersion(remoteTask.updatedAt, remoteTask.updatedBy, target.at, target.by) >= 0;
        }
        if(target.kind === 'task_text'){
          if(remoteTask.deletedAt != null && compareVersion(remoteTask.deletedAt, remoteTask.deletedBy, target.at, target.by) >= 0){ return true; }
          return compareVersion(remoteTask.textUpdatedAt, remoteTask.textUpdatedBy, target.at, target.by) >= 0;
        }
        if(target.kind === 'task_done'){
          if(remoteTask.deletedAt != null && compareVersion(remoteTask.deletedAt, remoteTask.deletedBy, target.at, target.by) >= 0){ return true; }
          return compareVersion(remoteTask.doneUpdatedAt, remoteTask.doneUpdatedBy, target.at, target.by) >= 0;
        }
        if(target.kind === 'task_delete'){
          return remoteTask.deletedAt != null && compareVersion(remoteTask.deletedAt, remoteTask.deletedBy, target.at, target.by) >= 0;
        }
        const remotePhoto = Array.isArray(remoteTask.photos) ? remoteTask.photos.find((photo)=> photo && photo.id===target.photoId) : null;
        if(target.kind === 'photo_upsert'){
          if(remoteTask.deletedAt != null && compareVersion(remoteTask.deletedAt, remoteTask.deletedBy, target.at, target.by) >= 0){ return true; }
          return !!(remotePhoto && compareVersion(remotePhoto.updatedAt, remotePhoto.updatedBy, target.at, target.by) >= 0);
        }
        if(target.kind === 'photo_delete'){
          if(remoteTask.deletedAt != null && compareVersion(remoteTask.deletedAt, remoteTask.deletedBy, target.at, target.by) >= 0){ return true; }
          return !!(remotePhoto && remotePhoto.deletedAt != null && compareVersion(remotePhoto.deletedAt, remotePhoto.deletedBy, target.at, target.by) >= 0);
        }
        return false;
      }

      function acknowledgeOutboxWithRemote(list, remote){
        if(!list || !remote){ return; }
        const queue = getOutboxForList(list.id, false);
        if(!Array.isArray(queue) || !queue.length){ return; }
        const remaining = queue.filter((entry)=>{
          const targets = Array.isArray(entry.targets) ? entry.targets : [];
          if(!targets.length){ return false; }
          return !targets.every((target)=> isTargetAcknowledged(target, remote));
        });
        if(remaining.length !== queue.length){
          syncOutboxByList[list.id] = remaining;
          saveSyncOutboxState();
          cleanupOutbox(list.id);
        }
      }

      function canSyncList(list){
        if(!list) return false;
        const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
        if(!code || code.length!==6) return false;
        if(typeof window === 'undefined' || typeof window.firebaseApplyListPatch !== 'function'){ return false; }
        if(list.imported){ return true; }
        return !!list.shareCreated;
      }

      async function flushListOutbox(listId){
        const queue = getOutboxForList(listId, false);
        const list = lists.find((entry)=> entry && entry.id===listId);
        if(!list || !canSyncList(list) || !Array.isArray(queue) || !queue.length){ return; }
        if(syncFlushes[listId]){ return syncFlushes[listId]; }
        const code = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
        syncFlushes[listId] = (async ()=>{
          try{
            for(const entry of queue){
              if(!entry || !entry.patch){ continue; }
              if(entry.sentAt && (Date.now() - entry.sentAt) < 600){ continue; }
              try{
                await window.firebaseApplyListPatch(code, entry.patch);
                entry.sentAt = Date.now();
                saveSyncOutboxState();
              }catch(_){
                break;
              }
            }
          }finally{
            delete syncFlushes[listId];
          }
        })();
        return syncFlushes[listId];
      }

      function requestSync(listId, delayMs){
        try{
          const list = lists.find((entry)=> entry && entry.id===listId);
          if(!list || !canSyncList(list)) return;
          const wait = typeof delayMs === 'number' ? Math.max(0, delayMs) : 180;
          if(syncTimers[listId]){ clearTimeout(syncTimers[listId]); }
          syncTimers[listId] = setTimeout(async ()=>{
            try{
              await flushListOutbox(listId);
            }catch(_){ }
            finally{
              syncTimers[listId] = null;
            }
          }, wait);
        }catch(_){ }
      }

      function startRealtimeForList(listId){
        try{
          const list = lists.find((entry)=> entry && entry.id===listId);
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
          if(liveSubscriptions[listId]) return;
          subscribeFn(code, (remote)=>{
            if(!remote){ return; }
            ensureListStructure(list);
            list.shareCreated = true;
            if(compareVersion(remote.updatedAt, remote.updatedBy, list.metaUpdatedAt, list.metaUpdatedBy) > 0){
              list.title = remote.title || list.title || 'Lista';
              list.metaUpdatedAt = normalizeTimestamp(remote.updatedAt, list.metaUpdatedAt);
              list.metaUpdatedBy = normalizeActor(remote.updatedBy, list.metaUpdatedBy);
            }
            const incoming = Array.isArray(remote.tasks)
              ? remote.tasks.map((task)=> normalizeIncomingTaskData(task)).filter(Boolean)
              : [];
            list.tasks = mergeIncomingTasks(list, incoming);
            acknowledgeOutboxWithRemote(list, remote);
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
            requestSync(list.id, 220);
          });
          liveSubscriptions[listId] = code;
          if(realtimeRetryTimers[listId]){
            clearTimeout(realtimeRetryTimers[listId]);
            delete realtimeRetryTimers[listId];
          }
          requestSync(listId, 320);
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
          (lists||[]).forEach((list)=>{
            if(!list) return;
            const normalized = String(list.shareCode||'').replace(/[^0-9A-Z]/gi,'').toUpperCase();
            if(normalized.length===6){
              startRealtimeForList(list.id);
            }
          });
        }catch(_){ }
      }

      function ensureListsStructure(){
        if(!Array.isArray(lists)){ lists = []; return; }
        lists.forEach((list)=> ensureListStructure(list));
      }

      function saveState(){
        ensureListsStructure();
        localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(lists));
        saveSyncOutboxState();
      }

      function loadState(){
        try{
          const raw = localStorage.getItem(LIST_STORAGE_KEY) || localStorage.getItem(LEGACY_LIST_STORAGE_KEY);
          if(raw){
            const parsed = JSON.parse(raw);
            lists = Array.isArray(parsed) ? parsed : [];
          }
        }catch(_){
          lists = [];
        }
        loadSyncOutboxState();
        ensureListsStructure();
      }

      function loadLocalOrderState(){
        try{
          const raw = localStorage.getItem(LOCAL_ORDER_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCAL_ORDER_STORAGE_KEY);
          localOrderByList = raw ? (JSON.parse(raw) || {}) : {};
          if(typeof localOrderByList !== 'object' || Array.isArray(localOrderByList)){
            localOrderByList = {};
          }
        }catch(_){
          localOrderByList = {};
        }
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

      function updateLocalOrderForList(listId){
        const list = lists.find((entry)=> entry && entry.id===listId);
        if(!list) return;
        const map = {};
        let rank = 1;
        getVisibleTasks(list).forEach((task)=>{
          map[task.id] = rank++;
        });
        setLocalOrderForList(listId, map);
      }

      function rebuildTaskArrayAfterReorder(list, orderedVisibleTasks){
        if(!list){ return; }
        const visible = Array.isArray(orderedVisibleTasks) ? orderedVisibleTasks.filter(Boolean) : [];
        const doneTasks = visible.filter((task)=> !!task.done);
        const activeTasks = visible.filter((task)=> !task.done);
        const deletedTasks = Array.isArray(list.tasks) ? list.tasks.filter((task)=> isTaskDeleted(task)) : [];
        list.tasks = [...activeTasks, ...doneTasks, ...deletedTasks];
      }

      function normalizeThemePreference(value){
        return ['system', 'light', 'dark'].includes(value) ? value : 'system';
      }

      function getResolvedTheme(preference){
        const pref = normalizeThemePreference(preference || themePreference);
        const prefersDark = !!(themeMediaQuery && themeMediaQuery.matches);
        return (pref === 'dark' || (pref === 'system' && prefersDark)) ? 'dark' : 'light';
      }

      function updateThemeColorMeta(resolvedTheme){
        try{
          const themeMeta = document.querySelector('meta[name="theme-color"]');
          if(themeMeta){
            themeMeta.setAttribute('content', resolvedTheme === 'dark' ? '#05080C' : '#F3F4F6');
          }
        }catch(_){ }
      }

      function updateThemeToggleLabel(){
        if(!themeToggleAction){ return; }
        const labels = {
          system: 'Tema: Sistema',
          light: 'Tema: Claro',
          dark: 'Tema: Escuro'
        };
        themeToggleAction.textContent = labels[normalizeThemePreference(themePreference)] || labels.system;
      }

      function applyTheme(preference, options){
        const opts = Object.assign({ persist:false, announce:false }, options||{});
        themePreference = normalizeThemePreference(preference);
        const resolvedTheme = getResolvedTheme(themePreference);
        document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
        updateThemeColorMeta(resolvedTheme);
        updateThemeToggleLabel();
        if(opts.persist){
          try{ localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference); }catch(_){ }
        }
        if(opts.announce){
          const modeLabel = themePreference === 'system'
            ? `Sistema (${resolvedTheme === 'dark' ? 'escuro' : 'claro'})`
            : (resolvedTheme === 'dark' ? 'Escuro' : 'Claro');
          showToast(`Tema alterado para ${modeLabel}.`, { type: 'success' });
        }
      }

      function loadThemePreference(){
        try{
          themePreference = normalizeThemePreference(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY) || 'system');
        }catch(_){
          themePreference = 'system';
        }
        applyTheme(themePreference);
      }

      function cycleThemePreference(){
        const order = ['system', 'light', 'dark'];
        const currentIndex = Math.max(order.indexOf(normalizeThemePreference(themePreference)), 0);
        const nextPreference = order[(currentIndex + 1) % order.length];
        applyTheme(nextPreference, { persist:true, announce:true });
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
          if(selectTasksAction){ selectTasksAction.focus(); }
          else if(themeToggleAction){ themeToggleAction.focus(); }
          else { shareListAction.focus(); }
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

      function normalizeCodeValue(value){
        return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g,'').slice(0,6);
      }

      function getCodeInputValue(){
        return normalizeCodeValue(codeInputField ? codeInputField.value : '');
      }

      function syncCodeInputValue(value){
        if(!codeInputField){ return ''; }
        const normalized = normalizeCodeValue(value);
        codeInputField.value = formatDisplayCode(normalized);
        return normalized;
      }

      function setShareDialogStatus(message, isError){
        if(!shareCopyFeedback){ return; }
        shareCopyFeedback.textContent = message || '';
        shareCopyFeedback.classList.toggle('error', !!isError);
      }

      async function runInitialShareSync(list, options){
        const opts = Object.assign({ showSuccess:false }, options||{});
        if(!list || typeof window === 'undefined' || typeof window.firebaseShareList !== 'function'){ return false; }
        try{
          setShareDialogStatus('Compartilhando lista...', false);
          if(shareRetryBtn){ shareRetryBtn.hidden = true; }
          await window.firebaseShareList(activeShareCode, buildSyncPayload(list));
          list.shareCreated = true;
          saveState();
          if(opts.showSuccess){
            setShareDialogStatus('Lista compartilhada com sucesso!', false);
          } else {
            setShareDialogStatus('', false);
          }
          requestSync(list.id, 220);
          return true;
        }catch(error){
          console.error('Erro ao compartilhar:', error);
          setShareDialogStatus('Erro ao compartilhar a lista. Tente novamente.', true);
          if(shareRetryBtn){ shareRetryBtn.hidden = false; }
          return false;
        }
      }

      async function openShareDialog(){
        if(!currentListId) return;
        const list = lists.find(x=>x.id===currentListId);
        if(list && list.imported){ return; }
        let needsSharing = false;
        
        if(list && list.shareCode){
          activeShareCode = String(list.shareCode).replace(/[^0-9A-Z]/gi,'').toUpperCase().slice(0,6);
          if(!list.shareCreated){ needsSharing = true; }
        } else {
          activeShareCode = generateShareCode();
          if(list){ list.shareCode = activeShareCode; list.shareCreated = false; saveState(); }
          needsSharing = true;
        }
        
        shareCodeValue.textContent = formatDisplayCode(activeShareCode);
        setShareDialogStatus('', false);
        if(shareRetryBtn){ shareRetryBtn.hidden = true; }
        shareBackdrop.style.display='flex';
        shareBackdrop.classList.add('show');
        lockScroll();
        applyKeyboardInset();
        shareCopyBtn.focus();
        if(list){ startRealtimeForList(list.id); }
        if(needsSharing && list){
          runInitialShareSync(list, { showSuccess:true });
        }
      }

      function closeShareDialog(){
        shareBackdrop.classList.remove('show');
        shareBackdrop.style.display='none';
        setShareDialogStatus('', false);
        if(shareRetryBtn){ shareRetryBtn.hidden = true; }
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

      function createDragHandleIconSvg(){
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        [7, 12, 17].forEach((y)=>{
          [9, 15].forEach((x)=>{
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', String(x));
            dot.setAttribute('cy', String(y));
            dot.setAttribute('r', '1.6');
            dot.setAttribute('fill', 'currentColor');
            svg.appendChild(dot);
          });
        });
        return svg;
      }

      function createTrashIconSvg(){
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
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
            ? l.tasks.reduce((total, task)=> total + (task && !isTaskDeleted(task) && !task.done ? 1 : 0), 0)
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
          if(!codeInputField){
            codeImport.disabled = true;
            return;
          }
          codeImport.disabled = getCodeInputValue().length !== 6;
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
        if(codeInputField && !codeInputField.dataset.bound){
          codeInputField.dataset.bound = 'true';
          codeInputField.addEventListener('input', ()=>{
            syncCodeInputValue(codeInputField.value);
            updateCodeImportState();
          });
          codeInputField.addEventListener('keydown', (e)=>{
            if(e.key === 'Enter'){
              e.preventDefault();
              if(!codeImport.disabled){ codeImport.click(); }
              return;
            }
            if(e.ctrlKey || e.metaKey || e.altKey){ return; }
            if(['Backspace','Delete','Tab','Home','End','ArrowLeft','ArrowRight'].includes(e.key)){ return; }
            if(e.key.length !== 1){ return; }
            if(!/[0-9a-z]/i.test(e.key)){
              e.preventDefault();
              return;
            }
            const current = getCodeInputValue();
            const hasSelection = codeInputField.selectionStart !== codeInputField.selectionEnd;
            if(current.length >= 6 && !hasSelection){
              e.preventDefault();
            }
          });
          codeInputField.addEventListener('paste', (e)=>{
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            syncCodeInputValue(text);
            updateCodeImportState();
          });
        }
        syncCodeInputValue('');
        updateCodeImportState();
        setTimeout(()=>{
          if(!codeInputField){ return; }
          codeInputField.focus();
          const cursorIndex = codeInputField.value.length;
          codeInputField.setSelectionRange(cursorIndex, cursorIndex);
        }, 40);
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
        const ts = nowTs();
        const newList = { id, title, tasks:[], createdAt: ts, metaUpdatedAt: ts, metaUpdatedBy: clientId, clientId, shareCreated:false };
        ensureListStructure(newList);
        lists.push(newList);
        saveState(); renderLists(); closeModal(); openList(id);
      }

      function saveRenameFromModal(){
        const id = modalBackdrop.dataset.listId; const title = listNameInput.value.trim(); if(!title) return;
        const list = lists.find(x=>x.id===id);
        if(list){
          const ts = nowTs();
          list.title = title;
          touchListMeta(list, ts, clientId);
          enqueueSyncOperation(list, buildMetaPatch(list, true), [
            { kind:'meta', at: list.metaUpdatedAt, by: list.metaUpdatedBy }
          ]);
        }
        saveState(); renderLists(); if(currentListId===id){ currentListName.textContent = title; }
        if(list){ requestSync(list.id); }
        closeModal();
      }

      function openList(id, options){
        const opts = Object.assign({ fromHistory:false }, options||{});
        currentListId = id;
        isSelectionMode = false;
        selectedTaskIds = new Set();
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
        if(isSelectionMode){ return; }
        const opts = Object.assign({ fromHistory:false }, options||{});
        currentTaskId = taskId;
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        const task = findTaskById(list, taskId, false);
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
        setCheckedMark(taskDetailCheckbox, !!task.done);
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

      function buildTaskElement(task, isDone){
        const node = document.createElement('div');
        node.className = isDone ? 'task done' : 'task';
        node.dataset.id = task.id;
        if(isSelectionMode && selectedTaskIds.has(task.id)){
          node.classList.add('selected');
        }

        const swipeAction = document.createElement('div');
        swipeAction.className = 'task-swipe-action';
        swipeAction.appendChild(createTrashIconSvg());

        const body = document.createElement('div');
        body.className = 'task-body';

        const cb = document.createElement('button');
        if(isDone){
          cb.className = 'checkbox-round checked';
          cb.setAttribute('aria-pressed', 'true');
          cb.title = 'Desmarcar';
          cb.innerHTML = 'âœ“';
          cb.addEventListener('click', (ev)=>{
            ev.stopPropagation();
            if(isSelectionMode){
              toggleTaskSelection(task.id);
              return;
            }
            animateAndToggle(cb, task.id, false);
          });
          setCheckedMark(cb, true);
        } else {
          cb.className = 'checkbox-round';
          cb.setAttribute('aria-pressed', 'false');
          cb.title = 'Marcar como concluÃ­da';
          cb.addEventListener('click', (ev)=>{
            ev.stopPropagation();
            if(isSelectionMode){
              toggleTaskSelection(task.id);
              return;
            }
            animateAndToggle(cb, task.id, true);
          });
        }

        const txt = document.createElement('div');
        txt.className = 'text';
        txt.textContent = task.text;
        txt.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          if(isSelectionMode){
            toggleTaskSelection(task.id);
            return;
          }
          openTaskDetail(task.id);
        });

        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'drag-handle';
        handle.setAttribute('aria-label', `Reordenar ${task.text}`);
        handle.appendChild(createDragHandleIconSvg());
        handle.addEventListener('click', (ev)=> ev.preventDefault());

        if(isSelectionMode){
          handle.disabled = true;
          handle.tabIndex = -1;
        }

        body.appendChild(cb);
        body.appendChild(txt);
        body.appendChild(handle);
        if(isSelectionMode){
          body.addEventListener('click', ()=> toggleTaskSelection(task.id));
        } else {
          body.addEventListener('click', (event)=>{
            if(event.target.closest('.checkbox-round') || event.target.closest('.drag-handle')){ return; }
            openTaskDetail(task.id);
          });
          attachSwipeToDeleteV2(node, body, task.id);
        }

        node.appendChild(swipeAction);
        node.appendChild(body);
        return node;
      }

      function setCheckedMark(buttonEl, checked){
        if(!buttonEl){ return; }
        buttonEl.innerHTML = checked ? '&#10003;' : '';
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
              const taskEl = buildTaskElement(groupTask, isDone);
              groupContainer.appendChild(taskEl);
              processedTasks.add(groupTask.id);
            });

            container.appendChild(groupContainer);
            delete groupedTasks[groupId]; // Evitar renderizar o mesmo grupo duas vezes
          } else if (!groupId) {
            // Renderizar tarefa sem grupo
            const taskEl = buildTaskElement(task, isDone);
            container.appendChild(taskEl);
            processedTasks.add(task.id);
          }
        });
      }

      function renderTasks(){
        tasksContainer.innerHTML=''; completedList.innerHTML='';
        const list = lists.find(x=>x.id===currentListId);
        if(!list) return;
        if(selectedTaskIds.size){
          selectedTaskIds = new Set(Array.from(selectedTaskIds).filter((taskId)=> !!findTaskById(list, taskId, false)));
        }
        completedCollapsed = getCompletedCollapseForList(list.id);
        const visibleTasks = getVisibleTasks(list);
        const active = visibleTasks.filter(t=>!t.done);
        const done = visibleTasks.filter(t=>t.done);

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
        updateSelectionToolbar();
        if(openComposer){
          openComposer.hidden = isSelectionMode;
          openComposer.style.display = isSelectionMode ? 'none' : '';
        }
        if(isSelectionMode){
          destroyTaskSortables();
        } else {
          initSortableTasksV2();
        }

        if(currentTaskId && screenTaskDetail.classList.contains('active')){
          const currentTask = findTaskById(list, currentTaskId, false);
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

      function updateSelectionToolbar(){
        if(!selectionToolbar || !selectionCount || !groupSelectionButton || !ungroupSelectionButton || !cancelSelectionButton){
          return;
        }
        const list = lists.find((entry)=> entry && entry.id===currentListId);
        const selectedTasks = list
          ? Array.from(selectedTaskIds)
            .map((taskId)=> findTaskById(list, taskId, false))
            .filter(Boolean)
          : [];
        const count = selectedTasks.length;
        const doneStates = new Set(selectedTasks.map((task)=> !!task.done));
        const canGroup = count >= 2 && doneStates.size === 1;
        const canUngroup = selectedTasks.some((task)=> !!getTaskGroup(currentListId, task.id));
        selectionToolbar.hidden = !isSelectionMode;
        selectionCount.textContent = `${count} ${count===1 ? 'item' : 'itens'}`;
        groupSelectionButton.disabled = !canGroup;
        ungroupSelectionButton.disabled = !canUngroup;
        if(selectTasksAction){
          selectTasksAction.textContent = isSelectionMode ? 'Cancelar selecao' : 'Selecionar tarefas';
        }
      }

      function enterSelectionMode(){
        if(!currentListId || isSelectionMode){ return; }
        hideComposer();
        selectedTaskIds = new Set();
        isSelectionMode = true;
        updateSelectionToolbar();
        renderTasks();
      }

      function exitSelectionMode(options){
        const opts = Object.assign({ preserveSelection:false, rerender:true }, options||{});
        if(!isSelectionMode && !selectedTaskIds.size){ return; }
        isSelectionMode = false;
        if(!opts.preserveSelection){
          selectedTaskIds = new Set();
        }
        updateSelectionToolbar();
        if(opts.rerender && currentListId){
          renderTasks();
        }
      }

      function toggleTaskSelection(taskId){
        if(!isSelectionMode || !taskId){ return; }
        if(selectedTaskIds.has(taskId)){ selectedTaskIds.delete(taskId); }
        else { selectedTaskIds.add(taskId); }
        updateSelectionToolbar();
        renderTasks();
      }

      function groupSelectedTasks(){
        if(!currentListId || selectedTaskIds.size < 2){ return; }
        const list = lists.find((entry)=> entry && entry.id===currentListId);
        if(!list){ return; }
        const selectedTasks = Array.from(selectedTaskIds)
          .map((taskId)=> findTaskById(list, taskId, false))
          .filter(Boolean);
        if(selectedTasks.length < 2){ return; }
        const doneStates = new Set(selectedTasks.map((task)=> !!task.done));
        if(doneStates.size !== 1){ return; }
        const taskIds = selectedTasks.map((task)=> task.id);
        const groups = removeTasksFromGroups(currentListId, taskIds);
        const groupId = createGroupId();
        const colorObj = getNextGroupColor(currentListId);
        groups[groupId] = {
          taskIds,
          color: colorObj.name,
          createdAt: Date.now()
        };
        saveLocalGroups(currentListId, groups);
        showToast('Tarefas agrupadas.', { type: 'success' });
        exitSelectionMode();
      }

      function ungroupSelectedTasks(){
        if(!currentListId || !selectedTaskIds.size){ return; }
        const groups = removeTasksFromGroups(currentListId, Array.from(selectedTaskIds));
        saveLocalGroups(currentListId, groups);
        showToast('Agrupamento removido.', { type: 'success' });
        exitSelectionMode();
      }

      // animation helper: add pop class then toggle state
      function animateAndToggle(buttonEl, taskId, markDone){
        buttonEl.classList.add('pop');
        setTimeout(()=>{ buttonEl.classList.remove('pop'); toggleTaskDone(taskId, markDone); }, 180);
      }

      function toggleTaskDone(taskId, markDone){
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = findTaskById(list, taskId, false); if(!task) return;
        const ts = nowTs();
        touchListMeta(list, ts, clientId);
        
        // Obter listas separadas de tarefas ativas e concluídas (excluindo a tarefa atual)
        const visibleTasks = getVisibleTasks(list);
        const activeTasks = visibleTasks.filter(t => !t.done && t.id !== taskId);
        const doneTasks = visibleTasks.filter(t => t.done && t.id !== taskId);
        const deletedTasks = (list.tasks || []).filter((entry)=> isTaskDeleted(entry));
        setTaskDoneCommit(task, !!markDone, ts, clientId);
        
        // Reorganizar as tarefas mantendo a ordem personalizada
        if(task.done) {
          // Se foi marcada como concluída, adicionar ao início das concluídas
          list.tasks = [...activeTasks, task, ...doneTasks, ...deletedTasks];
        } else {
          // Se foi marcada como ativa, adicionar ao início das ativas
          list.tasks = [task, ...activeTasks, ...doneTasks, ...deletedTasks];
        }
        enqueueSyncOperation(list, buildTaskFieldPatch(list, task, 'done'), [
          { kind:'task_done', taskId: task.id, at: task.doneUpdatedAt, by: task.doneUpdatedBy }
        ]);
        updateLocalOrderForList(list.id);
        saveState();
        renderTasks();
        // Garantir que o Sortable seja reativado após mudança de status
        try{ initSortableTasksV2(); }catch(_){ }
        renderLists();
        requestSync(list.id);
        
        // if we're in task detail for this task, update detail checkbox and text style
        if(currentTaskId===taskId && screenTaskDetail.classList.contains('active')){
          if(task.done){ taskDetailCheckbox.classList.add('checked'); taskDetailCheckbox.innerHTML='✓'; }
          else{ taskDetailCheckbox.classList.remove('checked'); taskDetailCheckbox.innerHTML=''; }
          setCheckedMark(taskDetailCheckbox, !!task.done);
          // keep user on task detail
        }
      }

      function queueDeleteUndo(list, task, undoInfo){
        if(!list || !task || !task.id){ return; }
        const existing = pendingDeleteUndos.get(task.id);
        if(existing && existing.timer){ clearTimeout(existing.timer); }
        const record = Object.assign({ listId: list.id, taskId: task.id }, undoInfo || {});
        record.timer = setTimeout(()=>{ pendingDeleteUndos.delete(task.id); }, 5200);
        pendingDeleteUndos.set(task.id, record);
        showToast('Tarefa excluida.', {
          duration: 5000,
          actionLabel: 'Desfazer',
          onAction: ()=> restoreDeletedTask(task.id)
        });
      }

      function restoreDeletedTask(taskId){
        const undoInfo = pendingDeleteUndos.get(taskId);
        if(!undoInfo){ return; }
        pendingDeleteUndos.delete(taskId);
        if(undoInfo.timer){ clearTimeout(undoInfo.timer); }
        const list = lists.find((entry)=> entry && entry.id===undoInfo.listId);
        if(!list){ return; }
        const task = findTaskById(list, taskId, true);
        if(!task){ return; }
        const ts = nowTs();
        touchListMeta(list, ts, clientId);
        restoreTaskDeletedState(task, ts, clientId);
        enqueueSyncOperation(list, buildTaskFieldPatch(list, task, 'delete'), [
          { kind:'task_delete', taskId: task.id, at: task.deletedAt, by: task.deletedBy }
        ]);
        if(undoInfo.localOrder && typeof undoInfo.localOrder === 'object'){
          setLocalOrderForList(list.id, Object.assign({}, undoInfo.localOrder));
        } else {
          updateLocalOrderForList(list.id);
        }
        if(undoInfo.groupSnapshot){
          restoreTaskGroupSnapshot(list.id, undoInfo.groupSnapshot);
        }
        saveState();
        renderTasks();
        renderLists();
        requestSync(list.id);
        showToast('Tarefa restaurada.', { type: 'success' });
      }

      function deleteTask(taskId, options){
        const opts = Object.assign({ allowUndo:false }, options||{});
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = findTaskById(list, taskId, false); if(!task) return;
        const undoInfo = opts.allowUndo ? {
          localOrder: Object.assign({}, getLocalOrderForList(list.id)),
          groupSnapshot: getGroupSnapshotForTask(list.id, taskId)
        } : null;
        clearPendingPhotos(list.id, taskId);
        cleanupGroupsForTask(list.id, taskId);

        const ts = nowTs();
        touchListMeta(list, ts, clientId);
        markTaskDeleted(task, ts, clientId);
        enqueueSyncOperation(list, buildTaskFieldPatch(list, task, 'delete'), [
          { kind:'task_delete', taskId: task.id, at: task.deletedAt, by: task.deletedBy }
        ]);
        if(currentTaskId===taskId){
          currentTaskId = null;
          closePhotoLightbox({ skipPersist:true });
          currentListName.textContent = list.title;
          showScreen(screenListDetail);
          replaceHistoryState(SCREEN_KEYS.LIST_DETAIL, { listId: list.id });
        }
        updateLocalOrderForList(list.id);
        saveState();
        renderTasks();
        renderLists();
        requestSync(list.id);
        if(opts.allowUndo){
          queueDeleteUndo(list, task, undoInfo);
        }
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

      function attachSwipeToDeleteV2(node, swipeSurface, taskId){
        const threshold = 0.4;
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let tracking = false;
        let swiping = false;
        let suppressClick = false;
        let width = 0;

        function setTranslate(x){
          swipeSurface.style.transform = `translateX(${x}px)`;
          const ratio = Math.max(0, Math.min(1, Math.abs(x) / Math.max(width || 1, 1)));
          node.style.setProperty('--swipe-progress', ratio.toFixed(3));
        }

        function resetSwipe(){
          swipeSurface.classList.add('swipe-anim');
          setTranslate(0);
          setTimeout(()=>{
            swipeSurface.classList.remove('swipe-anim');
            node.style.removeProperty('--swipe-progress');
          }, 180);
        }

        function onPointerDown(event){
          if(isSelectionMode){ return; }
          if(event.button !== undefined && event.button !== 0){ return; }
          if(event.target.closest('.drag-handle') || event.target.closest('.checkbox-round')){ return; }
          tracking = true;
          swiping = false;
          suppressClick = false;
          width = swipeSurface.offsetWidth || node.offsetWidth || 1;
          startX = event.clientX || 0;
          startY = event.clientY || 0;
          currentX = startX;
          swipeSurface.classList.remove('swipe-anim');
        }

        function onPointerMove(event){
          if(!tracking){ return; }
          const x = event.clientX || 0;
          const y = event.clientY || 0;
          const dx = x - startX;
          const dy = y - startY;
          currentX = x;
          if(!swiping){
            if(Math.abs(dx) < 8 && Math.abs(dy) < 8){ return; }
            if(Math.abs(dx) <= Math.abs(dy) || dx >= 0){
              tracking = false;
              return;
            }
            swiping = true;
            try{ swipeSurface.setPointerCapture && swipeSurface.setPointerCapture(event.pointerId); }catch(_){ }
          }
          suppressClick = true;
          if(event.cancelable){ event.preventDefault(); }
          setTranslate(Math.max(dx, -width * 0.7));
        }

        function onPointerUp(event){
          if(!tracking && !swiping){ return; }
          const endX = event.clientX || currentX;
          const dx = Math.min(0, endX - startX);
          const ratio = Math.abs(dx) / Math.max(width || 1, 1);
          tracking = false;
          if(swiping && ratio >= threshold){
            swipeSurface.classList.add('swipe-anim');
            setTranslate(-Math.max(width * 0.7, 120));
            setTimeout(()=>{ deleteTask(taskId, { allowUndo:true }); }, 150);
          } else {
            resetSwipe();
          }
          swiping = false;
        }

        swipeSurface.addEventListener('pointerdown', onPointerDown, { passive: true });
        swipeSurface.addEventListener('pointermove', onPointerMove);
        swipeSurface.addEventListener('pointerup', onPointerUp);
        swipeSurface.addEventListener('pointercancel', onPointerUp);
        swipeSurface.addEventListener('click', (event)=>{
          if(suppressClick){
            event.preventDefault();
            event.stopPropagation();
          }
        });
      }

      // Composer controls (overlay)
      function showComposer(){
        if(isSelectionMode){ return; }
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
        if(isSelectionMode){ return; }
        if(composerBackdrop.style.display==='flex' || composerBackdrop.classList.contains('show')) hideComposer(); else showComposer();
      }

      function sendTaskNow(){
        const text = composerInput.value.trim(); if(!text) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const ts = nowTs();
        touchListMeta(list, ts, clientId);
        // add to top of active tasks
        const newTask = { id:createTaskId(), text, done:false, photos:[], createdAt: ts };
        ensureTaskStructure(newTask, clientId);
        list.tasks = [newTask, ...getVisibleTasks(list), ...(list.tasks || []).filter((entry)=> isTaskDeleted(entry))];
        enqueueSyncOperation(list, Object.assign({}, buildMetaPatch(list, false), buildTaskRecordPatch(newTask)), [
          { kind:'task_create', taskId: newTask.id, at: newTask.updatedAt, by: newTask.updatedBy }
        ]);
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
        const task = findTaskById(list, currentTaskId, false); if(!task) return;
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
          const task = findTaskById(list, currentTaskId, false); if(!task) return;
          // snapshot do valor no momento do foco
          lastValidTaskText = task.text || '';
        }catch(_){ }
      });

      taskDetailText.addEventListener('blur', ()=>{
        // não permitir salvar vazio; restaurar último título válido
        if(!currentListId || !currentTaskId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = findTaskById(list, currentTaskId, false); if(!task) return;
        const trimmed = (taskDetailText.textContent || '').trim();
        const ts = nowTs();
        if(trimmed.length===0){
          setTaskTextCommit(task, lastValidTaskText || '', ts, clientId);
          taskDetailText.textContent = lastValidTaskText || '';
        } else {
          setTaskTextCommit(task, taskDetailText.textContent, ts, clientId);
          lastValidTaskText = task.text;
        }
        touchListMeta(list, ts, clientId);
        enqueueSyncOperation(list, buildTaskFieldPatch(list, task, 'text'), [
          { kind:'task_text', taskId: task.id, at: task.textUpdatedAt, by: task.textUpdatedBy }
        ]);
        updateLocalOrderForList(list.id);
        saveState(); renderLists(); renderTasks(); requestSync(list.id);
      });

      // task detail checkbox toggle (without leaving screen)
      taskDetailCheckbox.addEventListener('click', ()=>{
        if(!currentTaskId || !currentListId) return;
        const list = lists.find(x=>x.id===currentListId); if(!list) return;
        const task = findTaskById(list, currentTaskId, false); if(!task) return;
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
      if(taskDeleteButton){
        taskDeleteButton.addEventListener('click', async ()=>{
          if(!currentTaskId || !currentListId) return;
          const list = lists.find((entry)=> entry && entry.id===currentListId);
          const task = list ? findTaskById(list, currentTaskId, false) : null;
          if(!task) return;
          const ok = await showConfirmDialog({
            title: 'Excluir tarefa',
            message: `Excluir "${task.text || 'esta tarefa'}"? Essa ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar'
          });
          if(ok){ deleteTask(task.id); }
        });
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
        if(syncOutboxByList && Object.prototype.hasOwnProperty.call(syncOutboxByList, list.id)){
          delete syncOutboxByList[list.id];
          saveSyncOutboxState();
        }
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

      currentListName.addEventListener('click', ()=>{ if(!currentListId || isSelectionMode) return; openModal('rename', currentListId); setTimeout(()=>{ const len=listNameInput.value.length; listNameInput.setSelectionRange(len,len); },50); });
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
      if(selectTasksAction){
        selectTasksAction.addEventListener('click', ()=>{
          hideAppMenu();
          if(isSelectionMode){ exitSelectionMode(); }
          else { enterSelectionMode(); }
        });
      }
      if(themeToggleAction){
        themeToggleAction.addEventListener('click', ()=>{
          cycleThemePreference();
          hideAppMenu();
        });
      }
      shareListAction.addEventListener('click', ()=>{ hideAppMenu(); openShareDialog(); });
      if(groupSelectionButton){ groupSelectionButton.addEventListener('click', groupSelectedTasks); }
      if(ungroupSelectionButton){ ungroupSelectionButton.addEventListener('click', ungroupSelectedTasks); }
      if(cancelSelectionButton){ cancelSelectionButton.addEventListener('click', ()=> exitSelectionMode()); }
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
      if(shareRetryBtn){
        shareRetryBtn.addEventListener('click', ()=>{
          const list = lists.find((entry)=> entry && entry.id===currentListId);
          if(list){ runInitialShareSync(list, { showSuccess:true }); }
        });
      }
      shareCloseBtn.addEventListener('click', closeShareDialog);
      shareBackdrop.addEventListener('click', (evt)=>{ if(evt.target===shareBackdrop) closeShareDialog(); });
      // code modal bindings
      if(btnImportCode){ btnImportCode.addEventListener('click', ()=>{ closeModal(); openCodeModal(); }); }
      if(codeCancel){ codeCancel.addEventListener('click', closeCodeModal); }
      if(codeBackdrop){ codeBackdrop.addEventListener('click', (evt)=>{ if(evt.target===codeBackdrop) closeCodeModal(); }); }
      if(codeImport){
        codeImport.addEventListener('click', async ()=>{
          try{
            if(!codeInputField){ return; }
            const normalized = getCodeInputValue();
            if(normalized.length!==6){
              updateCodeImportState();
              showToast('Informe um código de 6 caracteres.', { type: 'error' });
              setTimeout(()=>{ if(codeInputField) codeInputField.focus(); }, 150);
              return;
            }
            if(typeof window === 'undefined' || typeof window.firebaseGetList !== 'function'){
              updateCodeImportState();
              showToast('Importação indisponível no momento.', { type: 'error' });
              setTimeout(()=>{ if(codeInputField) codeInputField.focus(); }, 150);
              return;
            }
            codeImport.disabled = true;
            const remote = await window.firebaseGetList(normalized);
            updateCodeImportState();
            if(!remote){
              showToast('Código não encontrado.', { type: 'error' });
              setTimeout(()=>{ if(codeInputField) codeInputField.focus(); }, 150);
              return;
            }
            const id = 'l_'+Date.now();
            const title = remote.title || 'Lista Importada';
            const tasks = [];
            if(Array.isArray(remote.tasks)){
              remote.tasks.forEach((t)=>{
                const normalizedTask = normalizeIncomingTaskData(t);
                const task = normalizedTask ? JSON.parse(JSON.stringify(normalizedTask)) : null;
                if(!task){ return; }
                ensureTaskStructure(task);
                tasks.push(task);
              });
            }
            const newList = {
              id,
              title,
              tasks,
              shareCode: normalized,
              imported: true,
              shareCreated: true,
              metaUpdatedAt: normalizeTimestamp(remote.updatedAt, nowTs()),
              metaUpdatedBy: normalizeActor(remote.updatedBy, clientId),
              clientId
            };
            ensureListStructure(newList);
            lists.push(newList);
            saveState(); renderLists(); closeCodeModal(); openList(id);
            startRealtimeForList(id);
          }catch(e){
            try{ updateCodeImportState(); }catch(_){ }
            showToast('Ocorreu um erro ao importar.', { type: 'error' });
            setTimeout(()=>{ if(codeInputField) codeInputField.focus(); }, 150);
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
        return window.Sortable
          ? Promise.resolve(window.Sortable)
          : Promise.reject(new Error('Sortable local nÃ£o carregado.'));
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
      let hoverGroupingInProgress = false;
      
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
                      hoverGroupingInProgress = true;
                      createOrAddToGroup(currentListId, draggedTaskId, overTaskId, true);
                      
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
                
                // CORREÇÃO: Se agrupamento via hover acabou de ocorrer, apenas renderizar e sair
                if (hoverGroupingInProgress) {
                  hoverGroupingInProgress = false;
                  draggedTaskId = null;
                  
                  // Esconder lixeira
                  if (trashZone) {
                    trashZone.classList.remove('visible', 'drag-over');
                    setTimeout(() => {
                      if (!trashZone.classList.contains('visible')) {
                        trashZone.setAttribute('hidden', '');
                      }
                    }, 160);
                  }
                  
                  // Renderizar para mostrar o agrupamento
                  renderTasks();
                  return;
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
                  const visibleTasks = getVisibleTasks(list);
                  
                  taskElements.forEach(el => {
                    const id = el.dataset.id;
                    const task = visibleTasks.find(t => t.id === id);
                    if (task) {
                      activeTasks.push(task);
                    }
                  });
                  
                  rebuildTaskArrayAfterReorder(list, [...activeTasks, ...visibleTasks.filter((task)=> task.done)]);
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
                
                // CORREÇÃO: Se agrupamento via hover acabou de ocorrer, apenas renderizar e sair
                if (hoverGroupingInProgress) {
                  hoverGroupingInProgress = false;
                  draggedTaskId = null;
                  
                  // Esconder lixeira
                  if (trashZone) {
                    trashZone.classList.remove('visible', 'drag-over');
                    setTimeout(() => {
                      if (!trashZone.classList.contains('visible')) {
                        trashZone.setAttribute('hidden', '');
                      }
                    }, 160);
                  }
                  
                  // Renderizar para mostrar o agrupamento
                  renderTasks();
                  return;
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
                  const visibleTasks = getVisibleTasks(list);
                  const activeTasks = visibleTasks.filter(t => !t.done);
                  const doneTasks = [];
                  
                  taskElements.forEach(el => {
                    const id = el.dataset.id;
                    const task = visibleTasks.find(t => t.id === id);
                    if (task) {
                      doneTasks.push(task);
                    }
                  });
                  
                  rebuildTaskArrayAfterReorder(list, [...activeTasks, ...doneTasks]);
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
                  
                  // CORREÇÃO: Se agrupamento via hover acabou de ocorrer, apenas renderizar e sair
                  if (hoverGroupingInProgress) {
                    hoverGroupingInProgress = false;
                    draggedTaskId = null;
                    
                    // Esconder lixeira
                    if (trashZone) {
                      trashZone.classList.remove('visible', 'drag-over');
                      setTimeout(() => {
                        if (!trashZone.classList.contains('visible')) {
                          trashZone.setAttribute('hidden', '');
                        }
                      }, 160);
                    }
                    
                    // Renderizar para mostrar o agrupamento
                    renderTasks();
                    return;
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
                        
                        // Remover de qualquer outro grupo primeiro
                        for (const gId in groups) {
                          const idx = groups[gId].taskIds.indexOf(taskId);
                          if (idx !== -1) {
                            groups[gId].taskIds.splice(idx, 1);
                          }
                        }
                        
                        // Adicionar ao novo grupo
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
                    const visibleTasks = getVisibleTasks(list);
                    
                    // Usar ordem existente como base
                    allTaskElements.forEach(el => {
                      const id = el.dataset.id;
                      const task = visibleTasks.find(t => t.id === id);
                      if (task && !task.done && !reorderedTasks.includes(task)) {
                        reorderedTasks.push(task);
                      }
                    });
                    
                    rebuildTaskArrayAfterReorder(list, [...reorderedTasks, ...visibleTasks.filter((task)=> task.done)]);
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

      function destroyTaskSortables(){
        try{ if(activeSortable && activeSortable.el){ activeSortable.destroy(); } }catch(_){ }
        try{ if(completedSortable && completedSortable.el){ completedSortable.destroy(); } }catch(_){ }
        groupSortables.forEach((sortable)=>{ try{ if(sortable && sortable.el){ sortable.destroy(); } }catch(_){ } });
        activeSortable = null;
        completedSortable = null;
        groupSortables = [];
      }

      function rebuildActiveOrderFromDom(list){
        if(!list){ return; }
        const visibleTasks = getVisibleTasks(list);
        const activeMap = new Map(visibleTasks.filter((task)=> !task.done).map((task)=> [task.id, task]));
        const doneTasks = visibleTasks.filter((task)=> task.done);
        const orderedActive = [];
        document.querySelectorAll('#tasksContainer .task').forEach((element)=>{
          const task = activeMap.get(element.dataset.id);
          if(task && !orderedActive.includes(task)){
            orderedActive.push(task);
          }
        });
        rebuildTaskArrayAfterReorder(list, [...orderedActive, ...doneTasks]);
        updateLocalOrderForList(list.id);
        saveState();
        requestSync(list.id);
      }

      function rebuildDoneOrderFromDom(list){
        if(!list){ return; }
        const visibleTasks = getVisibleTasks(list);
        const activeTasks = visibleTasks.filter((task)=> !task.done);
        const doneMap = new Map(visibleTasks.filter((task)=> task.done).map((task)=> [task.id, task]));
        const orderedDone = [];
        document.querySelectorAll('#completedList .task').forEach((element)=>{
          const task = doneMap.get(element.dataset.id);
          if(task && !orderedDone.includes(task)){
            orderedDone.push(task);
          }
        });
        rebuildTaskArrayAfterReorder(list, [...activeTasks, ...orderedDone]);
        updateLocalOrderForList(list.id);
        saveState();
        requestSync(list.id);
      }

      async function initSortableTasksV2() {
        try {
          const Sortable = await loadSortableJS();
          const list = lists.find((entry)=> entry && entry.id===currentListId);
          if(!list){ return; }
          destroyTaskSortables();
          const commonConfig = {
            animation: 160,
            delay: 180,
            delayOnTouchOnly: true,
            touchStartThreshold: 3,
            handle: '.drag-handle',
            filter: '.checkbox-round',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag'
          };

          if(tasksContainer && tasksContainer.children.length > 1){
            activeSortable = new Sortable(tasksContainer, {
              ...commonConfig,
              onEnd: ()=> rebuildActiveOrderFromDom(list)
            });
          }

          if(completedList && completedList.children.length > 0){
            completedSortable = new Sortable(completedList, {
              ...commonConfig,
              onEnd: ()=> rebuildDoneOrderFromDom(list)
            });
          }

          document.querySelectorAll('.task-group').forEach((groupEl)=>{
            try{
              const isDoneGroup = !!groupEl.closest('#completedList');
              const sortable = new Sortable(groupEl, {
                ...commonConfig,
                onEnd: ()=>{ if(isDoneGroup){ rebuildDoneOrderFromDom(list); } else { rebuildActiveOrderFromDom(list); } }
              });
              groupSortables.push(sortable);
            }catch(error){
              console.error('Erro ao inicializar Sortable para grupo:', error);
            }
          });
        } catch (error) {
          console.error('Erro ao inicializar Sortable v2 para tarefas:', error);
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
      if(themeMediaQuery){
        const syncThemeFromSystem = ()=>{
          if(normalizeThemePreference(themePreference) === 'system'){
            applyTheme('system');
          }
        };
        if(typeof themeMediaQuery.addEventListener === 'function'){
          themeMediaQuery.addEventListener('change', syncThemeFromSystem);
        } else if(typeof themeMediaQuery.addListener === 'function'){
          themeMediaQuery.addListener(syncThemeFromSystem);
        }
      }

      // initial load
      loadThemePreference();
      loadState();
      loadPhotoSyncState();
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
