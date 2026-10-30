import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { parseWorkspaceCommand, checklistProgress, workspaceError } from '../src/lib/family/workspace.ts';
const id=randomUUID(),folder=randomUUID();

test('workspace commands bind stable IDs and drop supplied author/household identities',()=>{
 const result=parseWorkspaceCommand({action:'create_list',id,folderId:folder,title:' Groceries ',entries:[{id:randomUUID(),text:' Milk ',checked:true}],userId:'forged',householdId:'other'});
 assert.equal(result.title,'Groceries');assert.equal(result.entries[0].text,'Milk');assert.equal(result.entries[0].checked,undefined);assert.equal(result.userId,undefined);assert.equal(result.householdId,undefined);
 assert.equal(parseWorkspaceCommand({action:'create_list',id,folderId:folder,title:'List',entries:Array(201).fill({id:randomUUID(),text:'x'})}),null);
 const duplicate=randomUUID();assert.equal(parseWorkspaceCommand({action:'create_list',id,folderId:folder,title:'List',entries:[{id:duplicate,text:'one'},{id:duplicate,text:'two'}]}),null);
});
test('entry writes use explicit state plus a revision, never a non-idempotent blind toggle',()=>{
 const entryId=randomUUID();const base={action:'entry',listId:id,entryId,change:'set_checked',checked:true};
 assert.equal(parseWorkspaceCommand(base),null);assert.equal(parseWorkspaceCommand({...base,revision:0}),null);
 assert.deepEqual(parseWorkspaceCommand({...base,revision:1}),{...base,revision:1});
 assert.equal(parseWorkspaceCommand({...base,revision:1,checked:'true'}),null);
 assert.equal(workspaceError('family_entry_conflict').status,409);assert.equal(workspaceError('family_read_only').status,403);
});
test('persistent place inputs accept zero coordinates but reject missing, nonfinite and out-of-range values',()=>{
 const place={action:'save_place',id,title:' Store ',address:' Main Street ',latitude:0,longitude:0};
 assert.equal(parseWorkspaceCommand(place).title,'Store');assert.equal(parseWorkspaceCommand(place).address,'Main Street');
 for(const patch of [{latitude:91},{latitude:NaN},{longitude:Infinity},{longitude:181},{latitude:'0'},{title:''},{revision:-1}])assert.equal(parseWorkspaceCommand({...place,...patch}),null);
 assert.deepEqual(checklistProgress({entries:[{checked:true},{checked:false},{checked:true}]}),{complete:2,total:3});
});

// Render the actual UI server-side with real React/Radix components. This is
// markup/accessibility smoke coverage, not a rendered-browser screenshot test.
const require=createRequire(import.meta.url), cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const loaded={exports:{}};cache.set(file,loaded);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const from=(name)=>{
  if(name.startsWith('@/')||name.startsWith('.')){
   const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);
   const target=[base,base+'.ts',base+'.tsx',base+'/index.ts'].find(p=>existsSync(p)&&!p.endsWith('/index.tsx'));
   if(target)return load(target);
  }
  return require(name);
 };
 new Function('require','module','exports',code)(from,loaded,loaded.exports);return loaded.exports;
}
test('actual Family UI exposes Personal boundary, real checkboxes, read-only states and honest freshness',()=>{
 const {FamilyWorkspaceScreen}=load(path.resolve('src/components/family/family-workspace-screen.tsx'));
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const noop=()=>{};
 const household={id:'family',name:'Review family',members:[{userId:'member',email:'member@example.test'}]};
 const list={id:'groceries',title:'Saturday groceries',canWrite:true,folderId:'folder',entries:[{id:'milk',text:'Milk',checked:false,revision:1},{id:'bread',text:'Bread',checked:true,revision:2}]};
 const props={household,households:[household],folders:[],folderId:null,items:[],workspace:{lists:[list],places:[],refreshedAt:'2026-10-30T12:00:00Z'},loading:false,fresh:true,error:null,pending:new Set(),tab:'lists',selectedListId:'groceries',canCreate:true,nativeMaps:false,checkins:null};
 for(const name of ['onPersonal','onManage','onHousehold','onFolder','onTab','onRefresh','onCreate','onOpenList','onCheck','onAddEntry','onDeleteEntry','onDeleteList','onEditItem','onDeleteItem','onPin','onComplete','onContent','onMap','onOpenPlace','onEditPlace'])props[name]=noop;
 const html=renderToStaticMarkup(React.createElement(FamilyWorkspaceScreen,props));
 assert.match(html,/Personal/);assert.match(html,/Saturday groceries/);assert.match(html,/role="checkbox" aria-checked="false" aria-label="Milk"/);assert.match(html,/role="checkbox" aria-checked="true" aria-label="Bread"/);assert.match(html,/Checks every 15s/);assert.match(html,/no.*offline queue/i);
 const readonly=renderToStaticMarkup(React.createElement(FamilyWorkspaceScreen,{...props,fresh:false,workspace:{...props.workspace,lists:[{...list,canWrite:false}]}}));
 assert.match(readonly,/Read-only/);assert.match(readonly,/aria-label="Milk" disabled/);assert.match(readonly,/Not up to date/);
});

test('iOS MapKit files are registered with Capacitor/Xcode and never enable location tracking',()=>{
 const swift=readFileSync('ios/App/App/FamilyMapPlugin.swift','utf8'),bridge=readFileSync('ios/App/App/FamilyBridgeViewController.swift','utf8'),project=readFileSync('ios/App/App.xcodeproj/project.pbxproj','utf8'),storyboard=readFileSync('ios/App/App/Base.lproj/Main.storyboard','utf8');
 assert.match(swift,/import MapKit/);assert.match(swift,/MKMapView/);assert.match(swift,/showsUserLocation = false/);assert.doesNotMatch(swift,/startUpdatingLocation|requestAlwaysAuthorization|CLLocationManager/);
 assert.match(bridge,/registerPluginInstance\(FamilyMapPlugin\(\)\)/);assert.match(project,/FamilyMapPlugin.swift in Sources/);assert.match(project,/FamilyBridgeViewController.swift in Sources/);assert.match(storyboard,/customClass="FamilyBridgeViewController"/);
});
