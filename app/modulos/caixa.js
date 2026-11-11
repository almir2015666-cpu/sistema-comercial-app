/* =====================================================================
   Caixa do Comercial — o que chega em comercial@medicinahumana.com.br
   (caixa_tela.py no computador).

   SÓ ACOMPANHA, a pedido do dono: nada aqui responde, move ou apaga
   e-mail. Quem lê a caixa é a orc-email (ação "caixa"), só para leitura;
   a IA classifica e avalia a resposta. Aqui:

   - os números do período: recebidos, sem resposta, respondidos, tempo
     médio de resposta (EM HORÁRIO ÚTIL), reclamações, respostas boas;
   - E-MAILS: a lista, com o que passou de 4 h úteis sem resposta em
     vermelho. Toque: o que chegou, a primeira resposta da equipe, quanto
     levou, a avaliação da IA — e a correção quando a IA errou;
   - CATEGORIAS: quantos de cada, quantos sem resposta e o tempo médio.
   - na PESQUISA entram também os e-mails que a equipe mandou, e o chip
     "Excluídos" traz o que foi para a lixeira (🗑), recebido ou enviado
     (pedido do dono, 11/11/2026).

   As regras são as do computador (L.cx* em logica.js = caixa_nucleo.py).
   Visto próprio, o mesmo do computador: Caixa do Comercial.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const T = 'orc_caixa_mensagens';
  const COLUNAS = 'id,quando,de,de_nome,para,cc,assunto,pasta,interno,automatico,encaminhamento,categoria,resumo,empresa,' +
    'prioridade,tom,precisa_resposta,classificado_em,categoria_manual,precisa_manual,corrigido_por,respondido_em,' +
    'resposta_id,resposta_de,resposta_para,encaminhado,avaliacao_nota,avaliacao,sentido,anexos,pasta_imap';
  // o que a equipe mandou: aparece na pesquisa e em "Excluídos"
  const COLUNAS_ENVIADOS = 'id,quando,de,de_nome,para,cc,assunto,pasta,sentido,anexos,pasta_imap';
  // as colunas do 83 (anexos e onde está): sem ele rodado, vêm sem
  const sem83 = (c) => c.replace(',anexos', '').replace(',pasta_imap', '');
  const SELO = { 'Sem resposta': 'b-4', 'Respondido': 'b-ok', 'Encaminhado': 'b-3', 'Não precisa': 'b-gray' };
  const NOTA = { Boa: 'b-ok', Regular: 'b-4', Fraca: 'b-err' };
  const VERMELHO = 'color:var(--err, #c0392b)';
  // a lista desenha no máximo isto: o mês inteiro passa de cinco mil
  const TETO_LISTA = 300;
  const LER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>';
  const pct = (v) => (v == null ? '—' : `${v}%`);

  const listar = async (periodo, sentido = 'recebido', colunas = COLUNAS) => {
    const [de, ate] = L.cxIntervalo(periodo);
    const pedir = (cols) => N.tudo((ini, fim) => {
      let q = N.sb.from(T).select(cols).eq('sentido', sentido);
      if (de) q = q.gte('quando', L.cxUtc(de)).lt('quando', L.cxUtc(ate));
      return q.order('quando', { ascending: false }).range(ini, fim);
    }, 30000);
    try { return await pedir(colunas); } catch (e) {
      // sem o 83 rodado, as colunas dos anexos e da pasta não existem
      if (!/anexos|pasta_imap/.test(String(e?.message || ''))) throw e;
      return pedir(sem83(colunas));
    }
  };
  // os enviados: se falharem, a tela segue só com os recebidos
  const listarEnviados = (periodo) => listar(periodo, 'enviado', COLUNAS_ENVIADOS).catch(() => []);

  // uma volta de leitura da caixa, no servidor (até uns 2 minutos)
  async function lerCaixa() {
    const { data, error } = await N.sb.functions.invoke('orc-email', { body: { acao: 'caixa' } });
    if (error) throw new Error((await N.lerErroFuncao(error)) || 'A função do servidor não respondeu.');
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  const tela = {
    titulo: 'Caixa do Comercial',
    aoTopo(dir) {
      dir.innerHTML = '';
      dir.appendChild(UI.botaoTopo(LER, () => tela._ler && tela._ler(true), 'Ler a caixa agora'));
    },
    async desenhar(el) {
      let aba = 'emails', periodo = '7', mostrar = 'todos', cat = '', busca = '', soClientes = true;
      let vivo = true, lista = [], enviados = [], lendo = false, estado = '', erroLeitura = '';
      const desenhar = async (reler = true) => {
        if (!vivo) return;
        try {
          if (reler) [lista, enviados] = await Promise.all([listar(periodo), listarEnviados(periodo)]);
          const apagados = [...lista, ...enviados].filter(L.cxExcluido).length;
          const base = soClientes ? lista.filter(L.cxDoCliente) : lista;
          const k = L.cxIndicadores(base);
          const numero = (valor, rotulo, cor = '', filtro = '') =>
            `<button class="numero" type="button" ${filtro ? `data-n="${filtro}"` : ''} style="font:inherit"><b style="font-size:19px${cor ? `;color:${cor}` : ''}">${esc(valor)}</b><span>${esc(rotulo)}</span></button>`;
          const topo = `
            <div class="chips">${L.CX_PERIODOS.map(([p, r]) => `<button class="chip ${p === periodo ? 'on' : ''}" type="button" data-p="${p}">${esc(r)}</button>`).join('')}</div>
            ${erroLeitura ? `<div class="aviso erro">${esc(erroLeitura)}</div>` : estado ? `<div class="pequeno text-muted">${esc(estado)}</div>` : ''}
            <div class="numeros mt12">
              ${numero(String(k.recebidos), 'Recebidos')}
              ${numero(String(k.semResposta), 'Sem resposta', k.atrasados ? '#c0392b' : '', 'sem_resposta')}
              ${numero(pct(k.respondidosPct), 'Respondidos', '', 'respondidos')}
              ${numero(L.duracaoUtil(k.tempoMedio) || '—', 'Tempo médio')}
              ${numero(String(k.reclamacoes), 'Reclamações', k.reclamacoesSem ? '#c0392b' : '', 'reclamacoes')}
              ${numero(pct(k.boasPct), 'Respostas boas', '', 'fracas')}
            </div>
            <div class="pequeno text-muted mt8">${k.atrasados ? `${k.atrasados} sem resposta há mais de 4 h úteis · ` : ''}${k.tempoMediana != null ? `metade respondida em até ${esc(L.duracaoUtil(k.tempoMediana))} · ` : ''}${k.ate4hPct != null ? `${k.ate4hPct}% em até 4 h · ` : ''}horário útil (seg. a sex., 8h às 18h) · a equipe mandou ${enviados.length}${apagados ? ` · ${apagados} excluído(s)` : ''}</div>
            <div class="tabs mt12"><button class="tab ${aba === 'emails' ? 'on' : ''}" data-a="emails">E-mails</button><button class="tab ${aba === 'categorias' ? 'on' : ''}" data-a="categorias">Categorias</button></div>`;
          if (aba === 'emails') {
            // os que chegaram e — na pesquisa e em "Excluídos" — os que a
            // equipe mandou, do mais novo para o mais antigo
            const achados = [...L.cxFiltrar(lista, mostrar, cat, busca, soClientes),
              ...L.cxFiltrarEnviados(enviados, mostrar, cat, busca)]
              .sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')));
            el.innerHTML = `${topo}
              <div class="chips mt12">
                ${cat ? `<button class="chip on" type="button" id="cx-tira-cat">${esc(cat)} ✕</button>` : ''}
                ${L.CX_MOSTRAR.map(([m, r]) => `<button class="chip ${m === mostrar ? 'on' : ''}" type="button" data-m="${m}">${esc(r)}</button>`).join('')}
                <button class="chip ${soClientes ? '' : 'on'}" type="button" id="cx-equipe">Equipe e avisos</button>
              </div>
              <div class="busca">${ICONES.busca}<input id="cx-busca" placeholder="Procurar" value="${esc(busca)}"></div>
              ${achados.length ? `<div class="lista">${achados.slice(0, TETO_LISTA).map((r) => {
                const lixo = L.cxExcluido(r) ? '🗑 ' : '';
                const clipe = (L.anexosDoEmail(r) || []).length ? '📎 ' : '';
                if (L.cxEnviado(r)) {
                  const para = String(r.para || '').split(',')[0].trim();
                  return `<button class="linha" type="button" data-id="${r.id}">
                  <div class="linha__corpo"><div class="linha__titulo"><span class="t">${lixo}${clipe}${esc(r.assunto || '(sem assunto)')}</span><span class="badge b-3">Enviado</span></div>
                  <div class="linha__sub">${esc(UI.quando(r.quando))} · para ${esc(para || '(sem destinatário)')}</div>
                  <div class="linha__sub">Enviado pela equipe</div></div>${ICONES.seta}</button>`;
                }
                const s = L.cxSituacao(r);
                const atraso = L.cxAtrasado(r);
                const tempo = s === L.CX_SEM_RESPOSTA ? `há ${L.duracaoUtil(L.cxEsperando(r))}`
                  : [L.CX_RESPONDIDO, L.CX_ENCAMINHADO].includes(s) ? L.duracaoUtil(L.cxTempoResposta(r)) : '';
                const quem = [L.cxEmpresa(r), L.cxQuem(r)].filter(Boolean).join(' · ');
                return `<button class="linha" type="button" data-id="${r.id}">
                  <div class="linha__corpo"><div class="linha__titulo"><span class="t">${lixo}${r.prioridade === 'Urgente' ? '⚠ ' : ''}${clipe}${esc(r.assunto || '(sem assunto)')}</span><span class="badge ${atraso ? 'b-err' : SELO[s] || 'b-gray'}">${esc(s)}</span></div>
                  <div class="linha__sub">${esc(UI.quando(r.quando))} · ${esc(quem)}</div>
                  <div class="linha__sub" style="${atraso ? VERMELHO : ''}">${esc(L.cxCategoria(r))}${tempo ? ` · ${esc(tempo)}` : ''}${r.avaliacao_nota ? ` · resposta ${esc(r.avaliacao_nota.toLowerCase())}` : ''}</div></div>${ICONES.seta}</button>`;
              }).join('')}</div>
              ${achados.length > TETO_LISTA ? `<div class="pequeno text-muted mt8">Mostrando ${TETO_LISTA} de ${achados.length}. Use os filtros ou a busca para achar o resto.</div>` : ''}`
              : UI.vazio('Nada aqui', lista.length ? 'Nenhum e-mail com esses filtros.' : 'Nenhum e-mail neste período.')}`;
            $$('.chip[data-m]', el).forEach((b) => { b.onclick = () => { mostrar = b.dataset.m; desenhar(false); }; });
            const tira = $('#cx-tira-cat', el);
            if (tira) tira.onclick = () => { cat = ''; desenhar(false); };
            $('#cx-equipe', el).onclick = () => { soClientes = !soClientes; desenhar(false); };
            const inp = $('#cx-busca', el);
            let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenhar(false).then(() => { const i2 = $('#cx-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 300); };
            $$('.linha[data-id]', el).forEach((b) => {
              b.onclick = () => {
                const r = achados.find((x) => x.id === Number(b.dataset.id));
                if (L.cxEnviado(r)) detalheEnviado(r); else detalhe(r, () => desenhar(false), lista);
              };
            });
          } else {
            const cats = L.cxPorCategoria(base);
            el.innerHTML = `${topo}
              ${cats.length ? `<div class="lista mt12">${cats.map((c) => `<button class="linha" type="button" data-c="${esc(c.categoria)}">
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(c.categoria)}</span><span class="badge b-gray">${c.recebidos}</span></div>
                <div class="linha__sub" style="${c.atrasados ? VERMELHO : ''}">${c.semResposta ? `${c.semResposta} sem resposta` : 'todos respondidos ou sem precisar'}${c.tempoMedio != null ? ` · tempo médio ${esc(L.duracaoUtil(c.tempoMedio))}` : ''}</div></div>${ICONES.seta}</button>`).join('')}</div>`
              : UI.vazio('Nada aqui', 'Nenhum e-mail neste período.')}`;
            $$('.linha[data-c]', el).forEach((b) => { b.onclick = () => { cat = b.dataset.c; mostrar = 'todos'; aba = 'emails'; desenhar(false); }; });
          }
          $$('.chip[data-p]', el).forEach((b) => { b.onclick = () => { periodo = b.dataset.p; desenhar(); }; });
          $$('.numero[data-n]', el).forEach((b) => { b.onclick = () => { mostrar = b.dataset.n; cat = ''; aba = 'emails'; desenhar(false); }; });
          $$('.tab', el).forEach((b) => { b.onclick = () => { aba = b.dataset.a; desenhar(false); }; });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e, "Peça ao administrador o visto 'Caixa do Comercial'."))}</div>`; }
      };

      // LER A CAIXA: ao abrir e no botão do topo. A primeira leitura (o mês
      // passado inteiro) é longa e fica com o computador; aqui, umas voltas
      // e pronto — o que faltar a próxima abertura continua.
      const ler = async (avisar = false) => {
        if (lendo || !vivo) return;
        lendo = true; erroLeitura = ''; estado = 'Lendo a caixa…'; desenhar(false);
        try {
          for (let volta = 0; volta < 5 && vivo; volta += 1) {
            const r = await lerCaixa();
            if (r.ocupado) { estado = 'Outra máquina está lendo a caixa agora.'; break; }
            const partes = [r.lido_em ? `Caixa lida às ${L.horaBr(r.lido_em)}` : ''];
            const faltam = (r.pastas_a_iniciar || 0) + (r.pastas_com_novidade || 0);
            if (faltam) partes.push(`faltam ${faltam} pasta(s)`);
            if (r.faltam_classificar) partes.push(`a IA está classificando (faltam ${r.faltam_classificar})`);
            if (r.aviso) partes.push(r.aviso);
            estado = partes.filter(Boolean).join(' · ');
            const andou = r.novas || r.pareadas || r.classificadas || r.avaliadas;
            if (andou) await desenhar(true);
            if (!andou || !(faltam || r.faltam_classificar || r.faltam_avaliar)) break;
          }
          if (avisar) toast('Caixa lida.', 'ok');
        } catch (e) { erroLeitura = e.message; }
        finally { lendo = false; if (vivo) desenhar(false); }
      };

      await desenhar();
      ler();
      // de 5 em 5 minutos, como no computador
      const relogio = setInterval(() => { if (!document.hidden && !busca) ler(); }, 300000);
      tela._recarregar = desenhar;
      tela._ler = ler;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; tela._ler = null; };
    },
  };

  function detalhe(r, depois, lista) {
    if (!r) return;
    const s = L.cxSituacao(r);
    const ruim = L.cxCategoria(r) === 'Reclamação' || r.prioridade === 'Urgente' || r.tom === 'Insatisfeito';
    const classe = [L.cxCategoria(r), r.prioridade && `prioridade ${r.prioridade}`, r.tom && `cliente ${r.tom.toLowerCase()}`].filter(Boolean).join(' · ');
    let resposta;
    if (s === L.CX_SEM_RESPOSTA) {
      resposta = `<div class="aviso ${L.cxAtrasado(r) ? 'erro' : 'atencao'} mt12">Sem resposta há ${esc(L.expedienteBr(L.cxEsperando(r)))}</div>`;
    } else if (s === L.CX_NAO_PRECISA) {
      resposta = `<div class="text-muted mt12">Não precisa de resposta (${r.precisa_manual === false ? 'corrigido pela equipe' : 'aviso, propaganda ou só para conhecimento'}).</div>`;
    } else {
      resposta = `<div class="mt12" style="font-weight:700;color:var(--ok, #15803d)">${esc(s)} por ${esc(r.resposta_de || 'comercial@medicinahumana.com.br')} em ${esc(L.dataHoraBr(r.respondido_em))} · levou ${esc(L.expedienteBr(L.cxTempoResposta(r)))}</div>
        ${r.resposta_para ? `<div class="pequeno text-muted">para ${esc(r.resposta_para)}</div>` : ''}
        ${r.avaliacao_nota ? `<div class="mt8"><span class="badge ${NOTA[r.avaliacao_nota] || 'b-gray'}">Resposta ${esc(r.avaliacao_nota.toLowerCase())}</span> ${esc(r.avaliacao || '')}</div>` : ''}
        <div id="cx-resp" class="mt8 text-muted" style="white-space:pre-wrap">carregando…</div>`;
    }
    const f = UI.folha(`
      <div><span class="badge ${L.cxAtrasado(r) ? 'b-err' : SELO[s] || 'b-gray'}">${esc(s)}</span></div>
      <div class="pequeno text-muted mt12">De: ${esc(L.cxQuem(r))} &lt;${esc(r.de || '')}&gt;</div>
      <div class="pequeno text-muted">Chegou em ${esc(L.dataHoraBr(r.quando))}${r.pasta ? ` · pasta ${esc(r.pasta)}` : ''}${L.cxEmpresa(r) ? ` · ${esc(L.cxEmpresa(r))}` : ''}</div>
      ${avisoExcluido(r)}
      <div class="mt12" style="font-weight:700;${ruim ? VERMELHO : ''}">${esc(classe)}</div>
      ${r.resumo ? `<div class="mt8">Resumo da IA: ${esc(r.resumo)}</div>` : ''}
      <div class="pequeno text-muted mt16" style="font-weight:700">O QUE CHEGOU</div>
      <div id="cx-texto" class="mt8" style="white-space:pre-wrap">carregando…</div>
      <div id="cx-anexos"></div>
      <div class="pequeno text-muted mt16" style="font-weight:700">A RESPOSTA DA EQUIPE</div>
      ${resposta}
      <form id="cx-corr" class="mt16">
        <div class="pequeno text-muted" style="font-weight:700">A IA ERROU? CORRIJA</div>
        <div class="fg mt12"><label>Categoria</label><select id="cx-cat">${UI.opcoes(L.CX_CATEGORIAS, L.CX_CATEGORIAS.includes(L.cxCategoria(r)) ? L.cxCategoria(r) : L.CX_CATEGORIAS[0])}</select></div>
        <label class="mt8" style="display:flex;gap:8px;align-items:center"><input id="cx-precisa" type="checkbox" ${L.cxPrecisa(r) ? 'checked' : ''}> Precisa de resposta</label>
        ${r.corrigido_por ? `<div class="pequeno text-muted mt8">Corrigido por ${esc(r.corrigido_por)}.</div>` : ''}
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div>
      </form>`, { titulo: r.assunto || '(sem assunto)' });

    // os arquivos que vieram no e-mail: um toque abre
    UI.anexosDoEmail($('#cx-anexos', f.caixa), r, 'comercial');
    // os textos vêm um a um: a lista chega sem eles (são o que pesa)
    (async () => {
      try {
        const { data } = await N.sb.from(T).select('texto').eq('id', r.id).maybeSingle();
        const alvo = $('#cx-texto', f.caixa);
        if (alvo) alvo.textContent = (data?.texto || '').trim() || '(sem texto)';
        if (r.resposta_id) {
          const { data: sai } = await N.sb.from(T).select('texto').eq('message_id', r.resposta_id).maybeSingle();
          const alvo2 = $('#cx-resp', f.caixa);
          if (alvo2) { alvo2.textContent = (sai?.texto || '').trim() || '(sem texto)'; alvo2.classList.remove('text-muted'); }
        }
      } catch (e) {
        const alvo = $('#cx-texto', f.caixa);
        if (alvo) alvo.textContent = N.recado(e);
      }
    })();

    $('#cx-corr', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const categoria = $('#cx-cat', f.caixa).value;
      const precisa = $('#cx-precisa', f.caixa).checked;
      try {
        const nova = await N.mudar(T, { id: r.id }, { categoria_manual: categoria, precisa_manual: precisa, corrigido_por: eu().nome });
        Object.assign(r, nova);
        const i = lista.findIndex((x) => x.id === r.id);
        if (i >= 0) lista[i] = r;
        N.registrar('caixa_corrigida', `${String(r.assunto || '').slice(0, 60)} · ${categoria}`);
        toast('Corrigido.', 'ok'); f.fechar(); depois();
      } catch (err) { toast(N.recado(err, "Peça ao administrador o visto 'Caixa do Comercial'."), 'err'); }
    };
  }

  // o e-mail que a equipe apagou (está na lixeira da comercial@)
  function avisoExcluido(r) {
    return L.cxExcluido(r)
      ? `<div class="aviso atencao mt12">🗑 Excluído pela equipe — está na pasta ${esc(L.cxNomePasta(r.pasta_imap))} da comercial@</div>`
      : '';
  }

  // Um e-mail que a EQUIPE MANDOU: quem, para quem, o texto e os anexos.
  // Não tem categoria, resposta nem avaliação — nem a correção.
  function detalheEnviado(r) {
    if (!r) return;
    const f = UI.folha(`
      <div><span class="badge b-3">Enviado pela equipe</span></div>
      <div class="pequeno text-muted mt12">De: ${esc(L.cxQuem(r))} &lt;${esc(r.de || '')}&gt;</div>
      <div class="pequeno text-muted">Para: ${esc(r.para || '—')}</div>
      ${r.cc ? `<div class="pequeno text-muted">Cópia: ${esc(r.cc)}</div>` : ''}
      <div class="pequeno text-muted">Enviado em ${esc(L.dataHoraBr(r.quando))}${r.pasta ? ` · pasta ${esc(r.pasta)}` : ''}</div>
      ${avisoExcluido(r)}
      <div class="pequeno text-muted mt16" style="font-weight:700">O QUE A EQUIPE ESCREVEU</div>
      <div id="cx-texto" class="mt8" style="white-space:pre-wrap">carregando…</div>
      <div id="cx-anexos"></div>`, { titulo: r.assunto || '(sem assunto)' });
    UI.anexosDoEmail($('#cx-anexos', f.caixa), r, 'comercial');
    (async () => {
      const alvo = () => $('#cx-texto', f.caixa);
      try {
        const { data } = await N.sb.from(T).select('texto').eq('id', r.id).maybeSingle();
        if (alvo()) alvo().textContent = (data?.texto || '').trim() || '(sem texto)';
      } catch (e) { if (alvo()) alvo().textContent = N.recado(e); }
    })();
  }

  MODULOS.caixa = {
    chave: 'caixa', nome: 'Caixa do Comercial', sub: 'O que chega e como respondemos', icone: ICONES.caixa,
    // visto próprio, o mesmo do computador (82-caixa-comercial.sql)
    precisa: (u) => L.temModulo(u, 'caixa_comercial'),
    abrir: () => UI.ir(tela),
  };
})();
