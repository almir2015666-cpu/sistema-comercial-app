// node --test tests/
// As regras de app/logica.js, conferidas contra o comportamento do
// programa do computador (app.py e *_nucleo.py do SistemaCMH).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../app/logica.js');

test('login vira e-mail como o app.py: sem acento, sem espaco, sem pontuacao', () => {
  assert.equal(L.loginDe('José Carlos'), 'josecarlos');
  assert.equal(L.loginDe('  J.Maia  '), 'jmaia');
  assert.equal(L.loginDe('ana-paula_2'), 'anapaula2');
  assert.equal(L.emailDe('Layla', 'orcamentos.clinicamedicinahumana.com.br'), 'layla@orcamentos.clinicamedicinahumana.com.br');
});

test('setores: lista por virgula, item a item, sem LIKE', () => {
  const u = { setor: 'Comercial, SESMT' };
  assert.deepEqual(L.setoresDe(u), ['Comercial', 'SESMT']);
  assert.equal(L.eDoSetor(u, 'sesmt'), true);
  assert.equal(L.eDoSetor({ setor: 'Comercial Externo' }, 'Comercial'), false);
  assert.equal(L.eDoTi({ setor: 'T.I.' }), true);
  assert.equal(L.eDoTi({ setor: 'Tecnologia da Informação' }), true);
  assert.equal(L.eDoTi({ setor: 'Comercial' }), false);
  assert.equal(L.veAFila({ admin: true }), true);
});

test('lados da conferencia: admin tem todos, sem setor nenhum', () => {
  assert.deepEqual(L.ladosDe({ admin: true }), { comercial: true, sesmt: true, faturamento: true, seguranca: true });
  assert.deepEqual(L.ladosDe({ setor: 'Segurança' }), { comercial: false, sesmt: false, faturamento: false, seguranca: true });
  assert.deepEqual(L.ladosDe({}), { comercial: false, sesmt: false, faturamento: false, seguranca: false });
});

test('temModulo: nada vem de graca, admin abre tudo', () => {
  assert.equal(L.temModulo({ modulos: [] }, 'chat'), false);
  assert.equal(L.temModulo({ modulos: ['chat'] }, 'chat'), true);
  assert.equal(L.temModulo({ admin: true, modulos: [] }, 'diario'), true);
});

test('chat: chave da conversa, nao lidas e quem espera resposta', () => {
  const eu = 'u1';
  const marcas = { 'p:u2': 10, 's:Comercial': 0 };
  const linhas = [
    { id: 11, de: 'u2', para: 'u1', setor: null },   // nova de u2 para mim
    { id: 12, de: 'u1', para: 'u2', setor: null },   // minha resposta
    { id: 13, de: 'u3', para: null, setor: 'Comercial' },
    { id: 9, de: 'u2', para: 'u1', setor: null },    // ja lida (<= 10)
  ];
  assert.deepEqual(L.contarNaoLidas(linhas, eu, marcas), { 'p:u2': 1, 's:Comercial': 1 });
  // u2: a ultima e minha (12) -> nao espera; Comercial: ultima e de u3 -> espera
  assert.deepEqual(L.salasAResponder(linhas, eu, marcas), ['s:Comercial']);
});

test('chat: nome seguro e caminho do anexo comecam pelo uid', () => {
  assert.equal(L.nomeSeguro('Relatório Final (v2).PDF'), 'Relatorio-Final-v2-.PDF');
  assert.equal(L.nomeSeguro('///'), 'arquivo');
  assert.equal(L.caminhoAnexo('u1', 'foto.jpg', 'abc123def456'), 'u1/abc123def456-foto.jpg');
  assert.equal(L.eImagem('x.webp'), false);
  assert.equal(L.eImagem('x.JPG'), true);
});

test('chat: salas de setor — quem nao e admin so ve as suas', () => {
  const pessoas = [{ setor: 'Comercial, Vendas' }, { setor: 'SESMT' }];
  const eu = { setor: 'comercial', admin: false };
  assert.deepEqual(L.salasDeSetor(pessoas, eu), ['Comercial']);
  const admin = { setor: '', admin: true };
  assert.ok(L.salasDeSetor(pessoas, admin).includes('Vendas'));
  assert.ok(L.salasDeSetor(pessoas, admin).includes('T.I.'));
});

test('tarefas: estado do prazo e de quem e', () => {
  const hoje = '2026-09-19';
  assert.equal(L.estadoDoPrazo({ situacao: 'aberta', prazo: '2026-09-18' }, hoje), 'atrasada');
  assert.equal(L.estadoDoPrazo({ situacao: 'aberta', prazo: '2026-09-19' }, hoje), 'hoje');
  assert.equal(L.estadoDoPrazo({ situacao: 'aberta', prazo: '2026-09-21', lembrar_dias: 3 }, hoje), 'perto');
  assert.equal(L.estadoDoPrazo({ situacao: 'aberta', prazo: '2026-10-21', lembrar_dias: 3 }, hoje), 'longe');
  assert.equal(L.estadoDoPrazo({ situacao: 'aberta', prazo: null }, hoje), 'sem_prazo');
  assert.equal(L.estadoDoPrazo({ situacao: 'concluida', prazo: '2026-01-01' }, hoje), 'feita');
  const eu = { id: 'u1', setor: 'Comercial' };
  assert.equal(L.eMinha({ de: 'u1', para: 'u2' }, eu), false, 'criei para outra pessoa: nao e minha');
  assert.equal(L.eMinha({ de: 'u2', para: null, setor: 'comercial' }, eu), true);
  assert.equal(L.eMinha({ de: 'u1', para: null, setor: null }, eu), true);
});

