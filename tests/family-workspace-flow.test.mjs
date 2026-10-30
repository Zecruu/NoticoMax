// Actual workspace hook, deterministic hook/fetch adapters. Not browser/device QA.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compiled=ts.transpileModule(await readFile(new URL('../src/hooks/use-family-workspace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(ok=>{resolve=ok;});return {promise,resolve};};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
function harness(){
 let index=0,dirty=false,value,household='family',nextTimer=0,auth;
 const slots=[],effects=[],timers=new Map(),listeners=new Map(),calls=[],server={householdId:'family',userId:'first',lists:[],places:[],refreshedAt:new Date().toISOString()};
 const network={get:null,post:null};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={
  useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;dirty=true;}];},
  useRef(initial){const i=index++;return slots[i]??(slots[i]={current:initial});},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
  useEffect(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 const add=(name,fn)=>{const list=listeners.get(name)??new Set();list.add(fn);listeners.set(name,list);};
 const remove=(name,fn)=>listeners.get(name)?.delete(fn);
 globalThis.window={setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>++nextTimer,clearInterval:()=>{},addEventListener:add,removeEventListener:remove};
 globalThis.document={visibilityState:'visible',addEventListener:add,removeEventListener:remove};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET';calls.push({url,method,body:options.body});
  const pending=method==='POST'?network.post:network.get;
  if(!pending)return response(method==='POST'?{ok:true}:server);
  return Promise.race([pending.promise,new Promise((_,reject)=>options.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))]);
 };
 const loaded={exports:{}};
 const modules={react,'@/lib/sync/sync-engine':{performSync:async()=>{}},'@/lib/supabase/client':{getSupabaseBrowserClient:()=>({auth:{onAuthStateChange:fn=>{auth=fn;return {data:{subscription:{unsubscribe:()=>{}}}};}}})}};
 new Function('require','module','exports',compiled)(name=>modules[name],loaded,loaded.exports);
 const render=()=>{index=0;dirty=false;value=loaded.exports.useFamilyWorkspace(household);while(effects.length)effects.shift()();};
 const settle=async()=>{for(let i=0;i<20;i++){await Promise.resolve();if(dirty)render();}};
 const tick=async(ms)=>{for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}await settle();};
 render();
 return {get state(){return value;},calls,network,server,settle,tick,auth:async(event,userId)=>{auth(event,userId?{user:{id:userId}}:null);await settle();},switch:async id=>{household=id;server.householdId=id;render();await tick(0);},event:async name=>{for(const fn of listeners.get(name)??[])fn();await settle();},unmount:()=>{for(const s of slots)s?.cleanup?.();}};
}
const command={action:'entry',listId:'list',entryId:'milk',change:'set_checked',checked:true,revision:1};
test('different entries may save concurrently; repeated taps cannot post the same entry twice',async()=>{
 const h=harness();await h.tick(0);h.network.post=deferred();
 const a=h.state.mutate(command,'milk');await h.settle();
 assert.equal(await h.state.mutate(command,'milk'),false);
 const b=h.state.mutate({...command,entryId:'eggs'},'eggs');await h.settle();
 assert.equal(h.calls.filter(c=>c.method==='POST').length,2);assert.equal(h.state.pending.size,2);
 const gets=h.calls.filter(c=>c.method==='GET').length;await h.state.refresh();assert.equal(h.calls.filter(c=>c.method==='GET').length,gets);
 h.network.post.resolve(response({ok:true}));assert.equal(await a,true);assert.equal(await b,true);await h.settle();assert.equal(h.state.pending.size,0);h.unmount();
});
test('failed refresh keeps readable lists but blocks writes; membership revocation clears data',async()=>{
 const h=harness();h.server.lists=[{id:'list'}];await h.tick(0);h.network.get=deferred();
 const read=h.state.refresh();h.network.get.resolve(response({error:'Unavailable'},503));await read;await h.settle();
 assert.equal(h.state.data.lists.length,1);assert.equal(h.state.fresh,false);await assert.rejects(h.state.mutate(command,'milk'),/refresh/);
 h.network.get=deferred();const revoked=h.state.refresh();h.network.get.resolve(response({error:'Membership removed'},403));await revoked;await h.settle();assert.equal(h.state.data,null);h.unmount();
});
test('a late save from a previous family/account cannot refresh or mutate the new view',async()=>{
 for(const transition of ['family','account']){
  const h=harness();await h.tick(0);h.network.post=deferred();const save=h.state.mutate(command,'milk');await h.settle();
  if(transition==='family')await h.switch('other');else await h.auth('SIGNED_IN','second');
  const calls=h.calls.length;h.network.post.resolve(response({ok:true}));assert.equal(await save,false);await h.settle();assert.equal(h.calls.length,calls);assert.equal(h.state.pending.size,0);
  if(transition==='account')assert.equal(h.state.data,null);else assert.equal(h.state.data.householdId,'other');h.unmount();
 }
});
test('request timeout unlocks controls and reports uncertain saves without silently retrying',async()=>{
 const h=harness();await h.tick(0);h.network.post=deferred();const save=h.state.mutate(command,'milk');const rejection=assert.rejects(save,/may have reached the server/);
 await h.tick(20000);await rejection;await h.settle();assert.equal(h.state.pending.size,0);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
 h.network.get=deferred();const read=h.state.refresh();await h.tick(20000);await read;await h.settle();assert.equal(h.state.fresh,false);assert.match(h.state.error,/timed out/);h.unmount();
});
