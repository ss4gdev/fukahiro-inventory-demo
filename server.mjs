import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const files = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']],
  ['/domain.mjs', ['domain.mjs','text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css','text/css; charset=utf-8']],
]);
const port = Number(process.env.PORT || 4173);
const server = createServer(async (req,res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({app:'fkhr-inventory-demo',ok:true})); return; }
  const file = files.get(path);
  if (!file || !['GET','HEAD'].includes(req.method)) {res.writeHead(404);res.end('Not found');return;}
  try {
    const body = await readFile(fileURLToPath(new URL('./dist/' + file[0], import.meta.url)));
    res.writeHead(200, { 'Content-Type':file[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? '' : body);
  } catch {res.writeHead(500);res.end('Unable to load demo');}
});
server.listen(port,'127.0.0.1',()=>console.log(`FKHR demo ready: http://127.0.0.1:${port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
