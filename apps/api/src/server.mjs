import 'reflect-metadata';
import express from 'express';
import pg from 'pg';
import argon2 from 'argon2';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.mjs';
import { randomBytes, createHash, createHmac, randomUUID } from 'node:crypto';
import { evalParam, parseDecimal, summarize } from '../../../packages/engine/src/index.ts';
import { evaluateInspection } from './server-evaluator.mjs';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const cookieName = 'tigl_qc_session';
const ttlHours = Number(process.env.SESSION_TTL_HOURS || 8);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { req.requestId = req.get('x-request-id') || randomUUID(); res.set('x-request-id', req.requestId); next(); });

function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((x) => x.trim().split('=').map(decodeURIComponent)).filter((x) => x.length === 2)); }
function hashToken(token) { return createHash('sha256').update(token).digest(); }
function canonical(value) { if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value; }
function stableJson(value) { return JSON.stringify(canonical(value)); }
async function audit(client, userId, action, entity, entityId, req, before = null, after = null) {
  await client.query('SELECT pg_advisory_xact_lock(784312)');
  const prior = await client.query('SELECT COALESCE(event_hash,row_hash) AS chain_hash FROM audit_event ORDER BY id DESC LIMIT 1');
  const previous = prior.rows[0]?.chain_hash || '';
  const data = stableJson({ userId, action, entity, entityId, requestId: req.requestId, before, after, previous });
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) throw new Error('AUDIT_HMAC_SECRET is required');
  const digest = createHmac('sha256', secret).update(data).digest('hex');
  await client.query("INSERT INTO audit_event(user_id,actor_user_id,action,entity,entity_id,request_id,before_data,after_data,before,after,previous_hash,prev_hash,event_hash,row_hash,via) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$6,$7,$8,$8,$9,$9,'web')", [userId, action, entity, entityId, req.requestId, before, after, previous || null, digest]);
}
function sessionCookie(token, maxAge) { return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`; }
async function authenticate(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[cookieName];
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const result = await pool.query(`SELECT s.id AS session_id,s.expires_at,u.id,u.username,u.full_name,u.must_change_password,u.active,u.default_site_id,ds.company_id AS default_company_id,
      COALESCE(array_agg(DISTINCT rp.perm_key) FILTER (WHERE rp.perm_key IS NOT NULL AND ucr.company_id=ds.company_id),'{}') AS permissions,
      COALESCE(array_agg(DISTINCT ucr.role_key) FILTER (WHERE ucr.role_key IS NOT NULL AND ucr.company_id=ds.company_id),'{}') AS roles,
      COALESCE(array_agg(DISTINCT ucr.company_id) FILTER (WHERE ucr.company_id IS NOT NULL),'{}') AS companies
      FROM app_session s JOIN app_user u ON u.id=s.user_id LEFT JOIN user_company_role ucr ON ucr.user_id=u.id
      LEFT JOIN role_permission rp ON rp.role_key=ucr.role_key
      LEFT JOIN site ds ON ds.id=u.default_site_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() GROUP BY s.id,u.id,ds.company_id`, [hashToken(token)]);
    if (!result.rowCount || !result.rows[0].active) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    req.user = result.rows[0];
    if (req.user.must_change_password && !/\/auth\/(password|logout)$/.test(req.path)) return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' });
    next();
  } catch (err) { next(err); }
}
function requirePermission(permission) { return async (req, res, next) => { try {
  let companyId=req.body?.companyId||req.user.default_company_id;
  if(req.params.id&&req.path.startsWith('/api/v1/inspections/')){
    const scope=await pool.query('SELECT company_id FROM inspection WHERE id=$1 AND company_id=ANY($2)',[req.params.id,req.user.companies]);
    if(!scope.rowCount)return res.status(404).json({error:'NOT_FOUND'});companyId=scope.rows[0].company_id;
  }
  if(!companyId||!req.user.companies.includes(companyId))return res.status(403).json({error:'FORBIDDEN',permission});
  const allowed=await pool.query('SELECT 1 FROM user_company_role u JOIN role_permission rp ON rp.role_key=u.role_key WHERE u.user_id=$1 AND u.company_id=$2 AND rp.perm_key=$3',[req.user.id,companyId,permission]);
  return allowed.rowCount?next():res.status(403).json({error:'FORBIDDEN',permission});
}catch(err){next(err)} }; }
app.get('/api/v1/health', async (_req,res) => { try { await pool.query('SELECT 1'); res.json({ status:'ok', database:'ok' }); } catch { res.status(503).json({ status:'unavailable' }); } });
app.post('/api/v1/auth/login', async (req,res,next) => {
  const client = await pool.connect();
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const result = await client.query('SELECT id,username,password_hash,failed_attempts,locked_until,active,must_change_password FROM app_user WHERE username=$1',[username]);
    const user = result.rows[0];
    if (!user || !user.active || (user.locked_until && new Date(user.locked_until) > new Date()) || !await argon2.verify(user.password_hash,String(req.body?.password || ''))) {
      if (user?.active) await client.query('UPDATE app_user SET failed_attempts=failed_attempts+1, locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval \'15 minutes\' ELSE locked_until END WHERE id=$1',[user.id]);
      return res.status(401).json({ error:'INVALID_CREDENTIALS' });
    }
    await client.query('BEGIN');
    await client.query('UPDATE app_user SET failed_attempts=0,locked_until=NULL,last_login_at=now() WHERE id=$1',[user.id]);
    const raw = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now()+ttlHours*3600_000);
    await client.query('INSERT INTO app_session(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[user.id,hashToken(raw),expires]);
    await audit(client,user.id,'auth.login','app_user',user.id,req,null,{sessionExpiresAt:expires.toISOString()});
    await client.query('COMMIT');
    res.set('Set-Cookie',sessionCookie(raw,ttlHours*3600));
    res.json({ id:user.id,username:user.username,mustChangePassword:user.must_change_password });
  } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
});
app.post('/api/v1/auth/password',authenticate,async (req,res,next) => {
  const password = String(req.body?.password || '');
  if (password.length < 12) return res.status(400).json({ error:'PASSWORD_TOO_SHORT',minimumLength:12 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const encoded = await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
    await client.query('UPDATE app_user SET password_hash=$1,must_change_password=false,password_changed_at=now(),updated_at=now() WHERE id=$2',[encoded,req.user.id]);
    await audit(client,req.user.id,'auth.password_changed','app_user',req.user.id,req,{mustChangePassword:true},{mustChangePassword:false});
    await client.query('COMMIT'); res.json({ok:true});
  } catch(err) { await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
});
app.post('/api/v1/auth/logout',authenticate,async(req,res,next)=>{try{const token=parseCookies(req.headers.cookie)[cookieName];const c=await pool.connect();try{await c.query('BEGIN');await c.query('UPDATE app_session SET revoked_at=now() WHERE token_hash=$1',[hashToken(token)]);await audit(c,req.user.id,'auth.logout','app_session',req.user.session_id,req);await c.query('COMMIT')}finally{c.release()}res.set('Set-Cookie',sessionCookie('',0));res.json({ok:true})}catch(e){next(e)}});
app.get('/api/v1/auth/me',authenticate,(req,res)=>res.json({id:req.user.id,username:req.user.username,name:req.user.full_name,roles:req.user.roles,permissions:req.user.permissions,companies:req.user.companies,defaultSiteId:req.user.default_site_id,defaultCompanyId:req.user.default_company_id}));
app.post('/api/v1/admin/users',authenticate,requirePermission('admin.users'),async(req,res,next)=>{const {username,password,fullName,companyId,roleKey}=req.body||{};
  if(!/^[a-z][a-z0-9._-]{2,31}$/.test(String(username||''))||String(password||'').length<12||!fullName||!req.user.companies.includes(companyId)||!roleKey)return res.status(400).json({error:'INVALID_USER'});
  const c=await pool.connect();try{await c.query('BEGIN');const role=await c.query('SELECT key FROM role WHERE key=$1',[roleKey]);if(!role.rowCount){await c.query('ROLLBACK');return res.status(400).json({error:'UNKNOWN_ROLE'})}
    const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
    const u=await c.query('INSERT INTO app_user(username,full_name,password_hash,must_change_password,created_by) VALUES($1,$2,$3,true,$4) RETURNING id,username,full_name,must_change_password',[username,fullName,hash,req.user.id]);
    await c.query('INSERT INTO user_company_role(user_id,company_id,role_key) VALUES($1,$2,$3)',[u.rows[0].id,companyId,roleKey]);
    await audit(c,req.user.id,'admin.user_created','app_user',u.rows[0].id,req,null,{username,fullName,companyId,roleKey});await c.query('COMMIT');res.status(201).json(u.rows[0]);
  }catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:'USERNAME_EXISTS'});next(e)}finally{c.release()}});
app.post('/api/v1/admin/users/:id/reset-password',authenticate,requirePermission('admin.users'),async(req,res,next)=>{const password=String(req.body?.password||'');if(password.length<12)return res.status(400).json({error:'PASSWORD_TOO_SHORT'});const c=await pool.connect();try{await c.query('BEGIN');const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});const u=await c.query('UPDATE app_user SET password_hash=$1,must_change_password=true,password_changed_at=NULL,failed_attempts=0,locked_until=NULL WHERE id=$2 AND EXISTS(SELECT 1 FROM user_company_role WHERE user_id=$2 AND company_id=$3) RETURNING id,username',[hash,req.params.id,req.user.default_company_id]);if(!u.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}await c.query('UPDATE app_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[req.params.id]);await audit(c,req.user.id,'admin.password_reset','app_user',req.params.id,req);await c.query('COMMIT');res.json({ok:true})}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});
app.delete('/api/v1/admin/users/:id/sessions',authenticate,requirePermission('admin.users'),async(req,res,next)=>{const c=await pool.connect();try{await c.query('BEGIN');const exists=await c.query('SELECT 1 FROM user_company_role WHERE user_id=$1 AND company_id=$2',[req.params.id,req.user.default_company_id]);if(!exists.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}const out=await c.query('UPDATE app_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[req.params.id]);await audit(c,req.user.id,'admin.sessions_revoked','app_user',req.params.id,req,null,{revoked:out.rowCount});await c.query('COMMIT');res.json({revoked:out.rowCount})}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});
app.get('/api/v1/templates/axis',authenticate,requirePermission('tmpl.view'),async(_req,res,next)=>{try{const r=await pool.query("SELECT t.id,t.code,t.name,r.id AS revision_id,r.revision,r.machine_types FROM machine_template t JOIN template_revision r ON r.template_id=t.id AND r.status='published' WHERE t.code IN ('AXIS-MM','AXIS-TMH') ORDER BY t.code");res.json(r.rows)}catch(e){next(e)}});
app.get('/api/v1/sites',authenticate,async(req,res,next)=>{try{const r=await pool.query('SELECT id,company_id,name FROM site WHERE company_id=ANY($1) ORDER BY name',[req.user.companies]);res.json(r.rows)}catch(e){next(e)}});
app.get('/api/v1/inspections',authenticate,requirePermission('insp.view'),async(req,res,next)=>{try{const r=await pool.query(`SELECT i.id,i.number,i.status,i.result,i.work_order,i.machine_serial,i.customer_name,i.created_at,t.code AS template_code
  FROM inspection i JOIN template_revision r ON r.id=i.template_revision_id JOIN machine_template t ON t.id=r.template_id
  WHERE i.company_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[req.user.default_company_id]);res.json(r.rows)}catch(e){next(e)}});