test('tarefas: ordenacao e checklist normalizado', () => {
  const hoje = '2026-09-19';
  const lista = [
    { id: 1, situacao: 'aberta', prazo: null },
    { id: 2, situacao: 'aberta', prazo: '2026-09-25' },
    { id: 3, situacao: 'concluida', atualizado_em: '2026-09-10' },
    { id: 4, situacao: 'aberta', prazo: '2026-09-10' },
    { id: 5, situacao: 'cancelada', atualizado_em: '2026-09-15' },
  ];
  assert.deepEqual(L.ordenarTarefas(lista, hoje).map((t) => t.id), [4, 2, 1, 5, 3]);
  assert.deepEqual(L.normalizarItens(['  a  b ', { texto: '', feito: true }, { texto: 'c', feito: 1 }]),
    [{ texto: 'a b', feito: false }, { texto: 'c', feito: true }]);
});

test('compromissos: estado e "e meu"', () => {
  const agora = new Date(2026, 8, 19, 10, 0, 0);
  const c = (h, min = 60) => ({ quando: new Date(2026, 8, 19, h, 0, 0).toISOString(), minutos: min });
  assert.equal(L.estadoDoCompromisso(c(8), agora), 'passou');
  assert.equal(L.estadoDoCompromisso(c(9, 90), agora), 'agora');
  assert.equal(L.estadoDoCompromisso(c(15), agora), 'hoje');
  assert.equal(L.estadoDoCompromisso({ quando: new Date(2026, 8, 22, 9).toISOString(), minutos: 60 }, agora), 'perto');
  assert.equal(L.estadoDoCompromisso({ quando: new Date(2026, 10, 22, 9).toISOString(), minutos: 60 }, agora), 'longe');
  const eu = { id: 'u1', setor: 'SESMT' };
  assert.equal(L.eMeu({ de: 'u9', participantes: ['u1'] }, eu), true);
  assert.equal(L.eMeu({ de: 'u9', participantes: [], setor: 'sesmt' }, eu), true);
  assert.equal(L.eMeu({ de: 'u9', participantes: [], setor: 'Comercial' }, eu), false);
});

test('paraServidor leva o fuso junto', () => {
  const s = L.paraServidor(new Date(2026, 8, 19, 14, 30, 0));
  assert.match(s, /^2026-09-19T14:30:00[+-]\d{2}:\d{2}$/);
});

test('chamados: telefone, fila e filtro', () => {
  assert.equal(L.telefone('5571993010103'), '(71) 99301-0103');
  assert.equal(L.telefone('71 3493-7220'), '(71) 3493-7220');
  assert.equal(L.telefone('34937220'), '3493-7220');
  assert.equal(L.telefone('123'), '');
  const fila = L.ordenarChamados([
    { id: 1, situacao: 'resolvido', atualizado_em: '2026-09-01' },
    { id: 2, situacao: 'aberto', criado_em: '2026-09-02' },
    { id: 3, situacao: 'atendendo', atendendo_desde: '2026-09-03' },
    { id: 4, situacao: 'aberto', criado_em: '2026-09-01' },
    { id: 5, situacao: 'cancelado', atualizado_em: '2026-09-05' },
  ]);
  assert.deepEqual(fila.map((c) => c.id), [4, 2, 3, 5, 1]);
  assert.equal(fila[0]._fila, 1);
  assert.equal(fila[1]._fila, 2);
  assert.equal(fila[2]._fila, undefined);
  const lista = [{ tipo: 'Impressora ou scanner', descricao: 'não imprime', de_nome: 'Ana' }, { tipo: 'E-mail', descricao: 'senha', de_nome: 'Beto' }];
  assert.equal(L.filtrarChamados(lista, 'impressora nao').length, 1);
  assert.equal(L.filtrarChamados(lista, 'ana senha').length, 0);
});

test('conferencia: etapa e atraso sao eixos separados', () => {
  const hoje = '2026-09-19';
  assert.equal(L.situacaoDe({}), 'sem informação');
  assert.equal(L.situacaoDe({ situacao_sesmt: 'EM ANDAMENTO' }), 'em andamento');
  assert.equal(L.situacaoDe({ situacao_sesmt: 'REVISAO' }), 'em revisão');
  assert.equal(L.situacaoDe({ enviado_em: '2026-09-01' }), 'liberado');
  assert.equal(L.situacaoDe({ liberado_em: '2026-09-01', situacao_sesmt: 'EM ANDAMENTO' }), 'liberado');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-10' }, hoje), 'atrasado');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-15' }, hoje), '', 'dentro da tolerancia de 5 dias: nem atrasado nem perto');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-19' }, hoje), 'vence logo');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-22' }, hoje), 'vence logo');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-23' }, hoje), '');
  assert.equal(L.atrasoDe({ prazo_em: '2026-09-01', enviado_em: '2026-09-02' }, hoje), '', 'entregue nao atrasa');
  assert.equal(L.atrasoDe({}, hoje), '');
  const r = L.resumo([{ prazo_em: '2026-09-01' }, { enviado_em: '2026-09-01' }], hoje);
  assert.deepEqual(r, { 'sem informação': 1, 'atrasado': 1, 'liberado': 1 });
});

