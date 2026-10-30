"use client";

import { ArrowLeft, ArrowRight, Bell, Check, ChevronRight, ClipboardList, FileText, HeartHandshake, Link2, Loader2, MapPin, Plus, RefreshCw, Settings2, ShieldCheck, Users, WifiOff } from "lucide-react";
import type { LocalFolder, LocalItem } from "@/lib/db/indexed-db";
import type { Household } from "@/hooks/use-households";
import { checklistProgress, type FamilyList, type FamilyListEntry, type FamilyWorkspace, type FamilyPlace } from "@/lib/family/workspace";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/items/item-card";
import { ReminderSchedule } from "@/components/items/reminder-schedule";

export type FamilyTab = "overview" | "lists" | "notes" | "reminders" | "places";
export interface WorkspaceScreenProps {
  household: Household;
  households: Household[];
  folders: LocalFolder[];
  folderId: string | null;
  items: LocalItem[];
  workspace: FamilyWorkspace | null;
  loading: boolean;
  fresh: boolean;
  error: string | null;
  pending: Set<string>;
  tab: FamilyTab;
  selectedListId: string | null;
  canCreate: boolean;
  nativeMaps: boolean;
  onPersonal: () => void;
  onManage: () => void;
  onHousehold: (id: string) => void;
  onFolder: (id: string | null) => void;
  onTab: (tab: FamilyTab) => void;
  onRefresh: () => void;
  onCreate: (type: "list" | "note" | "reminder" | "place" | "url") => void;
  onOpenList: (id: string | null) => void;
  onCheck: (list: FamilyList, entry: FamilyListEntry) => void;
  onAddEntry: (list: FamilyList) => void;
  onDeleteList: (list: FamilyList) => void;
  onDeleteEntry: (list: FamilyList, entry: FamilyListEntry) => void;
  onEditItem: (item: LocalItem) => void;
  onDeleteItem: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onComplete: (id: string, completed: boolean) => void;
  onContent: (id: string, content: string) => void;
  onMap: () => void;
  onOpenPlace: (place: FamilyPlace) => void;
  onEditPlace: (place: FamilyPlace) => void;
  checkins: React.ReactNode;
}
const tabs: { id: FamilyTab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Together", icon: HeartHandshake }, { id: "lists", label: "Lists", icon: ClipboardList },
  { id: "notes", label: "Notes", icon: FileText }, { id: "reminders", label: "Reminders", icon: Bell }, { id: "places", label: "Places", icon: MapPin },
];
const time = (value?: string) => value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "not yet";

