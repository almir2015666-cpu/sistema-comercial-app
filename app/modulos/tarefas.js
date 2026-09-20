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

  async function listar(comFechadas) {
    return N.tudo((de, ate) => {
      let q = N.sb.from('orc_tarefas').select(CAMPOS);
      q = comFechadas ? q.or(`situacao.eq.aberta,atualizado_em.gte.${L.somarDias(L.hojeISO(), -60)}`) : q.eq('situacao', 'aberta');
      return q.order('id', { ascending: true }).range(de, ate);
    });
  }
  async function pessoas() {
    const { data } = await N.sb.from('orc_chat_pessoas').select('id,nome,setor').order('nome');
    return [{ id: eu().id, nome: `${eu().nome} (eu)`, setor: eu().setor }, ...(data || [])];
  }

  function prazoTexto(t, hoje) {
    if (!t.prazo) return '';
    const d = L.diasEntre(hoje, t.prazo);
    return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d === -1 ? 'ontem' : d < 0 ? `há ${-d} dias` : `em ${d} dias`;
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
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
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
        ${aberta ? `<button class="btn btn-ghost" id="td-cancelar" type="button">Cancelar</button>` : ''}
        ${(t.de === eu().id || eu().admin) ? `<button class="btn btn-ghost" id="td-apagar" type="button" style="color:var(--red)">Apagar</button>` : ''}
      </div>`, { titulo: t.titulo });
    const mudar = async (corpo, acao, texto) => {
      try { await N.mudar('orc_tarefas', { id: t.id }, corpo); N.registrar(acao, t.titulo); toast(texto, 'ok'); f.fechar(); depois(); }
      catch (e) { toast(N.recado(e), 'err'); }
    };
    $$('#td-itens input', f.caixa).forEach((c) => { c.onchange = async () => {
      itens[Number(c.dataset.n)].feito = c.checked;
      c.nextElementSibling.classList.toggle('feito', c.checked);
      try { await N.mudar('orc_tarefas', { id: t.id }, { itens }); N.registrar('tarefa_itens', t.titulo); } catch (e) { toast(N.recado(e), 'err'); }
    }; });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#td-ok', () => mudar({ situacao: 'concluida' }, 'tarefa_concluida', 'Concluída.'));
    on('#td-reabrir', () => mudar({ situacao: 'aberta' }, 'tarefa_alterada', 'Reaberta.'));
    on('#td-cancelar', async () => { if (await UI.confirmar('Cancelar esta tarefa?', { ok: 'Cancelar tarefa', cancelar: 'Voltar', perigo: true })) mudar({ situacao: 'cancelada' }, 'tarefa_alterada', 'Cancelada.'); });
    on('#td-editar', () => { f.fechar(); formulario(t); });
    on('#td-apagar', async () => {
      if (!await UI.confirmar('Apagar de vez? Não há lixeira para tarefas.', { ok: 'Apagar', perigo: true })) return;
      try {
        const n = await N.apagar('orc_tarefas', { id: t.id });
        if (!n) return toast('O servidor não deixou apagar.', 'err');
        N.registrar('tarefa_apagada', t.titulo); toast('Apagada.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  async function formulario(t) {
    const gente = await pessoas().catch(() => [{ id: eu().id, nome: `${eu().nome} (eu)` }]);
    const setores = [...new Set([...L.SETORES, ...gente.flatMap((p) => L.setoresDe(p))])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const alvo = t ? (t.para ? `p:${t.para}` : t.setor ? `s:${t.setor}` : `p:${eu().id}`) : `p:${eu().id}`;
    const f = UI.folha(`<form id="tf">
      <div class="fg"><label>Título</label><input id="tf-titulo" maxlength="200" required value="${esc(t?.titulo || '')}"></div>
      <div class="fg"><label>Descrição</label><textarea id="tf-desc" maxlength="4000">${esc(t?.descricao || '')}</textarea></div>
      <div class="row-2">
        <div class="fg"><label>Prazo</label><input id="tf-prazo" type="date" value="${esc(t?.prazo || '')}"></div>
        <div class="fg"><label>Avisar (dias antes)</label><input id="tf-lembrar" type="number" min="0" max="90" value="${t ? t.lembrar_dias : 3}"></div>
      </div>
      <div class="fg"><label>Para</label><select id="tf-alvo">
        ${gente.map((p) => `<option value="p:${esc(p.id)}" ${alvo === `p:${p.id}` ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        ${setores.map((s) => `<option value="s:${esc(s)}" ${alvo === `s:${s}` ? 'selected' : ''}>Setor: ${esc(s)}</option>`).join('')}
      </select></div>
      <div class="fg"><label>Checklist (um item por linha)</label><textarea id="tf-itens" rows="4">${esc(L.normalizarItens(t?.itens).map((i) => (i.feito ? '[x] ' : '') + i.texto).join('\n'))}</textarea></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">${t ? 'Salvar' : 'Criar'}</button></div></form>`, { titulo: t ? 'Editar tarefa' : 'Nova tarefa' });
    $('#tf', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const alvoV = $('#tf-alvo', f.caixa).value;
      const itens = L.normalizarItens($('#tf-itens', f.caixa).value.split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => ({ texto: l.replace(/^\[(x| )\]\s*/i, ''), feito: /^\[x\]/i.test(l) })));
      const corpo = {
        titulo: L.achatar($('#tf-titulo', f.caixa).value).slice(0, 200),
        descricao: $('#tf-desc', f.caixa).value.trim().slice(0, 4000) || null,
        prazo: $('#tf-prazo', f.caixa).value || null,
        lembrar_dias: Math.max(0, Math.min(90, Number($('#tf-lembrar', f.caixa).value) || 0)),
        itens,
        para: alvoV.startsWith('p:') ? alvoV.slice(2) : null,
        para_nome: alvoV.startsWith('p:') ? (gente.find((p) => p.id === alvoV.slice(2))?.nome || '').replace(' (eu)', '') || null : null,
        setor: alvoV.startsWith('s:') ? alvoV.slice(2) : null,
      };
      if (!corpo.titulo) return toast('Dê um título.', 'err');
      try {
        if (t) { await N.mudar('orc_tarefas', { id: t.id }, corpo); N.registrar('tarefa_alterada', corpo.titulo); }
        else {
          const { data, error } = await N.sb.from('orc_tarefas').insert({ ...corpo, de: eu().id, de_nome: eu().nome }).select();
          if (error) throw error; if (!data?.length) throw new Error('O servidor não criou a tarefa.');
          N.registrar('tarefa_criada', corpo.titulo);
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
