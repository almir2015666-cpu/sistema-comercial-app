// node --test tests/
// As regras do Almoxarifado do app (window.ALM_LOGICA), conferidas contra
// o almoxarifado_nucleo.py do SistemaCMH: pedido nominal, tudo sai do
// almoxarifado, entrega não passa do que tem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../app/logica.js');

// O arquivo do módulo é um script de navegador: roda aqui com um "window"
// de mentira e só as peças que ele toca ao carregar.
function carregar() {
  const janela = {};
  const ctx = {
    window: janela, L, MODULOS: {},
    UI: { $: () => null, $$: () => [], esc: (s) => String(s), toast: () => {}, ICONES: {} },
    N: { estado: { eu: null } }, APP: { contagens: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../app/modulos/almoxarifado.js', import.meta.url), 'utf8'), ctx);
  return { A: janela.ALM_LOGICA, modulo: ctx.MODULOS.almoxarifado };
}

test('os vistos são os mesmos do computador', () => {
  const { A, modulo } = carregar();
  assert.equal(A.pede({ modulos: ['pedir_material'] }), true);
  assert.equal(A.pede({ modulos: ['almoxarifado'] }), false, 'o módulo não dá o pedir: é visto à parte');
  assert.equal(A.entrega({ modulos: ['almoxarifado'] }), false, 'ver o módulo não é entregar');
  assert.equal(A.entrega({ modulos: ['almoxarifado:atender'] }), true);
  assert.equal(A.entrega({ admin: true }), true);
  assert.equal(modulo.precisa({ modulos: ['pedir_material'] }), true);
  assert.equal(modulo.precisa({ modulos: ['chat'] }), false);
});

test('o pedido é nominal: só quem pediu desiste e confirma', () => {
  const { A } = carregar();
  assert.equal(A.podeDesistir({ situacao: 'aberta', de: 'u1' }, 'u1'), true);
  assert.equal(A.podeDesistir({ situacao: 'separando', de: 'u1' }, 'u1'), false, 'depois de aceito, não');
  assert.equal(A.podeDesistir({ situacao: 'aberta', de: 'u1' }, 'u2'), false, 'o colega não desiste do meu');
  assert.equal(A.podeConfirmar({ situacao: 'enviada', de: 'u1' }, { id: 'u1' }), true);
  assert.equal(A.podeConfirmar({ situacao: 'enviada', de: 'u1' }, { id: 'u2' }), false, 'o colega do setor não confirma');
  assert.equal(A.podeConfirmar({ situacao: 'aberta', de: 'u1' }, { id: 'u1' }), false, 'não se confirma o que não saiu');
});

test('setor do pedido, depósito e quantidades como no núcleo', () => {
  const { A } = carregar();
  assert.equal(A.setorDe({ setor: 'Recepção, Comercial' }), 'Recepção');
  assert.equal(A.setorDe({}), 'Sem setor');
  assert.equal(A.depositoPrincipal([{ id: 2, tipo: 'despensa' }, { id: 1, tipo: 'almoxarifado' }]).id, 1);
  assert.equal(A.depositoPrincipal([{ id: 1, tipo: 'almoxarifado', ativo: false }, { id: 2, tipo: 'despensa' }]).id, 2);
  assert.equal(A.quantidade('2,5'), 2.5);
  assert.equal(A.quantidade('-3'), 0, 'quantidade nunca é negativa');
  assert.equal(A.mostrar(3), '3');
  assert.equal(A.mostrar(2.5), '2,5');
  assert.equal(A.resumo([{ pedida: 2 }, { pedida: 10 }]), '2 itens · 12');
});

test('a entrega não passa do que tem, e o mínimo acende', () => {
  const { A } = carregar();
  const linhas = [{ id: 1, item_id: 10 }, { id: 2, item_id: 20 }];
  const falta = A.faltando(linhas, { 1: 5, 2: 1 }, { 10: 3, 20: 1 });
  assert.equal(JSON.stringify(falta.map((l) => l.id)), '[1]');
  assert.equal(A.abaixoDoMinimo({ minimo: 10 }, 4), true);
  assert.equal(A.abaixoDoMinimo({ minimo: 0 }, 0), false, 'mínimo zero: ninguém acompanha');
  const saldo = A.saldoPorItem([{ item_id: 10, deposito_id: 1, quantidade: 4 }, { item_id: 10, deposito_id: 2, quantidade: 9 }], 1);
  assert.equal(JSON.stringify(saldo), '{"10":4}');
});

test('a fila: as vivas primeiro, a mais antiga na frente', () => {
  const { A } = carregar();
  const lista = A.ordenar([
    { id: 1, situacao: 'recebida', criado_em: '2026-09-01', atualizado_em: '2026-09-02' },
    { id: 2, situacao: 'aberta', criado_em: '2026-09-20' },
    { id: 3, situacao: 'separando', criado_em: '2026-09-10' },
  ]);
  assert.equal(JSON.stringify(lista.map((r) => r.id)), '[3,2,1]');
});
