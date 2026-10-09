import { readFile } from "node:fs/promises";
import { Client } from "pg";

const apply = process.argv.includes("--apply");
const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map(v=>v.trim()).filter(v=>v && !v.startsWith("#") && v.includes("=")).map(line=>{
  const index=line.indexOf("="); return [line.slice(0,index).trim(),line.slice(index+1).trim().replace(/^['"]|['"]$/g,"")];
}));
const connectionString=String(env.DATABASE_URL||"").replace(/[?&]sslmode=[^&]+/i,"");
if(!connectionString) throw new Error("Missing DATABASE_URL in .env");
const sql=await readFile(new URL("../supabase/migrations/202608020056_pos_field_observation.sql",import.meta.url),"utf8");
const client=new Client({connectionString,ssl:{rejectUnauthorized:false}});
await client.connect();
try{
  await client.query("begin");
  await client.query(sql);
  const check=await client.query(`select to_regprocedure('public.capture_pos_sale_observation_agent(text,text,numeric,numeric,timestamptz,text,text)')::text function_name`);
  if(!check.rows[0]?.function_name) throw new Error("POS observation function verification failed");
  if(apply) await client.query("commit"); else await client.query("rollback");
  console.log(JSON.stringify({applied:apply,function:check.rows[0].function_name,mode:"NO_SALES_OR_INVENTORY_WRITES"},null,2));
}catch(error){await client.query("rollback").catch(()=>{});throw error}finally{await client.end()}
