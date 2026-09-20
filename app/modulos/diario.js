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
      <div class="acoes"><button class="btn btn-ghost" type="submit">Adicionar à lista</button></div>
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
      for (const [k, , tipo] of campos) if (!['servico', 'pagamento', 'status'].includes(tipo)) $(`#df-${k}`, f.caixa).value = '';
      $(`#df-${campos[0][0]}`, f.caixa).focus();
      pintar();
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

  async function abaMeus(corpo) {
    const hoje = L.hojeISO();
    const registros = await listar(L.somarDias(hoje, -90), hoje);
    corpo.innerHTML = `${eu().admin ? '' : '<div class="text-muted pequeno">Você vê os seus lançamentos dos últimos 90 dias.</div>'}
      ${registros.length ? `<div class="lista">${registros.map((r) => { const [, nome, sigla] = L.ATIVIDADES.find((a) => a[0] === r.atividade) || ['', r.atividade, '']; return `<button class="linha" type="button" data-id="${esc(r.id)}"><span class="badge b-1">${esc(sigla)}</span><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(nome)} · ${r.quantidade}</span></div><div class="linha__sub">${esc(L.dataBr(r.data))}${eu().admin ? ` · ${esc(r.usuario_nome)}` : ''} · ${esc((r.detalhes || []).map((d) => d.empresa).join(', '))}</div></div>${ICONES.seta}</button>`; }).join('')}</div>` : UI.vazio('Nenhum lançamento nos últimos 90 dias')}`;
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
    const mes = mesDe(L.hojeISO());
    const [eq, ms] = await Promise.all([equipe(), metas(mes)]);
    corpo.innerHTML = `<div class="text-muted pequeno">Metas de ${esc(mes)} por pessoa e atividade. Vazio = ${L.META_PADRAO}.</div>
      ${eq.filter((p) => !p.admin).map((p) => `<div class="card"><div class="card-title mb8">${esc(p.nome)}</div><div class="row-2">${L.ATIVIDADES.map(([k, , s]) => { const m = ms.find((x) => x.usuario_id === p.id && x.atividade === k); return `<div class="fg" style="margin-bottom:6px"><label>${s}</label><input type="number" min="0" data-u="${esc(p.id)}" data-a="${k}" value="${m ? m.meta : ''}" placeholder="${L.META_PADRAO}"></div>`; }).join('')}</div></div>`).join('')}
      <button class="btn btn-ok w-full" id="dm-salvar" type="button">Salvar metas</button>`;
    $('#dm-salvar', corpo).onclick = async () => {
      const linhas = $$('input[data-u]', corpo).filter((i) => i.value !== '').map((i) => ({ usuario_id: i.dataset.u, atividade: i.dataset.a, mes, meta: Math.max(0, Number(i.value) || 0) }));
      if (!linhas.length) return toast('Nenhuma meta preenchida.', 'err');
      const { error } = await N.sb.from('orc_diario_metas').upsert(linhas, { onConflict: 'usuario_id,atividade,mes' });
      if (error) return toast(N.recado(error), 'err');
      N.registrar('diario_metas_alteradas', mes); toast('Metas salvas.', 'ok');
    };
  }

  MODULOS.diario = {
    chave: 'diario', nome: 'Diário de Bordo', sub: 'O dia do comercial', icone: ICONES.diario,
    precisa: (u) => L.temModulo(u, 'diario'),
    abrir: () => UI.ir(tela),
  };
})();
