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

test('e-mails: {pela_empresa} faz a contração como no computador', () => {
  assert.equal(L.preencherModelo('agradece {pela_empresa}', { empresa: 'X', ia_artigo: 'a', ia_nome: 'RI Engenharia' }), 'agradece pela **RI Engenharia**');
  assert.equal(L.preencherModelo('{pela_empresa}', { empresa: 'X', ia_artigo: 'o', ia_nome: 'Grupo Liderança' }), 'pelo **Grupo Liderança**');
});
