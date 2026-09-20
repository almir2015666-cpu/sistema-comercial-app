# CMH Sistema — o SistemaCMH no celular

O aplicativo da **equipe** da Clínica Medicina Humana: os mesmos usuários,
senhas, permissões e dados do programa do computador (o SistemaCMH), no
iPhone. O que a pessoa faz aqui aparece lá, e vice-versa, porque o banco é
um só — o Supabase `ojhulerxocgaxbiutrnm`, tabelas `orc_*`.

Versão 2.0 é uma reescrita: até a 1.3 este app falava com o Firebase e
tinha só o Comercial e o Financeiro do site. Esse código está inteiro em
`legado/` (não roda mais; os dados do Financeiro e do Diário já foram
migrados para o Supabase pelo SistemaCMH).

## O que já decidimos

- **Público:** a equipe, não o cliente nem o paciente.
- **Mesmo app na loja** (`com.sistemacmh.app`, "CMH Sistema"), mesma casca
  visual (cores, botões, chat, barra de abas vieram tal qual do legado).
- **Capacitor + HTML/JS puro**, sem bundler: o que está em `app/` é o que roda.
- **iOS primeiro**, pelo GitHub Actions → TestFlight. Android depois.
- **Primeira versão:** Chat, Tarefas, Compromissos, Chamados T.I.,
  Conferência, Diário de Bordo e Administração (usuários, log, máquinas).
  Os módulos cifrados ponta a ponta (Orçamentos, Documentos, Empresas,
  Agenda, Agendamento, PGR/PCMSO, Financeiro) ficam para depois: exigem
  carregar a chave da clínica no aparelho.

## Como funciona

```
app/
  index.html      a casca: entrar (3 passos), topo, palco, abas
  app.css         o desenho (tokens do legado + celular)
  config.js       endereço e chave pública do Supabase
  logica.js       REGRAS PURAS, sem DOM nem rede — testadas em tests/
  ui.js           toast, folha, navegação em pilha, abas, ícones
  nuvem.js        Supabase: login, 2 etapas, log, paginação, arquivos
  app.js          entrada, início, perfil, avisadores
  modulos/*.js    um arquivo por módulo; cada um registra MODULOS.<chave>
scripts/build.js  monta www/ (app/ + supabase-js + qrcode) e carimba a versão
scripts/telas.js  abre no Chromium de iPhone e caça erro de JS
tests/            node --test
```

```bash
npm test          # as regras (situação da conferência, fila, ranking…)
npm run build     # monta www/
npm run previa    # serve www/ em http://127.0.0.1:8791
npm run telas     # telas + erros de JS (com USUARIO e SENHA no ambiente entra de verdade)
npm run sync      # build + cap sync ios (+ conserta as barras do Package.swift)
```

## Regras que não se quebram

1. **Nada vem de graça.** A pessoa só vê os módulos marcados no cadastro
   (`orc_usuarios.modulos`); o administrador vê tudo. Igual ao computador.
2. **O servidor decide.** RLS e gatilhos recusam; a tela só deixa cinza para
   a pessoa entender. Um PATCH que a RLS não alcança volta `200 []` — o
   `N.mudar()` trata lista vazia como recusa, sempre.
3. **Teto de 1.000 linhas** do PostgREST, em silêncio: `N.tudo()` pagina.
4. **Administrador só com as duas etapas** (`aal2`). Sem o código, a RLS o
   trata como usuário comum; a tela de Administração avisa em vez de "sumir".
5. **O login é `usuario@orcamentos.clinicamedicinahumana.com.br`**, com a
   mesma normalização do app.py (`L.loginDe`): sem acento, sem espaço.
6. **Conferência:** cada lado (comercial, segurança, SESMT, faturamento) só
   manda as suas colunas (`L.soOMeuLado`); a situação é calculada das datas
   (`L.situacaoDe` / `L.atrasoDe`), nunca gravada; quem assina segue as
   regras da tela do computador (`L.assinar`).
7. **Chat:** o anexo sobe antes da mensagem, no caminho `<uid>/<12 hex>-<nome>`;
   não há UPDATE em mensagem (apagar para todos é RPC); a marca de leitura é
   por conversa (`p:<uuid>` / `s:<setor>`).
8. **Log:** toda ação vai para `orc_log` com `maquina = nome do aparelho` e
   `app_versao = "app <commit>"`. Sem IP nem localização, de propósito. Na
   tela "Máquinas e versões" do computador o celular aparece com "app".

## O que fica diferente do computador (de propósito)

- A sessão fica guardada no aparelho: o código das duas etapas é pedido ao
  entrar, não a cada 30 minutos.
- Os lembretes de compromisso por e-mail continuam saindo do programa do
  computador (o avisador de lá carimba `email_vespera`/`email_perto`).
- Os avisos são por consulta periódica enquanto o app está aberto (chat 3 s
  na conversa, 8 s na lista; tarefas e compromissos 60 s; chamados 15 s).
  Notificação push é uma segunda versão.
- Nota fiscal e boleto na Conferência: o app anexa o PDF e a pessoa digita o
  número da nota e a linha digitável (que é conferida nos dígitos). O
  computador lê os dois de dentro do PDF.

## Colocar no TestFlight

`git push` na `main` → `.github/workflows/ios.yml` → build assinado →
TestFlight. Quatro segredos no repositório `almir2015666-cpu/sistema-comercial-app`:

| Segredo | Estado |
|---|---|
| `CERTIFICATE_PRIVATE_KEY` | gravado (de `C:\Projetos\Mobile\wavetalk-cert\private_key_rsa.pem`, sem CRLF) |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | gravado (`7R4QL39S29`) |
| `APP_STORE_CONNECT_PRIVATE_KEY` | gravado (`AuthKey_7R4QL39S29.p8`) |
| `APP_STORE_CONNECT_ISSUER_ID` | **falta**: App Store Connect → Usuários e acesso → Integrações → Issuer ID |

A versão de marketing é `2.0.<número do build>`; o build interno é o
número da execução. Para um lançamento de verdade, suba o `MARKETING_VERSION`
no `project.pbxproj`.

## O que falta

- Notificação push (APNs) para chat, chamado e tarefa vencendo.
- Os módulos cifrados (precisam da chave da clínica no aparelho — a mesma
  derivação PBKDF2 do app.py, com a pimenta).
- Android: `npx cap add android`, keystore, conta da Play Console em nome
  do CNPJ da clínica.
- Ícone: hoje é o do app anterior.
