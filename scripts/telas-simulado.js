/**
 * Abre TODOS os módulos do app num Chromium de iPhone, com o servidor
 * SIMULADO: nada vai para o Supabase de verdade.
 *
 * Por que existe: o `telas.js` só passa da tela de entrada com um usuário
 * e senha reais, e isso não se usa em teste. Aqui o login, o cadastro e as
 * tabelas respondem daqui mesmo (um administrador, alguns itens de
 * estoque, listas vazias no resto), e o que se procura é erro de
 * JavaScript ao desenhar cada tela — é o que quebra o app no celular sem
 * ninguém ver no computador.
 *
 * Uso:
 *   npm run build
 *   node scripts/telas-simulado.js      (serve www/ sozinho, na porta 8792)
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium, devices } = require('playwright');

const WWW = path.join(__dirname, '..', 'www');
const PORTA = 8792;
const UID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------- o servidor
function servir() {
  const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const alvo = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!alvo.startsWith(WWW) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(alvo)] || 'application/octet-stream' });
    fs.createReadStream(alvo).pipe(res);
  });
  return new Promise((ok) => srv.listen(PORTA, '127.0.0.1', () => ok(srv)));
}

// ------------------------------------------------ o Supabase de mentira
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// A sessão já vem com as duas etapas (aal2): a Administração só abre
// assim, e é ela que tem o cadastro de permissões para conferir.
function jwt() {
  const agora = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: agora }, { method: 'password', timestamp: agora }], exp: agora + 3600, iat: agora, session_id: 's1' })}.assinatura`;
}
const EU = {
  id: UID, usuario: 'teste', nome: 'Pessoa de Teste', cargo: 'Diretor médico', profissao: null, registro: null,
  setor: 'Almoxarifado', admin: true, ativo: true, trocar_senha: false, ultimo_acesso: new Date().toISOString(),
  modulos: ['chat', 'tarefas', 'pedir_material', 'almoxarifado', 'almoxarifado:atender'],
};
const TABELAS = {
  orc_usuarios: [EU],
  orc_alm_deposito: [{ id: 1, nome: 'Almoxarifado', tipo: 'almoxarifado', ativo: true }],
  orc_alm_item: [
    { id: 1, nome: 'Papel A4', codigo: '001', unidade: 'RESMA', categoria: 'Papelaria', minimo: 10 },
    { id: 2, nome: 'Café em pó', codigo: '002', unidade: 'PCT', categoria: 'Copa e cozinha', minimo: 5 },
  ],
  orc_alm_saldo: [{ item_id: 1, deposito_id: 1, quantidade: 12 }, { item_id: 2, deposito_id: 1, quantidade: 2 }],
  orc_alm_requisicao: [{ id: 7, setor: 'Recepção', deposito_id: 1, de: 'outra', de_nome: 'Maria Souza', situacao: 'aberta', criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }],
  orc_alm_requisicao_item: [{ id: 70, requisicao_id: 7, item_id: 1, pedida: 3 }],
  // o Controle de e-mails: uma empresa esperando a nossa resposta e uma
  // ainda não enviada
  orc_emails_prospeccao: [
    { id: 1, empresa: 'Sodexo do Brasil', contato: 'João', emails: 'joao@sodexo.com', situacao: 'Respondeu', data: '2026-10-27',
      enviado_em: '2026-10-27T12:00:00+00:00', respondido_em: '2026-10-27T15:00:00+00:00', resposta_de: 'joao@sodexo.com',
      resposta_resumo: 'Quer marcar uma reunião', sugestao_resposta: 'Prezado João,\n\nObrigado pelo retorno.' },
    { id: 2, empresa: 'Grupo Verzani & Sandrini', emails: 'rh@verzani.com.br', situacao: 'Não enviado', data: '2026-10-27' },
  ],
  orc_emails_conversa: [
    { id: 1, registro_id: 1, direcao: 'enviado', quando: '2026-10-27T12:00:00+00:00', texto: 'Proposta de parceria…', enviado_por: 'Pessoa de Teste' },
    { id: 2, registro_id: 1, direcao: 'recebido', quando: '2026-10-27T15:00:00+00:00', de: 'joao@sodexo.com', texto: 'Temos interesse.' },
  ],
  orc_emails_rascunhos: [
    { id: 9, titulo: 'GRUPO VERZANI', assunto: 'Proposta de Parceria | {empresa_nome}', corpo: '{saudacao}\n\nTexto para **{empresa_nome}**.',
      registros: [2], anexos: [], criado_por_nome: 'Pessoa de Teste', atualizado_em: new Date().toISOString() },
  ],
  // a pesquisa do site: uma resposta ruim (o site manda "1 – Muito ruim")
  orc_retornos_site: [
    { id: 1, formulario: 'pesquisa', situacao: 'Nova', empresa: 'Alfa Ltda', recebido_em: new Date().toISOString(),
      respostas: [{ campo: 'experiencia', rotulo: 'Experiência geral', valor: 'Insatisfatória' },
        { campo: 'notaEspera', rotulo: 'Nota: agilidade no atendimento', valor: '1 – Muito ruim' },
        { campo: 'interesse', rotulo: 'Interesse em conversar', valor: 'Sim' }] },
    { id: 2, formulario: 'ouvidoria', situacao: 'Em andamento', nome: 'Maria', assunto: 'Reclamação', mensagem: 'Demorou muito.',
      recebido_em: new Date().toISOString(), respostas: [] },
  ],
};

async function simular(ctx) {
  await ctx.route(/supabase\.co/, async (rota) => {
    const req = rota.request();
    const url = new URL(req.url());
    const json = (corpo, status = 200, extra = {}) => rota.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': '0-0/0', ...extra }, body: JSON.stringify(corpo) });
    if (req.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (url.pathname.startsWith('/auth/v1/token')) {
      return json({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'teste@x', factors: [] } });
    }
    if (url.pathname.startsWith('/auth/v1/user')) return json({ id: UID, aud: 'authenticated', role: 'authenticated', email: 'teste@x', factors: [] });
    if (url.pathname.startsWith('/auth/v1/factors')) return json({ totp: [], all: [] });
    if (url.pathname.startsWith('/auth/v1')) return json({});
    if (url.pathname.startsWith('/functions/v1')) return json({});
    if (url.pathname.startsWith('/storage/v1')) return json([]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    const tabela = url.pathname.replace('/rest/v1/', '');
    if (req.method() === 'GET' || req.method() === 'HEAD') return json(TABELAS[tabela] || []);
    // gravações: devolve o que veio, como o "return=representation"
    let corpo = [];
    try { corpo = JSON.parse(req.postData() || '[]'); } catch { /* vazio */ }
    return json(Array.isArray(corpo) ? corpo : [corpo], req.method() === 'POST' ? 201 : 200);
  });
}