test('conferencia: cortesia x coordenacao e forma de pagamento agrupada', () => {
  assert.equal(L.semCobranca({ forma_pagamento: 'CORTESIA' }), 'CORTESIA');
  assert.equal(L.semCobranca({ forma_pagamento: '', observacao: 'serviço de coodernação' }), 'COORDENAÇÃO');
  assert.equal(L.semCobranca({ forma_pagamento: 'PIX' }), '');
  assert.equal(L.chaveDoPagamento('boleto 30 dias'), 'BOLETO');
  assert.equal(L.chaveDoPagamento('Cartão de crédito'), 'CARTÃO DE CRÉDITO');
  assert.equal(L.eACobrarPorNota({ forma_pagamento: 'FATURADO' }), true);
  assert.equal(L.eACobrarPorNota({ forma_pagamento: 'PIX' }), false);
});

test('conferencia: so o meu lado vai no PATCH', () => {
  const corpo = { empresa: 'X', valor: 10, situacao_sesmt: 'LIBERADO', faturado_em: '2026-09-01', pgr_liberado_em: '2026-09-01', atualizado_por: 'Eu' };
  assert.deepEqual(L.soOMeuLado(corpo, L.ladosDe({ setor: 'SESMT' })), { situacao_sesmt: 'LIBERADO', atualizado_por: 'Eu' });
  assert.deepEqual(L.soOMeuLado(corpo, L.ladosDe({ admin: true })), corpo);
  assert.deepEqual(L.soOMeuLado(corpo, L.ladosDe({})), corpo, 'sem lado: manda tudo para levar a recusa do servidor');
});

test('conferencia: quem assina', () => {
  const antes = { liberado_por: 'Layla', liberado_em: '2026-07-21', faturado_em: null };
  // apagar o nome de quem liberou zera a data
  assert.equal(L.assinar(antes, { ...antes, liberado_por: '' }, 'Eu', false).liberado_em, null);
  // faturar assina quem faturou; desfaturar limpa
  assert.equal(L.assinar(antes, { ...antes, faturado_em: '2026-09-19' }, 'Eu', false).faturado_por, 'Eu');
  assert.equal(L.assinar({ ...antes, faturado_em: '2026-09-19', faturado_por: 'Eu' }, { ...antes, faturado_em: null, faturado_por: 'Eu' }, 'Eu', false).faturado_por, null);
  // liberacao nova assina; data igual nao reescreve nome alheio
  assert.equal(L.assinar({}, { situacao_sesmt: 'EM ANDAMENTO' }, 'Eu', false).liberado_por, 'Eu');
  assert.equal(L.assinar(antes, { ...antes, observacao: 'x' }, 'Eu', false).liberado_por, 'Layla');
  // admin escreve a mao
  assert.equal(L.assinar({}, { situacao_sesmt: 'EM ANDAMENTO' }, 'Eu', true).liberado_por, undefined);
});

test('diario: validacao, dinheiro, data, metas e ranking', () => {
  assert.equal(L.lerDinheiro('1.234,56'), 1234.56);
  assert.equal(L.lerDinheiro('1500'), 1500);
  assert.equal(L.lerDinheiro('R$ 12,5'), 12.5);
  assert.equal(L.lerData('5/8', new Date(2026, 0, 1)), '2026-08-05');
  assert.equal(L.lerData('05/08/26'), '2026-08-05');
  assert.equal(L.lerData('31/02/2026'), null);
  assert.equal(L.lerData('2026-08-05'), '2026-08-05');
  const v = L.validarDetalhe('atendimento', { empresa: ' ACME ', servico: 'Consulta', pagamento: 'PIX', valor: '100,00', obs: 'ok' });
  assert.equal(v.ok, true);
  assert.equal(v.detalhe.valor, 100);
  // zero vale, como no diario_nucleo (cortesia, atendimento sem cobrança)
  assert.equal(L.validarDetalhe('atendimento', { empresa: 'ACME', servico: 'Consulta', pagamento: 'PIX', valor: '0', obs: 'ok' }).ok, true);
  assert.equal(L.validarDetalhe('prospeccao', { empresa: 'ACME', contato: 'x', status: 'Retornar', retorno: 'amanha', obs: 'ok' }).ok, false);
  assert.equal(L.metaDe([{ usuario_id: 'u1', atividade: 'contratos', meta: 5 }], 'u1', 'contratos'), 5);
  assert.equal(L.metaDe([], 'u1', 'contratos'), 80);
  assert.equal(L.percentual(240, 80), 100);
  assert.equal(L.percentual(40, 80), 50);
  assert.equal(L.corDoPercentual(79), 'amarelo');
  const r = L.ranking([
    { usuario_id: 'a', usuario_nome: 'Álvaro', atividade: 'contratos', total: 3 },
    { usuario_id: 'b', usuario_nome: 'Bia', atividade: 'contratos', total: 3 },
    { usuario_id: 'b', usuario_nome: 'Bia', atividade: 'cadastro', total: 1 },
    { usuario_id: 'adm', usuario_nome: 'Chefe', atividade: 'contratos', total: 99 },
  ], new Set(['adm']));
  assert.deepEqual(r.map((p) => [p.posicao, p.nome, p.total]), [[1, 'Bia', 4], [2, 'Álvaro', 3]]);
});

test('diario: retornos pendentes, aniversariantes e busca', () => {
  const hoje = '2026-09-19';
  const registros = [
    { atividade: 'prospeccao', data: '2026-09-10', detalhes: [{ empresa: 'A', retorno: '2026-09-17' }, { empresa: 'B', retorno: '2026-09-19' }] },
    { atividade: 'cadastro', data: '2026-09-10', detalhes: [{ empresa: 'Cia X', cnpj: '12.345.678/0001-90', aniversario: '2020-09-19' }] },
  ];
  const r = L.retornosPendentes(registros, hoje);
  assert.deepEqual(r.map((x) => x.tag), ['Atrasado 2 d', 'Hoje']);
  assert.equal(L.aniversariantes(registros, hoje).length, 1);
  assert.equal(L.buscarEmpresa(registros, '12345').length, 1);
  assert.equal(L.buscarEmpresa(registros, 'cia').length, 1);
  assert.equal(L.buscarEmpresa(registros, '').length, 0);
});

