// Keep touch signing still without disabling scrolling elsewhere on the page.
export function protectSignatureTouch(canvas,{window:win=window,document:doc=document,onIdle=()=>{},onCancel=()=>{}}={}){
 const pointers=new Set(),body=doc.body,root=doc.documentElement;
 let touches=0,locked=null,frame=0;
 const active=()=>pointers.size>0||touches>0;
 const prevent=event=>{if(event.cancelable)event.preventDefault();};
 function lock(){
  if(frame){win.cancelAnimationFrame(frame);frame=0;}
  if(locked)return;
  doc.activeElement?.blur?.();
  const x=win.scrollX,y=win.scrollY;
  win.scrollTo({left:x,top:y,behavior:'instant'});
  const properties=['position','top','left','width','overflow'];
  locked={x,y,body:Object.fromEntries(properties.map(k=>[k,body.style[k]])),overflow:root.style.overflow,overscroll:root.style.overscrollBehavior};
  Object.assign(body.style,{position:'fixed',top:-y+'px',left:-x+'px',width:'100%',overflow:'hidden'});
  root.style.overflow='hidden';root.style.overscrollBehavior='none';
 }
 function unlock(){
  if(!locked)return;
  const saved=locked;locked=null;Object.assign(body.style,saved.body);
  root.style.overflow=saved.overflow;root.style.overscrollBehavior=saved.overscroll;
  win.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
  onIdle();
 }
 function finish(){
  if(active()||frame)return;
  // Let SignaturePad finish its last point before restoring layout or resizing.
  frame=win.requestAnimationFrame(()=>{frame=0;if(!active())unlock();});
 }
 function reset(){
  const interrupted=active();pointers.clear();touches=0;
  if(frame){win.cancelAnimationFrame(frame);frame=0;}
  if(interrupted)onCancel();unlock();
 }
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse')return;
  pointers.add(event.pointerId);lock();
  try{canvas.setPointerCapture(event.pointerId);}catch{/* Legacy browsers use touch events below. */}
 },{capture:true});
 doc.addEventListener('pointerup',event=>{pointers.delete(event.pointerId);finish();});
 canvas.addEventListener('pointercancel',reset);
 canvas.addEventListener('lostpointercapture',event=>{if(pointers.delete(event.pointerId)){onCancel();finish();}});
 canvas.addEventListener('touchstart',event=>{touches=event.touches.length;prevent(event);lock();},{passive:false,capture:true});
 canvas.addEventListener('touchmove',prevent,{passive:false,capture:true});
 doc.addEventListener('touchend',event=>{if(touches){touches=event.touches.length;finish();}},{passive:true});
 canvas.addEventListener('touchcancel',reset,{passive:true});
 canvas.addEventListener('gesturestart',prevent,{passive:false});
 canvas.addEventListener('contextmenu',prevent);
 win.addEventListener('blur',reset);win.addEventListener('pagehide',reset);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();});
 return {get active(){return active()||!!locked;},reset};
}
