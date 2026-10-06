import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const root=dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(await readFile(resolve(root,'../TIGL-QC-Dev-Packet/seed/axis_templates.json'),'utf8'));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try { for(const t of data.templates){
  const c=await pool.connect();
  try { await c.query('BEGIN');
    let mt=await c.query('SELECT id FROM machine_template WHERE company_id=$1 AND code=$2',['TIGL',t.code]);
    const templateId=mt.rows[0]?.id || (await c.query('INSERT INTO machine_template(company_id,code,name,family) VALUES($1,$2,$3,$4) RETURNING id',['TIGL',t.code,t.name,t.family])).rows[0].id;
    const existing=await c.query('SELECT id FROM template_revision WHERE template_id=$1 AND revision=$2',[templateId,t.revision]);
    if(existing.rowCount){await c.query('COMMIT');continue;}
    const rev=(await c.query("INSERT INTO template_revision(template_id,revision,status,effective_from,header_fields,machine_types,variant_label) VALUES($1,$2,'draft',$3,$4,$5,$6) RETURNING id",[templateId,t.revision,t.effective,JSON.stringify(t.header_fields),JSON.stringify(t.machine_types),t.variant_label||'Machine type'])).rows[0].id;
    for(let si=0;si<t.stages.length;si++){const s=t.stages[si];const sid=(await c.query('INSERT INTO template_stage(revision_id,code,name,sequence) VALUES($1,$2,$3,$4) RETURNING id',[rev,s.code,s.name,si])).rows[0].id;
      for(let ci=0;ci<s.sections.length;ci++){const section=s.sections[ci];const cid=(await c.query('INSERT INTO template_section(stage_id,name,sequence) VALUES($1,$2,$3) RETURNING id',[sid,section.name,ci])).rows[0].id;
        for(let pi=0;pi<section.params.length;pi++){const p=section.params[pi];await c.query(`INSERT INTO template_parameter(revision_id,section_id,code,label,type,unit,min_value,max_value,expected,options,accept,criteria,hint,mandatory,critical,evidence_required,spec_tbc,sequence,applies_to)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,[rev,cid,p.id,p.label,p.type,p.unit||null,p.min??null,p.max??null,p.expected===undefined?null:String(p.expected),p.options?JSON.stringify(p.options):null,p.accept?JSON.stringify(p.accept):null,p.criteria||null,p.hint||null,p.mandatory!==false,p.critical===true,p.evidence===true,p.spec_tbc===true,pi,p.applies||null]);}
      }
    }
    await c.query("UPDATE template_revision SET status='published',published_at=now() WHERE id=$1",[rev]);
    await c.query('COMMIT'); console.log(`seeded ${t.code} revision ${t.revision}`);
  } catch(e){await c.query('ROLLBACK');throw e} finally{c.release()}
}} finally{await pool.end()}
