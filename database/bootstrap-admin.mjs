import pg from 'pg';
import argon2 from 'argon2';
const {Pool}=pg;const pool=new Pool({connectionString:process.env.DATABASE_URL});
const username=String(process.env.BOOTSTRAP_USERNAME||'').trim().toLowerCase();
const password=String(process.env.BOOTSTRAP_PASSWORD||'');
const siteName=String(process.env.BOOTSTRAP_SITE_NAME||'').trim();
if(!username||password.length<12||!siteName)throw new Error('Set BOOTSTRAP_USERNAME, a 12+ character BOOTSTRAP_PASSWORD, and BOOTSTRAP_SITE_NAME.');
const c=await pool.connect();try{await c.query('BEGIN');
 const site=(await c.query("INSERT INTO site(company_id,name,kind) VALUES('TIGL',$1,'factory') ON CONFLICT(company_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id",[siteName])).rows[0];
 const found=await c.query('SELECT id FROM app_user WHERE username=$1',[username]);let userId=found.rows[0]?.id;
 if(!userId){const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});userId=(await c.query("INSERT INTO app_user(username,full_name,default_site_id,password_hash,must_change_password) VALUES($1,'System Administrator',$2,$3,true) RETURNING id",[username,site.id,hash])).rows[0].id;
  await c.query("INSERT INTO user_company_role(user_id,company_id,role_key) VALUES($1,'TIGL','sysadmin') ON CONFLICT DO NOTHING",[userId]);
  console.log(`created initial system administrator ${username}`);
 }else console.log(`administrator ${username} already exists; no changes made`);
 await c.query('COMMIT');
}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release();await pool.end()}
