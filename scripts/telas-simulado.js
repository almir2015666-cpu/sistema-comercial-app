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
  modulos: ['chat', 'tarefas', 'pedir_material', 'almoxarifado', 'almoxarifado:atender', 'controle_emails', 'pesquisa_site'],
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
    // a que pode receber sem pergunta nenhuma (os passos 26 e 27)
    { id: 3, empresa: 'Beta Ltda', emails: 'rh@beta.com.br', situacao: 'Não enviado', data: '2026-11-03' },
  ],
  // os clientes da casa (85): a Sodexo fatura (o grupo casa o nome)
  orc_clientes_faturamento: [
    { id: 1, codigo: '9AA', nome: 'SODEXO DO BRASIL COMER', grupo: 'SODEXO', faturou_2025: true, faturou_2026: true,
      meses_2025: 9, meses_2026: 9, periodo: 'Jan-set/2025 x jan-set/2026' },
  ],
  // os agendados (84): a Verzani já tem envio marcado para amanhã
  orc_emails_agendamentos: [
    { id: 5, agendado_para: new Date(Date.now() + 86400000).toISOString(), titulo: 'Proposta de Parceria', cobranca: false,
      situacao: 'agendado', criado_por_nome: 'Pessoa de Teste', criado_em: new Date().toISOString() },
  ],
  orc_emails_agendados: [
    { id: 50, agendamento_id: 5, registro_id: 2, empresa: 'GRUPO VERZANI & SANDRINI', assunto: 'Proposta', situacao: 'agendado',
      orc_emails_agendamentos: { agendado_para: new Date(Date.now() + 86400000).toISOString(), situacao: 'agendado', cobranca: false } },
  ],
  orc_emails_conversa: [
    { id: 1, registro_id: 1, direcao: 'enviado', quando: '2026-10-27T12:00:00+00:00', texto: 'Proposta de parceria…', enviado_por: 'Pessoa de Teste' },
    { id: 2, registro_id: 1, direcao: 'recebido', quando: '2026-10-27T15:00:00+00:00', de: 'joao@sodexo.com', texto: 'Temos interesse.',
      message_id: '<m2@sodexo.com>', anexos: [{ p: '2', n: 'Ficha de cadastro.xlsx', t: 'application/vnd.ms-excel', b: 30000 }] },
  ],
  orc_emails_rascunhos: [
    // com a {segmentos}: desde a 2.6 só ela segura o rascunho de quem a IA
    // ainda não identificou (o passo 24 confere o aviso)
    { id: 9, titulo: 'GRUPO VERZANI', assunto: 'Proposta de Parceria | {empresa_nome}', corpo: '{saudacao}\n\nTexto para **{empresa_nome}**, que atua em {segmentos}.',
      registros: [2], anexos: [], criado_por_nome: 'Pessoa de Teste', atualizado_em: new Date().toISOString() },
  ],
  // a pesquisa do site: uma resposta ruim (o site manda "1 – Muito ruim")
  orc_retornos_site: [
    { id: 1, formulario: 'pesquisa', situacao: 'Nova', empresa: 'Alfa Ltda', nome: 'Ana Lima', email: 'rh@alfa.com.br',
      recebido_em: new Date().toISOString(),
      respostas: [{ campo: 'experiencia', rotulo: 'Experiência geral', valor: 'Insatisfatória' },
        { campo: 'notaEspera', rotulo: 'Nota: agilidade no atendimento', valor: '1 – Muito ruim' },
        { campo: 'interesse', rotulo: 'Interesse em conversar', valor: 'Sim' }] },
    { id: 2, formulario: 'ouvidoria', situacao: 'Em andamento', nome: 'Maria', assunto: 'Reclamação', mensagem: 'Demorou muito.',
      recebido_em: new Date().toISOString(), respostas: [] },
  ],
  // a Caixa do Comercial: um pedido sem resposta há dois dias (atrasado) e
  // uma reclamação respondida em 40 min, com a resposta e a avaliação
  orc_caixa_mensagens: [
    { id: 1, sentido: 'recebido', quando: new Date(Date.now() - 2 * 86400000).toISOString(), de: 'rh@alfa.com.br', de_nome: 'Ana',
      assunto: 'Orçamento de admissionais', pasta: 'ALFA', categoria: 'Pedido de orçamento', empresa: 'ALFA', prioridade: 'Normal',
      tom: 'Neutro', precisa_resposta: true, classificado_em: new Date().toISOString(), interno: false, automatico: false,
      texto: 'Bom dia, preciso do valor para 30 admissionais.' },
    { id: 2, sentido: 'recebido', quando: '2026-11-03T13:00:00+00:00', de: 'dp@beta.com', de_nome: 'Bruno', assunto: 'Atraso no ASO',
      pasta: 'BETA', categoria: 'Reclamação', prioridade: 'Urgente', tom: 'Insatisfeito', precisa_resposta: true,
      classificado_em: new Date().toISOString(), interno: false, automatico: false, resposta_id: '<r2@cmh>',
      respondido_em: '2026-11-03T13:40:00+00:00', resposta_de: 'comercial@medicinahumana.com.br', resposta_para: 'dp@beta.com',
      avaliacao_nota: 'Boa', avaliacao: 'Pediu desculpas e deu o prazo.', texto: 'O ASO do João está atrasado.',
      anexos: [{ p: '2', n: 'ASO João.pdf', t: 'application/pdf', b: 160000 }] },
    // o que a equipe mandou (aparece na pesquisa) e depois apagou
    { id: 3, sentido: 'enviado', quando: '2026-11-03T13:40:00+00:00', de: 'comercial@medicinahumana.com.br', de_nome: 'Comercial',
      para: 'dp@beta.com', assunto: 'RE: Atraso no ASO', pasta: 'BETA', pasta_imap: 'INBOX.Trash',
      texto: 'Bruno, desculpe a demora: o ASO sai hoje.' },
  ],
  orc_caixa_estado: [{ inicio: '2026-10-01', lido_em: new Date().toISOString() }],
};

