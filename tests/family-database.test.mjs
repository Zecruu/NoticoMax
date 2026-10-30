import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const sql = async (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
before(async () => {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create publication supabase_realtime;
  `);
  for (const file of ["0001_init.sql", "0003_items_recurrence.sql", "0004_locations.sql", "0005_budget.sql", "0006_budget_category_overrides.sql"]) await pg.exec(await sql(file));
  // Baseline 0007 creates households_member_read before the referenced table.
  // Move only that pre-existing forward reference for a fresh fixture; the new
  // migration below runs byte-for-byte, with real PostgreSQL policies/triggers.
  let households = await sql("0007_households.sql");
  const policy = households.match(/create policy "households_member_read"[\s\S]*?;/)[0];
  households = households.replace(policy, "");
  await pg.exec(households + "\n" + policy);
  for (const file of ["0008_family_plan.sql", "0009_folder_permissions.sql", "0010_family_entitlements_and_storage.sql"]) await pg.exec(await sql(file));
  await pg.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;`);
  await pg.exec(await sql("0016_family_foundation.sql"));
  await pg.exec(await sql("0017_family_workspace.sql"));
});
after(async () => pg.close());
async function user() { const id = randomUUID(); await pg.query("insert into auth.users values($1)", [id]); return id; }
async function as(uid, query, params = []) {
  await pg.exec("set role authenticated");
  try {
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    return await pg.query(query, params);
  } finally { await pg.exec("reset role; reset request.jwt.claim.sub"); }
}
async function family() {
  const owner = await user(); const member = await user(); const outsider = await user();
  const result = await as(owner, "select create_family_household('Test Family') household");
  const household = result.rows[0].household;
  const folder = (await pg.query("select * from folders where household_id=$1", [household.id])).rows[0];
  await pg.query("insert into household_members(household_id,user_id) values($1,$2)", [household.id, member]);
  return { owner, member, outsider, household, folder };
}
async function note(f, author = f.owner) {
  const id = randomUUID();
  await as(author, "insert into items(client_id,user_id,type,title,household_id,folder_id) values($1,$2,'note','Shared',$3,$4)", [id, author, f.household.id, f.folder.client_id]);
  return id;
}
const count = (result) => Number(result.rows[0].n);

test("free creation is atomic, limited to one owned family and does not grant paid entitlements", async () => {
  const owner = await user();
  const h = (await as(owner, "select create_family_household('  Our family  ') household")).rows[0].household;
  assert.equal(h.name, "Our family"); assert.equal(h.max_seats, 5); assert.equal(h.subscription_plan, "free");
  assert.equal(count(await as(owner, "select count(*) n from household_members where household_id=$1", [h.id])), 1);
  assert.equal(count(await as(owner, "select count(*) n from folders where household_id=$1", [h.id])), 1);
  assert.equal(count(await pg.query("select count(*) n from entitlements where user_id=$1", [owner])), 0);
  await assert.rejects(as(owner, "select create_family_household('Another')"), /family_limit_reached/);
  await assert.rejects(as(owner, "insert into households(name,owner_user_id) values('Bypass',$1)", [owner]), /row-level security/);
  await assert.rejects(as(owner, "update households set max_seats=999 where id=$1", [h.id]), /family_metadata_protected/);
  await as(owner, "update households set name='Renamed' where id=$1", [h.id]);
});

test("accepted members edit shared notes without taking ownership; outsiders and cross-family folders are denied", async () => {
  const f = await family(); const id = await note(f);
  assert.equal(count(await as(f.outsider, "select count(*) n from items where client_id=$1", [id])), 0);
  await as(f.member, "update items set title='Collaborator edit' where client_id=$1", [id]);
  assert.equal((await pg.query("select user_id from items where client_id=$1", [id])).rows[0].user_id, f.owner);
  await assert.rejects(as(f.member, "update items set user_id=$2 where client_id=$1", [id, f.member]), /family_creator_immutable/);
  await assert.rejects(as(f.member, "update items set household_id=null, folder_id=null where client_id=$1", [id]), /family_scope_immutable/);
  await assert.rejects(as(f.member, "update items set folder_id=null where client_id=$1", [id]), /family_scope_immutable/);
  const other = await family();
  await assert.rejects(as(f.member, "insert into items(user_id,type,title,household_id,folder_id) values($1,'note','Mismatch',$2,$3)", [f.member,f.household.id,other.folder.client_id]), /family_folder_scope_mismatch/);
  await as(f.member, "update folders set name='Team folder' where client_id=$1", [f.folder.client_id]);
  await assert.rejects(as(f.member, "update folders set share_mode='select' where client_id=$1", [f.folder.client_id]), /family_owner_required/);
});