test('dinheiro como o dinheiro.py: ponto de milhar e zero na frente', () => {
  assert.equal(L.lerDinheiro('1.500'), 1500, 'mil e quinhentos, e nao um e meio');
  assert.equal(L.lerDinheiro('1.234,56'), 1234.56);
  assert.equal(L.lerDinheiro('1234.56'), 1234.56);
  assert.equal(L.lerDinheiro('0.750'), 0.75, 'zero na frente e decimal');
  assert.equal(L.lerDinheiro('R$ 2.000.000'), 2000000);
  assert.equal(L.lerDinheiro('abc'), 0);
});

test('cadastro: salvar pelo app nao apaga permissao que o app nao desenha', () => {
  const gravados = ['chat', 'almoxarifado', 'chave_do_futuro', 'financeiro:ver'];
  const marcados = ['chat', 'tarefas'];
  const final = L.juntarModulos(gravados, marcados);
  assert.ok(final.includes('chave_do_futuro'), 'chave desconhecida fica');
  assert.ok(final.includes('tarefas'));
  assert.ok(!final.includes('almoxarifado'), 'o app desenha almoxarifado: desmarcado sai');
  assert.ok(!final.includes('financeiro:ver'), 'o app desenha financeiro:ver: desmarcado sai');
  assert.ok(L.MODULOS.some(([k]) => k === 'homologacao'));
  assert.ok(L.BOTOES.some(([k]) => k === 'pedir_material'));
  assert.ok(L.CARGOS.includes('Diretor médico'));
  assert.ok(L.SETORES.includes('Contabilidade'));
});

test('conferencia: quem assina e o comprovante, como o conferencia_nucleo', () => {
  // apagar o nome de quem liberou nao faz o app assinar de novo
  const a = L.assinar({ liberado_por: 'LAYLA', situacao_sesmt: 'LIBERADO' }, { liberado_por: '', situacao_sesmt: 'LIBERADO' }, 'ANA', false);
  assert.equal(a.liberado_por, null);
  // anexar a nota num faturado sem nome assina
  const b = L.assinar({ faturado_em: '2026-09-01', faturado_por: '' }, { faturado_em: '2026-09-01', faturado_por: '', nf_arquivo: 'x.pdf' }, 'ANA', false);
  assert.equal(b.faturado_por, 'ANA');
  // nome de outra pessoa nao se troca
  const c = L.assinar({ faturado_em: '2026-09-01', faturado_por: 'BIA' }, { faturado_em: '2026-09-01', faturado_por: 'BIA', nf_arquivo: 'x.pdf' }, 'ANA', false);
  assert.equal(c.faturado_por, 'BIA');
  // admin com o campo vazio tambem assina
  const d = L.assinar({}, { faturado_em: '2026-09-02', faturado_por: '' }, 'ADM', true);
  assert.equal(d.faturado_por, 'ADM');
  assert.match(L.faltaComprovante({ faturado_em: '2026-09-01' }), /NOTA FISCAL/);
  assert.match(L.faltaComprovante({ faturado_em: '2026-09-01', nf_arquivo: 'n.pdf', forma_pagamento: 'BOLETO 5 DIAS' }), /BOLETO/);
  assert.equal(L.faltaComprovante({ faturado_em: '2026-09-01', nf_arquivo: 'n.pdf', forma_pagamento: 'PIX' }), '');
});

test('diario: valor zero vale, texto nao', () => {
  const ok = L.validarDetalhe('contratos', { empresa: 'X', servico: 'Y', valor: '0', pagamento: 'PIX', obs: 'cortesia' });
  assert.equal(ok.ok, true, ok.erro);
  const ruim = L.validarDetalhe('contratos', { empresa: 'X', servico: 'Y', valor: 'da', pagamento: 'PIX', obs: 'z' });
  assert.equal(ruim.ok, false);
});

test('forma de pagamento pela palavra, como o conferencia_nucleo', () => {
  assert.equal(L.chaveDoPagamento('BOLEOT 05 DIAS'), 'BOLETO');
  assert.equal(L.chaveDoPagamento('SOLICITAR BOLETO FATURAMENTO'), 'BOLETO');
  assert.equal(L.chaveDoPagamento('Pix'), 'PIX');
  assert.equal(L.chaveDoPagamento('a combinar'), 'A COMBINAR');
  assert.equal(L.chaveDoPagamento('xyz'), 'OUTRO');
  assert.equal(L.chaveDoPagamento(''), '');
  assert.equal(L.pagaComBoleto({ forma_pagamento: 'BOLEOT 05 DIAS' }), true);
});

test('e-mails: a proposta de parceria sai como no computador (o/a, do/da, segmentos)', () => {
  const r = { empresa: 'SODEXO SA', ia_artigo: 'a', ia_nome: 'Sodexo do Brasil', ia_nome_curto: 'Sodexo', ia_segmentos: 'alimentação coletiva e facilities' };
  const m = L.MODELOS_EMAIL[0];
  const corpo = L.preencherModelo(m.corpo, r, 'Ana', new Date(2026, 9, 27, 9));
  assert.ok(corpo.includes('Bom dia!'));
  assert.ok(corpo.includes('parceria comercial com a **Sodexo do Brasil**'));
  assert.ok(corpo.includes('a atuação da Sodexo nos segmentos de alimentação coletiva e facilities'));
  assert.ok(!/\{\w+\}/.test(corpo), 'sobrou marca sem trocar');
  assert.equal(L.preencherModelo(m.assunto, r), 'Proposta de Parceria | Saúde Ocupacional e SST – Sodexo do Brasil');
  assert.equal(L.contracaoDe('o'), 'do');
  assert.equal(L.faltaIa({}), true);
});

