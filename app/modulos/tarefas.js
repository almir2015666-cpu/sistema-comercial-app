/* =====================================================================
   Tarefas — o que fazer, com prazo, para voce, para alguem ou para o setor.
   Mesma tabela orc_tarefas do computador; o gatilho do banco forca `de`,
   situacao e datas — o app nao os manda esperando que valham.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const CAMPOS = 'id,titulo,descricao,prazo,lembrar_dias,de,de_nome,para,para_nome,setor,situacao,itens,concluida_em,concluida_por,concluida_por_nome,criado_em,atualizado_em';
  const eu = () => N.estado.eu;
  const SELO = { atrasada: ['b-err', 'atrasada'], hoje: ['b-4', 'hoje'], perto: ['b-4', 'vence logo'], longe: ['b-1', ''], sem_prazo: ['b-gray', 'sem prazo'], feita: ['b-gray', ''] };
  // Com quantos dias de antecedencia avisar quando a pessoa nao escolhe
  // (tarefas_nucleo.py, LEMBRAR_PADRAO).
  const LEMBRAR_PADRAO = 3;
  // Quanto tempo o "Desfazer" fica na tela depois de concluir.
  const DESFAZER_MS = 6000;

  async function listar(comFechadas) {
    return N.tudo((de, ate) => {
      let q = N.sb.from('orc_tarefas').select(CAMPOS);
      q = comFechadas ? q.or(`situacao.eq.aberta,atualizado_em.gte.${L.somarDias(L.hojeISO(), -60)}`) : q.eq('situacao', 'aberta');
      return q.order('id', { ascending: true }).range(de, ate);
    });
  }
  // Eu na frente ("para mim mesmo" e o caso mais comum) e fora do resto da
  // lista, como tarefas_nucleo.py (pessoas): a vista do chat me inclui, e
  // sem esse filtro eu aparecia duas vezes.
  async function pessoas() {
    const { data } = await N.sb.from('orc_chat_pessoas').select('id,nome,setor').order('nome');
    return [{ id: eu().id, nome: `${eu().nome} (eu)`, setor: eu().setor }, ...(data || []).filter((p) => p.id !== eu().id)];
  }

  function prazoTexto(t, hoje) {
    if (!t.prazo) return '';
    const d = L.diasEntre(hoje, t.prazo);
    return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d === -1 ? 'ontem' : d < 0 ? `há ${-d} dias` : `em ${d} dias`;
  }

  // Grava uma mudanca de situacao com o MESMO nome de log e o mesmo detalhe
  // do computador (tarefas_nucleo.py: concluir, reabrir, cancelar), para o
  // Log do sistema contar igual venha de onde vier.
  const ACOES = {
    concluida: ['tarefa_concluida', (t) => `tarefa ${t.id}: ${String(t.titulo || '').slice(0, 80)}`],
    aberta: ['tarefa_reaberta', (t) => `tarefa ${t.id}`],
    cancelada: ['tarefa_cancelada', (t) => `tarefa ${t.id}`],
  };
  async function mudarSituacao(t, situacao) {
    await N.mudar('orc_tarefas', { id: t.id }, { situacao });
    const [acao, detalhe] = ACOES[situacao];
    N.registrar(acao, detalhe(t));
  }

  // CONCLUIR NAO PERGUNTA: deixa o desfazer ao lado (tarefas_tela.py,
  // _oferecer_desfazer). O toast da casa nao recebe toque, entao a faixa
  // do desfazer e daqui, com a mesma cara, e some sozinha.
  let faixaDesfazer = null;
  function esconderDesfazer() {
    if (!faixaDesfazer) return;
    clearTimeout(faixaDesfazer.timer); faixaDesfazer.el.remove(); faixaDesfazer = null;
  }
  function oferecerDesfazer(t, depois) {
    esconderDesfazer();
    const el = document.createElement('div');
    el.className = 'toast ok show';
    el.setAttribute('role', 'status');
    el.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:14px;text-align:left';
    el.innerHTML = `<span>Concluída: ${esc(String(t.titulo || '').slice(0, 40))}</span><button type="button" class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.5)">Desfazer</button>`;
    document.body.appendChild(el);
    faixaDesfazer = { el, timer: setTimeout(esconderDesfazer, DESFAZER_MS) };
    el.querySelector('button').onclick = async () => {
      esconderDesfazer();
      try { await mudarSituacao(t, 'aberta'); toast('Reaberta.', 'ok'); } catch (e) { toast(N.recado(e), 'err'); }
      if (depois) depois();
    };
  }

  const tela = {
    titulo: 'Tarefas',
    aoTopo(dir) { dir.innerHTML = ''; dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => formulario(null), 'Nova tarefa')); },
    async desenhar(el) {
      let comFechadas = false, vivo = true;
      const desenharLista = async () => {
        if (!vivo) return;
        try {
          const hoje = L.hojeISO();
          const lista = L.ordenarTarefas(await listar(comFechadas), hoje);
          const minhas = lista.filter((t) => L.eMinha(t, eu()));
          const outras = lista.filter((t) => !L.eMinha(t, eu()));
          APP.contagens.tarefas = minhas.filter((t) => ['atrasada', 'hoje', 'perto'].includes(L.estadoDoPrazo(t, hoje))).length;
          UI.badgeAba('tarefas', APP.contagens.tarefas);
          const linha = (t) => {
            const e = L.estadoDoPrazo(t, hoje);
            const [cls, rot] = SELO[e];
            const itens = L.normalizarItens(t.itens);
            const feitos = itens.filter((i) => i.feito).length;
            const quem = t.para ? (t.para === eu().id ? 'para mim' : `para ${t.para_nome || '…'}`) : t.setor ? `para o setor ${t.setor}` : `de ${t.de_nome}`;
            return `<button class="linha" type="button" data-id="${t.id}">
              <div class="linha__corpo"><div class="linha__titulo"><span class="t ${e === 'feita' ? 'text-muted' : ''}">${esc(t.titulo)}</span>${rot ? `<span class="badge ${cls}">${rot}</span>` : ''}</div>
              <div class="linha__sub">${esc(quem)}${t.prazo ? ` · ${L.dataBr(t.prazo)} (${prazoTexto(t, hoje)})` : ''}${itens.length ? ` · ${feitos}/${itens.length}` : ''}${e === 'feita' ? ` · ${L.ROTULO_TAREFA[t.situacao]}` : ''}</div></div>${ICONES.seta}</button>`;
          };
          el.innerHTML = `<div class="tabs"><button class="tab ${comFechadas ? '' : 'on'}" data-v="0">Abertas</button><button class="tab ${comFechadas ? 'on' : ''}" data-v="1">Com fechadas (60 d)</button></div>
            ${lista.length ? '' : UI.vazio('Nenhuma tarefa', 'Toque em + para criar a primeira.')}
            ${minhas.length ? `<div class="secao">Minhas</div><div class="lista">${minhas.map(linha).join('')}</div>` : ''}
            ${outras.length ? `<div class="secao">Que eu criei ou do setor</div><div class="lista">${outras.map(linha).join('')}</div>` : ''}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { comFechadas = b.dataset.v === '1'; desenharLista(); }; });
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(lista.find((t) => t.id === Number(b.dataset.id)), desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenharLista();
      const relogio = setInterval(() => { if (!document.hidden) desenharLista(); }, 60000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; esconderDesfazer(); };
    },
  };

  function detalhe(t, depois) {
    const hoje = L.hojeISO();
    const itens = L.normalizarItens(t.itens);
    const aberta = t.situacao === 'aberta';
    const f = UI.folha(`
      ${t.descricao ? `<p style="white-space:pre-wrap;line-height:1.5">${esc(t.descricao)}</p>` : ''}
      <dl class="ficha mt12">
        <div><dt>Prazo</dt><dd>${t.prazo ? `${L.dataBr(t.prazo)} · ${prazoTexto(t, hoje)}` : 'sem prazo'}</dd></div>
        <div><dt>Situação</dt><dd>${esc(L.ROTULO_TAREFA[t.situacao])}${t.concluida_por_nome ? ` por ${esc(t.concluida_por_nome)}` : ''}</dd></div>
        <div><dt>Para</dt><dd>${esc(t.para_nome || (t.setor ? `setor ${t.setor}` : 'quem criou'))}</dd></div>
        <div><dt>Criada por</dt><dd>${esc(t.de_nome)} · ${esc(L.dataBr(t.criado_em))}</dd></div>
      </dl>
      ${itens.length ? `<div class="secao mt12">Checklist</div><div class="itens-check" id="td-itens">${itens.map((i, n) => `<label><input type="checkbox" data-n="${n}" ${i.feito ? 'checked' : ''} ${aberta ? '' : 'disabled'}><span class="${i.feito ? 'feito' : ''}">${esc(i.texto)}</span></label>`).join('')}</div>` : ''}
      <div class="acoes mt16">
        ${aberta ? `<button class="btn btn-ok" id="td-ok" type="button">Concluir</button>` : `<button class="btn btn-ghost" id="td-reabrir" type="button">Reabrir</button>`}
        ${aberta ? `<button class="btn btn-ghost" id="td-editar" type="button">Editar</button>` : ''}
        ${aberta ? `<button class="btn btn-ghost" id="td-cancelar" type="button">Cancelar tarefa</button>` : ''}
        ${(t.de === eu().id || eu().admin) ? `<button class="btn btn-ghost" id="td-apagar" type="button" style="color:var(--red)">Apagar</button>` : ''}
      </div>`, { titulo: t.titulo });
    const situacao = async (nova, texto) => {
      try { await mudarSituacao(t, nova); if (texto) toast(texto, 'ok'); f.fechar(); depois(); return true; }
      catch (e) { toast(N.recado(e, 'O servidor não deixou: esta tarefa não é sua, nem do seu setor.'), 'err'); return false; }
    };
    $$('#td-itens input', f.caixa).forEach((c) => { c.onchange = async () => {
      itens[Number(c.dataset.n)].feito = c.checked;
      c.nextElementSibling.classList.toggle('feito', c.checked);
      try { await N.mudar('orc_tarefas', { id: t.id }, { itens }); N.registrar('tarefa_itens', `tarefa ${t.id}`); } catch (e) { toast(N.recado(e), 'err'); }
    }; });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#td-ok', async () => { if (await situacao('concluida', '')) oferecerDesfazer(t, depois); });
    on('#td-reabrir', () => { esconderDesfazer(); situacao('aberta', 'Reaberta.'); });
    // SEM PERGUNTAR, como no computador (tarefas_tela.py, cancelar_tarefa):
    // e um botao com o nome escrito e o Reabrir traz de volta. Pergunta e
    // para o que nao tem volta, e isso e o Apagar.
    on('#td-cancelar', () => situacao('cancelada', 'Cancelada. Dá para reabrir em "Com fechadas".'));
    on('#td-editar', () => { f.fechar(); formulario(t); });
    on('#td-apagar', async () => {
      if (!await UI.confirmar('Apagar de vez? Não há lixeira para tarefas.', { ok: 'Apagar', perigo: true })) return;
      try {
        const n = await N.apagar('orc_tarefas', { id: t.id });
        if (!n) return toast('O servidor não deixou apagar: só quem criou a tarefa, ou o administrador, pode.', 'err');
        N.registrar('tarefa_apagada', `tarefa ${t.id}`); toast('Apagada.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  // A checklist como o computador edita (tarefas_tela.py, _linha_item):
  // uma linha por item com [visto] [texto] [x], "+ Adicionar item" e o
  // contador "✓ 2 de 5". Grava na MESMA coluna `itens`, no mesmo formato
  // [{texto, feito}] (tarefas_nucleo.py, normalizar_itens).
  function editorDeItens(caixa, iniciais) {
    const lista = $('#tf-itens', caixa), contador = $('#tf-itens-conta', caixa), vazio = $('#tf-itens-vazio', caixa), mais = $('#tf-itens-mais', caixa);
    const linhas = () => $$('.tf-item', lista);
    const contar = () => {
      const ls = linhas();
      const feitos = ls.filter((l) => $('input[type=checkbox]', l).checked).length;
      contador.textContent = !ls.length ? '' : feitos ? `✓ ${feitos} de ${ls.length}` : `${ls.length} ${ls.length === 1 ? 'item' : 'itens'}`;
      vazio.hidden = ls.length > 0;
      mais.disabled = ls.length >= L.LIMITE_ITENS;
    };
    const adicionar = (texto = '', feito = false, foco = false) => {
      if (linhas().length >= L.LIMITE_ITENS) return;
      // div, e nao label: dentro de um label, tocar no texto ou no x
      // tambem marcaria o visto. Os estilos em linha desfazem o `.fg input`
      // (appearance:none, altura de campo), que apagaria o quadradinho.
      const l = document.createElement('div');
      l.className = 'tf-item';
      l.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)';
      l.innerHTML = `<input type="checkbox" aria-label="Feito" style="-webkit-appearance:checkbox;appearance:auto;min-height:0;padding:0;margin:0;width:22px;height:22px;flex-shrink:0;accent-color:var(--green)" ${feito ? 'checked' : ''}><input type="text" class="tf-item-texto" maxlength="200" placeholder="o que fazer" style="flex:1;min-width:0;width:auto" value="${esc(texto)}"><button type="button" class="btn-icon" aria-label="Tirar item" style="flex-shrink:0">✕</button>`;
      $('input[type=checkbox]', l).onchange = contar;
      $('button', l).onclick = (e) => { e.preventDefault(); l.remove(); contar(); };
      lista.appendChild(l);
      contar();
      if (foco) $('.tf-item-texto', l).focus();
    };
    for (const i of iniciais) adicionar(i.texto, i.feito);
    mais.onclick = () => adicionar('', false, true);
    contar();
    // Os vazios nao vao: e o que o computador faz (_itens_agora).
    return () => L.normalizarItens(linhas().map((l) => ({ texto: $('.tf-item-texto', l).value.trim(), feito: $('input[type=checkbox]', l).checked })));
  }

  async function formulario(t) {
    const gente = await pessoas().catch(() => [{ id: eu().id, nome: `${eu().nome} (eu)` }]);
    const setores = [...new Set([...L.SETORES, ...gente.flatMap((p) => L.setoresDe(p))])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const alvo = t ? (t.para ? `p:${t.para}` : t.setor ? `s:${t.setor}` : `p:${eu().id}`) : `p:${eu().id}`;
    const f = UI.folha(`<form id="tf">
      <div class="fg"><label>Título</label><input id="tf-titulo" maxlength="200" required value="${esc(t?.titulo || '')}"></div>
      <div class="fg"><label>Descrição</label><textarea id="tf-desc" maxlength="4000">${esc(t?.descricao || '')}</textarea></div>
      <div class="fg"><label style="display:flex;justify-content:space-between"><span>Checklist</span><span id="tf-itens-conta" style="color:var(--green)"></span></label>
        <div class="dica" id="tf-itens-vazio" style="margin-top:0">Nenhum item ainda. Use quando a tarefa tem partes que dá para ir fechando aos poucos: cada uma vira um visto.</div>
        <div id="tf-itens"></div>
        <button class="btn btn-ghost btn-sm mt8" id="tf-itens-mais" type="button">+ Adicionar item</button></div>
      <div class="fg"><label>Prazo</label><input id="tf-prazo" type="date" value="${esc(t?.prazo || '')}">
        <div class="chips mt8">
          <button class="chip" type="button" data-prazo="0">Hoje</button>
          <button class="chip" type="button" data-prazo="1">Amanhã</button>
          <button class="chip" type="button" data-prazo="7">+7 dias</button>
          <button class="chip" type="button" data-prazo="">Sem prazo</button>
        </div></div>
      <div class="fg"><label>Avisar (dias antes)</label><input id="tf-lembrar" type="number" min="0" max="90" value="${t?.lembrar_dias ?? LEMBRAR_PADRAO}"><div class="dica">0 = só no dia.</div></div>
      <div class="fg"><label>Para</label><select id="tf-alvo">
        ${gente.map((p) => `<option value="p:${esc(p.id)}" ${alvo === `p:${p.id}` ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        ${setores.map((s) => `<option value="s:${esc(s)}" ${alvo === `s:${s}` ? 'selected' : ''}>Setor: ${esc(s)}</option>`).join('')}
      </select><div class="dica">Uma pessoa: o aviso toca para ela. Um setor: toca para todo mundo do setor, e qualquer um conclui.</div></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${t ? 'Salvar' : 'Criar'}</button></div></form>`, { titulo: t ? 'Editar tarefa' : 'Nova tarefa' });
    const lerItens = editorDeItens(f.caixa, L.normalizarItens(t?.itens));
    // Os atalhos do prazo, os mesmos do computador (_por_prazo): a data de
    // hoje somada, ou o campo limpo.
    $$('[data-prazo]', f.caixa).forEach((b) => { b.onclick = () => {
      $('#tf-prazo', f.caixa).value = b.dataset.prazo === '' ? '' : L.somarDias(L.hojeISO(), Number(b.dataset.prazo));
    }; });
    $('#tf', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const alvoV = $('#tf-alvo', f.caixa).value;
      const lembrar = $('#tf-lembrar', f.caixa).value;
      const corpo = {
        titulo: L.achatar($('#tf-titulo', f.caixa).value).slice(0, 200),
        descricao: $('#tf-desc', f.caixa).value.trim().slice(0, 4000) || null,
        prazo: $('#tf-prazo', f.caixa).value || null,
        lembrar_dias: Math.max(0, Math.min(90, lembrar === '' ? LEMBRAR_PADRAO : Number(lembrar) || 0)),
        itens: lerItens(),
        para: alvoV.startsWith('p:') ? alvoV.slice(2) : null,
        para_nome: alvoV.startsWith('p:') ? (gente.find((p) => p.id === alvoV.slice(2))?.nome || '').replace(' (eu)', '') || null : null,
        setor: alvoV.startsWith('s:') ? alvoV.slice(2) : null,
      };
      if (!corpo.titulo) return toast('Diga o que é a tarefa: o título não pode ficar em branco.', 'err');
      try {
        if (t) { await N.mudar('orc_tarefas', { id: t.id }, corpo); N.registrar('tarefa_alterada', `tarefa ${t.id}: ${corpo.titulo.slice(0, 80)}`); }
        else {
          const { data, error } = await N.sb.from('orc_tarefas').insert({ ...corpo, de: eu().id, de_nome: eu().nome }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não criou a tarefa.');
          // O mesmo detalhe do computador (tarefas_nucleo.py, criar).
          const quem = corpo.para_nome || corpo.setor || 'mim';
          N.registrar('tarefa_criada', `${corpo.titulo.slice(0, 80)} · para ${quem}${corpo.prazo ? ` · até ${L.dataBr(corpo.prazo)}` : ''}`);
        }
        toast(t ? 'Salva.' : 'Criada.', 'ok'); f.fechar(); if (tela._recarregar) tela._recarregar();
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  async function contar() {
    const hoje = L.hojeISO();
    const lista = await listar(false);
    return lista.filter((t) => L.eMinha(t, eu()) && ['atrasada', 'hoje', 'perto'].includes(L.estadoDoPrazo(t, hoje))).length;
  }

  MODULOS.tarefas = {
    chave: 'tarefas', nome: 'Tarefas', sub: 'O que fazer, com prazo', icone: ICONES.tarefas,
    precisa: (u) => L.temModulo(u, 'tarefas'),
    abrir: (comoAba) => comoAba ? UI.raiz(tela, 'tarefas') : UI.ir(tela),
    contar,
  };
})();
