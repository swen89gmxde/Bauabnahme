import assert from 'node:assert/strict';
import {recordWait,recordStateLabel,selectRecords} from '../angebote/record-overview.mjs';

const signed=(date,extra={})=>({id:date,customer_name:'Mustermann',commission:'AG-2026-11-0110',state:'completed',accepted_at:date,minimum_wait_days:14,...extra});
const start=signed('2026-11-26T14:00:00Z');
assert.equal(recordWait(start,'2026-11-27').label,'Noch 13 Tage Wartezeit');
assert.equal(recordWait(start,'2026-12-09').label,'Noch 1 Tag Wartezeit');
assert.equal(recordWait(start,'2026-12-10').label,'Wartezeit endet heute');
assert.equal(recordWait(start,'2026-12-11').label,'Wartezeit abgelaufen');
assert.equal(recordWait(start,'2026-11-27').endDate,'2026-12-10');
// Contract received Saturday; 14-day end on Saturday becomes Monday.
assert.equal(recordWait(signed('2026-11-28T14:00:00Z'),'2026-11-28').endDate,'2026-12-14');
// Christmas and New Year, Good Friday through Easter Monday, local holiday.
assert.equal(recordWait(signed('2026-12-11T14:00:00Z'),'2026-12-11').endDate,'2026-12-28');
assert.equal(recordWait(signed('2026-12-18T14:00:00Z'),'2026-12-18').endDate,'2027-01-04');
assert.equal(recordWait(signed('2027-03-12T14:00:00Z'),'2027-03-12').endDate,'2027-03-30');
assert.equal(recordWait(signed('2028-08-01T14:00:00Z'),'2028-08-01').endDate,'2028-08-16');
// Berlin rather than UTC date; calculation independent of daylight saving.
assert.equal(recordWait(signed('2026-10-31T23:30:00Z'),'2026-11-01').endDate,'2026-11-16');
assert.equal(recordWait(signed('2026-11-26T14:00:00Z',{state:'archive_pending'}),'2026-11-27').endDate,'2026-12-10');
assert.equal(recordWait({...start,minimum_wait_days:null},'2026-11-27').kind,'unknown');
assert.equal(recordWait({...start,accepted_at:null},'2026-11-27').kind,'unknown');
assert.equal(recordWait({...start,archive_test:true},'2026-11-27'),null);
assert.equal(recordWait({...start,state:'trashed'},'2026-11-27'),null);
assert.equal(recordWait({...start,ordered_on:'2026-12-12'},'2026-12-13').label,'Bestellt am 12.12.2026');
assert.equal(recordStateLabel({...start,order_status_closed:true}),'Auftrag abgeschlossen');
const rows=[{...start,id:'a',customer_name:'Zeller',commission:'AG-2026-11-0110',created:1},{...start,id:'b',customer_name:'Bär',commission:'AG-2026-11-0112',created:2},{...start,id:'c',customer_name:'Bär',commission:'AG-2026-11-0111',state:'active',accepted_at:null,created:3}];
assert.deepEqual(selectRecords(rows).map(r=>r.id),['b','c','a']);
assert.deepEqual(selectRecords(rows,{sort:'commission'}).map(r=>r.id),['b','c','a']);
assert.deepEqual(selectRecords(rows,{sort:'newest'}).map(r=>r.id),['c','b','a']);
assert.deepEqual(selectRecords(rows,{query:'bär',filter:'open'}).map(r=>r.id),['c']);
assert.deepEqual(selectRecords(rows,{filter:'waiting',today:'2026-11-27'}).map(r=>r.id),['b','a']);
assert.deepEqual(selectRecords(rows,{filter:'elapsed',today:'2026-12-11'}).map(r=>r.id),['b','a']);
assert.deepEqual(selectRecords(rows,{query:'0112'}).map(r=>r.id),['b']);
console.log('Record overview: calendar boundaries, local holidays, sorting, searching and status filters passed.');