test("read-only and revoked folder permissions apply even to the note author; permission replace is atomic", async () => {
  const f = await family(); const id = await note(f, f.member);
  await as(f.owner, "select set_family_folder_permissions($1,'select',$2)", [f.folder.client_id, JSON.stringify([{ userId:f.member,canRead:true,canWrite:false }])]);
  assert.equal(count(await as(f.member,"select count(*) n from items where client_id=$1",[id])),1);
  const changed = await as(f.member,"update items set title='Denied' where client_id=$1 returning client_id",[id]);
  assert.equal(changed.rows.length,0);
  const snap = (await as(f.member,"select family_content_snapshot() snapshot")).rows[0].snapshot;
  assert.equal(snap.folders[0].can_write,false); assert.equal(snap.items[0].can_write,false);
  await assert.rejects(as(f.owner,"select set_family_folder_permissions($1,'all',$2)",[f.folder.client_id, JSON.stringify([{ userId:f.outsider,canRead:true,canWrite:true }])]), /invalid_folder_permissions/);
  assert.equal((await pg.query("select share_mode from folders where client_id=$1",[f.folder.client_id])).rows[0].share_mode,"select");
  await as(f.owner,"select set_family_folder_permissions($1,null,'[]'::jsonb)",[f.folder.client_id]);
  assert.equal(count(await as(f.member,"select count(*) n from items where client_id=$1",[id])),0);
  const revoked = (await as(f.member,"select family_content_snapshot() snapshot")).rows[0].snapshot;
  assert.deepEqual(revoked.items,[]); assert.deepEqual(revoked.folders,[]);
});

test("membership requests require owner approval, email invitations require invitee consent and seats are enforced", async () => {
  const f = await family(); const token = randomUUID();
  await pg.query("insert into household_invites(token,household_id,invited_user_id,invited_by,status) values($1,$2,$3,$3,'requested')",[token,f.household.id,f.outsider]);
  await assert.rejects(as(f.outsider,"select respond_family_invite($1,'accept')",[token]),/invite_already_responded/);
  await assert.rejects(as(f.member,"select approve_family_request($1,'approve')",[token]),/family_owner_required/);
  await as(f.owner,"select approve_family_request($1,'approve')",[token]);
  await as(f.owner,"select approve_family_request($1,'approve')",[token]); // idempotent
  assert.equal(count(await as(f.outsider,"select count(*) n from folders where household_id=$1",[f.household.id])),1);
  const invitee=await user(); const invite=randomUUID();
  await pg.query("insert into household_invites(token,household_id,invited_user_id,invited_by,status) values($1,$2,$3,$4,'pending')",[invite,f.household.id,invitee,f.owner]);
  await assert.rejects(as(f.owner,"select respond_family_invite($1,'accept')",[invite]),/invite_not_for_you/);
  await as(invitee,"select respond_family_invite($1,'accept')",[invite]);
  await pg.query("update households set max_seats=4 where id=$1",[f.household.id]);
  const full=await user();const fullToken=randomUUID();
  await pg.query("insert into household_invites(token,household_id,invited_user_id,invited_by,status) values($1,$2,$3,$4,'pending')",[fullToken,f.household.id,full,f.owner]);
  await assert.rejects(as(full,"select respond_family_invite($1,'accept')",[fullToken]),/family_seat_limit/);
  assert.equal((await pg.query("select status from household_invites where token=$1",[fullToken])).rows[0].status,"pending");
});