export function FamilyWorkspaceScreen(p: WorkspaceScreenProps) {
  const lists = (p.workspace?.lists ?? []).filter((list) => !p.folderId || list.folderId === p.folderId);
  const items = p.items.filter((item) => !p.folderId || item.folderId === p.folderId);
  const notes = items.filter((item) => !item.isChecklist && (item.type === "note" || item.type === "url"));
  const reminders = items.filter((item) => item.type === "reminder");
  const due = reminders.filter((item) => !item.reminderCompleted).sort((a,b) => (a.reminderDate ?? "z").localeCompare(b.reminderDate ?? "z"));
  const selected = lists.find((list) => list.id === p.selectedListId);
  const places = p.workspace?.places ?? [];
  const featured = lists.find((list) => list.entries.some((entry) => !entry.checked)) ?? lists[0];
  const itemCard = (item: LocalItem) => <ItemCard key={item.clientId} item={item} folder={p.folders.find((f) => f.clientId === item.folderId)} onEdit={p.onEditItem} onDelete={p.onDeleteItem} onTogglePin={p.onPin} onToggleComplete={p.onComplete} onUpdateContent={p.onContent} />;
  const listCard = (list: FamilyList, expanded = false) => {
    const progress = checklistProgress(list);
    return <section key={list.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <button onClick={() => p.onOpenList(list.id)} className="min-w-0 flex-1 text-left">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Shared checklist</span>
          <h3 className="mt-1 break-words text-lg font-semibold tracking-tight">{list.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{progress.complete} of {progress.total} done{!list.canWrite ? " · Read-only" : " · Everyone with edit access can help"}</p>
        </button>
        {!expanded && <Button variant="ghost" size="icon" aria-label={`Open ${list.title}`} onClick={() => p.onOpenList(list.id)}><ArrowRight className="size-4" /></Button>}
      </div>
      <div className="mx-4 mt-3 h-1 overflow-hidden rounded-full bg-muted sm:mx-5"><div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${progress.total ? progress.complete / progress.total * 100 : 0}%` }} /></div>
      <div className="px-2 pb-2 pt-2 sm:px-3">
        {(expanded ? list.entries : list.entries.slice(0,3)).map((entry) => <div key={entry.id} className="flex items-center gap-1">
          <button type="button" role="checkbox" aria-checked={entry.checked} aria-label={entry.text} disabled={!p.fresh || !list.canWrite || p.pending.has(entry.id)} onClick={() => p.onCheck(list, entry)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-muted/60 disabled:opacity-60">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", entry.checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40")}>
              {p.pending.has(entry.id) ? <Loader2 className="size-3.5 animate-spin" /> : entry.checked && <Check className="size-3.5" />}
            </span>
            <span className={cn("break-words text-sm", entry.checked && "text-muted-foreground line-through")}>{entry.text}</span>
          </button>
          {expanded && list.canWrite && <button className="min-h-11 px-2 text-xs text-muted-foreground hover:text-destructive disabled:opacity-40" disabled={!p.fresh || p.pending.has(entry.id)} onClick={() => p.onDeleteEntry(list,entry)} aria-label={`Remove ${entry.text}`}>Remove</button>}
        </div>)}
        {!list.entries.length && <p className="px-2 py-4 text-sm text-muted-foreground">Start with the first thing you need.</p>}
        {!expanded && list.entries.length > 3 && <button onClick={() => p.onOpenList(list.id)} className="min-h-11 w-full px-2 text-left text-xs font-medium text-emerald-700 dark:text-emerald-400">View all {list.entries.length} items <ChevronRight className="inline size-3" /></button>}
        {expanded && list.canWrite && <Button variant="ghost" className="min-h-11 w-full justify-start gap-2 text-emerald-700 dark:text-emerald-400" disabled={!p.fresh} onClick={() => p.onAddEntry(list)}><Plus className="size-4" /> Add an item</Button>}
      </div>
    </section>;
  };

  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-7 sm:py-7">
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="inline-flex rounded-full border bg-muted/50 p-1 text-xs font-medium">
        <button onClick={p.onPersonal} className="min-h-9 rounded-full px-4 text-muted-foreground hover:text-foreground">Personal</button>
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-background"><Users className="size-3.5" /> Family</span>
      </div>
      <Button variant="ghost" size="icon" className="size-11" aria-label="Manage family and invitations" onClick={p.onManage}><Settings2 className="size-5" /></Button>
    </div>
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">One space. Your people.</p>
        {p.households.length > 1 ? <select aria-label="Choose family" className="mt-1 max-w-full bg-transparent text-2xl font-bold tracking-tight" value={p.household.id} onChange={(e) => p.onHousehold(e.target.value)}>{p.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          : <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">{p.household.name}</h1>}
        <p className="mt-1.5 text-sm text-muted-foreground">The everyday things, together.</p>
      </div>
      <button onClick={p.onManage} className="flex shrink-0 flex-col items-end gap-1.5" aria-label={`Manage ${p.household.members.length} family members`}>
        <span className="flex -space-x-2">{p.household.members.slice(0,4).map((member,i) => <span key={member.userId} className={cn("flex size-9 items-center justify-center rounded-full border-2 border-background text-xs font-semibold", i % 2 ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200")}>{(member.email?.[0] ?? "F").toUpperCase()}</span>)}</span>
        <span className="text-[10px] text-muted-foreground">{p.household.members.length} members</span>
      </button>
    </header>
    <nav aria-label="Family sections" className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={p.tab === id} onClick={() => p.onTab(id)} className={cn("relative flex min-h-12 shrink-0 items-center gap-1.5 px-3 text-xs font-medium sm:px-4 sm:text-sm", p.tab === id ? "text-emerald-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground")}><Icon className="size-4" />{label}</button>)}
    </nav>
    <div className="mb-5 mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <p className="flex items-center gap-1.5">{p.fresh ? <span className="size-1.5 rounded-full bg-emerald-500" /> : <WifiOff className="size-3" />} {p.fresh ? `Lists & places: ${time(p.workspace?.refreshedAt)} · Checks every 15s` : p.loading ? "Refreshing Family…" : "Not up to date · Changes need a connection"}</p>
      <button onClick={p.onRefresh} disabled={p.loading} className="flex min-h-8 items-center gap-1.5 px-1 font-medium"><RefreshCw className={cn("size-3", p.loading && "animate-spin")} /> Refresh</button>
    </div>
    {p.error && <p role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{p.error}</p>}
    {p.folders.length > 1 && <div className="mb-4 flex items-center gap-2 text-xs"><label htmlFor="family-folder" className="text-muted-foreground">Showing</label><select id="family-folder" className="min-h-10 max-w-full rounded-lg border bg-background px-2" value={p.folderId ?? "all"} onChange={(e) => p.onFolder(e.target.value === "all" ? null : e.target.value)}><option value="all">All accessible folders</option>{p.folders.map((f) => <option key={f.clientId} value={f.clientId}>{f.name}{f.canWrite ? "" : " · read-only"}</option>)}</select></div>}

    {p.tab === "overview" && <div className="space-y-6">
      <div className="grid grid-cols-4 gap-2">{([{ type:"list",label:"Make a list",icon:ClipboardList },{ type:"note",label:"Leave a note",icon:FileText },{ type:"reminder",label:"Set a reminder",icon:Bell },{ type:"place",label:"Save a place",icon:MapPin }] as const).map(({type,label,icon:Icon}) => <button key={type} disabled={type !== "place" && !p.canCreate} onClick={() => p.onCreate(type)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-1 py-3 text-center text-[11px] font-medium transition hover:border-emerald-500/60 hover:bg-emerald-500/5 disabled:opacity-40 sm:text-xs"><span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><Icon className="size-4" /></span>{label}</button>)}</div>
      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3"><SectionHeading title="On the list" action="All lists" onAction={() => p.onTab("lists")} />{featured ? listCard(featured) : <Empty icon={ClipboardList} title="One list. Everyone can help." text="Start a grocery list here. Someone adds what’s needed; someone else checks it off at the store." action="Create a shared list" onAction={() => p.onCreate("list")} disabled={!p.canCreate} />}</div>
        <div className="space-y-3"><SectionHeading title="Coming up" action="All reminders" onAction={() => p.onTab("reminders")} /><section className="rounded-2xl border bg-card px-4 py-2">{due.length ? due.slice(0,3).map((item) => <button key={item.clientId} onClick={() => p.onEditItem(item)} className="flex min-h-20 w-full items-start gap-3 border-b py-4 text-left last:border-0"><span className="mt-1 rounded-lg bg-amber-500/10 p-2 text-amber-600"><Bell className="size-4" /></span><span className="min-w-0"><span className="block break-words text-sm font-medium">{item.title}</span><ReminderSchedule item={item} now={new Date()} /></span></button>) : <p className="py-8 text-center text-sm text-muted-foreground">Nothing coming up yet.<br /><button className="mt-2 min-h-10 font-medium text-emerald-700 dark:text-emerald-400" disabled={!p.canCreate} onClick={() => p.onCreate("reminder")}>Add a family reminder</button></p>}</section></div>
      </div>
      <div className="space-y-3"><SectionHeading title="Family notes" action="All notes" onAction={() => p.onTab("notes")} />{notes.length ? <div className="rounded-2xl border bg-card px-2 sm:px-3">{notes.slice(0,3).map(itemCard)}</div> : <button disabled={!p.canCreate} onClick={() => p.onCreate("note")} className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-dashed px-4 text-left"><FileText className="size-5 text-muted-foreground" /><span><span className="block text-sm font-medium">Leave something useful for everyone.</span><span className="text-xs text-muted-foreground">A school note, travel plan, or the Wi-Fi instructions.</span></span><Plus className="ml-auto size-4 shrink-0" /></button>}</div>
      <button onClick={() => p.onTab("places")} className="flex w-full items-center gap-3 rounded-2xl border bg-emerald-500/5 p-4 text-left"><span className="rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400"><MapPin className="size-5" /></span><span className="flex-1"><span className="block text-sm font-semibold">Your family’s places</span><span className="text-xs text-muted-foreground">{places.length ? `${places.length} saved destinations` : "Save the places you all come back to"} · separate from check-ins</span></span><ChevronRight className="size-4" /></button>
    </div>}

    {p.tab === "lists" && <div className="space-y-4">{selected ? <><button className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" onClick={() => p.onOpenList(null)}><ArrowLeft className="size-4" /> All shared lists</button>{listCard(selected,true)}{selected.canWrite && <Button variant="ghost" className="text-xs text-destructive" disabled={!p.fresh || p.pending.has(selected.id)} onClick={() => p.onDeleteList(selected)}>Move shared list to trash</Button>}<p className="text-xs text-muted-foreground">Each checkmark saves separately. Changes to different items won’t overwrite each other. Connect to update; this is not an offline queue.</p></> : <><SectionHeading title="Shared lists" action="New list" onAction={() => p.onCreate("list")} disabled={!p.canCreate} /><div className="grid gap-4 md:grid-cols-2">{lists.map((list) => listCard(list))}</div>{!lists.length && <Empty icon={ClipboardList} title="What do we need?" text="Groceries, packing, errands — keep one shared checklist instead of sending everyone different copies." action="Create your first list" onAction={() => p.onCreate("list")} disabled={!p.canCreate} />}</>}</div>}
    {p.tab === "notes" && <div className="space-y-4"><SectionHeading title="Notes & links" action="New note" onAction={() => p.onCreate("note")} disabled={!p.canCreate} /><Button variant="outline" size="sm" onClick={() => p.onCreate("url")} disabled={!p.canCreate}><Link2 className="size-4" /> Share a link</Button>{notes.length ? <div className="rounded-2xl border bg-card px-2 sm:px-3">{notes.map(itemCard)}</div> : <Empty icon={FileText} title="A home for the details" text="Notes here are shared only with members who have access to their folder. Your personal notes stay in Personal." action="Write a shared note" onAction={() => p.onCreate("note")} disabled={!p.canCreate} />}</div>}
    {p.tab === "reminders" && <div className="space-y-4"><SectionHeading title="Family reminders" action="Add reminder" onAction={() => p.onCreate("reminder")} disabled={!p.canCreate} /><p className="text-xs leading-relaxed text-muted-foreground">Dates and to-dos for the family. Device alerts need notification permission and a successful sync; no background arrival or emergency alerts are included.</p>{reminders.length ? <div className="rounded-2xl border bg-card px-2 sm:px-3">{reminders.map(itemCard)}</div> : <Empty icon={Bell} title="Remember it together" text="A pickup, a birthday, or taking the bins out — put the date where everyone can find it." action="Set a reminder" onAction={() => p.onCreate("reminder")} disabled={!p.canCreate} />}</div>}
    {p.tab === "places" && <div className="space-y-5"><SectionHeading title="Saved places" action="Add place" onAction={() => p.onCreate("place")} /><p className="text-xs leading-relaxed text-muted-foreground">Persistent destinations shared with every accepted member. These pins are not anybody’s current location.</p><Button variant="outline" className="min-h-12 w-full gap-2" disabled={!places.length} onClick={p.onMap}><MapPin className="size-4" />{p.nativeMaps ? "View places in native Apple Maps" : "Open first saved place in Maps"}</Button><div className="grid gap-3 sm:grid-cols-2">{places.map((place) => <section key={place.id} className="rounded-2xl border bg-card p-4"><div className="flex gap-3"><span className="mt-1 rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-400"><MapPin className="size-4" /></span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{place.title}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{place.address || `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`}</p></div></div><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => p.onOpenPlace(place)}>Open in Maps <ArrowRight className="size-3" /></Button><Button variant="ghost" size="sm" disabled={!p.fresh} onClick={() => p.onEditPlace(place)}>Edit</Button></div></section>)}</div>{!places.length && <Empty icon={MapPin} title="Meet you there" text="Keep the grocery store, school pickup point, or a favorite park in one place." action="Save a family place" onAction={() => p.onCreate("place")} />}{p.checkins}</div>}
    <footer className="mt-8 flex items-start gap-2 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /><p>Family is shared on purpose. Personal stays separate. Location check-ins are optional and never run in the background.</p></footer>
  </div>;
}
function SectionHeading({title,action,onAction,disabled=false}:{title:string;action:string;onAction:()=>void;disabled?:boolean}) { return <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold tracking-tight">{title}</h2><button disabled={disabled} onClick={onAction} className="flex min-h-9 items-center gap-1 text-xs font-medium text-emerald-700 disabled:opacity-40 dark:text-emerald-400">{action}<ChevronRight className="size-3" /></button></div>; }
function Empty({icon:Icon,title,text,action,onAction,disabled=false}:{icon:typeof FileText;title:string;text:string;action:string;onAction:()=>void;disabled?:boolean}) {return <div className="rounded-2xl border border-dashed px-5 py-8 text-center"><span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><Icon className="size-5" /></span><h3 className="text-sm font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{text}</p><Button variant="outline" size="sm" className="mt-4 gap-1.5" disabled={disabled} onClick={onAction}><Plus className="size-3.5" />{action}</Button></div>;}