const RESPOSTAS_ENVIADAS = [];
const ANEXOS_PEDIDOS = [];
const PROSPECCOES = [];        // o que a orc-email mandou (acao prospeccao)
const GRAVACOES = [];          // POST/PATCH nas tabelas, para os passos conferirem

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
    if (url.pathname.startsWith('/functions/v1')) {
      // a orc-email nova (02/11/2026): o "sugerir" devolve o `modo` e o
      // texto, que diz o que recebeu — o passo confere que o pedido, o tom
      // e o texto da caixa chegaram
      let corpo = {};
      try { corpo = JSON.parse(req.postData() || '{}'); } catch { /* vazio */ }
      if (corpo.acao === 'sugerir') {
        const texto = corpo.base ? `AJUSTADO [${corpo.ajuste}] ${corpo.base}` : `NOVO [${(corpo.tons || []).join(',') || 'livre'}] [${corpo.ajuste || ''}]`;
        return json({ ok: true, modo: corpo.base ? 'ajustar' : corpo.ajuste ? 'pedido' : 'opcoes', sugestao_resposta: texto,
          opcoes: [{ tom: 'x', titulo: 'X', texto }] });
      }
      // a orc-email nova sabe anexar na resposta; o que a resposta levou
      // fica guardado para o passo conferir
      if (corpo.acao === 'tipos') return json({ ok: true, acoes: ['prospeccao', 'responder', 'responder_anexos', 'anexo', 'agendados'] });
      // o envio de agora: guardado para o passo conferir para quem foi
      if (corpo.acao === 'prospeccao') {
        PROSPECCOES.push(corpo);
        return json({ ok: true, para: ['x@y'] });
      }
      // a busca na internet (IA): uma construtora nova
      if (corpo.acao === 'buscar_empresas') {
        return json({ ok: true, empresas: [{ nome: 'ALFA CONSTRUTORA LTDA', emails: ['rh@alfacons.com.br'], cidade: 'Candeias', ramo: 'Construção' }] });
      }
      // o arquivo de um e-mail: o pedido fica guardado para o passo conferir
      if (corpo.acao === 'anexo') {
        ANEXOS_PEDIDOS.push(corpo);
        return json({ ok: true, url: 'about:blank', nome: 'arquivo', tipo: 'application/pdf' });
      }
      if (corpo.acao === 'responder') {
        RESPOSTAS_ENVIADAS.push(corpo);
        return json({ ok: true, para: 'joao@sodexo.com', anexos: (corpo.anexos || []).length });
      }
      // a resposta da pesquisa (05/11/2026): uma opção por tom, e o envio
      // guardado para o passo conferir
      if (corpo.acao === 'retorno_sugerir') {
        if (corpo.base) return json({ ok: true, modo: 'ajustar', opcoes: [{ tom: 'ajustada', titulo: 'Ajustada', texto: `AJUSTADO [${corpo.pedido}] ${corpo.base}` }] });
        return json({ ok: true, modo: 'opcoes', resumo: 'Reclamou da espera.',
          opcoes: (corpo.tons || []).map((t) => ({ tom: t, titulo: t.toUpperCase(), texto: `Texto ${t}` })) });
      }
      if (corpo.acao === 'retorno_responder') {
        RESPOSTAS_ENVIADAS.push(corpo);
        return json({ ok: true, para: 'rh@alfa.com.br', anexos: 0, retorno_em: '2026-11-05', situacao: corpo.concluir ? 'Concluída' : 'Em andamento', erro_gravar: '' });
      }
      // a leitura da Caixa do Comercial: nada novo, a caixa em dia
      if (corpo.acao === 'caixa') {
        return json({ ok: true, ocupado: false, lido_em: new Date().toISOString(), inicio: '2026-10-01', novas: 0,
          pareadas: 0, classificadas: 0, avaliadas: 0, pastas_a_iniciar: 0, pastas_com_novidade: 0,
          faltam_classificar: 0, faltam_avaliar: 0, erro: '', aviso: '' });
      }
      return json({});
    }
    if (url.pathname.startsWith('/storage/v1')) return json([]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    const tabela = url.pathname.replace('/rest/v1/', '');
    // a Caixa pede recebidos e enviados em separado, e o texto pelo id: o
    // "coluna=eq.valor" vale nela (no resto, a tabela inteira, como antes)
    if ((req.method() === 'GET' || req.method() === 'HEAD') && tabela === 'orc_caixa_mensagens') {
      const iguais = [...url.searchParams].filter(([, v]) => v.startsWith('eq.'));
      return json(TABELAS[tabela].filter((r) => iguais.every(([k, v]) => String(r[k]) === v.slice(3))));
    }
    if (req.method() === 'GET' || req.method() === 'HEAD') return json(TABELAS[tabela] || []);
    // gravações: devolve o que veio, como o "return=representation"
    let corpo = [];
    try { corpo = JSON.parse(req.postData() || '[]'); } catch { /* vazio */ }
    GRAVACOES.push({ tabela, metodo: req.method(), corpo, busca: url.search });
    // o lote do agendamento nasce com o número dele (os itens apontam para ele)
    if (req.method() === 'POST' && tabela === 'orc_emails_agendamentos') {
      return json((Array.isArray(corpo) ? corpo : [corpo]).map((c) => ({ ...c, id: 77 })), 201);
    }
    return json(Array.isArray(corpo) ? corpo : [corpo], req.method() === 'POST' ? 201 : 200);
  });
}