test("manual check-ins require own explicit consent, expire in 24 hours and cannot be forged through direct writes", async () => {
  const f=await family();
  await assert.rejects(as(f.member,"select share_family_checkin($1,0,0,12,now())",[f.household.id]),/location_sharing_paused/);
  await as(f.member,"select set_family_location_sharing($1,true)",[f.household.id]);
  const row=(await as(f.member,"select share_family_checkin($1,0,0,12,now()) checkin",[f.household.id])).rows[0].checkin;
  assert.equal(row.user_id,f.member);assert.equal(row.accuracy,12);
  assert.equal(Date.parse(row.expires_at)-Date.parse(row.captured_at),86400000);
  assert.equal(count(await as(f.owner,"select count(*) n from family_checkins where household_id=$1",[f.household.id])),1);
  assert.equal(count(await as(f.outsider,"select count(*) n from family_checkins",[])),0);
  assert.equal(count(await as(f.owner,"select count(*) n from family_location_preferences where household_id=$1",[f.household.id])),0);
  await assert.rejects(as(f.owner,"update family_checkins set latitude=50 where household_id=$1",[f.household.id]),/permission denied/);
  await assert.rejects(as(f.outsider,"select set_family_location_sharing($1,true)",[f.household.id]),/family_membership_required/);
  for(const query of ["select share_family_checkin($1,91,0,12,now())","select share_family_checkin($1,'NaN'::float8,0,12,now())","select share_family_checkin($1,0,0,-1,now())","select share_family_checkin($1,0,0,12,now()-interval '6 minutes')"]) await assert.rejects(as(f.member,query,[f.household.id]),/invalid_checkin/);
  await as(f.member,"select revoke_family_checkin($1)",[f.household.id]);
  assert.equal(count(await as(f.owner,"select count(*) n from family_checkins where household_id=$1",[f.household.id])),0);
  await as(f.member,"select share_family_checkin($1,0,0,null,now())",[f.household.id]);
  await as(f.member,"select set_family_location_sharing($1,false)",[f.household.id]);
  await assert.rejects(as(f.member,"select share_family_checkin($1,0,0,12,now())",[f.household.id]),/location_sharing_paused/);
  assert.equal(count(await pg.query("select count(*) n from family_checkins where household_id=$1",[f.household.id])),0);
});

test("leaving revokes shared reads and deletes consent/location; deleting a family deletes its notes but not personal content", async () => {
  const f=await family(); const id=await note(f,f.member);
  const personal=randomUUID();await as(f.member,"insert into items(client_id,user_id,type,title) values($1,$2,'note','Private')",[personal,f.member]);
  await as(f.member,"select set_family_location_sharing($1,true)",[f.household.id]);
  await as(f.member,"select share_family_checkin($1,0,0,12,now())",[f.household.id]);
  await as(f.member,"delete from household_members where household_id=$1 and user_id=$2",[f.household.id,f.member]);
  assert.equal(count(await pg.query("select count(*) n from family_location_preferences where household_id=$1",[f.household.id])),0);
  assert.equal(count(await pg.query("select count(*) n from family_checkins where household_id=$1",[f.household.id])),0);
  assert.equal(count(await as(f.member,"select count(*) n from items where client_id=$1",[id])),0);
  assert.deepEqual((await as(f.member,"select family_content_snapshot() s")).rows[0].s.items,[]);
  await as(f.owner,"delete from households where id=$1",[f.household.id]);
  assert.equal(count(await pg.query("select count(*) n from items where client_id=$1",[id])),0);
  assert.equal(count(await as(f.member,"select count(*) n from items where client_id=$1",[personal])),1);
});

test("snapshot is complete above API page sizes and fails explicitly rather than truncating oversized families", async () => {
  const f=await family();
  await pg.query("insert into items(user_id,type,title,household_id,folder_id) select $1,'note','History '||n,$2,$3 from generate_series(1,1001) n",[f.owner,f.household.id,f.folder.client_id]);
  const snapshot=(await as(f.member,"select family_content_snapshot() s")).rows[0].s;
  assert.equal(snapshot.items.length,1001);assert.equal(snapshot.user_id,f.member);
  await pg.query("insert into items(user_id,type,title,household_id,folder_id) select $1,'note','More '||n,$2,$3 from generate_series(1,9000) n",[f.owner,f.household.id,f.folder.client_id]);
  await assert.rejects(as(f.member,"select family_content_snapshot()"),/family_snapshot_too_large/);
});

test("a folder creator who leaves cannot retain access, grant permissions or share a check-in", async () => {
  const f=await family();const folder=randomUUID();
  await as(f.member,"insert into folders(client_id,user_id,name,household_id) values($1,$2,'Member folder',$3)",[folder,f.member,f.household.id]);
  await as(f.member,"delete from household_members where household_id=$1 and user_id=$2",[f.household.id,f.member]);
  assert.equal(count(await as(f.member,"select count(*) n from folders where client_id=$1",[folder])),0);
  await assert.rejects(as(f.member,"select set_family_folder_permissions($1,'all','[]'::jsonb)",[folder]),/family_owner_required/);
  await assert.rejects(as(f.member,"select share_family_checkin($1,0,0,10,now())",[f.household.id]),/family_membership_required/);
});


