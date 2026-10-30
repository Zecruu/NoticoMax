// Behavioral tests execute the actual TypeScript engine with in-memory adapters.
// This is not a substitute for IndexedDB/Supabase multi-device integration QA.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/sync/sync-engine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const clone = (value) => structuredClone(value);
function table() {
  let rows=[];let seq=1;
  const select=(predicate)=>({
    first:async()=>clone(rows.find(predicate)), toArray:async()=>clone(rows.filter(predicate)),
    count:async()=>rows.filter(predicate).length,
    delete:async()=>{rows=rows.filter((row)=>!predicate(row));},
    modify:async(fn)=>{for(const row of rows.filter(predicate))fn(row);},
  });
  return {
    toArray:async()=>clone(rows), where:(key)=>({equals:(value)=>select((row)=>row[key]===value)}),
    orderBy:(key)=>({toArray:async()=>clone([...rows].sort((a,b)=>String(a[key]).localeCompare(String(b[key]))))}),
    add:async(row)=>{rows.push({...clone(row),id:row.id??seq++});},
    update:async(id,patch)=>{const row=rows.find((row)=>row.id===id);if(row)Object.assign(row,clone(patch));},
    bulkDelete:async(ids)=>{rows=rows.filter((row)=>!ids.includes(row.id));},
  };
}
const now="2026-10-30T10:00:00.000Z";
const folderRow=(values={})=>({client_id:"folder",user_id:"owner",name:"Family",household_id:"family",share_mode:"all",deleted:false,created_at:now,updated_at:now,can_write:true,...values});
const itemRow=(values={})=>({client_id:"note",user_id:"owner",type:"note",title:"Server",content:"Original",household_id:"family",folder_id:"folder",tags:[],pinned:false,deleted:false,created_at:now,updated_at:now,can_write:true,...values});
const localItem=(values={})=>({clientId:"note",serverId:"note",ownerUserId:"owner",familyAccountId:"member",canWrite:true,type:"note",title:"Local edit",content:"Pending",householdId:"family",folderId:"folder",tags:[],pinned:false,deleted:false,createdAt:now,updatedAt:now,...values});
const op=(values={})=>({entityType:"item",clientId:"note",action:"update",timestamp:now,data:{title:"Local edit"},...values});
function fixture() {
  const db=Object.fromEntries(["items","folders","locations","budgetCategories","budgetTransactions","budgetCategoryOverrides","goals","syncQueue"].map((key)=>[key,table()]));
  db.transaction=async(...args)=>args.at(-1)();
  const state={snapshot:{user_id:"member",folders:[folderRow()],items:[itemRow()]},writes:[],queries:[],rpcError:null,onWrite:null,onSnapshot:null};
  const client={
    auth:{getUser:async()=>({data:{user:{id:"member"}},error:null})},
    rpc:async()=>{await state.onSnapshot?.();return {data:clone(state.snapshot),error:state.rpcError};},
    from:(name)=>{
      const request={table:name,action:"select",payload:null};state.queries.push(request);
      const chain={
        limit:()=>chain,select:()=>chain,eq:()=>chain,is:()=>chain,gt:()=>chain,order:()=>chain,range:()=>chain,single:()=>chain,maybeSingle:()=>chain,
        delete:()=>{request.action="delete";return chain;},
        update:(payload)=>{request.action="update";request.payload=clone(payload);return chain;},
        upsert:(payload)=>{request.action="upsert";request.payload=clone(payload);return chain;},
        throwOnError:async()=>{
          if(request.action!=="select") {state.writes.push(clone(request));await state.onWrite?.(request);return {data:{client_id:"note"},error:null};}
          return {data:name==="budget_settings"?null:[],error:null};
        },
      };return chain;
    },
    removeChannel:()=>{},
  };
  const notifications=[];
  const requires={
    "@/lib/db/indexed-db":db,"uuid":{v4:()=>"new-id"},
    "@/lib/capacitor/local-notifications":{scheduleReminderNotification:()=>{},cancelReminderNotification:async(id)=>notifications.push(id)},
    "@/lib/device":{getDeviceId:()=>"device",saveDeviceNameMapping:()=>{},getDeviceName:()=>"Test"},
    "@/lib/supabase/client":{getSupabaseBrowserClient:()=>client},
  };
  const loadedModule={exports:{}};
  new Function("require","module","exports",compiled)((key)=>{if(!(key in requires))throw new Error(`Unexpected import ${key}`);return requires[key];},loadedModule,loadedModule.exports);
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{onLine:true}});
  const engine=loadedModule.exports;engine.setSyncContext(false,"member");
  return {db,state,engine,notifications};
}