test('e-mails: de quem é a vez na conversa', () => {
  assert.equal(L.vezDeQuem({}), '');
  assert.equal(L.vezDeQuem({ respondido_em: '2026-10-27T15:00:00+00:00' }), 'nos');
  assert.equal(L.vezDeQuem({ respondido_em: '2026-10-27T15:00:00+00:00', respondemos_em: '2026-10-27T16:00:00+00:00' }), 'empresa');
  assert.equal(L.vezDeQuem({ respondido_em: '2026-10-27T17:00:00+00:00', respondemos_em: '2026-10-27T16:00:00+00:00' }), 'nos');
});

test('pedir a IA na resposta: o mesmo pedido do computador a orc-email', () => {
  // sem pedido nem tom: a sugestao unica de sempre
  assert.deepEqual(L.corpoSugerir(5), { acao: 'sugerir', id: 5 });
  // so o pedido: uma versao "do seu jeito"
  assert.deepEqual(L.corpoSugerir(5, { pedido: ' dizer que atendemos sabado ' }),
    { acao: 'sugerir', id: 5, tons: [], ajuste: 'dizer que atendemos sabado' });
  // tom escolhido, com e sem pedido; tom que nao existe nao vai
  assert.deepEqual(L.corpoSugerir(5, { tom: 'cordial', pedido: 'mais curta' }),
    { acao: 'sugerir', id: 5, tons: ['cordial'], ajuste: 'mais curta' });
  assert.deepEqual(L.corpoSugerir(5, { tom: 'cordial' }), { acao: 'sugerir', id: 5, tons: ['cordial'], ajuste: '' });
  assert.deepEqual(L.corpoSugerir(5, { tom: 'grosseira' }), { acao: 'sugerir', id: 5 });
  // AJUSTAR: o texto da caixa vai junto do pedido; sem pedido, nao sai do aparelho
  assert.equal(L.corpoSugerir(5, { pedido: 'mais curta', base: '  Prezada Ana,\n\nTexto.  ' }).base, 'Prezada Ana,\n\nTexto.');
  assert.equal('base' in L.corpoSugerir(5, { tom: 'curta', base: 'Prezada Ana' }), false);
  // os tons sao os mesmos do computador (prospeccao_nucleo.TONS_RESPOSTA), mais o "do seu jeito"
  assert.deepEqual(L.TONS_RESPOSTA.map(([k]) => k), ['', 'assertiva', 'enfatica', 'cordial', 'curta', 'consultiva', 'objecao']);
});

test('pesquisa: "1 – Muito ruim" é nota 1, e vira alerta (retornos_nucleo)', () => {
  const r = { formulario: 'pesquisa', respostas: [
    { campo: 'experiencia', valor: 'Insatisfatória' }, { campo: 'notaEspera', valor: '1 – Muito ruim' },
    { campo: 'notaPrecos', valor: '4 – Bom' }, { campo: 'notaEquipe', valor: 'N/A' }, { campo: 'interesse', valor: 'Talvez, gostaria' }] };
  assert.deepEqual(L.notasDaResposta(r), { notaEspera: 1, notaPrecos: 4 });
  assert.equal(L.mediaDaResposta(r), 2.5);
  assert.equal(L.motivosDoAlerta(r).length, 2);
  assert.equal(L.querConversar(r), true);
  assert.deepEqual(L.motivosDoAlerta({ formulario: 'ouvidoria' }), ['mensagem da ouvidoria']);
  const s = L.resumoPesquisa([r]);
  assert.equal(s.respostas, 1);
  assert.equal(s.aspectos.find((a) => a.rotulo.startsWith('Agilidade no atendimento')).pctRuins, 100);
});

test('pesquisa: a resposta a quem respondeu, com os mesmos casos do retornos_nucleo', () => {
  const resp = (v) => Object.entries(v).map(([campo, valor]) => ({ campo, rotulo: campo, valor }));
  const boa = { formulario: 'pesquisa', respostas: resp({ experiencia: 'Muito satisfatória', notaEspera: '5 – Muito bom', interesse: 'Sim' }) };
  const ruim = { formulario: 'pesquisa', respostas: resp({ experiencia: 'Insatisfatória', notaEspera: '1', interesse: 'Não' }) };
  const ouv = { formulario: 'ouvidoria', assunto: 'Reclamação', mensagem: 'Fui mal atendido' };
  assert.deepEqual(L.tonsPadraoRetorno(ruim), ['desculpas', 'melhorias']);
  assert.deepEqual(L.tonsPadraoRetorno(boa), ['agradecimento', 'curta', 'conversa']);
  assert.equal(L.pedeMelhoria(ouv), true);
  assert.equal(L.concluirAoResponder(ouv), false);
  assert.equal(L.pedeMelhoria({ ...ouv, assunto: 'Elogio à equipe' }), false);
  assert.equal(L.concluirAoResponder(boa), true);
  assert.equal(L.concluirAoResponder(ruim), false);
  assert.match(L.assuntoDoRetorno(ouv), /Ouvidoria/);
  assert.match(L.assuntoDoRetorno(boa), /avaliação/);
  const validos = new Set(L.TONS_RETORNO.map(([k]) => k));
  assert.ok([...L.tonsPadraoRetorno(ruim), ...L.tonsPadraoRetorno(boa)].every((t) => validos.has(t)));
  // o pedido à orc-email: tom desconhecido sai; a base só vai com o pedido
  assert.deepEqual(L.corpoRetornoSugerir(7, { tons: ['melhorias', 'xyz'] }), { acao: 'retorno_sugerir', id: 7, tons: ['melhorias'], pedido: '' });
  assert.equal(L.corpoRetornoSugerir(7, { pedido: 'mais curta', base: 'texto' }).base, 'texto');
  assert.equal('base' in L.corpoRetornoSugerir(7, { tons: ['curta'], base: 'texto' }), false);
  // a orc-email antiga recusa sem mandar nada: o recado manda publicar
  assert.match(L.recadoRetorno('Esse e-mail não parece válido.'), /publique a versão nova/);
  assert.equal(L.recadoRetorno('Falta o visto'), 'Falta o visto');
});

