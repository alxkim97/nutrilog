// One-off generator: copies the v2.12 desktop renderer (legacy/app.js) to
// src/desktop/legacy-app.js with its local-file + sync engine replaced by the
// cloud store (src/desktop/cloudStore.js, exposed as window.NutriCloud).
// Every replaced range is checked against its expected first/last line, so a
// drifted source fails loudly instead of being cut in the wrong place.
import { readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'

const src = readFileSync('legacy/app.js', 'utf8').replace(/^﻿/, '').split('\n')
const edits = []
const at = (start, end, startsWith, endsWith, replacement) => edits.push({ start, end, startsWith, endsWith, replacement })

at(1, 1, 'const FOOD_DB_SEED=', 'const FOOD_DB_SEED=', null) // keep (assert only)
at(2, 2, 'const LOG_SEED=', 'const LOG_SEED=', [
  '// LOG_SEED (Jan–Apr 2026 history baked into the app) removed: every one of its days is in the cloud.',
  '// This script is injected after the page has loaded, so DOMContentLoaded never fires. Run the',
  '// handlers right after the whole script has executed instead — as DOMContentLoaded would.',
  'const __onReady=f=>document.readyState===\'loading\'?document.addEventListener(\'DOMContentLoaded\',f):Promise.resolve().then(f);',
])
at(11, 11, 'const supa = (typeof supabase', 'const supa = (typeof supabase', ['const supa = window.NutriCloud.supa;'])

at(77, 96, 'async function maybeArchiveStaleSession(){', '}', [
  '// Days are stored per date in the cloud, so there is never a stale local session to archive.',
  'async function maybeArchiveStaleSession(){}',
])
at(98, 107, 'async function onSignedIn(){', '}', [
  'async function onSignedIn(){',
  "  document.getElementById('authScreen').style.display='none';",
  '  _syncEnabled=true;',
  '  _lastSyncedAt=new Date();',
  "  setSyncBadge('online',syncName());",
  '  updateAccountSection();',
  '  maybeShowCheckin();',
  '}',
])
at(151, 158, 'async function signOutFromApp(){', '}', [
  'async function signOutFromApp(){',
  '  await window.NutriCloud.signOut();',
  '  location.reload();',
  '}',
])
at(248, 248, '    if(IS_ELECTRON) await window.electronAPI.setActiveProfile(id)', '', ['    await window.NutriCloud.switchProfile(id);'])
at(267, 270, '    // Pull cloud data for the new profile', '    }', [])
const saveProfiles = "await window.NutriCloud.saveProfiles(_profiles).catch(e=>toast('Couldn\\'t save profiles — '+(e.message||e),'err'));"
at(282, 282, '  if(IS_ELECTRON) await window.electronAPI.updateProfileName(id,name)', '', ['  ' + saveProfiles])
at(295, 295, '  if(IS_ELECTRON) await window.electronAPI.addProfile(newProfile)', '', ['  ' + saveProfiles])
at(307, 307, '    if(IS_ELECTRON) await window.electronAPI.deleteProfile(id)', '', ['    ' + saveProfiles])

at(381, 431, 'async function forcePushToCloud(){', '}', [
  '// Every change already saves straight to the cloud; this just flushes anything still waiting.',
  'async function forcePushToCloud(){',
  '  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;await saveSession();}',
  '  const ok=await window.NutriCloud.retryPending();',
  "  toast(ok?'✅ Everything is saved to the cloud':'⚠️ Some changes are still waiting to save — check your connection',ok?'ok':'err');",
  '}',
])

at(473, 598, 'async function sbGet(table){', '}', [
  '/* The old per-table push/pull helpers. Store.set now writes to the cloud itself',
  '   (window.NutriCloud), so these are kept only for their call sites: the ones',
  '   that touch *today* route through Store so the day being logged stays right. */',
  'async function sbGet(){return null;}',
  'async function sbSet(){return true;}',
  'async function sbGetShared(){return null;}',
  'async function sbSetShared(){return true;}',
  'async function sbSetSharedFoodLibMerged(){return true;}',
  'async function sbGetSessions(){return null;}',
  'async function sbGetHistory(){return null;}',
  'async function sbSetHistory(){return true;}',
  'async function sbSetSession(date,mealsArr){',
  '  if(date!==todayStr())return true;',
  "  await Store.set('nutrilog_v1',{date,ts:Date.now(),meals:mealsArr||[]});",
  '  return true;',
  '}',
  '// Deleting a whole day: past days are removed by the history save that always',
  '// accompanies this call; deleting today empties the day being logged.',
  'async function sbDeleteDate(date){',
  '  if(date!==todayStr())return;',
  '  meals=[];render();',
  "  await Store.set('nutrilog_v1',{date,ts:Date.now(),meals:[]});",
  '}',
  'async function sbDeleteSession(date){return sbDeleteDate(date);}',
])

at(600, 811, 'async function pullFromSupabase(){', '}', [
  '// Re-reads everything from the cloud (another device may have changed it) and',
  '// redraws. No merging happens here — saves merge; a refresh just shows the cloud.',
  'async function pullFromSupabase(){',
  '  if(_pullInProgress)return;',
  '  _pullInProgress=true;',
  '  try{',
  '    if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;await saveSession();}',
  "    setSyncBadge('syncing','Syncing…');",
  '    const before=JSON.stringify(meals);',
  '    await window.NutriCloud.reload();',
  '    // an edit made while the refresh was in flight wins; its save merges it in',
  '    await refreshFromCloudCache({keepMeals:JSON.stringify(meals)!==before||!!autoSaveTimer});',
  '    _lastSyncedAt=new Date();',
  "    setSyncBadge('online',syncName());",
  "    const el=document.getElementById('syncLastTime');",
  "    if(el)el.textContent='· '+_lastSyncedAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});",
  '  }catch(e){',
  "    console.warn('Cloud refresh failed',e);",
  "    setSyncBadge('error',window.NutriCloud.hasPending?'Changes waiting to save':'Offline');",
  '  }finally{',
  '    _pullInProgress=false;',
  '  }',
  '}',
  '',
  'async function refreshFromCloudCache({keepMeals=false}={}){',
  "  if(!keepMeals){const d=await Store.get('nutrilog_v1');meals=(d&&d.meals)||[];}",
  '  histIdx={};await indexHistory();',
  "  foodLib=(await Store.get('nutrilog_foodlib'))||[];",
  "  const b=document.getElementById('dbBadge');if(b)b.textContent=foodLib.length;",
  "  mealTemplates=(await Store.get('nutrilog_templates'))||{};",
  '  tplOrder=tplOrder.filter(id=>mealTemplates[id]);',
  '  Object.keys(mealTemplates).forEach(id=>{if(!tplOrder.includes(id))tplOrder.push(id);});',
  "  _recipes=(await Store.get('nutrilog_recipes'))||{};",
  "  dayNotes=(await Store.get('nutrilog_daynotes'))||{};",
  '  buildSidebarRows();render();renderRecipes();',
  "  if(document.getElementById('page-history')?.classList.contains('active'))renderCalendar();",
  '  renderQuickTemplates();renderRecentMeals();renderTplSuggestion();renderPendingWidget();',
  "  setTimeout(()=>{if(typeof clearDirty==='function')clearDirty();},50);",
  '}',
])

at(813, 873, '/* ── Store: unified local + cloud ── */', '};', [
  '/* ── Store: the cloud (window.NutriCloud — src/desktop/cloudStore.js) ──',
  '   get() answers from the in-memory copy of the profile\'s cloud rows; set() saves',
  '   with a three-way merge and returns what was actually saved, which can include',
  '   changes made on another device meanwhile — those are adopted below. A failed',
  '   save is kept and retried by NutriCloud; it never throws into the UI code. */',
  "const DEVICE_ONLY_KEYS=new Set(['nutrilog_synclog','nutrilog_tpl_dismissed','nutrilog_history_meta']);",
  'const Store = {',
  '  _localGet(key){ return Promise.resolve(window.NutriCloud.get(key)); },',
  '  _localSet(key,value){ return Store.set(key,value); },',
  '  async get(key){ return window.NutriCloud.get(key); },',
  '  async set(key,value){',
  '    if(DEVICE_ONLY_KEYS.has(key))return window.NutriCloud.set(key,value);',
  "    const sentMeals=key==='nutrilog_v1'?JSON.stringify(value?.meals||[]):null;",
  "    setSyncBadge('syncing','Saving…');",
  '    try{',
  '      const merged=await window.NutriCloud.set(key,value);',
  '      _lastSyncedAt=new Date();',
  "      setSyncBadge('online',syncName());",
  "      const el=document.getElementById('syncLastTime');",
  "      if(el)el.textContent='· '+_lastSyncedAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});",
  '      adoptMerged(key,value,merged,sentMeals);',
  '      return merged;',
  '    }catch(e){',
  "      console.warn('Cloud save failed',key,e);",
  "      appendSyncLog({type:'push_fail',table:key,error:e?.message||String(e),at:new Date().toISOString()});",
  "      setSyncBadge('error','Not saved — retrying');",
  "      toast('⚠️ Couldn\\'t save to the cloud — it will retry when you\\'re back online','err');",
  '    }',
  '  }',
  '};',
  '',
  '// Apply what another device changed meanwhile — only if this window hasn\'t',
  '// changed the same value again since sending it (its next save merges that).',
  'function adoptMerged(key,value,merged,sentMeals){',
  '  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);',
  "  if(key==='nutrilog_v1'){",
  '    if(JSON.stringify(meals)===sentMeals&&!eq(merged.meals,meals)){meals=merged.meals;render();}',
  "  }else if(key==='nutrilog_history'){",
  '    const today=todayStr();',
  '    const changed=Object.keys(merged).some(d=>d!==today&&!eq(merged[d],value?.[d]))||Object.keys(value||{}).some(d=>d!==today&&!(d in merged));',
  '    if(changed){',
  '      Object.keys(histIdx).forEach(d=>{if(d!==today&&!(d in merged))delete histIdx[d];});',
  '      Object.keys(merged).forEach(d=>{if(d!==today)histIdx[d]=merged[d];});',
  "      if(document.getElementById('page-history')?.classList.contains('active'))renderCalendar();",
  '    }',
  "  }else if(key==='nutrilog_foodlib'){",
  "    if(eq(foodLib,value)&&!eq(merged,value)){foodLib=merged;const b=document.getElementById('dbBadge');if(b)b.textContent=foodLib.length;}",
  "  }else if(key==='nutrilog_templates'){",
  '    if(eq(mealTemplates,value)&&!eq(merged,value)){mealTemplates=merged;renderQuickTemplates();}',
  "  }else if(key==='nutrilog_recipes'){",
  '    if(eq(_recipes,value)&&!eq(merged,value)){_recipes=merged;renderRecipes();}',
  '  }',
  '}',
])

at(909, 939, '// Hiding the window to the tray', '},5*60*1000);', [
  '// Coming back to the window: show whatever other devices saved meanwhile.',
  "document.addEventListener('visibilitychange',()=>{",
  '  if(!document.hidden&&_supaUser)pullFromSupabase().catch(e=>console.warn(\'Resume refresh failed\',e));',
  '});',
  '',
  "// While visible, check today's row once a minute so a phone log shows up",
  '// without a refresh. Skipped while this window has an edit not yet saved.',
  'setInterval(async()=>{',
  "  if(document.hidden||!_supaUser||_pullInProgress||autoSaveTimer||_saveState==='saving'||window.NutriCloud.hasPending)return;",
  '  try{',
  '    const before=JSON.stringify(meals);',
  '    const remote=await window.NutriCloud.peekToday();',
  '    if(!remote||autoSaveTimer||JSON.stringify(meals)!==before)return;',
  '    window.NutriCloud.acceptToday(remote);',
  '    meals=remote.map(m=>({...m}));',
  '    histIdx[todayStr()]=meals.map(m=>({...m}));',
  '    render();renderRecentMeals();',
  "  }catch(e){console.warn('Today refresh failed',e);}",
  '},60*1000);',
])

at(1173, 1208, '// Safety-net: push today', '},30*1000);', [
  '// (The 30-second "safety-net" push is gone: every save goes straight to the cloud.)',
])
at(1251, 1260, '// Bulk cloud wipe used by "Clear ALL history"', '}', [
  '// "Clear ALL history" saves an empty history, which deletes every past day in the cloud.',
  'async function sbDeleteAllHistory(){}',
])

at(1338, 1338, "document.addEventListener('DOMContentLoaded',async ()=>{", '', ['__onReady(async ()=>{'])
at(1383, 1395, '  // Load profiles first', '  }', [
  '  // Profiles and every value Store serves were loaded from the cloud before this script ran.',
  '  _profiles=window.NutriCloud.profiles.map(p=>({...p}));',
  '  _activeProfile=window.NutriCloud.profileId;',
  '  _activeProfileName=_profiles.find(p=>p.id===_activeProfile)?.name||_activeProfile;',
  '  if(!IS_ELECTRON){',
  '    _appVersion=window.NutriCloud.appVersion;',
  "    const vl=document.getElementById('appVersionLabel');if(vl)vl.textContent='v'+_appVersion;",
  '  }',
  '  updateProfileToggle();',
])
at(1412, 1443, '  // Always archive any stale session', '  }', [
  '  _supaUser=window.NutriCloud.user;',
  '  await onSignedIn();',
])
at(1457, 1505, 'let _currentDateStr=todayStr();', '}', [
  'let _currentDateStr=todayStr();',
  'function tick(){',
  '  const n=new Date();',
  "  document.getElementById('timePill').textContent=",
  "    n.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});",
  '  // New day (midnight, or the PC waking from sleep)',
  "  const nowDateStr=n.getFullYear()+'-'+pad2(n.getMonth()+1)+'-'+pad2(n.getDate());",
  '  if(nowDateStr!==_currentDateStr){',
  '    const prev=_currentDateStr;',
  '    _currentDateStr=nowDateStr;',
  '    handleDayRollover(prev);',
  '  }',
  '}',
  '',
  '// Yesterday is already in the cloud (every save writes the day), so a new day',
  '// only needs an unsaved edit filed under the date it belongs to, then a reload.',
  'async function handleDayRollover(prevDate){',
  '  _rolloverInProgress=true;',
  '  try{',
  '    if(autoSaveTimer){',
  '      clearTimeout(autoSaveTimer);autoSaveTimer=null;',
  "      const h=(await Store.get('nutrilog_history'))||{};",
  '      h[prevDate]=meals.map(m=>({...m,date:prevDate}));',
  "      await Store.set('nutrilog_history',h);",
  '    }',
  '    meals=[];',
  '    await window.NutriCloud.reload();',
  '    await refreshFromCloudCache();',
  "    setSavePill('saved');",
  "    toast('New day started 📅','info');",
  "  }catch(e){console.warn('handleDayRollover error',e);}",
  '  finally{_rolloverInProgress=false;}',
  '}',
])

// the two explicit "delete these days" actions may remove more than a month at once
at(3053, 3053, "    await Store.set('nutrilog_history',{})", '', [
  '    window.NutriCloud.allowMassDeleteOnce();',
  "    await Store.set('nutrilog_history',{}).catch(e=>console.warn('History clear failed',e));",
])
at(3904, 3904, "    await Store.set('nutrilog_history',h)", '', [
  '    window.NutriCloud.allowMassDeleteOnce();',
  "    await Store.set('nutrilog_history',h).catch(e=>console.warn('History save failed',e));",
])
at(3859, 3866, "  // Seed data is Alex's personal historical logs", '  }', [])
at(6511, 6511, "document.addEventListener('DOMContentLoaded',()=>{", '', ['__onReady(()=>{'])

// apply bottom-up so earlier line numbers stay valid
edits.sort((a, b) => b.start - a.start)
for (const e of edits) {
  const first = src[e.start - 1], last = src[e.end - 1]
  if (!first.startsWith(e.startsWith)) throw new Error(`line ${e.start}: expected "${e.startsWith}", got "${first.slice(0, 80)}"`)
  if (e.endsWith && last.trimEnd() !== e.endsWith && !last.startsWith(e.endsWith)) throw new Error(`line ${e.end}: expected "${e.endsWith}", got "${last.slice(0, 80)}"`)
  if (e.replacement === null) continue
  src.splice(e.start - 1, e.end - e.start + 1, ...(e.replacement || []))
}
// v2.12.0 shipped calls to dqDayLine() (History day detail) and dqAvgRows()
// (Analysis) after commit fb5f500 deleted both. Restore them verbatim from the
// commit before (edd0dfd); function declarations hoist, so appending works.
const prev = execFileSync('git', ['show', 'edd0dfd:src/app.js']).toString().replace(/^﻿/, '').split('\n')
const extract = (name) => {
  const i = prev.findIndex(l => l.startsWith(`function ${name}(`))
  if (i < 0) throw new Error(`${name} not found in edd0dfd`)
  let depth = 0, started = false
  for (let j = i; j < prev.length; j++) {
    for (const c of prev[j]) { if (c === '{') { depth++; started = true } else if (c === '}') depth-- }
    if (started && depth === 0) return prev.slice(i, j + 1)
  }
  throw new Error(`${name}: unbalanced braces`)
}
if (src.some(l => l.startsWith('function dqDayLine(') || l.startsWith('function dqAvgRows('))) throw new Error('already defined — remove the restore step')
src.push('', '/* Restored from commit edd0dfd — v2.12.0 still called these after fb5f500 removed them. */', ...extract('dqDayLine'), ...extract('dqAvgRows'), '')

writeFileSync('src/desktop/legacy-app.js', src.join('\n'))
console.log('wrote src/desktop/legacy-app.js —', src.length, 'lines')
