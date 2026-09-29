/* =====================================================================
   Diario de Bordo — o dia do comercial: balcao, prospeccao, contratos,
   cadastro. Cada gravacao ACRESCENTA uma linha (nunca substitui a do dia).
   O ranking da equipe vem de uma funcao do servidor que so devolve nome e
   numero — ninguem le o diario dos outros, e o admin fica fora do ranking.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const mesDe = (iso) => iso.slice(0, 7);

  // O PERIODO E UM SO para Lancamentos e Empresas, como os var_de/var_ate do
  // diario_tela: um periodo por tela parece flexivel e e armadilha (a pessoa
  // troca numa, volta na outra, ve outra lista e acha que sumiu lancamento).
  // Comeca nos ultimos 90 dias, o mesmo padrao do computador.
  let periodo = null;
  const periodoAtual = () => periodo || (periodo = { de: L.somarDias(L.hojeISO(), -90), ate: L.hojeISO() });
  // O mes que a aba Metas esta mostrando (‹ › anda de mes em mes).
  let mesMetas = null;
  const andarMes = (mes, n) => {
    let a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) + n;
    while (m < 1) { a -= 1; m += 12; }
    while (m > 12) { a += 1; m -= 12; }
    return `${a}-${String(m).padStart(2, '0')}`;
  };
  const mesBr = (mes) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

  /* ------------------------------------------------ CNPJ na Receita
     As mesmas duas fontes publicas (HTTPS, sem chave) que o computador usa
     em prospeccao_nucleo.consultar_cnpj: BrasilAPI e, se falhar,
     publica.cnpj.ws. A traducao segue _da_brasilapi/_da_cnpjws, so com os
     campos que o cadastro do Diario recebe. */
  const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o']);
  const SIGLAS = new Set(['LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'MEI']);
  // prospeccao_nucleo.titulo(): a Receita escreve TUDO EM MAIUSCULA; so
  // mexe no que veio todo maiusculo ou todo minusculo.
  function titulo(t) {
    const s = String(t || '').trim();
    if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
    return s.toLowerCase().split(/\s+/).map((p, i) => SIGLAS.has(p.toUpperCase()) && p.length <= 3 ? p.toUpperCase()
      : i > 0 && PREPOSICOES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
  // formatar_telefone + telefone_valido: descarta lixo (todos iguais, DDD
  // que nao existe) para nao virar contato com cara de valido.
  function telefone(bruto) {
    let d = String(bruto || '').replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (![8, 9, 10, 11].includes(d.length)) return '';
    const corpo = d.length >= 10 ? d.slice(2) : d;
    if (new Set(corpo).size <= 1) return '';
    if (d.length >= 10) {
      if (!DDDS.has(d.slice(0, 2))) return '';
      const corte = d.length === 11 ? 7 : 6;
      return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
    }
    const corte = d.length === 9 ? 5 : 4;
    return `${d.slice(0, corte)}-${d.slice(corte)}`;
  }
  const deBrasilApi = (d) => ({
    cnpj: String(d.cnpj || '').replace(/\D/g, ''), razao: titulo(d.razao_social), fantasia: titulo(d.nome_fantasia),
    cnae_desc: String(d.cnae_fiscal_descricao || '').trim(), situacao: String(d.descricao_situacao_cadastral || '').trim().toUpperCase(),
    uf: String(d.uf || '').trim().toUpperCase(), municipio: titulo(d.municipio), bairro: titulo(d.bairro),
    logradouro: titulo(d.logradouro), numero: String(d.numero || '').trim(),
    telefone1: telefone(d.ddd_telefone_1), email: String(d.email || '').trim().toLowerCase(),
  });
  const deCnpjWs = (d) => {
    const est = d.estabelecimento || {};
    return {
      cnpj: String(est.cnpj || d.cnpj_raiz || '').replace(/\D/g, ''), razao: titulo(d.razao_social), fantasia: titulo(est.nome_fantasia),
      cnae_desc: String((est.atividade_principal || {}).descricao || '').trim(), situacao: String(est.situacao_cadastral || '').trim().toUpperCase(),
      uf: String((est.estado || {}).sigla || '').toUpperCase(), municipio: titulo((est.cidade || {}).nome), bairro: titulo(est.bairro),
      logradouro: titulo(`${est.tipo_logradouro || ''} ${est.logradouro || ''}`), numero: String(est.numero || '').trim(),
      telefone1: telefone(`${est.ddd1 || ''}${est.telefone1 || ''}`), email: String(est.email || '').trim().toLowerCase(),
    };
  };
  // Devolve o registro, null se a Receita nao tem o CNPJ, ou lanca erro
  // quando nenhuma das duas respondeu (sem rede, fora do ar).
  async function consultarCnpj(digitos) {
    const fontes = [[`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, deBrasilApi], [`https://publica.cnpj.ws/cnpj/${digitos}`, deCnpjWs]];
    let ultimo = null, naoAchou = false;
    for (const [url, traduzir] of fontes) {
      const ctl = new AbortController();
      const relogio = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (r.status === 404) { naoAchou = true; continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const reg = traduzir(await r.json());
        if (reg.cnpj) return reg;
      } catch (e) { ultimo = e; } finally { clearTimeout(relogio); }
    }
    if (naoAchou) return null;
    throw ultimo || new Error('sem resposta');
  }
  // cnpj_busca.alerta: BAIXADA, INAPTA, SUSPENSA e NULA sao o achado que
  // mais vale; vender para empresa fechada e o erro que a consulta evita.
  const alertaCnpj = (r) => ['BAIXADA', 'INAPTA', 'SUSPENSA', 'NULA'].some((x) => (r.situacao || '').includes(x))
    ? `ATENÇÃO: esta empresa está ${r.situacao} na Receita Federal. Confirme antes de seguir.` : '';
  // cnpj_busca.resumo: a linha para CONFERIR que o CNPJ e a empresa certa.
  const resumoCnpj = (r) => [
    r.fantasia && r.fantasia.toUpperCase() !== (r.razao || '').toUpperCase() ? r.fantasia : '',
    [r.municipio, r.uf].filter(Boolean).join(' / '), (r.cnae_desc || '').slice(0, 60),
  ].filter(Boolean).join(' · ');

  async function listar(deISO, ateISO) {
    return N.tudo((de, ate) => N.sb.from('orc_diario').select('*').gte('data', deISO).lte('data', ateISO).order('data', { ascending: false }).order('criado_em', { ascending: false }).range(de, ate));
  }
  async function totais(deISO, ateISO) {
    const { data, error } = await N.sb.rpc('orc_diario_totais', { p_de: deISO, p_ate: ateISO });
    if (error) throw error;
    return data || [];
  }
  async function equipe() {
    const { data, error } = await N.sb.rpc('orc_diario_equipe');
    if (error) throw error;
    return data || [];
  }
  async function metas(mes) {
    const { data } = await N.sb.from('orc_diario_metas').select('*').eq('mes', mes).limit(1000);
    return data || [];
  }

  const tela = {
    titulo: 'Diário de Bordo',
    // "Empresas" do computador: o historico de uma empresa nas quatro atividades
    aoTopo(dir) { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.busca, () => UI.ir(telaEmpresas), 'Empresas')); },
    async desenhar(el) {
      let aba = 'hoje', vivo = true;
      const pintar = async () => {
        if (!vivo) return;
        el.innerHTML = `<div class="tabs"><button class="tab ${aba === 'hoje' ? 'on' : ''}" data-v="hoje">Hoje</button><button class="tab ${aba === 'meus' ? 'on' : ''}" data-v="meus">Lançamentos</button><button class="tab ${aba === 'equipe' ? 'on' : ''}" data-v="equipe">Equipe</button>${eu().admin ? `<button class="tab ${aba === 'metas' ? 'on' : ''}" data-v="metas">Metas</button>` : ''}</div><div id="di-corpo"><div class="text-muted centro pequeno">Carregando…</div></div>`;
        $$('.tab', el).forEach((b) => { b.onclick = () => { aba = b.dataset.v; pintar(); }; });
        const corpo = $('#di-corpo', el);
        try {
          if (aba === 'hoje') await abaHoje(corpo);
          else if (aba === 'meus') await abaMeus(corpo);
          else if (aba === 'equipe') await abaEquipe(corpo);
          else await abaMetas(corpo);
        } catch (e) { if (vivo) corpo.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await pintar();
      tela._recarregar = pintar;
      N.registrar('diario_aberto');
      return () => { vivo = false; tela._recarregar = null; };
    },
  };

  async function abaHoje(corpo) {
    const hoje = L.hojeISO();
    const mes = mesDe(hoje);
    const [doMes, ms, registros] = await Promise.all([totais(`${mes}-01`, hoje), metas(mes), listar(L.somarDias(hoje, -90), hoje)]);
    const meusTotais = {};
    for (const t of doMes) if (t.usuario_id === eu().id) meusTotais[t.atividade] = Number(t.total);
    const deHoje = L.totaisPorAtividade(registros.filter((r) => r.data === hoje && r.usuario_id === eu().id));
    const retornos = L.retornosPendentes(registros.filter((r) => r.usuario_id === eu().id), hoje).filter((r) => r.dias <= 7);
    const niver = L.aniversariantes(registros, hoje);
    corpo.innerHTML = `
      <div class="grade">${L.ATIVIDADES.map(([k, nome, sigla]) => {
        const meta = L.metaDe(ms, eu().id, k), feito = meusTotais[k] || 0, p = L.percentual(feito, meta);
        return `<button class="modulo" type="button" data-a="${k}"><span class="badge b-1">${sigla}</span><span><span class="modulo__nome">${esc(nome)}</span><br><span class="modulo__sub">hoje ${deHoje[k] || 0} · mês ${feito} de ${meta}</span></span><span class="barra"><i class="${L.corDoPercentual(p)}" style="width:${p}%"></i></span></button>`;
      }).join('')}</div>
      <div class="text-muted pequeno centro">Toque numa atividade para lançar.</div>
      ${retornos.length ? `<div class="secao">Retornos</div><div class="lista">${retornos.map((r) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(r.empresa)}</span><span class="badge ${r.dias < 0 ? 'b-err' : r.dias === 0 ? 'b-4' : 'b-1'}">${esc(r.tag)}</span></div><div class="linha__sub">${esc(r.status)} · ${esc(r.contato)}</div></div></div>`).join('')}</div>` : ''}
      ${niver.length ? `<div class="secao">Aniversariantes de hoje</div><div class="lista">${niver.map((d) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">🎂 ${esc(d.empresa)}</span></div><div class="linha__sub">${esc(d.contato)} · ${esc(d.email || '')}</div></div></div>`).join('')}</div>` : ''}`;
    $$('[data-a]', corpo).forEach((b) => { b.onclick = () => lancar(b.dataset.a); });
  }

  function lancar(atividade) {
    const [, nome] = L.ATIVIDADES.find((a) => a[0] === atividade);
    const campos = L.CAMPOS_DIARIO[atividade];
    const pendentes = [];
    const f = UI.folha(`<form id="df">
      <div class="fg"><label>Data</label><input id="df-data" type="date" value="${L.hojeISO()}" max="${L.hojeISO()}"></div>
      ${campos.map(([k, rot, tipo]) => tipo === 'servico' ? `<div class="fg"><label>${rot}</label><select id="df-${k}">${UI.opcoes(L.SERVICOS_BALCAO)}</select></div>`
        : tipo === 'pagamento' ? `<div class="fg"><label>${rot}</label><select id="df-${k}">${UI.opcoes(L.PAGAMENTOS)}</select></div>`
        : tipo === 'status' ? `<div class="fg"><label>${rot}</label><select id="df-${k}">${UI.opcoes(L.STATUS_PROSPECCAO)}</select></div>`
        : tipo === 'data' ? `<div class="fg"><label>${rot}</label><input id="df-${k}" type="date"></div>`
        : tipo === 'dinheiro' ? `<div class="fg"><label>${rot}</label><input id="df-${k}" inputmode="decimal" placeholder="0,00"></div>`
        : `<div class="fg"><label>${rot}</label><input id="df-${k}"></div>`).join('')}
      <div class="acoes"><button class="btn btn-ghost" type="submit">Adicionar à lista</button>${campos.some(([k]) => k === 'cnpj') ? '<button class="btn btn-ghost" type="button" id="df-buscar-cnpj">Buscar CNPJ</button>' : ''}</div>
      <div class="pequeno mt8" id="df-recado"></div>
      <div id="df-lista" class="mt12"></div>
      <div class="modal-ft"><button class="btn btn-ok" type="button" id="df-salvar" disabled>Salvar 0 lançamentos</button></div></form>`, { titulo: nome });
    const pintar = () => {
      $('#df-lista', f.caixa).innerHTML = pendentes.length ? `<div class="lista">${pendentes.map((d, i) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(d.empresa)}</span></div><div class="linha__sub">${esc(Object.entries(d).filter(([k]) => k !== 'empresa').map(([, v]) => v).join(' · '))}</div></div><button class="btn-icon del" type="button" data-i="${i}">✕</button></div>`).join('')}</div>` : '';
      $$('[data-i]', f.caixa).forEach((b) => { b.onclick = () => { pendentes.splice(Number(b.dataset.i), 1); pintar(); }; });
      const bs = $('#df-salvar', f.caixa); bs.disabled = !pendentes.length; bs.textContent = `Salvar ${pendentes.length} lançamento${pendentes.length === 1 ? '' : 's'}`;
    };
    $('#df', f.caixa).onsubmit = (e) => {
      e.preventDefault();
      const bruto = {}; for (const [k] of campos) bruto[k] = $(`#df-${k}`, f.caixa).value;
      const v = L.validarDetalhe(atividade, bruto);
      if (!v.ok) return toast(v.erro, 'err');
      pendentes.push(v.detalhe);
      $('#df-recado', f.caixa).textContent = '';
      for (const [k, , tipo] of campos) if (!['servico', 'pagamento', 'status'].includes(tipo)) $(`#df-${k}`, f.caixa).value = '';
      $(`#df-${campos[0][0]}`, f.caixa).focus();
      pintar();
    };
    // BUSCAR CNPJ, como diario_tela.buscar_cnpj: so existe onde ha CNPJ (o
    // cadastro de empresas) e SO PREENCHE CAMPO VAZIO. O que a pessoa
    // digitou ganha da Receita. Sem rede, o cadastro segue a mao.
    const bCnpj = $('#df-buscar-cnpj', f.caixa);
    if (bCnpj) bCnpj.onclick = async () => {
      const recado = $('#df-recado', f.caixa);
      const dizer = (t, ruim) => { recado.textContent = t; recado.style.color = ruim ? 'var(--red)' : ''; };
      const digitos = String($('#df-cnpj', f.caixa)?.value || '').replace(/\D/g, '');
      if (digitos.length !== 14) return dizer('Digite os 14 dígitos do CNPJ antes de buscar.', true);
      dizer('Procurando na Receita…'); bCnpj.disabled = true;
      try {
        const r = await consultarCnpj(digitos);
        if (!r) return dizer('A Receita não encontrou este CNPJ.', true);
        const onde = [r.municipio, r.uf].filter(Boolean).join('/');
        const sugerido = {
          empresa: r.razao || r.fantasia, ramo: r.cnae_desc,
          endereco: [r.logradouro, r.numero, r.bairro, onde].filter(Boolean).join(', '),
          email: r.email, contato: r.telefone1,
        };
        for (const [k, v] of Object.entries(sugerido)) {
          const campo = $(`#df-${k}`, f.caixa);
          if (campo && v && !campo.value.trim()) campo.value = v;
        }
        const aviso = alertaCnpj(r);
        dizer(aviso || `Preenchi o que estava vazio. ${resumoCnpj(r)}`.trim(), !!aviso);
      } catch (e) {
        dizer(`Não consegui consultar a Receita agora (${e.message || 'sem rede'}).`, true);
      } finally { bCnpj.disabled = false; }
    };
    $('#df-salvar', f.caixa).onclick = async () => {
      const data = $('#df-data', f.caixa).value || L.hojeISO();
      try {
        const { data: r, error } = await N.sb.from('orc_diario').insert({ data, atividade, detalhes: pendentes, quantidade: pendentes.length, usuario_nome: eu().nome || '(sem nome)', usuario_id: eu().id }).select();
        if (error) throw error; if (!r?.length) throw new Error('O servidor não gravou.');
        N.registrar('diario_registrado', `${nome}: ${pendentes.length}`);
        toast('Lançado.', 'ok'); f.fechar(); if (tela._recarregar) tela._recarregar();
      } catch (e) { toast(N.recado(e), 'err'); }
    };
  }

  // De / Ate, os mesmos para Lancamentos e Empresas. Trocar recarrega.
  function camposDePeriodo(raiz, depois) {
    const p = periodoAtual();
    raiz.innerHTML = `<div class="row-2"><div class="fg" style="margin-bottom:6px"><label>De</label><input type="date" id="dp-de" value="${esc(p.de)}" max="${esc(L.hojeISO())}"></div><div class="fg" style="margin-bottom:6px"><label>Até</label><input type="date" id="dp-ate" value="${esc(p.ate)}"></div></div>`;
    const mudou = () => {
      const de = $('#dp-de', raiz).value, ate = $('#dp-ate', raiz).value;
      if (!de || !ate) return toast('Escolha as duas datas do período.', 'err');
      if (de > ate) return toast('O "De" tem de vir antes do "Até".', 'err');
      periodo = { de, ate };
      depois();
    };
    $('#dp-de', raiz).onchange = mudou; $('#dp-ate', raiz).onchange = mudou;
  }

  async function abaMeus(corpo) {
    const { de, ate } = periodoAtual();
    const registros = await listar(de, ate);
    corpo.innerHTML = `<div id="dm-periodo"></div>${eu().admin ? '' : '<div class="text-muted pequeno">Você vê só os seus lançamentos.</div>'}
      <div class="text-muted pequeno mb8">${registros.length} registro${registros.length === 1 ? '' : 's'} de ${esc(L.dataBr(de))} a ${esc(L.dataBr(ate))}.</div>
      ${registros.length ? `<div class="lista">${registros.map((r) => { const [, nome, sigla] = L.ATIVIDADES.find((a) => a[0] === r.atividade) || ['', r.atividade, '']; return `<button class="linha" type="button" data-id="${esc(r.id)}"><span class="badge b-1">${esc(sigla)}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(nome)} · ${r.quantidade}</span></div><div class="linha__sub">${esc(L.dataBr(r.data))}${eu().admin ? ` · ${esc(r.usuario_nome)}` : ''} · ${esc((r.detalhes || []).map((d) => d.empresa).join(', '))}</div></div>${ICONES.seta}</button>`; }).join('')}</div>` : UI.vazio('Nenhum lançamento neste período')}`;
    camposDePeriodo($('#dm-periodo', corpo), () => tela._recarregar && tela._recarregar());
    $$('.linha', corpo).forEach((b) => { b.onclick = () => {
      const r = registros.find((x) => x.id === b.dataset.id);
      const [, nome] = L.ATIVIDADES.find((a) => a[0] === r.atividade) || ['', r.atividade];
      const f = UI.folha(`<div class="text-muted pequeno mb12">${esc(L.dataBr(r.data))} · ${esc(r.usuario_nome)}</div>
        ${(r.detalhes || []).map((d) => `<dl class="ficha mb12" style="border-bottom:1px solid var(--border);padding-bottom:10px">${Object.entries(d).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(k === 'valor' ? L.dinheiro(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? L.dataBr(v) : v)}</dd></div>`).join('')}</dl>`).join('')}
        ${eu().admin ? `<div class="modal-ft"><button class="btn btn-danger" id="dm-apagar" type="button">Apagar (administrador)</button></div>` : ''}`, { titulo: `${nome} · ${r.quantidade}` });
      const ba = $('#dm-apagar', f.caixa); if (ba) ba.onclick = async () => {
        if (!await UI.confirmar('Apagar este lançamento de vez?', { ok: 'Apagar', perigo: true })) return;
        try { const n = await N.apagar('orc_diario', { id: r.id }); if (!n) throw new Error('O servidor não deixou.'); N.registrar('diario_apagado', `${r.usuario_nome} · ${r.data} · ${nome}`); f.fechar(); tela._recarregar(); } catch (e) { toast(N.recado(e), 'err'); }
      };
    }; });
  }

  async function abaEquipe(corpo) {
    const hoje = L.hojeISO();
    const mes = mesDe(hoje);
    const [eq, doMes, semana, deHoje, ms] = await Promise.all([equipe(), totais(`${mes}-01`, hoje), totais(L.somarDias(hoje, -6), hoje), totais(hoje, hoje), metas(mes)]);
    const admins = new Set(eq.filter((p) => p.admin).map((p) => p.id));
    const bloco = (titulo, tot) => { const r = L.ranking(tot, admins); return `<div class="secao">${titulo}</div>${r.length ? `<div class="lista">${r.map((p) => `<div class="linha"><span class="avatar av-40" style="background:${p.posicao === 1 ? 'linear-gradient(135deg,#d97706,#fbbf24)' : 'var(--navy)'}">${p.posicao}º</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(p.nome)}</span></div><div class="linha__sub">ATD ${p.por_atividade.atendimento} · PRO ${p.por_atividade.prospeccao} · CTR ${p.por_atividade.contratos} · CAD ${p.por_atividade.cadastro}</div></div><b>${p.total}</b></div>`).join('')}</div>` : '<div class="vazio">Sem lançamentos.</div>'}`; };
    corpo.innerHTML = `${bloco('Este mês', doMes)}${bloco('Últimos 7 dias', semana)}${bloco('Hoje', deHoje)}
      <div class="secao">Metas do mês</div><div class="lista">${eq.filter((p) => !p.admin).map((p) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(p.nome)}</span></div><div class="linha__sub">${L.ATIVIDADES.map(([k, , s]) => { const feito = doMes.filter((t) => t.usuario_id === p.id && t.atividade === k).reduce((a, t) => a + Number(t.total), 0); return `${s} ${feito}/${L.metaDe(ms, p.id, k)}`; }).join(' · ')}</div></div></div>`).join('')}</div>`;
  }

  async function abaMetas(corpo) {
    // ‹ › anda de mes em mes, como a JanelaMetas do computador: da para
    // deixar a meta do mes que vem pronta antes de ele comecar.
    const mes = mesMetas || (mesMetas = mesDe(L.hojeISO()));
    const [eq, ms] = await Promise.all([equipe(), metas(mes)]);
    corpo.innerHTML = `<div class="acoes mb8" style="align-items:center"><button class="btn btn-ghost" type="button" id="dm-antes" aria-label="Mês anterior" style="flex:0 0 auto">‹</button><div class="card-title centro" style="flex:1">${esc(mesBr(mes))}</div><button class="btn btn-ghost" type="button" id="dm-depois" aria-label="Próximo mês" style="flex:0 0 auto">›</button></div>
      <div class="text-muted pequeno">Metas de ${esc(mesBr(mes))} por pessoa e atividade. Em branco vale a meta padrão (${L.META_PADRAO}).</div>
      ${eq.filter((p) => !p.admin).map((p) => `<div class="card"><div class="card-title mb8">${esc(p.nome)}</div><div class="row-2">${L.ATIVIDADES.map(([k, , s]) => { const m = ms.find((x) => x.usuario_id === p.id && x.atividade === k); return `<div class="fg" style="margin-bottom:6px"><label>${s}</label><input type="number" min="0" step="1" inputmode="numeric" data-u="${esc(p.id)}" data-a="${k}" value="${m ? m.meta : ''}" placeholder="${L.META_PADRAO}"></div>`; }).join('')}</div></div>`).join('')}
      <button class="btn btn-ok w-full" id="dm-salvar" type="button">Salvar metas</button>`;
    const ir = (n) => { mesMetas = andarMes(mes, n); if (tela._recarregar) tela._recarregar(); };
    $('#dm-antes', corpo).onclick = () => ir(-1);
    $('#dm-depois', corpo).onclick = () => ir(1);
    $('#dm-salvar', corpo).onclick = async () => {
      const preenchidos = $$('input[data-u]', corpo).filter((i) => i.value.trim() !== '');
      // como JanelaMetas.salvar: meta e numero inteiro, sem sinal nem virgula
      const tortos = preenchidos.filter((i) => !/^\d+$/.test(i.value.trim())).map((i) => i.value.trim());
      if (tortos.length) return toast(`Meta tem de ser um número inteiro: ${tortos.join(', ')}`, 'err');
      const linhas = preenchidos.map((i) => ({ usuario_id: i.dataset.u, atividade: i.dataset.a, mes, meta: Number(i.value.trim()) }));
      if (!linhas.length) return toast('Nenhuma meta preenchida.', 'err');
      // O servidor decide (so o admin grava metas): resposta vazia e recusa.
      const { data, error } = await N.sb.from('orc_diario_metas').upsert(linhas, { onConflict: 'usuario_id,atividade,mes' }).select();
      if (error) return toast(N.recado(error), 'err');
      if (!data || !data.length) return toast('O servidor não gravou as metas.', 'err');
      N.registrar('diario_metas_alteradas', mes); toast(`${data.length} meta(s) gravada(s) em ${mesBr(mes)}.`, 'ok');
    };
  }

  // diario_nucleo.descrever_detalhe: o lancamento por extenso, campo a campo,
  // pulando o que ficou vazio.
  const descrever = (atividade, d) => (L.CAMPOS_DIARIO[atividade] || []).map(([k, rot, tipo]) => {
    const v = d?.[k];
    if (v === undefined || v === null || String(v).trim() === '') return '';
    return `${rot}: ${tipo === 'dinheiro' ? L.dinheiro(v) : tipo === 'data' ? L.dataBr(v) : String(v).trim()}`;
  }).filter(Boolean).join(' · ');

  /* ------------------------------------------------------ empresas
     A JanelaEmpresas do computador: onde aquela empresa ja apareceu, nas
     quatro atividades de uma vez. UM CAMPO para nome e CNPJ (quem procura
     nem sempre sabe qual dos dois tem na mao). Procura nos lancamentos do
     MESMO periodo da aba Lancamentos, como o computador procura nos
     registros que ja carregou. */
  const telaEmpresas = {
    titulo: 'Empresas',
    async desenhar(el) {
      el.innerHTML = `<div id="em-periodo"></div><div class="busca">${ICONES.busca}<input id="em-busca" placeholder="Nome ou CNPJ" autocomplete="off"></div>
        <div class="text-muted pequeno mt8" id="em-conta">Carregando…</div><div id="em-lista" class="mt8"></div>`;
      let registros = [], vivo = true;
      const campo = $('#em-busca', el), conta = $('#em-conta', el), lista = $('#em-lista', el);
      const procurar = () => {
        const termo = campo.value;
        // L.buscarEmpresa por registro, para levar junto quem lancou
        const achados = registros.flatMap((r) => L.buscarEmpresa([r], termo).map((d) => ({ d, r })))
          .sort((a, b) => String(b.r.data || '').localeCompare(String(a.r.data || '')));
        conta.textContent = termo.trim() ? `${achados.length} lançamento(s).` : 'Digite para procurar.';
        lista.innerHTML = achados.length ? `<div class="lista">${achados.map(({ d, r }) => {
          const [, nome, sigla] = L.ATIVIDADES.find((a) => a[0] === r.atividade) || ['', r.atividade, ''];
          return `<div class="linha"><span class="badge b-1">${esc(sigla)}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(d.empresa || '')}</span></div><div class="linha__sub">${esc(L.dataBr(r.data))} · ${esc(r.usuario_nome || '')} · ${esc(nome)}</div><div class="linha__sub" style="white-space:normal">${esc(descrever(r.atividade, d))}</div></div></div>`;
        }).join('')}</div>` : '';
      };
      const carregar = async () => {
        conta.textContent = 'Carregando…';
        try {
          const { de, ate } = periodoAtual();
          const lidos = await listar(de, ate);
          if (!vivo) return;
          registros = lidos;
          procurar();
        } catch (e) { if (vivo) conta.textContent = N.recado(e); }
      };
      camposDePeriodo($('#em-periodo', el), carregar);
      campo.oninput = procurar;
      setTimeout(() => campo.focus(), 50);
      await carregar();
      return () => { vivo = false; };
    },
  };

  MODULOS.diario = {
    chave: 'diario', nome: 'Diário de Bordo', sub: 'O dia do comercial', icone: ICONES.diario,
    precisa: (u) => L.temModulo(u, 'diario'),
    abrir: () => UI.ir(tela),
  };
})();
