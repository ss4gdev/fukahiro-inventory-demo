import { STORAGE_KEY, products, places, roles, productById, placeById, today, seed, total, toBase, formatQty, expiryStatus, transact, correct, isValidState } from './domain.mjs';

const $ = (q, root = document) => root.querySelector(q);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tabs = [{id:'inventory',label:'在庫一覧'}, {id:'movement',label:'入出庫'}, {id:'lots',label:'ロットと期限'}, {id:'history',label:'権限と履歴'}];
const dateLabel = s => s ? `${Number(s.slice(5,7))}/${Number(s.slice(8,10))}` : '未記入';
const timeLabel = s => new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
let state, warning = '', role = 'staff', tab = 'inventory', filter = {search:'',site:'',place:'',expiry:'all'}, historyFilter = {type:'all',actor:'all'}, lastReceipt = null;
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { const parsed = JSON.parse(saved); if (!isValidState(parsed)) throw new Error('invalid'); state = parsed; } else {state = seed(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state));} }
catch {state = seed();warning = '保存データを利用できないため、初期データを一時表示しています。保存できる場合は次の登録時に更新します。';}
function persist(next) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); state = next; warning = ''; }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500); }
function badge(lot) {const s=expiryStatus(lot);return `<span class="badge ${s.key}">${s.text}</span>`;}
function activeLots() {return state.lots.filter(l=>l.qty>0);}
function matches(l) {
  const p=productById(l.productId), place=placeById(l.placeId);
  return (!filter.search || `${p.name} ${p.code} ${l.code}`.toLowerCase().includes(filter.search.toLowerCase())) && (!filter.site||place.site===filter.site) && (!filter.place||place.id===filter.place);
}
function grouped() {
  const map=new Map();
  state.lots.filter(matches).forEach(l=>{const key=l.productId+'|'+l.placeId;if (!map.has(key)) map.set(key,{productId:l.productId,placeId:l.placeId,lots:[],qty:0});const row=map.get(key);row.lots.push(l);row.qty+=l.qty;});
  return [...map.values()];
}
function shell() {
  $('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="#inventory" aria-label="深廣 在庫一覧"><span>深廣</span></a><div class="workspace-label">在庫管理</div><nav aria-label="メインメニュー">${tabs.map(t=>`<button data-tab="${t.id}" class="nav-item ${tab===t.id?'active':''}" ${tab===t.id?'aria-current="page"':''}><span>${t.label}</span></button>`).join('')}</nav><div class="sidebar-actions"><button class="reset-link" data-reset>初期データに戻す</button></div></aside>
  <div class="app-main"><header class="topbar"><div class="breadcrumb">深廣 <span>/</span> <strong>${tabs.find(t=>t.id===tab).label}</strong></div><div class="role-control"><label for="role-select">役割</label><select id="role-select" aria-label="役割"><option value="staff" ${role==='staff'?'selected':''}>スタッフ</option><option value="manager" ${role==='manager'?'selected':''}>マネージャー</option></select></div></header>
  <main id="main">${warning?`<p class="error-box" role="alert">${esc(warning)}</p>`:''}<div id="page"></div><footer class="page-footer"><button data-reset>初期データに戻す</button></footer></main></div>
  <nav class="mobile-nav" aria-label="モバイルメニュー">${tabs.map(t=>`<button data-tab="${t.id}" class="${tab===t.id?'active':''}" ${tab===t.id?'aria-current="page"':''}><span>${t.label}</span></button>`).join('')}</nav>`;
  $('#role-select').addEventListener('change',e=>{role=e.target.value;lastReceipt=null;render();toast(`${roles[role].label}に切り替えました`);});
  $('#app').onclick=onAction;
  renderPage();
}
function render() {shell();}
function navigate(next) {tab=next;lastReceipt=null;render();window.scrollTo({top:0,behavior:'instant'});}
function heading(title,action='') {return `<div class="page-heading"><h1>${title}</h1>${action}</div>`;}
function filtersHTML() {return `<div class="filters"><label class="search-field"><span class="sr-only">商品・ロットを検索</span><input id="search" type="search" placeholder="商品名・商品コード・ロットで検索" value="${esc(filter.search)}"></label><div class="select-filters"><label><span class="sr-only">拠点</span><select id="site-filter"><option value="">すべての拠点</option>${[...new Set(places.map(p=>p.site))].map(s=>`<option ${filter.site===s?'selected':''}>${s}</option>`).join('')}</select></label><label><span class="sr-only">保管場所</span><select id="place-filter"><option value="">すべての保管場所</option>${places.filter(p=>!filter.site||p.site===filter.site).map(p=>`<option value="${p.id}" ${filter.place===p.id?'selected':''}>${filter.site?'':p.site+' / '}${p.name}</option>`).join('')}</select></label></div></div>`;}
function bindFilters(callback) {
  $('#search')?.addEventListener('input',e=>{filter.search=e.target.value;callback();});
  $('#site-filter')?.addEventListener('change',e=>{filter.site=e.target.value;filter.place='';renderPage();});
  $('#place-filter')?.addEventListener('change',e=>{filter.place=e.target.value;callback();});
}
function renderPage() {
  if(tab==='inventory') inventoryPage();
  if(tab==='movement') movementPage();
  if(tab==='lots') lotsPage();
  if(tab==='history') historyPage();
}
function inventoryPage() {
  const lots=activeLots(), near=lots.filter(l=>expiryStatus(l).key==='soon').length, unknown=lots.filter(l=>!l.expiry).length;
  $('#page').innerHTML=heading('在庫一覧',`<button class="button primary" data-open-movement="in">入出庫を登録</button>`)+
  `<section class="stats" aria-label="在庫の概況"><div class="stat"><div><span>全拠点の在庫商品</span><p>${new Set(lots.map(l=>l.productId)).size}<small>品目</small></p></div></div><button class="stat stat-warm" data-expiry="soon"><div><span>3日以内の期限</span><p>${near}<small>ロット</small></p></div></button><button class="stat" data-expiry="unknown"><div><span>期限不明</span><p>${unknown}<small>ロット</small></p></div></button></section>
  <section class="panel inventory-panel"><div class="section-title"><span id="inventory-count" class="result-count"></span><span class="date-stamp">${today().replaceAll('-',' / ')}</span></div>${filtersHTML()}<div id="inventory-results"></div></section>`;
  updateInventory();bindFilters(updateInventory);
}
function updateInventory() {
  const rows=grouped();$('#inventory-count').textContent=`${rows.length}件`;
  $('#inventory-results').innerHTML=rows.length?`<div class="table-head"><span>商品</span><span>保管場所</span><span>在庫数量</span><span>ロット・期限</span><span>操作</span></div><div class="inventory-rows">${rows.map(row=>{
    const p=productById(row.productId), place=placeById(row.placeId), live=row.lots.filter(l=>l.qty>0), nearest=[...live].filter(l=>l.expiry).sort((a,b)=>a.expiry.localeCompare(b.expiry))[0];
    return `<article class="inventory-row"><div class="product-cell"><div><h3>${p.name}</h3><p>${p.code}<span>·</span>${p.category}</p></div></div><div class="location-cell"><div><strong>${place.site}</strong><span>${place.name}</span></div></div><div class="quantity-cell"><strong>${formatQty(row.qty,p)}</strong><span>${p.unit}</span></div><button class="lot-cell" data-show-lots="${p.id}" data-place="${place.id}" aria-label="${esc(p.name+' '+place.site+' '+place.name)}のロットを見る"><span>${live.length}ロット </span>${nearest?badge(nearest):live.length?'<span class="badge unknown">期限不明</span>':'<span class="muted">在庫なし</span>'}${nearest&&live.some(l=>!l.expiry)?'<small>期限不明あり</small>':''}</button><div class="row-actions"><button class="button small outline" data-open-movement="in" data-product="${p.id}" data-place="${place.id}">入荷</button><button class="button small subtle" data-open-movement="out" data-product="${p.id}" data-place="${place.id}" ${row.qty===0?'disabled':''}>使用</button></div></article>`;
  }).join('')}</div>`:empty('該当する在庫がありません','商品名や場所の条件を変更してください。',true);
}
function empty(title,desc,clear=false) {return `<div class="empty"><h3>${title}</h3><p>${desc}</p>${clear?'<button class="button outline" data-clear-filters>絞り込みを解除</button>':''}</div>`;}
function movementPage() {
  $('#page').innerHTML=heading('入出庫')+
  `<div class="movement-layout"><section class="panel form-panel">${movementHTML('in')}</section></div>`;
  bindMovement($('.form-panel'));
}
function options(items,value,label) {return items.map(i=>`<option value="${esc(i.id)}" ${i.id===value?'selected':''}>${esc(label(i))}</option>`).join('');}
function movementHTML(type,productId='fugu',placeId='a-chill',lotId='') {
  const p=productById(productId), available=state.lots.filter(l=>l.productId===productId&&l.placeId===placeId&&l.qty>0).sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999'));
  const lotOptions=available.map(l=>`<option value="${l.id}" ${l.id===lotId?'selected':''}>${esc(l.code)} · 残り${formatQty(l.qty,p)} ${p.unit} · ${l.expiry?dateLabel(l.expiry):'期限不明'}</option>`).join('');
  return `<form id="movement-form" novalidate><div class="segmented" aria-label="登録する操作"><button type="button" data-movement-type="in" class="${type==='in'?'selected':''}" aria-pressed="${type==='in'}">入荷する</button><button type="button" data-movement-type="out" class="${type==='out'?'selected':''}" aria-pressed="${type==='out'}">使用する</button></div><input type="hidden" name="type" value="${type}"><div class="field-grid"><label class="field">商品<select name="productId">${options(products,productId,p=>p.name)}</select></label><label class="field">保管場所<select name="placeId">${options(places,placeId,p=>p.site+' / '+p.name)}</select></label></div><p class="current-stock">この場所の在庫 <strong>${formatQty(total(state,productId,placeId),p)} ${p.unit}</strong></p>
  ${type==='out'?`<label class="field">使用するロット <span class="required">必須</span><select name="lotId" ${!available.length?'disabled':''}>${lotOptions||'<option value="">この場所に在庫がありません</option>'}</select></label><div id="selected-lot-note" class="lot-note"></div>`:''}
  <label class="field" for="quantity">${type==='in'?'入荷':'使用'}数量 <span class="required">必須</span></label><div class="quantity-input"><input id="quantity" name="quantity" type="text" inputmode="${p.unit==='kg'?'decimal':'numeric'}" placeholder="0" autocomplete="off" maxlength="16" aria-describedby="unit-help form-error"><select name="unit" aria-label="数量の単位">${(p.unit==='kg'?['kg','g']:[p.unit]).map(u=>`<option>${u}</option>`).join('')}</select></div><p id="unit-help" class="helper">${p.unit==='kg'?'1 kg = 1,000 g。kgは小数第3位まで。':`${p.unit}は整数で入力してください。`}</p>
  ${type==='in'?`<div class="form-divider"></div><h3 class="form-section-title">ロット情報</h3><div class="field-grid"><label class="field">ロット番号 <span class="required">必須</span><input name="code" value="DEMO-${String(state.lots.length+1).padStart(3,'0')}" maxlength="40"></label><label class="field">入荷日 <span class="required">必須</span><input name="received" type="date" value="${today()}" max="${today()}"></label></div><div class="field-grid"><label class="field">期限の種類<select name="expiryType"><option>消費期限</option><option>賞味期限</option><option>不明</option></select></label><label class="field">期限日 <span id="expiry-required" class="required">必須</span><input name="expiry" type="date" aria-describedby="expiry-help"></label></div><p id="expiry-help" class="helper">期限が分からない場合は「不明」を選択。</p><label class="field">仕入先 <span class="optional">任意</span><input name="supplier" placeholder="例：仕入先A（仮）" maxlength="60"></label>`:''}
  <label class="field">メモ <span class="optional">任意</span><input name="memo" placeholder="${type==='in'?'例：午前の納品':'例：仕込みに使用'}" maxlength="120"></label><div id="movement-preview" class="movement-preview" aria-live="polite">登録後の残量：数量入力後に表示</div><p id="form-error" class="error-box" role="alert" tabindex="-1" hidden></p><button class="button primary submit-button" type="submit" ${type==='out'&&!available.length?'disabled':''}>${type==='in'?'入荷':'使用'}を登録する</button><p class="form-caption">記録者：${roles[role].name}</p></form>`;
}
function bindMovement(root) {
  const form=$('#movement-form',root);
  const refresh=(type,productId,placeId,lotId)=>{root.innerHTML=movementHTML(type,productId,placeId,lotId);bindMovement(root);};
  form.addEventListener('click',e=>{const b=e.target.closest('[data-movement-type]');if(b)refresh(b.dataset.movementType,form.elements.productId.value,form.elements.placeId.value);});
  for(const name of ['productId','placeId']) form.elements[name].addEventListener('change',()=>refresh(form.elements.type.value,form.elements.productId.value,form.elements.placeId.value));
  form.elements.expiryType?.addEventListener('change',()=>{const unknown=form.elements.expiryType.value==='不明';form.elements.expiry.disabled=unknown;$('#expiry-required',form).textContent=unknown?'不要':'必須';if(unknown)form.elements.expiry.value='';});
  function preview() {
    const p=productById(form.elements.productId.value), isIn=form.elements.type.value==='in', lot=state.lots.find(l=>l.id===form.elements.lotId?.value);
    if(!isIn) $('#selected-lot-note',form).innerHTML=lot?`${badge(lot)}<span>${lot.expiryType}${lot.expiry?' '+esc(lot.expiry):''} · 入荷 ${esc(lot.received)}</span>`:'';
    const base=isIn?total(state,p.id,form.elements.placeId.value):(lot?.qty||0);
    const previewEl=$('#movement-preview',form);
    try {const qty=toBase(form.elements.quantity.value,form.elements.unit.value,p);const after=base+(isIn?qty:-qty);previewEl.innerHTML=after<0?'<span class="negative">ロットの残量を超えています。</span>':`<span>${isIn?'この場所の在庫':'選択ロットの残量'}</span><div>${formatQty(base,p)} <small>${p.unit}</small> → <strong>${formatQty(after,p)} <small>${p.unit}</small></strong></div>`;}
    catch {previewEl.textContent='登録後の残量：数量入力後に表示';}
  }
  function updateInput() { const error=$('.error-box',form);error.hidden=true;preview(); }
  form.addEventListener('input',updateInput);form.addEventListener('change',updateInput);preview();
  form.addEventListener('submit',e=>{
    e.preventDefault(); const button=$('[type="submit"]',form);if(button.disabled)return;button.disabled=true;
    try {const input=Object.fromEntries(new FormData(form));const next=transact(state,input,role);persist(next);const event=next.events.at(-1);lastReceipt=event;$('#dialog').close();render();showReceipt(event);toast('在庫・ロット・履歴に反映しました');}
    catch(error){showFormError(form,error);button.disabled=false;}
  });
}
function showFormError(form,error) {const el=$('.error-box',form);el.textContent=error.name==='QuotaExceededError'||error.name==='SecurityError'?'このブラウザに保存できませんでした。登録は反映していません。ブラウザの保存設定をご確認ください。':error.message;el.hidden=false;el.focus();}
function showReceipt(event) {
  const p=productById(event.productId), lot=state.lots.find(l=>l.id===event.lotId);
  const block=document.createElement('div');block.className='receipt';block.setAttribute('role','status');block.innerHTML=`<div><strong>${p.name} ${formatQty(event.qty,p)} ${p.unit}を${event.type==='in'?'入荷':'使用'}しました</strong><p>${esc(lot.code)} · ロット残量 ${formatQty(lot.qty,p)} ${p.unit}</p></div><button class="button small" data-show-lots="${p.id}" data-place="${event.placeId}">ロットを見る</button><button class="button small" data-tab="history">履歴を見る</button>`;$('#page').prepend(block);
}
function openMovement(type,productId,placeId,lotId) {openDialog(`${type==='in'?'入荷':'使用'}を登録`,movementHTML(type,productId||'fugu',placeId||'a-chill',lotId));bindMovement($('.dialog-content'));}
function openDialog(title,content,wide=false) {const d=$('#dialog');d.className=wide?'wide':'';d.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="button small outline dialog-close" data-close>閉じる</button></div><div class="dialog-content">${content}</div>`;d.querySelector('[data-close]').onclick=()=>d.close();d.showModal();d.scrollTop=0;}
function lotsPage() {
  $('#page').innerHTML=heading('ロットと期限')+`<section class="panel">${filtersHTML()}<div class="filter-chips" aria-label="期限の絞り込み">${[['all','すべて'],['soon','3日以内'],['past','期限を経過'],['unknown','期限不明'],['empty','残量ゼロ']].map(([key,label])=>`<button data-lot-filter="${key}" class="chip ${filter.expiry===key?'active':''}" aria-pressed="${filter.expiry===key}">${label}</button>`).join('')}</div><div class="list-caption"><span id="lot-count"></span><span>期限の早い順</span></div><div id="lot-results"></div></section>`;
  updateLots();bindFilters(updateLots);
}
function updateLots() {
  const lots=state.lots.filter(matches).filter(l=>filter.expiry==='empty'?l.qty===0:l.qty>0&&(filter.expiry==='all'||expiryStatus(l).key===filter.expiry)).sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999'));
  $('#lot-count').textContent=`${lots.length}ロット`;
  $('#lot-results').innerHTML=lots.length?`<div class="lot-grid">${lots.map(l=>{
    const p=productById(l.productId),place=placeById(l.placeId);
    return `<article class="lot-card"><div class="lot-card-top"><span class="lot-code">${esc(l.code)}</span>${badge(l)}</div><div class="lot-product"><div><h3>${p.name}</h3><p>${place.site} / ${place.name}</p></div></div><div class="lot-quantity"><span>ロット残量</span><strong>${formatQty(l.qty,p)} <small>${p.unit}</small></strong></div><dl class="lot-details"><div><dt>入荷日</dt><dd>${esc(l.received)}</dd></div><div><dt>${l.expiryType==='不明'?'期限':l.expiryType}</dt><dd>${l.expiry?esc(l.expiry):'不明（未確認）'}</dd></div><div><dt>入荷数量</dt><dd>${formatQty(l.receivedQty,p)} ${p.unit}</dd></div><div><dt>仕入先</dt><dd>${esc(l.supplier)}</dd></div></dl><button class="button outline full" data-open-movement="out" data-product="${p.id}" data-place="${place.id}" data-lot="${l.id}" ${l.qty===0?'disabled':''}>このロットから使用 </button></article>`;
  }).join('')}</div>`:empty('該当するロットがありません','検索や期限の条件を変更してください。',true);
}
function historyPage() {
  $('#page').innerHTML=heading('権限と履歴')+`<section class="permissions-card"><div><div><h2>現在の権限：${roles[role].label}</h2><p>${roles[role].name}</p></div></div><div class="permission-tags"><span>閲覧・入出庫：可</span><span class="${role==='manager'?'':'muted'}">数量の訂正：${role==='manager'?'可能':'マネージャーのみ'}</span></div><details><summary>権限一覧</summary><div class="permission-table"><div><strong>操作</strong><strong>スタッフ</strong><strong>マネージャー</strong></div><div><span>在庫・ロット・全履歴の閲覧</span><span>可</span><span>可</span></div><div><span>入荷・使用の登録</span><span>可</span><span>可</span></div><div><span>理由付きの数量訂正</span><span>不可</span><span>可</span></div></div></details></section><section class="panel"><div class="section-title"><div><h2>操作履歴 <span id="history-count" class="count"></span></h2></div></div><div class="history-filters"><label>操作<select id="history-type">${[['all','すべての操作'],['in','入荷'],['out','使用'],['correction','訂正'],['initial','初期在庫']].map(([v,l])=>`<option value="${v}" ${v===historyFilter.type?'selected':''}>${l}</option>`).join('')}</select></label><label>担当者<select id="history-actor">${[['all','すべての担当者'],['staff','スタッフ'],['manager','マネージャー']].map(([v,l])=>`<option value="${v}" ${v===historyFilter.actor?'selected':''}>${l}</option>`).join('')}</select></label></div><div id="history-results"></div></section>`;
  updateHistory();$('#history-type').onchange=e=>{historyFilter.type=e.target.value;updateHistory();};$('#history-actor').onchange=e=>{historyFilter.actor=e.target.value;updateHistory();};
}
function updateHistory() {
  const entries=[...state.events].reverse().filter(e=>(historyFilter.type==='all'||e.type===historyFilter.type)&&(historyFilter.actor==='all'||(e.type!=='initial'&&e.role===historyFilter.actor)));
  $('#history-count').textContent=`${entries.length}件`;
  $('#history-results').innerHTML=entries.length?`<div class="history-list">${entries.map(e=>{
    const p=productById(e.productId), place=placeById(e.placeId),lot=state.lots.find(l=>l.id===e.lotId),correction=e.type==='correction', labels={in:'入荷',out:'使用',correction:'訂正',initial:'初期在庫'};
    return `<article class="history-entry"><div class="event-content"><div class="event-top"><span class="event-type ${e.type}">${labels[e.type]}</span><time datetime="${e.at}">${timeLabel(e.at)}</time><span>${esc(e.actor)}</span></div><h3>${p.name}<span class="event-quantity">${correction?`${formatQty(e.fromQty,p)} → ${formatQty(e.toQty,p)}`:`${e.type==='out'?'−':e.type==='in'?'+':''}${formatQty(e.originalQty??e.qty,p)}`} <small>${p.unit}</small></span></h3><p class="event-place">${place.site} / ${place.name}<span>·</span>${esc(lot.code)}</p><p class="event-balance">ロット残量 ${formatQty(e.before,p)} → ${formatQty(e.after,p)} ${p.unit}${correction?'（訂正時）':'（記録時）'}</p>${e.memo&&e.type!=='initial'?`<p class="event-memo">${correction?'<strong>訂正理由</strong> ':''}${esc(e.memo)}</p>`:''}${e.corrected?`<p class="corrected-note">訂正済み · 現在の登録数量 ${formatQty(e.qty,p)} ${p.unit}</p>`:''}</div>${['in','out'].includes(e.type)?`<div class="event-action">${role==='manager'?`<button class="button small outline" data-correct="${e.id}">数量を訂正</button>`:'<span class="manager-only">訂正は<br>マネージャー</span>'}</div>`:''}</article>`;
  }).join('')}</div>`:empty('該当する履歴がありません','操作や担当者の条件を変更してください。');
}
function openCorrection(eventId) {
  if(role!=='manager'){toast('訂正はマネージャーの操作です');return;}
  const e=state.events.find(e=>e.id===eventId),p=productById(e.productId),lot=state.lots.find(l=>l.id===e.lotId);
  openDialog('登録した数量を訂正',`<form id="correction-form" novalidate><div class="correction-summary"><strong>${p.name}</strong><p>${esc(lot.code)} · ${e.type==='in'?'入荷':'使用'}の記録</p><p>現在の登録数量 <strong>${formatQty(e.qty,p)} ${p.unit}</strong></p></div><label class="field" for="correct-quantity">正しい${e.type==='in'?'入荷':'使用'}数量 <span class="required">必須</span></label><div class="quantity-input"><input id="correct-quantity" name="quantity" inputmode="${p.unit==='kg'?'decimal':'numeric'}" value="${e.qty/(p.unit==='kg'?1000:1)}" maxlength="16"><select name="unit" aria-label="訂正数量の単位">${(p.unit==='kg'?['kg','g']:[p.unit]).map(u=>`<option>${u}</option>`).join('')}</select></div><p class="helper">残量ではなく、この入出庫で登録すべき数量を入力します。</p><label class="field">訂正理由 <span class="required">必須</span><textarea name="reason" rows="3" maxlength="120" placeholder="例：0.5kgと入力したが、実際の使用量は0.3kgだった"></textarea></label><p class="error-box" role="alert" tabindex="-1" hidden></p><button class="button primary full" type="submit">訂正を登録する</button></form>`);
  $('#correction-form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget,b=$('[type="submit"]',form);if(b.disabled)return;b.disabled=true;try{persist(correct(state,eventId,form.elements.quantity.value,form.elements.unit.value,form.elements.reason.value,role));$('#dialog').close();render();toast('数量を訂正し、理由を履歴に残しました');}catch(error){showFormError(form,error);b.disabled=false;}};
}
function resetDialog() {
  openDialog('初期データに戻しますか？',`<div class="reset-content"><p>このブラウザの入出庫と訂正履歴を消し、初期データに戻します。</p><div class="reset-actions"><button class="button outline" id="cancel-reset">戻る</button><button class="button primary" id="confirm-reset">初期データに戻す</button></div><p class="error-box" role="alert" tabindex="-1" hidden></p></div>`);
  $('#cancel-reset').onclick=()=>$('#dialog').close();$('#confirm-reset').onclick=()=>{try{persist(seed());filter={search:'',site:'',place:'',expiry:'all'};historyFilter={type:'all',actor:'all'};$('#dialog').close();navigate('inventory');toast('初期データに戻しました');}catch(error){showFormError($('.reset-content'),error);}};
}
function onAction(e) {
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.tab)navigate(b.dataset.tab);
  if(b.dataset.openMovement)openMovement(b.dataset.openMovement,b.dataset.product,b.dataset.place,b.dataset.lot);
  if(b.dataset.expiry){filter={search:'',site:'',place:'',expiry:b.dataset.expiry};navigate('lots');}
  if(b.dataset.showLots){filter={search:productById(b.dataset.showLots).code,site:'',place:b.dataset.place,expiry:'all'};navigate('lots');}
  if(b.dataset.lotFilter){filter.expiry=b.dataset.lotFilter;renderPage();}
  if(b.hasAttribute('data-clear-filters')){filter={search:'',site:'',place:'',expiry:'all'};renderPage();}
  if(b.dataset.correct)openCorrection(b.dataset.correct);
  if(b.hasAttribute('data-reset'))resetDialog();
}
window.addEventListener('hashchange',()=>{if(location.hash==='#inventory')navigate('inventory');});
render();
