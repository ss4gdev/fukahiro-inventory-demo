export const STORAGE_KEY = 'fkhr-inventory-demo-v1';
export const products = [
  { id: 'fugu', name: 'とらふぐ 切身（仮）', category: '鮮魚・原料', unit: 'kg', icon: 'fish', code: 'D-001' },
  { id: 'scallop', name: '生ほたて（仮）', category: '貝類・原料', unit: 'kg', icon: 'shell', code: 'D-002' },
  { id: 'crab', name: 'ずわいがに 脚（仮）', category: '冷凍・原料', unit: 'kg', icon: 'snow', code: 'D-003' },
  { id: 'set', name: 'ふぐ鍋セット（仮）', category: '商品', unit: 'パック', icon: 'box', code: 'D-004' },
  { id: 'ponzu', name: 'ぽん酢 300ml（仮）', category: '調味料', unit: '本', icon: 'bottle', code: 'D-005' },
  { id: 'aji', name: '真あじ（仮）', category: '鮮魚・原料', unit: '尾', icon: 'fish', code: 'D-006' },
];
export const places = [
  { id: 'a-chill', site: 'A店（仮）', name: '冷蔵庫（仮）' },
  { id: 'a-freeze', site: 'A店（仮）', name: '冷凍庫（仮）' },
  { id: 'b-chill', site: 'B店（仮）', name: '冷蔵庫（仮）' },
];
export const roles = {
  staff: { label: 'スタッフ', name: 'スタッフ 花子（仮）' },
  manager: { label: 'マネージャー', name: 'マネージャー 太郎（仮）' },
};
export const productById = id => products.find(p => p.id === id);
export const placeById = id => places.find(p => p.id === id);
export function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()); }
export function offsetDate(date, days) { return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function validDate(s) { const ms = Date.parse(s + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number(s.slice(0, 4)) >= 1900 && Number(s.slice(0, 4)) <= 2200 && Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === s; }
export function expiryStatus(lot, day = today()) {
  if (!lot.expiry) return { key: 'unknown', text: '期限不明', days: null };
  const days = Math.round((Date.parse(lot.expiry + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000);
  if (days < 0) return { key: 'past', text: `${Math.abs(days)}日前の期限`, days };
  if (days === 0) return { key: 'soon', text: '本日期限', days };
  if (days <= 3) return { key: 'soon', text: `あと${days}日`, days };
  return { key: 'normal', text: `あと${days}日`, days };
}
export function formatQty(base, product) { return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(product.unit === 'kg' ? base / 1000 : base); }
export function toBase(raw, unit, product) {
  const value = String(raw ?? '').trim();
  if (!value) throw new Error('数量を入力してください。');
  if (!/^(?:\d+)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error('数量は0より大きい数値で入力してください。');
  if (!(product.unit === 'kg' ? ['kg', 'g'] : [product.unit]).includes(unit)) throw new Error('この商品の単位を選んでください。');
  const decimal = value.split('.')[1] || '';
  if (decimal.length > (unit === 'kg' ? 3 : 0)) throw new Error(unit === 'kg' ? 'kgは小数第3位（1g）まで入力できます。' : `${unit}は整数で入力してください。`);
  const base = Math.round(Number(value) * (unit === 'kg' ? 1000 : 1));
  if (!Number.isSafeInteger(base) || base > 1000000000) throw new Error('数量が大きすぎます。入力内容を確認してください。');
  return base;
}
function cleanText(raw, label, required = false, max = 120) {
  const value = String(raw ?? '').trim();
  if (required && !value) throw new Error(`${label}を入力してください。`);
  if (value.length > max) throw new Error(`${label}は${max}文字以内で入力してください。`);
  return value;
}
function id() { return crypto.randomUUID(); }
export function seed(day = today()) {
  const specs = [
    ['fugu','a-chill',4800,-1,1,'消費期限'], ['fugu','a-chill',3200,0,3,'消費期限'],
    ['scallop','a-chill',2400,-1,0,'消費期限'], ['crab','a-freeze',12000,-7,45,'賞味期限'],
    ['set','a-freeze',18,-4,30,'賞味期限'], ['ponzu','a-chill',24,-10,120,'賞味期限'],
    ['fugu','b-chill',3600,-1,2,'消費期限'], ['ponzu','b-chill',12,-8,null,'不明'],
    ['aji','b-chill',16,0,1,'消費期限'], ['scallop','b-chill',600,-3,-1,'消費期限'],
  ];
  const lots = specs.map(([productId,placeId,qty,received,expires,expiryType],i) => ({
    id: `seed-lot-${i+1}`, code: `DEMO-${String(i+1).padStart(3,'0')}`, productId, placeId, qty, receivedQty: qty,
    received: offsetDate(day,received), supplier: i % 2 ? '仕入先B（仮）' : '仕入先A（仮）', expiryType,
    expiry: expires === null ? '' : offsetDate(day,expires),
  }));
  const events = lots.map((lot,i) => ({ id: `seed-event-${i+1}`, type: 'initial', lotId: lot.id, productId: lot.productId, placeId: lot.placeId, qty: lot.qty, before: 0, after: lot.qty, actor: '初期データ（仮）', role: 'manager', at: `${day}T08:00:00+09:00`, memo: '商談用の初期在庫' }));
  lots[0].qty -= 500;
  events.push({ id: 'seed-out', type: 'out', lotId: lots[0].id, productId: 'fugu', placeId: 'a-chill', qty: 500, originalQty: 500, before: 4800, after: 4300, actor: roles.staff.name, role: 'staff', at: `${day}T09:00:00+09:00`, memo: '仕込みに使用（操作例）' });
  return { version: 1, seedDate: day, lots, events };
}
export function total(state, productId, placeId) { return state.lots.filter(l => l.productId === productId && (!placeId || l.placeId === placeId)).reduce((s,l) => s+l.qty,0); }
export function transact(state, input, role, now = new Date().toISOString()) {
  if (!roles[role]) throw new Error('デモの役割を選択してください。');
  const next = structuredClone(state);
  const product = productById(input.productId);
  if (!product || !placeById(input.placeId)) throw new Error('商品と保管場所を選択してください。');
  if (!['in','out'].includes(input.type)) throw new Error('入荷または使用を選択してください。');
  const qty = toBase(input.quantity, input.unit, product);
  const memo = cleanText(input.memo, 'メモ');
  let lot;
  if (input.type === 'in') {
    const code = cleanText(input.code, 'ロット番号', true, 40);
    if (next.lots.some(l => l.code === code)) throw new Error('同じロット番号があります。別の番号を入力してください。');
    if (!validDate(input.received)) throw new Error('入荷日を正しく入力してください。');
    if (input.received > today()) throw new Error('入荷日は本日以前の日付にしてください。');
    if (!['消費期限','賞味期限','不明'].includes(input.expiryType)) throw new Error('期限の種類を選んでください。');
    if (input.expiryType !== '不明' && !validDate(input.expiry)) throw new Error('期限日を入力するか、期限の種類を「不明」にしてください。');
    lot = { id: id(), code, productId: product.id, placeId: input.placeId, qty: 0, receivedQty: qty, received: input.received, supplier: cleanText(input.supplier,'仕入先',false,60) || '仕入先未記入（仮）', expiryType: input.expiryType, expiry: input.expiryType === '不明' ? '' : input.expiry };
    next.lots.push(lot);
  } else {
    lot = next.lots.find(l => l.id === input.lotId && l.productId === product.id && l.placeId === input.placeId);
    if (!lot) throw new Error('使用するロットを選んでください。');
    if (qty > lot.qty) throw new Error(`このロットの残量は${formatQty(lot.qty,product)} ${product.unit}です。残量以内で入力してください。`);
  }
  const before = lot.qty;
  lot.qty += input.type === 'in' ? qty : -qty;
  next.events.push({ id: id(), type: input.type, lotId: lot.id, productId: product.id, placeId: lot.placeId, qty, originalQty: qty, before, after: lot.qty, actor: roles[role].name, role, at: now, memo });
  return next;
}
export function correct(state, eventId, raw, unit, reason, role, now = new Date().toISOString()) {
  if (role !== 'manager') throw new Error('数量の訂正は、デモではマネージャーが行います。');
  const next = structuredClone(state);
  const original = next.events.find(e => e.id === eventId && ['in','out'].includes(e.type));
  if (!original) throw new Error('訂正できる入出庫記録がありません。');
  const product = productById(original.productId);
  const qty = toBase(raw,unit,product);
  const note = cleanText(reason,'訂正理由',true);
  if (qty === original.qty) throw new Error('変更後の数量が同じです。異なる数量を入力してください。');
  const lot = next.lots.find(l => l.id === original.lotId);
  const delta = (qty-original.qty) * (original.type === 'in' ? 1 : -1);
  if (lot.qty + delta < 0) throw new Error('訂正するとロットの残量がマイナスになります。入力数量と、その後の使用記録を確認してください。');
  next.events.push({ id: id(), type: 'correction', targetId: original.id, lotId: lot.id, productId: product.id, placeId: lot.placeId, qty: Math.abs(delta), delta, fromQty: original.qty, toQty: qty, before: lot.qty, after: lot.qty+delta, actor: roles.manager.name, role, at: now, memo: note });
  lot.qty += delta;
  if (original.type === 'in') lot.receivedQty += delta;
  original.qty = qty;
  original.corrected = true;
  return next;
}
export function isValidState(value) {
  return value?.version === 1 && validDate(value.seedDate) && Array.isArray(value.lots) && value.lots.length > 0 && Array.isArray(value.events)
    && value.lots.every(l => typeof l.id === 'string' && typeof l.code === 'string' && typeof l.supplier === 'string' && productById(l.productId) && placeById(l.placeId) && Number.isSafeInteger(l.qty) && l.qty >= 0 && Number.isSafeInteger(l.receivedQty) && l.receivedQty >= 0 && validDate(l.received) && ['消費期限','賞味期限','不明'].includes(l.expiryType) && (l.expiry === '' || validDate(l.expiry)))
    && value.events.every(e => typeof e.id === 'string' && ['initial','in','out','correction'].includes(e.type) && productById(e.productId) && placeById(e.placeId) && value.lots.some(l => l.id === e.lotId) && Number.isSafeInteger(e.qty) && e.qty >= 0 && Number.isFinite(Date.parse(e.at)) && typeof e.actor === 'string' && typeof e.memo === 'string');
}