test("free Family sends collaborator edits by UPDATE preserving the author, never personal notes, secrets, budget or saved locations",async()=>{
  const {db,state,engine}=fixture();
  await db.items.add(localItem());await db.syncQueue.add(op());
  for(const type of ["note","credential","envvar"]) {
    const id=`private-${type}`;await db.items.add(localItem({clientId:id,householdId:undefined,folderId:undefined,type}));await db.syncQueue.add(op({clientId:id}));
  }
  await db.syncQueue.add(op({entityType:"location",clientId:"place"}));
  await db.syncQueue.add(op({entityType:"budget_settings",clientId:"income",data:{monthly_income:100}}));
  assert.equal(await engine.performSync(),true);
  assert.equal(state.writes.length,1);assert.equal(state.writes[0].action,"update");
  assert.equal(state.writes[0].payload.user_id,undefined);assert.equal(state.writes[0].payload.title,"Local edit");
  assert.equal((await db.items.where("clientId").equals("note").first()).ownerUserId,"owner");
  assert.equal((await db.syncQueue.toArray()).length,5);
  assert.deepEqual([...new Set(state.queries.map((q)=>q.table))],["items"]);
});

test("failed writes retain queue and local edits; successful writes acknowledge only their captured queue IDs",async()=>{
  const f=fixture();await f.db.items.add(localItem());await f.db.syncQueue.add(op());
  f.state.onWrite=async()=>{throw new Error("RLS denied");};
  assert.equal(await f.engine.performSync(),false);
  assert.equal((await f.db.syncQueue.toArray()).length,1);
  assert.equal((await f.db.items.toArray())[0].title,"Local edit");
  f.state.onWrite=async()=>{await f.db.syncQueue.add(op({timestamp:"2026-10-30T10:00:01Z",data:{title:"Concurrent edit"}}));};
  assert.equal(await f.engine.performSync(),true);
  const queue=await f.db.syncQueue.toArray();assert.equal(queue.length,1);assert.equal(queue[0].data.title,"Concurrent edit");
});

test("complete empty snapshot evicts revoked shared cache and queue, preserves personal rows and cancels local reminders",async()=>{
  const f=fixture();await f.db.items.add(localItem({type:"reminder"}));await f.db.syncQueue.add(op());
  await f.db.items.add(localItem({clientId:"private",householdId:undefined,folderId:undefined}));
  f.state.snapshot={user_id:"member",folders:[],items:[]};
  assert.equal(await f.engine.performSync(),true);
  assert.deepEqual((await f.db.items.toArray()).map((row)=>row.clientId),["private"]);
  assert.equal((await f.db.syncQueue.toArray()).length,0);assert.deepEqual(f.notifications,["note"]);assert.equal(f.state.writes.length,0);
});

test("failed or incomplete snapshots never evict cache, acknowledge edits, or flush writes",async()=>{
  for(const failure of ["error","partial"]) {
    const f=fixture();await f.db.items.add(localItem());await f.db.syncQueue.add(op());
    if(failure==="error")f.state.rpcError=new Error("offline");else f.state.snapshot={user_id:"member",items:[]};
    assert.equal(await f.engine.performSync(),false);assert.equal((await f.db.items.toArray()).length,1);assert.equal((await f.db.syncQueue.toArray()).length,1);assert.equal(f.state.writes.length,0);
  }
});

