/* =====================================================================
   Homologação de atestados: a fila do médico e a consulta da equipe.

   O RH de cada empresa lança o atestado pelo site (homologacao/), e o
   médico da clínica (categoria "Diretor médico" em Usuários, o Dr.
   Everaldo) dá o parecer. Aqui no celular:
     - o médico vê a fila dele ("Para aprovar"), abre o atestado e dá o
       parecer com as MESMAS regras do site (processo.html): o parecer não
       se digita, os motivos de Pendente e Reprovar vêm de uma lista
       pronta, e a observação só aparece nesses dois;
     - quem tem o módulo "Homologação" (a equipe) acompanha, só leitura:
       o banco não deixa a equipe mexer em processo (homol_proc_alterar
       é do médico e do RH, 01-esquema.sql).

   As tabelas são as homol_* do site, sem coluna nova. Quem decide o que
   o parecer faz com o processo (finalizar, devolver à empresa, carimbar
   quem e quando) é o gatilho homol_processo_regras; a tela só pede.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, toast, ICONES } = UI;
  const eu = () => N.estado.eu;
  const BALDE = 'homologacao';

  // O ícone mora aqui para não mexer no ui.js: um atestado com a cruz.
  const ICONE_HOMOLOGACAO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/></svg>';

  // As mesmas colunas do COLUNAS_LISTA do site (dados.js). Na lista vai
  // só o id dos anexos, para marcar "sem anexo" sem baixar a ficha deles.
  const CAMPOS = 'id,empresa_cnpj,empresa_nome,requisitante,cpf,chapa,nome,filial,inicio,' +
    'hora_inicio,dias,fim,tipo,medico,entidade,cid,responsavel,observacoes,parecer,parecer_obs,' +
    'parecer_por,parecer_em,situacao,atividade,abertura,criado_por_nome';
  const CAMPOS_LISTA = `${CAMPOS},homol_anexo(id)`;

  /* ===================================================================
     REGRAS PURAS. Sem DOM nem rede, para dar para testar depois
     (window.HOMOLOG_LOGICA). Ficam aqui, e não no logica.js, porque são
     do site da homologação e mudam junto com ele.
     =================================================================== */
  const H = {};
  const dois = (n) => String(n).padStart(2, '0');
  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // A atividade que quer dizer "esperando o médico". É a fila dele.
  H.AVALIA = 'Clínica avalia atestado';

  // OS MOTIVOS DO PARECER, copiados do processo.html (var MOTIVOS). Lista
  // fechada de propósito: texto livre vira recado ambíguo para a empresa.
  // Mudou lá, muda aqui, com as mesmas palavras.
  H.MOTIVOS = {
    Pendente: [
      'Atestado ilegível: enviar nova foto ou arquivo',
      'Falta a CID ou a autorização do colaborador para informá-la',
      'Falta assinatura ou carimbo com o registro do profissional',
      'Falta a data de emissão',
      'Falta a quantidade de dias de afastamento',
      'O arquivo enviado não é o atestado',
      'Enviar o atestado original para conferência',
    ],
    Reprovado: [
      'Profissional sem registro válido no conselho',
      'Indício de rasura ou adulteração',
      'Datas do atestado não conferem com o afastamento informado',
      'Atestado entregue fora do prazo',
      'Atestado de comparecimento não justifica o dia inteiro',
      'Documento não é atestado médico ou odontológico',
    ],
  };
  // O parecer_obs guarda motivos e observação juntos: "motivo; motivo.
  // Observação: texto livre". A marca é a do site, para os dois lerem.
  H.MARCA_OBS = 'Observação: ';

  // Quem responde pelo abono (dados.js, RESPONSAVEIS[0]). O banco cobra o
  // responsável para aprovar, e o site o carimba quando está vazio.
  H.RESPONSAVEL = { codigo: '6276', nome: 'DR. EVERALDO BARBOSA RIBEIRO FILHO', registro: 'CRM-BA 6276', funcao: 'Diretor médico, homologação' };

  // As três decisões, com o rótulo do botão do site.
  H.DECISOES = [['Aprovado', 'Aprovar'], ['Pendente', 'Pendente'], ['Reprovado', 'Reprovar']];

  // O MÉDICO, igual ao homol_eh_medico(): usuário ativo com a categoria
  // "Diretor médico", sem ligar para maiúscula nem para o acento do "é".
  H.ehMedico = (u) => !!u && u.ativo !== false &&
    String(u.cargo || '').toLowerCase().replace(/é/g, 'e') === 'diretor medico';

  // A EQUIPE, igual ao homol_is_equipe(): administrador ou módulo marcado.
  H.eEquipe = (u) => !!u && u.ativo !== false &&
    (!!u.admin || (Array.isArray(u.modulos) ? u.modulos : []).includes('homologacao'));

  // Em que aba cada processo cai (painel.html, naAba). Para o médico a
  // primeira aba é a fila DELE: o que ele devolveu como Pendente espera a
  // empresa, e fica em "Já avaliados" até ela reenviar.
  H.naAba = (p, medico) => medico ? (p.atividade === H.AVALIA ? 'aberto' : 'finalizado') : p.situacao;

  H.soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
  H.cpfBonito = (t) => {
    const c = H.soDigitos(t);
    return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : String(t || '');
  };
  H.dataBr = (iso) => {
    const p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : '';
  };
  H.dataHoraBr = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  };
  const diaLocal = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d, 12); };
  H.diasEntre = (de, ate) => Math.round((diaLocal(ate) - diaLocal(de)) / 86400000);
  H.somarDias = (iso, n) => { const d = diaLocal(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };
  H.hora = (t) => String(t || '08:00').slice(0, 5);
  H.nDias = (n) => `${n} ${Number(n) === 1 ? 'dia' : 'dias'}`;

  // O documento da pessoa. Processo novo tem CPF; o antigo, só a
  // matrícula (a coluna se chama `chapa`, mas na tela é "Matrícula").
  H.documentos = (p) => {
    const d = [];
    if (p.cpf) d.push(['CPF', H.cpfBonito(p.cpf)]);
    if (p.chapa) d.push(['Matrícula', String(p.chapa)]);
    return d;
  };

  // Os campos jsonb, como texto de tela.
  H.textoCid = (cid) => cid && cid.codigo ? `${cid.codigo}${cid.nome ? `: ${cid.nome}` : ''}` : '';
  H.textoPessoa = (o) => o ? [o.nome, o.registro].filter(Boolean).join(', ') : '';

  // O selo pela atividade, que é o que diz em que pé o processo está.
  H.selo = (atividade) => ({
    'Clínica avalia atestado': 'b-1', 'Aguardando documento': 'b-4',
    'Homologado': 'b-ok', 'Não homologado': 'b-err',
  }[atividade] || 'b-gray');

  // Fila por ordem de lançamento, o mais antigo primeiro (painel.html:
  // "para nenhum prazo se perder no fim da lista"). Os já decididos vêm
  // do mais novo para o mais antigo: no celular ninguém rola mil linhas
  // para achar o de ontem, igual ao histórico dos Chamados.
  H.ordenar = (lista, aba) => lista.slice().sort((a, b) => {
    const x = String(a.abertura || ''), y = String(b.abertura || '');
    const c = x < y ? -1 : x > y ? 1 : (Number(a.id) - Number(b.id));
    return aba === 'aberto' ? c : -c;
  });

  // Palavra a palavra, sem acento nem caixa, nos campos que o painel do
  // site procura. O CPF casa com ou sem pontuação.
  H.filtrar = (lista, termo) => {
    const palavras = semAcento(termo).toLowerCase().split(/\s+/).filter(Boolean);
    if (!palavras.length) return lista;
    return lista.filter((l) => {
      const texto = semAcento([l.id, l.empresa_nome, l.cid && l.cid.codigo, l.cid && l.cid.nome, l.requisitante,
        l.atividade, l.cpf, H.cpfBonito(l.cpf || ''), l.chapa, l.nome, l.filial, H.dataBr(l.inicio), H.dataBr(l.fim),
        l.dias, l.parecer].join(' ')).toLowerCase();
      return palavras.every((p) => texto.includes(p));
    });
  };

  // "motivo; motivo. Observação: livre" -> {motivos, livre}. A mesma
  // separação do montarAvaliacao() do site.
  H.separarParecer = (obs) => {
    const t = String(obs || ''), corte = t.indexOf(H.MARCA_OBS);
    const livre = corte >= 0 ? t.slice(corte + H.MARCA_OBS.length) : '';
    const motivos = (corte >= 0 ? t.slice(0, corte) : t).replace(/\.\s*$/, '').split('; ').filter(Boolean);
    return { motivos, livre };
  };
  // O caminho de volta. Aprovado não leva motivo nem observação.
  H.montarParecer = (par, motivos, livre) => {
    if (par === 'Aprovado') return '';
    const l = String(livre || '').trim();
    return [(motivos || []).join('; '), l ? H.MARCA_OBS + l : ''].filter(Boolean).join('. ');
  };
  // Processo que ninguém avaliou ainda nasce "Pendente" sem motivo: aí
  // nenhuma decisão vem marcada, como no site.
  H.decisaoInicial = (p) => (p.parecer === 'Pendente' && !p.parecer_obs ? '' : p.parecer || '');
  // Só ficam marcados os motivos que existem na lista da decisão.
  H.motivosDaDecisao = (par, marcados) => (marcados || []).filter((m) => (H.MOTIVOS[par] || []).includes(m));

  // O que falta antes de pedir ao servidor. O banco cobra o mesmo
  // (FALTA_MOTIVO e FALTA_CAMPO no homol_processo_regras); aqui é só para
  // dizer tudo de uma vez, e não um erro por clique.
  H.conferirParecer = (p, par, motivos, livre) => {
    const falta = [];
    if (!par) return ['a decisão (Aprovar, Pendente ou Reprovar)'];
    if (par === 'Aprovado') {
      if (!p.tipo) falta.push('tipo de atestado');
      if (!p.medico) falta.push('médico que assinou o atestado');
      if (!p.entidade) falta.push('entidade');
    } else if (!(motivos || []).length && !String(livre || '').trim()) {
      falta.push('pelo menos um motivo (ou uma observação)');
    }
    return falta;
  };
  // O PATCH do médico: só o parecer e o texto. O resto o gatilho carimba
  // (situação, atividade, quem e quando). O responsável vai só se estiver
  // vazio, como o site faz ao abrir a ficha.
  H.corpoDoParecer = (p, par, motivos, livre) => {
    const corpo = { parecer: par, parecer_obs: H.montarParecer(par, motivos, livre) || null };
    if (!p.responsavel) corpo.responsavel = H.RESPONSAVEL;
    return corpo;
  };

  // O banco devolve as regras como "CODIGO: frase". A frase é para gente.
  H.limparErro = (m) => {
    const s = String(m || '');
    const r = s.match(/^[A-Z_]+:\s*(.+)$/);
    return r ? r[1].charAt(0).toUpperCase() + r[1].slice(1).replace(/\.?$/, '.') : s;
  };

  // O HISTÓRICO DO PACIENTE e a REGRA DOS 60 DIAS (Decreto 3.048/1999,
  // art. 75), a mesma conta do desenharHistPaciente() do site: atestados
  // pela mesma doença (as três primeiras posições da CID) que, somados em
  // 60 dias, passam de 15 dias saem da empresa e vão para o INSS.
  // `hist` são os OUTROS processos da pessoa na mesma empresa.
  H.regra60 = (p, hist) => {
    const validos = hist.filter((h) => h.parecer !== 'Reprovado');
    const umAno = H.somarDias(p.inicio, -365);
    const diasAno = validos.filter((h) => h.inicio >= umAno && h.inicio <= p.inicio).reduce((s, h) => s + Number(h.dias || 0), 0);
    const janela = validos.filter((h) => { const d = H.diasEntre(h.inicio, p.inicio); return d >= 0 && d <= 60; });
    let alerta = null;
    if (p.cid && p.cid.codigo) {
      const cat = String(p.cid.codigo).slice(0, 3);
      const mesma = janela.filter((h) => h.cid && h.cid.codigo && String(h.cid.codigo).slice(0, 3) === cat);
      const soma = mesma.reduce((s, h) => s + Number(h.dias || 0), 0) + Number(p.dias || 0);
      if (mesma.length && soma > 15) alerta = { forte: true, texto: `Regra dos 60 dias: com este, são ${mesma.length + 1} atestados pela CID ${cat} em 60 dias, somando ${soma} dias. O que passar de 15 dias cabe ao INSS.` };
      else if (mesma.length) alerta = { forte: false, texto: `Mesma CID (${cat}) nos últimos 60 dias: ${mesma.length} atestado(s), ${soma} dias com este.` };
    } else {
      const soma60 = janela.reduce((s, h) => s + Number(h.dias || 0), 0) + Number(p.dias || 0);
      if (janela.length && soma60 > 15) alerta = { forte: false, texto: `Nos últimos 60 dias, com este, são ${soma60} dias de atestado. Sem a CID não dá para conferir se é a mesma doença (regra dos 60 dias).` };
    }
    const resumo = hist.length
      ? `${hist.length} ${hist.length === 1 ? 'atestado anterior' : 'atestados anteriores'} nesta empresa, ${H.nDias(diasAno)} nos 12 meses antes deste.`
      : 'Primeiro atestado deste colaborador nesta empresa.';
    return { resumo, alerta };
  };

  window.HOMOLOG_LOGICA = H;

  /* ===================================================================
     REDE
     =================================================================== */
  const erroDe = (e, padrao) => H.limparErro(N.recado(e, padrao));

  // A RLS já entrega só o que a pessoa pode ver (homol_pode_ver): o
  // médico e a equipe, tudo. O filtro da aba vai no servidor para a fila
  // não baixar os milhares de processos já decididos a cada minuto.
  async function listar(aba, medico) {
    return N.tudo((de, ate) => {
      let q = N.sb.from('homol_processo').select(CAMPOS_LISTA);
      if (medico) q = aba === 'aberto' ? q.eq('atividade', H.AVALIA) : q.neq('atividade', H.AVALIA);
      else q = q.eq('situacao', aba === 'aberto' ? 'aberto' : 'finalizado');
      return q.order('abertura', { ascending: aba === 'aberto' }).order('id', { ascending: aba === 'aberto' }).range(de, ate);
    });
  }

  // A ficha inteira, como o obterProcesso() do site: o processo, o
  // histórico e os anexos, cada um da sua tabela.
  async function obter(id) {
    const [pr, ev, ax] = await Promise.all([
      N.sb.from('homol_processo').select(CAMPOS).eq('id', id).limit(1),
      N.sb.from('homol_evento').select('id,quando,quem_nome,oque,comentario').eq('processo_id', id).order('quando', { ascending: true }).order('id', { ascending: true }),
      N.sb.from('homol_anexo').select('id,nome,tipo,tamanho,caminho,quem_nome,quando,atividade').eq('processo_id', id).order('id', { ascending: true }),
    ]);
    if (pr.error) throw pr.error;
    if (!pr.data || !pr.data.length) return null;
    return { ...pr.data[0], eventos: ev.data || [], anexos: ax.data || [] };
  }

  // Os outros atestados da mesma pessoa, SEMPRE na mesma empresa (o CPF
  // não abre o que ela apresentou noutro emprego). Casa pelo CPF e cai na
  // matrícula, para o histórico de quem já estava lá não recomeçar do zero.
  async function historicoDoColaborador(p) {
    const cpf = H.soDigitos(p.cpf), chapa = String(p.chapa || '').trim();
    if (!p.empresa_cnpj || (!cpf && !chapa)) return [];
    const quem = [];
    if (cpf) quem.push(`cpf.eq.${cpf}`);
    if (chapa) quem.push(`chapa.eq."${chapa.replace(/["\\]/g, '\\$&')}"`);
    const { data, error } = await N.sb.from('homol_processo').select('id,inicio,fim,dias,cid,parecer')
      .eq('empresa_cnpj', p.empresa_cnpj).or(quem.join(',')).neq('id', p.id)
      .order('inicio', { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  }

  // O próximo da fila do médico: o mais antigo esperando, fora este.
  async function proximoDaFila(atual) {
    const { data, error } = await N.sb.from('homol_processo').select('id').eq('atividade', H.AVALIA).neq('id', atual)
      .order('abertura', { ascending: true }).order('id', { ascending: true }).limit(1);
    if (error) throw error;
    return data && data[0] ? data[0].id : null;
  }

  // O balde é PRIVADO: o link vale 5 minutos, como no site, e a política
  // homol_storage_ler só o dá a quem pode ver o processo (equipe inclusa).
  async function abrirAnexo(p, a) {
    try {
      const url = await N.urlAssinada(BALDE, a.caminho, 300);
      N.registrar('homologacao_atestado_aberto', `#${p.id} ${a.nome}`);
      await UI.abrirFora(url);
    } catch (e) { toast(erroDe(e, 'Não deu para abrir o arquivo.'), 'err'); }
  }

  /* ===================================================================
     TELA
     =================================================================== */
  const TETO_NA_TELA = 300;

  const tela = {
    titulo: 'Homologação',
    async desenhar(el) {
      const medico = H.ehMedico(eu());
      let aba = 'aberto', busca = '', vivo = true;
      const rotulos = medico ? { aberto: 'Para aprovar', finalizado: 'Já avaliados' } : { aberto: 'Em aberto', finalizado: 'Finalizados' };
      const desenharLista = async () => {
        if (!vivo) return;
        try {
          const todos = H.ordenar(await listar(aba, medico), aba);
          if (!vivo) return;
          if (medico && aba === 'aberto') APP.contagens.homologacao = todos.length;
          const lista = busca ? H.filtrar(todos, busca) : todos;
          const mostrados = lista.slice(0, TETO_NA_TELA);
          el.innerHTML = `<div class="tabs">${['aberto', 'finalizado'].map((a) => `<button class="tab ${aba === a ? 'on' : ''}" data-v="${a}">${rotulos[a]}</button>`).join('')}</div>
            <div class="busca">${ICONES.busca}<input id="hm-busca" placeholder="Procurar nome, CPF, empresa, CID, processo" value="${esc(busca)}"></div>
            ${lista.length ? `<div class="secao">${lista.length} ${lista.length === 1 ? 'processo' : 'processos'}${lista.length > mostrados.length ? `, mostrando os ${mostrados.length} primeiros. Procure para achar os outros.` : ''}</div>
            <div class="lista">${mostrados.map((p) => {
              const doc = H.documentos(p)[0];
              const semAnexo = Array.isArray(p.homol_anexo) && !p.homol_anexo.length;
              return `<button class="linha" type="button" data-id="${esc(p.id)}">
              <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(p.nome)}</span><span class="badge ${H.selo(p.atividade)}">${esc(p.atividade)}</span></div>
              <div class="linha__sub">${esc(p.empresa_nome)} · nº ${esc(p.id)}${doc ? ` · ${esc(doc[0])} ${esc(doc[1])}` : ''}</div>
              <div class="linha__sub">${esc(H.dataBr(p.inicio))} a ${esc(H.dataBr(p.fim))}, ${esc(H.nDias(p.dias))}${p.cid && p.cid.codigo ? ` · CID ${esc(p.cid.codigo)}` : ''} · enviado ${esc(UI.quando(p.abertura))}${semAnexo ? ' · <b style="color:var(--red)">sem anexo</b>' : ''}</div></div>${ICONES.seta}</button>`;
            }).join('')}</div>`
            : UI.vazio(busca ? 'Nada encontrado' : aba === 'aberto' ? (medico ? 'Nenhum atestado esperando parecer' : 'Nenhum processo em aberto') : 'Nenhum processo aqui', busca ? 'Tente outra palavra.' : '')}`;
          $$('.tab', el).forEach((b) => { b.onclick = () => { aba = b.dataset.v; desenharLista(); }; });
          const inp = $('#hm-busca', el);
          let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { busca = inp.value; const pos = inp.selectionStart; desenharLista().then(() => { const i2 = $('#hm-busca', el); if (i2) { i2.focus(); i2.setSelectionRange(pos, pos); } }); }, 350); };
          $$('.linha', el).forEach((b) => { b.onclick = () => detalhe(Number(b.dataset.id), desenharLista); });
        } catch (e) { if (vivo) el.innerHTML = `<div class="aviso erro">${esc(erroDe(e))}</div>`; }
      };
      await desenharLista();
      const relogio = setInterval(() => { if (!document.hidden && !busca) desenharLista(); }, 60000);
      tela._recarregar = desenharLista;
      return () => { vivo = false; clearInterval(relogio); tela._recarregar = null; };
    },
  };

  /* ------------------------------------------------------ a ficha */
  async function detalhe(id, depois) {
    let p;
    UI.carregando(true, 'Abrindo o processo…');
    try { p = await obter(id); } catch (e) { UI.carregando(false); return toast(erroDe(e), 'err'); }
    UI.carregando(false);
    if (!p) return toast('Este processo não existe ou você não tem acesso a ele.', 'err');

    const medico = H.ehMedico(eu());
    const docs = H.documentos(p);
    const campo = (rot, val, largo = false) => `<div${largo ? ' class="largo"' : ''}><dt>${esc(rot)}</dt><dd>${val ? esc(val) : '<span class="text-muted">não informado</span>'}</dd></div>`;
    const parecerDado = !!p.parecer_em;

    const f = UI.folha(`
      <div><span class="badge ${H.selo(p.atividade)}">${esc(p.atividade)}</span> <span class="badge b-gray">${p.situacao === 'finalizado' ? 'Finalizado' : 'Em aberto'}</span></div>
      <dl class="ficha mt12">
        ${campo('Empresa', p.empresa_nome, true)}
        ${campo('Colaborador', p.nome, true)}
        ${docs.length ? docs.map(([r, v]) => campo(r, v)).join('') : campo('CPF', '')}
        ${campo('Filial', p.filial)}
        ${campo('Afastamento', `${H.dataBr(p.inicio)} às ${H.hora(p.hora_inicio)} até ${H.dataBr(p.fim)}`, true)}
        ${campo('Dias', H.nDias(p.dias))}
        ${campo('CID', H.textoCid(p.cid) || 'sem CID')}
        ${campo('Tipo de atestado', p.tipo && p.tipo.nome, true)}
        ${campo('Médico que assinou', H.textoPessoa(p.medico), true)}
        ${campo('Entidade', p.entidade && p.entidade.nome, true)}
        ${campo('Responsável pelo abono', H.textoPessoa(p.responsavel), true)}
        ${campo('Enviado em', `${H.dataHoraBr(p.abertura)}${p.requisitante ? `, por ${p.requisitante}` : ''}`, true)}
        ${p.observacoes ? `<div class="largo"><dt>Observação da empresa</dt><dd style="white-space:pre-wrap">${esc(p.observacoes)}</dd></div>` : ''}
      </dl>

      <div class="secao mt16">Parecer</div>
      <div class="mt12"><span class="badge ${p.parecer === 'Aprovado' ? 'b-ok' : p.parecer === 'Reprovado' ? 'b-err' : 'b-4'}">${esc(p.parecer)}</span>
        ${parecerDado ? `<span class="pequeno text-muted">${esc(p.parecer_por || '')}${p.parecer_por ? ', ' : ''}${esc(H.dataHoraBr(p.parecer_em))}</span>` : '<span class="pequeno text-muted">ainda sem parecer do médico</span>'}</div>
      ${p.parecer_obs ? `<p class="mt12" style="white-space:pre-wrap;line-height:1.5"><b>Motivo:</b> ${esc(p.parecer_obs)}</p>` : ''}

      <div class="secao mt16">Anexos (${p.anexos.length})</div>
      ${p.anexos.length ? `<div class="lista mt12">${p.anexos.map((a, i) => `<button class="linha" type="button" data-ax="${i}">
        <span class="modulo__icone">${ICONES.anexo}</span>
        <div class="linha__corpo"><div class="linha__titulo"><span class="t">${esc(a.nome)}</span></div>
        <div class="linha__sub">${esc(L.tamanhoLegivel(a.tamanho))} · ${esc(a.quem_nome || '')}${a.quem_nome ? ', ' : ''}${esc(H.dataHoraBr(a.quando))}</div></div>${ICONES.seta}</button>`).join('')}</div>`
        : `<div class="aviso atencao mt12">A empresa não anexou o arquivo do atestado.${medico ? ' Marque Pendente e escolha o motivo "O arquivo enviado não é o atestado" ou peça o documento.' : ''}</div>`}

      <div class="secao mt16">Histórico do paciente</div>
      <div id="hm-hist" class="mt12 pequeno text-muted">Carregando…</div>

      ${medico ? `<div class="secao mt16">Dar o parecer</div>
      <div class="vistos mt12" id="hm-decisao">${H.DECISOES.map(([v, r]) => `<button type="button" class="chip ${v === 'Reprovado' ? 'vermelho' : ''}" data-par="${v}">${r}</button>`).join('')}</div>
      <p class="pequeno text-muted mt12" id="hm-dica">Escolha a decisão. Em Pendente e Reprovar aparecem os motivos para marcar.</p>
      <div id="hm-motivos"></div>
      <div class="fg mt12" id="hm-obs-caixa" hidden><label for="hm-obs">Observação (opcional)</label><textarea id="hm-obs" rows="3" maxlength="2000"></textarea></div>
      <div class="acoes mt16">
        <button class="btn btn-ok" id="hm-salvar" type="button">Salvar parecer</button>
        <button class="btn btn-ghost" id="hm-proximo" type="button">Salvar e abrir o próximo</button>
      </div>` : `<div class="aviso info mt16">O parecer é do médico da clínica (categoria Diretor médico). Aqui a equipe acompanha.</div>`}

      <div class="secao mt16">Histórico do processo</div>
      <div class="lista mt12">${p.eventos.length ? p.eventos.map((e) => `<div class="linha" style="cursor:default"><div class="linha__corpo">
        <div class="linha__sub">${esc(H.dataHoraBr(e.quando))}${e.quem_nome ? ` · ${esc(e.quem_nome)}` : ''}${e.comentario ? ' · <b>recado</b>' : ''}</div>
        <div style="white-space:pre-wrap;line-height:1.45">${esc(e.oque)}</div></div></div>`).join('') : UI.vazio('Sem movimentações')}</div>
    `, { titulo: `Processo ${p.id}` });

    $$('[data-ax]', f.caixa).forEach((b) => { b.onclick = () => abrirAnexo(p, p.anexos[Number(b.dataset.ax)]); });

    // O histórico do paciente vem depois, para a ficha abrir na hora.
    historicoDoColaborador(p).then((hist) => {
      const alvo = $('#hm-hist', f.caixa);
      if (!alvo) return;
      const r = H.regra60(p, hist);
      alvo.className = 'mt12';
      alvo.innerHTML = `<p class="pequeno">${esc(r.resumo)}</p>
        ${r.alerta ? `<div class="aviso ${r.alerta.forte ? 'erro' : 'atencao'} mt12">${esc(r.alerta.texto)}</div>` : ''}
        ${hist.length ? `<div class="lista mt12">${hist.map((h) => `<button class="linha" type="button" data-hist="${esc(h.id)}"><div class="linha__corpo">
          <div class="linha__titulo"><span class="t">${esc(H.dataBr(h.inicio))} a ${esc(H.dataBr(h.fim))}, ${esc(H.nDias(h.dias))}</span><span class="badge ${h.parecer === 'Aprovado' ? 'b-ok' : h.parecer === 'Reprovado' ? 'b-err' : 'b-4'}">${esc(h.parecer)}</span></div>
          <div class="linha__sub">${esc(H.textoCid(h.cid) || 'sem CID')}</div></div>${ICONES.seta}</button>`).join('')}</div>` : ''}`;
      $$('[data-hist]', alvo).forEach((b) => { b.onclick = () => { f.fechar(); detalhe(Number(b.dataset.hist), depois); }; });
    }, (e) => { const alvo = $('#hm-hist', f.caixa); if (alvo) alvo.textContent = erroDe(e, 'Não deu para ler o histórico do colaborador.'); });

    if (medico) montarParecer(p, f, depois);
  }

  /* ---------------------------------------------- o parecer do médico */
  function montarParecer(p, f, depois) {
    const ini = H.separarParecer(p.parecer_obs);
    let par = '', marcados = ini.motivos;
    const obs = $('#hm-obs', f.caixa);
    obs.value = ini.livre;

    const marcar = (novo) => {
      par = novo;
      marcados = H.motivosDaDecisao(par, marcados);
      $$('#hm-decisao [data-par]', f.caixa).forEach((b) => b.classList.toggle('on', b.dataset.par === par));
      $('#hm-dica', f.caixa).hidden = !!par;
      // O balão só existe em Pendente e Reprovar: é quando a empresa
      // precisa de explicação. Vazio, sem texto de exemplo.
      $('#hm-obs-caixa', f.caixa).hidden = !(par === 'Pendente' || par === 'Reprovado');
      const lista = H.MOTIVOS[par] || [];
      const caixa = $('#hm-motivos', f.caixa);
      caixa.innerHTML = lista.length ? `<p class="pequeno text-muted mt12">${par === 'Pendente' ? 'O que a empresa precisa corrigir ou enviar:' : 'Por que o atestado foi reprovado:'}</p>
        <div class="vistos mt12">${lista.map((m, i) => `<button type="button" class="chip ${marcados.includes(m) ? 'on' : ''}" data-m="${i}" style="white-space:normal;text-align:left;border-radius:14px">${esc(m)}</button>`).join('')}</div>` : '';
      $$('[data-m]', caixa).forEach((b) => { b.onclick = () => {
        const m = lista[Number(b.dataset.m)], i = marcados.indexOf(m);
        if (i >= 0) marcados.splice(i, 1); else marcados.push(m);
        b.classList.toggle('on', i < 0);
      }; });
    };
    $$('#hm-decisao [data-par]', f.caixa).forEach((b) => { b.onclick = () => marcar(b.dataset.par); });
    marcar(H.decisaoInicial(p));

    // O parecer se revê (o médico pode mudar de ideia, e o banco deixa):
    // por isso não há "tem certeza?" aqui.
    const salvar = async (abrirProximo) => {
      const livre = par === 'Pendente' || par === 'Reprovado' ? obs.value : '';
      const falta = H.conferirParecer(p, par, marcados, livre);
      if (falta.length) {
        const noSite = par === 'Aprovado' ? ' Corrija esses dados no site da homologação: o celular não os altera.' : '';
        return toast(`Falta: ${falta.join(', ')}.${noSite}`, 'err', 5000);
      }
      const botoes = [$('#hm-salvar', f.caixa), $('#hm-proximo', f.caixa)];
      botoes.forEach((b) => { b.disabled = true; });
      try {
        const novo = await N.mudar('homol_processo', { id: p.id }, H.corpoDoParecer(p, par, marcados, livre));
        N.registrar('homologacao_parecer', `#${p.id} ${novo.parecer}${novo.parecer_obs ? `: ${novo.parecer_obs}` : ''}`);
        toast(`Parecer salvo: ${novo.parecer}. O processo agora está "${novo.atividade}", e a empresa já vê.`, 'ok', 4000);
        f.fechar();
        if (depois) depois();
        if (abrirProximo) {
          const prox = await proximoDaFila(p.id).catch(() => null);
          if (prox) detalhe(prox, depois);
          else toast('Não há mais atestados esperando parecer.', 'ok');
        }
      } catch (e) {
        botoes.forEach((b) => { b.disabled = false; });
        toast(erroDe(e, 'O servidor não aceitou o parecer.'), 'err', 5000);
      }
    };
    $('#hm-salvar', f.caixa).onclick = () => salvar(false);
    $('#hm-proximo', f.caixa).onclick = () => salvar(true);
  }

  /* ------------------------------------------------------ contador */
  // O número é a fila do médico: o que espera por ele. A equipe não tem
  // o que fazer num processo (o banco não a deixa mexer), então não conta.
  async function contar() {
    if (!H.ehMedico(eu())) return null;
    const { count, error } = await N.sb.from('homol_processo').select('id', { count: 'exact', head: true }).eq('atividade', H.AVALIA);
    if (error) throw error;
    return count || 0;
  }

  MODULOS.homologacao = {
    chave: 'homologacao', nome: 'Homologação', sub: 'Atestados das empresas e o parecer do médico', icone: ICONE_HOMOLOGACAO,
    // O médico entra mesmo sem o módulo marcado: quem o deixa ver tudo e
    // dar o parecer é a categoria (homol_eh_medico), e não o visto.
    precisa: (u) => L.temModulo(u, 'homologacao') || H.ehMedico(u),
    abrir: (comoAba) => comoAba ? UI.raiz(tela, 'homologacao') : UI.ir(tela),
    contar,
  };
})();
