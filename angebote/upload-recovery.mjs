// Never repeat a write automatically after a lost response. Query its durable result instead.
export async function saveOfferWithRecovery(api, form, requestId) {
 try { return await api('create', {method:'POST', body:form}); }
 catch (error) {
  if (!['network_error','invalid_response','server_error'].includes(error.code)) throw error;
  try { return await api('create-result&request='+encodeURIComponent(requestId)); }
  catch (lookupError) {
   if (['create_closed','create_pending'].includes(lookupError.code)) throw lookupError;
   const failure=Error('Die Speicherbestätigung konnte nicht abgerufen werden. Bitte zuerst „Meine Vorgänge anzeigen“ prüfen. Ihre Eingaben bleiben erhalten; erneutes Speichern derselben Vorbereitung erzeugt keine doppelte Freigabe.');
   failure.code='save_unconfirmed';throw failure;
  }
 }
}