// ------------------------------------------------------------- os passos
const MODULOS = ['chat', 'tarefas', 'compromissos', 'chamados', 'emails', 'pesquisa', 'almoxarifado', 'conferencia', 'homologacao', 'financeiro', 'receber', 'diario', 'admin'];

async function entrar(pg) {
  await pg.locator('#usuario').fill('teste');
  await pg.locator('#senha').fill('senha-de-teste');
  await pg.getByRole('button', { name: 'Entrar' }).click();
  await pg.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await pg.waitForTimeout(800);
}

const PASSOS = [['00-inicio', async () => {}]];
for (const m of MODULOS) {
  PASSOS.push([`10-${m}`, async (pg) => {
    const existe = await pg.evaluate((k) => !!(window.MODULOS && window.MODULOS[k]), m);
    if (!existe) throw new Error(`o módulo ${m} não se registrou (faltou o <script> ou deu erro ao carregar)`);
    await pg.evaluate((k) => window.MODULOS[k].abrir(), m);
    await pg.waitForTimeout(1500);
    // as abas de dentro do módulo também desenham
    const abas = await pg.locator('#palco .tab').count();
    for (let i = 0; i < abas; i += 1) { await pg.locator('#palco .tab').nth(i).click(); await pg.waitForTimeout(700); }
  }]);
}
PASSOS.push(['20-novo-pedido', async (pg) => {
  await pg.evaluate(() => window.MODULOS.almoxarifado.abrir());
  await pg.waitForTimeout(900);
  await pg.locator('#topo-dir button').first().click();
  await pg.waitForTimeout(900);
  await pg.locator('.np-mais').first().click();
  await pg.waitForTimeout(300);
}]);
// a conversa e a resposta sugerida abrem sem erro
PASSOS.push(['22-emails-responder', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#palco .linha').first().click();
  await pg.waitForTimeout(900);
  const ficha = await pg.locator('#folha-caixa').innerText();
  if (!ficha.includes('Temos interesse')) throw new Error('a conversa não apareceu na ficha');
  await pg.locator('#ed-responder').click();
  await pg.waitForTimeout(900);
  const texto = await pg.locator('#er-texto').inputValue();
  if (!texto.includes('Prezado João')) throw new Error('a sugestão da IA não veio para a resposta');
}]);
PASSOS.push(['24-emails-rascunho', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1000);
  await pg.locator('#palco .tab', { hasText: 'Rascunhos' }).click();
  await pg.waitForTimeout(900);
  await pg.locator('#palco .linha').first().click();
  await pg.waitForTimeout(700);
  const ficha = await pg.locator('#folha-caixa').innerText();
  // a Verzani do exemplo ainda não foi identificada pela IA: fica de fora
  if (!ficha.includes('Ficam de fora')) throw new Error('o rascunho não avisou da empresa sem os segmentos');
}]);
PASSOS.push(['23-pesquisa-detalhe', async (pg) => {
  await pg.evaluate(() => window.MODULOS.pesquisa.abrir());
  await pg.waitForTimeout(1200);
  const lista = await pg.locator('#palco').innerText();
  if (!lista.includes('nota baixa')) throw new Error('a nota "1 – Muito ruim" não virou alerta');
  await pg.locator('#palco .linha').first().click();
  await pg.waitForTimeout(700);
}]);
PASSOS.push(['21-cadastro-de-usuario', async (pg) => {
  await pg.evaluate(() => window.MODULOS.admin.abrir());
  await pg.waitForTimeout(900);
  const usuarios = pg.locator('.linha', { hasText: 'Usuários' });
  if (await usuarios.count()) { await usuarios.first().click(); await pg.waitForTimeout(900); await pg.locator('#topo-dir button').first().click(); await pg.waitForTimeout(700); }
  // o cadastro tem de oferecer as permissões novas do computador
  const ficha = await pg.locator('#folha-caixa').innerText();
  for (const t of ['Almoxarifado', 'Homologação', 'Solicitar material', 'Reclamações', 'Almoxarifado: Entregar pedidos', 'Financeiro: Dar baixa', 'Contabilidade']) {
    if (!ficha.includes(t)) throw new Error(`o cadastro não oferece "${t}"`);
  }
}]);

