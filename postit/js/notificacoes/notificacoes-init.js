import { CURRENT_PROFILE_ID, ADMIN_PROFILE_ID } from './../config.js';
import { initNotifications } from './notificacoes.js';

// Reexporta initNotifications: é o que permite que outros arquivos (como o
// global.js compartilhado) façam "import { initNotifications } from
// './notificacoes/notificacoes-init.js'" sem erro de export ausente.
export { initNotifications };

if (window.lucide) {
    window.lucide.createIcons();
}

// A checagem "sou admin?" acontece dentro de initNotifications, comparando
// CURRENT_PROFILE_ID com ADMIN_PROFILE_ID (ver comentário em config.js).
initNotifications(CURRENT_PROFILE_ID, ADMIN_PROFILE_ID);