import fs from 'node:fs';
const montagePolicy=JSON.parse(fs.readFileSync(new URL('../angebote/montage-current.json',import.meta.url)));
export const syntheticCheckout={version:1,contract_type:'work_consumer',description:'Synthetic window installation - no real customer',total_cents:123456,additional_costs:'None',payment_terms:'Synthetic payment terms, no real order.',delivery_terms:montagePolicy.text,delivery_policy_version:montagePolicy.version,customer_email:'customer@example.test',checked_against_offer:true};
export const syntheticAuthority=offer=>offer.authority?{version:offer.authority.version,role:'sole_owner',principal_name:offer.authority.principal_name,accepted:true}:undefined;

// PHP-WASM multipart form fixtures need ASCII JSON for UTF-8 field payloads.
export const metadataJSON=value=>JSON.stringify(value).replace(/[^\x00-\x7f]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