test("grocery flow: a member creates a list, another checks items, independent concurrent edits both survive", async () => {
  const f=await family();const list=randomUUID();const milk=randomUUID();const bread=randomUUID();
  const params=[list,f.household.id,f.folder.client_id,"Groceries",JSON.stringify([{id:milk,text:"Milk"},{id:bread,text:"Bread"}])];
  await as(f.member,"select create_family_checklist($1,$2,$3,$4,$5)",params);
  await as(f.member,"select create_family_checklist($1,$2,$3,$4,$5)",params); // retry is one list
  let state=(await as(f.owner,"select family_workspace_snapshot($1) s",[f.household.id])).rows[0].s;
  assert.equal(state.lists.length,1);assert.equal(state.lists[0].entries.length,2);
  // Both people act from revision 1, on different entries, without lost updates.
  await as(f.owner,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,true,1)",[list,f.household.id,milk]);
  await as(f.member,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,true,1)",[list,f.household.id,bread]);
  state=(await as(f.member,"select family_workspace_snapshot($1) s",[f.household.id])).rows[0].s;
  assert.deepEqual(state.lists[0].entries.map(e=>e.checked),[true,true]);
  await as(f.owner,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,true,1)",[list,f.household.id,milk]); // same intent retry
  await assert.rejects(as(f.member,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,false,1)",[list,f.household.id,milk]),/family_entry_conflict/);
  await as(f.member,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,false,2)",[list,f.household.id,milk]);
  assert.equal((await pg.query("select user_id from items where client_id=$1",[list])).rows[0].user_id,f.member);
  await assert.rejects(as(f.outsider,"select family_workspace_snapshot($1)",[f.household.id]),/family_membership_required/);
  await as(f.owner,"select set_family_folder_permissions($1,'all',$2)",[f.folder.client_id,JSON.stringify([{userId:f.member,canRead:true,canWrite:false}])]);
  await assert.rejects(as(f.member,"select change_family_checklist_entry($1,$2,$3,'set_checked',null,true,3)",[list,f.household.id,milk]),/family_read_only/);
  await as(f.owner,"select delete_family_checklist($1,$2)",[list,f.household.id]);
  assert.equal((await as(f.owner,"select family_workspace_snapshot($1) s",[f.household.id])).rows[0].s.lists.length,0);
  assert.equal(count(await as(f.member,"select count(*) n from family_checklist_entries where item_id=$1",[list])),0);
});

test("shared place pins are persistent, independent of private saved locations and check-in consent", async () => {
  const f=await family();const place=randomUUID();
  await as(f.member,"select save_family_place($1,$2,'Grocery store','Main Street',0,0,null)",[place,f.household.id]);
  await as(f.member,"select save_family_place($1,$2,'Grocery store','Main Street',0,0,null)",[place,f.household.id]);
  assert.equal(count(await pg.query("select count(*) n from family_places where id=$1",[place])),1);
  assert.equal(count(await pg.query("select count(*) n from family_location_preferences where household_id=$1",[f.household.id])),0);
  assert.equal(count(await as(f.outsider,"select count(*) n from family_places where id=$1",[place])),0);
  await as(f.owner,"select save_family_place($1,$2,'Saturday groceries','Main Street',0,0,1)",[place,f.household.id]);
  await assert.rejects(as(f.member,"select save_family_place($1,$2,'Stale edit','',0,0,1)",[place,f.household.id]),/family_place_conflict/);
  assert.equal((await pg.query("select created_by from family_places where id=$1",[place])).rows[0].created_by,f.member);
  await as(f.member,"delete from household_members where household_id=$1 and user_id=$2",[f.household.id,f.member]);
  await assert.rejects(as(f.member,"select save_family_place($1,$2,'Removed member','',0,0,2)",[place,f.household.id]),/family_membership_required/);
  assert.equal(count(await as(f.owner,"select count(*) n from family_places where id=$1",[place])),1);
  await as(f.owner,"select delete_family_place($1,2)",[place]);
  assert.equal(count(await pg.query("select count(*) n from family_places where id=$1",[place])),0);
});