test('e-mails: {pela_empresa} faz a contração como no computador', () => {
  assert.equal(L.preencherModelo('agradece {pela_empresa}', { empresa: 'X', ia_artigo: 'a', ia_nome: 'RI Engenharia' }), 'agradece pela **RI Engenharia**');
  assert.equal(L.preencherModelo('{pela_empresa}', { empresa: 'X', ia_artigo: 'o', ia_nome: 'Grupo Liderança' }), 'pelo **Grupo Liderança**');
});

// A Caixa do Comercial: os MESMOS casos do autoteste do caixa_nucleo.py,
// para o celular e o computador mostrarem os mesmos números
const naBahia = (t) => new Date(Date.parse(`${t}:00-03:00`)).toISOString();

test('caixa: feriados e minutos de expediente como no caixa_nucleo', () => {
  assert.equal(L.pascoa(2026), '2026-04-05');
  assert.equal(L.pascoa(2027), '2027-03-28');
  assert.ok(L.feriadosDoAno(2026).has('2026-02-16'));          // segunda de Carnaval
  assert.ok(L.feriadosDoAno(2026).has('2026-06-04'));          // Corpus Christi
  assert.equal(L.diaUtil('2026-11-02'), false);                // Finados
  assert.equal(L.diaUtil('2026-11-03'), true);
  // sexta 17h -> segunda 9h = 1h + 1h
  assert.equal(L.minutosUteis(naBahia('2026-11-06T17:00'), naBahia('2026-11-09T09:00')), 120);
  assert.equal(L.minutosUteis(naBahia('2026-11-03T20:00'), naBahia('2026-11-04T08:30')), 30);
  // o feriado de 20/11 (sexta) não conta
  assert.equal(L.minutosUteis(naBahia('2026-11-19T17:00'), naBahia('2026-11-23T08:00')), 60);
  assert.equal(L.minutosUteis(naBahia('2026-11-09T09:00'), naBahia('2026-11-06T17:00')), 0);
  assert.equal(L.duracaoUtil(45), '45 min');
  assert.equal(L.duracaoUtil(130), '2h10');
  assert.equal(L.duracaoUtil(600), '1 dia útil');
  assert.equal(L.duracaoUtil(900), '1,5 dia útil');
  assert.equal(L.duracaoUtil(1500), '2,5 dias úteis');
  assert.equal(L.duracaoUtil(0), 'na hora');
  assert.equal(L.expedienteBr(80), '1h20 de expediente');
});

