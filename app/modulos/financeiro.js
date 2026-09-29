/* =====================================================================
   Financeiro (contas a pagar): a mesma tabela orc_fin_lancamentos do
   programa do computador (financeiro_nucleo.py / financeiro_tela.py).

   Uma tabela so para o que vence: conta de fornecedor, pagamento de
   prestador e parcela de acordo. A coluna `origem` diz de onde veio, e a
   coluna `sentido` separa o que se paga do que se recebe; TODA leitura
   daqui filtra `sentido = pagar`, senao soma dinheiro que entra com
   dinheiro que sai e o numero fica plausivel (40-receber.sql).

   So existem dois status gravados: pendente e pago. "Atrasado" e "vence
   em breve" sao calculados na hora a partir do vencimento, igual ao
   computador: gravados, ficariam velhos no dia seguinte.

   O sigilo do prestador (CPF, PIX, banco) mora cifrado em
   orc_fin_prestadores.dados_cripto, com a chave da clinica. O celular nao
   tem essa chave: aqui nem se le a tabela de prestadores, e a ficha avisa
   que os dados bancarios so aparecem no computador.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const BALDE = 'financeiro';

  // Sem dados_cripto e sem contrato_id: o que a tela nao usa nao desce.
  const CAMPOS = 'id,origem,fornecedor,descricao,prestador_id,acordo_id,parcela_num,total_parcelas,tipo_lancamento,tipo_despesa,centro_custo,categoria,reg,nf,data_nf,valor,vencimento,mes_referencia,status,valor_pago,pago_em,forma_pagamento,banco_conta,pago_por,observacao,anexo,anexo_nome,nota_anexo,nota_anexo_nome,origem_dado,criado_em,criado_por,atualizado_em,atualizado_por,sentido,nao_repetir';

  // Uma nota de dinheiro, no traco dos icones do ui.js.
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>';

  /* ------------------------------------------------------------------
     REGRAS PURAS, sem DOM nem rede, espelho do financeiro_nucleo.py.
     Moram aqui (e nao no logica.js) para o modulo ser um arquivo so;
     ficam em window.FIN_LOGICA para os testes alcancarem.
     ------------------------------------------------------------------ */
  const F = {
    ORIGENS: { fornecedor: 'Conta', prestador: 'Prestador', acordo: 'Acordo' },
    PAGAR: 'pagar',
    TIPOS_DESPESA: ['Fixo', 'Variável'],
    FORMAS_PAGAMENTO: ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Outro'],
    ROTULO_SITUACAO: { pago: 'Pago', atrasado: 'Atrasado', vence_logo: 'Vence em breve', pendente: 'Pendente' },
    DIAS_VENCE_LOGO: 7,
    PARTES_QUE_MUDAM: ['lancar', 'baixar', 'cadastros', 'apagar'],
    LIMITE_ARQUIVO: 25 * 1024 * 1024,
  };

  // O que esta marcado no cadastro, aceitando lista ou texto com virgula,
  // como o _marcados() do nucleo.
  F.marcados = (u) => {
    let m = u?.modulos || [];
    if (typeof m === 'string') m = m.replace(/;/g, ',').split(',');
    return new Set((Array.isArray(m) ? m : []).map((x) => String(x).trim()).filter(Boolean));
  };

  // O visto "Ver" e o da contabilidade: marcado, ele GANHA dos outros. O
  // administrador nunca e so leitura (so_leitura do nucleo).
  F.soLeitura = (u) => !u?.admin && F.marcados(u).has('financeiro:ver');

  // pode() do nucleo: admin faz tudo; o "Ver" tranca as partes que mudam.
  F.pode = (u, parte) => {
    if (u?.admin) return true;
    if (F.PARTES_QUE_MUDAM.includes(parte) && F.soLeitura(u)) return false;
    return F.marcados(u).has(`financeiro:${parte}`);
  };

  // pago / atrasado / vence_logo / pendente (situacao_de do nucleo).
  F.situacaoDe = (l, hoje) => {
    if ((l.status || 'pendente') === 'pago') return 'pago';
    if (!l.vencimento) return 'pendente';
    const d = L.diasEntre(hoje, l.vencimento);
    if (d < 0) return 'atrasado';
    if (d <= F.DIAS_VENCE_LOGO) return 'vence_logo';
    return 'pendente';
  };

  // O que saiu do caixa: o valor pago quando ha, senao o previsto.
  F.valorEfetivo = (l) => (l.status === 'pago' && l.valor_pago !== null && l.valor_pago !== undefined)
    ? Number(l.valor_pago) || 0 : Number(l.valor) || 0;

  // normalizar() do nucleo: sem acento, sem espaco nas pontas, minusculo.
  // NAO e o L.normalizar, que troca pontuacao por espaco e sobe a caixa.
  F.normalizar = (s) => L.semAcento(s).trim().toLowerCase();

  // caixa_alta(): fornecedor, centro de custo, NF e banco sempre em
  // maiusculas, como a planilha antiga escrevia.
  F.caixaAlta = (s) => String(s ?? '').split(/\s+/).join(' ').trim().toUpperCase();

  // passa() do nucleo, so a busca: todas as palavras precisam estar nos
  // mesmos campos que o computador procura.
  F.casaBusca = (l, busca) => {
    const palavras = F.normalizar(busca).split(/\s+/).filter(Boolean);
    if (!palavras.length) return true;
    const alvo = F.normalizar(['fornecedor', 'descricao', 'nf', 'reg', 'observacao', 'categoria', 'centro_custo', 'tipo_lancamento']
      .map((c) => String(l[c] ?? '')).join(' '));
    return palavras.every((p) => alvo.includes(p));
  };

  F.mesDe = (iso) => String(iso || '').slice(0, 7);
  F.somarMeses = (mes, n) => {
    const [a, m] = mes.split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  F.primeiroEUltimoDia = (mes) => {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
  };
  F.mesLegivel = (mes) => {
    const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const [a, m] = String(mes || '').split('-');
    return nomes[Number(m) - 1] ? `${nomes[Number(m) - 1]} de ${a}` : String(mes || '');
  };
  // vencimento_no_mes(): o dia preso ao ultimo que o mes tem.
  F.vencimentoNoMes = (mes, dia) => {
    const [, ultimo] = F.primeiroEUltimoDia(mes);
    const d = Math.max(1, Math.min(Number(dia) || 1, Number(ultimo.slice(8))));
    return `${mes}-${String(d).padStart(2, '0')}`;
  };

  // As quatro vistas do celular, todas a partir da mesma leitura.
  //   hoje:    pendentes vencidas ou que vencem hoje (o que cobra agora)
  //   semana:  pendentes dos proximos 7 dias, sem contar hoje
  //   mes:     tudo o que vence no mes (mes_referencia), pago ou nao
  //   pagas:   o que foi PAGO no mes, pela data do pagamento, como o
  //            cartao "Total pago" do computador conta
  F.daVista = (lista, vista, mes, hoje) => lista.filter((l) => {
    const pago = l.status === 'pago';
    if (vista === 'hoje') return !pago && !!l.vencimento && L.diasEntre(hoje, l.vencimento) <= 0;
    if (vista === 'semana') { if (pago || !l.vencimento) return false; const d = L.diasEntre(hoje, l.vencimento); return d >= 1 && d <= F.DIAS_VENCE_LOGO; }
    if (vista === 'mes') return (l.mes_referencia || '') === mes;
    if (vista === 'pagas') return pago && F.mesDe(l.pago_em) === mes;
    return true;
  });

  // Soma do que a vista mostra: pendente pelo previsto, paga pelo pago.
  F.totais = (lista) => {
    const r = { total: 0, pendente: 0, pago: 0, quantos: lista.length, pendentes: 0, pagas: 0, atrasadas: 0 };
    for (const l of lista) {
      const v = F.valorEfetivo(l);
      r.total += v;
      if (l.status === 'pago') { r.pago += v; r.pagas += 1; } else { r.pendente += v; r.pendentes += 1; }
    }
    for (const k of ['total', 'pendente', 'pago']) r[k] = Math.round(r[k] * 100) / 100;
    return r;
  };

  // chave_de_duplicata(): Reg. quando ha; senao fornecedor + vencimento + valor.
  F.chaveDeDuplicata = (l) => {
    const reg = String(l.reg || '').trim();
    if (reg) return `reg:${reg}`;
    return [F.normalizar(l.fornecedor), String(l.vencimento || '').slice(0, 10), (Number(l.valor) || 0).toFixed(2)].join('|');
  };

  // A frase do log da baixa, igual a do dar_baixa() do nucleo: diz quando
  // o valor pago fugiu do previsto (juros, multa, desconto).
  F.etiquetaDaBaixa = (l, valorPago) => {
    let s = `${l.fornecedor || ''} · ${L.dinheiro(valorPago)}`;
    const dif = Math.round((Number(valorPago) - (Number(l.valor) || 0)) * 100) / 100;
    if (Math.abs(dif) >= 0.01) s += ` (${dif > 0 ? '+' : '−'}${L.dinheiro(Math.abs(dif))} sobre o previsto)`;
    return s;
  };

  // _para_banco() do nucleo para uma conta NOVA de fornecedor: todas as
  // colunas que o computador manda, com os mesmos padroes. Texto vazio vai
  // como '' (e nao null) porque e assim que o computador grava.
  F.novaConta = (d, quem) => ({
    origem: 'fornecedor', fornecedor: F.caixaAlta(d.fornecedor) || '(sem nome)', descricao: '',
    prestador_id: null, acordo_id: null, parcela_num: null, total_parcelas: null,
    tipo_lancamento: '', tipo_despesa: d.tipo_despesa || '',
    centro_custo: F.caixaAlta(d.centro_custo), categoria: String(d.categoria || '').trim(),
    reg: '', nf: F.caixaAlta(d.nf), data_nf: d.data_nf || null,
    valor: Math.round((Number(d.valor) || 0) * 100) / 100,
    vencimento: d.vencimento, mes_referencia: F.mesDe(d.vencimento),
    status: 'pendente', valor_pago: null, pago_em: null, forma_pagamento: '', banco_conta: '', pago_por: '',
    observacao: String(d.observacao || '').trim().slice(0, 200),
    anexo: d.anexo || null, anexo_nome: d.anexo_nome || null, nota_anexo: null, nota_anexo_nome: null,
    origem_dado: 'sistema', sentido: F.PAGAR, contrato_id: null, nao_repetir: !!d.nao_repetir,
    criado_por: quem || '', atualizado_por: quem || '',
  });

  // O que JanelaConta.salvar() recusa, na mesma ordem e com as mesmas frases.
  F.validarConta = (d) => {
    if (!F.caixaAlta(d.fornecedor)) return 'Escreva o fornecedor.';
    if (!(Number(d.valor) > 0)) return 'O valor precisa ser um número maior que zero.';
    if (!d.vencimento) return 'Informe o vencimento.';
    return '';
  };

  // Mesmo caminho do subir_anexo() do nucleo: <uid>/<12 hex>-<nome limpo>.
  F.caminhoAnexo = (uid, nome, hex12) => L.caminhoAnexo(uid, nome, hex12);

  window.FIN_LOGICA = F;

  /* ------------------------------------------------------------ rede */
  // A mesma pergunta do listar(mes) do computador: o que vence no mes, TODO
  // o pendente (o atraso antigo nao pode sumir) e o que foi pago no mes,
  // tenha vencido quando tiver. As quatro vistas saem desta leitura.
  async function listar(mes) {
    const [primeiro, ultimo] = F.primeiroEUltimoDia(mes);
    return N.tudo((de, ate) => N.sb.from('orc_fin_lancamentos').select(CAMPOS)
      .eq('sentido', F.PAGAR)
      .or(`mes_referencia.eq.${mes},status.eq.pendente,and(pago_em.gte.${primeiro},pago_em.lte.${ultimo})`)
      .order('vencimento', { ascending: true }).order('fornecedor', { ascending: true })
      .range(de, ate));
  }

  async function nomesAtivos(tabela, filtro) {
    try {
      const linhas = await N.tudo((de, ate) => {
        let q = N.sb.from(tabela).select('nome').eq('ativo', true);
        if (filtro) q = filtro(q);
        return q.order('nome').range(de, ate);
      });
      return [...new Set(linhas.map((l) => l.nome).filter(Boolean))];
    } catch { return []; } // sem a lista, o campo continua aceitando texto
  }

  async function abrirAnexo(caminho) {
    try { await UI.abrirFora(await N.urlAssinada(BALDE, caminho, 900)); }
    catch (e) { toast(N.recado(e), 'err'); }
  }

  /* ------------------------------------------------------------ tela */
  const SELO = { pago: 'b-ok', atrasado: 'b-err', vence_logo: 'b-4', pendente: 'b-1' };
  const VISTAS = [['hoje', 'Hoje e atrasadas'], ['semana', 'Próximos 7 dias'], ['mes', 'Do mês'], ['pagas', 'Pagas']];

  function prazoTexto(l, hoje) {
    if (l.status === 'pago') return l.pago_em ? `pago em ${L.dataBr(l.pago_em)}` : 'pago';
    const d = L.diasEntre(hoje, l.vencimento);
    if (d === null) return '';
    return d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : d === -1 ? 'venceu ontem' : d < 0 ? `venceu há ${-d} dias` : `vence em ${d} dias`;
  }

  const tela = {
    titulo: 'Financeiro',
    aoTopo(dir) {
      dir.innerHTML = '';
      if (F.pode(eu(), 'lancar')) dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => novaConta(), 'Nova conta'));
    },
    async desenhar(el) {
      let vista = 'hoje', origem = '', busca = '', vivo = true;
      let mes = F.mesDe(L.hojeISO());
      N.registrar('fin_aberto');
      const desenharLista = async () => {
        if (!vivo) return;
        try {
          const hoje = L.hojeISO();
          const todas = await listar(mes);
          tela._todas = todas;
          APP.contagens.financeiro = todas.filter((l) => l.status !== 'pago' && l.vencimento && L.diasEntre(hoje, l.vencimento) <= 0).length;
          let lista = F.daVista(todas, vista, mes, hoje);
          if (origem) lista = lista.filter((l) => (l.origem || 'fornecedor') === origem);
          if (busca) lista = lista.filter((l) => F.casaBusca(l, busca));
          if (vista === 'pagas') lista.sort((a, b) => String(b.pago_em || '').localeCompare(String(a.pago_em || '')));
          const t = F.totais(lista);
          const atrasadas = lista.filter((l) => F.situacaoDe(l, hoje) === 'atrasado');
          const comMes = vista === 'mes' || vista === 'pagas';
          const numero = (valor, rotulo, cor = '') => `<div class="numero"><b style="font-size:15px${cor ? `;color:${cor}` : ''}">${esc(L.dinheiro(valor))}</b><span>${esc(rotulo)}</span></div>`;
          el.innerHTML = `
            ${F.soLeitura(eu()) ? '<div class="aviso info">Somente leitura: você vê o Financeiro inteiro, mas não altera nada.</div>' : ''}
            <div class="chips">${VISTAS.map(([v, r]) => `<button class="chip ${vista === v ? 'on' : ''}" type="button" data-vista="${v}">${esc(r)}</button>`).join('')}</div>
            ${comMes ? `<div class="flex items-c gap8"><button class="btn btn-ghost btn-sm" type="button" id="fin-mes-ant" aria-label="Mês anterior">‹</button><div class="flex1 centro fw7">${esc(F.mesLegivel(mes))}</div><button class="btn btn-ghost btn-sm" type="button" id="fin-mes-seg" aria-label="Mês seguinte">›</button></div>` : ''}
            <div class="numeros">
              ${vista === 'pagas' ? numero(t.pago, `${t.pagas} paga(s)`, 'var(--green)')
                : vista === 'mes' ? `${numero(t.pendente, `${t.pendentes} a pagar`)}${numero(t.pago, `${t.pagas} paga(s)`, 'var(--green)')}`
                : numero(t.pendente, `${t.pendentes} a pagar`)}
              ${vista === 'pagas' || vista === 'semana' ? '' : numero(atrasadas.reduce((s, l) => s + (Number(l.valor) || 0), 0), `${atrasadas.length} atrasada(s)`, atrasadas.length ? 'var(--red)' : '')}
              ${vista === 'mes' ? '' : numero(t.total, 'total da lista')}
            </div>
            <div class="chips"><button class="chip ${origem ? '' : 'on'}" type="button" data-origem="">Todas</button>${Object.entries(F.ORIGENS).map(([o, r]) => `<button class="chip ${origem === o ? 'on' : ''}" type="button" data-origem="${o}">${esc(r)}s</button>`).join('')}</div>
            <div class="busca">${ICONES.busca}<input id="fin-busca" placeholder="Procurar fornecedor, NF, categoria" value="${esc(busca)}"></div>
            ${lista.length ? `<div class="lista">${lista.map((l) => {
              const s = F.situacaoDe(l, hoje);
              return `<button class="linha" type="button" data-id="${esc(l.id)}">
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(l.fornecedor || '(sem nome)')}</span><span class="badge ${SELO[s]}">${esc(F.ROTULO_SITUACAO[s])}</span></div>
                <div class="linha__sub">${esc(F.ORIGENS[l.origem] || 'Conta')} · ${esc(L.dataBr(l.vencimento))} (${esc(prazoTexto(l, hoje))})</div>
                <div class="linha__sub">${esc([l.descricao, l.categoria || l.centro_custo].filter(Boolean).join(' · '))}</div></div>
                <div class="linha__dir"><b style="font-size:14px;color:${s === 'atrasado' ? 'var(--red)' : 'var(--text)'}">${esc(L.dinheiro(F.valorEfetivo(l)))}</b></div>${ICONES.seta}</button>`;
            }).join('')}</div>` : UI.vazio(vista === 'hoje' ? 'Nada vencido nem vencendo hoje' : 'Nenhuma conta aqui', busca ? 'Tente outra busca.' : '')}`;
          $$('[data-vista]', el).forEach((b) => { b.onclick = () => { vista = b.dataset.vista; desenharLista(); }; });
          $$('[data-origem]', el).forEach((b) => { b.onclick = () => { origem = b.dataset.origem; desenharLista(); }; });
          const ant = $('#fin-mes-ant', el), seg = $('#fin-mes-seg', el);
          if (ant) ant.onclick = () => { mes = F.somarMeses(mes, -1); desenharLista(); };
          if (seg) seg.onclick = () => { mes = F.somarMeses(mes, 1); desenharLista(); };
          const inp = $('#fin-busca', el);
          let tm; inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenharLista().then(() => { const i2 = $('#fin-busca', el); if (i2) { i2.focus(); i2.setSelectionRange(pos, pos); } }); }, 350); };
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((l) => String(l.id) === b.dataset.id), desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      tela._mes = () => mes;
      await desenharLista();
      const relogio = setInterval(() => { if (!document.hidden && !busca) desenharLista(); }, 60000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; tela._todas = null; tela._mes = null; };
    },
  };

  /* ---------------------------------------------------------- ficha */
  function detalhe(l, depois) {
    if (!l) return;
    const hoje = L.hojeISO();
    const s = F.situacaoDe(l, hoje);
    const pago = l.status === 'pago';
    const podeBaixar = F.pode(eu(), 'baixar');
    const quem = l.origem === 'prestador' ? 'Prestador' : l.origem === 'acordo' ? 'Acordo' : 'Fornecedor';
    const item = (rotulo, valor, largo = false) => valor ? `<div${largo ? ' class="largo"' : ''}><dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd></div>` : '';
    const f = UI.folha(`
      <div><span class="badge ${SELO[s]}">${esc(F.ROTULO_SITUACAO[s])}</span> <span class="badge b-gray">${esc(F.ORIGENS[l.origem] || 'Conta')}</span>${l.tipo_despesa ? ` <span class="badge b-gray">${esc(l.tipo_despesa)}</span>` : ''}</div>
      <dl class="ficha mt12">
        ${item(quem, l.fornecedor, true)}
        ${item('Descrição', l.descricao, true)}
        ${item('Valor', L.dinheiro(l.valor))}
        ${item('Vencimento', `${L.dataBr(l.vencimento)}${pago ? '' : ` (${prazoTexto(l, hoje)})`}`)}
        ${item('Categoria', l.categoria)}
        ${item('Centro de custo', l.centro_custo)}
        ${item('Tipo', l.tipo_lancamento)}
        ${l.parcela_num ? item('Parcela', `${l.parcela_num} de ${l.total_parcelas || '?'}`) : ''}
        ${item('NF / documento', l.nf)}
        ${item('Data da NF', L.dataBr(l.data_nf))}
        ${item('Situação', F.ROTULO_SITUACAO[s])}
        ${item('Mês de referência', F.mesLegivel(l.mes_referencia))}
        ${pago ? `${item('Valor pago', L.dinheiro(l.valor_pago ?? l.valor))}${item('Pago em', L.dataBr(l.pago_em))}${item('Forma', l.forma_pagamento)}${item('Banco / conta', l.banco_conta)}${item('Pago por', l.pago_por, true)}` : ''}
        ${item('Observação', l.observacao, true)}
      </dl>
      ${l.origem === 'prestador' ? '<div class="aviso info mt12">Dados bancários do prestador (CPF, PIX, banco) só no computador: ficam cifrados com a chave da clínica, que não vem para o celular.</div>' : ''}
      ${l.anexo || l.nota_anexo ? `<div class="secao mt12">Anexos</div><div class="acoes mt8">
        ${l.anexo ? `<button class="btn btn-ghost" type="button" id="fd-anexo">${ICONES.anexo} ${esc(l.anexo_nome || 'Boleto / documento')}</button>` : ''}
        ${l.nota_anexo ? `<button class="btn btn-ghost" type="button" id="fd-nota">${ICONES.anexo} ${esc(l.nota_anexo_nome || 'Nota / comprovante')}</button>` : ''}
      </div>` : ''}
      <div class="acoes mt16">
        ${podeBaixar && !pago ? '<button class="btn btn-ok" id="fd-baixa" type="button">Dar baixa</button>' : ''}
        ${podeBaixar && pago ? '<button class="btn btn-ghost" id="fd-desfazer" type="button">Desfazer baixa</button>' : ''}
      </div>
      ${podeBaixar ? '' : '<p class="pequeno text-muted mt12">Você vê esta ficha, mas não altera.</p>'}`, { titulo: l.fornecedor || 'Conta a pagar' });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#fd-anexo', () => abrirAnexo(l.anexo));
    on('#fd-nota', () => abrirAnexo(l.nota_anexo));
    on('#fd-baixa', () => { f.fechar(); darBaixa(l, depois); });
    // O computador pergunta antes (desfazer_baixa, askyesno): apaga o valor
    // pago, a data e a forma. A nota anexada fica.
    on('#fd-desfazer', async () => {
      if (!await UI.confirmar('Voltar esta conta para PENDENTE? O valor pago, a data e a forma são apagados; a nota anexada fica.', { ok: 'Desfazer baixa', cancelar: 'Voltar', titulo: 'Desfazer baixa' })) return;
      try {
        await N.mudar('orc_fin_lancamentos', { id: l.id, sentido: F.PAGAR }, {
          status: 'pendente', valor_pago: null, pago_em: null, forma_pagamento: '', banco_conta: '', pago_por: '',
          atualizado_por: eu().nome || '',
        });
        N.registrar('fin_baixa_desfeita', l.fornecedor || '');
        toast('Baixa desfeita. A conta voltou a pendente.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  /* ----------------------------------------------------------- baixa */
  // O banco que o computador sugere: o da ultima conta paga que tinha um.
  function ultimoBanco() {
    const pagas = (tela._todas || []).filter((x) => x.banco_conta && x.pago_em).sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em)));
    return pagas.length ? pagas[0].banco_conta : '';
  }

  function darBaixa(l, depois) {
    if (!F.pode(eu(), 'baixar')) return toast('Você não tem o visto de dar baixa.', 'err');
    let arquivo = null;
    const previsto = (Number(l.valor) || 0).toFixed(2).replace('.', ',');
    const f = UI.folha(`<form id="fb">
      <p class="pequeno text-muted">Previsto ${esc(L.dinheiro(l.valor))}, vence ${esc(L.dataBr(l.vencimento))}.</p>
      <div class="row-2 mt12">
        <div class="fg"><label>Valor pago (R$)</label><input id="fb-valor" inputmode="decimal" required value="${esc(previsto)}"><div class="dica">Mude se houve juros, multa ou desconto.</div></div>
        <div class="fg"><label>Data do pagamento</label><input id="fb-data" type="date" required value="${esc(L.hojeISO())}"></div>
      </div>
      <div class="row-2">
        <div class="fg"><label>Forma</label><select id="fb-forma">${UI.opcoes(F.FORMAS_PAGAMENTO, 'PIX')}</select></div>
        <div class="fg"><label>Banco / conta</label><input id="fb-banco" maxlength="80" value="${esc(ultimoBanco())}"></div>
      </div>
      <div class="fg"><label>Nota fiscal / comprovante</label>
        <div class="flex items-c gap8"><button class="btn btn-ghost btn-sm" type="button" id="fb-arq">${ICONES.anexo} Escolher</button><span class="pequeno text-muted flex1" id="fb-arq-nome">sem arquivo</span></div>
        <div class="dica">Foto ou PDF, até 25 MB. Opcional.</div></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Confirmar a baixa</button></div></form>`, { titulo: `Dar baixa: ${l.fornecedor || ''}` });
    $('#fb-arq', f.caixa).onclick = async () => {
      const a = await UI.escolherArquivo('application/pdf,image/*');
      if (!a) return;
      if (a.size <= 0) return toast('Esse arquivo está vazio.', 'err');
      if (a.size > F.LIMITE_ARQUIVO) return toast('O arquivo passa de 25 MB.', 'err');
      arquivo = a;
      $('#fb-arq-nome', f.caixa).textContent = a.name;
    };
    $('#fb', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const bruto = $('#fb-valor', f.caixa).value;
      if (!/\d/.test(bruto)) return toast('Informe o valor pago.', 'err');
      const valorPago = L.lerDinheiro(bruto);
      if (valorPago < 0) return toast('O valor pago precisa ser um número.', 'err');
      const pagoEm = $('#fb-data', f.caixa).value;
      if (!pagoEm) return toast('Informe a data do pagamento.', 'err');
      const corpo = {
        status: 'pago', valor_pago: Math.round(valorPago * 100) / 100, pago_em: pagoEm,
        forma_pagamento: $('#fb-forma', f.caixa).value || '', banco_conta: F.caixaAlta($('#fb-banco', f.caixa).value),
        pago_por: eu().nome || '', atualizado_por: eu().nome || '',
      };
      UI.carregando(true, arquivo ? 'Subindo o comprovante…' : 'Dando baixa…');
      try {
        // O arquivo sobe antes, como no computador: se ele falhar, a
        // conta nao fica paga sem o comprovante que a pessoa escolheu.
        if (arquivo) {
          const caminho = F.caminhoAnexo(N.estado.id, arquivo.name, N.hex12());
          await N.subir(BALDE, caminho, arquivo);
          corpo.nota_anexo = caminho;
          corpo.nota_anexo_nome = arquivo.name;
        }
        await N.mudar('orc_fin_lancamentos', { id: l.id, sentido: F.PAGAR }, corpo);
        N.registrar('fin_baixa', F.etiquetaDaBaixa(l, corpo.valor_pago));
        toast('Baixa dada.', 'ok'); f.fechar(); depois();
      } catch (err) { toast(N.recado(err), 'err'); }
      finally { UI.carregando(false); }
    };
  }

  /* ------------------------------------------------------ nova conta */
  // So conta de FORNECEDOR, como o "Nova conta" do computador. Pagamento de
  // prestador e parcela de acordo nascem do cadastro deles, que precisa do
  // sigilo (prestador) ou gera varias parcelas (acordo): ficam no computador.
  async function novaConta() {
    if (!F.pode(eu(), 'lancar')) return toast('Você não tem o visto de lançar contas.', 'err');
    const [centros, categorias] = await Promise.all([
      nomesAtivos('orc_fin_centros_custo'),
      nomesAtivos('orc_fin_categorias', (q) => q.eq('tipo', 'despesa')),
    ]);
    const mes = tela._mes ? tela._mes() : F.mesDe(L.hojeISO());
    let arquivo = null;
    const f = UI.folha(`<form id="fn">
      <div class="fg"><label>Fornecedor</label><input id="fn-forn" maxlength="200" required autocapitalize="characters"></div>
      <div class="row-2">
        <div class="fg"><label>Valor (R$)</label><input id="fn-valor" inputmode="decimal" required placeholder="0,00"></div>
        <div class="fg"><label>Vencimento</label><input id="fn-venc" type="date" required value="${esc(F.vencimentoNoMes(mes, 10))}"></div>
      </div>
      <div class="row-2">
        <div class="fg"><label>Tipo</label><select id="fn-tipo">${UI.opcoes(F.TIPOS_DESPESA, 'Variável')}</select></div>
        <div class="fg"><label>Categoria</label><input id="fn-cat" list="fn-cat-l" maxlength="120"><datalist id="fn-cat-l">${categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      </div>
      <div class="fg"><label>Centro de custo</label><input id="fn-cc" list="fn-cc-l" maxlength="120" autocapitalize="characters"><datalist id="fn-cc-l">${centros.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="row-2">
        <div class="fg"><label>NF / documento</label><input id="fn-nf" maxlength="60" autocapitalize="characters"></div>
        <div class="fg"><label>Data da NF</label><input id="fn-datanf" type="date"></div>
      </div>
      <div class="fg"><label>Observações (até 200 letras)</label><input id="fn-obs" maxlength="200"></div>
      <label class="visto"><input type="checkbox" id="fn-naorep"> Não repetir nos próximos meses (encerra esta conta fixa)</label>
      <div class="fg"><label>Boleto / documento</label>
        <div class="flex items-c gap8"><button class="btn btn-ghost btn-sm" type="button" id="fn-arq">${ICONES.anexo} Escolher</button><span class="pequeno text-muted flex1" id="fn-arq-nome">sem arquivo</span></div></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div></form>`, { titulo: 'Nova conta' });
    $('#fn-arq', f.caixa).onclick = async () => {
      const a = await UI.escolherArquivo('application/pdf,image/*');
      if (!a) return;
      if (a.size <= 0) return toast('Esse arquivo está vazio.', 'err');
      if (a.size > F.LIMITE_ARQUIVO) return toast('O arquivo passa de 25 MB.', 'err');
      arquivo = a;
      $('#fn-arq-nome', f.caixa).textContent = a.name;
    };
    $('#fn', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $(id, f.caixa).value;
      const dados = {
        fornecedor: v('#fn-forn'), valor: L.lerDinheiro(v('#fn-valor')), vencimento: v('#fn-venc'),
        tipo_despesa: v('#fn-tipo'), categoria: v('#fn-cat'), centro_custo: v('#fn-cc'),
        nf: v('#fn-nf'), data_nf: v('#fn-datanf') || null, observacao: v('#fn-obs'),
        nao_repetir: $('#fn-naorep', f.caixa).checked,
      };
      const erro = F.validarConta(dados);
      if (erro) return toast(erro, 'err');
      const corpo = F.novaConta(dados, eu().nome);
      // Conta repetida: PERGUNTA, nao bloqueia (_passa_pela_repetida). Duas
      // parcelas iguais no mesmo dia existem; o silencio e que nao podia.
      // Pergunta ao servidor pelo vencimento e compara a chave aqui, porque
      // o filtro do PostgREST nao normaliza o nome. Se a consulta falhar,
      // segue: a conferencia e ajuda, e internet ruim nao impede lancar.
      try {
        const { data } = await N.sb.from('orc_fin_lancamentos').select(CAMPOS)
          .eq('vencimento', corpo.vencimento).eq('sentido', F.PAGAR).limit(200);
        const alvo = F.chaveDeDuplicata(corpo);
        const igual = (data || []).find((x) => F.chaveDeDuplicata(x) === alvo);
        if (igual && !await UI.confirmar(`Já existe uma conta igual a esta: ${igual.fornecedor || '(sem fornecedor)'}, ${L.dinheiro(igual.valor)}, vence ${L.dataBr(igual.vencimento)}, ${igual.status === 'pago' ? 'já está paga' : 'está em aberto'}. Lançar assim mesmo? Duas parcelas iguais no mesmo dia existem, mas conferir agora evita fechar o mês com uma despesa a mais.`, { ok: 'Lançar assim mesmo', cancelar: 'Não lançar', titulo: 'Conta repetida' })) return;
      } catch { /* sem a conferencia, segue */ }
      UI.carregando(true, arquivo ? 'Subindo o boleto…' : 'Salvando…');
      try {
        if (arquivo) {
          const caminho = F.caminhoAnexo(N.estado.id, arquivo.name, N.hex12());
          await N.subir(BALDE, caminho, arquivo);
          corpo.anexo = caminho;
          corpo.anexo_nome = arquivo.name;
        }
        const { data, error } = await N.sb.from('orc_fin_lancamentos').insert(corpo).select('id,fornecedor,valor,vencimento');
        if (error) throw error;
        if (!data?.length) throw new Error('O servidor não gravou a conta.');
        N.registrar('fin_lancamento_criado', `${corpo.fornecedor} · ${L.dinheiro(corpo.valor)} · ${L.dataBr(corpo.vencimento)}`);
        toast('Conta lançada.', 'ok'); f.fechar(); if (tela._recarregar) tela._recarregar();
      } catch (err) { toast(N.recado(err), 'err'); }
      finally { UI.carregando(false); }
    };
  }

  /* --------------------------------------------------------- contador */
  // Atrasadas + as que vencem hoje, ainda pendentes. Conta no servidor
  // (head + count), sem trazer linha nenhuma: nao esbarra no teto de 1.000.
  async function contar() {
    if (!L.temModulo(eu(), 'financeiro')) return null;
    const { count, error } = await N.sb.from('orc_fin_lancamentos').select('id', { count: 'exact', head: true })
      .eq('sentido', F.PAGAR).eq('status', 'pendente').lte('vencimento', L.hojeISO());
    if (error) throw error;
    return count || 0;
  }

  MODULOS.financeiro = {
    chave: 'financeiro', nome: 'Financeiro', sub: 'Contas a pagar', icone: ICONE,
    precisa: (u) => L.temModulo(u, 'financeiro'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
