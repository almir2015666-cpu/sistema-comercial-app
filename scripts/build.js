/**
 * Monta www/ — a pasta que o Capacitor empacota dentro do app.
 *
 *   app/          o aplicativo (html, css, js, config, marca) -> www/
 *   node_modules/ o supabase-js e o gerador de QR              -> www/vendor/
 *
 * Nao ha bundler nem transpile: o que esta em app/ e o que roda. Tudo o que o
 * app precisa para abrir viaja junto — nenhuma tag <script> ou <link> aponta
 * para fora, e o build avisa se alguma passar a apontar.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const app = path.join(raiz, 'app');
const www = path.join(raiz, 'www');
const vendor = path.join(www, 'vendor');

function copiarPasta(de, para) {
  fs.mkdirSync(para, { recursive: true });
  for (const item of fs.readdirSync(de, { withFileTypes: true })) {
    const origem = path.join(de, item.name);
    const alvo = path.join(para, item.name);
    if (item.isDirectory()) copiarPasta(origem, alvo);
    else fs.copyFileSync(origem, alvo);
  }
}

// Primeiro candidato que existir; erra alto se nenhum existir, para o build
// nao produzir silenciosamente um app que so funciona online.
function doNodeModules(candidatos, destino, oQueE) {
  for (const rel of candidatos) {
    const p = path.join(raiz, 'node_modules', rel);
    if (fs.existsSync(p)) { fs.copyFileSync(p, destino); return; }
  }
  console.error(`Nao achei ${oQueE} no node_modules (tentei: ${candidatos.join(', ')}). Rode npm install.`);
  process.exit(1);
}

// Esvazia www/ em vez de apaga-la: apagar a pasta falha com EPERM quando o
// servidor da previa esta servindo dali.
fs.mkdirSync(www, { recursive: true });
for (const item of fs.readdirSync(www)) fs.rmSync(path.join(www, item), { recursive: true, force: true });

copiarPasta(app, www);
fs.mkdirSync(vendor, { recursive: true });

doNodeModules(
  ['@supabase/supabase-js/dist/umd/supabase.js', '@supabase/supabase-js/dist/umd/supabase.min.js'],
  path.join(vendor, 'supabase.js'),
  'o supabase-js (build UMD)'
);
doNodeModules(['qrcode-generator/qrcode.js'], path.join(vendor, 'qrcode.js'), 'o qrcode-generator');

/* Carimba a versao no pacote: o Perfil mostra o commit e a data, e uma frase
   basta para saber que codigo esta rodando no aparelho. */
const versao = (() => {
  try {
    const { execSync } = require('child_process');
    const sha = execSync('git rev-parse --short HEAD', { cwd: raiz }).toString().trim();
    const data = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `${sha} · ${data}`;
  } catch { return 'sem git'; }
})();
fs.appendFileSync(path.join(www, 'config.js'), `\n// Carimbo do build — veja scripts/build.js\nwindow.CFG.versao = ${JSON.stringify(versao)};\n`);

// Guarda: recurso externo numa pagina e app que so abre com internet.
let externos = 0;
for (const arquivo of fs.readdirSync(www)) {
  if (!arquivo.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(www, arquivo), 'utf8');
  const achados = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)/gi),
    ...html.matchAll(/<link\b[^>]*\bhref=["'](https?:\/\/[^"']+)/gi),
  ].map((m) => m[1]);
  if (achados.length) { externos += achados.length; console.warn(`AVISO ${arquivo}: carrega de fora ->\n  ` + achados.join('\n  ')); }
}

console.log(externos
  ? `www/ montado, mas com ${externos} recurso(s) externo(s).`
  : `www/ montado (${versao}). Nada carregado de fora — o app abre sem sinal.`);
