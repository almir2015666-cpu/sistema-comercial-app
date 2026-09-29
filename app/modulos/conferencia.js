/* =====================================================================
   Conferencia — o que o comercial protocolou x o que a seguranca liberou
   (PGR) x o que o SESMT liberou x o que o faturamento emitiu x o que foi
   pago. Quatro lados na mesma linha; cada um so grava as suas colunas, e
   quem recusa e o gatilho no banco.

   A situacao nao e coluna: e calculada das datas, aqui e no computador,
   pelas mesmas regras (logica.js).

   FICA SO NO COMPUTADOR, de proposito: importar e apagar a planilha,
   exportar o Excel, apagar varios de uma vez e marcar varias linhas para
   uma acao em lote. Sao tarefas de mesa, feitas uma vez por mes, e no
   celular so trariam risco de apagar sem querer.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const ANOS = 2;
  const cache = { linhas: null, em: 0 };
  // O mesmo teto do balde no servidor (52-conferencia-comprovantes.sql).
  const LIMITE_PDF = 25 * 1024 * 1024;

  async function listar(tudo) {
    const desde = tudo ? null : L.somarDias(L.hojeISO(), -365 * ANOS);
    const linhas = await N.tudo((de, ate) => {
      let q = N.sb.from('orc_conferencia').select('*');
      if (desde) q = q.or(`protocolo_em.gte.${desde},prazo_em.gte.${desde},enviado_em.is.null`);
      return q.order('prazo_em', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).range(de, ate);
    }, 100000);
    for (const l of linhas) for (const k of ['empresa', 'servico', 'observacao', 'lotacao', 'cod', 'os']) if (l[k]) l[k] = L.achatar(l[k]);
    cache.linhas = linhas; cache.em = Date.now();
    return linhas;
  }

  const selo = (texto) => { const c = L.CORES[texto]; return c ? `<span class="selo-situacao" style="background:${c[0]};color:${c[1]}">${esc(texto)}</span>` : ''; };

  /* -------------------------------------------------- as que precisam de olho
     O mesmo `marcar_para_conferir` do computador (conferencia_nucleo.py):
     data impossivel, OS repetida igual e linha sem empresa ou sem servico.
     NAO CORRIGE NADA: prazo chutado e pior do que prazo faltando. Devolve
     um Map id -> porque, e nao marca a propria linha, para o motivo nunca
     viajar no PATCH de quem tem os quatro lados. */
  function paraConferir(linhas) {
    const motivos = new Map();
    const anotar = (l, m) => { const a = motivos.get(l.id) || []; if (!a.includes(m)) a.push(m); motivos.set(l.id, a); };
    const dia = (v) => (v ? String(v).slice(0, 10) : '');
    for (const l of linhas) {
      const prazo = dia(l.prazo_em), protocolo = dia(l.protocolo_em);
      if (prazo && protocolo && prazo < protocolo) anotar(l, 'prazo antes do protocolo');
      // ano digitado errado: protocolado em 2026 com prazo para 2029
      if (prazo && protocolo && L.diasEntre(protocolo, prazo) > 180) anotar(l, 'prazo longe demais');
      const lib = dia(l.liberado_em), env = dia(l.enviado_em);
      if (lib && env && lib > env) anotar(l, 'enviado antes de liberar');
    }
    // OS repetida so e suspeita com a MESMA empresa e o MESMO servico: um
    // protocolo pode carregar dois servicos de verdade.
    const porOs = new Map();
    for (const l of linhas) if (l.os) { if (!porOs.has(l.os)) porOs.set(l.os, []); porOs.get(l.os).push(l); }
    for (const iguais of porOs.values()) {
      if (iguais.length < 2) continue;
      if (new Set(iguais.map((x) => `${x.empresa}\u0000${x.servico}`)).size === 1) iguais.forEach((l) => anotar(l, 'OS repetida igual'));
    }
    for (const l of linhas) {
      if (l.empresa === '(sem empresa)') anotar(l, 'sem nome de empresa');
      if (!l.servico || l.servico === '(sem serviço)') anotar(l, 'sem serviço');
    }
    return new Map([...motivos].map(([id, a]) => [id, a.join(' · ')]));
  }

  /* -------------------------------------------------------------- o boleto
     A linha digitavel de 47 digitos fecha nos QUATRO verificadores, como o
     fiscal.linha_digitavel_valida do computador: os tres campos pelo
     modulo 10 e o codigo de barras montado deles pelo modulo 11. So o
     modulo 10 deixava passar numero trocado no meio do codigo. */
  const mod10 = (s) => {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { const p = Number(s[i]) * peso; soma += p > 9 ? p - 9 : p; peso = peso === 2 ? 1 : 2; }
    return (10 - (soma % 10)) % 10;
  };
  const mod11Barras = (barras) => {
    const semDv = barras.slice(0, 4) + barras.slice(5);
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    [...semDv].reverse().forEach((c, i) => { soma += Number(c) * pesos[i % 8]; });
    const dv = 11 - (soma % 11);
    return [0, 1, 10, 11].includes(dv) ? 1 : dv;
  };
  function boletoValido(linha) {
    const d = String(linha || '').replace(/\D/g, '');
    if (d.length !== 47) return false;
    if (mod10(d.slice(0, 9)) !== Number(d[9]) || mod10(d.slice(10, 20)) !== Number(d[20]) || mod10(d.slice(21, 31)) !== Number(d[31])) return false;
    const barras = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    return mod11Barras(barras) === Number(barras[4]);
  }
  // "R$ 199,90 · vence 20/09/2026", lido da propria linha (o _resumo_do_boleto
  // do computador). O fator de vencimento tem duas bases (1997 e o reinicio
  // de 2025); vale a data mais perto de hoje, como no financeiro_nucleo.
  function resumoDoBoleto(linha) {
    const d = String(linha || '').replace(/\D/g, '');
    if (d.length !== 47) return '';
    const partes = [];
    const valor = Number(d.slice(37, 47));
    if (valor) partes.push(L.dinheiro(valor / 100));
    const fator = Number(d.slice(33, 37));
    if (fator > 0) {
      const hoje = L.hojeISO();
      const venc = [L.somarDias('1997-10-07', fator), L.somarDias('2025-02-22', fator - 1000)]
        .sort((a, b) => Math.abs(L.diasEntre(hoje, a)) - Math.abs(L.diasEntre(hoje, b)))[0];
      partes.push('vence ' + L.dataBr(venc));
    }
    return partes.join(' · ');
  }

  // O que o computador mostra embaixo dos comprovantes, para a regra nao
  // ser surpresa na hora de salvar.
  const exigencia = (l) => L.pagaComBoleto(l)
    ? 'Pagamento por boleto: a nota e o boleto são exigidos para marcar como faturado.'
    : 'A nota é exigida para marcar como faturado.';

  const tela = {
    titulo: 'Conferência',
    aoTopo(dir) { dir.innerHTML = ''; if (L.ladosDe(eu()).comercial) dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => formulario(null), 'Novo serviço')); },
    async desenhar(el) {
      const F = tela._filtro || (tela._filtro = { busca: '', situacoes: new Set(), pago: '', faturado: '', pgr: '', tudo: false,
        empresa: '', aFaturar: false, semComprovante: false, conferir: false });
      let vivo = true, linhas = [], conferir = new Map();
      const algumFiltro = () => !!(F.busca || F.situacoes.size || F.pago || F.faturado || F.pgr || F.empresa || F.aFaturar || F.semComprovante || F.conferir);
      const limpar = () => {
        Object.assign(F, { busca: '', pago: '', faturado: '', pgr: '', empresa: '', aFaturar: false, semComprovante: false, conferir: false });
        F.situacoes.clear();
        $('#cf-busca', el).value = '';
        pintar();
      };
      const pintar = () => {
        if (!vivo) return;
        const hoje = L.hojeISO();
        let vis = L.buscarConferencia(linhas, F.busca);
        if (F.situacoes.size) vis = vis.filter((l) => F.situacoes.has(L.situacaoDe(l)) || F.situacoes.has(L.atrasoDe(l, hoje)));
        if (F.pago) vis = vis.filter((l) => F.pago === 'sim' ? !!l.pago_em : !l.pago_em);
        if (F.faturado) vis = vis.filter((l) => F.faturado === 'sim' ? !!l.faturado_em : !l.faturado_em);
        if (F.pgr) vis = vis.filter((l) => F.pgr === 'sim' ? !!l.pgr_liberado_em : !l.pgr_liberado_em);
        // pelo nome sem acento nem pontuacao, como o seletor de empresa do
        // computador: "Top Service" e "TOP SERVICE." sao a mesma empresa
        if (F.empresa) { const alvo = L.normalizar(F.empresa); vis = vis.filter((l) => L.normalizar(l.empresa) === alvo); }
        if (F.conferir) vis = vis.filter((l) => conferir.has(l.id));
        if (F.semComprovante) vis = vis.filter((l) => !!L.faltaComprovante(l));
        if (F.aFaturar) vis = vis.filter((l) => L.eACobrarPorNota(l));
        const r = L.resumo(linhas, hoje);
        const semComp = linhas.filter((l) => L.faltaComprovante(l)).length;
        const chips = [L.C.ATRASADO, L.C.PERTO, L.C.ANDAMENTO, L.C.REVISAO, L.C.LIBERADO, L.C.DESCONHECIDA];
        const mostrar = vis.slice(0, 300);
        $('#cf-corpo', el).innerHTML = `
          <div class="chips">${chips.map((c) => `<button type="button" class="chip ${F.situacoes.has(c) ? 'on' : ''} ${c === L.C.ATRASADO ? 'vermelho' : ''}" data-s="${esc(c)}">${esc(c)} ${r[c] || 0}</button>`).join('')}</div>
          <div class="chips">${[['pago', 'pago'], ['faturado', 'faturado'], ['pgr', 'PGR liberado']].map(([k, rot]) => `<button type="button" class="chip ${F[k] ? 'on' : ''}" data-e="${k}">${rot}: ${F[k] || 'todos'}</button>`).join('')}<button type="button" class="chip ${F.tudo ? 'on' : ''}" data-tudo="1">${F.tudo ? 'tudo' : `últimos ${ANOS} anos`}</button></div>
          <div class="chips">
            <button type="button" class="chip ${F.aFaturar ? 'on' : ''}" data-v="aFaturar">só boleto e a faturar</button>
            <button type="button" class="chip ${F.semComprovante ? 'on' : ''} ${semComp ? 'vermelho' : ''}" data-v="semComprovante">faturado sem a nota anexada ${semComp}</button>
            <button type="button" class="chip ${F.conferir ? 'on' : ''} ${conferir.size ? 'vermelho' : ''}" data-v="conferir" ${conferir.size ? '' : 'disabled'}>${conferir.size ? `só as ${conferir.size} que precisam conferir` : 'nada para conferir'}</button>
            ${F.empresa ? `<button type="button" class="chip on" data-sem-empresa="1">empresa: ${esc(F.empresa)} ✕</button>` : ''}
            ${algumFiltro() ? '<button type="button" class="chip" data-limpar="1">limpar os filtros</button>' : ''}
          </div>
          <div class="text-muted pequeno">${vis.length} de ${linhas.length} serviços · ${esc(L.dinheiro(L.total(vis)))}${vis.length > 300 ? ' · mostrando 300, refine a busca' : ''}</div>
          ${mostrar.length ? `<div class="lista">${mostrar.map((l) => `<button class="linha" type="button" data-id="${esc(l.id)}">
            <div class="linha__corpo"><div class="linha__titulo"><span class="t" ${conferir.has(l.id) ? 'style="text-decoration:underline"' : ''}>${esc(l.empresa)}</span></div>
            <div class="linha__sub">${esc(l.servico)}${l.os ? ` · OS ${esc(l.os)}` : ''}${l.lotacao ? ` · ${esc(l.lotacao)}` : ''}</div>
            <div class="flex gap6 mt8" style="flex-wrap:wrap;align-items:center">${selo(L.situacaoDe(l))}${selo(L.atrasoDe(l, hoje))}${l.pago_em ? '<span class="badge b-ok">pago</span>' : ''}${l.faturado_em ? '<span class="badge b-3">faturado</span>' : ''}${L.faltaComprovante(l) ? '<span class="badge b-gray">falta comprovante</span>' : ''}${L.semCobranca(l) ? `<span class="badge b-gray">${esc(L.semCobranca(l).toLowerCase())}</span>` : ''}</div></div>
            <div class="linha__dir"><b style="color:var(--black)">${esc(L.dinheiro(l.valor))}</b><span>${l.prazo_em ? 'prazo ' + esc(L.dataBr(l.prazo_em)) : 'sem prazo'}</span></div></button>`).join('')}</div>` : UI.vazio('Nada com esses filtros')}`;
        $$('[data-s]', el).forEach((b) => { b.onclick = () => { F.situacoes.has(b.dataset.s) ? F.situacoes.delete(b.dataset.s) : F.situacoes.add(b.dataset.s); pintar(); }; });
        $$('[data-e]', el).forEach((b) => { b.onclick = () => { const k = b.dataset.e; F[k] = F[k] === '' ? 'sim' : F[k] === 'sim' ? 'nao' : ''; pintar(); }; });
        $$('[data-v]', el).forEach((b) => { b.onclick = () => { F[b.dataset.v] = !F[b.dataset.v]; pintar(); }; });
        $$('[data-sem-empresa]', el).forEach((b) => { b.onclick = () => { F.empresa = ''; pintar(); }; });
        $$('[data-limpar]', el).forEach((b) => { b.onclick = limpar; });
        $$('[data-tudo]', el).forEach((b) => { b.onclick = async () => { F.tudo = !F.tudo; await carregar(); }; });
        $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(linhas.find((l) => l.id === b.dataset.id), carregar, {
          porque: conferir.get(b.dataset.id) || '',
          // "Filtrar por esta empresa" do botao direito do computador: a
          // pergunta "como esta a XYZ?" respondida com a lista dela inteira
          filtrarEmpresa: (empresa) => { F.empresa = empresa; pintar(); },
        }); });
      };
      const carregar = async () => {
        try {
          linhas = await listar(F.tudo);
          // marca as tortas UMA vez, na carga, e nao a cada tecla digitada
          conferir = paraConferir(linhas);
          pintar();
        } catch (e) { if (vivo) $('#cf-corpo', el).innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      el.innerHTML = `<div class="busca">${ICONES.busca}<input id="cf-busca" placeholder="Empresa, OS, serviço, quem…" value="${esc(F.busca)}"></div><div id="cf-corpo"><div class="text-muted centro pequeno">Carregando…</div></div>`;
      let t; $('#cf-busca', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.busca = e.target.value; pintar(); }, 300); };
      await carregar();
      tela._recarregar = carregar;
      return () => { vivo = false; tela._recarregar = null; };
    },
  };

  /* ------------------------------------------------------- o PGR de uma linha
     O `marcar_pgr` do computador para uma linha so: grava a data de HOJE e
     o nome de quem esta logada, ou (desfazer) tira os dois juntos, senao a
     linha diria que alguem liberou coisa nenhuma. Quem cobra o setor e o
     gatilho do servidor (50-conferencia-pgr.sql); o botao so aparece para
     a Seguranca para ninguem tropecar na recusa. */
  async function marcarPgr(l, desfazer) {
    const hoje = L.hojeISO();
    if (desfazer) {
      if (!await UI.confirmar('Desfazer a liberação do PGR deste serviço? A data e o nome de quem liberou saem da linha.', { ok: 'Desfazer', perigo: true })) return false;
    } else if (l.pgr_liberado_em) {
      // JA LIBERADO nao se libera de novo sem a pessoa saber: quem liberou
      // de verdade viraria quem tocou agora.
      if (!await UI.confirmar(`O PGR já estava liberado em ${L.dataBr(l.pgr_liberado_em)} por ${l.pgr_liberado_por || 'alguém'}. Trocar pela data de hoje (${L.dataBr(hoje)}), em seu nome?`, { ok: 'Trocar', perigo: true })) return false;
    }
    const corpo = { pgr_liberado_em: desfazer ? null : hoje, pgr_liberado_por: desfazer ? null : eu().nome, atualizado_por: eu().nome };
    try {
      await N.mudar('orc_conferencia', { id: l.id }, corpo);
    } catch (e) {
      // o N.mudar recusa a lista vazia com uma frase geral; aqui ha uma
      // razao certa, a mesma que o computador da
      const vazio = /^O servidor não deixou/.test(e?.message || '');
      toast(vazio ? 'O servidor não deixou marcar a liberação do PGR. Ou você não está no setor Segurança, ou a regra do PGR ainda não está no servidor.' : N.recado(e), 'err', 5000);
      return false;
    }
    N.registrar('conferencia_pgr_liberado', `1 serviço(s) · ${desfazer ? 'liberação desfeita' : `liberado em ${L.dataBr(hoje)}`} · ${l.empresa} · ${l.servico}${l.os ? ' · OS ' + l.os : ''}`);
    toast(desfazer ? 'Liberação do PGR desfeita.' : 'PGR liberado.', 'ok');
    return true;
  }

  function detalhe(l, depois, extra = {}) {
    const hoje = L.hojeISO();
    const lados = L.ladosDe(eu());
    const podeEditar = Object.values(lados).some(Boolean);
    const campo = (rot, v) => `<div><dt>${rot}</dt><dd>${esc(v || '-')}</dd></div>`;
    const falta = L.faltaComprovante(l);
    const boleto = l.boleto_arquivo ? `anexado${resumoDoBoleto(l.boleto_linha) ? ' · ' + resumoDoBoleto(l.boleto_linha) : ''}` : '';
    const nota = l.nf_arquivo ? (l.nf_numero ? `NF ${l.nf_numero}` : 'anexada') : (l.nf_numero ? `NF ${l.nf_numero} (sem o PDF)` : '');
    const f = UI.folha(`
      <div class="flex gap6" style="flex-wrap:wrap">${selo(L.situacaoDe(l))}${selo(L.atrasoDe(l, hoje))}${l.pago_em ? '<span class="badge b-ok">pago</span>' : ''}${l.faturado_em ? '<span class="badge b-3">faturado</span>' : ''}</div>
      ${extra.porque ? `<div class="aviso atencao mt12">Para conferir: ${esc(extra.porque)}</div>` : ''}
      ${falta ? `<div class="aviso erro mt12">${esc(falta)}</div>` : ''}
      <dl class="ficha mt12">
        ${campo('Serviço', l.servico)}${campo('OS', l.os)}${campo('Código', l.cod)}${campo('Lotação', l.lotacao)}
        ${campo('Protocolado', L.dataBr(l.protocolo_em) + (l.resp_protocolo ? ` por ${l.resp_protocolo}` : ''))}${campo('Prazo', l.prazo_em ? `${L.dataBr(l.prazo_em)} (${L.diasDePrazo(l, hoje)} dias)` : '')}
        ${campo('Valor', L.dinheiro(l.valor) + (L.semCobranca(l) ? ` · ${L.semCobranca(l)}` : ''))}${campo('Pagamento', l.forma_pagamento)}
        ${campo('Pago em', L.dataBr(l.pago_em))}${campo('Situação comercial', l.situacao)}
        ${campo('PGR liberado', l.pgr_liberado_em ? `${L.dataBr(l.pgr_liberado_em)} por ${l.pgr_liberado_por || '?'}` : '')}
        ${campo('SESMT', l.situacao_sesmt + (l.liberado_em ? ` · ${L.dataBr(l.liberado_em)} por ${l.liberado_por || '?'}` : ''))}${campo('Documento', l.resp_documento)}
        ${campo('Enviado', L.dataBr(l.enviado_em))}${campo('Faturado', l.faturado_em ? `${L.dataBr(l.faturado_em)} por ${l.faturado_por || '?'}` : '')}
        ${campo('Nota fiscal', nota)}${campo('Boleto', boleto)}
        ${l.observacao ? `<div class="largo"><dt>Observação</dt><dd style="white-space:pre-wrap">${esc(l.observacao)}</dd></div>` : ''}
        <div class="largo"><dt>Última alteração</dt><dd>${esc(L.dataHoraBr(l.atualizado_em))}${l.atualizado_por ? ` por ${esc(l.atualizado_por)}` : ''}${l.origem === 'planilha' ? ' · veio da planilha' : ''}</dd></div>
      </dl>
      <div class="acoes mt16">
        ${l.nf_arquivo ? `<button class="btn btn-ghost" id="cd-nf" type="button">Ver a nota</button>` : ''}
        ${l.boleto_arquivo ? `<button class="btn btn-ghost" id="cd-boleto" type="button">Ver o boleto</button>` : ''}
        ${lados.seguranca ? `<button class="btn btn-ghost" id="cd-pgr" type="button">Liberar o PGR hoje</button>` : ''}
        ${lados.seguranca && l.pgr_liberado_em ? `<button class="btn btn-ghost" id="cd-pgr-desfaz" type="button">Desfazer a liberação do PGR</button>` : ''}
        ${extra.filtrarEmpresa && l.empresa ? `<button class="btn btn-ghost" id="cd-empresa" type="button">Filtrar por esta empresa</button>` : ''}
        ${podeEditar ? `<button class="btn btn-primary" id="cd-editar" type="button" style="width:auto">Editar meu lado</button>` : ''}
      </div>`, { titulo: l.empresa });
    const abrir = async (caminho) => { try { await UI.abrirFora(await N.urlAssinada(CFG.baldeConferencia, caminho, 900)); } catch (e) { toast(e.message, 'err'); } };
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#cd-nf', () => abrir(l.nf_arquivo));
    on('#cd-boleto', () => abrir(l.boleto_arquivo));
    const pgr = async (desfazer) => {
      f.fechar();
      if (await marcarPgr(l, desfazer)) { if (depois) depois(); else if (tela._recarregar) tela._recarregar(); }
    };
    on('#cd-pgr', () => pgr(false));
    on('#cd-pgr-desfaz', () => pgr(true));
    on('#cd-empresa', () => { f.fechar(); extra.filtrarEmpresa(l.empresa); });
    on('#cd-editar', () => { f.fechar(); formulario(l, depois); });
    N.registrar('conferencia_aberta', `${l.empresa} · ${l.servico}`);
  }

  async function formulario(l, depois) {
    const lados = L.ladosDe(eu());
    const novo = !l;
    if (novo && !lados.comercial) return toast('Só o comercial cria o serviço.', 'err');
    const v = { ...(l || { valor: 0, origem: 'sistema' }) };
    const pode = (campo) => eu().admin || (lados.comercial && L.CAMPOS_COMERCIAL.includes(campo)) || (lados.sesmt && L.CAMPOS_SESMT.includes(campo)) || (lados.faturamento && L.CAMPOS_FATURAMENTO.includes(campo)) || (lados.seguranca && L.CAMPOS_PGR.includes(campo));
    const inp = (campo, rot, tipo = 'text', extra = '') => `<div class="fg"><label>${rot}</label><input id="f-${campo}" type="${tipo}" value="${esc(v[campo] ?? '')}" ${pode(campo) ? '' : 'disabled'} ${extra}></div>`;
    const sel = (campo, rot, lista) => `<div class="fg"><label>${rot}</label><select id="f-${campo}" ${pode(campo) ? '' : 'disabled'}>${UI.opcoes(lista, v[campo] ?? '')}</select></div>`;
    const semCobranca = L.semCobranca(v);
    // O celular nao le o PDF por dentro (o computador le, no fiscal.py):
    // por isso aqui o numero da nota e a linha do boleto se DIGITAM.
    const anexo = (chave, rot, genero) => `<div class="fg"><label>${rot} (PDF)</label><div class="flex gap8 items-c"><button type="button" class="btn btn-ghost btn-sm" id="f-${chave}-sobe">${v[`${chave}_arquivo`] ? 'Trocar' : 'Anexar'}</button>${v[`${chave}_arquivo`] ? `<button type="button" class="btn btn-ghost btn-sm" id="f-${chave}-abre">Abrir</button>` : ''}<span class="pequeno text-muted flex1" id="f-${chave}-nome">${v[`${chave}_arquivo`] ? (genero === 'a' ? 'anexada' : 'anexado') : (genero === 'a' ? 'nenhuma' : 'nenhum')}</span></div></div>`;
    const f = UI.folha(`<form id="cf-form">
      <div class="secao">Comercial</div>
      ${inp('empresa', 'Empresa')}${inp('servico', 'Serviço')}
      <div class="row-2">${inp('os', 'OS')}${inp('cod', 'Código')}</div>
      ${inp('lotacao', 'Lotação')}
      <div class="row-2">${inp('protocolo_em', 'Protocolado em', 'date')}${inp('prazo_em', 'Prazo', 'date')}</div>
      <div class="row-2">${inp('valor', 'Valor (R$)', 'text', 'inputmode="decimal"')}${sel('forma_pagamento', 'Pagamento', L.FORMAS_PAGAMENTO)}</div>
      ${pode('valor') ? `<div class="vistos mb12"><button type="button" class="chip ${semCobranca === 'CORTESIA' ? 'on' : ''}" data-sc="CORTESIA">Cortesia</button><button type="button" class="chip ${semCobranca === 'COORDENAÇÃO' ? 'on' : ''}" data-sc="COORDENAÇÃO">Coordenação</button></div>` : ''}
      <div class="row-2">${inp('pago_em', 'Pago em', 'date')}${sel('situacao', 'Situação comercial', L.SITUACOES_COMERCIAL)}</div>
      ${inp('enviado_em', 'Enviado ao cliente em', 'date')}
      ${novo ? '' : `<div class="fg"><label>Observação</label><textarea id="f-observacao" ${pode('observacao') ? '' : 'disabled'}>${esc(v.observacao || '')}</textarea></div>`}
      ${novo ? `<div class="fg"><label>Observação</label><textarea id="f-observacao"></textarea></div>` : ''}
      <div class="secao">Segurança do trabalho</div>
      <div class="row-2">${inp('pgr_liberado_em', 'PGR liberado em', 'date')}${eu().admin ? inp('pgr_liberado_por', 'Por') : `<div class="fg"><label>Por</label><input value="${esc(v.pgr_liberado_por || '')}" disabled></div>`}</div>
      <div class="secao">SESMT</div>
      ${sel('situacao_sesmt', 'Situação no SESMT', L.SITUACOES_SESMT)}
      <div class="row-2">${inp('liberado_em', 'Liberado em', 'date')}${eu().admin ? inp('liberado_por', 'Por') : `<div class="fg"><label>Por</label><input value="${esc(v.liberado_por || '')}" disabled></div>`}</div>
      ${inp('resp_documento', 'Quem fez o documento')}
      <div class="secao">Faturamento</div>
      <div class="row-2">${inp('faturado_em', 'Faturado em', 'date')}${eu().admin ? inp('faturado_por', 'Por') : `<div class="fg"><label>Por</label><input value="${esc(v.faturado_por || '')}" disabled></div>`}</div>
      ${pode('nf_arquivo') ? `${anexo('nf', 'Nota fiscal', 'a')}${inp('nf_numero', 'Número da nota', 'text', 'inputmode="numeric"')}` : ''}
      ${pode('boleto_arquivo') ? `${anexo('boleto', 'Boleto', 'o')}${inp('boleto_linha', 'Linha digitável do boleto', 'text', 'inputmode="numeric"')}` : ''}
      ${pode('nf_arquivo') ? `<div class="pequeno text-muted mb12">${esc(exigencia(v))}</div>` : ''}
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${novo ? 'Criar' : 'Salvar'}</button></div></form>`, { titulo: novo ? 'Novo serviço' : 'Editar' });

    $$('[data-sc]', f.caixa).forEach((b) => { b.onclick = () => {
      const on = b.classList.contains('on');
      $$('[data-sc]', f.caixa).forEach((x) => x.classList.remove('on'));
      const fp = $('#f-forma_pagamento', f.caixa), fv = $('#f-valor', f.caixa);
      if (!on) { b.classList.add('on'); fp.value = b.dataset.sc; fv.value = '0'; fv.disabled = true; }
      else { if ([...fp.options].some((o) => o.value === fp.value && ['CORTESIA', 'COORDENAÇÃO'].includes(o.value))) fp.value = ''; fv.disabled = false; }
    }; });
    // O MESMO CAMINHO DO COMPUTADOR (conferencia_nucleo.subir_anexo): balde
    // privado `conferencia`, `<uid>/<12 hex>-<nome limpo>`, e o caminho
    // guardado na linha. Nada e gravado na linha antes do Salvar.
    const subirPdf = async (chave) => {
      const arq = await UI.escolherArquivo('application/pdf');
      if (!arq) return;
      if (!/\.pdf$/i.test(arq.name)) return toast('Escolha o PDF.', 'err');
      if (!(arq.size > 0)) return toast('Esse arquivo está vazio.', 'err');
      if (arq.size > LIMITE_PDF) return toast('O arquivo passa de 25 MB.', 'err');
      // O pouco que o celular confere por dentro: o arquivo comeca como PDF
      // de verdade, e nao e uma foto ou planilha com o nome trocado.
      try {
        const cabeca = await arq.slice(0, 1024).text();
        if (!cabeca.includes('%PDF-')) return toast('Esse arquivo não é um PDF de verdade.', 'err');
      } catch { /* sem leitura, o servidor ainda guarda; a pessoa confere no papel */ }
      UI.carregando(true, 'Subindo o PDF…');
      try {
        const caminho = L.caminhoAnexo(eu().id, arq.name, N.hex12());
        await N.subir(CFG.baldeConferencia, caminho, arq);
        v[`${chave}_arquivo`] = caminho;
        $(`#f-${chave}-nome`, f.caixa).textContent = arq.name;
        // O numero lido do arquivo antigo nao vale para o novo (o computador
        // troca os dois juntos): o campo esvazia para a pessoa digitar.
        const num = $(chave === 'nf' ? '#f-nf_numero' : '#f-boleto_linha', f.caixa);
        if (num && !num.disabled) { num.value = ''; num.focus(); }
        toast(chave === 'nf' ? 'Nota anexada. Digite o número e salve.' : 'Boleto anexado. Digite a linha digitável e salve.', 'ok');
      } catch (e) { toast(e.message, 'err'); } finally { UI.carregando(false); }
    };
    const abrirPdf = async (caminho) => { try { await UI.abrirFora(await N.urlAssinada(CFG.baldeConferencia, caminho, 900)); } catch (e) { toast(e.message, 'err'); } };
    for (const chave of ['nf', 'boleto']) {
      const sobe = $(`#f-${chave}-sobe`, f.caixa); if (sobe) sobe.onclick = () => subirPdf(chave);
      const abre = $(`#f-${chave}-abre`, f.caixa); if (abre) abre.onclick = () => abrirPdf(v[`${chave}_arquivo`]);
    }

    $('#cf-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const ler = (campo) => { const el = $(`#f-${campo}`, f.caixa); return el && !el.disabled ? el.value : undefined; };
      let corpo = {};
      for (const campo of [...L.CAMPOS_COMERCIAL, ...L.CAMPOS_SESMT, ...L.CAMPOS_FATURAMENTO, ...L.CAMPOS_PGR]) {
        const val = ler(campo);
        if (val === undefined) continue;
        corpo[campo] = campo === 'valor' ? L.lerDinheiro(val) : campo.endsWith('_em') ? (val || null) : (L.achatar(val) || null);
      }
      // Como o computador grava o que leu do PDF: so os digitos. A linha
      // "34191.09008 61713..." e o numero "000123" ficam 3419109008... e 123.
      if (corpo.boleto_linha) corpo.boleto_linha = corpo.boleto_linha.replace(/\D/g, '') || null;
      if (corpo.nf_numero) { const d = corpo.nf_numero.replace(/\D/g, ''); corpo.nf_numero = d ? (d.replace(/^0+/, '') || d) : null; }
      if (v.nf_arquivo !== (l?.nf_arquivo ?? undefined) && v.nf_arquivo) corpo.nf_arquivo = v.nf_arquivo;
      if (v.boleto_arquivo !== (l?.boleto_arquivo ?? undefined) && v.boleto_arquivo) corpo.boleto_arquivo = v.boleto_arquivo;
      const marca = $$('[data-sc].on', f.caixa)[0]?.dataset.sc;
      if (marca) corpo.forma_pagamento = marca;
      if (lados.comercial || eu().admin) {
        if (!corpo.empresa) return toast('Diga a empresa.', 'err');
        if (!corpo.servico) return toast('Diga o serviço.', 'err');
        if (!(corpo.valor > 0) && !marca && !L.semCobranca(corpo)) return toast('Valor zero exige marcar cortesia ou coordenação.', 'err');
      }
      if (corpo.boleto_linha && !boletoValido(corpo.boleto_linha)) return toast('A linha digitável do boleto não confere: são 47 dígitos, e os verificadores não fecham. Confira no papel.', 'err', 5000);
      corpo.atualizado_por = eu().nome;
      // QUEM ASSINA, UMA VEZ SO, sobre a linha como ela vai ficar (o antes
      // mais o que mudou). Os anexos ja estao no corpo: anexar a nota num
      // faturado sem nome e o que assina o faturado_por.
      const antes = novo ? {} : l;
      const depoisDeAssinar = L.assinar(antes, novo ? corpo : { ...l, ...corpo }, eu().nome, eu().admin);
      // A MESMA RECUSA DO COMPUTADOR (conferencia_tela.salvar): para quem e
      // do Faturamento, a linha que fica marcada como faturada tem de ter a
      // nota, e, pagando por boleto, o boleto. Vale tambem para o passivo
      // antigo: quem fatura nao salva por cima dele sem anexar.
      if (lados.faturamento) {
        const falta = L.faltaComprovante(depoisDeAssinar);
        if (falta) return toast(falta, 'err', 6000);
      }
      try {
        if (novo) {
          corpo = depoisDeAssinar;
          const { data, error } = await N.sb.from('orc_conferencia').insert({ ...corpo, criado_por: eu().nome, origem: 'sistema', empresa: corpo.empresa || '(sem empresa)', servico: corpo.servico || '(sem serviço)', resp_protocolo: corpo.resp_protocolo || eu().nome }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não criou.');
          N.registrar('conferencia_novo', `${corpo.empresa} · ${corpo.servico}${corpo.os ? ' · OS ' + corpo.os : ''}`);
        } else {
          // Concorrencia: alguem mexeu enquanto a folha estava aberta?
          const { data: agora } = await N.sb.from('orc_conferencia').select('atualizado_em,atualizado_por').eq('id', l.id).limit(1);
          if (agora?.[0] && l.atualizado_em && agora[0].atualizado_em !== l.atualizado_em) throw new Error(`${agora[0].atualizado_por || 'Alguém'} mexeu neste serviço enquanto você estava com ele aberto. Feche e abra de novo.`);
          corpo = L.soOMeuLado(depoisDeAssinar, lados);
          delete corpo.id; delete corpo.criado_em; delete corpo.criado_por; delete corpo.atualizado_em; delete corpo.origem;
          await N.mudar('orc_conferencia', { id: l.id }, corpo);
          N.registrar('conferencia_alterou', `${l.empresa} · ${l.servico}${l.os ? ' · OS ' + l.os : ''} · ${L.oQueMudou(l, corpo)}`.slice(0, 2000));
        }
        toast(novo ? 'Criado.' : 'Salvo.', 'ok'); f.fechar(); if (depois) depois(); else if (tela._recarregar) tela._recarregar();
      } catch (err) { toast(N.recado(err), 'err', 5000); }
    };
  }

  MODULOS.conferencia = {
    chave: 'conferencia', nome: 'Conferência', sub: 'Protocolo, liberação, faturamento', icone: ICONES.conferencia,
    precisa: (u) => L.temModulo(u, 'conferencia'),
    abrir: () => UI.ir(tela),
  };
})();
