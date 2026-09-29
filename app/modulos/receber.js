/* =====================================================================
   Contas a receber — o dinheiro que ENTRA.

   A MESMA TABELA do Financeiro (orc_fin_lancamentos), com a coluna
   `sentido` = 'receber' dizendo de que lado a linha esta. Por isso TODA
   leitura e toda gravacao daqui filtra por ela: esquecer o sentido soma
   dinheiro que entra com dinheiro que sai, e o numero fica plausivel
   (o porque esta no nuvem/sql/40-receber.sql do programa).

   A permissao e separada do Financeiro de proposito: quem cobra nao e
   quem paga. O visto `receber` alcanca SO as linhas de sentido 'receber',
   e quem confere e a RLS do servidor, nao esta tela.

   So dois status gravados, como no computador: pendente e pago.
   "Atrasado" e "vence em breve" sao calculados na hora do vencimento;
   gravados, ficariam velhos no dia seguinte.

   Nada aqui e cifrado com a chave da clinica: o sigilo do Financeiro
   (`dados_cripto`) mora so no cadastro de prestadores, que este modulo
   nem le. Os anexos do balde `financeiro` sao arquivos comuns.

   O que o celular faz: ver o mes, procurar, dar baixa e desfazer a baixa.
   Criar cobranca (com parcelas), corrigir, apagar, imprimir e exportar
   continuam no computador.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast } = UI;
  const eu = () => N.estado.eu;
  const TABELA = 'orc_fin_lancamentos';
  const RECEBER = 'receber';
  // O balde e o mesmo do Financeiro (35-financeiro.sql); o config.js ainda
  // nao tem o nome, entao ele nasce aqui.
  const BALDE = (window.CFG && CFG.baldeFinanceiro) || 'financeiro';

  // Uma nota com a seta ENTRANDO: o espelho do icone do Financeiro, como
  // o _icone_receber do app.py.
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12.5 9v8"/><path d="M9.5 14l3 3 3-3"/></svg>';

  /* ------------------------------------------------------------------
     Regras puras: as mesmas do financeiro_nucleo.py, sem DOM nem rede.
     ------------------------------------------------------------------ */
  const R = (() => {
    const DIAS_VENCE_LOGO = 7;
    const FORMAS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Outro'];
    const SITUACOES = ['atrasado', 'vence_logo', 'pendente', 'pago'];
    // "Pago" no computador; aqui e dinheiro que ENTROU, e a propria tela de
    // la chama a coluna de "RECEBIDO". O valor gravado continua 'pago'.
    const ROTULO = { pago: 'Recebido', atrasado: 'Atrasado', vence_logo: 'Vence em breve', pendente: 'Pendente' };
    const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    const mesDe = (iso) => String(iso || '').slice(0, 7);
    const mesLegivel = (mes) => {
      const [a, m] = String(mes || '').split('-').map(Number);
      return a && m ? `${NOMES_MES[m - 1]} de ${a}` : String(mes || '');
    };
    const somarMeses = (mes, n) => {
      const [a, m] = mes.split('-').map(Number);
      const t = a * 12 + (m - 1) + n;
      return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
    };
    // "o que foi pago DENTRO deste mes" e outra pergunta que "o que vence
    // neste mes": precisa do primeiro e do ultimo dia.
    const primeiroEUltimo = (mes) => {
      const [a, m] = mes.split('-').map(Number);
      const ultimo = new Date(a, m, 0).getDate();
      return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
    };

    function situacaoDe(l, hoje) {
      if ((l.status || 'pendente') === 'pago') return 'pago';
      if (!l.vencimento) return 'pendente';
      const d = L.diasEntre(hoje, l.vencimento);
      if (d === null) return 'pendente';
      if (d < 0) return 'atrasado';
      if (d <= DIAS_VENCE_LOGO) return 'vence_logo';
      return 'pendente';
    }

    // O que entrou de verdade: o valor recebido quando ha, senao o previsto.
    const valorEfetivo = (l) =>
      (l.status === 'pago' && l.valor_pago !== null && l.valor_pago !== undefined) ? Number(l.valor_pago) || 0 : Number(l.valor) || 0;

    // Os quatro cartoes do computador, com as mesmas contas do resumo_do_mes:
    //   aReceber  pendentes que vencem no mes (pela referencia)
    //   atrasado  pendentes vencidos, de qualquer mes
    //   entrou    recebidos no mes, pela DATA da baixa e pelo valor que entrou
    //   emAberto  todo o pendente, de qualquer mes
    function resumo(lista, mes, hoje) {
      const r = { aReceber: 0, nAReceber: 0, atrasado: 0, nAtrasado: 0, entrou: 0, nEntrou: 0, emAberto: 0 };
      for (const l of lista) {
        const s = situacaoDe(l, hoje);
        if (s === 'pago') {
          if (l.pago_em && mesDe(l.pago_em) === mes) { r.entrou += valorEfetivo(l); r.nEntrou++; }
          continue;
        }
        const v = Number(l.valor) || 0;
        r.emAberto += v;
        if (s === 'atrasado') { r.atrasado += v; r.nAtrasado++; }
        if ((l.mes_referencia || '') === mes) { r.aReceber += v; r.nAReceber++; }
      }
      return r;
    }

    // A busca do computador: todas as palavras, sem acento, nestes campos.
    const CAMPOS_BUSCA = ['fornecedor', 'descricao', 'nf', 'reg', 'observacao', 'categoria', 'centro_custo', 'tipo_lancamento'];
    function passa(l, busca, situacao, hoje) {
      if (busca) {
        const alvo = L.semAcento(CAMPOS_BUSCA.map((c) => l[c] || '').join(' ')).toLowerCase();
        const palavras = L.semAcento(busca).toLowerCase().split(/\s+/).filter(Boolean);
        if (palavras.some((p) => !alvo.includes(p))) return false;
      }
      if (situacao && situacaoDe(l, hoje) !== situacao) return false;
      return true;
    }

    const parcela = (l) => l.parcela_num ? `${l.parcela_num} de ${l.total_parcelas || '?'}` : '';

    // O que vai no log da baixa, como o dar_baixa do nucleo: a diferenca
    // sobre o previsto aparece, porque e ela que alguem procura no fim do mes.
    function etiquetaBaixa(l, recebido) {
      let t = `${l.fornecedor || ''} · ${L.dinheiro(recebido)}`;
      const dif = Math.round((recebido - (Number(l.valor) || 0)) * 100) / 100;
      if (Math.abs(dif) >= 0.01) t += ` (${dif > 0 ? '+' : '-'}${L.dinheiro(Math.abs(dif))} sobre o previsto)`;
      return t;
    }

    return { DIAS_VENCE_LOGO, FORMAS, SITUACOES, ROTULO, mesDe, mesLegivel, somarMeses, primeiroEUltimo,
      situacaoDe, valorEfetivo, resumo, passa, parcela, etiquetaBaixa };
  })();
  window.RECEBER_LOGICA = R;

  const SELO = { pago: 'b-ok', atrasado: 'b-err', vence_logo: 'b-4', pendente: 'b-1' };
  const selo = (s) => `<span class="badge ${SELO[s]}">${esc(R.ROTULO[s])}</span>`;

  /* --------------------------------------------------------- leitura */
  // As tres coisas que o mes precisa, como o Nuvem.listar do computador:
  // as do mes (pela referencia), TODO o pendente de qualquer mes (o atraso
  // antigo nao pode sumir) e o que ENTROU neste mes, tenha vencido quando
  // tiver. Sem o terceiro, uma cobranca de 28/08 recebida em 03/09 sumia
  // dos dois meses.
  async function listar(mes, todos) {
    return N.tudo((de, ate) => {
      let q = N.sb.from(TABELA).select('*').eq('sentido', RECEBER);
      if (!todos) {
        const [ini, fim] = R.primeiroEUltimo(mes);
        q = q.or(`mes_referencia.eq.${mes},status.eq.pendente,and(pago_em.gte.${ini},pago_em.lte.${fim})`);
      }
      return q.order('vencimento', { ascending: true }).order('fornecedor', { ascending: true }).order('id', { ascending: true }).range(de, ate);
    }, 100000);
  }

  /* ------------------------------------------------------------ tela */
  const tela = {
    titulo: 'Contas a receber',
    async desenhar(el) {
      const F = tela._filtro || (tela._filtro = { mes: R.mesDe(L.hojeISO()), todos: false, busca: '', situacao: '' });
      let vivo = true, linhas = [];
      N.registrar('receber_aberto');

      const pintar = () => {
        if (!vivo) return;
        const hoje = L.hojeISO();
        const r = R.resumo(linhas, F.mes, hoje);
        APP.contagens.receber = r.nAtrasado;
        const vis = linhas.filter((l) => R.passa(l, F.busca, F.situacao, hoje));
        const total = vis.reduce((s, l) => s + (Number(l.valor) || 0), 0);
        const mostrar = vis.slice(0, 300);
        const cartao = (rot, v, sub, cor) => `<div class="numero"><b style="font-size:17px${cor ? `;color:${cor}` : ''}">${esc(L.dinheiro(v))}</b><span>${esc(rot)}</span><div class="text-muted pequeno">${esc(sub)}</div></div>`;
        $('#rc-corpo', el).innerHTML = `
          <div class="numeros mb12" style="grid-template-columns:repeat(2,1fr)">
            ${cartao('A receber no mês', r.aReceber, `${r.nAReceber} cobrança(s)`)}
            ${cartao('Atrasado', r.atrasado, `${r.nAtrasado} vencida(s)`, r.atrasado ? 'var(--red)' : '')}
            ${cartao('Entrou no mês', r.entrou, `${r.nEntrou} baixa(s)`, r.entrou ? 'var(--green)' : '')}
            ${cartao('Em aberto', r.emAberto, 'todos os meses')}
          </div>
          <div class="chips"><button type="button" class="chip ${F.situacao ? '' : 'on'}" data-s="">Todas</button>${R.SITUACOES.map((s) => `<button type="button" class="chip ${F.situacao === s ? 'on' : ''} ${s === 'atrasado' ? 'vermelho' : ''}" data-s="${s}">${esc(R.ROTULO[s])}</button>`).join('')}</div>
          <div class="text-muted pequeno mb8">${vis.length} de ${linhas.length} · ${esc(L.dinheiro(total))}${vis.length > 300 ? ' · mostrando 300, refine a busca' : ''}</div>
          ${mostrar.length ? `<div class="lista">${mostrar.map((l) => {
            const s = R.situacaoDe(l, hoje);
            const sub = [l.descricao, R.parcela(l) ? `parcela ${R.parcela(l)}` : '', l.nf ? `NF ${l.nf}` : ''].filter(Boolean).join(' · ');
            return `<button class="linha" type="button" data-id="${esc(l.id)}">
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(l.fornecedor)}</span>${selo(s)}</div>
              ${sub ? `<div class="linha__sub">${esc(sub)}</div>` : ''}</div>
              <div class="linha__dir"><b style="color:${s === 'atrasado' ? 'var(--red)' : 'var(--black)'}">${esc(L.dinheiro(s === 'pago' ? R.valorEfetivo(l) : l.valor))}</b><span>${s === 'pago' ? `entrou ${esc(L.dataBr(l.pago_em))}` : `vence ${esc(L.dataBr(l.vencimento))}`}</span></div></button>`;
          }).join('')}</div>` : UI.vazio('Nada com esses filtros', F.todos ? '' : 'Os meses mudam nas setas lá em cima.')}`;
        $$('[data-s]', el).forEach((b) => { b.onclick = () => { F.situacao = b.dataset.s; pintar(); }; });
        $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(linhas.find((l) => String(l.id) === b.dataset.id), carregar); });
      };

      const cabecalho = () => {
        $('#rc-mes', el).textContent = F.todos ? 'todos os meses' : R.mesLegivel(F.mes);
        $('#rc-todos', el).classList.toggle('on', F.todos);
        $('#rc-ant', el).disabled = F.todos; $('#rc-prox', el).disabled = F.todos;
      };
      const carregar = async () => {
        cabecalho();
        try { linhas = await listar(F.mes, F.todos); pintar(); }
        catch (e) { if (vivo) $('#rc-corpo', el).innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };

      el.innerHTML = `
        <div class="flex items-c gap8 mb8">
          <button class="btn btn-ghost btn-sm" id="rc-ant" type="button" aria-label="Mês anterior" style="width:auto">‹</button>
          <strong id="rc-mes" class="flex1 centro"></strong>
          <button class="btn btn-ghost btn-sm" id="rc-prox" type="button" aria-label="Próximo mês" style="width:auto">›</button>
        </div>
        <div class="chips"><button type="button" class="chip" id="rc-hoje">Este mês</button><button type="button" class="chip" id="rc-todos">Todos os meses</button></div>
        <div class="busca">${UI.ICONES.busca}<input id="rc-busca" placeholder="Cliente, NF, observação, categoria" value="${esc(F.busca)}"></div>
        <div id="rc-corpo"><div class="text-muted centro pequeno">Carregando…</div></div>`;
      $('#rc-ant', el).onclick = () => { F.mes = R.somarMeses(F.mes, -1); carregar(); };
      $('#rc-prox', el).onclick = () => { F.mes = R.somarMeses(F.mes, 1); carregar(); };
      $('#rc-hoje', el).onclick = () => { F.mes = R.mesDe(L.hojeISO()); F.todos = false; carregar(); };
      $('#rc-todos', el).onclick = () => { F.todos = !F.todos; carregar(); };
      let t; $('#rc-busca', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.busca = e.target.value; pintar(); }, 300); };

      await carregar();
      tela._recarregar = carregar;
      return () => { vivo = false; clearTimeout(t); tela._recarregar = null; };
    },
  };

  /* --------------------------------------------------------- detalhe */
  function detalhe(l, depois) {
    if (!l) return;
    const hoje = L.hojeISO();
    const s = R.situacaoDe(l, hoje);
    const pago = s === 'pago';
    const campo = (rot, v) => v ? `<div><dt>${esc(rot)}</dt><dd>${esc(v)}</dd></div>` : '';
    let recebido = '';
    if (pago && l.valor_pago !== null && l.valor_pago !== undefined) {
      const dif = Math.round((Number(l.valor_pago) - (Number(l.valor) || 0)) * 100) / 100;
      recebido = L.dinheiro(l.valor_pago) + (Math.abs(dif) >= 0.01 ? ` (${dif > 0 ? '+' : '-'}${L.dinheiro(Math.abs(dif))} sobre o previsto)` : '');
    }
    const atraso = s === 'atrasado' ? -L.diasEntre(hoje, l.vencimento) : 0;
    const f = UI.folha(`
      <div class="flex gap6" style="flex-wrap:wrap">${selo(s)}${atraso ? ` <span class="badge b-err">há ${atraso} dia(s)</span>` : ''}</div>
      <dl class="ficha mt12">
        ${l.descricao ? `<div class="largo"><dt>Cobrança</dt><dd>${esc(l.descricao)}</dd></div>` : ''}
        ${campo('Valor', L.dinheiro(l.valor))}${campo('Vencimento', L.dataBr(l.vencimento))}
        ${campo('Parcela', R.parcela(l))}${campo('Categoria', l.categoria)}
        ${campo('Nota fiscal', l.nf)}${campo('Mês de referência', R.mesLegivel(l.mes_referencia))}
        ${pago ? `${campo('Recebido', recebido)}${campo('Entrou em', L.dataBr(l.pago_em))}${campo('Forma', l.forma_pagamento)}${campo('Banco / conta', l.banco_conta)}${campo('Baixa por', l.pago_por)}` : ''}
        ${l.observacao ? `<div class="largo"><dt>Observação</dt><dd style="white-space:pre-wrap">${esc(l.observacao)}</dd></div>` : ''}
        <div class="largo"><dt>Última alteração</dt><dd>${esc(L.dataHoraBr(l.atualizado_em))}${l.atualizado_por ? ` por ${esc(l.atualizado_por)}` : ''}</dd></div>
      </dl>
      <div class="acoes mt16">
        ${pago ? `<button class="btn btn-ghost" id="rd-desfazer" type="button">Desfazer recebimento</button>` : `<button class="btn btn-ok" id="rd-recebi" type="button">Recebi</button>`}
        ${l.anexo ? `<button class="btn btn-ghost" id="rd-anexo" type="button">${esc(l.anexo_nome || 'Ver o anexo')}</button>` : ''}
        ${l.nota_anexo ? `<button class="btn btn-ghost" id="rd-nota" type="button">${esc(l.nota_anexo_nome || 'Ver a nota')}</button>` : ''}
      </div>
      <div class="text-muted pequeno mt12">Criar, corrigir e apagar cobrança é no computador.</div>`, { titulo: l.fornecedor || 'Cobrança' });
    const abrir = async (caminho) => { try { await UI.abrirFora(await N.urlAssinada(BALDE, caminho, 900)); } catch (e) { toast(e.message, 'err'); } };
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#rd-anexo', () => abrir(l.anexo));
    on('#rd-nota', () => abrir(l.nota_anexo));
    on('#rd-recebi', () => { f.fechar(); recebi(l, depois); });
    // Pergunta antes, como o computador: o valor, a data e a forma somem.
    on('#rd-desfazer', async () => {
      if (!await UI.confirmar('Voltar esta cobrança para em aberto? O valor recebido, a data e a forma são apagados; a nota anexada fica.', { ok: 'Desfazer', cancelar: 'Voltar', perigo: true, titulo: 'Desfazer recebimento' })) return;
      // O mesmo corpo do Nuvem.reabrir do computador. O filtro por sentido
      // e status faz o servidor recusar ([]) se a linha mudou por la.
      const corpo = { status: 'pendente', valor_pago: null, pago_em: null, forma_pagamento: '', banco_conta: '', pago_por: '', atualizado_por: eu().nome || '' };
      try {
        await N.mudar(TABELA, { id: l.id, sentido: RECEBER, status: 'pago' }, corpo);
        N.registrar('fin_baixa_desfeita', l.fornecedor || '');
        toast('Voltou para em aberto.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  /* ------------------------------------------------------------ baixa */
  // PERGUNTA O VALOR DE VERDADE, como a JanelaRecebimento: cliente que paga
  // com desconto, com juros ou a menos e o normal, e uma baixa que assume o
  // previsto esconde a diferenca que alguem vai procurar no fim do mes.
  function recebi(l, depois) {
    const previsto = (Number(l.valor) || 0).toFixed(2).replace('.', ',');
    const f = UI.folha(`<form id="rb">
      <p class="text-muted pequeno">previsto ${esc(L.dinheiro(l.valor))}${l.descricao ? ` · ${esc(l.descricao)}` : ''}</p>
      <div class="row-2 mt12">
        <div class="fg"><label for="rb-valor">Quanto entrou (R$)</label><input id="rb-valor" inputmode="decimal" required value="${esc(previsto)}"></div>
        <div class="fg"><label for="rb-data">Entrou em</label><input id="rb-data" type="date" required value="${esc(L.hojeISO())}"></div>
      </div>
      <div class="row-2">
        <div class="fg"><label for="rb-forma">Forma</label><select id="rb-forma">${UI.opcoes(R.FORMAS, R.FORMAS[0])}</select></div>
        <div class="fg"><label for="rb-banco">Banco / conta</label><input id="rb-banco" maxlength="60"></div>
      </div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Confirmar</button></div></form>`, { titulo: `Recebi · ${l.fornecedor || ''}` });
    $('#rb', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const txt = $('#rb-valor', f.caixa).value;
      // O L.lerDinheiro devolve 0 para lixo; zero pode ser verdade (o
      // computador aceita), entao o que se confere e se ha algum digito.
      if (!/\d/.test(txt)) return toast('O valor precisa ser um número.', 'err');
      const valor = L.lerDinheiro(txt);
      if (valor < 0) return toast('O valor precisa ser um número.', 'err');
      const quando = $('#rb-data', f.caixa).value;
      if (!quando) return toast('Diga em que dia entrou.', 'err');
      const quem = eu().nome || '';
      // O corpo do Nuvem.dar_baixa, coluna a coluna. Banco/conta em CAIXA
      // ALTA, como o computador grava.
      const corpo = {
        status: 'pago', valor_pago: valor, pago_em: quando,
        forma_pagamento: $('#rb-forma', f.caixa).value || '',
        banco_conta: $('#rb-banco', f.caixa).value.split(/\s+/).filter(Boolean).join(' ').toUpperCase(),
        pago_por: quem, atualizado_por: quem,
      };
      try {
        // status 'pendente' no filtro: se alguem ja deu baixa pelo
        // computador, o servidor devolve [] e a segunda baixa nao acontece.
        await N.mudar(TABELA, { id: l.id, sentido: RECEBER, status: 'pendente' }, corpo);
        N.registrar('fin_baixa', R.etiquetaBaixa(l, valor));
        toast('Recebimento lançado.', 'ok'); f.fechar(); depois();
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  /* ------------------------------------------------------------ contar */
  // Quantas cobrancas vencidas e nao recebidas. O servidor conta (head),
  // entao o teto de 1.000 linhas nao entra na conta.
  async function contar() {
    if (!L.temModulo(eu(), 'receber')) return null;
    const { count, error } = await N.sb.from(TABELA).select('id', { count: 'exact', head: true })
      .eq('sentido', RECEBER).eq('status', 'pendente').lt('vencimento', L.hojeISO());
    if (error) throw error;
    return typeof count === 'number' ? count : null;
  }

  MODULOS.receber = {
    chave: 'receber', nome: 'Contas a receber', sub: 'O dinheiro que entra', icone: ICONE,
    precisa: (u) => L.temModulo(u, 'receber'),
    abrir: (comoAba) => comoAba ? UI.raiz(tela, 'receber') : UI.ir(tela),
    contar,
  };
})();
