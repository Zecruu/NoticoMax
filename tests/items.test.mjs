import assert from "node:assert/strict";
import { test } from "node:test";
import { filterLibraryItems } from "../src/lib/items/library.ts";
import {
  hasItemChanges,
  prepareItemDraft,
  normalizeWebUrl,
  checklistTasks,
  toggleChecklistTask,
  notePreview,
} from "../src/lib/items/draft.ts";

const draft = (overrides) => ({
  type: "note",
  title: "",
  content: "",
  url: "",
  reminderDate: "",
  recurrence: "none",
  tags: [],
  pinned: false,
  ...overrides,
});

test("an address alone saves a link with a useful title", () => {
  const result = prepareItemDraft(
    draft({ type: "url", url: " www.example.com/reading?q=notes#start " })
  );
  assert.equal(result.kind, "ready");
  assert.equal(result.item.title, "example.com");
  assert.equal(
    result.item.url,
    "https://www.example.com/reading?q=notes#start"
  );
  assert.equal(result.item.content, "");
});

test("invalid or unsafe links are rejected without discarding the draft", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///secret",
    "not a website",
    "",
    "/relative",
    "justtext",
  ]) {
    assert.equal(normalizeWebUrl(url), null, url);
    assert.equal(
      prepareItemDraft(draft({ type: "url", title: "Keep my draft", url }))
        .kind,
      "invalid"
    );
  }
  assert.equal(
    normalizeWebUrl("http://localhost:5468/notes"),
    "http://localhost:5468/notes"
  );
});

test("blank new drafts are skipped while clearing an existing note needs text", () => {
  assert.equal(prepareItemDraft(draft({ content: " \n " })).kind, "empty");
  assert.equal(
    prepareItemDraft(draft(), { title: "Existing" }).kind,
    "invalid"
  );
});

test("notes derive a title from the first real line and preserve explicit titles", () => {
  const result = prepareItemDraft(
    draft({ content: "\n- [ ] Pack a snack\n- [x] Pick a trail" })
  );
  assert.equal(result.item.title, "Pack a snack");
  assert.equal(result.item.content, "- [ ] Pack a snack\n- [x] Pick a trail");
  assert.equal(
    prepareItemDraft(draft({ title: " My title ", content: "Other text" })).item
      .title,
    "My title"
  );
});

test("organization and reminder completion survive editing; pending tags are normalized", () => {
  const result = prepareItemDraft(
    draft({
      type: "reminder",
      title: "Walk",
      tags: [" outside ", "outside", ""],
      folderId: "family",
      pinned: true,
    }),
    { reminderCompleted: true, color: "blue" }
  );
  assert.equal(result.item.reminderCompleted, true);
  assert.equal(result.item.color, "blue");
  assert.equal(result.item.folderId, "family");
  assert.deepEqual(result.item.tags, ["outside"]);
  assert.equal(result.item.pinned, true);
});

test("reminder wall-clock time becomes ISO and an invalid date stays editable", () => {
  const value = "2026-11-07T09:30";
  const result = prepareItemDraft(
    draft({
      type: "reminder",
      title: "Call",
      reminderDate: value,
      recurrence: "weekly",
    })
  );
  assert.equal(result.item.reminderDate, new Date(value).toISOString());
  assert.equal(result.item.recurrence, "weekly");
  const invalid = prepareItemDraft(
    draft({ type: "reminder", title: "Call", reminderDate: "invalid-date" })
  );
  assert.equal(invalid.kind, "invalid");
  assert.equal(invalid.field, "reminderDate");
});

test("inline checklist toggles affect the intended task and leave code examples untouched", () => {
  const content =
    "Example:\n```md\n- [ ] Not a task\n```\n- [x] First\n* [ ] Second\n+ [X] Third";
  assert.deepEqual(
    checklistTasks(content).map(({ text, checked }) => ({ text, checked })),
    [
      { text: "First", checked: true },
      { text: "Second", checked: false },
      { text: "Third", checked: true },
    ]
  );
  const next = toggleChecklistTask(content, 1);
  assert.equal(next, content.replace("* [ ] Second", "* [x] Second"));
  assert.equal(toggleChecklistTask(next, 1), content);
  assert.equal(toggleChecklistTask(content, 99), content);
});

test("a preview skips the auto-title instead of repeating it", () => {
  assert.equal(
    notePreview("# Weekend\n\nKeep Saturday free.", "Weekend"),
    "Keep Saturday free."
  );
});

test("opening and closing an unchanged note does not count as an edit", () => {
  const original = {
    type: "note",
    title: "Weekend",
    content: "Go outside",
    tags: [],
    pinned: false,
    reminderCompleted: false,
  };
  const result = prepareItemDraft(draft(original), original);
  assert.equal(hasItemChanges(result.item, original), false);
  assert.equal(
    hasItemChanges({ ...result.item, content: "Different text" }, original),
    true
  );
  assert.equal(
    hasItemChanges({ ...result.item, pinned: true }, original),
    true
  );
});

test("a shorter nested fence does not turn code examples into tasks", () => {
  const content = "````md\n```\n- [ ] Still code\n```\n````\n- [ ] Real task";
  assert.deepEqual(
    checklistTasks(content).map((task) => task.text),
    ["Real task"]
  );
  assert.equal(
    toggleChecklistTask(content, 0),
    content.replace("- [ ] Real task", "- [x] Real task")
  );
});

test("library search combines words across titles, bodies, tags, and links without changing the snapshot", () => {
  const library = [
    {
      type: "url",
      title: "Read later",
      content: "Design ideas",
      url: "https://example.com",
      tags: ["weekend"],
      folderId: "inbox",
    },
    {
      type: "note",
      title: "Weekend plan",
      content: "Go outside",
      tags: [],
      folderId: "inbox",
    },
    {
      type: "reminder",
      title: "Call",
      content: "",
      tags: [],
      folderId: "family",
    },
  ];
  assert.deepEqual(
    filterLibraryItems(library, "all", " EXAMPLE weekend ", "inbox"),
    [library[0]]
  );
  assert.deepEqual(filterLibraryItems(library, "note", "", "inbox"), [
    library[1],
  ]);
  assert.deepEqual(filterLibraryItems(library, "all", "  "), library);
  assert.equal(library.length, 3);
  assert.deepEqual(filterLibraryItems(library, "all", "not found"), []);
});

test("the library filter cannot surface deleted notes or password/environment records", () => {
  const library = [
    { type: "note", title: "Keep", content: "", tags: [] },
    { type: "note", title: "Deleted", content: "", tags: [], deleted: true },
    { type: "credential", title: "Password", content: "", tags: [] },
    { type: "envvar", title: "Secret", content: "", tags: [] },
  ];
  assert.deepEqual(filterLibraryItems(library, "all"), [library[0]]);
  assert.deepEqual(filterLibraryItems(library, "credential"), []);
});
