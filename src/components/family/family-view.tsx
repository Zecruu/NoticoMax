"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ClipboardList, Loader2, MapPin, Plus, Users } from "lucide-react";
import db, { type LocalFolder, type LocalItem } from "@/lib/db/indexed-db";
import { useHouseholds } from "@/hooks/use-households";
import { useFamilyWorkspace } from "@/hooks/use-family-workspace";
import { deleteItem, performSync, updateItem } from "@/lib/sync/sync-engine";
import { getCurrentCoords, mapsUrl } from "@/lib/geolocation";
import { closeFamilyMap, hasNativeFamilyMap, openFamilyMap } from "@/lib/capacitor/family-map";
import type { FamilyList, FamilyListEntry, FamilyPlace } from "@/lib/family/workspace";
import { toast } from "@/lib/native-toast";
import { HouseholdsCard } from "@/components/settings/households-card";
import { FamilyCheckins } from "./family-checkins";
import { FamilyWorkspaceScreen, type FamilyTab } from "./family-workspace-screen";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Form =
  | { kind: "list"; id: string; title: string; text: string; folderId: string; entryIds: string[] }
  | { kind: "entry"; id: string; listId: string; text: string }
  | { kind: "place"; id: string; title: string; address: string; latitude: string; longitude: string; revision?: number };
