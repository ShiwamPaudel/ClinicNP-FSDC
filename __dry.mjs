import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
const P="C:/Users/paude/AppData/Local/Temp/claude/d--IBN-Installations-clinicnp-fsdc/80e7059c-c978-49f6-884f-7692a37369c8/scratchpad/dry.db";
const c=createClient({url:"file:"+P});
const split=(s)=>s.split(/\r?\n/).filter(l=>!l.trim().startsWith("--")).join("\n").split(";").map(x=>x.trim()).filter(Boolean);
for(const f of readdirSync("db/migrations").filter(f=>/^000[1-5]/.test(f)).sort())
  for(const s of split(readFileSync("db/migrations/"+f,"utf8"))) await c.execute(s);
// realistic prior state: 2 users, 2 fiscal years BOTH active, FK children
await c.execute("INSERT INTO users (id,name,username,password_hash,role,created_at) VALUES ('u1','A','admin','h','admin','t')");
await c.execute("INSERT INTO users (id,name,username,password_hash,role,created_at) VALUES ('u2','B','bikash','h','staff','t')");
await c.execute("INSERT INTO fiscal_years (bs_label,start_ad,end_ad,active) VALUES ('2083/84','2026-07-17','2027-07-16',1)");
await c.execute("INSERT INTO fiscal_years (bs_label,start_ad,end_ad,active) VALUES ('2082/83','2025-07-17','2026-07-16',1)");
await c.execute("INSERT INTO bills (id,date_ad,date_bs,user_id,client_created_at) VALUES ('b1','2026-08-01','2083-04-16','u1','t')");
await c.execute("INSERT INTO audit_log (id,user_id,action,at) VALUES ('a1','u1','x','t')");
await c.execute("INSERT INTO _migrations (name,applied_at) SELECT 'x','y' WHERE 0");
c.close(); console.log("scratch prepared: 2 users, 2 fiscal years (both active), FK children present");