test("permission downgrade stops queued edits; newly granted old rows arrive without an updated_at delta",async()=>{
  const f=fixture();await f.db.items.add(localItem());await f.db.syncQueue.add(op());
  f.state.snapshot.folders[0].can_write=false;f.state.snapshot.items[0].can_write=false;
  assert.equal(await f.engine.performSync(),false);assert.equal(f.state.writes.length,0);assert.equal((await f.db.items.toArray())[0].canWrite,false);
  await assert.rejects(f.engine.updateItem("note",{title:"Nope"}),/read-only/);
  f.state.snapshot.items.push(itemRow({client_id:"old-granted",created_at:"2000-01-01T00:00:00Z",updated_at:"2000-01-01T00:00:00Z",can_write:false}));
  await f.engine.performSync();assert.ok(await f.db.items.where("clientId").equals("old-granted").first());
});

test("new own shared drafts remain pending on upload errors and private Pro operations stay enabled only for Pro",async()=>{
  const f=fixture();f.state.snapshot.items=[];
  await f.db.items.add(localItem({serverId:undefined,ownerUserId:"member"}));await f.db.syncQueue.add(op({action:"create"}));
  f.state.onWrite=async()=>{throw new Error("network failed");};
  assert.equal(await f.engine.performSync(),false);assert.equal((await f.db.items.toArray()).length,1);assert.equal((await f.db.syncQueue.toArray()).length,1);
  assert.equal(f.state.writes[0].action,"upsert");assert.equal(f.state.writes[0].payload.user_id,"member");
  const paid=fixture();paid.engine.setSyncContext(true,"member");paid.state.snapshot.items=[];
  await paid.db.items.add(localItem({clientId:"private",householdId:undefined,folderId:undefined,ownerUserId:"member"}));await paid.db.syncQueue.add(op({clientId:"private"}));
  assert.equal(await paid.engine.performSync(),true);assert.equal(paid.state.writes.length,1);assert.equal(paid.state.writes[0].table,"items");
});

test("an account change while a snapshot is in flight cannot populate the new account's cache",async()=>{
  const f=fixture();f.state.onSnapshot=async()=>f.engine.setSyncContext(false,null);
  assert.equal(await f.engine.performSync(),false);assert.equal((await f.db.items.toArray()).length,0);assert.equal((await f.db.folders.toArray()).length,0);assert.equal(f.state.writes.length,0);
});


test("create then trash before first sync writes a tombstone rather than silently losing the deletion",async()=>{
  const f=fixture();f.state.snapshot.items=[];
  await f.db.items.add(localItem({serverId:undefined,ownerUserId:"member",deleted:true,deletedAt:now}));
  await f.db.syncQueue.add(op({action:"create"}));await f.db.syncQueue.add(op({action:"delete"}));
  assert.equal(await f.engine.performSync(),true);assert.equal(f.state.writes.length,1);
  assert.equal(f.state.writes[0].action,"upsert");assert.equal(f.state.writes[0].payload.deleted,true);
  assert.equal((await f.db.syncQueue.toArray()).length,0);
});

test("shared permanent deletion is explicit, online and removes the server row, cache and pending writes",async()=>{
  const f=fixture();await f.db.items.add(localItem({deleted:true}));await f.db.syncQueue.add(op({action:"delete"}));
  navigator.onLine=false;
  await assert.rejects(f.engine.permanentlyDeleteItem("note"),/Connect/);assert.equal(f.state.writes.length,0);
  navigator.onLine=true;await f.engine.permanentlyDeleteItem("note");
  assert.equal(f.state.writes[0].action,"delete");assert.equal((await f.db.items.toArray()).length,0);assert.equal((await f.db.syncQueue.toArray()).length,0);
});


test("a read-only downgrade keeps an unsent own draft readable but does not upload it",async()=>{
  const f=fixture();f.state.snapshot.items=[];f.state.snapshot.folders[0].can_write=false;
  await f.db.items.add(localItem({serverId:undefined,ownerUserId:"member"}));await f.db.syncQueue.add(op({action:"create"}));
  assert.equal(await f.engine.performSync(),false);assert.equal(f.state.writes.length,0);
  const saved=await f.db.items.toArray();assert.equal(saved.length,1);assert.equal(saved[0].content,"Pending");assert.equal(saved[0].canWrite,false);
  assert.equal((await f.db.syncQueue.toArray()).length,1);
});
