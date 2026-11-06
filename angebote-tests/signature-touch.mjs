import assert from 'node:assert/strict';
import {protectSignatureTouch} from '../angebote/signature-touch.mjs';
class Target{
 listeners=new Map();style={};
 addEventListener(type,callback,options){const list=this.listeners.get(type)||[];list.push({callback,options});this.listeners.set(type,list);}
 emit(type,data={}){const event={cancelable:true,preventDefault(){this.prevented=true;},...data};for(const {callback} of this.listeners.get(type)||[])callback(event);return event;}
}
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(){
 const canvas=new Target(),win=new Target(),doc=new Target(),frames=new Map();let n=0,idle=0,cancelled=0,blurred=0;
 doc.body={style:{position:'relative',top:'',left:'',width:'',overflow:'visible'}};doc.documentElement={style:{overflow:'auto',overscrollBehavior:'contain'}};
 const initial=JSON.parse(JSON.stringify([doc.body.style,doc.documentElement.style]));
 doc.activeElement={blur(){blurred++;}};win.scrollX=0;win.scrollY=375;win.scrolls=[];
 win.scrollTo=options=>win.scrolls.push(options);win.requestAnimationFrame=callback=>{frames.set(++n,callback);return n;};win.cancelAnimationFrame=id=>frames.delete(id);
 canvas.captured=[];canvas.setPointerCapture=id=>canvas.captured.push(id);
 const guard=protectSignatureTouch(canvas,{window:win,document:doc,onIdle:()=>idle++,onCancel:()=>cancelled++});
 return {canvas,win,doc,guard,initial,flush(){for(const [id,callback] of frames){frames.delete(id);callback();}},get idle(){return idle;},get cancelled(){return cancelled;},get blurred(){return blurred;}};
}
{
 const f=fixture();check(f.guard.active,false);
 f.canvas.emit('pointerdown',{pointerType:'mouse',pointerId:1});check(f.guard.active,false);check(f.doc.body.style.position,'relative');
 f.canvas.emit('pointerdown',{pointerType:'touch',pointerId:2});check(f.guard.active,true);check(f.canvas.captured,[2]);check(f.doc.body.style.position,'fixed');check(f.doc.body.style.top,'-375px');check(f.doc.documentElement.style.overflow,'hidden');check(f.win.scrolls[0],{left:0,top:375,behavior:'instant'});check(f.blurred,1);
 f.doc.emit('pointerup',{pointerId:99});f.flush();check(f.guard.active,true);
 f.doc.emit('pointerup',{pointerId:2});check(f.guard.active,true);check(f.idle,0);f.flush();check(f.guard.active,false);check(f.idle,1);check([f.doc.body.style,f.doc.documentElement.style],f.initial);check(f.win.scrolls.at(-1),{left:0,top:375,behavior:'instant'});
}
{
 const f=fixture();
 check(f.canvas.listeners.get('touchmove')[0].options.passive,false);
 check(f.canvas.emit('touchstart',{touches:[{}]}).prevented,true);check(f.canvas.emit('touchmove').prevented,true);check(f.doc.emit('touchmove').prevented,undefined);
 check(f.canvas.emit('touchmove',{cancelable:false}).prevented,undefined);
 f.doc.emit('touchend',{touches:[]});f.flush();check(f.guard.active,false);check(f.cancelled,0);
}
{
 const f=fixture();f.canvas.emit('pointerdown',{pointerType:'touch',pointerId:1});f.canvas.emit('touchstart',{touches:[{}]});
 f.doc.emit('pointerup',{pointerId:1});f.flush();check(f.guard.active,true);
 f.doc.emit('touchend',{touches:[]});f.flush();check(f.guard.active,false);check(f.idle,1);
 // A new stroke before the release frame must retain the same fixed page position.
 f.canvas.emit('pointerdown',{pointerType:'pen',pointerId:2});f.doc.emit('pointerup',{pointerId:2});f.canvas.emit('pointerdown',{pointerType:'pen',pointerId:3});f.flush();check(f.guard.active,true);f.doc.emit('pointerup',{pointerId:3});f.flush();check(f.guard.active,false);
}
for(const trigger of ['pointercancel','touchcancel','lostpointercapture','blur','pagehide','hidden','reset']){
 const f=fixture();f.canvas.emit('pointerdown',{pointerType:'touch',pointerId:4});
 if(trigger==='blur'||trigger==='pagehide')f.win.emit(trigger);
 else if(trigger==='hidden'){f.doc.hidden=true;f.doc.emit('visibilitychange');}
 else if(trigger==='reset')f.guard.reset();
 else f.canvas.emit(trigger,{pointerId:4});
 f.flush();check(f.guard.active,false);check(f.cancelled,1);check([f.doc.body.style,f.doc.documentElement.style],f.initial);
 f.guard.reset();check(f.cancelled,1);
}
console.log(checks+' Prüfungen bestanden: Touch-Scrollsperre, Pointer-Ende, Abbruch, App-Wechsel und Positionswiederherstellung (simulierte Ereignisse).');
