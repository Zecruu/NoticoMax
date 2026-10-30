"use client";
// Local-only QA fixture. The browser QA script temporarily mounts it as a dev route.
import { useEffect, useState } from "react";
import db, { type LocalFolder } from "@/lib/db/indexed-db";
import { FamilyView } from "@/components/family/family-view";
const householdId="20000000-0000-4000-8000-000000000001";
const owner="10000000-0000-4000-8000-000000000001";
const folderId="30000000-0000-4000-8000-000000000001";
const folder:LocalFolder={clientId:folderId,ownerUserId:owner,familyAccountId:owner,householdId,name:"Hart family",canWrite:true,deleted:false,createdAt:"2026-10-30T10:00:00Z",updatedAt:"2026-10-30T10:00:00Z"};
export default function Preview(){
  const [ready,setReady]=useState(false);const [personal,setPersonal]=useState(false);
  useEffect(()=>{void(async()=>{await db.items.clear();await db.folders.clear();await db.folders.add(folder);await db.items.bulkAdd([
    {clientId:"40000000-0000-4000-8000-000000000001",type:"note",title:"Weekend plans",content:"Saturday: groceries, then a picnic at the park. Bring the blue blanket.",householdId,folderId,canWrite:true,tags:["weekend"],pinned:false,deleted:false,createdAt:"2026-10-30T10:00:00Z",updatedAt:"2026-10-30T10:00:00Z"},
    {clientId:"40000000-0000-4000-8000-000000000002",type:"reminder",title:"School pickup",content:"Meet by the main entrance.",reminderDate:"2026-10-30T15:30:00Z",householdId,folderId,canWrite:true,tags:[],pinned:false,deleted:false,createdAt:"2026-10-30T10:00:00Z",updatedAt:"2026-10-30T10:00:00Z"}
  ]);setReady(true);})();},[]);
  if(!ready)return <p>Preparing local UI fixture…</p>;
  return <main className="min-h-screen bg-background"><div className="bg-amber-100 px-3 py-1 text-center text-[10px] text-amber-900">Local UI review fixture · database-backed checklist actions · no production connection</div>{personal?<div className="p-8"><h1>Personal space</h1><button className="mt-4 rounded-lg border p-3" onClick={()=>setPersonal(false)}>Return to Family</button></div>:<FamilyView folders={[folder]} onPersonal={()=>setPersonal(true)} onCreateItem={()=>{}} onEditItem={()=>{}}/>}</main>;
}
