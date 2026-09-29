/* =====================================================================
   Almoxarifado — o mesmo do computador, no bolso.

   DOIS LADOS, como no SistemaCMH:
     - QUEM PEDE (visto "Solicitar material", chave pedir_material): faz
       o pedido NO PRÓPRIO NOME, acompanha e confirma que recebeu. Tudo sai
       do almoxarifado; a pessoa não escolhe setor nem depósito.
     - O ALMOXARIFE (módulo almoxarifado + visto "Entregar pedidos"): vê a
       fila com o nome de quem pediu, aceita, entrega (o estoque baixa
       aqui, no nome da pessoa) ou recusa com motivo. E consulta o estoque.

   Dar entrada, corrigir saldo e bipar a nota ficam no computador: são
   trabalho de balcão, com leitor de código de barras e o XML da nota.

   O SALDO NÃO SE DIGITA: a entrega grava uma SAÍDA em orc_alm_movimento,
   e o gatilho do banco (nuvem/sql/60) soma e recusa estoque negativo.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast } = UI;
  const eu = () => N.estado.eu;

  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>';

  /* ------------------------------------------------ as regras (puras) */
  const A = {
    VIVAS: ['aberta', 'separando', 'enviada'],
    ROTULO: { aberta: 'Pedida', separando: 'Aceita, separando', enviada: 'Entregue', recebida: 'Recebida', cancelada: 'Recusada' },
    SELO: { aberta: 'b-1', separando: 'b-3', enviada: 'b-4', recebida: 'b-ok', cancelada: 'b-gray' },
    // Os vistos, iguais aos do computador (app.py, DENTRO_DOS_MODULOS).
    pede: (u) => !!u?.admin || (u?.modulos || []).includes('pedir_material'),
    veModulo: (u) => !!u?.admin || (u?.modulos || []).includes('almoxarifado'),
    entrega: (u) => !!u?.admin || (u?.modulos || []).includes('almoxarifado:atender'),
    // O setor que vai escrito no pedido: o primeiro do cadastro. Quem manda
    // é o nome; o setor só diz ao almoxarife de onde a pessoa é.
    setorDe: (u) => (String(u?.setor || '').split(',')[0].trim().slice(0, 60)) || 'Sem setor',
    // Tudo sai do almoxarifado (o depósito do tipo almoxarifado, ativo).
    depositoPrincipal: (lista) => {
      const ativos = (lista || []).filter((d) => d.ativo !== false);
      return ativos.find((d) => d.tipo === 'almoxarifado') || ativos[0] || null;
    },
    mostrar: (v) => {
      const n = Number(v || 0);
      return Math.abs(n - Math.round(n)) < 0.0005 ? String(Math.round(n)) : n.toFixed(3).replace(/0+$/, '').replace('.', ',');
    },
    quantidade: (t) => { const n = Number(String(t ?? '').replace(/\./g, '').replace(',', '.')); return n > 0 ? Math.round(n * 1000) / 1000 : 0; },
    resumo: (itens) => {
      const n = (itens || []).length;
      const total = (itens || []).reduce((s, i) => s + Number(i.pedida || 0), 0);
      return `${n} ${n === 1 ? 'item' : 'itens'} · ${A.mostrar(total)}`;
    },
    // A fila: as vivas primeiro (a mais antiga na frente), as fechadas depois.
    ordenar: (lista) => {
      const vivas = lista.filter((r) => A.VIVAS.includes(r.situacao)).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
      const fechadas = lista.filter((r) => !A.VIVAS.includes(r.situacao)).sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
      return vivas.concat(fechadas);
    },
    // Saldo por item no depósito escolhido.
    saldoPorItem: (saldos, depositoId) => {
      const m = {};
      for (const s of saldos || []) if (Number(s.deposito_id) === Number(depositoId)) m[s.item_id] = Number(s.quantidade || 0);
      return m;
    },
    abaixoDoMinimo: (item, tem) => Number(item.minimo || 0) > 0 && tem < Number(item.minimo || 0),
    // O que não dá para entregar: pedir mais do que tem.
    faltando: (linhas, vai, tem) => linhas.filter((l) => (vai[l.id] || 0) > (tem[l.item_id] || 0)),
    podeDesistir: (r, id) => r?.situacao === 'aberta' && String(r.de) === String(id),
    podeConfirmar: (r, u) => r?.situacao === 'enviada' && (!!u?.admin || String(r.de) === String(u?.id)),
  };
  window.ALM_LOGICA = A;

  /* ------------------------------------------------------- a nuvem */
  async function catalogo() {
    const [dep, itens, saldos] = await Promise.all([
      N.sb.from('orc_alm_deposito').select('id,nome,tipo,ativo').eq('ativo', true),
      N.tudo((de, ate) => N.sb.from('orc_alm_item').select('id,nome,codigo,unidade,categoria,minimo').eq('ativo', true).order('nome').range(de, ate)),
      N.tudo((de, ate) => N.sb.from('orc_alm_saldo').select('item_id,deposito_id,quantidade').range(de, ate)),
    ]);
    if (dep.error) throw dep.error;
    const deposito = A.depositoPrincipal(dep.data);
    return { deposito, itens, tem: deposito ? A.saldoPorItem(saldos, deposito.id) : {} };
  }

  async function pedidos({ meus = false, fechados = false } = {}) {
    const lista = await N.tudo((de, ate) => {
      let q = N.sb.from('orc_alm_requisicao').select('*');
      if (meus) q = q.eq('de', eu().id);
      if (!fechados) q = q.in('situacao', A.VIVAS);
      else q = q.gte('atualizado_em', L.somarDias(L.hojeISO(), -60));
      return q.order('id', { ascending: false }).range(de, ate);
    });
    const ids = lista.map((r) => r.id);
    const porPedido = {};
    if (ids.length) {
      const itens = await N.tudo((de, ate) => N.sb.from('orc_alm_requisicao_item').select('*').in('requisicao_id', ids).order('id').range(de, ate));
      for (const i of itens) (porPedido[i.requisicao_id] ||= []).push(i);
    }
    return A.ordenar(lista).map((r) => ({ ...r, _itens: porPedido[r.id] || [] }));
  }

  /* ---------------------------------------------------- a tela */
  const tela = {
    titulo: 'Almoxarifado',
    aoTopo(dir) {
      dir.innerHTML = '';
      if (A.pede(eu())) dir.appendChild(UI.botaoTopo(UI.ICONES.mais_circ, () => novoPedido(), 'Novo pedido'));
    },
    async desenhar(el) {
      const abas = [];
      if (A.pede(eu())) abas.push(['meus', 'Meus pedidos']);
      if (A.entrega(eu())) abas.push(['fila', 'Para entregar']);
      if (A.veModulo(eu())) abas.push(['estoque', 'Estoque']);
      let modo = abas[0]?.[0] || 'meus', fechados = false, busca = '', vivo = true, cat = null;

      const desenharLista = async () => {
        if (!vivo) return;
        try {
          let corpo = '';
          if (modo === 'estoque') {
            cat = await catalogo();
            let itens = cat.itens;
            if (busca) { const t = L.semAcento(busca).toLowerCase(); itens = itens.filter((i) => L.semAcento(`${i.nome} ${i.codigo || ''} ${i.categoria || ''}`).toLowerCase().includes(t)); }
            if (fechados) itens = itens.filter((i) => A.abaixoDoMinimo(i, cat.tem[i.id] || 0));
            corpo = itens.length ? `<div class="lista">${itens.map((i) => {
              const tem = cat.tem[i.id] || 0, falta = A.abaixoDoMinimo(i, tem);
              return `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(i.nome)}</span><span class="badge ${falta ? 'b-1' : tem > 0 ? 'b-ok' : 'b-gray'}">${esc(A.mostrar(tem))} ${esc(i.unidade || '')}</span></div>
                <div class="linha__sub">${esc(i.categoria || 'Sem categoria')}${Number(i.minimo) ? ` · mínimo ${esc(A.mostrar(i.minimo))}` : ''}${falta ? ` · comprar ${esc(A.mostrar(Number(i.minimo) - tem))}` : ''}</div></div></div>`;
            }).join('')}</div>` : UI.vazio(fechados ? 'Nada abaixo do mínimo' : 'Nenhum item', busca ? 'Nada com esse nome.' : '');
          } else {
            const lista = await pedidos({ meus: modo === 'meus', fechados });
            if (modo === 'fila') APP.contagens.almoxarifado = lista.filter((r) => r.situacao === 'aberta').length;
            corpo = lista.length ? `<div class="lista">${lista.map((r) => `<button class="linha" type="button" data-id="${r.id}">
              ${modo === 'fila' ? UI.avatar(r.de_nome, 40) : ''}
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">${modo === 'fila' ? esc(r.de_nome || '?') : `Pedido ${r.id}`}</span><span class="badge ${A.SELO[r.situacao] || 'b-gray'}">${esc(A.ROTULO[r.situacao] || r.situacao)}</span></div>
              <div class="linha__sub">${modo === 'fila' ? `${esc(r.setor || '')} · ` : ''}${esc(A.resumo(r._itens))} · ${esc(UI.quando(r.criado_em))}</div></div>${UI.ICONES.seta}</button>`).join('')}</div>`
              : UI.vazio(fechados ? 'Nada nos últimos 60 dias' : (modo === 'fila' ? 'Nenhum pedido esperando' : 'Nenhum pedido em andamento'), modo === 'meus' && !fechados ? 'Toque em + para pedir material.' : '');
            tela._lista = lista;
          }
          el.innerHTML = `${abas.length > 1 ? `<div class="tabs">${abas.map(([k, r]) => `<button class="tab ${modo === k ? 'on' : ''}" data-v="${k}">${esc(r)}</button>`).join('')}</div>` : ''}
            ${modo === 'estoque' ? `<div class="busca">${UI.ICONES.busca}<input id="alm-busca" placeholder="Procurar item" value="${esc(busca)}"></div>` : ''}
            <label class="dica" style="display:flex;gap:8px;align-items:center;margin:8px 2px"><input type="checkbox" id="alm-fech" ${fechados ? 'checked' : ''}> ${modo === 'estoque' ? 'só o que falta comprar' : 'mostrar os já recebidos e recusados'}</label>
            ${corpo}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { modo = b.dataset.v; fechados = false; busca = ''; desenharLista(); }; });
          $('#alm-fech', el).onchange = (e) => { fechados = e.target.checked; desenharLista(); };
          const inp = $('#alm-busca', el);
          if (inp) { let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenharLista().then(() => { const i2 = $('#alm-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 350); }; }
          $$('.linha[data-id]', el).forEach((b) => { b.onclick = () => detalhe((tela._lista || []).find((r) => r.id === Number(b.dataset.id)), modo, desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenharLista();
      const relogio = setInterval(() => { if (!document.hidden && !busca) desenharLista(); }, 20000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  /* ------------------------------------------------ o pedido por dentro */
  async function detalhe(r, modo, depois) {
    if (!r) return;
    let nomes = {};
    try { const c = await catalogo(); nomes = Object.fromEntries(c.itens.map((i) => [i.id, i])); } catch { /* mostra sem nome */ }
    const nomeDe = (id) => nomes[id] ? `${nomes[id].nome} (${nomes[id].unidade || 'UN'})` : `item ${id}`;
    const naFila = modo === 'fila' && A.entrega(eu());
    const f = UI.folha(`
      <div><span class="badge ${A.SELO[r.situacao] || 'b-gray'}">${esc(A.ROTULO[r.situacao] || r.situacao)}</span></div>
      <dl class="ficha mt12">
        <div><dt>Pedido por</dt><dd>${esc(r.de_nome || '')}${r.setor ? ` · ${esc(r.setor)}` : ''}</dd></div>
        <div><dt>Pedido em</dt><dd>${esc(L.dataHoraBr(r.criado_em))}</dd></div>
        ${r.enviada_em ? `<div><dt>Entregue</dt><dd>${esc(L.dataHoraBr(r.enviada_em))} por ${esc(r.enviada_por_nome || '')}</dd></div>` : ''}
        ${r.recebida_em ? `<div><dt>Recebimento confirmado</dt><dd>${esc(L.dataHoraBr(r.recebida_em))}</dd></div>` : ''}
        ${r.observacao ? `<div class="largo"><dt>Observação</dt><dd>${esc(r.observacao)}</dd></div>` : ''}
        ${r.motivo_cancelamento ? `<div class="largo"><dt>Motivo da recusa</dt><dd>${esc(r.motivo_cancelamento)}</dd></div>` : ''}
      </dl>
      <div class="lista mt12">${r._itens.map((i) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(nomeDe(i.item_id))}</span></div>
        <div class="linha__sub">pediu ${esc(A.mostrar(i.pedida))}${i.atendida != null ? ` · entregue ${esc(A.mostrar(i.atendida))}` : ''}${i.recebida != null ? ` · recebido ${esc(A.mostrar(i.recebida))}` : ''}</div></div></div>`).join('')}</div>
      <div class="acoes mt16">
        ${naFila && r.situacao === 'aberta' ? '<button class="btn btn-ok" id="al-aceitar" type="button">Aceitar</button>' : ''}
        ${naFila && ['aberta', 'separando'].includes(r.situacao) ? '<button class="btn btn-ok" id="al-entregar" type="button">Entregar</button><button class="btn btn-ghost" id="al-recusar" type="button">Recusar</button>' : ''}
        ${A.podeConfirmar(r, eu()) && String(r.de) === String(eu().id) ? '<button class="btn btn-ok" id="al-recebi" type="button">Recebi tudo</button><button class="btn btn-ghost" id="al-diferente" type="button">Veio diferente</button>' : ''}
        ${A.podeDesistir(r, eu().id) ? '<button class="btn btn-ghost" id="al-desistir" type="button">Desistir do pedido</button>' : ''}
      </div>`, { titulo: modo === 'fila' ? (r.de_nome || `Pedido ${r.id}`) : `Pedido ${r.id}` });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    const feito = (texto) => { toast(texto, 'ok'); f.fechar(); depois(); };

    on('#al-aceitar', async () => {
      try { await N.mudar('orc_alm_requisicao', { id: r.id }, { situacao: 'separando' }); feito(`Aceito. ${L.primeiroNome(r.de_nome) || 'Quem pediu'} já vê.`); }
      catch (e) { toast(N.recado(e), 'err'); }
    });
    on('#al-recusar', async () => {
      f.fechar();
      const motivo = await UI.perguntar('Por que não vai ser atendido?', { multilinha: true, ok: 'Recusar', placeholder: 'É isso que a pessoa vai ler.' });
      if (!motivo) return;
      try { await N.mudar('orc_alm_requisicao', { id: r.id }, { situacao: 'cancelada', motivo_cancelamento: motivo }); N.registrar('almox_cancelada', `requisição ${r.id}`); toast('Pedido recusado.', 'ok'); depois(); }
      catch (e) { toast(N.recado(e), 'err'); }
    });
    on('#al-desistir', async () => {
      f.fechar();
      const motivo = await UI.perguntar('Por que o pedido não é mais preciso?', { multilinha: true, ok: 'Desistir' });
      if (!motivo) return;
      try { await N.mudar('orc_alm_requisicao', { id: r.id }, { situacao: 'cancelada', motivo_cancelamento: motivo }); N.registrar('almox_cancelada', `requisição ${r.id}`); toast('Pedido cancelado.', 'ok'); depois(); }
      catch (e) { toast(N.recado(e, 'O almoxarifado já aceitou este pedido.'), 'err'); }
    });
    on('#al-entregar', () => { f.fechar(); UI.ir(telaQuantidades(r, 'entregar', nomes, depois)); });
    on('#al-diferente', () => { f.fechar(); UI.ir(telaQuantidades(r, 'receber', nomes, depois)); });
    on('#al-recebi', async () => {
      try { await confirmar(r, Object.fromEntries(r._itens.map((i) => [i.id, Number(i.atendida || 0)])), ''); feito('Recebimento confirmado.'); }
      catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  async function confirmar(r, recebidas, observacao) {
    for (const i of r._itens) await N.mudar('orc_alm_requisicao_item', { id: i.id }, { recebida: recebidas[i.id] ?? Number(i.atendida || 0) });
    const corpo = { situacao: 'recebida' };
    if (observacao) corpo.observacao = observacao;
    await N.mudar('orc_alm_requisicao', { id: r.id }, corpo);
    N.registrar('almox_recebida', `requisição ${r.id}`);
  }

  // A entrega: grava quanto vai de cada item, dá a SAÍDA no estoque (no
  // nome de quem pediu) e só então marca o pedido como entregue. A mesma
  // ordem do computador (almoxarifado_nucleo.enviar).
  async function entregar(r, vai, deposito) {
    let saiu = 0;
    for (const i of r._itens) {
      const qtd = vai[i.id] || 0;
      await N.mudar('orc_alm_requisicao_item', { id: i.id }, { atendida: qtd });
      if (qtd <= 0) continue;
      const { error } = await N.sb.from('orc_alm_movimento').insert({
        item_id: i.item_id, deposito_id: r.deposito_id || deposito.id, tipo: 'saida', quantidade: qtd,
        requisicao_id: r.id, quem: eu().id, quem_nome: eu().nome || '',
        motivo: `entregue a ${r.de_nome || '?'} (pedido ${r.id}, ${r.setor || 'sem setor'})`,
      });
      if (error) throw error;
      saiu += 1;
    }
    if (!saiu) throw new Error('Nenhum item foi entregue. Se não há nada para entregar, recuse o pedido com o motivo.');
    await N.mudar('orc_alm_requisicao', { id: r.id }, { situacao: 'enviada' });
    N.registrar('almox_enviada', `requisição ${r.id}`);
  }

  /* -------------------------------- quantidades: entregar ou receber */
  function telaQuantidades(r, qual, nomes, depois) {
    const entregando = qual === 'entregar';
    return {
      titulo: entregando ? `Entregar a ${L.primeiroNome(r.de_nome) || 'quem pediu'}` : 'O que eu recebi',
      async desenhar(el) {
        let cat = { tem: {}, deposito: null };
        try { cat = await catalogo(); } catch (e) { el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; return; }
        const valor = (i) => entregando ? (i.atendida ?? i.pedida) : (i.atendida ?? 0);
        el.innerHTML = `<p class="dica" style="margin:4px 2px 12px">${entregando
          ? `Pedido de ${esc(r.de_nome || '')} (${esc(r.setor || '')}). Diga quanto vai de cada item; o que ficar em zero não sai. O estoque baixa no nome dela.`
          : 'Confira o que chegou na sua mão. Se veio menos, escreva o que veio.'}</p>
          <form id="al-q"><div class="lista">${r._itens.map((i) => `<div class="linha"><div class="linha__corpo">
            <div class="linha__titulo"><span class="t">${esc(nomes[i.item_id]?.nome || `item ${i.item_id}`)}</span></div>
            <div class="linha__sub">pediu ${esc(A.mostrar(i.pedida))}${entregando ? ` · tem ${esc(A.mostrar(cat.tem[i.item_id] || 0))}` : ` · entregaram ${esc(A.mostrar(i.atendida || 0))}`}</div></div>
            <input class="al-qtd" data-id="${i.id}" inputmode="decimal" value="${esc(A.mostrar(valor(i)))}" style="width:76px;text-align:right"></div>`).join('')}</div>
          ${entregando ? '' : '<div class="fg mt12"><label>Observação</label><input id="al-obs" maxlength="300"></div>'}
          <div class="modal-ft"><button class="btn btn-ok" type="submit">${entregando ? `Entregar a ${esc(L.primeiroNome(r.de_nome) || 'quem pediu')}` : 'Confirmar que recebi'}</button></div></form>`;
        $('#al-q', el).onsubmit = async (e) => {
          e.preventDefault();
          const q = Object.fromEntries($$('.al-qtd', el).map((inp) => [Number(inp.dataset.id), A.quantidade(inp.value)]));
          try {
            if (entregando) {
              const falta = A.faltando(r._itens, q, cat.tem);
              if (falta.length) return toast(`Não tem tudo isso no estoque: ${falta.map((i) => nomes[i.item_id]?.nome || i.item_id).join(', ')}.`, 'err', 5000);
              await entregar(r, q, cat.deposito);
              toast('Entregue. O estoque baixou.', 'ok');
            } else {
              await confirmar(r, q, ($('#al-obs', el).value || '').trim());
              toast('Recebimento confirmado.', 'ok');
            }
            UI.voltar(); depois();
          } catch (err) { toast(N.recado(err), 'err', 5000); }
        };
      },
    };
  }

  /* ------------------------------------------------------ novo pedido */
  function novoPedido() {
    const escolhidos = {};
    UI.ir({
      titulo: 'Novo pedido',
      async desenhar(el) {
        let cat;
        try { cat = await catalogo(); } catch (e) { el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; return; }
        if (!cat.deposito || !cat.itens.length) { el.innerHTML = UI.vazio('O catálogo ainda está vazio', 'Peça ao almoxarifado para cadastrar os itens.'); return; }
        let busca = '';
        const desenhar = () => {
          const t = L.semAcento(busca).toLowerCase();
          const itens = cat.itens.filter((i) => !t || L.semAcento(`${i.nome} ${i.categoria || ''}`).toLowerCase().includes(t));
          const n = Object.values(escolhidos).filter((v) => v > 0).length;
          el.innerHTML = `<p class="dica" style="margin:4px 2px 8px">Pedido de <b>${esc(eu().nome || '')}</b> (${esc(A.setorDe(eu()))}). Vai no seu nome, e é para você que o material é entregue.</p>
            <div class="busca">${UI.ICONES.busca}<input id="np-busca" placeholder="Procurar item" value="${esc(busca)}"></div>
            <div class="lista">${itens.map((i) => {
              const q = escolhidos[i.id] || 0;
              return `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(i.nome)}</span></div>
                <div class="linha__sub">${esc(i.unidade || 'UN')} · tem ${esc(A.mostrar(cat.tem[i.id] || 0))}</div></div>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="btn btn-ghost np-menos" data-id="${i.id}" type="button" style="min-width:38px" ${q ? '' : 'disabled'}>−</button>
                  <input class="np-q" data-id="${i.id}" inputmode="decimal" value="${q ? esc(A.mostrar(q)) : ''}" placeholder="0" style="width:52px;text-align:center">
                  <button class="btn btn-ghost np-mais" data-id="${i.id}" type="button" style="min-width:38px">+</button></div></div>`;
            }).join('')}</div>
            <div class="fg mt12"><label>Observação</label><input id="np-obs" maxlength="300" placeholder="opcional"></div>
            <div class="modal-ft"><button class="btn btn-ok" id="np-enviar" type="button" ${n ? '' : 'disabled'}>Enviar pedido${n ? ` (${n} ${n === 1 ? 'item' : 'itens'})` : ''}</button></div>`;
          const b = $('#np-busca', el);
          let tm; b.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { busca = b.value; const pos = b.selectionStart; desenhar(); const b2 = $('#np-busca', el); b2.focus(); b2.setSelectionRange(pos, pos); }, 300); };
          const mudar = (id, v) => { escolhidos[id] = Math.max(0, v); desenhar(); };
          $$('.np-mais', el).forEach((x) => { x.onclick = () => mudar(x.dataset.id, (escolhidos[x.dataset.id] || 0) + 1); });
          $$('.np-menos', el).forEach((x) => { x.onclick = () => mudar(x.dataset.id, (escolhidos[x.dataset.id] || 0) - 1); });
          $$('.np-q', el).forEach((x) => { x.onchange = () => mudar(x.dataset.id, A.quantidade(x.value)); });
          $('#np-enviar', el).onclick = () => enviar(cat, ($('#np-obs', el).value || '').trim());
        };
        desenhar();
      },
    });

    async function enviar(cat, observacao) {
      const itens = Object.entries(escolhidos).filter(([, q]) => q > 0).map(([id, q]) => ({ item_id: Number(id), pedida: q }));
      if (!itens.length) return toast('Ponha ao menos um item, com a quantidade.', 'err');
      try {
        // O gatilho do banco força `de` = quem está logado e a situação
        // 'aberta'; mandar os dois é só para a leitura sair certa.
        const { data, error } = await N.sb.from('orc_alm_requisicao').insert({
          setor: A.setorDe(eu()), deposito_id: cat.deposito.id, de: eu().id, de_nome: eu().nome || '', observacao: observacao || null,
        }).select();
        if (error) throw error;
        if (!data?.length) throw new Error('O servidor não criou o pedido.');
        const req = data[0];
        const r2 = await N.sb.from('orc_alm_requisicao_item').insert(itens.map((i) => ({ ...i, requisicao_id: req.id }))).select();
        if (r2.error) throw r2.error;
        N.registrar('almox_requisicao', `${A.setorDe(eu())}: ${itens.length} item(ns)`);
        toast('Pedido enviado ao almoxarifado, no seu nome.', 'ok');
        UI.voltar();
        if (tela._recarregar) tela._recarregar();
      } catch (e) { toast(N.recado(e), 'err', 5000); }
    }
  }

  /* --------------------------------------------------------- contagem */
  // Para o almoxarife: pedidos novos esperando. Para quem pede: pedidos
  // entregues esperando a confirmação dele.
  async function contar() {
    if (A.entrega(eu())) {
      const { data, error } = await N.sb.from('orc_alm_requisicao').select('id').eq('situacao', 'aberta').limit(1000);
      if (error) throw error;
      return (data || []).length;
    }
    if (A.pede(eu())) {
      const { data, error } = await N.sb.from('orc_alm_requisicao').select('id').eq('situacao', 'enviada').eq('de', eu().id).limit(1000);
      if (error) throw error;
      return (data || []).length;
    }
    return null;
  }

  MODULOS.almoxarifado = {
    chave: 'almoxarifado', nome: 'Almoxarifado', sub: 'Pedir material e entregar pedidos', icone: ICONE,
    precisa: (u) => A.pede(u) || A.veModulo(u),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