test('caixa: situação, filtros e números como no caixa_nucleo', () => {
  const agora = naBahia('2026-11-03T16:00');
  const base = { interno: false, automatico: false, classificado_em: 'x' };
  const pedido = { ...base, id: 1, quando: naBahia('2026-11-03T09:00'), categoria: 'Pedido de orçamento', precisa_resposta: true,
    resposta_id: '<r1>', respondido_em: naBahia('2026-11-03T09:40'), avaliacao_nota: 'Boa', assunto: 'Orçamento admissional',
    de: 'rh@alfa.com.br', empresa: 'ALFA' };
  const reclama = { ...base, id: 2, quando: naBahia('2026-11-03T10:00'), categoria: 'Reclamação', precisa_resposta: true,
    tom: 'Insatisfeito', prioridade: 'Urgente', assunto: 'Atraso no ASO', de: 'dp@beta.com', pasta: 'BETA' };
  const encaminhado = { ...base, id: 3, quando: naBahia('2026-11-03T11:00'), categoria: 'Financeiro', precisa_resposta: true,
    resposta_id: '<r3>', encaminhado: true, respondido_em: naBahia('2026-11-03T14:00'), avaliacao_nota: 'Regular' };
  const propaganda = { ...base, id: 4, quando: naBahia('2026-11-03T12:00'), categoria: 'Propaganda', precisa_resposta: false };
  const colega = { ...base, id: 5, quando: naBahia('2026-11-03T12:30'), interno: true, categoria: 'Equipe interna', precisa_resposta: true };
  const semIa = { ...base, id: 6, quando: naBahia('2026-11-03T15:00'), classificado_em: null, categoria: null };
  const corrigido = { ...reclama, id: 7, categoria_manual: 'Financeiro', precisa_manual: false };
  const linhas = [pedido, reclama, encaminhado, propaganda, colega, semIa, corrigido];

  assert.equal(L.cxSituacao(pedido), 'Respondido');
  assert.equal(L.cxSituacao(reclama), 'Sem resposta');
  assert.equal(L.cxSituacao(encaminhado), 'Encaminhado');
  assert.equal(L.cxSituacao(propaganda), 'Não precisa');
  assert.equal(L.cxSituacao(semIa), 'Sem resposta');
  assert.equal(L.cxCategoria(semIa), 'Ainda sem classificação');
  assert.equal(L.cxCategoria(corrigido), 'Financeiro');
  assert.equal(L.cxSituacao(corrigido), 'Não precisa');
  assert.equal(L.cxTempoResposta(pedido), 40);
  assert.equal(L.cxEsperando(reclama, agora), 360);
  assert.equal(L.cxAtrasado(reclama, agora), true);
  assert.equal(L.cxEmpresa(reclama), 'BETA');
  assert.equal(L.cxEmpresa({ pasta: 'Caixa de entrada' }), '');
  assert.equal(L.cxEmpresa({ pasta: '0 FATURAMENTO E FINANCEIRO' }), '');

  const clientes = L.cxFiltrar(linhas, 'todos', '', '', true, agora);
  assert.deepEqual(clientes.map((r) => r.id), [1, 2, 3, 6, 7]);
  assert.deepEqual(L.cxFiltrar(linhas, 'sem_resposta').map((r) => r.id), [2, 6]);
  assert.deepEqual(L.cxFiltrar(linhas, 'atrasados', '', '', true, agora).map((r) => r.id), [2]);
  assert.deepEqual(L.cxFiltrar(linhas, 'fracas').map((r) => r.id), [3]);
  assert.deepEqual(L.cxFiltrar(linhas, 'todos', 'Financeiro').map((r) => r.id), [3, 7]);
  assert.deepEqual(L.cxFiltrar(linhas, 'todos', '', 'orcamento alfa').map((r) => r.id), [1]);

  const k = L.cxIndicadores(clientes, agora);
  assert.equal(k.recebidos, 5); assert.equal(k.precisam, 4);
  assert.equal(k.respondidos, 2); assert.equal(k.respondidosPct, 50);
  assert.equal(k.semResposta, 2); assert.equal(k.atrasados, 1);
  assert.equal(k.tempoMedio, 110); assert.equal(k.tempoMediana, 180);
  assert.equal(k.ate4hPct, 100);
  assert.equal(k.reclamacoes, 1); assert.equal(k.reclamacoesSem, 1);
  assert.equal(k.avaliadas, 2); assert.equal(k.boasPct, 50);
  const cats = L.cxPorCategoria(clientes, agora);
  assert.equal(cats[0].categoria, 'Financeiro'); assert.equal(cats[0].recebidos, 2);

  assert.deepEqual(L.cxIntervalo('hoje', '2026-11-03'), ['2026-11-03', '2026-11-04']);
  assert.deepEqual(L.cxIntervalo('passado', '2026-11-03'), ['2026-10-01', '2026-11-01']);
  assert.deepEqual(L.cxIntervalo('passado', '2026-01-10'), ['2025-12-01', '2026-01-01']);
  assert.equal(L.cxUtc('2026-11-03'), '2026-11-03T03:00:00.000Z');
  assert.ok(L.BOTOES.some(([k2]) => k2 === 'caixa_comercial'));
});

test('anexos do e-mail: sem a coluna, ainda não procurados, nenhum, e a lista', () => {
  assert.equal(L.anexosDoEmail({ id: 1 }), undefined);          // o 83 não rodou
  assert.equal(L.anexosDoEmail({ id: 1, anexos: null }), null);  // lido antes do 83
  assert.deepEqual(L.anexosDoEmail({ id: 1, anexos: [] }), []);
  assert.deepEqual(L.anexosDoEmail({ anexos: [{ p: '2', n: 'ASO.pdf', t: 'application/pdf', b: 2048 }, { p: '', n: 'proposta.pdf' }] }),
    [{ parte: '2', nome: 'ASO.pdf', tipo: 'application/pdf', tamanho: 2048 },
     { parte: '', nome: 'proposta.pdf', tipo: '', tamanho: 0 }]);
});

test('os oito modelos do computador, e os da equipe na frente', () => {
  const nomes = L.MODELOS_EMAIL.map((m) => m.nome);
  assert.deepEqual(nomes, ['Proposta de parceria', 'Fortalecer parceria', 'Retomar parceria', 'Agradecimento pela reunião',
    'Pesquisa de satisfação', 'Boas-vindas a novo cliente', 'Primeiro contato', 'Cobrança']);
  const juntos = L.juntarModelos([{ nome: 'Cobrança', assunto: 'X', corpo: 'Y' }, { nome: 'Meu modelo', assunto: 'A', corpo: 'B' }]);
  assert.equal(juntos[0].assunto, 'X');                       // a da equipe vale
  assert.equal(juntos.filter((m) => m.nome === 'Cobrança').length, 1);
  assert.equal(juntos.length, 9);
  // só a {segmentos} trava o envio; as outras marcas têm reserva
  assert.equal(L.precisaSegmentos('a {segmentos} b'), true);
  assert.equal(L.precisaSegmentos(L.MODELOS_EMAIL[1].corpo), false);
  assert.equal(L.usaIa(L.MODELOS_EMAIL[1].corpo), true);
});

