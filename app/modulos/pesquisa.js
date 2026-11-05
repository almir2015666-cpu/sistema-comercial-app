/* =====================================================================
   Pesquisa e Ouvidoria do site — o que as empresas respondem na pesquisa
   de satisfação e o que chega pela ouvidoria (retornos_tela.py).

   - RESPOSTAS: o que pede atenção em vermelho (nota 1 ou 2, experiência
     ruim, dificuldade com frequência, quem manda exame para outra clínica
     e toda mensagem da ouvidoria). Toque: tudo o que a pessoa respondeu e
     o controle — situação, responsável, o que foi feito, retorno.
   - ✉ RESPONDER: a IA escreve à pessoa a partir do que ela respondeu, em
     opções por tom, com o "Pedir à IA" e o ajustar da prospecção; o envio
     grava o retorno no controle.
   - RESUMO: a média de cada nota, a experiência geral, quem quer conversar
     com o comercial, e o estudo que a IA escreve das respostas do período.

   Quem grava as respostas é o site; o app lê e trata. Mesmo visto do
   computador: Pesquisa e Ouvidoria.
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

  // tudo o que a pessoa respondeu, com o que puxou o alerta em vermelho
  function htmlRespostas(r) {
    const notas = L.notasDaResposta(r);
    const ruins = new Set(L.ASPECTOS.filter(([k]) => (notas[k] ?? 99) <= 2).map(([k]) => k));
    const linhas = (r.respostas || []).filter(Boolean).map((i) => {
      const ruim = ruins.has(i.campo) || ['Muito insatisfatória', 'Insatisfatória'].includes(String(i.valor || '').trim());
      return `<div class="mt12"><div class="pequeno text-muted">${esc(i.rotulo || i.campo)}</div><div style="white-space:pre-wrap;font-weight:600;${ruim ? 'color:var(--err, #c0392b)' : ''}">${esc(String(i.valor ?? '').trim() || '-')}</div></div>`;
    }).join('');
    return linhas + (r.mensagem ? `<div class="mt12"><div class="pequeno text-muted">${r.formulario === 'pesquisa' ? 'Sugestões, críticas ou observações' : 'Mensagem'}</div><div style="white-space:pre-wrap;font-weight:600">${esc(r.mensagem)}</div></div>` : '');
  }

  function detalhe(r, depois) {
    if (!r) return;
    const alerta = L.motivosDoAlerta(r);
    const f = UI.folha(`
      <div><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span> <span class="badge b-gray">${r.formulario === 'ouvidoria' ? 'Ouvidoria' : 'Pesquisa'}</span></div>
      <div class="pequeno text-muted mt12">Recebida em ${esc(L.dataHoraBr(r.recebido_em))}${L.mediaDaResposta(r) != null ? ` · média ${num(L.mediaDaResposta(r))}` : ''}</div>
      ${alerta.length && r.formulario === 'pesquisa' ? `<div class="aviso atencao mt12">⚠ ${esc(alerta.join('; '))}</div>` : ''}
      ${htmlRespostas(r)}
      ${r.email ? `<button class="btn btn-ok mt16" id="pr-responder" type="button">✉ Responder por e-mail</button>` : ''}
      ${r.email || r.telefone ? `<div class="acoes mt12">${r.email ? `<a class="btn btn-ghost" href="mailto:${esc(r.email)}">Abrir no app de e-mail</a>` : ''}${r.telefone ? `<a class="btn btn-ghost" href="tel:${esc(String(r.telefone).replace(/\D/g, ''))}">Ligar</a>` : ''}</div>` : ''}
      <form id="pr" class="mt16">
        <div class="pequeno text-muted" style="font-weight:700">CONTROLE</div>
        <div class="fg mt12"><label>Situação</label><select id="pr-sit">${UI.opcoes(L.RET_SITUACOES, r.situacao || 'Nova')}</select></div>
        <div class="fg"><label>Responsável</label><input id="pr-resp" value="${esc(r.responsavel || '')}" placeholder="quem está cuidando"></div>
        <div class="fg"><label>O que foi feito</label><textarea id="pr-trat" rows="4">${esc(r.tratativa || '')}</textarea></div>
        <div class="fg"><label>Retorno dado em</label><input id="pr-ret" type="date" value="${esc(String(r.retorno_em || '').slice(0, 10))}"></div>
        ${r.reclamacao_id ? `<div class="dica">Virou a reclamação nº ${r.reclamacao_id}.</div>` : ''}
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div>
      </form>`, { titulo: L.quemRespondeu(r) });
    const bResp = $('#pr-responder', f.caixa);
    if (bResp) bResp.onclick = () => responder(r, depois);
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

  /* ---------------------------- responder quem respondeu (orc-email) */
  // Igual à resposta da prospecção, a pedido do dono (05/11/2026: "para a
  // pessoa não ficar sem resposta"): a IA escreve a partir do que a pessoa
  // respondeu, uma opção por tom marcado; em "✨ Pedir à IA" a equipe diz o
  // que a resposta tem de falar, e "Ajustar" mexe só nisso no texto da
  // caixa — as versões de antes continuam nos botões. Sai do Gmail da
  // clínica, com cópia na comercial@, e o servidor grava o retorno no
  // controle (o texto na tratativa, a data e quem respondeu).
  async function funcaoEmail(corpo) {
    const { data, error } = await N.sb.functions.invoke('orc-email', { body: { ...corpo, ...(await N.onde()) } });
    if (error) throw new Error(L.recadoRetorno((await N.lerErroFuncao(error)) || 'A função do servidor não respondeu.'));
    if (data?.error) throw new Error(L.recadoRetorno(data.error));
    return data;
  }

  const TETO_ANEXOS = 20 * 1024 * 1024;     // o mesmo do computador
  const lerBase64 = (arquivo) => new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''));
    leitor.onerror = () => falha(new Error('Não consegui ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });

  // `volta`: o que estava na tela quando a confirmação foi recusada ou o
  // envio falhou — a confirmação usa a MESMA folha e apaga o formulário,
  // então a tela reabre com tudo, sem pedir à IA de novo
  function responder(r, depois, volta = null) {
    const st = volta || { assunto: L.assuntoDoRetorno(r), pedido: '', tons: L.tonsPadraoRetorno(r), opcoes: [], atual: -1,
      texto: '', resumo: '', anexos: [], concluir: L.concluirAoResponder(r), ajustadas: 0 };
    const f = UI.folha(`
      <details><summary class="pequeno" style="font-weight:700">O QUE A PESSOA RESPONDEU</summary>${htmlRespostas(r)}</details>
      ${r.retorno_em ? `<div class="aviso atencao mt12">Esta resposta já teve retorno em ${esc(L.dataBr(r.retorno_em))}.</div>` : ''}
      <div id="rr-resumo" class="pequeno mt12" style="font-weight:600">${esc(st.resumo)}</div>
      <form id="rr-form" class="mt12">
        <div class="fg"><label>Assunto</label><input id="rr-assunto" value="${esc(st.assunto)}"></div>
        <div class="fg"><label>✨ Pedir à IA <span class="text-muted">(o que a resposta precisa dizer, ou de que jeito)</span></label>
          <textarea id="rr-pedido" rows="3" maxlength="1000" placeholder="Ex.: dizer que já reforçamos a recepção de Camaçari; pedir desculpas pela demora do ASO; mais curta">${esc(st.pedido)}</textarea>
          <div class="pequeno text-muted mt8">Tons — até 4; sem tom, sai uma versão do seu jeito</div>
          <div class="chips mt8" id="rr-tons">${L.TONS_RETORNO.map(([k, rot]) => `<button type="button" class="chip ${st.tons.includes(k) ? 'on' : ''}" data-tom="${esc(k)}">${esc(rot)}</button>`).join('')}</div>
          <div class="acoes mt8"><button class="btn btn-ghost" id="rr-escrever" type="button">✨ Escrever de novo</button><button class="btn btn-ghost" id="rr-ajustar" type="button">✏ Ajustar o texto</button></div></div>
        <div class="chips" id="rr-opcoes"></div>
        <div class="fg"><label>Sua resposta <span class="text-muted">(escrita pela IA — revise)</span></label>
          <textarea id="rr-texto" rows="12" maxlength="8000">${esc(st.texto)}</textarea>
          <div class="dica">Vai para ${esc(r.email)}, do Gmail da clínica, com cópia na comercial@.</div></div>
        <div class="fg"><label>Anexos <span class="text-muted">(quantos quiser, até 20 MB somados)</span></label>
          <div id="rr-anexos" class="pequeno"></div>
          <button class="btn btn-ghost mt8" id="rr-anexar" type="button">📎 Anexar arquivos</button></div>
        <label class="mt12" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rr-concluir" ${st.concluir ? 'checked' : ''}> Concluir depois de enviar</label>
        <div class="dica">Crítica fica "Em andamento" até a melhoria sair; elogio já pode concluir.</div>
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Enviar resposta</button></div>
      </form>`, { titulo: `Responder ${L.quemRespondeu(r)}` });
    const caixa = () => $('#rr-texto', f.caixa);

    // AS OPÇÕES: trocar de botão guarda o que foi editado na anterior
    const guardar = () => { if (st.opcoes[st.atual]) st.opcoes[st.atual].texto = caixa().value; };
    const desenharOpcoes = () => {
      const alvo = $('#rr-opcoes', f.caixa);
      alvo.innerHTML = st.opcoes.length > 1 ? st.opcoes.map((o, i) => `<button type="button" class="chip ${i === st.atual ? 'on' : ''}" data-op="${i}">${esc(o.titulo)}</button>`).join('') : '';
      $$('[data-op]', alvo).forEach((b) => {
        b.onclick = () => { guardar(); st.atual = Number(b.dataset.op); caixa().value = st.opcoes[st.atual].texto; desenharOpcoes(); };
      });
    };
    desenharOpcoes();
    $$('#rr-tons .chip', f.caixa).forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.tom;
        if (st.tons.includes(k)) st.tons = st.tons.filter((t) => t !== k);
        else if (st.tons.length >= 4) return toast('No máximo quatro tons por vez.', 'err');
        else st.tons.push(k);
        b.classList.toggle('on', st.tons.includes(k));
      };
    });

    const sugerir = async (ajustar = false) => {
      const pedido = $('#rr-pedido', f.caixa).value.trim();
      const atual = caixa().value.trim();
      if (ajustar && !pedido) { $('#rr-pedido', f.caixa).focus(); return toast('Escreva em "Pedir à IA" o que mudar no texto (ex.: mais curta; diga que já reforçamos a recepção).', 'err', 5000); }
      if (ajustar && !atual) return toast('A caixa da resposta está vazia: use "Escrever de novo".', 'err');
      if (!ajustar && !st.tons.length && !pedido) return toast('Marque um tom, ou escreva em "Pedir à IA" o que a resposta precisa dizer.', 'err', 5000);
      UI.carregando(true, ajustar ? 'A IA está ajustando o texto…' : 'A IA está escrevendo a resposta…');
      try {
        const s = await funcaoEmail(L.corpoRetornoSugerir(r.id, { tons: ajustar ? [] : st.tons, pedido, base: ajustar ? atual : '' }));
        const novas = (s.opcoes || []).filter((o) => o && o.texto);
        if (!novas.length) throw new Error('A IA voltou sem o texto.');
        guardar();
        if (ajustar) {
          // as versões de antes ficam: ajuste que ficou pior não custa o texto bom
          if (!st.opcoes[st.atual]) st.opcoes.push({ titulo: '✎ Seu texto', texto: atual, original: atual });
          st.ajustadas += 1;
          st.opcoes.push({ titulo: st.ajustadas === 1 ? 'Ajustada' : `Ajustada ${st.ajustadas}`, texto: novas[0].texto, original: novas[0].texto });
          st.atual = st.opcoes.length - 1;
        } else {
          // o que a pessoa já EDITOU não se perde: fica como "✎ Seu texto"
          const aberta = st.opcoes[st.atual];
          const meu = atual && (!aberta || atual !== String(aberta.original || '').trim())
            ? { titulo: '✎ Seu texto', texto: atual, original: atual } : null;
          st.opcoes = novas.map((o) => ({ titulo: o.titulo || o.tom, texto: o.texto, original: o.texto }));
          if (meu) st.opcoes.push(meu);
          st.atual = 0;
        }
        caixa().value = st.opcoes[st.atual].texto;
        if (s.resumo) { st.resumo = s.resumo; $('#rr-resumo', f.caixa).textContent = s.resumo; }
        desenharOpcoes();
        toast(ajustar ? 'Texto ajustado. As versões de antes continuam nos botões.'
          : novas.length > 1 ? `${novas.length} opções prontas: toque nos botões para comparar. Revise antes de enviar.` : 'Resposta pronta. Revise antes de enviar.', 'ok', 4000);
      } catch (e) { toast(e.message, 'err', 6000); }
      finally { UI.carregando(false); }
    };
    $('#rr-escrever', f.caixa).onclick = () => sugerir(false);
    $('#rr-ajustar', f.caixa).onclick = () => sugerir(true);

    const desenharAnexos = () => {
      const alvo = $('#rr-anexos', f.caixa);
      alvo.innerHTML = st.anexos.length ? st.anexos.map((a, i) => `<div class="mt8" style="display:flex;gap:8px;align-items:center"><span class="flex1">📎 ${esc(a.nome)} <span class="text-muted">(${esc(L.tamanhoLegivel(a.tamanho))})</span></span><button class="btn-icon" type="button" data-tira="${i}" aria-label="Tirar o anexo">✕</button></div>`).join('')
        : '<span class="text-muted">nenhum</span>';
      $$('[data-tira]', alvo).forEach((b) => { b.onclick = () => { st.anexos.splice(Number(b.dataset.tira), 1); desenharAnexos(); }; });
    };
    desenharAnexos();
    $('#rr-anexar', f.caixa).onclick = async () => {
      for (const arq of await UI.escolherArquivos('*/*')) {
        const total = st.anexos.reduce((s, a) => s + a.tamanho, 0) + arq.size;
        if (total > TETO_ANEXOS) { toast(`Ficou de fora ${arq.name}: os anexos de um e-mail somam no máximo 20 MB.`, 'err', 5000); continue; }
        try { st.anexos.push({ nome: arq.name, tipo: arq.type || 'application/octet-stream', base64: await lerBase64(arq), tamanho: arq.size }); }
        catch (e) { toast(e.message, 'err'); }
      }
      desenharAnexos();
    };

    $('#rr-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      // TUDO LIDO ANTES DE CONFIRMAR (a armadilha da folha única)
      guardar();
      st.texto = caixa().value.trim();
      st.assunto = $('#rr-assunto', f.caixa).value.trim();
      st.pedido = $('#rr-pedido', f.caixa).value;
      st.concluir = $('#rr-concluir', f.caixa).checked;
      if (!st.texto) return toast('Escreva a resposta.', 'err');
      // o que o servidor faz com a situação (retornoResponder)
      const fica = st.concluir ? 'Concluída' : (!r.situacao || r.situacao === 'Nova' ? 'Em andamento' : r.situacao);
      const ja = r.retorno_em ? ` Atenção: esta resposta já teve retorno em ${L.dataBr(r.retorno_em)}.` : '';
      if (!(await UI.confirmar(`Enviar esta resposta para ${r.email}${st.anexos.length ? ` com ${st.anexos.length} anexo(s)` : ''}? Sai do Gmail da clínica e não tem como desfazer. Depois, a situação fica ${fica}.${ja}`, { ok: 'Enviar' }))) {
        return responder(r, depois, st);
      }
      UI.carregando(true, 'Enviando…');
      try {
        const resp = await funcaoEmail({ acao: 'retorno_responder', id: r.id, assunto: st.assunto, mensagem: st.texto, concluir: st.concluir,
          ...(st.anexos.length ? { anexos: st.anexos.map((a) => ({ nome: a.nome, tipo: a.tipo, base64: a.base64, no_corpo: false })) } : {}) });
        if (resp.erro_gravar) toast(`Resposta enviada para ${resp.para}, mas o controle não gravou: ${resp.erro_gravar}. Escreva o retorno à mão.`, 'err', 8000);
        else toast(`Resposta enviada para ${resp.para}. O controle guardou o texto e o retorno (situação: ${resp.situacao}).`, 'ok', 5000);
        depois();
      } catch (err) {
        toast(err.message, 'err', 6000);
        // não saiu: a tela volta com o que estava escrito
        responder(r, depois, st);
      } finally { UI.carregando(false); }
    };
    if (!volta) sugerir();
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
    // visto próprio, o mesmo do computador (80-vistos-emails-e-pesquisa.sql)
    precisa: (u) => L.temModulo(u, 'pesquisa_site'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
