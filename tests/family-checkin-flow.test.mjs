// Execute the real hook with deterministic hook/network/clock adapters. These
// tests cover asynchronous intent, not browser layout or native permissions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source=await readFile(new URL("../src/hooks/use-family-checkins.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
function harness() {
  let index=0,dirty=false,value,household="family",captureCount=0,nextTimer=0;
  const slots=[],effects=[],timers=new Map(),listeners=new Map(),calls=[];
  const capture=deferred();
  const server={userId:"self",sharingEnabled:false,checkins:[],failPause:false};
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],(next)=>{slots[i]=typeof next==="function"?next(slots[i]):next;dirty=true;}];},
    useRef(initial){const i=index++;return slots[i]??(slots[i]={current:initial});},
    useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:undefined};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const add=(event,fn)=>{const set=listeners.get(event)??new Set();set.add(fn);listeners.set(event,set);};
  const remove=(event,fn)=>listeners.get(event)?.delete(fn);
  globalThis.window={setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:(id)=>timers.delete(id),setInterval:()=>++nextTimer,clearInterval:()=>{},addEventListener:add,removeEventListener:remove};
  globalThis.document={visibilityState:"visible",addEventListener:add,removeEventListener:remove};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{onLine:true}});
  globalThis.fetch=async(url,options={})=>{
    const method=options.method??"GET";calls.push({url,method,body:options.body});
    if(method==="PATCH") {
      const enabled=JSON.parse(options.body).enabled;
      if(!enabled&&server.failPause)return {ok:false,status:503,json:async()=>({error:"offline"})};
      server.sharingEnabled=enabled;if(!enabled)server.checkins=[];
    }
    if(method==="POST")server.checkins=[{userId:"self",...JSON.parse(options.body),sharedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}];
    if(method==="DELETE")server.checkins=[];
    return {ok:true,status:200,json:async()=>structuredClone(server)};
  };
  const loaded={exports:{}};
  const modules={react,"@/lib/geolocation":{getCurrentCoords:()=>{captureCount++;return capture.promise;}},"@/lib/supabase/client":{getSupabaseBrowserClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}})}};
  new Function("require","module","exports",compiled)((name)=>modules[name],loaded,loaded.exports);
  const render=()=>{index=0;dirty=false;value=loaded.exports.useFamilyCheckins(household);while(effects.length)effects.shift()();};
  const settle=async()=>{for(let i=0;i<12;i++){await Promise.resolve();if(dirty)render();}};
  const runInitial=async()=>{for(const [id,timer]of timers){if(timer.ms===0){timers.delete(id);timer.fn();}}await settle();};
  const event=async(name)=>{for(const fn of listeners.get(name)??[])fn();await settle();};
  render();
  return {get state(){return value;},get captures(){return captureCount;},server,calls,capture,settle,runInitial,event,
    switch:async(next)=>{household=next;render();await runInitial();},
    unmount:()=>{for(const slot of slots)slot?.cleanup?.();},
  };
}
const coords=()=>({latitude:0,longitude:0,accuracy:14,capturedAt:new Date().toISOString()});

test("enabling consent never reads GPS; a check-in requires a separate tap and repeated taps share once",async()=>{
  const h=harness();await h.runInitial();assert.equal(h.state.ready,true);assert.equal(h.captures,0);
  await h.state.share();assert.equal(h.captures,0);
  await h.state.enable();await h.settle();assert.equal(h.captures,0);assert.equal(h.state.sharingEnabled,true);
  const first=h.state.share();await h.settle();await h.state.share();assert.equal(h.captures,1);
  h.capture.resolve(coords());await first;await h.settle();
  assert.equal(h.calls.filter((c)=>c.method==="POST").length,1);assert.equal(h.state.checkins.length,1);h.unmount();
});

test("pause cancels an outstanding OS location prompt and cannot be undone by its late result",async()=>{
  const h=harness();await h.runInitial();await h.state.enable();await h.settle();
  const sharing=h.state.share();await h.settle();await h.state.pause();await h.settle();
  h.capture.resolve(coords());await sharing;await h.settle();
  assert.equal(h.state.sharingEnabled,false);assert.equal(h.calls.filter((c)=>c.method==="POST").length,0);assert.equal(h.state.pending,null);h.unmount();
});

test("hiding the screen or going offline cancels pending capture instead of sending on return",async()=>{
  for(const transition of ["hidden","offline"]){
    const h=harness();await h.runInitial();await h.state.enable();await h.settle();const sharing=h.state.share();await h.settle();
    if(transition==="hidden"){document.visibilityState="hidden";await h.event("visibilitychange");}
    else {navigator.onLine=false;await h.event("offline");}
    h.capture.resolve(coords());await sharing;await h.settle();
    assert.equal(h.calls.filter((c)=>c.method==="POST").length,0);assert.deepEqual(h.state.checkins,[]);assert.equal(h.state.ready,false);h.unmount();
  }
});

test("leaving or switching families during capture never posts to the old or new family",async()=>{
  for(const transition of ["unmount","switch"]){
    const h=harness();await h.runInitial();await h.state.enable();await h.settle();const sharing=h.state.share();await h.settle();
    if(transition==="unmount")h.unmount();else await h.switch("another-family");
    h.capture.resolve(coords());await sharing;await h.settle();assert.equal(h.calls.filter((c)=>c.method==="POST").length,0);h.unmount();
  }
});

test("permission denial keeps location off-server, and failed pause never claims revocation succeeded",async()=>{
  const h=harness();await h.runInitial();await h.state.enable();await h.settle();const sharing=h.state.share();
  h.capture.reject(new Error("Location permission denied"));await sharing;await h.settle();
  assert.match(h.state.error,/permission denied/);assert.equal(h.calls.filter((c)=>c.method==="POST").length,0);
  h.server.failPause=true;await h.state.pause();await h.settle();assert.equal(h.state.sharingEnabled,true);assert.match(h.state.error,/Pause could not be confirmed/);h.unmount();
});