// ------------------------------------------------------------- os passos
const MODULOS = ['chat', 'tarefas', 'compromissos', 'chamados', 'emails', 'pesquisa', 'caixa', 'almoxarifado', 'conferencia', 'homologacao', 'financeiro', 'receber', 'diario', 'admin'];

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
  // 📎 o arquivo que a empresa mandou aparece na conversa
  if (!ficha.includes('Ficha de cadastro.xlsx')) throw new Error('o anexo da empresa não apareceu na conversa');
  await pg.locator('#ed-responder').click();
  await pg.waitForTimeout(900);
  const texto = await pg.locator('#er-texto').inputValue();
  if (!texto.includes('Prezado João')) throw new Error('a sugestão da IA não veio para a resposta');
  // ✨ PEDIR À IA: o pedido e o tom vão para a orc-email...
  await pg.locator('#er-pedido').fill('dizer que atendemos sábado');
  await pg.locator('#er-tons .chip', { hasText: 'Cordial' }).click();
  await pg.locator('#er-escrever').click();
  await pg.waitForTimeout(900);
  const escrito = await pg.locator('#er-texto').inputValue();
  if (escrito !== 'NOVO [cordial] [dizer que atendemos sábado]') throw new Error(`escrever de novo não levou o pedido e o tom: "${escrito}"`);
  // ...ajustar leva o texto da caixa...
  await pg.locator('#er-pedido').fill('mais curta');
  await pg.locator('#er-ajustar').click();
  await pg.waitForTimeout(900);
  const ajustado = await pg.locator('#er-texto').inputValue();
  if (!ajustado.startsWith('AJUSTADO [mais curta] NOVO [cordial]')) throw new Error(`ajustar não levou o texto da caixa: "${ajustado}"`);
  // ...e desfazer volta ao de antes
  await pg.locator('#er-desfazer').click();
  if (await pg.locator('#er-texto').inputValue() !== escrito) throw new Error('desfazer não voltou ao texto de antes');
  // 📎 O ANEXO DA RESPOSTA: entra na lista, vai junto e chega à orc-email
  const [escolha] = await Promise.all([pg.waitForEvent('filechooser'), pg.locator('#er-anexar').click()]);
  await escolha.setFiles({ name: 'proposta.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await pg.waitForTimeout(400);
  if (!(await pg.locator('#er-anexos').innerText()).includes('proposta.pdf')) throw new Error('o anexo não apareceu na lista da resposta');
  const antes = RESPOSTAS_ENVIADAS.length;
  await pg.locator('#er-form button[type=submit]').click();
  await pg.waitForTimeout(400);
  await pg.locator('#cf-sim').last().click();
  await pg.waitForTimeout(1500);
  const foi = RESPOSTAS_ENVIADAS[antes];
  if (!foi) throw new Error(`a resposta não foi enviada (aviso: "${await pg.locator('#toast').innerText()}")`);
  if (!(foi.anexos || []).some((a) => a.nome === 'proposta.pdf' && a.base64 && a.tipo === 'application/pdf')) {
    throw new Error(`o anexo não foi junto com a resposta: ${JSON.stringify(foi.anexos || null).slice(0, 120)}`);
  }
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
// ☑ VÁRIAS DE UMA VEZ: a lista mostra 💼 e 🕒; o envio pergunta pela já
// agendada e pela cliente da casa, e só a BETA recebe
PASSOS.push(['26-emails-enviar-varios', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#palco .tab', { hasText: 'Todos' }).click();
  await pg.waitForTimeout(800);
  const lista = await pg.locator('#palco').innerText();
  if (!lista.includes('💼')) throw new Error('a cliente da casa (Sodexo) não ganhou a maleta na lista');
  if (!/🕒 \d\d\/\d\d/.test(lista)) throw new Error('a já agendada (Verzani) não mostrou o 🕒 na lista');
  await pg.locator('#em-selecionar').click(); await pg.waitForTimeout(400);
  await pg.locator('#sel-todos').click(); await pg.waitForTimeout(400);
  await pg.locator('#sel-enviar').click(); await pg.waitForTimeout(1500);
  // um modelo sem {segmentos}, para não depender da IA
  await pg.locator('#ev-modelo').selectOption('Primeiro contato'); await pg.waitForTimeout(900);
  const antes = PROSPECCOES.length;
  await pg.locator('#ev-enviar').click(); await pg.waitForTimeout(700);
  if (!(await pg.locator('#folha-caixa').innerText()).includes('já tem envio agendado')) throw new Error('não perguntou pela já agendada');
  await pg.locator('#folha-caixa [data-op="0"]').click(); await pg.waitForTimeout(700);
  if (!(await pg.locator('#folha-caixa').innerText()).includes('cliente da casa')) throw new Error('não perguntou pela cliente da casa');
  await pg.locator('#folha-caixa [data-op="0"]').click(); await pg.waitForTimeout(700);
  await pg.locator('#cf-sim').last().click();
  await pg.waitForTimeout(2500);
  const foram = PROSPECCOES.slice(antes).map((c) => c.id);
  if (JSON.stringify(foram) !== '[3]') throw new Error(`foram para ${JSON.stringify(foram)}, e não só para a BETA (3)`);
  if (!/beta/i.test(PROSPECCOES[antes].assunto)) throw new Error(`o assunto não levou o nome: "${PROSPECCOES[antes].assunto}"`);
}]);
// 🕒 AGENDAR: o lote e as empresas vão para o banco, com o texto montado
PASSOS.push(['27-emails-agendar', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#palco .tab', { hasText: 'Não enviados' }).click();
  await pg.waitForTimeout(700);
  await pg.locator('#em-selecionar').click(); await pg.waitForTimeout(400);
  await pg.locator('#palco .linha', { hasText: 'BETA' }).click(); await pg.waitForTimeout(400);
  await pg.locator('#sel-enviar').click(); await pg.waitForTimeout(1500);
  await pg.locator('#ev-modelo').selectOption('Primeiro contato'); await pg.waitForTimeout(900);
  await pg.locator('#ev-agendar').click(); await pg.waitForTimeout(800);
  await pg.locator('#ag-ok').click(); await pg.waitForTimeout(1800);
  const lote = GRAVACOES.find((g) => g.tabela === 'orc_emails_agendamentos' && g.metodo === 'POST');
  const itens = GRAVACOES.find((g) => g.tabela === 'orc_emails_agendados' && g.metodo === 'POST');
  if (!lote) throw new Error(`o agendamento não foi gravado (aviso: "${await pg.locator('#toast').innerText()}")`);
  if (Date.parse(lote.corpo.agendado_para) < Date.now()) throw new Error('o horário agendado ficou no passado');
  const i = (Array.isArray(itens?.corpo) ? itens.corpo : [])[0];
  if (!i || i.registro_id !== 3 || i.agendamento_id !== 77 || !/beta/i.test(i.mensagem)) {
    throw new Error(`as empresas do agendamento não foram gravadas certo: ${JSON.stringify(itens?.corpo || null).slice(0, 160)}`);
  }
}]);
// os agendados: o lote abre com as empresas e o cancelar grava
PASSOS.push(['28-emails-agendados-cancelar', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#palco .tab', { hasText: 'Agendados' }).click();
  await pg.waitForTimeout(900);
  await pg.locator('#palco .linha').first().click();
  await pg.waitForTimeout(900);
  if (!(await pg.locator('#folha-caixa').innerText()).includes('GRUPO VERZANI')) throw new Error('as empresas do lote não apareceram');
  const antes = GRAVACOES.length;
  await pg.locator('#lt-cancelar').click(); await pg.waitForTimeout(500);
  await pg.locator('#cf-sim').last().click(); await pg.waitForTimeout(1200);
  const g = GRAVACOES.slice(antes).find((x) => x.tabela === 'orc_emails_agendamentos' && x.metodo === 'PATCH');
  if (!g || g.corpo.situacao !== 'cancelado') throw new Error('o cancelamento não foi gravado');
}]);
// 🔎 buscar empresas: a achada entra no controle como "Não enviado"
PASSOS.push(['29-emails-buscar-empresas', async (pg) => {
  await pg.evaluate(() => window.MODULOS.emails.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#em-buscar').click(); await pg.waitForTimeout(500);
  await pg.locator('#be-consulta').fill('construtoras em Candeias');
  await pg.locator('#be-buscar').click(); await pg.waitForTimeout(1200);
  if (!(await pg.locator('#folha-caixa').innerText()).includes('ALFA CONSTRUTORA')) throw new Error('a empresa achada não apareceu');
  const antes = GRAVACOES.length;
  await pg.locator('#be-adicionar').click(); await pg.waitForTimeout(500);
  await pg.locator('#cf-sim').last().click(); await pg.waitForTimeout(1200);
  const g = GRAVACOES.slice(antes).find((x) => x.tabela === 'orc_emails_prospeccao' && x.metodo === 'POST');
  const linha = Array.isArray(g?.corpo) ? g.corpo[0] : g?.corpo;
  if (!linha || linha.empresa !== 'ALFA CONSTRUTORA LTDA' || linha.situacao !== 'Não enviado') {
    throw new Error(`a empresa não entrou no controle: ${JSON.stringify(g?.corpo || null).slice(0, 160)}`);
  }
}]);
PASSOS.push(['23-pesquisa-detalhe', async (pg) => {
  await pg.evaluate(() => window.MODULOS.pesquisa.abrir());
  await pg.waitForTimeout(1200);
  const lista = await pg.locator('#palco').innerText();
  if (!lista.includes('nota baixa')) throw new Error('a nota "1 – Muito ruim" não virou alerta');
  await pg.locator('#palco .linha').first().click();
  await pg.waitForTimeout(700);
}]);
// ✉ RESPONDER A PESQUISA: as opções nos tons da crítica, o ajuste guarda a
// versão de antes, e o envio leva o texto escolhido e o "concluir"
PASSOS.push(['30-pesquisa-responder', async (pg) => {
  await pg.evaluate(() => window.MODULOS.pesquisa.abrir());
  await pg.waitForTimeout(1200);
  await pg.locator('#palco .linha', { hasText: 'Alfa Ltda' }).click();
  await pg.waitForTimeout(700);
  await pg.locator('#pr-responder').click();
  await pg.waitForTimeout(1200);
  const texto = await pg.locator('#rr-texto').inputValue();
  if (texto !== 'Texto desculpas') throw new Error(`a primeira opção não veio nos tons da crítica: "${texto}"`);
  const opcoes = await pg.locator('#rr-opcoes').innerText();
  if (!opcoes.includes('MELHORIAS') || !opcoes.includes('CONVERSA')) throw new Error(`faltaram as opções por tom: "${opcoes}"`);
  if (await pg.locator('#rr-concluir').isChecked()) throw new Error('crítica veio marcada para concluir');
  await pg.locator('#rr-pedido').fill('mais curta');
  await pg.locator('#rr-ajustar').click(); await pg.waitForTimeout(900);
  const ajustado = await pg.locator('#rr-texto').inputValue();
  if (ajustado !== 'AJUSTADO [mais curta] Texto desculpas') throw new Error(`o ajuste não usou o texto da caixa: "${ajustado}"`);
  if (!(await pg.locator('#rr-opcoes').innerText()).includes('DESCULPAS')) throw new Error('o ajuste apagou a versão de antes');
  // cancelar a confirmação reabre com tudo (a armadilha da folha única)
  await pg.locator('#rr-form button[type=submit]').click(); await pg.waitForTimeout(500);
  await pg.locator('#cf-nao').click(); await pg.waitForTimeout(600);
  if ((await pg.locator('#rr-texto').inputValue()) !== ajustado) throw new Error('cancelar o envio perdeu o texto');
  await pg.locator('#rr-concluir').check();
  const antes = RESPOSTAS_ENVIADAS.length;
  await pg.locator('#rr-form button[type=submit]').click(); await pg.waitForTimeout(500);
  if (!(await pg.locator('#folha-caixa').innerText()).includes('Concluída')) throw new Error('a confirmação não disse a situação de depois');
  await pg.locator('#cf-sim').last().click(); await pg.waitForTimeout(1200);
  const envio = RESPOSTAS_ENVIADAS[antes];
  if (!envio || envio.acao !== 'retorno_responder' || envio.id !== 1 || envio.mensagem !== ajustado || envio.concluir !== true) {
    throw new Error(`o envio não levou o que devia: ${JSON.stringify(envio || null).slice(0, 200)}`);
  }
  if (!/avaliação/.test(envio.assunto)) throw new Error(`o assunto padrão não veio: "${envio.assunto}"`);
}]);
// a Caixa do Comercial: o atrasado aparece, o detalhe traz a resposta e a
// avaliação, e a correção da categoria grava
PASSOS.push(['25-caixa-detalhe', async (pg) => {
  await pg.evaluate(() => window.MODULOS.caixa.abrir());
  await pg.waitForTimeout(1500);
  const lista = await pg.locator('#palco').innerText();
  if (!lista.includes('Orçamento de admissionais')) throw new Error('o e-mail sem resposta não apareceu na lista');
  if (!/Sem resposta/.test(lista)) throw new Error('o pedido sem resposta não aparece como "Sem resposta"');
  await pg.locator('#palco .linha', { hasText: 'Atraso no ASO' }).click();
  await pg.waitForTimeout(900);
  const ficha = await pg.locator('#folha-caixa').innerText();
  if (!ficha.includes('levou 40 min de expediente')) throw new Error(`o tempo de resposta não veio na ficha: "${ficha.slice(0, 300)}"`);
  if (!ficha.includes('Pediu desculpas')) throw new Error('a avaliação da IA não veio na ficha');
  // 📎 o arquivo que veio no e-mail: aparece e o toque pede à orc-email
  if (!ficha.includes('ASO João.pdf')) throw new Error('o anexo não apareceu na ficha da Caixa');
  const antesAnexo = ANEXOS_PEDIDOS.length;
  await pg.locator('#cx-anexos button').first().click();
  await pg.waitForTimeout(700);
  const pedido = ANEXOS_PEDIDOS[antesAnexo];
  if (!pedido || pedido.caixa !== 'comercial' || pedido.parte !== '2' || pedido.id !== 2) {
    throw new Error(`o toque no anexo não pediu o arquivo certo: ${JSON.stringify(pedido || null)}`);
  }
  await pg.locator('#cx-cat').selectOption('Financeiro');
  await pg.locator('#cx-corr button[type=submit]').click();
  await pg.waitForTimeout(700);
  // a aba das categorias também desenha
  await pg.locator('#palco .tab', { hasText: 'Categorias' }).click();
  await pg.waitForTimeout(500);
}]);
// A Caixa (11/11/2026): a PESQUISA traz também o que a equipe mandou, e o
// chip "Excluídos" o que foi para a lixeira — recebido ou enviado
PASSOS.push(['25b-caixa-enviados-excluidos', async (pg) => {
  await pg.evaluate(() => window.MODULOS.caixa.abrir());
  await pg.waitForTimeout(1500);
  if ((await pg.locator('#palco').innerText()).includes('RE: Atraso no ASO')) throw new Error('o enviado apareceu sem pesquisa');
  await pg.locator('#cx-busca').fill('beta');
  await pg.waitForTimeout(1000);
  const achados = await pg.locator('#palco').innerText();
  if (!achados.includes('RE: Atraso no ASO') || !achados.includes('Enviado')) throw new Error(`a pesquisa não trouxe o enviado: "${achados.slice(0, 400)}"`);
  if (!achados.includes('Atraso no ASO')) throw new Error('a pesquisa perdeu o recebido');
  await pg.locator('#palco .linha', { hasText: 'RE: Atraso no ASO' }).click();
  await pg.waitForTimeout(900);
  const ficha = await pg.locator('#folha-caixa').innerText();
  for (const t of ['Enviado pela equipe', 'Para: dp@beta.com', 'Excluído pela equipe', 'o ASO sai hoje']) {
    if (!ficha.includes(t)) throw new Error(`a ficha do enviado não trouxe "${t}": "${ficha.slice(0, 400)}"`);
  }
  if (ficha.includes('A IA ERROU')) throw new Error('o enviado ofereceu a correção da categoria');
  await pg.locator('#folha-caixa .modal-fechar').click();
  await pg.waitForTimeout(400);
  await pg.locator('#cx-busca').fill('');
  await pg.waitForTimeout(900);
  await pg.locator('#palco .chip[data-m="excluidos"]').click();
  await pg.waitForTimeout(700);
  const lixo = await pg.locator('#palco').innerText();
  if (!lixo.includes('RE: Atraso no ASO')) throw new Error('"Excluídos" não trouxe o enviado apagado');
  if (lixo.includes('Orçamento de admissionais')) throw new Error('"Excluídos" trouxe e-mail que não foi apagado');
}]);
PASSOS.push(['21-cadastro-de-usuario', async (pg) => {
  await pg.evaluate(() => window.MODULOS.admin.abrir());
  await pg.waitForTimeout(900);
  const usuarios = pg.locator('.linha', { hasText: 'Usuários' });
  if (await usuarios.count()) { await usuarios.first().click(); await pg.waitForTimeout(900); await pg.locator('#topo-dir button').first().click(); await pg.waitForTimeout(700); }
  // o cadastro tem de oferecer as permissões novas do computador
  const ficha = await pg.locator('#folha-caixa').innerText();
  for (const t of ['Almoxarifado', 'Homologação', 'Solicitar material', 'Reclamações', 'Controle de e-mails', 'Pesquisa e Ouvidoria', 'Caixa do Comercial', 'Almoxarifado: Entregar pedidos', 'Financeiro: Dar baixa', 'Contabilidade']) {
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
      // FOTOS=<pasta>: uma foto de cada passo, para conferir o desenho
      if (process.env.FOTOS) await pg.screenshot({ path: path.join(process.env.FOTOS, `${nome}.png`) });
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