interface Props { folders: LocalFolder[]; initialFolderId?: string; initialListId?: string; onCreateItem: (type: "note" | "url" | "reminder", folderId: string) => void; onEditItem: (item: LocalItem) => void; onPersonal: () => void }
export function FamilyView({ folders, initialFolderId, initialListId, onCreateItem, onEditItem, onPersonal }: Props) {
  const families = useHouseholds();
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId ?? null);
  const [tab, setTab] = useState<FamilyTab>(initialListId ? "lists" : "overview");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const formGeneration = useRef(0);
  const formAction = useRef(false);
  const household = families.households.find((h) => h.id === selectedHouseholdId)
    ?? families.households.find((h) => h.id === folders.find((f) => f.clientId === initialFolderId)?.householdId)
    ?? families.households[0];
  const householdId = household?.id ?? null;
  const sharedFolders = folders.filter((folder) => folder.householdId === householdId);
  const writeFolders = sharedFolders.filter((folder) => folder.canWrite === true);
  const destination = folderId ? writeFolders.find((folder) => folder.clientId === folderId) : writeFolders[0];
  const workspace = useFamilyWorkspace(householdId);
  const items = useLiveQuery(() => db.items.toArray().then((rows) => rows.filter((row) => row.householdId === householdId && !row.deleted).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))), [householdId], []);
  const nativeMaps = hasNativeFamilyMap();
  const report = (problem: unknown) => toast.error(problem instanceof Error ? problem.message : "Could not save. Please try again.");
  const closeForm = () => { formGeneration.current++; formAction.current = false; setForm(null); setFormError(null); setFormBusy(false); void closeFamilyMap().catch(() => {}); };
  const openForm = (next: Form) => { formGeneration.current++; formAction.current = false; setForm(next); setFormError(null); setFormBusy(false); };

  useEffect(() => {
    const current = formGeneration;
    const reset = window.setTimeout(() => { current.current++; formAction.current = false; setForm(null); setFormBusy(false); setFormError(null); setSelectedListId(initialListId ?? null); if (initialListId) setTab("lists"); }, 0);
    return () => { window.clearTimeout(reset); current.current++; void closeFamilyMap().catch(() => {}); };
  }, [householdId, initialListId]);
  useEffect(() => {
    if (!workspace.error || workspace.data) return;
    void closeFamilyMap().catch(() => {});
    const timer = window.setTimeout(() => { formGeneration.current++; formAction.current = false; setForm(null); setFormBusy(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [workspace.error, workspace.data]);

  const create = (type: "list" | "note" | "reminder" | "place" | "url") => {
    if (type === "place") { openForm({ kind: "place", id: crypto.randomUUID(), title: "", address: "", latitude: "", longitude: "" }); return; }
    if (!destination) { toast.error("Choose a family folder where you have edit access."); return; }
    if (type === "list") openForm({ kind: "list", id: crypto.randomUUID(), title: "", text: "", folderId: destination.clientId, entryIds: Array.from({length:200},()=>crypto.randomUUID()) });
    else onCreateItem(type, destination.clientId);
  };
  const changeEntry = async (list: FamilyList, entry: FamilyListEntry, remove = false) => {
    if (remove && !confirm(`Remove “${entry.text}” from this shared list?`)) return;
    try { await workspace.mutate({ action: "entry", listId: list.id, entryId: entry.id, change: remove ? "delete" : "set_checked", checked: !entry.checked, revision: entry.revision }, entry.id); }
    catch (problem) { report(problem); }
  };
  const saveForm = async () => {
    if (!form || formAction.current) return;
    const generation = formGeneration.current;
    formAction.current = true; setFormBusy(true); setFormError(null);
    try {
      let saved: boolean;
      if (form.kind === "list") {
        const lines = form.text.split("\n").map((line) => line.trim()).filter(Boolean);
        if (!form.title.trim() || lines.length > 200) throw new Error("Name your list and use up to 200 entries, one per line.");
        saved = await workspace.mutate({ action: "create_list", id: form.id, folderId: form.folderId, title: form.title, entries: lines.map((text,i) => ({ id: form.entryIds[i], text })) }, form.id);
      } else if (form.kind === "entry") {
        if (!form.text.trim()) throw new Error("What do you want to add?");
        saved = await workspace.mutate({ action: "entry", listId: form.listId, entryId: form.id, change: "add", text: form.text }, form.id);
      } else {
        if (!form.title.trim() || !form.latitude.trim() || !form.longitude.trim()) throw new Error("Add a name and choose the place’s coordinates.");
        saved = await workspace.mutate({ action: "save_place", id: form.id, title: form.title, address: form.address, latitude: Number(form.latitude), longitude: Number(form.longitude), revision: form.revision }, form.id);
      }
      if (saved && generation === formGeneration.current) {
        if (form.kind === "list") { setSelectedListId(form.id); setTab("lists"); }
        if (form.kind === "place") setTab("places");
        closeForm(); toast.success("Saved to Family");
      }
    } catch (problem) { if (generation === formGeneration.current) setFormError(problem instanceof Error ? problem.message : "Save was not confirmed. Your draft is kept here."); }
    finally { if (generation === formGeneration.current) { formAction.current = false; setFormBusy(false); } }
  };
  const choosePlace = async (currentSpot: boolean) => {
    if (form?.kind !== "place" || formAction.current) return;
    const generation = formGeneration.current;
    formAction.current = true; setFormBusy(true); setFormError(null);
    try {
      const place = currentSpot ? await getCurrentCoords() : await openFamilyMap(workspace.data?.places ?? [], true);
      if (!place || generation !== formGeneration.current || (currentSpot && document.visibilityState === "hidden")) return;
      setForm((previous) => previous?.kind === "place" ? { ...previous, latitude: String(place.latitude), longitude: String(place.longitude),
        title: "title" in place ? place.title : previous.title, address: "address" in place ? place.address : previous.address } : previous);
    } catch (problem) { if (generation === formGeneration.current) setFormError(problem instanceof Error ? problem.message : "Could not choose a place."); }
    finally { if (generation === formGeneration.current) { formAction.current = false; setFormBusy(false); } }
  };
  const editPlace = (place: FamilyPlace) => openForm({ kind: "place", id: place.id, title: place.title, address: place.address, latitude: String(place.latitude), longitude: String(place.longitude), revision: place.revision });
  const openPlace = (place: FamilyPlace) => {
    if (nativeMaps) void openFamilyMap([place]).catch(report);
    else window.open(mapsUrl(place.latitude,place.longitude), "_blank", "noopener,noreferrer");
  };
  const refresh = () => { void workspace.refresh(); void families.refresh(); void performSync(); };
  const mutateItem = async (action: () => Promise<unknown>) => { try { await action(); } catch (problem) { report(problem); } };

  if (!household) return <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-7"><button onClick={onPersonal} className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Personal</button><div className="rounded-3xl border bg-emerald-500/5 px-6 py-7"><Users className="mb-4 size-8 text-emerald-600" /><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Family space</p><h1 className="mt-2 text-3xl font-bold tracking-tight">The everyday things,<br />together.</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">One grocery list. Notes everyone can find. Reminders and places in the same home — separate from your personal life.</p></div>{families.loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Loading families…</p> : <HouseholdsCard />}{families.error && <p role="alert" className="text-sm text-destructive">{families.error}</p>}</div>;

  return <>
    <FamilyWorkspaceScreen household={household} households={families.households} folders={sharedFolders} folderId={folderId} items={items} workspace={workspace.data} loading={workspace.loading} fresh={workspace.fresh} error={workspace.error} pending={workspace.pending} tab={tab} selectedListId={selectedListId} canCreate={!!destination} nativeMaps={nativeMaps}
      onPersonal={onPersonal} onManage={() => setManaging(true)} onHousehold={(id) => { closeForm(); setSelectedHouseholdId(id); setFolderId(null); setSelectedListId(null); setTab("overview"); }} onFolder={setFolderId} onTab={(next) => { setTab(next); setSelectedListId(null); }} onRefresh={refresh} onCreate={create} onOpenList={(id) => { setSelectedListId(id); setTab("lists"); }} onCheck={(list,entry) => void changeEntry(list,entry)} onAddEntry={(list) => openForm({kind:"entry",id:crypto.randomUUID(),listId:list.id,text:""})} onDeleteEntry={(list,entry) => void changeEntry(list,entry,true)} onDeleteList={async(list) => { if(!confirm(`Move “${list.title}” to trash for everyone?`))return;try{if(await workspace.mutate({action:"delete_list",listId:list.id},list.id))setSelectedListId(null);}catch(problem){report(problem);} }}
      onEditItem={(item) => item.canWrite === false ? toast.error("This item is read-only. Its date and details are shown here.") : onEditItem(item)} onDeleteItem={(id) => { void mutateItem(() => deleteItem(id)); }} onPin={(id,pinned) => void mutateItem(() => updateItem(id,{pinned:!pinned}))} onComplete={(id,completed) => void mutateItem(() => updateItem(id,{reminderCompleted:!completed}))} onContent={(id,content) => void mutateItem(() => updateItem(id,{content}))}
      onMap={() => { if (nativeMaps) void openFamilyMap(workspace.data?.places ?? []).catch(report); else if (workspace.data?.places[0]) openPlace(workspace.data.places[0]); }} onOpenPlace={openPlace} onEditPlace={editPlace} checkins={<FamilyCheckins key={household.id} household={household} />} />
    <Dialog open={managing} onOpenChange={(open) => { setManaging(open); if (!open) refresh(); }}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Family & invitations</DialogTitle><DialogDescription>Only accepted members can use this shared space. Your personal content is separate.</DialogDescription></DialogHeader><HouseholdsCard /></DialogContent></Dialog>
    <Dialog open={!!form} onOpenChange={(open) => { if (!open) closeForm(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{form?.kind === "list" ? "Make a shared list" : form?.kind === "entry" ? "Add to the list" : form?.kind === "place" && form.revision ? "Edit family place" : "Save a family place"}</DialogTitle><DialogDescription>{form?.kind === "place" ? `This persistent place will be shared with all accepted members of ${household.name}. It is not a location check-in.` : "Everyone with edit access to this folder can help. Each checkmark saves independently."}</DialogDescription></DialogHeader>
      {form && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveForm(); }}><fieldset disabled={formBusy} className="space-y-4">
        {form.kind === "list" && <><div className="space-y-1.5"><Label htmlFor="family-list-title">List name</Label><Input id="family-list-title" autoFocus maxLength={120} placeholder="Groceries for the week" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} /></div><div className="space-y-1.5"><Label htmlFor="family-list-items">What’s on the list?</Label><Textarea id="family-list-items" rows={6} placeholder={"Milk\nApples\nBread"} value={form.text} onChange={(e) => setForm({...form,text:e.target.value})} /><p className="text-xs text-muted-foreground">One item per line. You can add more later.</p></div><div className="space-y-1.5"><Label htmlFor="list-folder">Shared folder</Label><select id="list-folder" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={form.folderId} onChange={(e) => setForm({...form,folderId:e.target.value})}>{writeFolders.map((folder) => <option key={folder.clientId} value={folder.clientId}>{folder.name}</option>)}</select></div></>}
        {form.kind === "entry" && <div className="space-y-1.5"><Label htmlFor="family-entry">Item</Label><Input id="family-entry" autoFocus maxLength={500} placeholder="What else do we need?" value={form.text} onChange={(e) => setForm({...form,text:e.target.value})} /></div>}
        {form.kind === "place" && <><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="min-h-12 gap-1.5" onClick={() => void choosePlace(false)} disabled={!nativeMaps}><MapPin className="size-4" />Apple Maps</Button><Button type="button" variant="outline" className="min-h-12" onClick={() => void choosePlace(true)}>Use current spot</Button></div>{!nativeMaps && <p className="text-xs text-muted-foreground">Native map search is available in the updated iOS app. Here, use your current spot or enter a place’s coordinates.</p>}<div className="space-y-1.5"><Label htmlFor="family-place-title">Place name</Label><Input id="family-place-title" maxLength={120} placeholder="Our grocery store" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} /></div><div className="space-y-1.5"><Label htmlFor="family-place-address">Address or description</Label><Input id="family-place-address" maxLength={500} placeholder="Optional — helps everyone recognize it" value={form.address} onChange={(e) => setForm({...form,address:e.target.value})} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="family-place-lat">Latitude</Label><Input id="family-place-lat" type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(e) => setForm({...form,latitude:e.target.value})} /></div><div className="space-y-1.5"><Label htmlFor="family-place-lng">Longitude</Label><Input id="family-place-lng" type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(e) => setForm({...form,longitude:e.target.value})} /></div></div><p className="text-xs text-muted-foreground">Choosing a spot does not share it. Save below when you’re ready.</p></>}
      </fieldset>{formError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}<div className="flex flex-wrap items-center justify-end gap-2">{form.kind === "place" && form.revision && <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={formBusy} onClick={async() => { if(!confirm("Delete this saved place for the whole family?"))return;const generation = formGeneration.current;try{if(await workspace.mutate({action:"delete_place",id:form.id,revision:form.revision!},form.id) && generation === formGeneration.current)closeForm();}catch(problem){report(problem);} }}>Delete place</Button>}<Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button type="submit" className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800" disabled={formBusy || !workspace.fresh}>{formBusy ? <Loader2 className="size-4 animate-spin" /> : form.kind === "list" ? <ClipboardList className="size-4" /> : <Plus className="size-4" />}Save to Family</Button></div></form>}
    </DialogContent></Dialog>
  </>;
}
