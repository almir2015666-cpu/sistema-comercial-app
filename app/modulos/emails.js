/* =====================================================================
   E-mails da prospecção — o Controle de e-mails do computador no celular
   (prospeccao_tela.py, JanelaEmails / JanelaEnviarEmail / JanelaResponder /
   JanelaAgendados / JanelaBuscarEmpresas).

   - A RESPONDER: a última mensagem da conversa é da empresa (💬). Toque,
     leia a conversa inteira e mande a resposta que a IA sugeriu (ou a sua).
   - AGUARDANDO: saiu a proposta, a empresa ainda não respondeu.
   - PARA COBRAR, 🕒 AGENDADOS, 💼 CLIENTES, E-MAIL VOLTOU: como o "Mostrar"
     do computador.
   - ☑ SELECIONAR: marca várias e manda de uma vez — qualquer modelo, a
     cobrança, agora ou 🕒 agendado (pedido do dono, 04/11/2026: "fazer
     tudo de prospecção do e-mail no celular").
   - Cadastrar empresa (+), 🔎 buscar empresas na internet (IA), editar.

   Quem manda, lê a caixa e chama a IA é a orc-email, no servidor — o app
   só pede. Visto próprio: Controle de e-mails.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const T = 'orc_emails_prospeccao';
  const FUNCAO = 'orc-email';
  const SELO = { 'Enviado': 'b-3', 'Não enviado': 'b-4', 'Respondeu': 'b-1', 'Sem interesse': 'b-gray',
    'Virou cliente': 'b-ok', 'E-mail voltou': 'b-4' };
  // quem já disse não, ou já é cliente, não recebe prospecção
  const NAO_MANDA = ['Sem interesse', 'Virou cliente'];

  async function funcaoEmail(corpo) {
    const { data, error } = await N.sb.functions.invoke(FUNCAO, { body: { ...corpo, ...(await N.onde()) } });
    if (error) throw new Error((await N.lerErroFuncao(error)) || 'A função do servidor não respondeu.');
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  const listar = () => N.tudo((de, ate) => N.sb.from(T).select('*')
    .order('data', { ascending: false }).order('id', { ascending: false }).range(de, ate));

  async function lerConversa(id) {
    try {
      const { data, error } = await N.sb.from('orc_emails_conversa').select('*').eq('registro_id', id)
        .order('quando', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch { return []; }      // sem o SQL 78: fica o que o registro guardou
  }

  // O modelo da proposta: o que a equipe salvou no computador, ou o de fábrica
  async function modeloParceria() {
    try {
      const { data } = await N.sb.from('orc_emails_modelos').select('*').eq('nome', L.MODELO_PARCERIA).limit(1);
      if (data?.length) return data[0];
    } catch { /* fica o de fábrica */ }
    return L.MODELOS_EMAIL[0];
  }
  // TODOS os modelos: os da equipe na frente, os de fábrica que faltam depois
  async function lerModelos() {
    try {
      const { data, error } = await N.sb.from('orc_emails_modelos').select('*').order('nome');
      if (error) throw error;
      return L.juntarModelos(data || []);
    } catch { return L.juntarModelos([]); }
  }

  // O CARTÃO DA CLÍNICA guardado pela equipe (79-controle-emails-cartao.sql)
  async function lerCartao() {
    try {
      const { data, error } = await N.sb.from('orc_emails_cartoes').select('*').eq('nome', 'Cartão da clínica').limit(1);
      if (error || !data?.length) return null;
      return { nome: data[0].arquivo, tipo: data[0].tipo, base64: data[0].base64, foto: true, cartao: true };
    } catch { return null; }
  }

  // OS CLIENTES DA CASA (85): quem já fatura ganha 💼 e não recebe
  // prospecção sem perguntar. Lidos uma vez por abertura do módulo.
  let CLIENTES = L.clIndice([]);
  async function lerClientes() {
    try {
      const linhas = await N.tudo((de, ate) => N.sb.from('orc_clientes_faturamento')
        .select('codigo,nome,grupo,faturou_2025,faturou_2026,meses_2025,meses_2026,periodo').order('id').range(de, ate));
      CLIENTES = L.clIndice(linhas, linhas.find((l) => l.periodo)?.periodo || '');
    } catch { CLIENTES = L.clIndice([]); }   // sem o SQL 85: sem 💼
    cacheCliente.clear();
  }
  const cacheCliente = new Map();
  const clienteDe = (r) => {
    if (!CLIENTES.tamanho || !r) return null;
    const k = `${r.id}|${r.empresa}|${r.ia_nome}`;
    if (!cacheCliente.has(k)) cacheCliente.set(k, CLIENTES.achar(nomeEmpresa(r.empresa), r.ia_nome));
    return cacheCliente.get(k);
  };
  const ehCliente = (r) => !!clienteDe(r)?.faturou_2026;

  // OS JÁ AGENDADOS (84): 🕒 na lista, e pergunta antes de agendar de novo
  let PENDENTES = {};
  async function lerPendentes() {
    try {
      const { data, error } = await N.sb.from('orc_emails_agendados')
        .select('registro_id,agendamento_id,orc_emails_agendamentos(agendado_para,situacao,cobranca)')
        .in('situacao', ['agendado', 'enviando']);
      if (error) throw error;
      PENDENTES = L.pendentesDosAgendados(data || []);
    } catch { PENDENTES = {}; }
  }

  // o formato que a orc-email espera (prospeccao_nucleo.enviar)
  const anexosParaEnvio = (lista) => (lista || []).map((a) => ({ nome: a.nome, tipo: a.tipo, base64: a.base64, no_corpo: !!a.foto }));
  // quantos arquivos forem, até 20 MB somados — o mesmo do computador
  const TETO_ANEXOS = 20 * 1024 * 1024;
  // o arquivo do aparelho em base64, sem o "data:...;base64," da frente
  const lerBase64 = (arquivo) => new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''));
    leitor.onerror = () => falha(new Error('Não consegui ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
  // os arquivos escolhidos entram na lista até o teto (20 MB somados)
  async function juntarArquivos(anexos) {
    const arqs = await UI.escolherArquivos('*/*');
    for (const arq of arqs) {
      const total = anexos.reduce((s, a) => s + a.tamanho, 0) + arq.size;
      if (total > TETO_ANEXOS) { toast(`Ficou de fora ${arq.name}: os anexos de um e-mail somam no máximo 20 MB.`, 'err', 5000); continue; }
      try { anexos.push({ nome: arq.name, tipo: arq.type || 'application/octet-stream', base64: await lerBase64(arq), tamanho: arq.size, foto: false }); }
      catch (e) { toast(e.message, 'err'); }
    }
  }

  // NOME DA EMPRESA SEMPRE EM MAIÚSCULAS, como no computador
  const nomeEmpresa = (s) => String(s || '').split(/\s+/).filter(Boolean).join(' ').toUpperCase();

  // A PERGUNTA DE VÁRIAS SAÍDAS (tirar / seguir). Fechar = desistir (null).
  function escolher(pergunta, opcoes, titulo = '') {
    return new Promise((ok) => {
      const f = UI.folha(`<p style="font-size:15px;line-height:1.5;white-space:pre-line">${esc(pergunta)}</p>
        <div class="mt16" style="display:flex;flex-direction:column;gap:8px">${opcoes.map(([, rot, cls], i) =>
          `<button class="btn ${cls || 'btn-ghost'}" type="button" data-op="${i}">${esc(rot)}</button>`).join('')}</div>`,
      { titulo, aoFechar: () => ok(null) });
      $$('[data-op]', f.caixa).forEach((b) => { b.onclick = () => { ok(opcoes[Number(b.dataset.op)][0]); f.fechar(); }; });
    });
  }

  const VISTAS = [['responder', 'A responder'], ['aguardando', 'Aguardando'], ['nao', 'Não enviados'],
    ['cobrar', 'Para cobrar'], ['agendados', '🕒 Agendados'], ['clientes', '💼 Clientes'], ['voltou', 'E-mail voltou'],
    ['rascunhos', 'Rascunhos'], ['todos', 'Todos']];

  function filtrar(lista, vista, busca) {
    let s = lista;
    if (vista === 'responder') s = s.filter((r) => r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'nos');
    else if (vista === 'aguardando') s = s.filter((r) => r.situacao === 'Enviado' || (r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'empresa'));
    else if (vista === 'nao') s = s.filter((r) => r.situacao === 'Não enviado');
    // cobrança já agendada não é mais "para cobrar"
    else if (vista === 'cobrar') s = L.paraCobrar(s).filter((r) => !PENDENTES[r.id]);
    else if (vista === 'clientes') s = s.filter(ehCliente);
    else if (vista === 'voltou') s = s.filter((r) => r.situacao === 'E-mail voltou');
    const t = L.semAcento(busca).toLowerCase().trim();
    if (t) s = s.filter((r) => L.semAcento([r.empresa, r.contato, r.emails, r.telefones, r.observacao, r.marcadores].join(' ')).toLowerCase().includes(t));
    return s;
  }

  const tela = {
    titulo: 'E-mails',
    aoTopo(dir) {
      dir.innerHTML = '';
      dir.appendChild(UI.botaoTopo(ICONES.mais_circ, () => novaEmpresa(), 'Cadastrar empresa'));
    },
    async desenhar(el) {
      let vista = 'responder', busca = '', vivo = true, lista = [];
      let marcar = false;                  // ☑ Selecionar ligado
      const marcados = new Set();
      await Promise.all([lerClientes(), lerPendentes()]);
      const desenhar = async (reler = true) => {
        if (!vivo) return;
        try {
          if (reler) { [lista] = await Promise.all([listar(), lerPendentes()]); }
          const abas = `<div class="tabs" style="overflow-x:auto;flex-wrap:nowrap">${VISTAS.map(([k, r]) =>
            `<button class="tab ${k === vista ? 'on' : ''}" style="flex:0 0 auto;padding:8px 10px" data-v="${k}">${esc(r)}</button>`).join('')}</div>`;
          const ligarAbas = () => $$('.tab', el).forEach((b) => { b.onclick = () => { vista = b.dataset.v; marcar = false; marcados.clear(); desenhar(false); }; });
          if (vista === 'rascunhos') {
            const rascs = await lerRascunhos();
            el.innerHTML = `${abas}${rascs.length ? `<div class="lista">${rascs.map((ra) => `<button class="linha" type="button" data-ra="${ra.id}">
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">📝 ${esc(ra.titulo)}</span><span class="badge b-gray">${(ra.registros || []).length} empresa(s)</span></div>
              <div class="linha__sub">${esc(ra.assunto)}</div>
              <div class="linha__sub">${esc(ra.criado_por_nome || '')} · ${esc(L.dataHoraBr(ra.atualizado_em))}${(ra.anexos || []).length ? ` · ${(ra.anexos || []).length} anexo(s)` : ''}</div></div>${ICONES.seta}</button>`).join('')}</div>`
              : UI.vazio('Nenhum rascunho', 'No computador ou aqui, "Salvar rascunho" guarda o e-mail para enviar depois.')}`;
            ligarAbas();
            $$('.linha[data-ra]', el).forEach((b) => { b.onclick = () => abrirRascunho(rascs.find((x) => x.id === Number(b.dataset.ra)), lista, desenhar); });
            return;
          }
          if (vista === 'agendados') {
            const { lotes, recado } = await lerAgendamentos();
            el.innerHTML = `${abas}${recado ? `<div class="aviso atencao mt12">${esc(recado)}</div>` : ''}${lotes.length ? `<div class="lista">${lotes.map((l) => {
              const c = l.contagem || {};
              const n = Object.values(c).reduce((a, b) => a + b, 0);
              const sel = { agendado: 'b-1', enviando: 'b-3', enviado: 'b-ok', 'com falha': 'b-4', cancelado: 'b-gray' }[l.situacao] || 'b-gray';
              return `<button class="linha" type="button" data-lote="${l.id}">
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">🕒 ${esc(L.dataHoraBr(l.agendado_para))}</span><span class="badge ${sel}">${esc(L.SITUACOES_AGENDAMENTO[l.situacao] || l.situacao)}</span></div>
                <div class="linha__sub">${l.cobranca ? '[cobrança] ' : ''}${esc(l.titulo || '')}</div>
                <div class="linha__sub">${n} empresa(s) · ${esc(l.resumo || (c.agendado ? `${c.agendado} aguardando` : ''))} · ${esc(l.criado_por_nome || '')}</div></div>${ICONES.seta}</button>`;
            }).join('')}</div>` : (recado ? '' : UI.vazio('Nenhum envio agendado', 'Marque as empresas (☑ Selecionar) e use "🕒 Agendar…" no envio.'))}`;
            ligarAbas();
            $$('.linha[data-lote]', el).forEach((b) => { b.onclick = () => detalheLote(lotes.find((x) => x.id === Number(b.dataset.lote)), desenhar); });
            return;
          }
          const achados = filtrar(lista, vista, busca);
          APP.contagens.emails = lista.filter((r) => r.situacao === 'Respondeu' && L.vezDeQuem(r) === 'nos').length;
          const sinalDe = (r) => { const v = L.vezDeQuem(r); return v === 'nos' ? '💬 ' : v === 'empresa' ? '✔ ' : ''; };
          el.innerHTML = `${abas}
            <div class="busca">${ICONES.busca}<input id="em-busca" placeholder="Procurar empresa, contato, e-mail" value="${esc(busca)}"></div>
            <div class="acoes mt12">
              <button class="btn btn-ghost" id="em-selecionar" type="button">${marcar ? '✕ Parar de marcar' : '☑ Selecionar'}</button>
              <button class="btn btn-ghost" id="em-buscar" type="button">🔎 Buscar empresas</button>
              <button class="btn btn-ghost" id="em-conferir" type="button">Conferir respostas</button></div>
            ${vista === 'cobrar' && achados.length ? `<button class="btn btn-ok mt12" id="em-cobrar-todos" type="button" style="width:100%">⏰ Cobrar as ${achados.length} desta lista…</button>` : ''}
            ${achados.length ? `<div class="lista">${achados.map((r) => {
              const pend = PENDENTES[r.id];
              const mark = marcar ? `<span style="font-size:22px;width:26px">${marcados.has(r.id) ? '☑' : '☐'}</span>` : UI.avatar(r.empresa || r.contato, 40);
              return `<button class="linha" type="button" data-id="${r.id}">
                ${mark}
                <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(sinalDe(r) + (ehCliente(r) ? '💼 ' : '') + (nomeEmpresa(r.empresa) || r.contato || '?'))}</span><span class="badge ${pend ? 'b-1' : SELO[r.situacao] || 'b-gray'}">${esc(pend ? L.agendadoCurto(pend) : r.situacao)}</span></div>
                <div class="linha__sub">${esc(r.emails || 'sem e-mail')}</div>
                ${r.resposta_resumo || r.resposta_de ? `<div class="linha__sub">${esc(UI.quando(r.respondido_em))} · ${esc(r.resposta_resumo || r.resposta_de)}</div>` : ''}</div>${marcar ? '' : ICONES.seta}</button>`;
            }).join('')}</div>` : UI.vazio(vista === 'responder' ? 'Nenhuma empresa esperando resposta' : 'Nada aqui', vista === 'responder' ? 'Quando uma empresa responder, ela aparece aqui com a resposta sugerida.' : '')}
            ${marcar ? `<div style="position:sticky;bottom:0;background:var(--white);border-top:1px solid var(--border);padding:10px 0 calc(10px + var(--baixo, 0px));margin-top:8px">
              <div class="pequeno text-muted" style="margin-bottom:8px">${marcados.size} marcada(s)</div>
              <div class="acoes"><button class="btn btn-ghost" id="sel-todos" type="button">Marcar todos</button>
              <button class="btn btn-ghost" id="sel-cobrar" type="button">⏰ Cobrar</button>
              <button class="btn btn-ok" id="sel-enviar" type="button">✉ Enviar</button></div></div>` : ''}`;
          ligarAbas();
          const inp = $('#em-busca', el);
          let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenhar(false).then(() => { const i2 = $('#em-busca', el); i2.focus(); i2.setSelectionRange(pos, pos); }); }, 300); };
          $('#em-selecionar', el).onclick = () => { marcar = !marcar; marcados.clear(); desenhar(false); };
          $('#em-buscar', el).onclick = () => buscarEmpresas(lista, () => desenhar());
          $('#em-conferir', el).onclick = async () => {
            UI.carregando(true, 'Lendo a caixa da prospecção…');
            try {
              const r = await funcaoEmail({ acao: 'respostas' });
              const partes = [];
              if (r.responderam?.length) partes.push(`${r.responderam.length} empresa(s) com mensagem nova`);
              if (r.voltaram?.length) partes.push(`${r.voltaram.length} e-mail(s) voltaram`);
              for (const a of r.automaticas || []) if (a.indicados?.length) partes.push(`${a.empresa} mandou resposta automática indicando ${a.indicados.join(', ')} (anotado na observação)`);
              if (r.sem_dono?.length) partes.push(`chegou e-mail de ${r.sem_dono.join(', ')}, que não bate com nenhum envio`);
              toast(partes.join(' · ') || 'Nenhuma resposta nova.', partes.length ? 'ok' : 'info', 6000);
            } catch (e) { toast(e.message, 'err'); }
            finally { UI.carregando(false); }
            desenhar();
          };
          const cobrarTodos = $('#em-cobrar-todos', el);
          if (cobrarTodos) cobrarTodos.onclick = () => enviarVarios(achados, true, desenhar);
          if (marcar) {
            $('#sel-todos', el).onclick = () => { achados.forEach((r) => marcados.add(r.id)); desenhar(false); };
            const escolhidas = () => lista.filter((r) => marcados.has(r.id));
            $('#sel-enviar', el).onclick = () => { if (!marcados.size) return toast('Marque as empresas tocando nelas.', 'err'); enviarVarios(escolhidas(), false, desenhar); };
            $('#sel-cobrar', el).onclick = () => { if (!marcados.size) return toast('Marque as empresas tocando nelas.', 'err'); enviarVarios(escolhidas(), true, desenhar); };
          }
          $$('.linha[data-id]', el).forEach((b) => {
            b.onclick = () => {
              const id = Number(b.dataset.id);
              if (marcar) { if (marcados.has(id)) marcados.delete(id); else marcados.add(id); desenhar(false); return; }
              detalhe(lista.find((r) => r.id === id), desenhar);
            };
          });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(N.recado(e))}</div>`; }
      };
      await desenhar();
      const relogio = setInterval(() => { if (!document.hidden && !busca && !marcar) desenhar(); }, 30000);
      tela._recarregar = desenhar;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  // A conversa, do jeito do computador: a empresa à esquerda, nós recuados
  function htmlConversa(msgs, r) {
    if (!msgs.length) {
      if (!r.resposta_de) return '<div class="text-muted pequeno">Ainda não há mensagens desta empresa.</div>';
      return `<div class="mt12"><div class="pequeno" style="color:var(--navy);font-weight:700">Empresa (${esc(r.resposta_de)})</div>
        <div style="white-space:pre-wrap;line-height:1.5">${esc(r.resposta_texto || '(o texto da resposta não foi lido)')}</div></div>`;
    }
    return msgs.map((m, i) => {
      const nos = m.direcao === 'enviado';
      return `<div class="mt12" style="${nos ? 'margin-left:24px;opacity:.85' : ''}">
        <div class="pequeno" style="font-weight:700;color:${nos ? 'var(--ok, #1f8a4c)' : 'var(--navy)'}">${nos ? `Nós${m.enviado_por ? ` (${esc(L.primeiroNome(m.enviado_por))})` : ''}` : `Empresa (${esc(m.de || '?')})`} · ${esc(L.dataHoraBr(m.quando))}</div>
        <div style="white-space:pre-wrap;line-height:1.5">${esc(m.texto || '')}</div>
        <div class="cv-anexos" data-i="${i}"></div></div>`;
    }).join('');
  }

  // OS ARQUIVOS DE CADA MENSAGEM (83-anexos-dos-emails.sql): o que a
  // empresa mandou abre num toque; o que nós mandamos aparece pelo nome.
  // A mensagem nossa sem a lista não tem o que procurar na caixa.
  function ligarAnexosDaConversa(el, msgs) {
    $$('.cv-anexos', el).forEach((d) => {
      const m = msgs[Number(d.dataset.i)];
      if (m && !(m.direcao === 'enviado' && m.anexos == null)) UI.anexosDoEmail(d, m, 'prospeccao');
    });
  }

  async function detalhe(r, depois) {
    const vez = L.vezDeQuem(r);
    const fones = String(r.telefones || '').split(/[,;/]+/).map((t) => t.trim()).filter(Boolean);
    const cliente = clienteDe(r), pend = PENDENTES[r.id];
    const f = UI.folha(`
      <div><span class="badge ${SELO[r.situacao] || 'b-gray'}">${esc(r.situacao)}</span>${vez === 'nos' ? ' <span class="badge b-1">💬 a vez é nossa</span>' : ''}</div>
      ${cliente && L.clDescricao(cliente) ? `<div class="aviso ${cliente.faturou_2026 ? 'atencao' : 'info'} mt12">💼 ${esc(L.clDescricao(cliente, CLIENTES.periodo))}${cliente.faturou_2026 ? ' — para ela, o e-mail é o de fortalecimento de parceria.' : ''}</div>` : ''}
      ${pend ? `<div class="aviso info mt12">🕒 Já tem envio agendado para ${esc(L.dataHoraBr(pend.quando))}${pend.cobranca ? ' (cobrança)' : ''}.</div>` : ''}
      <dl class="ficha mt12">
        ${r.contato ? `<div><dt>Contato</dt><dd>${esc(r.contato)}</dd></div>` : ''}
        <div class="largo"><dt>E-mails</dt><dd>${L.emailsDe(r.emails).map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || 'nenhum'}</dd></div>
        ${fones.length ? `<div class="largo"><dt>Telefones</dt><dd>${fones.map((t) => `<a href="tel:${esc(t.replace(/\D/g, ''))}">${esc(t)}</a>`).join('<br>')}</dd></div>` : ''}
        ${r.cnpj ? `<div><dt>CNPJ</dt><dd>${esc(r.cnpj)}</dd></div>` : ''}
        ${r.resposta_resumo ? `<div class="largo"><dt>O que a empresa quis</dt><dd>${esc(r.resposta_resumo)}</dd></div>` : ''}
        ${r.observacao ? `<div class="largo"><dt>Observação</dt><dd>${esc(r.observacao)}</dd></div>` : ''}
      </dl>
      <div class="acoes mt16">
        ${r.resposta_de ? '<button class="btn btn-ok" id="ed-responder" type="button">💬 Responder</button>' : ''}
        ${!NAO_MANDA.includes(r.situacao) && L.emailsDe(r.emails).length && !r.resposta_de ? `<button class="btn btn-ok" id="ed-proposta" type="button">${r.situacao === 'Não enviado' ? 'Enviar proposta' : 'Enviar de novo'}</button>` : ''}
        ${r.situacao === 'Enviado' ? '<button class="btn btn-ghost" id="ed-cobrar" type="button">⏰ Cobrar</button>' : ''}
        <button class="btn btn-ghost" id="ed-modelo" type="button">✉ Outro modelo…</button>
        <button class="btn btn-ghost" id="ed-editar" type="button">✏ Editar</button>
        <button class="btn btn-ghost" id="ed-situacao" type="button">Mudar situação</button>
      </div>
      <div class="mt16"><div class="pequeno text-muted" style="font-weight:700">CONVERSA</div><div id="ed-conversa" class="text-muted pequeno">lendo…</div></div>`,
    { titulo: nomeEmpresa(r.empresa) || r.contato || 'Empresa' });
    lerConversa(r.id).then((msgs) => { const c = $('#ed-conversa', f.caixa); if (c) { c.className = ''; c.innerHTML = htmlConversa(msgs, r); ligarAnexosDaConversa(c, msgs); } });
    const on = (id, fn) => { const b = $(id, f.caixa); if (b) b.onclick = fn; };
    on('#ed-responder', () => { f.fechar(); responder(r, depois); });
    on('#ed-proposta', () => { f.fechar(); enviarProposta(r, depois); });
    on('#ed-cobrar', () => { f.fechar(); enviarVarios([r], true, depois); });
    on('#ed-modelo', () => { f.fechar(); enviarVarios([r], false, depois); });
    on('#ed-editar', () => { f.fechar(); editarEmpresa(r, depois); });
    on('#ed-situacao', async () => {
      const nova = await escolherSituacao(r.situacao);
      if (!nova || nova === r.situacao) return;
      try {
        await N.mudar(T, { id: r.id }, { situacao: nova, atualizado_por: eu().nome });
        N.registrar('email_prospeccao_alterado', `${r.empresa || r.contato} · ${nova}`);
        toast('Situação mudada.', 'ok'); f.fechar(); depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    });
  }

  function escolherSituacao(atual) {
    return new Promise((ok) => {
      const f = UI.folha(`<div class="lista">${L.SITUACOES_EMAIL.map((s) => `<button class="linha" type="button" data-s="${esc(s)}"><div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(s)}</span>${s === atual ? '<span class="badge b-gray">atual</span>' : ''}</div></div></button>`).join('')}</div>`,
        { titulo: 'Mudar situação', aoFechar: () => ok(null) });
      $$('.linha', f.caixa).forEach((b) => { b.onclick = () => { ok(b.dataset.s); f.fechar(); }; });
    });
  }

  /* ------------------------------------------------ editar a empresa */
  // como o "corrigir" do computador: empresa trocada perde a identificação
  // da IA (era da outra); e-mail corrigido depois de voltar pode receber de novo
  function editarEmpresa(r, depois) {
    const f = UI.folha(`<form id="ee">
      <div class="fg"><label>Empresa</label><input id="ee-empresa" maxlength="160" autocapitalize="characters" value="${esc(nomeEmpresa(r.empresa))}"></div>
      <div class="fg"><label>Contato</label><input id="ee-contato" maxlength="120" value="${esc(r.contato || '')}"></div>
      <div class="fg"><label>E-mails</label><input id="ee-emails" inputmode="email" autocapitalize="off" value="${esc(r.emails || '')}"><div class="dica">Vários: separe por vírgula.</div></div>
      <div class="fg"><label>Telefones</label><input id="ee-fones" inputmode="tel" value="${esc(r.telefones || '')}"></div>
      <div class="fg"><label>CNPJ</label><input id="ee-cnpj" inputmode="numeric" value="${esc(r.cnpj || '')}"></div>
      <div class="fg"><label>Observação</label><textarea id="ee-obs" rows="3">${esc(r.observacao || '')}</textarea></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Salvar</button></div></form>`, { titulo: `Editar ${nomeEmpresa(r.empresa) || r.contato || ''}` });
    $('#ee', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $(id, f.caixa).value.trim();
      const empresa = v('#ee-empresa'), brutos = v('#ee-emails').split(/[,;\s]+/).filter(Boolean);
      const emails = L.emailsDe(v('#ee-emails'));
      if (!empresa && !v('#ee-contato')) return toast('Informe a empresa ou o contato.', 'err');
      if (brutos.length !== emails.length) return toast('Algum e-mail não parece e-mail. Separe vários por vírgula.', 'err');
      const cnpj = v('#ee-cnpj').replace(/\D/g, '');
      if (cnpj && cnpj.length !== 14) return toast('CNPJ são 14 números (ou deixe em branco).', 'err');
      const corpo = { empresa: nomeEmpresa(empresa) || null, contato: v('#ee-contato') || null, emails: emails.join(', ') || null,
        telefones: v('#ee-fones') || null, cnpj: cnpj || null, observacao: v('#ee-obs') || null, atualizado_por: eu().nome };
      if (L.semAcento(nomeEmpresa(empresa)) !== L.semAcento(nomeEmpresa(r.empresa))) {
        Object.assign(corpo, { ia_artigo: null, ia_nome: null, ia_nome_curto: null, ia_segmentos: null, ia_em: null });
      }
      const antes = L.emailsDe(r.emails).sort().join(',');
      if (r.situacao === 'E-mail voltou' && emails.slice().sort().join(',') !== antes) corpo.situacao = 'Não enviado';
      try {
        await N.mudar(T, { id: r.id }, corpo);
        N.registrar('email_prospeccao_alterado', `${empresa || r.contato} · corrigido`);
        toast('Salvo.', 'ok'); f.fechar(); depois();
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  /* -------------------------------------------- responder a empresa */
  // ✨ PEDIR À IA: a resposta chega pronta, mas quem conhece o cliente é a
  // equipe. Ela escreve o que a resposta precisa dizer, ou de que jeito, e
  // escolhe: escrever de novo (no tom escolhido, cumprindo o pedido) ou
  // ajustar o texto que já está na caixa. "Desfazer" volta ao texto de antes
  // da IA — ajuste que ficou pior não pode custar o texto bom.
  // `volta`: o que já estava escrito quando o envio falhou — a tela reabre
  // com o texto, o assunto e os anexos, sem pedir à IA de novo
  async function responder(r, depois, volta = null) {
    const base = volta?.assunto || r.resposta_assunto || 'Proposta de parceria';
    let tom = '';
    const f = UI.folha(`
      <div id="er-conversa" class="text-muted pequeno">lendo a conversa…</div>
      <form id="er-form" class="mt16">
        <div class="fg"><label>Assunto</label><input id="er-assunto" value="${esc(/^re:/i.test(base) ? base : `Re: ${base}`)}"></div>
        <div class="fg"><label>✨ Pedir à IA <span class="text-muted">(o que a resposta precisa dizer, ou de que jeito)</span></label>
          <textarea id="er-pedido" rows="3" maxlength="1000" placeholder="Ex.: dizer que atendemos aos sábados; propor reunião dia 17/11 às 9h; mais curta e mais calorosa"></textarea>
          <div class="chips mt8" id="er-tons">${L.TONS_RESPOSTA.map(([k, rot]) => `<button type="button" class="chip ${k === tom ? 'on' : ''}" data-tom="${esc(k)}">${esc(rot)}</button>`).join('')}</div>
          <div class="acoes mt8"><button class="btn btn-ghost" id="er-escrever" type="button">✨ Escrever de novo</button><button class="btn btn-ghost" id="er-ajustar" type="button">✏ Ajustar o texto</button><button class="btn btn-ghost" id="er-desfazer" type="button" hidden>↩ Desfazer</button></div></div>
        <div class="fg"><label>Sua resposta <span class="text-muted">(sugerida pela IA — revise)</span></label>
          <textarea id="er-texto" rows="10" maxlength="8000">${esc(volta ? volta.texto : r.sugestao_resposta || '')}</textarea>
          <div class="dica">Sai da caixa da prospecção para ${esc(r.resposta_de || '?')}, na mesma conversa.</div></div>
        <div class="fg"><label>Anexos <span class="text-muted">(quantos quiser, até 20 MB somados)</span></label>
          <div id="er-anexos" class="pequeno"></div>
          <button class="btn btn-ghost mt8" id="er-anexar" type="button">📎 Anexar arquivos</button></div>
        <div class="modal-ft"><button class="btn btn-ok" type="submit">Enviar resposta</button></div>
      </form>`, { titulo: `Responder ${r.empresa || r.contato || ''}` });
    // OS ANEXOS DA RESPOSTA (pedido do dono, 03/11/2026: "não tem onde eu
    // colocar o arquivo"), com o teto do envio da proposta — vários de uma vez
    const anexos = volta ? [...volta.anexos] : [];
    const desenharAnexos = () => {
      const alvo = $('#er-anexos', f.caixa);
      alvo.innerHTML = anexos.length ? anexos.map((a, i) => `<div class="mt8" style="display:flex;gap:8px;align-items:center"><span class="flex1">📎 ${esc(a.nome)} <span class="text-muted">(${esc(L.tamanhoLegivel(a.tamanho))})</span></span><button class="btn-icon" type="button" data-tira="${i}" aria-label="Tirar o anexo">✕</button></div>`).join('')
        : '<span class="text-muted">nenhum</span>';
      $$('[data-tira]', alvo).forEach((b) => { b.onclick = () => { anexos.splice(Number(b.dataset.tira), 1); desenharAnexos(); }; });
    };
    desenharAnexos();
    $('#er-anexar', f.caixa).onclick = async () => { await juntarArquivos(anexos); desenharAnexos(); };
    lerConversa(r.id).then((msgs) => { const c = $('#er-conversa', f.caixa); if (c) { c.className = ''; c.innerHTML = htmlConversa(msgs, r); ligarAnexosDaConversa(c, msgs); } });
    $$('#er-tons .chip', f.caixa).forEach((b) => {
      b.onclick = () => { tom = b.dataset.tom; $$('#er-tons .chip', f.caixa).forEach((x) => x.classList.toggle('on', x === b)); };
    });
    const caixa = () => $('#er-texto', f.caixa);
    let anterior = null;
    const sugerir = async (ajustar = false) => {
      const pedido = $('#er-pedido', f.caixa).value.trim();
      const atual = caixa().value.trim();
      if (ajustar && !pedido) { $('#er-pedido', f.caixa).focus(); return toast('Escreva em "Pedir à IA" o que mudar no texto (ex.: mais curta; acrescente que atendemos sábado).', 'err', 5000); }
      if (ajustar && !atual) return toast('A caixa da resposta está vazia: use "Escrever de novo".', 'err');
      UI.carregando(true, ajustar ? 'A IA está ajustando o texto…' : 'A IA está escrevendo a resposta…');
      try {
        const s = await funcaoEmail(L.corpoSugerir(r.id, { pedido, tom, base: ajustar ? atual : '' }));
        const novo = s.opcoes?.[0]?.texto || s.sugestao_resposta || '';
        if (!novo) throw new Error('A IA voltou sem o texto.');
        anterior = caixa().value;
        caixa().value = novo;
        $('#er-desfazer', f.caixa).hidden = false;
        const { opcoes: _o, modo, ...campos } = s;
        Object.assign(r, campos);
        // a orc-email de antes de 02/11 não devolve `modo` e ignora o pedido
        if (pedido && !modo) toast('A função da nuvem ainda é a antiga e não seguiu o seu pedido. Avise quem publica a orc-email.', 'err', 6000);
        else toast(ajustar ? 'Texto ajustado. Revise antes de enviar.' : 'Resposta pronta. Revise antes de enviar.', 'ok');
      } catch (e) { toast(e.message, 'err'); }
      finally { UI.carregando(false); }
    };
    $('#er-escrever', f.caixa).onclick = () => sugerir(false);
    $('#er-ajustar', f.caixa).onclick = () => sugerir(true);
    $('#er-desfazer', f.caixa).onclick = () => {
      if (anterior === null) return;
      caixa().value = anterior; anterior = null;
      $('#er-desfazer', f.caixa).hidden = true;
    };
    if (!r.sugestao_resposta && !volta) sugerir();
    $('#er-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      // TUDO LIDO ANTES DE CONFIRMAR: a confirmação usa a mesma folha e
      // apaga o formulário — ler o assunto depois dela dava "Cannot read
      // properties of null", e a resposta nunca saía (desde a 2.3)
      const texto = $('#er-texto', f.caixa).value.trim();
      const assunto = $('#er-assunto', f.caixa).value.trim();
      if (!texto) return toast('Escreva a resposta.', 'err');
      if (!(await UI.confirmar(`Enviar esta resposta para ${r.resposta_de}${anexos.length ? ` com ${anexos.length} anexo(s)` : ''}?`, { ok: 'Enviar' }))) {
        return responder(r, depois, { texto, assunto, anexos });
      }
      UI.carregando(true, 'Enviando…');
      try {
        // a orc-email de antes de 03/11/2026 mandava a resposta SEM o anexo,
        // calada: com arquivo, pergunta antes se ela já sabe
        if (anexos.length) {
          const tipos = await funcaoEmail({ acao: 'tipos' }).catch(() => ({}));
          if (!(tipos?.acoes || []).includes('responder_anexos')) {
            throw new Error('A função da nuvem (orc-email) ainda não manda anexo na resposta: publique a versão nova, ou envie sem o anexo.');
          }
        }
        await funcaoEmail({ acao: 'responder', id: r.id, assunto, mensagem: texto,
          ...(anexos.length ? { anexos: anexosParaEnvio(anexos) } : {}) });
        toast('Resposta enviada. Quando a empresa responder de volta, aparece na conversa.', 'ok', 5000);
        depois();
      } catch (err) {
        toast(err.message, 'err', 6000);
        // não saiu: a tela volta com o que estava escrito
        responder(r, depois, { texto, assunto, anexos });
      } finally { UI.carregando(false); }
    };
  }

  /* ------------------------------------- a proposta de parceria (IA) */
  async function enviarProposta(r, depois) {
    // cliente da casa não recebe "conheça a clínica" sem perguntar
    if (ehCliente(r)) {
      const v = await escolher(`${nomeEmpresa(r.empresa)} já é cliente da casa — ${L.clDescricao(clienteDe(r), CLIENTES.periodo)}.\n\nPara cliente, o e-mail é o de fortalecimento de parceria, e não a proposta.`,
        [['modelo', 'Escolher outro modelo', 'btn-ok'], ['seguir', 'Mandar a proposta assim mesmo']], 'Cliente da casa');
      if (!v) return;
      if (v === 'modelo') return enviarVarios([r], false, depois);
    }
    const modelo = await modeloParceria();
    const f = UI.folha(`
      <div class="aviso info" id="ep-aviso">A IA está identificando a empresa…</div>
      <form id="ep-form" class="mt12">
        <div class="fg"><label>Artigo</label><select id="ep-artigo">${UI.opcoes(['o', 'a', '(nenhum)'], r.ia_artigo || (r.ia_em ? '(nenhum)' : 'a'))}</select></div>
        <div class="fg"><label>Nome da empresa no texto</label><input id="ep-nome" value="${esc(r.ia_nome || r.empresa || '')}"></div>
        <div class="fg"><label>Nome curto (as outras vezes)</label><input id="ep-curto" value="${esc(r.ia_nome_curto || '')}"></div>
        <div class="fg"><label>Segmentos em que atua</label><textarea id="ep-seg" rows="3">${esc(r.ia_segmentos || '')}</textarea><div class="dica">Ex.: terceirização de mão de obra, limpeza e conservação e facilities.</div></div>
        <label class="mt12" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ep-cartao"> 🖼 Incluir o cartão da clínica no fim</label>
        <div class="pequeno text-muted mt12" style="font-weight:700">COMO A EMPRESA VAI RECEBER</div>
        <div id="ep-previa" class="mt12" style="border:1px solid var(--line, #dfe6ee);border-radius:10px;padding:12px;line-height:1.5;font-size:14px"></div>
        <div class="modal-ft"><button class="btn btn-ghost" id="ep-rascunho" type="button">📝 Salvar rascunho</button><button class="btn btn-ok" type="submit">Enviar para ${L.emailsDe(r.emails).length} endereço(s)</button></div>
      </form>`, { titulo: `Proposta para ${nomeEmpresa(r.empresa) || r.contato}` });
    // o cartão guardado pela equipe: marcado de saída quando existe
    let cartao = null;
    lerCartao().then((c) => {
      cartao = c;
      const caixa = $('#ep-cartao', f.caixa);
      if (!caixa) return;
      if (c) { caixa.checked = true; previa(); } else { caixa.disabled = true; caixa.parentElement.title = 'Nenhum cartão guardado: guarde pelo computador (Trocar cartão…).'; }
    });
    const campos = () => {
      const art = $('#ep-artigo', f.caixa).value;
      return { ...r, ia_artigo: art === '(nenhum)' ? '' : art, ia_nome: $('#ep-nome', f.caixa).value.trim(),
        ia_nome_curto: $('#ep-curto', f.caixa).value.trim(), ia_segmentos: $('#ep-seg', f.caixa).value.trim().replace(/\.$/, '') };
    };
    const previa = () => {
      const c = campos();
      const comCartao = cartao && $('#ep-cartao', f.caixa)?.checked;
      $('#ep-previa', f.caixa).innerHTML = `<div style="font-weight:800;margin-bottom:8px">${esc(L.preencherModelo(modelo.assunto, c, eu().nome))}</div>${L.marcacaoEmHtml(L.preencherModelo(modelo.corpo, c, eu().nome), esc)}`
        + (comCartao ? `<img alt="Cartão da clínica" style="max-width:100%;border-radius:6px;margin-top:12px" src="data:${esc(cartao.tipo)};base64,${cartao.base64}">` : '');
    };
    const anexosEscolhidos = () => (cartao && $('#ep-cartao', f.caixa).checked ? [cartao] : []);
    // a correção da equipe fica gravada no registro, como no computador
    const gravarIa = (c) => N.mudar(T, { id: r.id }, { ia_artigo: c.ia_artigo, ia_nome: c.ia_nome || null,
      ia_nome_curto: c.ia_nome_curto || null, ia_segmentos: c.ia_segmentos, atualizado_por: eu().nome });
    $$('input,select,textarea', f.caixa).forEach((i) => { i.oninput = previa; i.onchange = previa; });
    previa();
    const aviso = $('#ep-aviso', f.caixa);
    if (L.faltaIa(r)) {
      try {
        const ia = await funcaoEmail({ acao: 'redigir', id: r.id });
        Object.assign(r, ia);
        $('#ep-artigo', f.caixa).value = ia.ia_artigo || '(nenhum)';
        $('#ep-nome', f.caixa).value = ia.ia_nome || '';
        $('#ep-curto', f.caixa).value = ia.ia_nome_curto || '';
        $('#ep-seg', f.caixa).value = ia.ia_segmentos || '';
        aviso.className = ia.conhecida ? 'aviso info' : 'aviso atencao';
        aviso.textContent = ia.conhecida ? 'Identificada pela IA. Confira antes de enviar.' : 'A IA não conhece esta empresa: confira os segmentos.';
        previa();
      } catch (e) { aviso.className = 'aviso atencao'; aviso.textContent = `${e.message} Escreva os segmentos à mão.`; }
    } else aviso.textContent = 'Identificada pela IA. Confira antes de enviar.';

    // GUARDAR PARA DEPOIS: o texto vai com as marcas ({segmentos}...) e a
    // identificação fica no registro — o rascunho serve no computador também
    $('#ep-rascunho', f.caixa).onclick = async () => {
      const c = campos();
      const titulo = await UI.perguntar('Nome do rascunho', { valor: nomeEmpresa(r.empresa), ok: 'Salvar rascunho' });
      if (!titulo) return;
      UI.carregando(true, 'Salvando o rascunho…');
      try {
        if (!L.faltaIa(c)) await gravarIa(c);
        await salvarRascunho({ titulo, assunto: modelo.assunto, corpo: modelo.corpo, registros: [r.id], anexos: anexosEscolhidos() });
        toast('Rascunho salvo. Está na aba Rascunhos para enviar quando quiser.', 'ok', 5000);
        f.fechar(); depois();
      } catch (err) { toast(N.recado(err), 'err'); }
      finally { UI.carregando(false); }
    };

    $('#ep-form', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const c = campos();
      if (L.faltaIa(c)) return toast('Escreva os segmentos em que a empresa atua.', 'err');
      if (!(await UI.confirmar(`Enviar a proposta para ${L.emailsDe(r.emails).join(', ')}?`, { ok: 'Enviar' }))) return;
      UI.carregando(true, 'Enviando…');
      try {
        await gravarIa(c);
        const resp = await funcaoEmail({ acao: 'prospeccao', id: r.id, assunto: L.preencherModelo(modelo.assunto, c, eu().nome),
          mensagem: L.preencherModelo(modelo.corpo, c, eu().nome), cobranca: false, dias_cobrar: L.DIAS_COBRAR,
          anexos: anexosParaEnvio(anexosEscolhidos()) });
        toast(resp.falharam?.length ? `Enviado, mas não foi para ${resp.falharam.join(', ')}.` : 'Proposta enviada.', resp.falharam?.length ? 'err' : 'ok', 5000);
        f.fechar(); depois();
      } catch (err) { toast(err.message, 'err'); }
      finally { UI.carregando(false); }
    };
  }

  /* ----------------------------------------------------------------
     ENVIAR PARA VÁRIAS (ou cobrar), AGORA OU AGENDADO — a JanelaEnviarEmail
     do computador. O formulário é lido ANTES de qualquer pergunta (a
     pergunta usa a mesma folha e o apaga) e reaberto com o que estava
     escrito quando a pessoa desiste.
     ---------------------------------------------------------------- */
  let MODELOS = null, CARTAO;
  async function enviarVarios(regs, cobranca, depois, st = null) {
    if (!MODELOS) { UI.carregando(true, 'Lendo os modelos…'); [MODELOS, CARTAO] = await Promise.all([lerModelos(), lerCartao()]); UI.carregando(false); }
    if (!st) {
      const m = MODELOS.find((x) => x.nome === (cobranca ? L.MODELO_COBRANCA : L.MODELO_PARCERIA)) || MODELOS[0];
      st = { modelo: m.nome, assunto: m.assunto, corpo: m.corpo, dias: L.DIAS_COBRAR, cartao: !!CARTAO && !cobranca, anexos: [], tirados: {} };
    }
    const destinos = regs.map((r) => ({ r, pular: st.tirados[r.id] || L.motivoPular(r, cobranca), pend: PENDENTES[r.id], cliente: clienteDe(r) }));
    const enviaveis = destinos.filter((d) => !d.pular);
    const semIa = L.precisaSegmentos(st.assunto, st.corpo) ? enviaveis.filter((d) => L.faltaIa(d.r)) : [];
    const primeiro = enviaveis[0]?.r || regs[0] || {};
    const nota = (d) => [d.pular ? `fica de fora: ${d.pular}` : '', d.pend && !d.pular ? `🕒 já agendada para ${L.dataHoraBr(d.pend.quando)}` : '',
      d.cliente && L.clDescricao(d.cliente) && !d.pular ? `💼 ${L.clDescricao(d.cliente)}` : ''].filter(Boolean).join(' · ');
    const f = UI.folha(`
      <div class="aviso info"><b>${enviaveis.length}</b> empresa(s) vão receber${destinos.length - enviaveis.length ? ` · ${destinos.length - enviaveis.length} fica(m) de fora` : ''}.</div>
      <div class="fg mt12"><label>Modelo</label><select id="ev-modelo">${UI.opcoes(MODELOS.map((m) => m.nome), st.modelo)}</select></div>
      <div class="fg"><label>Assunto</label><input id="ev-assunto" value="${esc(st.assunto)}"></div>
      <div class="fg"><label>Texto <span class="text-muted">({empresa}, {contato}, {saudacao}… trocam por empresa)</span></label><textarea id="ev-corpo" rows="9">${esc(st.corpo)}</textarea></div>
      <div class="fg"><label>Lembrar de cobrar em (dias)</label><input id="ev-dias" type="number" inputmode="numeric" min="1" max="90" value="${esc(st.dias)}"></div>
      ${CARTAO ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ev-cartao" ${st.cartao ? 'checked' : ''}> 🖼 Incluir o cartão da clínica no fim</label>` : ''}
      <div class="fg mt12"><label>Anexos <span class="text-muted">(quantos quiser, até 20 MB somados)</span></label><div id="ev-anexos" class="pequeno"></div>
        <button class="btn btn-ghost mt8" id="ev-anexar" type="button">📎 Anexar arquivos</button></div>
      ${semIa.length ? `<div class="aviso atencao mt12">${semIa.length} empresa(s) ainda sem os segmentos em que atua(m) — o texto usa {segmentos}.
        <button class="btn btn-ghost mt8" id="ev-ia" type="button" style="width:100%">✨ Identificar com a IA (${semIa.length})</button></div>` : ''}
      <div class="pequeno text-muted mt16" style="font-weight:700">AS EMPRESAS</div>
      <div class="lista">${destinos.map((d) => `<div class="linha" style="cursor:default"><div class="linha__corpo">
        <div class="linha__titulo"><span class="t" style="${d.pular ? 'opacity:.55' : ''}">${d.pular ? '✗ ' : ''}${d.cliente?.faturou_2026 && !d.pular ? '💼 ' : ''}${esc(nomeEmpresa(d.r.empresa) || d.r.contato || '?')}</span></div>
        <div class="linha__sub">${esc(L.emailsDe(d.r.emails).join(', ') || 'sem e-mail')}</div>${nota(d) ? `<div class="linha__sub">${esc(nota(d))}</div>` : ''}</div></div>`).join('')}</div>
      <div class="pequeno text-muted mt16" style="font-weight:700">COMO ${esc(nomeEmpresa(primeiro.empresa) || 'A EMPRESA')} VAI RECEBER</div>
      <div id="ev-previa" class="mt12" style="border:1px solid var(--line, #dfe6ee);border-radius:10px;padding:12px;line-height:1.5;font-size:14px"></div>
      <div class="modal-ft" style="flex-wrap:wrap"><button class="btn btn-ghost" id="ev-rascunho" type="button">📝 Rascunho</button>
        <button class="btn btn-ghost" id="ev-agendar" type="button">🕒 Agendar…</button>
        <button class="btn btn-ok" id="ev-enviar" type="button">${cobranca ? 'Cobrar' : 'Enviar para'} ${enviaveis.length}</button></div>`,
    { titulo: cobranca ? 'Cobrar quem não respondeu' : 'Enviar e-mail' });
    const ler = () => {
      st.modelo = $('#ev-modelo', f.caixa).value;
      st.assunto = $('#ev-assunto', f.caixa).value.trim();
      st.corpo = $('#ev-corpo', f.caixa).value.trim();
      st.dias = Math.max(1, Math.min(90, Number($('#ev-dias', f.caixa).value) || L.DIAS_COBRAR));
      st.cartao = !!$('#ev-cartao', f.caixa)?.checked;
    };
    const desenharAnexos = () => {
      const alvo = $('#ev-anexos', f.caixa);
      alvo.innerHTML = st.anexos.length ? st.anexos.map((a, i) => `<div class="mt8" style="display:flex;gap:8px;align-items:center"><span class="flex1">📎 ${esc(a.nome)} <span class="text-muted">(${esc(L.tamanhoLegivel(a.tamanho))})</span></span><button class="btn-icon" type="button" data-tira="${i}" aria-label="Tirar o anexo">✕</button></div>`).join('')
        : '<span class="text-muted">nenhum</span>';
      $$('[data-tira]', alvo).forEach((b) => { b.onclick = () => { st.anexos.splice(Number(b.dataset.tira), 1); desenharAnexos(); }; });
    };
    const previa = () => {
      ler();
      $('#ev-previa', f.caixa).innerHTML = `<div style="font-weight:800;margin-bottom:8px">${esc(L.preencherModelo(st.assunto, primeiro, eu().nome))}</div>${L.marcacaoEmHtml(L.preencherModelo(st.corpo, primeiro, eu().nome), esc)}`
        + (st.cartao && CARTAO ? `<img alt="Cartão da clínica" style="max-width:100%;border-radius:6px;margin-top:12px" src="data:${esc(CARTAO.tipo)};base64,${CARTAO.base64}">` : '');
    };
    desenharAnexos(); previa();
    $$('#ev-assunto,#ev-corpo,#ev-cartao', f.caixa).forEach((i) => { i.oninput = previa; i.onchange = previa; });
    // trocar o modelo troca o texto (e a lista: "segmentos" pode deixar de travar)
    $('#ev-modelo', f.caixa).onchange = () => {
      ler();
      const m = MODELOS.find((x) => x.nome === st.modelo);
      if (m) { st.assunto = m.assunto; st.corpo = m.corpo; }
      enviarVarios(regs, cobranca, depois, st);
    };
    $('#ev-anexar', f.caixa).onclick = async () => { ler(); await juntarArquivos(st.anexos); desenharAnexos(); };
    const bIa = $('#ev-ia', f.caixa);
    if (bIa) bIa.onclick = async () => {
      ler();
      for (const [i, d] of semIa.entries()) {
        UI.carregando(true, `A IA está identificando ${i + 1} de ${semIa.length}: ${nomeEmpresa(d.r.empresa)}…`);
        try { Object.assign(d.r, await funcaoEmail({ acao: 'redigir', id: d.r.id })); }
        catch (e) { toast(`${nomeEmpresa(d.r.empresa)}: ${e.message}`, 'err', 5000); }
      }
      UI.carregando(false);
      enviarVarios(regs, cobranca, depois, st);
    };
    const reabrir = () => enviarVarios(regs, cobranca, depois, st);
    const anexosDoEnvio = () => [...(st.cartao && CARTAO ? [CARTAO] : []), ...st.anexos];

    // AS CONFERÊNCIAS — as mesmas para enviar agora e para agendar
    // (JanelaEnviarEmail._conferir). Devolve os que vão, ou null (reaberto).
    const conferir = async () => {
      ler();
      if (!st.assunto || !st.corpo) { toast('Falta o assunto ou o texto.', 'err'); return null; }
      let vao = enviaveis;
      if (!vao.length) { toast('Ninguém para receber: veja por que cada empresa ficou de fora.', 'err', 5000); return null; }
      if (vao.length > L.TETO_POR_LOTE) { toast(`São ${vao.length} empresas. Mande no máximo ${L.TETO_POR_LOTE} por vez: o Gmail bloqueia a conta por um dia.`, 'err', 6000); return null; }
      if (L.precisaSegmentos(st.assunto, st.corpo) && vao.some((d) => L.faltaIa(d.r))) {
        toast('Há empresa sem os segmentos: toque em "Identificar com a IA", ou escolha outro modelo.', 'err', 6000); return null;
      }
      // A MESMA EMPRESA EM DOIS ENVIOS: quem já tem envio agendado
      const ja = vao.filter((d) => d.pend);
      if (ja.length) {
        const v = await escolher(`${ja.length === 1 ? '1 empresa já tem' : `${ja.length} empresas já têm`} envio agendado:\n\n${ja.slice(0, 10).map((d) =>
          `• ${nomeEmpresa(d.r.empresa)} — ${L.dataHoraBr(d.pend.quando)}${d.pend.cobranca ? ' (cobrança)' : ''}`).join('\n')}${ja.length > 10 ? `\n• ... e mais ${ja.length - 10}` : ''}`,
        [['tirar', 'Tirar do envio e seguir com as outras', 'btn-ok'], ['seguir', 'Seguir com todas assim mesmo']], 'Já agendadas');
        if (!v) { reabrir(); return null; }
        if (v === 'tirar') { ja.forEach((d) => { st.tirados[d.r.id] = 'já tem envio agendado (🕒 Agendados)'; }); vao = vao.filter((d) => !d.pend); }
      }
      // CLIENTE DA CASA: o e-mail para ele é o de fortalecimento de parceria
      const clientes = cobranca || /fortalecimento/i.test(`${st.assunto} ${st.corpo}`) ? [] : vao.filter((d) => d.cliente?.faturou_2026);
      if (clientes.length) {
        const v = await escolher(`${clientes.length === 1 ? '1 empresa desta lista já é cliente da casa' : `${clientes.length} empresas desta lista já são clientes da casa`} — faturaram em 2026:\n\n${clientes.slice(0, 10).map((d) =>
          `• ${nomeEmpresa(d.r.empresa)} (grupo ${d.cliente.grupo})`).join('\n')}${clientes.length > 10 ? `\n• ... e mais ${clientes.length - 10}` : ''}\n\nPara cliente, o e-mail é o de fortalecimento de parceria, e não o de prospecção.`,
        [['tirar', 'Tirar do envio e seguir com as outras', 'btn-ok'], ['seguir', 'Mandar para todas assim mesmo']], 'Clientes da casa');
        if (!v) { reabrir(); return null; }
        if (v === 'tirar') { clientes.forEach((d) => { st.tirados[d.r.id] = 'cliente da casa — mande o de fortalecimento de parceria'; }); vao = vao.filter((d) => !clientes.includes(d)); }
      }
      if (!vao.length) { reabrir(); toast('Não sobrou ninguém para enviar.', 'err'); return null; }
      return vao;
    };

    $('#ev-enviar', f.caixa).onclick = async () => {
      const vao = await conferir();
      if (!vao) return;
      const enderecos = vao.reduce((s, d) => s + L.emailsDe(d.r.emails).length, 0);
      if (!(await UI.confirmar(`${cobranca ? 'Cobrar' : 'Enviar para'} ${vao.length} empresa(s) (${enderecos} endereço(s))? Sai da caixa da prospecção e não tem como desfazer.`, { ok: cobranca ? 'Cobrar' : 'Enviar' }))) return reabrir();
      const anexos = anexosParaEnvio(anexosDoEnvio());
      let foram = 0; const erros = [];
      for (const [i, d] of vao.entries()) {
        UI.carregando(true, `Enviando ${i + 1} de ${vao.length}: ${nomeEmpresa(d.r.empresa)}…`);
        try {
          const resp = await funcaoEmail({ acao: 'prospeccao', id: d.r.id, assunto: L.preencherModelo(st.assunto, d.r, eu().nome),
            mensagem: L.preencherModelo(st.corpo, d.r, eu().nome), cobranca, dias_cobrar: st.dias, anexos });
          foram += 1;
          if (resp?.falharam?.length) erros.push(`${nomeEmpresa(d.r.empresa)}: não foi para ${resp.falharam.join(', ')}`);
        } catch (e) { erros.push(`${nomeEmpresa(d.r.empresa)}: ${e.message}`); }
        // devagar de propósito, como no computador: rajada parece spam
        if (i < vao.length - 1) await UI.esperar(1500);
      }
      UI.carregando(false);
      toast(erros.length ? `${foram} enviado(s); ${erros.join(' · ')}` : `${foram} enviado(s).`, erros.length ? 'err' : 'ok', 8000);
      depois();
    };

    $('#ev-agendar', f.caixa).onclick = async () => {
      const vao = await conferir();
      if (!vao) return;
      agendarQuando(vao, st, cobranca, depois, anexosDoEnvio(), reabrir);
    };

    $('#ev-rascunho', f.caixa).onclick = async () => {
      ler();
      const regsIds = enviaveis.map((d) => d.r.id);
      const titulo = await UI.perguntar('Nome do rascunho', { valor: st.modelo, ok: 'Salvar rascunho' });
      if (!titulo) return reabrir();
      UI.carregando(true, 'Salvando o rascunho…');
      try {
        await salvarRascunho({ titulo, assunto: st.assunto, corpo: st.corpo, registros: regsIds, anexos: anexosDoEnvio(), cobranca, dias: st.dias });
        toast('Rascunho salvo. Está na aba Rascunhos.', 'ok', 5000);
        depois();
      } catch (err) { toast(N.recado(err), 'err'); reabrir(); }
      finally { UI.carregando(false); }
    };
  }

  // 🕒 O DIA E A HORA: o servidor manda sozinho, de 5 em 5 minutos, com os
  // computadores e o celular desligados. O texto de cada empresa é montado
  // AGORA, com a saudação da hora marcada (prospeccao_nucleo.agendar).
  function agendarQuando(vao, st, cobranca, depois, anexos, reabrir) {
    const sug = L.proximoHorarioUtil();
    const f = UI.folha(`
      <div class="fg"><label>Dia</label><input id="ag-dia" type="date" value="${esc(sug.dia)}"></div>
      <div class="fg"><label>Hora</label><input id="ag-hora" type="time" step="300" value="${esc(sug.hora)}"></div>
      <div class="dica">O servidor manda sozinho na hora marcada (confere de 5 em 5 minutos) — mesmo com tudo desligado. O "Bom dia"/"Boa tarde" sai pela hora marcada. Dá para cancelar em 🕒 Agendados.</div>
      <div class="modal-ft"><button class="btn btn-ghost" id="ag-voltar" type="button">Voltar</button><button class="btn btn-ok" id="ag-ok" type="button">Agendar para ${vao.length}</button></div>`,
    { titulo: 'Agendar o envio' });
    $('#ag-voltar', f.caixa).onclick = () => reabrir();
    $('#ag-ok', f.caixa).onclick = async () => {
      const dia = $('#ag-dia', f.caixa).value, hora = $('#ag-hora', f.caixa).value;
      const { quando, erro } = L.lerQuando(dia, hora);
      if (erro) return toast(erro, 'err', 5000);
      if (!L.diaUtil(dia) && !(await UI.confirmar(`${L.dataBr(dia)} não é dia útil (fim de semana ou feriado). Agendar assim mesmo?`, { ok: 'Agendar' }))) return reabrir();
      UI.carregando(true, 'Agendando…');
      try {
        // a orc-email velha não manda o agendado: ele ficaria parado para sempre
        const tipos = await funcaoEmail({ acao: 'tipos' }).catch(() => ({}));
        if (!(tipos?.acoes || []).includes('agendados')) throw new Error('O agendamento ainda não está no servidor: rode o nuvem/sql/84-emails-agendados.sql no Supabase e publique a orc-email nova.');
        const { data: lote, error } = await N.sb.from('orc_emails_agendamentos').insert({
          agendado_para: quando.toISOString(), titulo: st.assunto.slice(0, 200), cobranca, dias_cobrar: st.dias,
          anexos: anexos.length ? anexosParaEnvio(anexos) : null,
          criado_por: eu().id, criado_por_nome: eu().nome, criado_por_login: eu().usuario }).select('id');
        if (error) throw error;
        const ident = lote?.[0]?.id;
        const itens = vao.map((d) => ({ agendamento_id: ident, registro_id: d.r.id, empresa: nomeEmpresa(d.r.empresa) || d.r.contato || null,
          assunto: L.preencherModelo(st.assunto, d.r, eu().nome, quando), mensagem: L.preencherModelo(st.corpo, d.r, eu().nome, quando), para: null }));
        const { error: e2 } = await N.sb.from('orc_emails_agendados').insert(itens);
        if (e2) {
          // sem as empresas, o agendamento vazio não serve: sai junto
          await N.sb.from('orc_emails_agendamentos').delete().eq('id', ident);
          throw e2;
        }
        N.registrar('email_agendado', `${itens.length} empresa(s) para ${L.dataHoraBr(quando.toISOString())}`);
        toast(`Agendado para ${L.dataHoraBr(quando.toISOString())} — ${itens.length} empresa(s). O servidor manda sozinho.`, 'ok', 6000);
        depois();
      } catch (err) { toast(N.recado(err), 'err', 7000); reabrir(); }
      finally { UI.carregando(false); }
    };
  }

  /* ---------------------------------------------------- os agendados */
  async function lerAgendamentos() {
    try {
      const desde = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await N.sb.from('orc_emails_agendamentos')
        .select('id,agendado_para,titulo,cobranca,situacao,resumo,criado_por_nome,criado_em,terminado_em')
        .gte('agendado_para', desde).order('agendado_para', { ascending: false });
      if (error) throw error;
      const lotes = data || [];
      if (lotes.length) {
        const { data: itens } = await N.sb.from('orc_emails_agendados').select('agendamento_id,situacao').in('agendamento_id', lotes.map((l) => l.id));
        const cont = {};
        for (const i of itens || []) { const c = (cont[i.agendamento_id] ||= {}); c[i.situacao] = (c[i.situacao] || 0) + 1; }
        for (const l of lotes) l.contagem = cont[l.id] || {};
      }
      return { lotes, recado: '' };
    } catch (e) {
      return { lotes: [], recado: /does not exist|PGRST205|404/i.test(String(e?.message || e?.code || e))
        ? 'O agendamento ainda não está no servidor: rode o nuvem/sql/84-emails-agendados.sql no Supabase.' : N.recado(e) };
    }
  }

  async function detalheLote(l, depois) {
    const f = UI.folha(`<div class="text-muted pequeno">lendo…</div>`, { titulo: `🕒 ${L.dataHoraBr(l.agendado_para)}` });
    let itens = [];
    try {
      const { data, error } = await N.sb.from('orc_emails_agendados').select('id,empresa,assunto,situacao,erro,enviado_em')
        .eq('agendamento_id', l.id).order('id');
      if (error) throw error;
      itens = data || [];
    } catch (e) { f.caixa.querySelector('.text-muted').textContent = N.recado(e); return; }
    const vivo = ['agendado', 'enviando'].includes(l.situacao);
    // lote cancelado: o que esperava não sai mais
    const sit = (i) => (l.situacao === 'cancelado' && i.situacao === 'agendado' ? 'cancelado' : i.situacao);
    f.caixa.innerHTML = f.caixa.innerHTML.replace(/<div class="text-muted pequeno">lendo…<\/div>/, '') + `
      <div class="pequeno text-muted">${l.cobranca ? '[cobrança] ' : ''}${esc(l.titulo || '')} · ${esc(L.SITUACOES_AGENDAMENTO[l.situacao] || l.situacao)} · ${esc(l.criado_por_nome || '')}</div>
      ${l.resumo ? `<div class="mt8">${esc(l.resumo)}</div>` : ''}
      <div class="lista mt12">${itens.map((i) => `<div class="linha" style="cursor:default"><div class="linha__corpo">
        <div class="linha__titulo"><span class="t">${esc(i.empresa || '?')}</span><span class="badge ${{ enviado: 'b-ok', falhou: 'b-4', pulado: 'b-3', cancelado: 'b-gray' }[sit(i)] || 'b-1'}">${esc(L.SITUACOES_AGENDADO[sit(i)] || sit(i))}</span></div>
        ${i.erro ? `<div class="linha__sub">${esc(i.erro)}</div>` : ''}${i.enviado_em ? `<div class="linha__sub">enviado ${esc(L.dataHoraBr(i.enviado_em))}</div>` : ''}</div></div>`).join('')}</div>
      ${vivo ? '<div class="modal-ft"><button class="btn btn-danger" id="lt-cancelar" type="button">Cancelar agendamento</button></div>' : ''}`;
    const fechar = $('.modal-fechar', f.caixa);
    if (fechar) fechar.onclick = () => f.fechar();
    const b = $('#lt-cancelar', f.caixa);
    if (b) b.onclick = async () => {
      if (!(await UI.confirmar(`Cancelar o envio marcado para ${L.dataHoraBr(l.agendado_para)}? O que ainda não saiu não sai mais.`, { ok: 'Cancelar o envio', cancelar: 'Voltar', perigo: true }))) return;
      try {
        // O LOTE PRIMEIRO: o servidor confere o lote antes de cada empresa
        const { data, error } = await N.sb.from('orc_emails_agendamentos').update({ situacao: 'cancelado' })
          .eq('id', l.id).in('situacao', ['agendado', 'enviando']).select('id');
        if (error) throw error;
        if (!data?.length) { toast('Esse agendamento já terminou ou foi cancelado.', 'info'); return depois(); }
        await N.sb.from('orc_emails_agendados').update({ situacao: 'cancelado' }).eq('agendamento_id', l.id).eq('situacao', 'agendado');
        N.registrar('email_agendamento_cancelado', `agendamento ${l.id}`);
        toast('Cancelado: o que ainda não tinha saído não sai mais.', 'ok', 5000);
        depois();
      } catch (e) { toast(N.recado(e), 'err'); }
    };
  }

  /* ------------------------------------- buscar empresas na internet */
  // a busca com IA do computador (JanelaBuscarEmpresas, "Internet com IA"):
  // a base da Receita mora no computador, e por isso aqui só a internet
  function buscarEmpresas(lista, depois, estado = null) {
    const st = estado || { consulta: '', achadas: [], marcadas: new Set() };
    const noControle = (e) => {
      const nomes = new Set(lista.map((r) => L.clChave(r.empresa)));
      const emails = new Set(lista.flatMap((r) => L.emailsDe(r.emails)));
      return nomes.has(L.clChave(e.nome)) || (e.emails || []).some((m) => emails.has(String(m).toLowerCase()));
    };
    const f = UI.folha(`
      <div class="fg"><label>O que procurar</label><input id="be-consulta" placeholder="Ex.: construtoras em Candeias" value="${esc(st.consulta)}"></div>
      <button class="btn btn-ok" id="be-buscar" type="button" style="width:100%">🔎 Buscar na internet (IA, ≈ R$ 0,30)</button>
      ${st.achadas.length ? `<div class="pequeno text-muted mt16" style="font-weight:700">${st.achadas.length} ACHADA(S) — toque para marcar</div>
        <div class="lista">${st.achadas.map((e, i) => {
          const cl = CLIENTES.tamanho ? CLIENTES.achar(e.nome) : null, ja = noControle(e);
          return `<button class="linha" type="button" data-be="${i}"><span style="font-size:22px;width:26px">${st.marcadas.has(i) ? '☑' : '☐'}</span><div class="linha__corpo">
            <div class="linha__titulo"><span class="t">${cl?.faturou_2026 ? '💼 ' : ''}${esc(nomeEmpresa(e.nome))}</span>${ja ? '<span class="badge b-gray">já no controle</span>' : ''}</div>
            <div class="linha__sub">${esc([e.cidade, e.ramo].filter(Boolean).join(' · '))}</div>
            <div class="linha__sub">${esc((e.emails || []).join(', ') || 'sem e-mail')}</div>
            ${cl && L.clDescricao(cl) ? `<div class="linha__sub">💼 ${esc(L.clDescricao(cl))}</div>` : ''}</div></button>`;
        }).join('')}</div>
        <div class="modal-ft"><button class="btn btn-ok" id="be-adicionar" type="button">➕ Adicionar ao controle (${st.marcadas.size})</button></div>` : ''}`,
    { titulo: '🔎 Buscar empresas' });
    $('#be-buscar', f.caixa).onclick = async () => {
      st.consulta = $('#be-consulta', f.caixa).value.trim();
      if (!st.consulta) return toast('Escreva o que procurar.', 'err');
      UI.carregando(true, 'A IA está pesquisando na internet (até dois minutos)…');
      try {
        const resp = await funcaoEmail({ acao: 'buscar_empresas', consulta: st.consulta, quantas: 20,
          evitar: lista.map((r) => r.empresa).filter(Boolean).slice(0, 150) });
        st.achadas = (resp.empresas || []).map((e) => ({ ...e, emails: e.emails || [] }));
        // marcadas de saída: as que não são cliente nem já estão no controle
        st.marcadas = new Set(st.achadas.map((e, i) => i).filter((i) => {
          const e = st.achadas[i];
          return !noControle(e) && !(CLIENTES.tamanho && CLIENTES.achar(e.nome)?.faturou_2026) && e.emails.length;
        }));
        if (!st.achadas.length) toast('A internet não trouxe nada novo.', 'info');
      } catch (e) { toast(e.message, 'err', 6000); }
      finally { UI.carregando(false); }
      buscarEmpresas(lista, depois, st);
    };
    $$('[data-be]', f.caixa).forEach((b) => {
      b.onclick = () => { const i = Number(b.dataset.be); if (st.marcadas.has(i)) st.marcadas.delete(i); else st.marcadas.add(i); buscarEmpresas(lista, depois, st); };
    });
    const bAdd = $('#be-adicionar', f.caixa);
    if (bAdd) bAdd.onclick = async () => {
      const novas = [...st.marcadas].map((i) => st.achadas[i]).filter((e) => !noControle(e));
      if (!novas.length) return toast('Marque as empresas que vão para o controle (as que já estão nele ficam de fora).', 'err', 5000);
      const clientes = novas.filter((e) => CLIENTES.tamanho && CLIENTES.achar(e.nome)?.faturou_2026);
      if (!(await UI.confirmar(`Adicionar ${novas.length} empresa(s) ao controle como "Não enviado"?${clientes.length ? `\n\n${clientes.length} delas já são clientes da casa: ${clientes.map((e) => nomeEmpresa(e.nome)).join(', ')}.` : ''}`, { ok: 'Adicionar' }))) {
        return buscarEmpresas(lista, depois, st);
      }
      UI.carregando(true, 'Gravando…');
      try {
        const { error } = await N.sb.from(T).insert(novas.map((e) => ({
          empresa: nomeEmpresa(e.nome), contato: null, emails: (e.emails || []).join(', ') || null,
          telefones: (e.telefones || []).join(', ') || null, cnpj: String(e.cnpj || '').replace(/\D/g, '') || null,
          observacao: [e.ramo, e.site].filter(Boolean).join(' · ').slice(0, 400) || null,
          data: L.hojeISO(), situacao: 'Não enviado', criado_por: eu().id, criado_por_nome: eu().nome, atualizado_por: eu().nome })));
        if (error) throw error;
        N.registrar('email_prospeccao_novo', `${novas.length} empresa(s) pela busca na internet`);
        toast(`${novas.length} empresa(s) no controle, como "Não enviado". Agora: Não enviados › ☑ Selecionar › ✉ Enviar.`, 'ok', 7000);
        depois();
      } catch (err) { toast(N.recado(err), 'err'); buscarEmpresas(lista, depois, st); }
      finally { UI.carregando(false); }
    };
  }

  /* ------------------------------------------------------ rascunhos */
  async function lerRascunhos() {
    try {
      const { data, error } = await N.sb.from('orc_emails_rascunhos').select('*').order('atualizado_em', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch { return []; }      // sem o SQL 79: nenhum rascunho
  }

  async function salvarRascunho({ titulo, assunto, corpo, registros, anexos, ident = null, cobranca = false, dias = L.DIAS_COBRAR }) {
    const linha = { titulo: String(titulo || 'Rascunho').slice(0, 120), assunto, corpo, registros,
      anexos: (anexos || []).map((a) => ({ nome: a.nome, tipo: a.tipo, base64: a.base64, foto: !!a.foto, cartao: !!a.cartao })),
      cobranca: !!cobranca, dias_cobrar: dias, atualizado_em: new Date().toISOString() };
    if (ident) return N.mudar('orc_emails_rascunhos', { id: ident }, linha);
    const { data, error } = await N.sb.from('orc_emails_rascunhos')
      .insert({ ...linha, criado_por: eu().id, criado_por_nome: eu().nome }).select();
    if (error) throw error;
    return data?.[0];
  }

  // Enviar um rascunho: o texto de cada empresa sai do texto guardado,
  // trocando as marcas pelo que a IA identificou dela. Empresa sem os
  // segmentos fica de fora (o texto sairia com buraco), e o rascunho só sai
  // da lista quando foi para todas.
  function abrirRascunho(ra, lista, depois) {
    const regs = (ra.registros || []).map((id) => lista.find((r) => r.id === id)).filter(Boolean);
    // só a {segmentos} trava: os outros modelos usam nome e artigo, que têm reserva
    const usaIa = /\{segmentos\}/.test(`${ra.assunto}${ra.corpo}`);
    const prontos = regs.filter((r) => !NAO_MANDA.includes(r.situacao) && L.emailsDe(r.emails).length && !(usaIa && L.faltaIa(r)));
    const fora = regs.filter((r) => !prontos.includes(r));
    const primeiro = prontos[0] || regs[0] || {};
    const f = UI.folha(`
      <div class="pequeno text-muted">${esc(ra.criado_por_nome || '')} · salvo em ${esc(L.dataHoraBr(ra.atualizado_em))}</div>
      <div class="mt12"><b>Vai para ${prontos.length} empresa(s):</b> ${esc(prontos.map((r) => nomeEmpresa(r.empresa)).join(', ') || 'nenhuma')}</div>
      ${fora.length ? `<div class="aviso atencao mt12">Ficam de fora: ${esc(fora.map((r) => `${nomeEmpresa(r.empresa)} (${NAO_MANDA.includes(r.situacao) ? r.situacao.toLowerCase() : !L.emailsDe(r.emails).length ? 'sem e-mail' : 'sem os segmentos — identifique no envio'})`).join('; '))}</div>` : ''}
      ${(ra.anexos || []).length ? `<div class="pequeno text-muted mt12">${(ra.anexos || []).map((a) => `${a.cartao ? '🖼 cartão da clínica' : a.foto ? '🖼' : '📎'} ${esc(a.cartao ? '' : a.nome)}`).join(' · ')}</div>` : ''}
      <div class="pequeno text-muted mt16" style="font-weight:700">COMO ${esc(nomeEmpresa(primeiro.empresa) || 'A EMPRESA')} VAI RECEBER</div>
      <div class="mt12" style="border:1px solid var(--line, #dfe6ee);border-radius:10px;padding:12px;line-height:1.5;font-size:14px">
        <div style="font-weight:800;margin-bottom:8px">${esc(L.preencherModelo(ra.assunto, primeiro, eu().nome))}</div>${L.marcacaoEmHtml(L.preencherModelo(ra.corpo, primeiro, eu().nome), esc)}</div>
      <div class="modal-ft"><button class="btn btn-ghost" id="ra-apagar" type="button">Apagar rascunho</button>${prontos.length ? `<button class="btn btn-ok" id="ra-enviar" type="button">Enviar para ${prontos.length}</button>` : ''}</div>`,
    { titulo: `📝 ${ra.titulo}` });
    $('#ra-apagar', f.caixa).onclick = async () => {
      if (!(await UI.confirmar('Apagar este rascunho?', { ok: 'Apagar', perigo: true }))) return;
      try { await N.apagar('orc_emails_rascunhos', { id: ra.id }); toast('Rascunho apagado.', 'ok'); f.fechar(); depois(); }
      catch (e) { toast(N.recado(e), 'err'); }
    };
    const b = $('#ra-enviar', f.caixa);
    if (b) b.onclick = async () => {
      if (!(await UI.confirmar(`Enviar para ${prontos.length} empresa(s)? Sai da caixa da prospecção e não tem como desfazer.`, { ok: 'Enviar' }))) return;
      let foram = 0; const erros = [];
      for (const [i, r] of prontos.entries()) {
        UI.carregando(true, `Enviando ${i + 1} de ${prontos.length}: ${nomeEmpresa(r.empresa)}…`);
        try {
          await funcaoEmail({ acao: 'prospeccao', id: r.id, assunto: L.preencherModelo(ra.assunto, r, eu().nome),
            mensagem: L.preencherModelo(ra.corpo, r, eu().nome), cobranca: !!ra.cobranca, dias_cobrar: ra.dias_cobrar || 7,
            anexos: anexosParaEnvio(ra.anexos) });
          foram += 1;
        } catch (e) { erros.push(`${nomeEmpresa(r.empresa)}: ${e.message}`); }
        // devagar de propósito, como no computador: rajada parece spam
        if (i < prontos.length - 1) await UI.esperar(1500);
      }
      UI.carregando(false);
      if (!erros.length && !fora.length) { try { await N.apagar('orc_emails_rascunhos', { id: ra.id }); } catch { /* fica */ } }
      toast(erros.length ? `${foram} enviado(s); com erro: ${erros.join(' · ')}` : `${foram} enviado(s).`, erros.length ? 'err' : 'ok', 7000);
      f.fechar(); depois();
    };
  }

  /* ---------------------------------------------- cadastrar empresa */
  function novaEmpresa() {
    const f = UI.folha(`<form id="ne">
      <div class="fg"><label>Empresa</label><input id="ne-empresa" maxlength="160" autocapitalize="characters" required></div>
      <div class="fg"><label>Contato</label><input id="ne-contato" maxlength="120"></div>
      <div class="fg"><label>E-mails</label><input id="ne-emails" inputmode="email" autocapitalize="off" placeholder="rh@empresa.com, sesmt@empresa.com"><div class="dica">Vários: separe por vírgula.</div></div>
      <div class="fg"><label>Telefones</label><input id="ne-fones" inputmode="tel"></div>
      <div class="fg"><label>CNPJ</label><input id="ne-cnpj" inputmode="numeric"><div class="dica">Opcional — ajuda a IA a identificar empresa pequena.</div></div>
      <div class="modal-ft"><button class="btn btn-ok" type="submit">Cadastrar</button></div></form>`, { titulo: 'Nova empresa' });
    $('#ne', f.caixa).onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $(id, f.caixa).value.trim();
      const brutos = v('#ne-emails').split(/[,;\s]+/).filter(Boolean);
      const emails = L.emailsDe(v('#ne-emails'));
      if (brutos.length !== emails.length) return toast('Algum e-mail não parece e-mail. Separe vários por vírgula.', 'err');
      const cnpj = v('#ne-cnpj').replace(/\D/g, '');
      if (cnpj && cnpj.length !== 14) return toast('CNPJ são 14 números (ou deixe em branco).', 'err');
      // TUDO LIDO ANTES DO "JÁ RECEBEU": a confirmação usa a mesma folha e
      // apaga o formulário — lidos depois dela, os campos davam erro
      const empresa = v('#ne-empresa'), contato = v('#ne-contato'), fones = v('#ne-fones');
      // QUEM JÁ É CLIENTE não recebe prospecção (pedido do dono, 03/11/2026)
      const cl = CLIENTES.tamanho ? CLIENTES.achar(empresa) : null;
      if (cl?.faturou_2026 && !(await UI.confirmar(`${nomeEmpresa(empresa)} já é cliente da casa — ${L.clDescricao(cl, CLIENTES.periodo)}. O e-mail para ela é o de fortalecimento de parceria. Cadastrar assim mesmo?`, { ok: 'Cadastrar' }))) return;
      // o aviso de "já recebeu" do computador
      try {
        if (emails.length) {
          const { data } = await N.sb.from(T).select('empresa,situacao,emails').neq('situacao', 'Não enviado').limit(5000);
          const ja = (data || []).find((x) => L.emailsDe(x.emails).some((m) => emails.includes(m)));
          if (ja && !(await UI.confirmar(`${ja.empresa || 'Esta empresa'} já recebeu e-mail (${ja.situacao}). Cadastrar mesmo assim?`, { ok: 'Cadastrar' }))) return;
        }
        const { data, error } = await N.sb.from(T).insert({
          empresa: nomeEmpresa(empresa), contato: contato || null, emails: emails.join(', ') || null,
          telefones: fones || null, cnpj: cnpj || null, data: L.hojeISO(), situacao: 'Não enviado',
          criado_por: eu().id, criado_por_nome: eu().nome, atualizado_por: eu().nome,
        }).select();
        if (error) throw error;
        N.registrar('email_prospeccao_novo', `${empresa} <${emails.join(', ') || 'sem e-mail'}>`);
        f.fechar();
        if (tela._recarregar) tela._recarregar();
        if (emails.length && data?.length && await UI.confirmar('Empresa cadastrada. Enviar a proposta de parceria agora?', { ok: 'Enviar proposta', cancelar: 'Depois' })) {
          enviarProposta(data[0], () => tela._recarregar && tela._recarregar());
        } else toast('Empresa cadastrada.', 'ok');
      } catch (err) { toast(N.recado(err), 'err'); }
    };
  }

  async function contar() {
    const { data, error } = await N.sb.from(T).select('id,respondido_em,respondemos_em').eq('situacao', 'Respondeu').limit(2000);
    if (error) throw error;
    return (data || []).filter((r) => L.vezDeQuem(r) === 'nos').length;
  }

  MODULOS.emails = {
    chave: 'emails', nome: 'E-mails', sub: 'Prospecção: enviar, agendar, cobrar e responder', icone: ICONES.emails,
    // visto próprio, o mesmo do computador (80-vistos-emails-e-pesquisa.sql)
    precisa: (u) => L.temModulo(u, 'controle_emails'),
    abrir: () => UI.ir(tela),
    contar,
  };
})();