app.get('/api/v1/templates/revisions/:id',authenticate,requirePermission('tmpl.view'),async(req,res,next)=>{try{const result=await pool.query(`SELECT s.code AS stage_code,s.name AS stage_name,s.sequence AS stage_sequence,sec.id AS section_id,sec.name AS section_name,sec.sequence AS section_sequence,p.id,p.code,p.label,p.type,p.unit,p.min_value,p.max_value,p.expected,p.options,p.accept,p.mandatory,p.critical,p.evidence_required,p.spec_tbc,p.applies_to,p.sequence
  FROM template_revision r JOIN template_stage s ON s.revision_id=r.id JOIN template_section sec ON sec.stage_id=s.id JOIN template_parameter p ON p.section_id=sec.id AND p.revision_id=r.id
  WHERE r.id=$1 AND r.status='published' ORDER BY s.sequence,sec.sequence,p.sequence`,[req.params.id]);if(!result.rowCount)return res.status(404).json({error:'PUBLISHED_REVISION_NOT_FOUND'});res.json(result.rows)}catch(e){next(e)}});
app.post('/api/v1/inspections',authenticate,requirePermission('insp.create'),async(req,res,next)=>{
  const {templateRevisionId,siteId,companyId,customerName,salesOrder,workOrder,machineSerial,machineType}=req.body||{};
  if(!req.user.companies.includes(companyId)||!templateRevisionId||!siteId||!customerName||!workOrder||!machineSerial)return res.status(400).json({error:'REQUIRED_FIELDS'});
  const c=await pool.connect();try{await c.query('BEGIN');
    const allowed=await c.query("SELECT 1 FROM template_revision r JOIN machine_template t ON t.id=r.template_id JOIN site s ON s.id=$2 AND s.company_id=$3 WHERE r.id=$1 AND r.status='published'",[templateRevisionId,siteId,companyId]);
    if(!allowed.rowCount){await c.query('ROLLBACK');return res.status(400).json({error:'INVALID_TEMPLATE_OR_SITE'})}
    const year=new Date().getUTCFullYear();const seq=await c.query('INSERT INTO inspection_number_counter(year,last_value) VALUES($1,1) ON CONFLICT(year) DO UPDATE SET last_value=inspection_number_counter.last_value+1 RETURNING last_value',[year]);
    const number=`QC-${year}-${String(seq.rows[0].last_value).padStart(4,'0')}`;
    const result=await c.query("INSERT INTO inspection(number,company_id,site_id,template_revision_id,status,result,customer_name,sales_order,work_order,machine_serial,machine_type,inspector_id) VALUES($1,$2,$3,$4,'in_progress','INCOMPLETE',$5,$6,$7,$8,$9,$10) RETURNING id,number,status,result",[number,companyId,siteId,templateRevisionId,customerName,salesOrder||null,workOrder,machineSerial,machineType||null,req.user.id]);
    await audit(c,req.user.id,'inspection.created','inspection',result.rows[0].id,req,null,result.rows[0]);await c.query('COMMIT');res.status(201).json(result.rows[0]);
  }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}
});
app.get('/api/v1/inspections/:id',authenticate,requirePermission('insp.view'),async(req,res,next)=>{try{
  const header=await pool.query('SELECT i.*,r.revision,t.code AS template_code,t.name AS template_name FROM inspection i JOIN template_revision r ON r.id=i.template_revision_id JOIN machine_template t ON t.id=r.template_id WHERE i.id=$1 AND i.company_id=ANY($2)',[req.params.id,req.user.companies]);
  if(!header.rowCount)return res.status(404).json({error:'NOT_FOUND'});
  const values=await pool.query('SELECT p.code,v.value_text,v.value_num,v.result,v.remark,v.recorded_at FROM inspection_value v JOIN template_parameter p ON p.id=v.parameter_id WHERE v.inspection_id=$1 ORDER BY p.sequence',[req.params.id]);
  const parameters=await pool.query('SELECT p.id,p.code,p.label,p.type,p.unit,p.min_value,p.max_value,p.expected,p.options,p.accept,p.mandatory,p.critical,p.evidence_required,p.spec_tbc,p.applies_to,s.code AS stage_code,s.name AS stage_name,sec.name AS section_name FROM template_parameter p JOIN template_stage s ON s.revision_id=p.revision_id JOIN template_section sec ON sec.stage_id=s.id AND sec.id=p.section_id WHERE p.revision_id=$1 ORDER BY s.sequence,sec.sequence,p.sequence',[header.rows[0].template_revision_id]);
  res.json({inspection:header.rows[0],values:values.rows,parameters:parameters.rows});
}catch(e){next(e)}});
app.put('/api/v1/inspections/:id/values',authenticate,requirePermission('insp.execute'),async(req,res,next)=>{
  const {code,value,remark}=req.body||{};if(!code||value===undefined)return res.status(400).json({error:'VALUE_REQUIRED'});
  const c=await pool.connect();try{await c.query('BEGIN');
    const i=await c.query("SELECT id,company_id,template_revision_id,status,machine_type FROM inspection WHERE id=$1 AND company_id=ANY($2) FOR UPDATE",[req.params.id,req.user.companies]);
    if(!i.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}
    if(!['in_progress','returned','draft'].includes(i.rows[0].status)){await c.query('ROLLBACK');return res.status(409).json({error:'INSPECTION_LOCKED'})}
    const ps=await c.query('SELECT id,code,type,mandatory,critical,evidence_required AS evidence,expected,min_value AS min,max_value AS max,accept,applies_to AS applies FROM template_parameter WHERE revision_id=$1',[i.rows[0].template_revision_id]);
    const p=ps.rows.find(x=>x.code===code);if(!p){await c.query('ROLLBACK');return res.status(404).json({error:'PARAMETER_NOT_FOUND'})}
    const prior=await c.query('SELECT parameter_id,value_text,value_num,remark FROM inspection_value WHERE inspection_id=$1',[req.params.id]);
    const entries=Object.fromEntries(prior.rows.map(x=>{const param=ps.rows.find(y=>y.id===x.parameter_id);return [param.code,{v:x.value_num===null?x.value_text:Number(x.value_num)}]}));
    entries[code]={v:value};const result=evalParam(p,entries[code]);
    const numeric=parseDecimal(value);const before=prior.rows.find(x=>x.parameter_id===p.id);
    await c.query(`INSERT INTO inspection_value(inspection_id,parameter_id,value_text,value_num,result,remark,recorded_by,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT(inspection_id,parameter_id) WHERE parameter_id IS NOT NULL DO UPDATE SET value_text=EXCLUDED.value_text,value_num=EXCLUDED.value_num,result=EXCLUDED.result,remark=EXCLUDED.remark,recorded_by=EXCLUDED.recorded_by,recorded_at=now()`,[req.params.id,p.id,String(value),numeric??null,result,remark||null,req.user.id]);
    const template={stages:[{code:'all',sections:[{params:ps.rows}]}]};const summary=summarize(template,entries,i.rows[0].machine_type);
    await c.query('UPDATE inspection SET result=$1,counts=$2,updated_at=now(),version=version+1 WHERE id=$3',[summary.result,summary,req.params.id]);
    await audit(c,req.user.id,'inspection.value_recorded','inspection',req.params.id,req,before||null,{code,value:String(value),result,remark:remark||null});
    await c.query('COMMIT');res.json({parameterResult:result,inspectionResult:summary.result,summary});
  }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}
});
app.post('/api/v1/inspections/:id/submit',authenticate,requirePermission('insp.execute'),async(req,res,next)=>{const c=await pool.connect();try{await c.query('BEGIN');
  const q=await c.query("SELECT id,status,result,company_id FROM inspection WHERE id=$1 AND company_id=ANY($2) FOR UPDATE",[req.params.id,req.user.companies]);
  if(!q.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}
  if(!['in_progress','returned','draft'].includes(q.rows[0].status)){await c.query('ROLLBACK');return res.status(409).json({error:'INVALID_TRANSITION'})}
  if(q.rows[0].result==='INCOMPLETE'){await c.query('ROLLBACK');return res.status(422).json({error:'INSPECTION_INCOMPLETE'})}
  await c.query("UPDATE inspection SET status='submitted',submitted_at=now(),updated_at=now(),version=version+1 WHERE id=$1",[req.params.id]);
  await audit(c,req.user.id,'inspection.submitted','inspection',req.params.id,req,{status:q.rows[0].status,result:q.rows[0].result},{status:'submitted',result:q.rows[0].result});await c.query('COMMIT');res.json({status:'submitted',result:q.rows[0].result});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});
app.post('/api/v1/inspections/:id/review',authenticate,requirePermission('insp.review'),async(req,res,next)=>{const action=req.body?.action;const reason=String(req.body?.reason||'').trim();if(!['begin','return','review'].includes(action))return res.status(400).json({error:'INVALID_REVIEW_ACTION'});if(action==='return'&&!reason)return res.status(400).json({error:'RETURN_REASON_REQUIRED'});const c=await pool.connect();try{await c.query('BEGIN');const q=await c.query("SELECT id,status,result,company_id FROM inspection WHERE id=$1 AND company_id=ANY($2) FOR UPDATE",[req.params.id,req.user.companies]);if(!q.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}const old=q.rows[0].status;const target=action==='begin'&&old==='submitted'?'under_review':action==='return'&&old==='under_review'?'returned':action==='review'&&old==='under_review'?'reviewed':null;if(!target){await c.query('ROLLBACK');return res.status(409).json({error:'INVALID_TRANSITION',status:old})}await c.query('UPDATE inspection SET status=$1,updated_at=now(),version=version+1 WHERE id=$2',[target,req.params.id]);await audit(c,req.user.id,`inspection.${action}`,'inspection',req.params.id,req,{status:old,result:q.rows[0].result},{status:target,result:q.rows[0].result,reason:reason||null});await c.query('COMMIT');res.json({status:target,result:q.rows[0].result})}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});
app.post('/api/v1/inspections/:id/decision',authenticate,requirePermission('insp.approve'),async(req,res,next)=>{const {decision,reason}=req.body||{};if(!['approve','reject'].includes(decision)||decision==='reject'&&!String(reason||'').trim())return res.status(400).json({error:'INVALID_DECISION'});const c=await pool.connect();try{await c.query('BEGIN');const q=await c.query("SELECT id,status,result,company_id FROM inspection WHERE id=$1 AND company_id=ANY($2) FOR UPDATE",[req.params.id,req.user.companies]);if(!q.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'NOT_FOUND'})}if(q.rows[0].status!=='reviewed'){await c.query('ROLLBACK');return res.status(409).json({error:'INVALID_TRANSITION',status:q.rows[0].status})}const target=decision==='approve'?'approved':'rejected';await c.query('UPDATE inspection SET status=$1,updated_at=now(),version=version+1,approved_at=CASE WHEN $1=\'approved\' THEN now() ELSE approved_at END WHERE id=$2',[target,req.params.id]);await audit(c,req.user.id,`inspection.${decision==='approve'?'approved':'rejected'}`,'inspection',req.params.id,req,{status:'reviewed',result:q.rows[0].result},{status:target,result:q.rows[0].result,reason:reason||null});await c.query('COMMIT');res.json({status:target,result:q.rows[0].result})}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});
// Client results are intentionally ignored. Evaluation definitions come from the published DB revision.
app.post('/api/v1/inspections/evaluate',authenticate,requirePermission('insp.execute'),async(req,res,next)=>{try{
  const {templateRevisionId,values,variant}=req.body||{};
  if(!templateRevisionId||!values||typeof values!=='object')return res.status(400).json({error:'INVALID_INPUT'});
  const rows=await pool.query(`SELECT r.id,r.status,s.code AS stage_code,s.sequence AS stage_sequence,
    sec.id AS section_id,sec.name AS section_name,sec.sequence AS section_sequence,
    p.code,p.type,p.mandatory,p.critical,p.evidence_required,p.expected,p.min_value,p.max_value,p.accept,p.applies_to
    FROM template_revision r JOIN template_stage s ON s.revision_id=r.id
    JOIN template_section sec ON sec.stage_id=s.id
    JOIN template_parameter p ON p.section_id=sec.id AND p.revision_id=r.id
    WHERE r.id=$1 ORDER BY s.sequence,sec.sequence,p.sequence`,[templateRevisionId]);
  if(!rows.rowCount||rows.rows[0].status!=='published')return res.status(404).json({error:'PUBLISHED_REVISION_NOT_FOUND'});
  const stages=[];
  for(const row of rows.rows){let stage=stages.find(x=>x.code===row.stage_code);if(!stage){stage={code:row.stage_code,sections:[]};stages.push(stage)}
    let section=stage.sections.find(x=>x.name===row.section_name);if(!section){section={params:[]};stage.sections.push(section)}
    section.params.push({id:row.code,type:row.type,mandatory:row.mandatory,critical:row.critical,evidence:row.evidence_required,expected:row.expected,min:row.min_value,max:row.max_value,accept:row.accept,applies:row.applies_to});}
  const authoritative=evaluateInspection({stages},{values,variant,clientResult:req.body?.result,template:req.body?.template});
  res.json({result:authoritative.result,summary:authoritative});
}catch(e){next(e)}});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'INTERNAL_ERROR'})});
const port=Number(process.env.PORT||3001);
const nest=await NestFactory.create(AppModule,new ExpressAdapter(app),{logger:['error','warn']});
await nest.listen(port,'0.0.0.0');
console.log(`TIGL QC API listening on ${port}`);
