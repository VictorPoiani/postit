import { setupImageUpload } from './buttons.js';
import { CURRENT_PROFILE_ID } from './config.js';
import { supabase } from './supabase.js';
import { initPosts } from './posts.js';
import { initProfileEditModal, loadProfileEditableData } from './profileEditModal.js';
import { initNotifications } from './notificacoes/notificacoes-init.js';

if (window.lucide) {
    window.lucide.createIcons();
}

console.log('[global.js] Perfil atual:', CURRENT_PROFILE_ID);

// ============ Carrega avatar/capa já salvos no banco ao abrir a página ============
async function loadSavedProfileImages(profileId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, cover_url')
        .eq('id', profileId)
        .single();

    if (error) {
        console.error('[loadSavedProfileImages] Erro ao carregar imagens do perfil:', error);
        return;
    }

    if (data?.avatar_url) {
        const avatarImg = document.getElementById('avatarImg');
        const avatarUpload = document.getElementById('avatarUpload');
        if (avatarImg && avatarUpload) {
            avatarImg.src = data.avatar_url;
            avatarImg.style.display = 'block';
            avatarUpload.classList.add('has-image');
        }

        // Reflete a mesma foto no avatar pequeno do composer de posts
        const composerAvatarImg = document.getElementById('composerAvatarImg');
        if (composerAvatarImg) {
            composerAvatarImg.src = data.avatar_url;
            composerAvatarImg.style.display = 'block';
        }
    }

    if (data?.cover_url) {
        const coverImg = document.getElementById('coverImg');
        const coverUpload = document.getElementById('coverUpload');
        if (coverImg && coverUpload) {
            coverImg.src = data.cover_url;
            coverImg.style.display = 'block';
            coverUpload.classList.add('has-image');
        }
    }

    console.log('[loadSavedProfileImages] Imagens carregadas:', data);
}

loadSavedProfileImages(CURRENT_PROFILE_ID);

// Inicializa a Capa (Cover):
setupImageUpload(
    'coverUpload',
    'coverInput',
    'coverImg',
    'cover',
    'cover_url',
    CURRENT_PROFILE_ID
);

// Inicializa o Avatar (Perfil):
setupImageUpload(
    'avatarUpload',
    'avatarInput',
    'avatarImg',
    'avatar',
    'avatar_url',
    CURRENT_PROFILE_ID
);

// Inicializa o composer e o feed de posts:
initPosts(CURRENT_PROFILE_ID);

// Inicializa o modal de edição de perfil (nome, alcunha, aniversário, localização, bio):
initProfileEditModal(CURRENT_PROFILE_ID);
loadProfileEditableData(CURRENT_PROFILE_ID);

async function loadSavedProfileData(profileId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, cover_url, spotify_track_id')
        .eq('id', profileId)
        .single();

    if (error) {
        console.error('[loadSavedProfileData] Erro ao carregar perfil:', error);
        return;
    }

    // 1. Carrega Avatar
    if (data?.avatar_url) {
        const avatarImg = document.getElementById('avatarImg');
        const avatarUpload = document.getElementById('avatarUpload');
        if (avatarImg && avatarUpload) {
            avatarImg.src = data.avatar_url;
            avatarImg.style.display = 'block';
            avatarUpload.classList.add('has-image');
        }

        // Reflete foto no composer de posts
        const composerAvatarImg = document.getElementById('composerAvatarImg');
        if (composerAvatarImg) {
            composerAvatarImg.src = data.avatar_url;
            composerAvatarImg.style.display = 'block';
        }
    }

    // 2. Carrega Capa
    if (data?.cover_url) {
        const coverImg = document.getElementById('coverImg');
        const coverUpload = document.getElementById('coverUpload');
        if (coverImg && coverUpload) {
            coverImg.src = data.cover_url;
            coverImg.style.display = 'block';
            coverUpload.classList.add('has-image');
        }
    }

    // 3. Carrega Player do Spotify
    if (data?.spotify_track_id) {
        const spotifyPlayer = document.getElementById('spotifyPlayer');
        if (spotifyPlayer) {
            spotifyPlayer.src = `https://open.spotify.com/embed/track/${data.spotify_track_id}?utm_source=generator&theme=0`;
        }
    }

    console.log('[loadSavedProfileData] Dados carregados:', data);
}

// Executa o carregamento inicial dos dados
loadSavedProfileData(CURRENT_PROFILE_ID);

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav li');
    const defaultProfileScreen = document.getElementById('defaultProfileScreen');
    const tagConfigScreen = document.getElementById('tagConfigScreen');
    const exploreScreen = document.getElementById('exploreScreen');
    const postDetailScreen = document.getElementById('postDetailScreen');
    const backToHomeBtn = document.getElementById('backToHomeBtn');

    function hideAllScreens() {
        if (defaultProfileScreen) defaultProfileScreen.style.display = 'none';
        if (tagConfigScreen) tagConfigScreen.style.display = 'none';
        if (exploreScreen) exploreScreen.style.display = 'none';
        if (postDetailScreen) postDetailScreen.style.display = 'none';
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const navTarget = item.dataset.nav;

            // Atualiza o estado ativo no menu lateral
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            hideAllScreens();

            if (navTarget === 'explore') {
                if (exploreScreen) exploreScreen.style.display = 'flex';
            } else {
                // Exibe a tela principal por padrão para Home e abas em desenvolvimento
                if (defaultProfileScreen) defaultProfileScreen.style.display = 'block';
            }

            if (window.lucide) window.lucide.createIcons();
        });
    });

    // Botão de retorno direto dentro da tela "Em Construção"
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', () => {
            hideAllScreens();
            if (defaultProfileScreen) defaultProfileScreen.style.display = 'block';

            // Retorna o destaque do menu lateral para o item "Home"
            navItems.forEach(nav => {
                nav.classList.toggle('active', nav.dataset.nav === 'home');
            });

            if (window.lucide) window.lucide.createIcons();
        });
    }
});