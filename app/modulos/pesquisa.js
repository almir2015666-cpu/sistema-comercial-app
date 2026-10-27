/* =====================================================================
   Pesquisa e Ouvidoria do site — o que as empresas respondem na pesquisa
   de satisfação e o que chega pela ouvidoria (retornos_tela.py).

   - RESPOSTAS: o que pede atenção em vermelho (nota 1 ou 2, experiência
     ruim, dificuldade com frequência, quem manda exame para outra clínica
     e toda mensagem da ouvidoria). Toque: tudo o que a pessoa respondeu e
     o controle — situação, responsável, o que foi feito, retorno.
   - RESUMO: a média de cada nota, a experiência geral, quem quer conversar
     com o comercial, e o estudo que a IA escreve das respostas do período.

   Quem grava as respostas é o site; o app lê e trata. Mesmo visto do
   computador: Reclamações.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const T = 'orc_retornos_site';
  const SELO = { 'Nova': 'b-4', 'Em andamento': 'b-3', 'Concluída': 'b-ok', 'Arquivada': 'b-gray' };
  const FILTROS = [['abertas', 'Abertas'], ['alerta', 'Com alerta'], ['conversar', 'Querem conversar'], ['todas', 'Todas']];
  const PERIODOS = [[30, '30 dias'], [90, '90 dias'], [365, '12 meses'], [0, 'Tudo']];
  const num = (v) => (v == null ? '—' : String(v).replace('.', ','));

  const listar = () => N.tudo((de, ate) => N.sb.from(T).select('*')
    .order('recebido_em', { ascending: false }).range(de, ate));

  const tela = {
    titulo: 'Pesquisa e Ouvidoria',
    aoTopo(dir) { dir.innerHTML = ''; },
    async desenhar(el) {
      let aba = 'respostas', filtro = 'abertas', busca = '', dias = 90, vivo = true, lista = [];
      const desenhar = async (reler = true) => {
        if (!vivo) return;
        try {
          if (reler) lista = await listar();
          APP.contagens.pesquisa = lista.filter((r) => r.situacao === 'Nova').length;
          const topo = `<div class="tabs"><button class="tab ${aba === 'respostas' ? 'on' : ''}" data-a="respostas">Respostas</button><button class="tab ${aba === 'resumo' ? 'on' : ''}" data-a="resumo">Resumo</button></div>`;
          if (aba === 'respostas') {
            const achados = L.filtrarRetornos(lista, filtro, busca);
            el.innerHTML = `${topo}
              <div class="chips mt12">${FILTROS.map(([k, r]) => `<button class="chip ${k === filtro ? 'on' : ''}" type="button" data-f="${k}">${esc(r)}</button>`).join('')}</div>
              <div class="busca">${ICONES.busca}<input id="pq-busca" placeholder="Procurar" value="${esc(busca)}"></div>
              ${achados.length ? `<div class="lista">${achados.map((r) => {
                const alerta = L.motivosDoAlerta(r);
                const exp = r.formulario === 'ouvidoria' ? (r.assunto || 'Ouvidoria') : (L.camposDaResposta(r).experiencia || '');
                const media = L.mediaDaResposta(r);
                return `<button class="linha" type="button" data-id="${r.id}">
                  ${UI.avatar(L.quemRespondeu(r), 40)}
                  <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(L.quemRespondeu(r))}</span><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span></div>
                  <div class="linha__sub">${r.formulario === 'ouvidoria' ? 'Ouvidoria' : 'Pesquisa'} · ${esc(UI.quando(r.recebido_em))}${exp ? ` · ${esc(exp)}` : ''}${media != null ? ` · média ${num(media)}` : ''}</div>
                  ${alerta.length && L.RET_ABERTAS.includes(r.situacao) ? `<div class="linha__sub" style="color:var(--err, #c0392b)">⚠ ${esc(alerta.join('; '))}</div>` : ''}</div>${ICONES.seta}</button>`;
              }).join('')}</div>` : UI.vazio('Nada aqui', filtro === 'abertas' ? 'Nenhuma resposta esperando a equipe.' : '')}`;
            $$('.chip[data-f]', el).forEach((b) => { b.onclick = () => { filtro = b.dataset.f; desenhar(false); }; });
            const inp = $('#pq-busca', el);
            let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenhar(false).then(() => { const i2 = $('#pq-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 300); };
            $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((r) => r.id === Number(b.dataset.id)), desenhar); });
          } else {
            const inicio = dias ? L.somarDias(L.hojeISO(), -dias) : '';
            const doPeriodo = lista.filter((r) => !inicio || String(r.recebido_em || '').slice(0, 10) >= inicio);
            const s = L.resumoPesquisa(doPeriodo);
            el.innerHTML = `${topo}
              <div class="chips mt12">${PERIODOS.map(([d, r]) => `<button class="chip ${d === dias ? 'on' : ''}" type="button" data-d="${d}">${esc(r)}</button>`).join('')}</div>
              <div class="aviso info mt12">${s.respostas ? `${s.respostas} resposta(s) da pesquisa · média geral ${num(s.mediaGeral)} · ${s.comAlerta} com ponto de atenção · ${s.querem.length} querem conversar` : 'Nenhuma resposta da pesquisa neste período.'}${s.ouvidoria ? ` · ${s.ouvidoria} mensagem(ns) da ouvidoria` : ''}</div>
              <button class="btn btn-ok mt12" id="pq-estudo" type="button">Gerar estudo com IA</button>
              <div class="pequeno text-muted mt16" style="font-weight:700">AS NOTAS (1 a 5)</div>
              <div class="lista">${s.aspectos.map((a) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(a.rotulo)}</span><span class="badge ${a.media != null && a.media < 3 ? 'b-4' : 'b-gray'}">${num(a.media)}</span></div>
                <div class="linha__sub">${a.notas} nota(s)${a.ruins ? ` · ${a.ruins} com 1 ou 2 (${a.pctRuins}%)` : ''}</div></div></div>`).join('')}</div>
              <div class="pequeno text-muted mt16" style="font-weight:700">EXPERIÊNCIA GERAL</div>
              <div class="lista">${L.EXPERIENCIAS.slice().reverse().map((e) => `<div class="linha"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(e)}</span><span class="badge ${s.experiencia[e] && e.includes('nsatisf') ? 'b-4' : 'b-gray'}">${s.experiencia[e]}</span></div></div></div>`).join('')}</div>
              <div class="pequeno text-muted mt16" style="font-weight:700">QUEREM CONVERSAR COM O COMERCIAL</div>
              ${s.querem.length ? `<div class="lista">${s.querem.map((r) => `<button class="linha" type="button" data-id="${r.id}"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(L.quemRespondeu(r))}</span></div>
                <div class="linha__sub">${esc([r.nome, r.email, r.telefone].filter(Boolean).join(' · '))}</div></div>${ICONES.seta}</button>`).join('')}</div>` : '<div class="text-muted pequeno">Ninguém neste período.</div>'}`;
            $$('.chip[data-d]', el).forEach((b) => { b.onclick = () => { dias = Number(b.dataset.d); desenhar(false); }; });
            $$('.linha[data-id]', el).forEach((b) => { b.onclick = () => detalhe(lista.find((r) => r.id === Number(b.dataset.id)), desenhar); });
            $('#pq-estudo', el).onclick = () => estudo(doPeriodo, PERIODOS.find(([d]) => d === dias)[1]);
          }
          $$('.tab', el).forEach((b) => { b.onclick = () => { aba = b.dataset.a; desenhar(false); }; });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenhar();
      const relogio = setInterval(() => { if (!document.hidden && !busca) desenhar(); }, 60000);
      tela._recarregar = desenhar;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  function detalhe(r, depois) {
    if (!r) return;
    const alerta = L.motivosDoAlerta(r);
    const notas = L.notasDaResposta(r);
    const ruins = new Set(L.ASPECTOS.filter(([k]) => (notas[k] ?? 99) <= 2).map(([k]) => k));
    const linhas = (r.respostas || []).filter(Boolean).map((i) => {
      const ruim = ruins.has(i.campo) || ['Muito insatisfatória', 'Insatisfatória'].includes(String(i.valor || '').trim());
      return `<div class="mt12"><div class="pequeno text-muted">${esc(i.rotulo || i.campo)}</div><div style="white-space:pre-wrap;font-weight:600;${ruim ? 'color:var(--err, #c0392b)' : ''}">${esc(String(i.valor ?? '').trim() || '-')}</div></div>`;
    }).join('');
    const f = UI.folha(`
      <div><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span> <span class="badge b-gray">${r.formulario === 'ouvidoria' ? 'Ouvidoria' : 'Pesquisa'}</span></div>
      <div class="pequeno text-muted mt12">Recebida em ${esc(L.dataHoraBr(r.recebido_em))}${L.mediaDaResposta(r) != null ? ` · média ${num(L.mediaDaResposta(r))}` : ''}</div>
      ${alerta.length && r.formulario === 'pesquisa' ? `<div class="aviso atencao mt12">⚠ ${esc(alerta.join('; '))}</div>` : ''}
      ${linhas}
      ${r.mensagem ? `<div class="mt12"><div class="pequeno text-muted">${r.formulario === 'pesquisa' ? 'Sugestões, críticas ou observações' : 'Mensagem'}</div><div style="white-space:pre-wrap;font-weight:600">${esc(r.mensagem)}</div></div>` : ''}
      ${r.email || r.telefone ? `<div class="acoes mt16">${r.email ? `<a class="btn btn-ghost" href="mailto:${esc(r.email)}">E-mail</a>` : ''}${r.telefone ? `<a class="btn btn-ghost" href="tel:${esc(String(r.telefone).replace(/\D/g, ''))}">Ligar</a>` : ''}</div>` : ''}
      <form id="pr" class="mt16">
        <div class="pequeno text-muted" style="font-weight:700">CONTROLE</div>
        <div class="fg mt12"><label>Situação</label><select id="pr-sit">${UI.opcoes(L.RET_SITUACOES, r.situacao || 'Nova')}</select></div>
        <div class="fg"><label>Responsável</label><input id="pr-resp" value="${esc(r.responsavel || '')}" placeholder="quem está cuidando"></div>
        <div class="fg"><label>O que foi feito</label><textarea id="pr-trat" rows="4">${esc(r.tratativa || '')}</textarea></div>
        <div class="fg"><label>Retorno dado em</label><input id="pr-ret" type="date" value="${esc(String(r.retorno_em || '').slice(0, 10))}"></div>
        ${r.reclamacao_id ? `<div class="dica">Virou a reclamação nº ${r.reclamacao_id}.</div>` : ''}
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div>
      </form>`, { titulo: L.quemRespondeu(r) });
    $('#pr', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      let situacao = $('#pr-sit', f.caixa).value;
      const responsavel = $('#pr-resp', f.caixa).value.trim();
      const tratativa = $('#pr-trat', f.caixa).value.trim();
      // as regras do computador (retornos_nucleo): escolher o responsável
      // numa Nova já a põe Em andamento; Concluída pede o que foi feito
      if (situacao === 'Nova' && responsavel) situacao = 'Em andamento';
      if (situacao === 'Concluída' && !tratativa) return toast('Para concluir, escreva o que foi feito.', 'err');
      try {
        await N.mudar(T, { id: r.id }, { situacao, responsavel: responsavel || null, tratativa: tratativa || null,
          retorno_em: $('#pr-ret', f.caixa).value || null, atualizado_por: eu().nome });
        N.registrar('retorno_site_tratado', `${L.quemRespondeu(r)} · ${situacao}`);
        toast('Salvo.', 'ok'); f.fechar(); depois();
      } catch (err) { toast(N.recado(err, "Peça ao administrador o visto 'Reclamações'."), 'err'); }
    };
  }

  /* --------------------------------------- o estudo da IA (orc-email) */
  async function estudo(linhas, periodo) {
    const texto = L.textoParaEstudo(linhas);
    if (!texto) return toast('Não há respostas neste período.', 'info');
    UI.carregando(true, `A IA está lendo ${linhas.length} resposta(s)…`);
    try {
      const { data, error } = await N.sb.functions.invoke('orc-email', { body: { acao: 'estudo', respostas: texto, periodo } });
      if (error) throw new Error((await N.lerErroFuncao(error)) || 'A função do servidor não respondeu.');
      if (data?.error) throw new Error(data.error);
      const PARTES = [['pontos_fortes', 'O QUE ESTÁ INDO BEM'], ['pontos_fracos', 'O QUE ESTÁ INDO MAL'],
        ['pedidos', 'O QUE AS EMPRESAS PEDEM'], ['risco_de_perda', 'RISCO DE PERDER A EMPRESA'], ['acoes', 'O QUE FAZER, POR PRIORIDADE']];
      const corpo = PARTES.filter(([k]) => (data[k] || []).length).map(([k, t]) => `<div class="pequeno text-muted mt16" style="font-weight:700">${t}</div>
        ${(data[k] || []).map((i, n) => `<div class="mt12" style="${k === 'risco_de_perda' ? 'color:var(--err, #c0392b)' : ''}">${k === 'acoes' ? `${n + 1}.` : '•'} ${esc(i)}</div>`).join('')}`).join('');
      const tudo = [data.panorama, ...PARTES.flatMap(([k, t]) => ((data[k] || []).length ? ['', t, ...(data[k] || []).map((i, n) => `${k === 'acoes' ? `${n + 1}.` : '•'} ${i}`)] : []))].join('\n');
      const f = UI.folha(`<div style="font-size:16px;line-height:1.5">${esc(data.panorama || '')}</div>${corpo}
        <div class="dica mt16">Escrito pela IA a partir das respostas: confira antes de levar adiante.</div>
        <div class="modal-ft"><button class="btn btn-ghost" id="es-copiar" type="button">Copiar o estudo</button></div>`, { titulo: `Estudo · ${periodo}` });
      $('#es-copiar', f.caixa).onclick = async () => {
        try { await navigator.clipboard.writeText(tudo); toast('Copiado.', 'ok'); } catch { toast('Não deu para copiar.', 'err'); }
      };
    } catch (e) { toast(e.message, 'err'); }
    finally { UI.carregando(false); }
  }

  async function contar() {
    const { data, error } = await N.sb.from(T).select('id').eq('situacao', 'Nova').limit(1000);
    if (error) throw error;
    return (data || []).length;
  }

  MODULOS.pesquisa = {
    chave: 'pesquisa', nome: 'Pesquisa e Ouvidoria', sub: 'O que as empresas respondem', icone: ICONES.pesquisa,
    // o mesmo visto do computador (76-retornos-site.sql): Reclamações
    precisa: (u) => L.temModulo(u, 'reclamacoes'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
