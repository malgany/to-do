const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../shopping-core'),products=C.catalog(require('../shopping-catalog'));
const info=(text='Óleo de cozinha',kind='mercado')=>C.identify(text,kind,products);
const event=(id,n,items,mode='complete',kind='mercado')=>({id,occurredAt:n*1000,items,mode,kind});
const bought=(name)=>({...info(name),outcome:'bought'});
const rice=bought('Arroz'),oil=bought('Óleo'),bread=bought('Pão');
test('catalog aliases, quantities and important variants stay distinct',()=>{
  assert.equal(info('ÓLEO - 2 unidades').productKey,'oleo-cozinha');
  assert.equal(info('ÓLEO - 2 unidades').quantity,2);
  assert.notEqual(info('Arroz integral').productKey,info('Arroz branco').productKey);
  assert.notEqual(info('Saco de lixo 15 L').productKey,info('Saco de lixo 30 L').productKey);
  assert.notEqual(info('Medicamento 50mg','farmacia').productKey,info('Medicamento 100mg','farmacia').productKey);
  assert.equal(info('objeto desconhecido').categoryId,'outros');
});
test('manual correction persists on quantity change, new name invalidates identity',()=>{
  const prev={...info('Arroz'),categoryId:'outros',source:'manual'};
  assert.equal(C.identify('Arroz - 2 pacotes','mercado',products,{},prev).categoryId,'outros');
  assert.equal(C.identify('Banana','mercado',products,{},prev).categoryId,'hortifruti');
});
test('removing a quantity clears stale quantities while unchanged preset keeps its structured amount',()=>{
  const prev=info('Arroz - 2 pacotes');assert.equal(C.identify('Arroz','mercado',products,{},prev).quantity,undefined);
  const preset={...info('Arroz'),quantity:1,unit:'pacote'};assert.equal(C.identify('Arroz','mercado',products,{},preset).quantity,1);
});
test('snapshot never counts missing, pending or deleted items as purchases',()=>{
  const p=C.snapshot({id:'a',kind:'mercado',tasks:[{id:'1',text:'A',done:true},{id:'2',text:'B',done:true,notHave:true},{id:'3',text:'C'},{id:'4',text:'D',done:true,deletedAt:1}]});
  assert.deepEqual(p.items.map(i=>i.outcome),['bought','missing','pending']);
});
test('oil on four-round cadence appears after three intervening complete purchases',()=>{
  const h=[event('1',1,[oil]),event('2',2,[bread]),event('3',3,[bread]),event('4',4,[bread]),event('5',5,[oil]),event('6',6,[bread]),event('7',7,[bread])];
  assert.equal(C.suggestions({history:h,kind:'mercado'}).some(i=>i.productKey===oil.productKey),false);
  h.push(event('8',8,[bread]));const s=C.suggestions({history:h,kind:'mercado'}).find(i=>i.productKey===oil.productKey);
  assert.equal(s.gap,3);assert.equal(s.interval,4);
});
test('quick purchases reset purchased product, do not age other products',()=>{
  const h=[event('1',1,[oil,rice]),event('2',2,[oil,rice]),event('3',3,[bread],'quick')];
  assert.equal(C.suggestions({history:h,kind:'mercado'}).length,0);
  h.push(event('4',4,[bread]));assert.equal(C.suggestions({history:h,kind:'mercado'}).length,2);
  h.push(event('5',5,[oil],'quick'));assert.deepEqual(C.suggestions({history:h,kind:'mercado'}).map(i=>i.productKey),[rice.productKey]);
});
test('missing on first purchase is offered; later acquisition anywhere suppresses it',()=>{
  const h=[event('1',1,[{...oil,outcome:'missing'},{...rice,outcome:'pending'}])];
  assert.deepEqual(C.suggestions({history:h,kind:'mercado'}).map(i=>i.reason),['missing']);
  h.push(event('2',2,[oil],'quick','pet'));assert.equal(C.suggestions({history:h,kind:'mercado'}).length,0);
});
test('one-off items, duplicates, dismissed and blocked products are excluded',()=>{
  const history=[event('1',1,[oil,rice]),event('2',2,[rice]),event('3',3,[bread])];
  assert.deepEqual(C.suggestions({history,kind:'mercado'}).map(i=>i.productKey),[rice.productKey]);
  for(const extra of [{currentItems:[rice]},{preferences:{[rice.productKey]:{blocked:true}}},{dismissed:[rice.productKey]}])assert.equal(C.suggestions({history,kind:'mercado',...extra}).length,0);
});
test('empty purchases do not advance a cycle; other open lists are identified',()=>{
  const history=[event('1',1,[rice]),event('2',2,[rice]),event('3',3,[{...oil,outcome:'pending'}])];
  assert.equal(C.suggestions({history,kind:'mercado'}).length,0);
  history.push(event('4',4,[bread]));
  const s=C.suggestions({history,kind:'mercado',otherLists:[{id:'other',kind:'mercado',title:'Feira',tasks:[{shopping:rice}]}]});assert.equal(s[0].otherListId,'other');
});
