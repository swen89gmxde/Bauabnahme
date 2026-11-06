// The one-time setup secret stays out of query strings, referrers and saved URLs.
const token=location.hash.slice(1);
if(token){
 history.replaceState(null,'',location.pathname+location.search);
 const status=document.getElementById('setup-status');
 try{
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('Der Einrichtungszugang ist ungültig.');
  const response=await fetch('setup.php?phase=unlock',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="setup-csrf"]').content},credentials:'same-origin',cache:'no-store',body:JSON.stringify({token})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Der Einrichtungszugang konnte nicht geöffnet werden.');
  location.replace('setup.php');
 }catch(error){if(status)status.textContent=error.message;}
}
