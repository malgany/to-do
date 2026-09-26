(function(root, factory){
  const api = factory();
  if(typeof module !== 'undefined') module.exports = api;
  else root.ShoppingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const kinds = { mercado:'Mercado', farmacia:'Farmácia', pet:'Pet' };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  // Only the app's explicit quantity suffix is removed. Strengths/sizes stay in the identity.
  const baseName = text => String(text || '').replace(/\s+-\s+\d+(?:[.,]\d+)?\s+(?:unidades?|pacotes?|caixas?|rolos?|cabecas?|cabeças?|duzias?|dúzias?|kg|g)\s*$/i,'').trim();
  const keyFor = text => {
    const source=normalize(baseName(text));
    return 'free_'+[2166136261,3339675911,2246822519,3266489917].map(seed=>{let hash=seed;for(const c of source)hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;return hash.toString(16).padStart(8,'0');}).join('');
  };
  function catalog(templates){
    return templates.flatMap(t=>t.groups.flatMap(g=>g.items.map(item=>({ ...item, productKey:item.id,
      kind:t.id, categoryId:g.id, categoryLabel:g.title, name:item.name,
      baseText:item.taskText || [item.name,item.detail].filter(Boolean).join(' ') }))));
  }
  function categories(templates, kind){
    return [...(templates.find(t=>t.id===kind)?.groups || []).map(g=>({id:g.id,label:g.title})),{id:'outros',label:'Outros'}];
  }
  const aliases = { 'arroz':'arroz-branco', 'oleo':'oleo-cozinha', 'oleo de soja':'oleo-cozinha',
    'detergente':'detergente-neutro', 'mussarela':'mucarela-fatiada', 'mucarela':'mucarela-fatiada',
    'cafe':'cafe-po', 'sabao em po':'sabao-em-po' };
  const categoryRules = [
    [/^(pera|maca|laranja|mamao|melancia|alface|rucula|brocolis|pepino|abacate|berinjela)(\s|$)/,'hortifruti'],
    [/^(sabao|detergente|agua sanitaria|desinfetante|esponja|vassoura|limpa vidros)(\s|$)/,'limpeza'],
    [/^(shampoo|condicionador|sabonete|creme dental|fio dental|desodorante)(\s|$)/,'higiene'],
    [/^(carne|frango|peixe|bife|linguica)(\s|$)/,'carnes-frios']
  ];
  function identify(text, kind, products, preferences={}, previous=null){
    const base = baseName(text), normalized = normalize(base);
    // Preserve known identity and user edits while only quantity changes.
    const prior = previous && normalize(previous.sourceText)===normalized ? previous : null;
    const matches = products.filter(p=>p.kind===kind && [p.name,p.baseText].some(n=>normalize(n)===normalized));
    const match = matches.length===1 ? matches[0] : products.find(p=>p.kind===kind && p.productKey===aliases[normalized]);
    const productKey = match?.productKey || prior?.productKey || keyFor(base);
    const pref = preferences[productKey] || {};
    let categoryId = pref.categoryId || prior?.categoryId || match?.categoryId;
    if(!categoryId && kind==='mercado') categoryId = categoryRules.find(([rx])=>rx.test(normalized))?.[1];
    const quantityMatch = String(text).match(/\s+-\s+(\d+(?:[.,]\d+)?)\s+([^\d]+)$/);
    const result = { productKey, name:match?.name || base, baseText:match?.baseText || base, sourceText:normalized, categoryId:categoryId || 'outros',
      source:pref.categoryId ? 'manual' : prior?.source || (match ? 'catalog' : categoryId ? 'rule' : 'unknown'),
      ...Object.fromEntries(['productKey','name','baseText','sourceText','categoryId','source','quantity','unit'].filter(k=>prior?.[k]!==undefined).map(k=>[k,prior[k]])),
      categoryId:pref.categoryId || categoryId || 'outros', source:pref.categoryId ? 'manual' : prior?.source || (match?'catalog':categoryId?'rule':'unknown'),
      originalText:String(text),
      ...(quantityMatch ? {quantity:Number(quantityMatch[1].replace(',','.')),unit:quantityMatch[2].trim()} : {}) };
    if(prior?.originalText && prior.originalText!==String(text) && baseName(prior.originalText)!==prior.originalText && !quantityMatch){delete result.quantity;delete result.unit;}
    return result;
  }
  function itemText(item, quantity=item.quantity){
    const base = item.baseText || item.name;
    if(!quantity) return base;
    const unit = quantity===1 ? item.unitSingular || item.unit : item.unitPlural || item.unit;
    return `${base} - ${String(quantity).replace('.',',')} ${unit || (quantity===1?'unidade':'unidades')}`;
  }
  function snapshot(list, {mode='complete', occurredAt=Date.now(), revision=1}={}){
    return { id:list.purchaseId || list.id, listId:list.id, sourceRef:list.sourceRef || list.id,
      kind:list.kind, title:list.title, mode, occurredAt, revision,
      items:(list.tasks || []).filter(t=>!t.deletedAt).map(t=>({
        taskId:t.id, text:t.text, ...(t.shopping || {productKey:keyFor(t.text),name:baseName(t.text),categoryId:'outros'}),
        outcome:t.notHave ? 'missing' : t.done ? 'bought' : 'pending'
      })) };
  }
  const compareEvents = (a,b)=>a.occurredAt-b.occurredAt || a.id.localeCompare(b.id);
  function median(values){ const a=[...values].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; }
  function suggestions({history=[],kind,currentItems=[],otherLists=[],preferences={},dismissed=[]}){
    const all = history.filter(h=>!h.deletedAt).sort(compareEvents);
    const typeEvents = all.filter(h=>h.kind===kind);
    const complete = typeEvents.filter(h=>h.mode==='complete' && h.items.some(i=>i.outcome==='bought')).slice(-12);
    const since = complete[0]?.occurredAt || 0;
    const windowEvents = typeEvents.filter(h=>h.occurredAt>=since);
    const current = new Set(currentItems.map(i=>i.productKey || i.shopping?.productKey || keyFor(i.text)));
    const excluded = new Set(dismissed);
    const candidates = new Map();
    const latest = typeEvents.at(-1);
    for(const h of windowEvents) for(const i of h.items) {
      if(i.outcome==='bought' || (h===latest && i.outcome==='missing')) candidates.set(i.productKey,i);
    }
    const result=[];
    for(const [key,item] of candidates){
      if(current.has(key) || excluded.has(key) || preferences[key]?.blocked) continue;
      const purchases = windowEvents.filter(h=>h.items.some(i=>i.productKey===key && i.outcome==='bought'));
      const lastBought = all.filter(h=>h.items.some(i=>i.productKey===key && i.outcome==='bought')).at(-1);
      const missed = latest?.items.some(i=>i.productKey===key && i.outcome==='missing') && (!lastBought || compareEvents(lastBought,latest)<0);
      const gap = lastBought ? complete.filter(h=>compareEvents(h,lastBought)>0).length : 0;
      const intervals = purchases.slice(1).map((h,index)=>Math.max(1,complete.filter(c=>compareEvents(c,purchases[index])>0 && compareEvents(c,h)<=0).length)).slice(-5);
      const interval = intervals.length ? Math.ceil(median(intervals)) : Infinity;
      if(!missed && !(purchases.length>=2 && gap>=Math.max(1,interval-1))) continue;
      const latestItem = lastBought?.items.find(i=>i.productKey===key && i.outcome==='bought') || item;
      const elsewhere = otherLists.find(l=>l.kind && !l.closedAt && !l.deletedAt && l.tasks?.some(t=>!t.deletedAt && (t.shopping?.productKey || keyFor(t.text))===key));
      result.push({...item, quantity:latestItem.quantity, unit:latestItem.unit, categoryId:preferences[key]?.categoryId || item.categoryId,
        reason:missed?'missing':'due', gap, interval, otherListId:elsewhere?.id, otherListTitle:elsewhere?.title,
        explanation:missed?'Não encontrado na última compra':`Há ${gap} ${gap===1?'compra completa':'compras completas'} sem comprar`,
        rank:missed?Infinity:gap/interval });
    }
    return result.sort((a,b)=>b.rank-a.rank || a.name.localeCompare(b.name,'pt-BR'));
  }
  return {kinds,normalize,baseName,keyFor,catalog,categories,identify,itemText,snapshot,suggestions};
});