(async () => {
  const srv = await servir();
  const navegador = await chromium.launch();
  const relatorio = [];
  for (const [nome, agir] of PASSOS) {
    const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR' });
    await simular(ctx);
    const pg = await ctx.newPage();
    const erros = [];
    pg.on('pageerror', (e) => erros.push(String(e.message).split('\n')[0]));
    pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().split('\n')[0]); });
    try {
      await pg.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await pg.waitForTimeout(800);
      await entrar(pg);
      await agir(pg);
    } catch (e) { erros.push('PASSO: ' + String(e.message).split('\n')[0]); }
    let texto = '';
    try { texto = (await pg.locator('#palco').innerText()).replace(/\s+/g, ' ').trim(); } catch { /* morreu */ }
    const palco = await pg.locator('#palco .aviso.erro').allInnerTexts().catch(() => []);
    // o realtime (websocket) não é simulado: o erro dele não é do app
    relatorio.push({ nome, erros: [...new Set(erros)].filter((e) => !/websocket|realtime|WebSocket/i.test(e)).concat(palco.map((t) => 'TELA: ' + t)), texto });
    await ctx.close();
  }
  await navegador.close();
  srv.close();

  console.log('\n============ TELAS COM O SERVIDOR SIMULADO ============\n');
  for (const r of relatorio) {
    console.log(`### ${r.nome}   (${r.texto.length} caracteres: "${r.texto.slice(0, 90)}")`);
    r.erros.slice(0, 6).forEach((e) => console.log(`      ERRO ${e}`));
  }
  const ruins = relatorio.filter((r) => r.erros.length);
  console.log('\n=======================================================');
  console.log(ruins.length ? `PROBLEMA em ${ruins.length} de ${relatorio.length}: ${ruins.map((r) => r.nome).join(', ')}` : `Os ${relatorio.length} passos rodaram sem erro de JS.`);
  process.exit(ruins.length ? 1 : 0);
})();
