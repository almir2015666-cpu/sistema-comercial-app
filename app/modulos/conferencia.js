/* =====================================================================
   Conferencia — o que o comercial protocolou x o que a seguranca liberou
   (PGR) x o que o SESMT liberou x o que o faturamento emitiu x o que foi
   pago. Quatro lados na mesma linha; cada um so grava as suas colunas, e
   quem recusa e o gatilho no banco.

   A situacao nao e coluna: e calculada das datas, aqui e no computador,
   pelas mesmas regras (logica.js).
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const ANOS = 2;
  const cache = { linhas: null, em: 0 };

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

  const tela = {
    titulo: 'Conferência',
    aoTopo(dir) { dir.innerHTML = ''; if (L.ladosDe(eu()).comercial) dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => formulario(null), 'Novo serviço')); },
    async desenhar(el) {
      const F = tela._filtro || (tela._filtro = { busca: '', situacoes: new Set(), pago: '', faturado: '', pgr: '', tudo: false });
      let vivo = true, linhas = [];
      const pintar = () => {
        if (!vivo) return;
        const hoje = L.hojeISO();
        let vis = L.buscarConferencia(linhas, F.busca);
        if (F.situacoes.size) vis = vis.filter((l) => F.situacoes.has(L.situacaoDe(l)) || F.situacoes.has(L.atrasoDe(l, hoje)));
        if (F.pago) vis = vis.filter((l) => F.pago === 'sim' ? !!l.pago_em : !l.pago_em);
        if (F.faturado) vis = vis.filter((l) => F.faturado === 'sim' ? !!l.faturado_em : !l.faturado_em);
        if (F.pgr) vis = vis.filter((l) => F.pgr === 'sim' ? !!l.pgr_liberado_em : !l.pgr_liberado_em);
        const r = L.resumo(linhas, hoje);
        const chips = [L.C.ATRASADO, L.C.PERTO, L.C.ANDAMENTO, L.C.REVISAO, L.C.LIBERADO, L.C.DESCONHECIDA];
        const mostrar = vis.slice(0, 300);
        $('#cf-corpo', el).innerHTML = `
          <div class="chips">${chips.map((c) => `<button type="button" class="chip ${F.situacoes.has(c) ? 'on' : ''} ${c === L.C.ATRASADO ? 'vermelho' : ''}" data-s="${esc(c)}">${esc(c)} ${r[c] || 0}</button>`).join('')}</div>
          <div class="chips">${[['pago', 'pago'], ['faturado', 'faturado'], ['pgr', 'PGR liberado']].map(([k, rot]) => `<button type="button" class="chip ${F[k] ? 'on' : ''}" data-e="${k}">${rot}: ${F[k] || 'todos'}</button>`).join('')}<button type="button" class="chip ${F.tudo ? 'on' : ''}" data-tudo="1">${F.tudo ? 'tudo' : `últimos ${ANOS} anos`}</button></div>
          <div class="text-muted pequeno">${vis.length} de ${linhas.length} serviços · ${esc(L.dinheiro(L.total(vis)))}${vis.length > 300 ? ' · mostrando 300, refine a busca' : ''}</div>
          ${mostrar.length ? `<div class="lista">${mostrar.map((l) => `<button class="linha" type="button" data-id="${esc(l.id)}">
            <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(l.empresa)}</span></div>
            <div class="linha__sub">${esc(l.servico)}${l.os ? ` · OS ${esc(l.os)}` : ''}${l.lotacao ? ` · ${esc(l.lotacao)}` : ''}</div>
            <div class="flex gap6 mt8" style="flex-wrap:wrap;align-items:center">${selo(L.situacaoDe(l))}${selo(L.atrasoDe(l, hoje))}${l.pago_em ? '<span class="badge b-ok">pago</span>' : ''}${l.faturado_em ? '<span class="badge b-3">faturado</span>' : ''}${L.semCobranca(l) ? `<span class="badge b-gray">${esc(L.semCobranca(l).toLowerCase())}</span>` : ''}</div></div>
            <div class="linha__dir"><b style="color:var(--black)">${esc(L.dinheiro(l.valor))}</b><span>${l.prazo_em ? 'prazo ' + esc(L.dataBr(l.prazo_em)) : 'sem prazo'}</span></div></button>`).join('')}</div>` : UI.vazio('Nada com esses filtros')}`;
        $$('[data-s]', el).forEach((b) => { b.onclick = () => { F.situacoes.has(b.dataset.s) ? F.situacoes.delete(b.dataset.s) : F.situacoes.add(b.dataset.s); pintar(); }; });
        $$('[data-e]', el).forEach((b) => { b.onclick = () => { const k = b.dataset.e; F[k] = F[k] === '' ? 'sim' : F[k] === 'sim' ? 'nao' : ''; pintar(); }; });
        $$('[data-tudo]', el).forEach((b) => { b.onclick = async () => { F.tudo = !F.tudo; await carregar(); }; });
        $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(linhas.find((l) => l.id === b.dataset.id), carregar); });
      };
      const carregar = async () => {
        try { linhas = await listar(F.tudo); pintar(); }
        catch (e) { if (vivo) $('#cf-corpo', el).innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      el.innerHTML = `<div class="busca">${ICONES.busca}<input id="cf-busca" placeholder="Empresa, OS, serviço, quem…" value="${esc(F.busca)}"></div><div id="cf-corpo"><div class="text-muted centro pequeno">Carregando…</div></div>`;
      let t; $('#cf-busca', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.busca = e.target.value; pintar(); }, 300); };
      await carregar();
      tela._recarregar = carregar;
      return () => { vivo = false; tela._recarregar = null; };
    },
  };

  function detalhe(l, depois) {
    const hoje = L.hojeISO();
    const lados = L.ladosDe(eu());
    const podeEditar = Object.values(lados).some(Boolean);
    const campo = (rot, v) => `<div><dt>${rot}</dt><dd>${esc(v || '—')}</dd></div>`;
    const f = UI.folha(`
      <div class="flex gap6" style="flex-wrap:wrap">${selo(L.situacaoDe(l))}${selo(L.atrasoDe(l, hoje))}${l.pago_em ? '<span class="badge b-ok">pago</span>' : ''}${l.faturado_em ? '<span class="badge b-3">faturado</span>' : ''}</div>
      <dl class="ficha mt12">
        ${campo('Serviço', l.servico)}${campo('OS', l.os)}${campo('Código', l.cod)}${campo('Lotação', l.lotacao)}
        ${campo('Protocolado', L.dataBr(l.protocolo_em) + (l.resp_protocolo ? ` por ${l.resp_protocolo}` : ''))}${campo('Prazo', l.prazo_em ? `${L.dataBr(l.prazo_em)} (${L.diasDePrazo(l, hoje)} dias)` : '')}
        ${campo('Valor', L.dinheiro(l.valor) + (L.semCobranca(l) ? ` · ${L.semCobranca(l)}` : ''))}${campo('Pagamento', l.forma_pagamento)}
        ${campo('Pago em', L.dataBr(l.pago_em))}${campo('Situação comercial', l.situacao)}
        ${campo('PGR liberado', l.pgr_liberado_em ? `${L.dataBr(l.pgr_liberado_em)} por ${l.pgr_liberado_por || '?'}` : '')}
        ${campo('SESMT', l.situacao_sesmt + (l.liberado_em ? ` · ${L.dataBr(l.liberado_em)} por ${l.liberado_por || '?'}` : ''))}${campo('Documento', l.resp_documento)}
        ${campo('Enviado', L.dataBr(l.enviado_em))}${campo('Faturado', l.faturado_em ? `${L.dataBr(l.faturado_em)} por ${l.faturado_por || '?'}` : '')}
        ${campo('Nota fiscal', l.nf_numero)}${campo('Boleto', l.boleto_linha ? l.boleto_linha.slice(0, 20) + '…' : '')}
        ${l.observacao ? `<div class="largo"><dt>Observação</dt><dd style="white-space:pre-wrap">${esc(l.observacao)}</dd></div>` : ''}
        <div class="largo"><dt>Última alteração</dt><dd>${esc(L.dataHoraBr(l.atualizado_em))}${l.atualizado_por ? ` por ${esc(l.atualizado_por)}` : ''}${l.origem === 'planilha' ? ' · veio da planilha' : ''}</dd></div>
      </dl>
      <div class="acoes mt16">
        ${l.nf_arquivo ? `<button class="btn btn-ghost" id="cd-nf" type="button">Ver a nota</button>` : ''}
        ${l.boleto_arquivo ? `<button class="btn btn-ghost" id="cd-boleto" type="button">Ver o boleto</button>` : ''}
        ${podeEditar ? `<button class="btn btn-primary" id="cd-editar" type="button" style="width:auto">Editar meu lado</button>` : ''}
      </div>`, { titulo: l.empresa });
    const abrir = async (caminho) => { try { await UI.abrirFora(await N.urlAssinada(CFG.baldeConferencia, caminho, 900)); } catch (e) { toast(e.message, 'err'); } };
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#cd-nf', () => abrir(l.nf_arquivo));
    on('#cd-boleto', () => abrir(l.boleto_arquivo));
    on('#cd-editar', () => { f.fechar(); formulario(l, depois); });
    N.registrar('conferencia_aberta', `${l.empresa} · ${l.servico}`);
  }

  // Linha digitavel de boleto: 47 digitos e os quatro digitos verificadores (modulo 10).
  function boletoValido(linha) {
    const d = String(linha || '').replace(/\D/g, '');
    if (d.length !== 47) return false;
    const mod10 = (s) => { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { let p = Number(s[i]) * peso; if (p > 9) p -= 9; soma += p; peso = peso === 2 ? 1 : 2; } return (10 - (soma % 10)) % 10; };
    return mod10(d.slice(0, 9)) === Number(d[9]) && mod10(d.slice(10, 20)) === Number(d[20]) && mod10(d.slice(21, 31)) === Number(d[31]);
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
      ${pode('nf_arquivo') ? `<div class="fg"><label>Nota fiscal (PDF)</label><div class="flex gap8 items-c"><button type="button" class="btn btn-ghost btn-sm" id="f-nf-sobe">${v.nf_arquivo ? 'Trocar' : 'Anexar'}</button><span class="pequeno text-muted flex1" id="f-nf-nome">${v.nf_arquivo ? 'anexada' : 'nenhuma'}</span></div></div>${inp('nf_numero', 'Número da nota')}` : ''}
      ${pode('boleto_arquivo') ? `<div class="fg"><label>Boleto (PDF)</label><div class="flex gap8 items-c"><button type="button" class="btn btn-ghost btn-sm" id="f-boleto-sobe">${v.boleto_arquivo ? 'Trocar' : 'Anexar'}</button><span class="pequeno text-muted flex1" id="f-boleto-nome">${v.boleto_arquivo ? 'anexado' : 'nenhum'}</span></div></div>${inp('boleto_linha', 'Linha digitável do boleto', 'text', 'inputmode="numeric"')}` : ''}
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${novo ? 'Criar' : 'Salvar'}</button></div></form>`, { titulo: novo ? 'Novo serviço' : 'Editar' });

    $$('[data-sc]', f.caixa).forEach((b) => { b.onclick = () => {
      const on = b.classList.contains('on');
      $$('[data-sc]', f.caixa).forEach((x) => x.classList.remove('on'));
      const fp = $('#f-forma_pagamento', f.caixa), fv = $('#f-valor', f.caixa);
      if (!on) { b.classList.add('on'); fp.value = b.dataset.sc; fv.value = '0'; fv.disabled = true; }
      else { if ([...fp.options].some((o) => o.value === fp.value && ['CORTESIA', 'COORDENAÇÃO'].includes(o.value))) fp.value = ''; fv.disabled = false; }
    }; });
    const subirPdf = async (chave) => {
      const arq = await UI.escolherArquivo('application/pdf');
      if (!arq) return;
      if (!/\.pdf$/i.test(arq.name) || arq.size > 25 * 1024 * 1024) return toast('Só PDF, até 25 MB.', 'err');
      UI.carregando(true, 'Subindo o PDF…');
      try {
        const caminho = L.caminhoAnexo(eu().id, arq.name, N.hex12());
        await N.subir(CFG.baldeConferencia, caminho, arq);
        v[`${chave}_arquivo`] = caminho;
        $(`#f-${chave}-nome`, f.caixa).textContent = arq.name;
      } catch (e) { toast(e.message, 'err'); } finally { UI.carregando(false); }
    };
    const bnf = $('#f-nf-sobe', f.caixa); if (bnf) bnf.onclick = () => subirPdf('nf');
    const bbo = $('#f-boleto-sobe', f.caixa); if (bbo) bbo.onclick = () => subirPdf('boleto');

    $('#cf-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const ler = (campo) => { const el = $(`#f-${campo}`, f.caixa); return el && !el.disabled ? el.value : undefined; };
      let corpo = {};
      for (const campo of [...L.CAMPOS_COMERCIAL, ...L.CAMPOS_SESMT, ...L.CAMPOS_FATURAMENTO, ...L.CAMPOS_PGR]) {
        const val = ler(campo);
        if (val === undefined) continue;
        corpo[campo] = campo === 'valor' ? L.lerDinheiro(val) : campo.endsWith('_em') ? (val || null) : (L.achatar(val) || null);
      }
      if (v.nf_arquivo !== (l?.nf_arquivo ?? undefined) && v.nf_arquivo) corpo.nf_arquivo = v.nf_arquivo;
      if (v.boleto_arquivo !== (l?.boleto_arquivo ?? undefined) && v.boleto_arquivo) corpo.boleto_arquivo = v.boleto_arquivo;
      const marca = $$('[data-sc].on', f.caixa)[0]?.dataset.sc;
      if (marca) corpo.forma_pagamento = marca;
      if (lados.comercial || eu().admin) {
        if (!corpo.empresa) return toast('Diga a empresa.', 'err');
        if (!corpo.servico) return toast('Diga o serviço.', 'err');
        if (!(corpo.valor > 0) && !marca && !L.semCobranca(corpo)) return toast('Valor zero exige marcar cortesia ou coordenação.', 'err');
      }
      if (corpo.boleto_linha && !boletoValido(corpo.boleto_linha)) return toast('A linha digitável do boleto não confere (47 dígitos, verificadores).', 'err');
      if (corpo.faturado_em && !(corpo.nf_arquivo || l?.nf_arquivo)) return toast('Para marcar como faturado, anexe antes o PDF da nota fiscal.', 'err');
      corpo.atualizado_por = eu().nome;
      try {
        if (novo) {
          const { data, error } = await N.sb.from('orc_conferencia').insert({ ...corpo, criado_por: eu().nome, origem: 'sistema', empresa: corpo.empresa || '(sem empresa)', servico: corpo.servico || '(sem serviço)', resp_protocolo: corpo.resp_protocolo || eu().nome }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não criou.');
          N.registrar('conferencia_novo', `${corpo.empresa} · ${corpo.servico}${corpo.os ? ' · OS ' + corpo.os : ''}`);
        } else {
          // Concorrencia: alguem mexeu enquanto a folha estava aberta?
          const { data: agora } = await N.sb.from('orc_conferencia').select('atualizado_em,atualizado_por').eq('id', l.id).limit(1);
          if (agora?.[0] && l.atualizado_em && agora[0].atualizado_em !== l.atualizado_em) throw new Error(`${agora[0].atualizado_por || 'Alguém'} mexeu neste serviço enquanto você estava com ele aberto. Feche e abra de novo.`);
          corpo = L.assinar(l, { ...l, ...corpo }, eu().nome, eu().admin);
          corpo = L.soOMeuLado(corpo, lados);
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