test('quem fica de fora do envio e quem está para cobrar', () => {
  assert.equal(L.motivoPular({ emails: '' }), 'sem e-mail');
  assert.equal(L.motivoPular({ emails: 'a@b.com', situacao: 'Virou cliente' }), 'virou cliente');
  assert.match(L.motivoPular({ emails: 'a@b.com', situacao: 'E-mail voltou' }), /voltou/);
  assert.equal(L.motivoPular({ emails: 'a@b.com', situacao: 'Respondeu' }), '');
  assert.equal(L.motivoPular({ emails: 'a@b.com', situacao: 'Respondeu' }, true), 'já respondeu');
  assert.match(L.motivoPular({ emails: 'a@b.com', situacao: 'Não enviado' }, true), /primeiro e-mail/);
  const lista = [{ id: 1, situacao: 'Enviado', cobrar_em: '2026-11-03' }, { id: 2, situacao: 'Enviado', cobrar_em: '2026-11-10' },
    { id: 3, situacao: 'Respondeu', cobrar_em: '2026-11-01' }, { id: 4, situacao: 'Enviado' }];
  assert.deepEqual(L.paraCobrar(lista, '2026-11-04').map((r) => r.id), [1]);
});

test('agendar: a sugestão é o próximo dia útil às 8h, e a hora tem 5 minutos de folga', () => {
  // terça 03/11/2026 às 7h: ainda dá hoje; às 10h, quarta; sexta 06/11 às 10h, segunda 09/11
  assert.deepEqual(L.proximoHorarioUtil(new Date(2026, 10, 3, 7, 0)), { dia: '2026-11-03', hora: '08:00' });
  assert.deepEqual(L.proximoHorarioUtil(new Date(2026, 10, 3, 10, 0)), { dia: '2026-11-04', hora: '08:00' });
  assert.deepEqual(L.proximoHorarioUtil(new Date(2026, 10, 6, 10, 0)), { dia: '2026-11-09', hora: '08:00' });
  const agora = new Date(2026, 10, 4, 10, 0);
  assert.match(L.lerQuando('2026-11-04', '10:03', agora).erro, /5 minutos/);
  assert.equal(L.lerQuando('2026-11-05', '08:30', agora).quando.getHours(), 8);
  assert.ok(L.lerQuando('', '08:00', agora).erro);
  assert.ok(L.lerQuando('2026-11-05', '25:00', agora).erro);
});

test('os já agendados: o mais cedo de cada empresa, e lote cancelado não conta', () => {
  const p = L.pendentesDosAgendados([
    { registro_id: 1, agendamento_id: 5, orc_emails_agendamentos: { agendado_para: '2026-11-06T11:00:00+00:00', situacao: 'agendado', cobranca: false } },
    { registro_id: 1, agendamento_id: 6, orc_emails_agendamentos: { agendado_para: '2026-11-05T11:00:00+00:00', situacao: 'agendado', cobranca: true } },
    { registro_id: 2, agendamento_id: 7, orc_emails_agendamentos: { agendado_para: '2026-11-05T11:00:00+00:00', situacao: 'cancelado' } },
    { registro_id: 3, agendamento_id: 8 },                          // sem o lote junto
  ]);
  assert.deepEqual(Object.keys(p), ['1']);
  assert.equal(p[1].lote, 6);
  assert.equal(p[1].cobranca, true);
  assert.match(L.agendadoCurto(p[1]), /^🕒 cobrar 05\/11 \d\d:00$/);
  assert.equal(L.agendadoCurto(null), '');
});

test('clientes da casa: os mesmos casos do clientes_nucleo do computador', () => {
  const idx = L.clIndice([
    { codigo: '2JS', nome: '10K ENGENHARIA E MAN', grupo: '10K ENGENHARIA E MAN', faturou_2025: true, faturou_2026: false, meses_2025: 6, meses_2026: 0 },
    { codigo: '4KU', nome: 'ATAKAREJO - LOJA 01', grupo: 'ATAKAREJO', faturou_2025: true, faturou_2026: true, meses_2025: 9, meses_2026: 9 },
    { codigo: '4KW', nome: 'ATAKAREJO - LOJA 02', grupo: 'ATAKAREJO', faturou_2025: true, faturou_2026: true, meses_2025: 9, meses_2026: 7 },
    { codigo: '4MP', nome: 'NPE', grupo: 'NPE', faturou_2025: true, faturou_2026: true, meses_2025: 9, meses_2026: 4 },
    { codigo: 'X1', nome: 'ENGENHARIA', grupo: 'ENGENHARIA', faturou_2025: false, faturou_2026: true, meses_2025: 0, meses_2026: 1 },
  ], 'Jan-set/2025 x jan-set/2026');
  const c = idx.achar('10K Engenharia e Manutenção Ltda');
  assert.equal(c.grupo, '10K ENGENHARIA E MAN');
  assert.equal(c.faturou_2026, false);
  assert.match(L.clDescricao(c), /faturou em 2025 e não em 2026/);
  const a = idx.achar('Atakarejo Distribuidor de Alimentos');
  assert.equal(a.grupo, 'ATAKAREJO');
  assert.equal(a.meses_2026, 9);                                   // o maior, e não a soma
  assert.match(L.clDescricao(a, idx.periodo), /^cliente da casa: faturou em 2026 \(9 mês\(es\) do estudo jan-set\/2025 x jan-set\/2026\)/);
  assert.equal(idx.achar('NPE Facilities S.A.').grupo, 'NPE');
  assert.equal(idx.achar('NPEX Comércio'), null);
  assert.equal(idx.achar('Engenharia Alfa Ltda'), null);          // palavra genérica sozinha
  assert.equal(idx.achar('', null), null);
  assert.equal(idx.achar('Mercado Bom Preço', 'ATAKAREJO LOJA 07').grupo, 'ATAKAREJO');
  assert.equal(L.clIndice([]).achar('Qualquer'), null);
});
