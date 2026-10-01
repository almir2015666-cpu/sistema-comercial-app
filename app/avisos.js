/* =====================================================================
   CMH Sistema — os ALERTAS no celular (notificação da Apple).

   Com o app fechado ou na gaveta, o JavaScript não roda: quem avisa é o
   servidor. Cada mensagem de chat, tarefa, chamado, compromisso e pedido
   de material entra numa fila no banco (67-celular-avisos.sql), e a Edge
   Function orc-push manda para os aparelhos de quem tem de saber.

   Aqui só se faz a parte do aparelho:
     - pedir licença para avisar (a Apple pergunta uma vez);
     - entregar ao servidor o "endereço" deste aparelho, no nome de quem
       entrou (orc_celular_registrar). Trocou de pessoa no mesmo celular?
       O endereço passa para a nova, e a anterior deixa de receber;
     - tocar no alerta abre o módulo dele;
     - sair da conta tira o endereço: celular sem ninguém não recebe nada.
   ===================================================================== */
window.AVISOS = (() => {
  'use strict';
  const P = () => window.Capacitor?.Plugins?.PushNotifications;
  let token = null;
  let ouvindo = false;

  function abrirModulo(chave) {
    const m = window.MODULOS?.[chave];
    const eu = N.estado.eu;
    if (m && eu && m.precisa(eu)) {
      try { m.abrir(['chat', 'tarefas'].includes(chave)); } catch { /* segue */ }
    }
  }

  async function ouvir(push) {
    if (ouvindo) return;
    ouvindo = true;
    await push.addListener('registration', async (t) => {
      token = t.value;
      try { await N.sb.rpc('orc_celular_registrar', { p_token: token, p_plataforma: 'ios' }); }
      catch { /* sem rede: tenta de novo na próxima abertura */ }
    });
    await push.addListener('registrationError', () => { /* sem permissão ou sem rede */ });
    // tocou no alerta (app fechado ou na gaveta): abre o módulo dele
    await push.addListener('pushNotificationActionPerformed', (a) => {
      const chave = a?.notification?.data?.modulo;
      if (chave) setTimeout(() => abrirModulo(chave), 300);
    });
    // chegou com o app aberto: a Apple mostra a faixa (presentationOptions);
    // aqui só se atualizam os números das caixas
    await push.addListener('pushNotificationReceived', () => {
      try { window.APP?.atualizarContagens(); } catch { /* segue */ }
    });
  }

  async function ligar() {
    const push = P();
    if (!push || !N.estado.id) return;            // navegador: sem alerta
    try {
      await ouvir(push);
      let p = await push.checkPermissions();
      if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') {
        p = await push.requestPermissions();
      }
      if (p.receive !== 'granted') return;
      await push.register();                      // devolve em 'registration'
    } catch { /* o app funciona sem alerta */ }
  }

  async function esquecer() {
    const push = P();
    try { if (token) await N.sb.rpc('orc_celular_esquecer', { p_token: token }); } catch { /* sem rede */ }
    try { if (push) await push.removeAllDeliveredNotifications(); } catch { /* segue */ }
    token = null;
  }

  return { ligar, esquecer, abrirModulo };
})();
