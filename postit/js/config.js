// js/config.js
// ID do perfil atual. Centralizado aqui para evitar import circular
// entre global.js e buttons.js.
export const CURRENT_PROFILE_ID = '96d271a9-9102-49b1-b593-9279c5dfe3f4';

// ID do único perfil autorizado a publicar no mural de Atualizações (aba "Notificações").
// Hoje é o mesmo ID do CURRENT_PROFILE_ID porque o site só tem um usuário (você).
// Quando o Post It abrir para outras pessoas, CURRENT_PROFILE_ID passará a vir de uma
// sessão de autenticação real (supabase.auth), mas ADMIN_PROFILE_ID continua fixo
// no seu ID, então a comparação abaixo (isAdmin) continuará funcionando sem mudar nada.
//
// IMPORTANTE: essa checagem no front-end só esconde o botão de postar na tela -
// ela NÃO é segurança de verdade. Para bloquear de fato outras pessoas de inserir
// linhas na tabela "updates", crie no Supabase uma Policy de INSERT restrita a:
//   auth.uid() = '96d271a9-9102-49b1-b593-9279c5dfe3f4'
// (ou equivalente, dependendo de como a autenticação for implementada no futuro).
export const ADMIN_PROFILE_ID = '96d271a9-9102-49b1-b593-9279c5dfe3f4';