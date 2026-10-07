import { createHmac, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { getDatabaseUrl } from './connection.mjs';
const secret=process.env.AUDIT_HMAC_SECRET;if(!secret)throw new Error('AUDIT_HMAC_SECRET is required');
const pool=new pg.Pool({connectionString:getDatabaseUrl()});
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
let previous='';let checked=0;let legacy=0;let ok=true;
try{const rows=await pool.query('SELECT id,user_id,actor_user_id,action,entity,entity_id,request_id,before_data,after_data,before,after,previous_hash,prev_hash,event_hash,row_hash FROM audit_event ORDER BY id');
 for(const r of rows.rows){const actual=r.event_hash||r.row_hash||'';if(!r.event_hash){legacy++;previous=actual;continue;}
  const before=r.before_data??r.before??null,after=r.after_data??r.after??null,expectedPrevious=r.previous_hash??r.prev_hash??'';
  const payload=JSON.stringify(stable({userId:r.user_id||r.actor_user_id||null,action:r.action,entity:r.entity,entityId:r.entity_id,requestId:r.request_id,before,after,previous:expectedPrevious}));
  const expected=createHmac('sha256',secret).update(payload).digest();let found;try{found=Buffer.from(actual,'hex')}catch{found=Buffer.alloc(0)}
  if(expectedPrevious!==previous||found.length!==expected.length||!timingSafeEqual(found,expected)){ok=false;console.error(`audit chain mismatch at event ${r.id}`);break;}previous=actual;checked++;
 }
 console.log(JSON.stringify({ok,verifiedEvents:checked,legacyEvents:legacy,head:previous||null}));if(!ok)process.exitCode=1;
}finally{await pool.end()}
