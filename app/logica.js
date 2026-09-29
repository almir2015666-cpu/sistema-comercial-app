/* =====================================================================
   CMH Sistema — regras puras.

   Nada aqui toca o DOM nem a rede. Sao as MESMAS regras do programa do
   computador (SistemaCMH, em Python), reescritas em JavaScript, para que
   os dois clientes concordem na tela: situacao da Conferencia, ordem da
   fila de chamados, de quem e a tarefa, ranking do Diario, o login que
   vira e-mail. Quem decide de verdade e o banco (RLS e gatilhos); isto
   aqui existe para a tela nao mentir antes de o servidor responder.

   Testado em tests/logica.test.mjs. Ao mudar uma regra aqui, mude o teste
   — e confira o app.py, porque a regra tem de continuar igual la.
   ===================================================================== */
(function (raiz) {
  'use strict';
  const L = {};

  /* ------------------------------------------------------------ texto */

  L.semAcento = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');

  // app.py normalizar(): sem acento, tudo que nao e letra/digito vira espaco,
  // espacos colapsados, maiusculas.
  L.normalizar = (s) =>
    L.semAcento(s).replace(/[^0-9A-Za-z]+/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();

  // O login que o Supabase conhece: "José Carlos" -> "josecarlos".
  L.loginDe = (usuario) => L.normalizar(usuario).toLowerCase().replace(/ /g, '');
  L.emailDe = (usuario, dominio) => `${L.loginDe(usuario)}@${dominio}`;

  L.iniciais = (nome) =>
    String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p[0]).join('').toUpperCase();

  L.primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

  L.achatar = (t) => String(t ?? '').split(/\s+/).join(' ').trim();

  L.tamanhoLegivel = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  };

  L.dinheiro = (v) =>
    (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // A MESMA REGRA DO dinheiro.py DO COMPUTADOR:
  //   "1.234,56" -> 1234.56 ; "1.500" -> 1500 (ponto de milhar) ;
  //   "1234.56" -> 1234.56 ; "0.750" -> 0.75 (zero na frente: decimal) ;
  //   lixo -> 0.
  // Antes, "1.500" virava 1,5: o ponto sozinho era sempre decimal, e mil e
  // quinhentos reais digitados no celular entravam como um real e meio.
  L.lerDinheiro = (texto) => {
    let s = String(texto ?? '').trim().replace(/[R$\s ]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };

  /* ------------------------------------------------------------ datas */

  const dois = (n) => String(n).padStart(2, '0');

  L.isoDe = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  L.hojeISO = () => L.isoDe(new Date());

  // Data ISO (so dia) -> Date local ao meio-dia, para nao virar o dia por fuso.
  L.diaDe = (iso) => {
    if (!iso) return null;
    const s = String(iso).slice(0, 10);
    const [a, m, d] = s.split('-').map(Number);
    if (!a || !m || !d) return null;
    return new Date(a, m - 1, d, 12, 0, 0);
  };

  L.dataBr = (iso) => {
    const d = L.diaDe(iso);
    return d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '';
  };

  L.dataHoraBr = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  };

  L.horaBr = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  };

  // Dias inteiros entre duas datas ISO (so dia). Positivo = "ate" e depois.
  L.diasEntre = (deISO, ateISO) => {
    const a = L.diaDe(deISO), b = L.diaDe(ateISO);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  };

  L.somarDias = (iso, n) => {
    const d = L.diaDe(iso);
    d.setDate(d.getDate() + n);
    return L.isoDe(d);
  };

  // "5/8", "05/08/26", "05/08/2026", "2026-08-05" -> "2026-08-05" ; senao null
  L.lerData = (texto, hoje = new Date()) => {
    const s = String(texto ?? '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!m) return null;
    let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
    if (m[3] && m[3].length === 2) ano += 2000;
    return valida(ano, +m[2], +m[1]);
    function valida(a, mes, dia) {
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      const d = new Date(a, mes - 1, dia);
      if (d.getMonth() !== mes - 1) return null;
      return L.isoDe(d);
    }
  };

  // Data/hora local -> ISO COM deslocamento. Sem o fuso o servidor le como
  // UTC e a reuniao das 14h30 vira 11h30.
  L.paraServidor = (d) => {
    const off = -d.getTimezoneOffset();
    const sinal = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T` +
      `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}` +
      `${sinal}${dois(Math.floor(abs / 60))}:${dois(abs % 60)}`;
  };

  /* --------------------------------------------------- pessoa e setores */

  // "Comercial, SESMT" -> ["Comercial", "SESMT"]
  L.setoresDe = (u) => String(u?.setor || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  // Como orc_meus_setores(): minusculas, aparado, item a item.
  L.meusSetores = (u) => L.setoresDe(u).map((s) => s.toLowerCase());
  L.eDoSetor = (u, nome) => L.meusSetores(u).includes(String(nome ?? '').trim().toLowerCase());

  L.eDoTi = (u) => L.setoresDe(u).some((s) =>
    ['ti', 'informatica', 'tecnologiadainformacao'].includes(L.semAcento(s).toLowerCase().replace(/[^a-z]/g, '')));
  L.veAFila = (u) => !!u?.admin || L.eDoTi(u);

  L.temModulo = (u, chave) => !!u?.admin || (Array.isArray(u?.modulos) ? u.modulos : []).includes(chave);

  // Os quatro lados da Conferencia. Admin tem todos; sem setor, nenhum.
  L.ladosDe = (u) => {
    if (u?.admin) return { comercial: true, sesmt: true, faturamento: true, seguranca: true };
    const s = L.setoresDe(u).map((x) => L.semAcento(x).toUpperCase());
    return {
      comercial: s.includes('COMERCIAL'),
      sesmt: s.includes('SESMT'),
      faturamento: s.includes('FATURAMENTO'),
      seguranca: s.includes('SEGURANCA'),
    };
  };

  L.SETORES = ['Administrativo', 'Assistencial', 'Comercial', 'Contabilidade', 'Direção',
    'Faturamento', 'Financeiro', 'Recepção', 'Segurança', 'SESMT', 'T.I.'];

  // "Diretor médico" é o cargo que o servidor procura (homol_eh_medico)
  // para dar o parecer na Homologação: escrito igual ao do computador.
  L.CARGOS = ['Assistente administrativo', 'Auxiliar administrativo', 'Auxiliar de enfermagem',
    'Auxiliar de serviços gerais', 'CEO', 'Consultor comercial', 'Contabilidade',
    'Coordenador administrativo',
    'Coordenador assistencial', 'Coordenador comercial', 'Coordenador de enfermagem',
    'Coordenador do SESMT', 'Diretor', 'Diretor médico', 'Diretor técnico', 'Encarregado de dados (DPO)',
    'Enfermeiro', 'Enfermeiro responsável técnico', 'Estagiário', 'Faturamento',
    'Gerente administrativo', 'Gerente assistencial', 'Gerente comercial', 'Gerente da unidade',
    'Médico coordenador do PCMSO', 'Médico examinador', 'Motorista', 'Recepcionista',
    'Responsável técnico', 'Sócio administrador', 'Técnico de enfermagem',
    'Técnico de laboratório', 'Técnico de segurança do trabalho'];

  // Chaves que podem ir em orc_usuarios.modulos — mesma lista do app.py.
  L.MODULOS = [
    ['orcamentos', 'Orçamentos'], ['documentos', 'Documentos'], ['agenda', 'Agenda dos médicos'],
    ['agendamento', 'Agendamento'], ['prospeccao', 'Prospecção'], ['pgr', 'PGR'], ['pcmso', 'PCMSO'],
    ['treinamento', 'Treinamentos'], ['homologacao', 'Homologação'], ['pop', 'POP'],
    ['chat', 'Chat'], ['financeiro', 'Financeiro'],
    ['receber', 'Contas a receber'], ['compromissos', 'Compromissos'], ['diario', 'Diário de Bordo'],
    ['chamados', 'Chamados T.I.'], ['almoxarifado', 'Almoxarifado'],
  ];
  // Como no computador: o que abre pelo Menu (Tarefas e Solicitar material)
  // fica no bloco dos botões, e não entre os módulos. `admin` só o
  // administrador tem; `tema` é de todos.
  L.BOTOES = [['relatorios', 'Relatórios'], ['empresas', 'Empresas'], ['conferencia', 'Conferência'],
    ['tarefas', 'Tarefas'], ['pedir_material', 'Solicitar material']];
  L.DENTRO = [
    ['orcamentos:configuracoes', 'orcamentos', 'Configurações'],
    ['homologacao:contratos', 'homologacao', 'Contratos assinados'],
    ['homologacao:gerar', 'homologacao', 'Gerar login'],
    ['homologacao:acessos', 'homologacao', 'Acessos criados'],
    ['homologacao:senha', 'homologacao', 'Senha'],
    ['homologacao:editar', 'homologacao', 'Editar e desligar'],
    ['homologacao:colaboradores', 'homologacao', 'Colaboradores'],
    ['financeiro:ver', 'financeiro', 'Ver (somente leitura)'],
    ['financeiro:lancar', 'financeiro', 'Lançar contas'],
    ['financeiro:baixar', 'financeiro', 'Dar baixa'],
    ['financeiro:cadastros', 'financeiro', 'Cadastros'],
    ['financeiro:apagar', 'financeiro', 'Apagar'],
    ['almoxarifado:atender', 'almoxarifado', 'Entregar pedidos'],
    ['almoxarifado:movimentar', 'almoxarifado', 'Movimentar o estoque'],
    ['almoxarifado:catalogo', 'almoxarifado', 'Cadastrar itens'],
  ];

  // TODAS AS CHAVES QUE ESTE APP SABE DESENHAR NO CADASTRO. Qualquer outra
  // que já esteja gravada (de uma versão nova do computador, por exemplo)
  // é PRESERVADA ao salvar: ver L.juntarModulos.
  L.CHAVES_CONHECIDAS = () => [...L.MODULOS, ...L.BOTOES].map(([k]) => k)
    .concat(L.DENTRO.map(([k]) => k));

  // O que se grava em orc_usuarios.modulos ao salvar o cadastro pelo app.
  //
  // O APP APAGAVA PERMISSÃO. Ele gravava só os vistos que desenhava, e a
  // chave que ele não conhecia (almoxarifado, homologação, financeiro:...)
  // sumia do cadastro sem ninguém ter tirado. Agora: o que o app desenha,
  // vale o que está marcado; o que ele não desenha, fica como estava.
  L.juntarModulos = (gravados, marcados) => {
    const conhecidas = new Set(L.CHAVES_CONHECIDAS());
    const mantidos = (gravados || []).filter((k) => !conhecidas.has(k));
    return [...new Set([...mantidos, ...(marcados || [])])];
  };

  // O que este app sabe abrir. A chave e a mesma do cadastro.
  L.NO_CELULAR = ['chat', 'tarefas', 'compromissos', 'chamados', 'conferencia', 'diario',
    'almoxarifado', 'pedir_material', 'homologacao', 'financeiro', 'receber'];

  /* ------------------------------------------------------------- chat */

  L.chavePessoa = (id) => `p:${id}`;
  L.chaveSetor = (nome) => `s:${nome}`;
  L.eSetor = (chave) => String(chave).startsWith('s:');
  L.alvoDaChave = (chave) => String(chave).slice(2);

  L.LIMITE_TEXTO = 2000;
  L.LIMITE_ARQUIVO = 25 * 1024 * 1024;
  L.EMOJIS = ['👍', '❤', '😂', '😮', '😢', '🙏'];
  L.APAGADA = '🚫 mensagem apagada';
  L.MINUTOS_DE_PRESENCA = 5;

  L.limparTexto = (t) => String(t ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, L.LIMITE_TEXTO);

  L.nomeSeguro = (nome) => {
    const base = String(nome || '').split(/[\\/]/).pop();
    const s = L.semAcento(base).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 80);
    return s || 'arquivo';
  };
  L.caminhoAnexo = (uid, nomeOriginal, hex12) => `${uid}/${hex12}-${L.nomeSeguro(nomeOriginal)}`;
  L.eImagem = (nome) => /\.(png|jpe?g|gif|bmp)$/i.test(String(nome || ''));

  L.estaAgora = (ultimoAcesso, agora = Date.now()) => {
    if (!ultimoAcesso) return false;
    const t = new Date(ultimoAcesso).getTime();
    return Number.isFinite(t) && t >= agora - L.MINUTOS_DE_PRESENCA * 60000;
  };

  // A chave da conversa de uma linha do chat, do ponto de vista de "eu".
  L.chaveDaLinha = (m, eu) => m.setor ? L.chaveSetor(m.setor) : L.chavePessoa(m.de === eu ? m.para : m.de);

  // Da caixa de entrada (id,de,para,setor) para {chave: nao lidas}.
  L.contarNaoLidas = (linhas, eu, marcas) => {
    const n = {};
    for (const m of linhas) {
      if (m.de === eu) continue;
      const chave = L.chaveDaLinha(m, eu);
      if (m.id > (marcas[chave] || 0)) n[chave] = (n[chave] || 0) + 1;
    }
    return n;
  };

  // Conversas em que a ultima palavra e do outro e ainda nao foi lida.
  L.salasAResponder = (linhas, eu, marcas) => {
    const ultima = {};
    for (const m of linhas) {
      const chave = L.chaveDaLinha(m, eu);
      if (!ultima[chave] || m.id > ultima[chave].id) ultima[chave] = m;
    }
    return Object.entries(ultima)
      .filter(([chave, m]) => m.de !== eu && m.id > (marcas[chave] || 0))
      .sort((a, b) => a[1].id - b[1].id)
      .map(([chave]) => chave);
  };

  // Salas de setor: as da casa + as do cadastro de cada pessoa (por virgula).
  // Quem nao e admin so ve as suas.
  L.salasDeSetor = (pessoas, eu) => {
    const nomes = new Map();
    for (const s of L.SETORES) nomes.set(s.toLowerCase(), s);
    for (const p of [...pessoas, eu]) for (const s of L.setoresDe(p)) if (!nomes.has(s.toLowerCase())) nomes.set(s.toLowerCase(), s);
    let lista = [...nomes.values()];
    if (!eu?.admin) { const meus = L.meusSetores(eu); lista = lista.filter((s) => meus.includes(s.toLowerCase())); }
    return lista.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };

  // (fixa, pendencia, offline, nome) — como a tela do computador.
  L.ordenarConversas = (itens) => itens.slice().sort((a, b) =>
    (b.fixa ? 1 : 0) - (a.fixa ? 1 : 0) ||
    a.pendencia - b.pendencia ||
    (a.online ? 0 : 1) - (b.online ? 0 : 1) ||
    a.nome.localeCompare(b.nome, 'pt-BR'));

  /* ----------------------------------------------------------- tarefas */

  L.T = { ABERTA: 'aberta', CONCLUIDA: 'concluida', CANCELADA: 'cancelada' };
  L.ROTULO_TAREFA = { aberta: 'Aberta', concluida: 'Concluída', cancelada: 'Cancelada' };
  L.LIMITE_ITENS = 30;

  L.estadoDoPrazo = (t, hoje = L.hojeISO()) => {
    if (t.situacao !== L.T.ABERTA) return 'feita';
    if (!t.prazo) return 'sem_prazo';
    const dias = L.diasEntre(hoje, t.prazo);
    if (dias < 0) return 'atrasada';
    if (dias === 0) return 'hoje';
    if (dias <= (Number(t.lembrar_dias) || 0)) return 'perto';
    return 'longe';
  };

  // Tarefa que EU criei para OUTRA pessoa nao e minha: o alarme toca para ela.
  L.eMinha = (t, u) => {
    if (t.para) return t.para === u.id;
    if (t.setor) return L.eDoSetor(u, t.setor);
    return t.de === u.id;
  };

  L.ordenarTarefas = (lista, hoje = L.hojeISO()) => lista.slice().sort((a, b) => {
    const fa = a.situacao === L.T.ABERTA ? 0 : 1, fb = b.situacao === L.T.ABERTA ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (fa === 0) {
      const da = a.prazo ? L.diasEntre(hoje, a.prazo) : Infinity;
      const db = b.prazo ? L.diasEntre(hoje, b.prazo) : Infinity;
      return da - db || a.id - b.id;
    }
    return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
  });

  L.normalizarItens = (itens) => (Array.isArray(itens) ? itens : [])
    .map((i) => typeof i === 'string' ? { texto: i, feito: false } : { texto: String(i?.texto ?? ''), feito: !!i?.feito })
    .map((i) => ({ texto: L.achatar(i.texto).slice(0, 200), feito: i.feito }))
    .filter((i) => i.texto)
    .slice(0, L.LIMITE_ITENS);

  L.nivelDeAlerta = (tarefas, u, hoje) => {
    let nivel = 0;
    for (const t of tarefas) {
      if (t.situacao !== L.T.ABERTA || !L.eMinha(t, u)) continue;
      const e = L.estadoDoPrazo(t, hoje);
      nivel = Math.max(nivel, e === 'atrasada' ? 3 : e === 'hoje' ? 2 : e === 'perto' ? 1 : 0);
    }
    return nivel;
  };

  /* ------------------------------------------------------ compromissos */

  L.TIPOS_COMPROMISSO = ['Reunião', 'Visita a cliente', 'Cobrança', 'Consulta', 'Treinamento', 'Outro'];
  L.VOU = 'vou'; L.NAO_VOU = 'nao_vou';

  L.eMeu = (c, u) => c.de === u.id || (c.participantes || []).includes(u.id) || (!!c.setor && L.eDoSetor(u, c.setor));

  L.estadoDoCompromisso = (c, agora = new Date()) => {
    const ini = new Date(c.quando), fim = new Date(ini.getTime() + (Number(c.minutos) || 60) * 60000);
    if (fim <= agora) return 'passou';
    if (ini <= agora) return 'agora';
    if (L.isoDe(ini) === L.isoDe(agora)) return 'hoje';
    return L.diasEntre(L.isoDe(agora), L.isoDe(ini)) <= 7 ? 'perto' : 'longe';
  };

  L.osDeHoje = (lista, u, agora = new Date()) => lista.filter((c) =>
    c.situacao === 'marcado' && L.eMeu(c, u) && ['agora', 'hoje'].includes(L.estadoDoCompromisso(c, agora)));

  /* ---------------------------------------------------------- chamados */

  L.TIPOS_CHAMADO = ['Computador não liga ou travou', 'Internet ou rede caiu', 'Impressora ou scanner',
    'SistemaCMH (este programa)', 'E-mail', 'Telefone ou ramal', 'Acesso, senha ou usuário',
    'Equipamento novo ou troca', 'Outro'];
  L.ROTULO_CHAMADO = { aberto: 'Na fila', atendendo: 'Em atendimento', pendente: 'Pendente', resolvido: 'Resolvido', cancelado: 'Cancelado' };
  L.VIVAS = ['aberto', 'atendendo', 'pendente'];

  // Tira o que nao e digito, o 55 da frente, e formata. Menos de 8 -> "".
  L.telefone = (texto) => {
    let d = String(texto ?? '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return '';
  };

  // Abertos por chegada (e numerados), depois atendendo, pendentes, fechados.
  L.ordenarChamados = (lista) => {
    const g = { aberto: [], atendendo: [], pendente: [], fechado: [] };
    for (const c of lista) (g[c.situacao] || g.fechado).push(c);
    const por = (campo, desc) => (a, b) => desc
      ? String(b[campo] || '').localeCompare(String(a[campo] || ''))
      : String(a[campo] || '').localeCompare(String(b[campo] || ''));
    g.aberto.sort(por('criado_em'));
    g.aberto.forEach((c, i) => { c._fila = i + 1; });
    g.atendendo.sort(por('atendendo_desde'));
    g.pendente.sort(por('pendente_desde'));
    g.fechado.sort(por('atualizado_em', true));
    return [...g.aberto, ...g.atendendo, ...g.pendente, ...g.fechado];
  };

  // Palavra a palavra, com E, sem acento nem caixa, em varios campos.
  L.filtrarChamados = (lista, termo) => {
    const palavras = L.semAcento(termo).toLowerCase().split(/\s+/).filter(Boolean);
    if (!palavras.length) return lista;
    return lista.filter((c) => {
      const texto = L.semAcento(['tipo', 'descricao', 'resposta', 'de_nome', 'de_setor', 'maquina', 'atendente_nome', 'pendencia', 'telefone']
        .map((k) => c[k] || '').join(' ')).toLowerCase();
      return palavras.every((p) => texto.includes(p));
    });
  };

  /* ------------------------------------------------------- conferencia */

  L.C = { ATRASADO: 'atrasado', PERTO: 'vence logo', ANDAMENTO: 'em andamento', REVISAO: 'em revisão',
    LIBERADO: 'liberado', DESCONHECIDA: 'sem informação' };
  L.TOLERANCIA = 5;
  L.DIAS_PERTO = 3;
  L.CORES = {
    'atrasado': ['#fdecec', '#a8302f'], 'vence logo': ['#fff6e3', '#8a6d00'],
    'em andamento': ['#eef7fb', '#1a6c99'], 'em revisão': ['#eef4ff', '#28457e'],
    'liberado': ['#eef8f2', '#1e7a45'], 'sem informação': ['#f7f7f7', '#7a7a7a'],
  };
  L.SITUACOES_SESMT = ['', 'EM ANDAMENTO', 'REVISAO', 'LIBERADO'];
  L.SITUACOES_COMERCIAL = ['', 'PENDENTE', 'CONCLUÍDO', 'CANCELADO'];
  L.FORMAS_PAGAMENTO = ['', 'BOLETO', 'PIX', 'CARTÃO DE CRÉDITO', 'CARTÃO DE DÉBITO', 'DINHEIRO',
    'TRANSFERÊNCIA', 'FATURADO', 'CORTESIA', 'A COMBINAR', 'COORDENAÇÃO'];

  L.CAMPOS_COMERCIAL = ['cod', 'empresa', 'lotacao', 'servico', 'os', 'protocolo_em', 'prazo_em', 'valor',
    'forma_pagamento', 'pago_em', 'resp_protocolo', 'enviado_em', 'situacao', 'observacao'];
  L.CAMPOS_SESMT = ['situacao_sesmt', 'liberado_em', 'liberado_por', 'resp_documento'];
  L.CAMPOS_FATURAMENTO = ['faturado_em', 'faturado_por', 'nf_arquivo', 'nf_numero', 'boleto_arquivo', 'boleto_linha'];
  L.CAMPOS_PGR = ['pgr_liberado_em', 'pgr_liberado_por'];
  L.CAMPOS_BUSCA = ['empresa', 'os', 'cod', 'lotacao', 'servico', 'observacao', 'resp_protocolo',
    'resp_documento', 'liberado_por', 'faturado_por', 'pgr_liberado_por', 'forma_pagamento'];

  const entregue = (l) => !!(l.enviado_em || l.liberado_em || l.situacao_sesmt === 'LIBERADO');

  L.situacaoDe = (l) => {
    if (entregue(l)) return L.C.LIBERADO;
    if (l.situacao_sesmt === 'EM ANDAMENTO') return L.C.ANDAMENTO;
    if (l.situacao_sesmt === 'REVISAO') return L.C.REVISAO;
    return L.C.DESCONHECIDA;
  };

  L.atrasoDe = (l, hoje = L.hojeISO()) => {
    if (entregue(l) || !l.prazo_em) return '';
    const dias = L.diasEntre(hoje, l.prazo_em); // negativo = passou
    if (dias < -L.TOLERANCIA) return L.C.ATRASADO;
    if (dias >= 0 && dias <= L.DIAS_PERTO) return L.C.PERTO;
    return '';
  };

  L.diasDePrazo = (l, hoje = L.hojeISO()) => l.prazo_em ? L.diasEntre(hoje, l.prazo_em) : null;

  L.resumo = (linhas, hoje) => {
    const r = {};
    for (const l of linhas) {
      const e = L.situacaoDe(l); r[e] = (r[e] || 0) + 1;
      const a = L.atrasoDe(l, hoje); if (a) r[a] = (r[a] || 0) + 1;
    }
    return r;
  };
  L.total = (linhas) => linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);

  // A FORMA PELA PALAVRA QUE APARECE NO MEIO DA FRASE, na mesma ordem e com
  // as mesmas escritas do computador (conferencia_nucleo.FORMA_PELA_PALAVRA).
  // Antes o app olhava só a primeira palavra do nome da forma: "A COMBINAR"
  // virava a letra "A" e casava com quase tudo, e "BOLEOT 05 DIAS" (escrito
  // assim na planilha) deixava de ser boleto.
  const FORMA_PELA_PALAVRA = [
    ['BOLETO', ['BOLETO', 'BOLET', 'BOLEOT']],
    ['PIX', ['PIX']],
    ['CARTÃO DE CRÉDITO', ['CARTAO', 'CREDITO', 'CRED']],
    ['DINHEIRO', ['DINHEIRO', 'DINH', 'ESPECIE']],
    ['TRANSFERÊNCIA', ['TRANSFER', 'DEPOSITO']],
    ['FATURADO', ['FATURA', 'FATUR', 'FAT']],
    ['CORTESIA', ['CORTESIA', 'SEM CUSTO', 'GRATUITO', 'GRATIS']],
    ['COORDENAÇÃO', ['COORDENA', 'COODERNA']],
    ['A COMBINAR', ['COMBINAR', 'CONFIRMAR', 'DEFINIR', 'AGUARD', 'A PAGAR']],
  ];
  L.chaveDoPagamento = (forma) => {
    const limpo = ` ${L.semAcento(forma).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ')} `;
    if (!limpo.trim()) return '';
    for (const [rotulo, palavras] of FORMA_PELA_PALAVRA) {
      if (palavras.some((p) => limpo.includes(p))) return rotulo;
    }
    return 'OUTRO';
  };
  L.eACobrarPorNota = (l) => ['BOLETO', 'FATURADO'].includes(L.chaveDoPagamento(l.forma_pagamento));

  const MARCAS_CORTESIA = ['CORTESIA', 'SEM CUSTO', 'SEM CUSTOS', 'GRATUITO', 'GRATIS', 'BRINDE'];
  const MARCAS_COORD = ['COORDENA', 'COODERNA'];
  const marcaEm = (l, marcas) => {
    const t = L.semAcento(`${l.forma_pagamento || ''} ${l.observacao || ''}`).toUpperCase();
    return marcas.some((m) => t.includes(m));
  };
  L.eCortesia = (l) => marcaEm(l, MARCAS_CORTESIA);
  L.eCoordenacao = (l) => marcaEm(l, MARCAS_COORD);
  L.semCobranca = (l) => L.eCortesia(l) ? 'CORTESIA' : L.eCoordenacao(l) ? 'COORDENAÇÃO' : '';

  // Palavra a palavra: cada uma tem de estar em ALGUM dos campos de busca.
  L.buscarConferencia = (linhas, termo) => {
    const palavras = L.semAcento(termo).toLowerCase().split(/\s+/).filter(Boolean);
    if (!palavras.length) return linhas;
    return linhas.filter((l) => {
      const campos = L.CAMPOS_BUSCA.map((k) => L.semAcento(l[k] || '').toLowerCase());
      return palavras.every((p) => campos.some((c) => c.includes(p)));
    });
  };

  // No PATCH, so as colunas dos lados que a pessoa tem. Quem tem os quatro
  // manda tudo; quem nao tem nenhum tambem — para levar a recusa do servidor
  // em vez de um "salvou" falso.
  L.soOMeuLado = (corpo, lados) => {
    const tem = [lados.comercial, lados.sesmt, lados.faturamento, lados.seguranca];
    if (tem.every(Boolean) || !tem.some(Boolean)) return { ...corpo };
    const permitidas = new Set(['atualizado_por']);
    if (lados.comercial) L.CAMPOS_COMERCIAL.forEach((c) => permitidas.add(c));
    if (lados.sesmt) L.CAMPOS_SESMT.forEach((c) => permitidas.add(c));
    if (lados.faturamento) L.CAMPOS_FATURAMENTO.forEach((c) => permitidas.add(c));
    if (lados.seguranca) L.CAMPOS_PGR.forEach((c) => permitidas.add(c));
    const saida = {};
    for (const [k, v] of Object.entries(corpo)) if (permitidas.has(k)) saida[k] = v;
    return saida;
  };

  // Quem assina o que, antes de salvar. A MESMA regra do computador
  // (conferencia_nucleo.quem_assina e quem_faturou).
  L.assinar = (antes, depois, nome, admin) => {
    const d = { ...depois };
    const vazio = (v) => !String(v ?? '').trim();
    // Apagar o nome de quem liberou zera a data correspondente.
    for (const [por, em] of [['liberado_por', 'liberado_em'], ['pgr_liberado_por', 'pgr_liberado_em']]) {
      if (antes[por] && !d[por]) d[em] = null;
    }
    const mudou = (k) => (d[k] || null) !== (antes[k] || null);
    // FATURADO: sem a data, sem nome; a data mudou, assina quem salvou.
    // Anexar a nota ou o boleto numa linha já faturada e SEM nome também
    // assina (é quem provou o faturamento); nome de outra pessoa não se
    // troca. O administrador que deixa o campo vazio também assina.
    const faturou = () => {
      if (!d.faturado_em) return null;
      if (mudou('faturado_em')) return nome;
      if (vazio(d.faturado_por)) {
        for (const arq of ['nf_arquivo', 'boleto_arquivo']) {
          if (!vazio(d[arq]) && String(d[arq]).trim() !== String(antes[arq] ?? '').trim()) return nome;
        }
        if (admin) return nome;
      }
      return d.faturado_por || null;
    };
    if (admin) {
      // o administrador escreve os nomes à mão; só o vazio é preenchido
      if (d.faturado_em && vazio(d.faturado_por)) d.faturado_por = nome;
      if (!d.faturado_em) d.faturado_por = null;
      return d;
    }
    // LIBERADO (SESMT): apagar de propósito é apagar. Antes, esvaziar o nome
    // com a situação ainda marcada fazia o app assinar de novo com quem
    // salvou, e o nome apagado reaparecia.
    if (antes.liberado_por && vazio(d.liberado_por)) d.liberado_por = null;
    else if ((d.liberado_em || d.situacao_sesmt) && (vazio(d.liberado_por) || mudou('liberado_em') || mudou('situacao_sesmt'))) d.liberado_por = nome;
    if (!d.liberado_em && !d.situacao_sesmt) d.liberado_por = d.liberado_por || null;
    d.faturado_por = faturou();
    if (mudou('pgr_liberado_em')) d.pgr_liberado_por = d.pgr_liberado_em ? nome : null;
    return d;
  };

  // O cliente paga este serviço por boleto? Sai da forma de pagamento,
  // agrupada ("BOLETO 5 DIAS" e "SOLICITAR BOLETO" são o mesmo).
  L.pagaComBoleto = (l) => L.chaveDoPagamento(l?.forma_pagamento) === 'BOLETO';

  // O que falta anexar para poder marcar faturado; "" quando não falta
  // nada. A NOTA vale para todos; pagando por boleto, o BOLETO também.
  // (conferencia_nucleo.falta_comprovante, com as mesmas frases)
  L.faltaComprovante = (l) => {
    if (!l?.faturado_em) return '';
    if (!String(l.nf_arquivo ?? '').trim()) return 'Anexe a NOTA FISCAL para marcar como faturado. É ela que prova o faturamento: a data sozinha diz quando, e não se.';
    if (L.pagaComBoleto(l) && !String(l.boleto_arquivo ?? '').trim()) return 'Este serviço é pago por boleto: anexe também o BOLETO. (Se o cliente mudou a forma de pagamento, corrija o campo Forma de pagamento antes.)';
    return '';
  };

  // O que mudou, para o log: "prazo: 01/06/2026 -> 15/06/2026 · valor: R$ 1,00 -> R$ 2,00"
  L.oQueMudou = (antes, depois) => {
    const partes = [];
    for (const k of Object.keys(depois)) {
      if (k === 'atualizado_por') continue;
      const a = antes[k] ?? '', d = depois[k] ?? '';
      if (String(a) === String(d)) continue;
      const f = (v) => k.endsWith('_em') ? (L.dataBr(v) || '—') : k === 'valor' ? L.dinheiro(v) : (String(v) || '—');
      partes.push(`${k}: ${f(a)} → ${f(d)}`);
    }
    return partes.join(' · ');
  };

  /* ------------------------------------------------------------ diario */

  L.ATIVIDADES = [
    ['atendimento', 'Atendimento Balcão', 'ATD'], ['prospeccao', 'Prospecção de Clientes', 'PRO'],
    ['contratos', 'Contratos', 'CTR'], ['cadastro', 'Cadastro de Empresas', 'CAD'],
  ];
  L.PAGAMENTOS = ['PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto', 'A Prazo'];
  L.SERVICOS_BALCAO = ['Saúde Ocupacional', 'Medicina do Trabalho', 'Exames Admissionais', 'Exames Periódicos', 'Consulta', 'Outros'];
  L.STATUS_PROSPECCAO = ['Interesse', 'Sem Interesse', 'Retornar', 'Proposta Enviada', 'Reunião Agendada'];
  L.META_PADRAO = 80;

  L.CAMPOS_DIARIO = {
    atendimento: [['empresa', 'Empresa', 'texto'], ['servico', 'Serviço', 'servico'], ['pagamento', 'Pagamento', 'pagamento'], ['valor', 'Valor', 'dinheiro'], ['obs', 'Observação', 'texto']],
    prospeccao: [['empresa', 'Empresa', 'texto'], ['contato', 'Contato / WhatsApp', 'texto'], ['status', 'Status', 'status'], ['retorno', 'Retornar em', 'data'], ['obs', 'Observação', 'texto']],
    contratos: [['empresa', 'Empresa', 'texto'], ['servico', 'Serviço', 'texto'], ['valor', 'Valor', 'dinheiro'], ['pagamento', 'Pagamento', 'pagamento'], ['obs', 'Observação', 'texto']],
    cadastro: [['empresa', 'Empresa', 'texto'], ['cnpj', 'CNPJ', 'texto'], ['ramo', 'Ramo', 'texto'], ['endereco', 'Endereço', 'texto'], ['contato', 'Contato', 'texto'], ['email', 'E-mail', 'texto'], ['aniversario', 'Aniversário do contratante', 'data']],
  };

  // Devolve {ok, detalhe, erro}. Tudo e obrigatorio, inclusive a observacao.
  L.validarDetalhe = (atividade, bruto) => {
    const campos = L.CAMPOS_DIARIO[atividade];
    if (!campos) return { ok: false, erro: 'Atividade desconhecida.' };
    const d = {};
    for (const [chave, rotulo, tipo] of campos) {
      let v = bruto?.[chave];
      // Como o diario_nucleo: vazio ou "abc" recusa; ZERO vale (cortesia,
      // atendimento sem cobrança). Antes o app exigia valor maior que zero.
      if (tipo === 'dinheiro') {
        if (typeof v !== 'number') {
          const t = String(v ?? '').trim();
          if (!t) return { ok: false, erro: `${rotulo}: informe um valor.` };
          if (!/\d/.test(t) || /[a-z]/i.test(t.replace(/R\$/i, ''))) return { ok: false, erro: `${rotulo}: não entendi o número "${t}".` };
          v = L.lerDinheiro(t);
        }
        if (v < 0) return { ok: false, erro: `${rotulo}: o valor não pode ser negativo.` };
      }
      else if (tipo === 'data') { v = L.lerData(v); if (!v) return { ok: false, erro: `${rotulo}: data inválida (use dd/mm/aaaa).` }; }
      else { v = L.achatar(v); if (!v) return { ok: false, erro: `${rotulo}: preencha.` }; }
      d[chave] = v;
    }
    return { ok: true, detalhe: d };
  };

  L.metaDe = (metas, uid, atividade) => {
    const m = metas.find((x) => x.usuario_id === uid && x.atividade === atividade);
    return m && Number(m.meta) > 0 ? Number(m.meta) : L.META_PADRAO;
  };
  L.percentual = (realizado, meta) => {
    if (!(meta > 0)) return realizado > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((realizado * 100) / meta)));
  };
  L.corDoPercentual = (p) => p >= 80 ? 'verde' : p >= 50 ? 'amarelo' : 'vermelho';

  // totais = linhas de orc_diario_totais; admins = Set de uuids fora do ranking.
  L.ranking = (totais, admins) => {
    const por = new Map();
    for (const t of totais) {
      if (admins.has(t.usuario_id)) continue;
      const p = por.get(t.usuario_id) || { usuario_id: t.usuario_id, nome: t.usuario_nome, total: 0,
        por_atividade: { atendimento: 0, prospeccao: 0, contratos: 0, cadastro: 0 } };
      p.por_atividade[t.atividade] = (p.por_atividade[t.atividade] || 0) + Number(t.total);
      p.total += Number(t.total);
      por.set(t.usuario_id, p);
    }
    return [...por.values()]
      .sort((a, b) => b.total - a.total || L.semAcento(a.nome).localeCompare(L.semAcento(b.nome)))
      .map((p, i) => ({ posicao: i + 1, ...p }));
  };

  L.totaisPorAtividade = (registros) => {
    const t = { atendimento: 0, prospeccao: 0, contratos: 0, cadastro: 0 };
    for (const r of registros) t[r.atividade] = (t[r.atividade] || 0) + (Number(r.quantidade) || (r.detalhes || []).length);
    return t;
  };

  L.retornosPendentes = (registros, hoje = L.hojeISO()) => {
    const saida = [];
    for (const r of registros) {
      if (r.atividade !== 'prospeccao') continue;
      for (const d of r.detalhes || []) {
        if (!d.retorno) continue;
        const dias = L.diasEntre(hoje, d.retorno);
        if (dias === null) continue;
        saida.push({ ...d, dias, data: r.data, tag: dias < 0 ? `Atrasado ${-dias} d` : dias === 0 ? 'Hoje' : `Em ${dias} d` });
      }
    }
    return saida.sort((a, b) => a.dias - b.dias);
  };

  L.aniversariantes = (registros, hoje = L.hojeISO()) => {
    const mesDia = hoje.slice(5);
    const saida = [];
    for (const r of registros) {
      if (r.atividade !== 'cadastro') continue;
      for (const d of r.detalhes || []) if (d.aniversario && String(d.aniversario).slice(5) === mesDia) saida.push(d);
    }
    return saida;
  };

  L.buscarEmpresa = (registros, termo) => {
    const t = L.semAcento(termo).toLowerCase().trim();
    const digitos = t.replace(/\D/g, '');
    if (!t) return [];
    const saida = [];
    for (const r of registros) for (const d of r.detalhes || []) {
      const nome = L.semAcento(d.empresa || '').toLowerCase();
      const cnpj = String(d.cnpj || '').replace(/\D/g, '');
      if (nome.includes(t) || (digitos.length >= 3 && cnpj.includes(digitos))) saida.push({ ...d, atividade: r.atividade, data: r.data });
    }
    return saida;
  };

  raiz.L = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
