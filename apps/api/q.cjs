const mysql=require('mysql2/promise');
(async()=>{
const c=await mysql.createConnection({host:'127.0.0.1',user:'portfolio',password:'portfolio',database:'portfolio'});
const [rows]=await c.query("SELECT l.*, u.email FROM quota_ledger l JOIN users u ON u.id=l.userId ORDER BY l.createdAt DESC LIMIT 25");
for(const r of rows) console.log(r.email, r.feature, 'delta', r.delta, r.source||'', r.createdAt);
const [u]=await c.query("SELECT id,email FROM users WHERE email='demo@folioforge.local'");
console.log('demo id', u[0]?.id);
})();
