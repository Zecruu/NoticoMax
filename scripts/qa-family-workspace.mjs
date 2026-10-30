import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, unlink, rmdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { parseWorkspaceCommand } from '../src/lib/family/workspace.ts';
const repo=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const artifacts=process.env.FAMILY_QA_ARTIFACTS ?? '/tmp/noticomax-family-review';
await mkdir(artifacts,{recursive:true});
const preview=repo+'/src/app/__family-review/page.tsx';
try { await access(preview); throw new Error('Refusing to overwrite an existing __family-review route.'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
await mkdir(repo+'/src/app/__family-review',{recursive:true});
await copyFile(repo+'/tests/fixtures/family-preview.tsx',preview);
const server=spawn(process.execPath,[repo+'/node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','5468'],{cwd:repo,env:{...process.env,NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS:'1'},stdio:'ignore'});
async function cleanup(){server.kill('SIGTERM');await unlink(preview).catch(()=>{});await rmdir(repo+'/src/app/__family-review').catch(()=>{});}
process.on('SIGINT',()=>{void cleanup().finally(()=>process.exit(130));});
process.on('SIGTERM',()=>{void cleanup().finally(()=>process.exit(143));});
const pg=new PGlite();
let browser;
try {
await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create publication supabase_realtime;`);
const migration=async(name)=>readFile(repo+'/supabase/migrations/'+name,'utf8');
for(const name of ['0001_init.sql','0003_items_recurrence.sql','0004_locations.sql','0005_budget.sql','0006_budget_category_overrides.sql'])await pg.exec(await migration(name));
let old=await migration('0007_households.sql');const policy=old.match(/create policy "households_member_read"[\s\S]*?;/)[0];await pg.exec(old.replace(policy,'')+'\n'+policy);
for(const name of ['0008_family_plan.sql','0009_folder_permissions.sql','0010_family_entitlements_and_storage.sql'])await pg.exec(await migration(name));
await pg.exec('grant select,insert,update,delete on all tables in schema public to authenticated;grant usage on all sequences in schema public to authenticated;');
for(const name of ['0016_family_foundation.sql','0017_family_workspace.sql'])await pg.exec(await migration(name));
const owner='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002',hid='20000000-0000-4000-8000-000000000001',folder='30000000-0000-4000-8000-000000000001';
await pg.query('insert into auth.users(id) values($1),($2)',[owner,member]);
await pg.query("insert into households(id,name,owner_user_id) values($1,'Hart family',$2)",[hid,owner]);
await pg.query("insert into household_members(household_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')",[hid,owner,member]);
await pg.query("insert into folders(client_id,user_id,name,household_id) values($1,$2,'Hart family',$3)",[folder,owner,hid]);
let queue=Promise.resolve();
function as(uid,query,params=[]){const next=queue.then(async()=>{await pg.exec('set role authenticated');try{await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return await pg.query(query,params);}finally{await pg.exec('reset role;reset request.jwt.claim.sub');}});queue=next.catch(()=>{});return next;}
await as(member,"select create_family_checklist($1,$2,$3,'Groceries for the week',$4)",['50000000-0000-4000-8000-000000000001',hid,folder,JSON.stringify([{id:'60000000-0000-4000-8000-000000000001',text:'Oat milk'},{id:'60000000-0000-4000-8000-000000000002',text:'Apples'},{id:'60000000-0000-4000-8000-000000000003',text:'Sourdough bread'},{id:'60000000-0000-4000-8000-000000000004',text:'Coffee'}])]);
await as(owner,"select save_family_place($1,$2,'Grocery store','Main Street',30.2672,-97.7431,null)",['70000000-0000-4000-8000-000000000001',hid]);
await as(owner,"select save_family_place($1,$2,'Weekend park','Meet by the picnic tables',30.2747,-97.7404,null)",['70000000-0000-4000-8000-000000000002',hid]);
try {
  for(let attempt=0;attempt<60;attempt++){try{await fetch('http://127.0.0.1:5468/__family-review');break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
} catch(error) { await cleanup(); await pg.close(); throw error; }
const errors=[];const checks=[];
async function client(uid,viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,colorScheme:'light'});
 await context.route('**/api/households**',async(route)=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  try{
   if(url.pathname==='/api/households')return route.fulfill({json:{households:[{id:hid,name:'Hart family',ownerUserId:owner,familyCode:'HART42',maxSeats:5,currentSeats:2,subscriptionPlan:'free',role:uid===owner?'owner':'member',createdAt:'2026-10-30T10:00:00Z',pendingRequests:[],members:[{userId:owner,email:'alex@example.test',role:'owner',joinedAt:'2026-10-30T10:00:00Z'},{userId:member,email:'sam@example.test',role:'member',joinedAt:'2026-10-30T10:00:00Z'}]}],pendingInvites:[]}});
   if(url.pathname.endsWith('/checkins'))return route.fulfill({json:{userId:uid,sharingEnabled:false,checkins:[]}});
   if(url.pathname.endsWith('/workspace')){
    if(method==='GET'){
     const data=(await as(uid,'select family_workspace_snapshot($1) s',[hid])).rows[0].s;
     data.lists=data.lists.map(list=>({...list,entries:list.entries.map(e=>({id:e.id,text:e.text,checked:e.checked,revision:e.revision,updatedBy:e.updated_by,updatedAt:e.updated_at}))}));
     data.places=data.places.map(p=>({...p,createdBy:p.created_by,updatedAt:p.updated_at}));return route.fulfill({json:data});
    }
    const c=parseWorkspaceCommand(request.postDataJSON());assert.ok(c);
    if(c.action==='create_list')await as(uid,'select create_family_checklist($1,$2,$3,$4,$5)',[c.id,hid,c.folderId,c.title,JSON.stringify(c.entries)]);
    if(c.action==='entry')await as(uid,'select change_family_checklist_entry($1,$2,$3,$4,$5,$6,$7)',[c.listId,hid,c.entryId,c.change,c.text??null,c.checked??null,c.revision??null]);
    if(c.action==='save_place')await as(uid,'select save_family_place($1,$2,$3,$4,$5,$6,$7)',[c.id,hid,c.title,c.address,c.latitude,c.longitude,c.revision??null]);
    if(c.action==='delete_place')await as(uid,'select delete_family_place($1,$2)',[c.id,c.revision]);
    if(c.action==='delete_list')await as(uid,'select delete_family_checklist($1,$2)',[c.listId,hid]);
    return route.fulfill({json:{ok:true}});
   }
   return route.continue();
  }catch(error){return route.fulfill({status:409,json:{error:String(error.message)}});}
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5468/__family-review');await page.getByRole('heading',{name:'Hart family',exact:true}).waitFor();await page.getByRole('button',{name:'Make a list',exact:true}).waitFor();
 await page.waitForFunction(()=>document.body.textContent.includes('Groceries for the week'));
 return {page,context};
}
try{
 const a=await client(member,{width:390,height:844}),b=await client(owner,{width:1280,height:900});
 await a.page.screenshot({path:artifacts+'/01-family-mobile.png',fullPage:true});await b.page.screenshot({path:artifacts+'/02-family-desktop.png',fullPage:true});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('390px overview: no horizontal overflow');
 await a.page.getByRole('button',{name:'Make a list',exact:true}).click();await a.page.getByLabel('List name',{exact:true}).fill('Saturday groceries');await a.page.getByLabel('What’s on the list?').fill('Milk\nEggs\nBananas');await a.page.getByRole('button',{name:'Save to Family',exact:true}).click();await a.page.getByRole('heading',{name:'Saturday groceries',exact:true}).waitFor();
 assert.equal(await a.page.getByRole('checkbox',{name:'Milk',exact:true}).getAttribute('aria-checked'),'false');checks.push('Member creates a structured grocery list through actual UI and SQL RPC');
 await b.page.getByRole('button',{name:'Refresh',exact:true}).click();await b.page.getByRole('button',{name:'Lists',exact:true}).click();await b.page.getByRole('button',{name:'Open Saturday groceries',exact:true}).click();await b.page.getByRole('checkbox',{name:'Milk',exact:true}).click();await b.page.waitForFunction(()=>document.querySelector('[role=checkbox][aria-label=Milk]')?.getAttribute('aria-checked')==='true');
 await a.page.getByRole('checkbox',{name:'Eggs',exact:true}).click();await a.page.getByRole('button',{name:'Refresh',exact:true}).click();await a.page.waitForFunction(()=>['Milk','Eggs'].every(name=>document.querySelector(`[role=checkbox][aria-label=${name}]`)?.getAttribute('aria-checked')==='true'));checks.push('Two members change different entries from separate views; both checkmarks survive');
 await a.page.screenshot({path:artifacts+'/03-grocery-list-mobile.png',fullPage:true});
 await a.page.getByRole('button',{name:'Add an item',exact:true}).click();await a.page.getByLabel('Item',{exact:true}).fill('Keep this draft');await a.page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await a.page.getByRole('dialog').count(),0);assert.equal(await a.page.getByRole('checkbox',{name:'Keep this draft',exact:true}).count(),0);checks.push('Cancel dismisses add-entry form without publishing a draft');
 await a.page.getByRole('button',{name:'Places',exact:true}).click();await a.page.getByRole('button',{name:'Add place',exact:true}).click();await a.page.getByLabel('Place name',{exact:true}).fill('Library');await a.page.getByLabel('Address or description').fill('Front entrance');await a.page.getByLabel('Latitude',{exact:true}).fill('30.27');await a.page.getByLabel('Longitude',{exact:true}).fill('-97.75');await a.page.getByRole('button',{name:'Save to Family',exact:true}).click();await a.page.getByRole('heading',{name:'Library',exact:true}).waitFor();checks.push('Persistent shared place saved without enabling or posting a member check-in');
 await a.page.screenshot({path:artifacts+'/04-family-places-mobile.png',fullPage:true});
 await a.page.getByRole('button',{name:'Personal',exact:true}).click();await a.page.getByRole('heading',{name:'Personal space',exact:true}).waitFor();checks.push('Personal switch dismisses Family workspace');
 assert.equal(countRows(await pg.query('select count(*) n from family_checkins')),0);assert.deepEqual(errors,[]);
 await writeFile(artifacts+'/browser-results.json',JSON.stringify({checks,errors,transport:'Local Playwright interception + real PGlite SQL; not hosted Supabase or native iOS'},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); browser = undefined; }
} finally { if (browser) await browser.close(); await pg.close(); await cleanup(); }
function countRows(result){return Number(result.rows[0].n);}
