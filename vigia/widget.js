import {recentLists} from './model.js?v=2';

const status = document.querySelector('#status');
const login = document.querySelector('#login');
const listRows = document.querySelector('#lists');
const count = document.querySelector('#count');
function message(text) { status.textContent = text; status.hidden = !text; }
function clear() { listRows.replaceChildren(); count.hidden = true; }

async function start() {
  const sdk = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [appApi,A,D,AC] = await Promise.all(['app','auth','database','app-check'].map(name => import(sdk+'firebase-'+name+'.js')));
  const app = appApi.initializeApp({apiKey:'AIzaSyBH0WJNRyphdJQ1ydwgh1GYLnOS00wt4oM',
    authDomain:'to-do-8574b.firebaseapp.com', databaseURL:'https://to-do-8574b-default-rtdb.firebaseio.com',
    projectId:'to-do-8574b', appId:'1:857849175598:web:4664a8ad9b167af85509bf'});
  const appCheck = AC.initializeAppCheck(app, {
    provider:new AC.ReCaptchaV3Provider('6LfoGtUrAAAAAI_hvP9snJSkpCkBjrGgHHWbxcup'),
    isTokenAutoRefreshEnabled:true
  });
  const auth = A.getAuth(app), db = D.getDatabase(app);
  // Wait for the persisted login before opening Firebase subscriptions.
  await auth.authStateReady();
  let stopProfile, stopLists, activeHouse, connected = false;
  let lastView;
  function resetHouse() {
    stopLists?.(); activeHouse = null; lastView = null; clear();
  }
  function render(lists) {
    const open = lists.filter(list => !list.closed).length;
    count.textContent = open;
    count.setAttribute('aria-label', `Listas em aberto no cartão: ${open}`);
    count.hidden = false;
    listRows.replaceChildren();
    for (const list of lists) {
      const row = document.createElement('li');
      row.classList.toggle('completed', list.closed);

      const mark = document.createElement('span');
      mark.className = 'list-mark';
      mark.setAttribute('role', 'checkbox');
      mark.setAttribute('aria-checked', String(list.closed));
      mark.setAttribute('aria-readonly', 'true');
      mark.setAttribute('aria-label', list.closed ? 'Lista finalizada' : 'Lista em aberto');
      mark.textContent = list.closed ? '✓' : '';

      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = list.title;

      const progress = document.createElement('span');
      progress.className = 'list-progress';
      progress.textContent = `${list.done}/${list.total}`;
      progress.setAttribute('aria-label', `${list.done} de ${list.total} itens finalizados`);

      row.append(mark, title, progress);
      listRows.append(row);
    }
    message(!connected ? 'Reconectando ao TO-DO…' : lists.length ? '' : 'Nenhuma lista compartilhada.');
  }
  D.onValue(D.ref(db,'.info/connected'), snap => {
    connected = snap.val() === true;
    if (lastView) render(lastView);
  });
  login.onclick = async () => {
    login.disabled = true;
    try {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      await A.signInWithPopup(auth,provider);
    } catch (err) {
      message(err.code === 'auth/popup-blocked' ? 'Permita a janela de login e tente novamente.' : 'Login não concluído. Tente novamente.');
    } finally { login.disabled = false; }
  };
  let timer;
  function loading(text) {
    clearTimeout(timer);
    message(text);
    timer = setTimeout(() => message('O TO-DO ainda não respondeu. Recarregue para tentar com a mesma conta.'),15000);
  }
  A.onAuthStateChanged(auth,async user => {
    clearTimeout(timer);
    stopProfile?.(); resetHouse();
    login.hidden = !!user; login.textContent = 'Entrar com Google';
    if (!user) { message('Use a mesma conta da aba Nossa Casa.'); return; }
    loading('Verificando o acesso do painel ao TO-DO…');
    try { await AC.getToken(appCheck); }
    catch (error) {
      if (auth.currentUser?.uid === user.uid) {
        clearTimeout(timer);
        console.warn('Vigia App Check:', error.code);
        message('O TO-DO não conseguiu validar esta sessão. Recarregue o cartão e tente novamente.');
      }
      return;
    }
    if (auth.currentUser?.uid !== user.uid) return;
    loading('Carregando Nossa Casa…');
    const readFailed = () => {
      if (auth.currentUser?.uid !== user.uid) return;
      clearTimeout(timer); resetHouse();
      message('Falha na leitura da casa no Firebase. Confira a conexão e as permissões da casa.');
    };
    const denied = () => {
      if (auth.currentUser?.uid !== user.uid) return;
      clearTimeout(timer); resetHouse(); message('Esta conta não tem vínculo com Nossa Casa.'); login.hidden = false; login.textContent = 'Trocar conta';
    };
    stopProfile = D.onValue(D.ref(db,'householdUsers/'+user.uid), snap => {
      if (auth.currentUser?.uid !== user.uid) return;
      resetHouse();
      const house = snap.val()?.householdId;
      if (!house) { denied(); return; }
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(house)) { readFailed(); return; }
      activeHouse = house; login.hidden = true; loading('Carregando listas…');
      stopLists = D.onValue(D.ref(db,'households/'+house+'/records'), data => {
        if (activeHouse !== house || auth.currentUser?.uid !== user.uid) return;
        clearTimeout(timer);
        try { lastView = recentLists(data.val(),house); render(lastView); }
        catch { lastView = null; clear(); message('O TO-DO retornou uma lista inválida.'); }
      },readFailed);
    },readFailed);
  });
}
function connect() {
  start().catch(() => message('Não foi possível conectar ao TO-DO. Recarregue o painel.'));
}

if (window.parent === window) {
  connect();
} else if (window.parent === window.top) {
  const origins = new Set(['http://localhost:8769', 'http://127.0.0.1:8769']);
  function connectPanel(event) {
    if (event.source !== window.parent || !origins.has(event.origin) || event.data !== 'vigia:hello') return;
    window.removeEventListener('message', connectPanel);
    event.source.postMessage('vigia:ready', event.origin);
    connect();
  }
  window.addEventListener('message', connectPanel);
  message('Aguardando a conexão com o Vigia…');
} else {
  message('Abra este cartão diretamente no Vigia.');
}
