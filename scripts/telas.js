/**
 * Abre o app num Chromium de verdade, no tamanho de um iPhone, e diz o que
 * quebrou: erro de JavaScript e arquivo do proprio app que nao carregou.
 *
 * Uso:
 *   npm run build
 *   npm run previa          (serve www/ em http://127.0.0.1:8791)
 *   npm run telas
 *
 * Com USUARIO e SENHA no ambiente, entra de verdade e fotografa as telas
 * de dentro (inicio, chat, tarefas, perfil). Sem eles, para no login.
 * As imagens ficam em capturas/.
 */
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const destino = path.join(__dirname, '..', 'capturas');
const USUARIO = process.env.USUARIO || '';
const SENHA = process.env.SENHA || '';

const PASSOS = [
  ['01-entrar', async () => {}],
  ['02-entrar-escuro', async (pg) => { await pg.evaluate(() => { localStorage.setItem('cmh_theme', 'dark'); }); await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForTimeout(600); }],
  ['03-senha-errada', async (pg) => {
    await pg.locator('#usuario').fill('ninguem-de-teste');
    await pg.locator('#senha').fill('senha-errada-123');
    await pg.getByRole('button', { name: 'Entrar' }).click();
    await pg.waitForTimeout(2500);
  }],
];
if (USUARIO && SENHA) {
  const entrar = async (pg) => {
    await pg.locator('#usuario').fill(USUARIO);
    await pg.locator('#senha').fill(SENHA);
    await pg.getByRole('button', { name: 'Entrar' }).click();
    await pg.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await pg.waitForTimeout(1500);
  };
  PASSOS.push(
    ['10-inicio', entrar],
    ['11-perfil', async (pg) => { await entrar(pg); await pg.locator('#topo-dir button').click(); await pg.waitForTimeout(1200); }],
    ['12-mais', async (pg) => { await entrar(pg); await pg.locator('.abas__item[data-aba="mais"]').click(); await pg.waitForTimeout(600); }],
  );
  for (const m of ['chat', 'tarefas', 'compromissos', 'chamados', 'conferencia', 'diario', 'admin']) {
    PASSOS.push([`20-${m}`, async (pg) => {
      await entrar(pg);
      const b = pg.locator(`.modulo[data-m="${m}"]`);
      if (await b.count() === 0) { await pg.evaluate((k) => { window.__pulado = k; }, m); return; }
      await b.click(); await pg.waitForTimeout(2500);
    }]);
  }
}

(async () => {
  fs.mkdirSync(destino, { recursive: true });
  const navegador = await chromium.launch();
  const relatorio = [];
  for (const [nome, agir] of PASSOS) {
    const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR' });
    await ctx.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = ':root{--cima:47px !important;--baixo:34px !important}';
        document.head.appendChild(s);
      });
    });
    const pg = await ctx.newPage();
    const erros = [], naoCarregou = [];
    pg.on('pageerror', (e) => erros.push(String(e.message).split('\n')[0]));
    pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().split('\n')[0]); });
    pg.on('response', (r) => { if (r.status() >= 400 && !/supabase\.co/.test(r.url())) naoCarregou.push(`${r.url()} -> HTTP ${r.status()}`); });
    try {
      await pg.goto(BASE + '/index.html', { waitUntil: 'networkidle', timeout: 20000 });
      await pg.waitForTimeout(800);
      await agir(pg);
      await pg.screenshot({ path: path.join(destino, `${nome}.png`), fullPage: false });
    } catch (e) { erros.push('PASSO: ' + String(e.message).split('\n')[0]); }
    let texto = '';
    try { texto = (await pg.locator('body').innerText()).replace(/\s+/g, ' ').trim(); } catch { /* morreu */ }
    const pulado = await pg.evaluate(() => window.__pulado || '').catch(() => '');
    relatorio.push({ nome, erros: [...new Set(erros)].filter((e) => !/supabase\.co|Failed to load resource: the server responded with a status of 4\d\d/.test(e)), naoCarregou: [...new Set(naoCarregou)], texto, pulado });
    await ctx.close();
  }
  await navegador.close();

  console.log('\n=================== RELATORIO ===================\n');
  for (const r of relatorio) {
    console.log(`### ${r.nome}${r.pulado ? ' (modulo nao liberado para este usuario)' : ''}`);
    console.log(`    texto visivel: ${r.texto.length} caracteres — "${r.texto.slice(0, 110)}"`);
    console.log(r.erros.length ? '    ERROS DE JS:' : '    erros de JS: nenhum');
    r.erros.slice(0, 6).forEach((e) => console.log(`      - ${e}`));
    if (r.naoCarregou.length) { console.log('    NAO CARREGOU:'); r.naoCarregou.slice(0, 5).forEach((u) => console.log(`      - ${u}`)); }
    console.log('');
  }
  const ruins = relatorio.filter((r) => r.erros.length || r.naoCarregou.length || r.texto.length < 20);
  console.log('=================================================');
  console.log(ruins.length ? `PROBLEMA em ${ruins.length} de ${relatorio.length}: ${ruins.map((r) => r.nome).join(', ')}` : `Os ${relatorio.length} passos rodaram sem erro de JS.`);
  process.exit(ruins.length ? 1 : 0);
})();
