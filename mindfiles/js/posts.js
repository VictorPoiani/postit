import { supabase } from './supabase.js';

// Dados fixos do dono do perfil (mesmos usados no cabeçalho do perfil).
// Se um dia isso virar multi-usuário, é só puxar da tabela profiles.
const AUTHOR_NAME = 'Victor Poiani';
const AUTHOR_HANDLE = 'poiani';

function logSupabaseError(context, error) {
    console.error(`[Supabase] Erro em "${context}":`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
    });
}

// ============ Estado dos anexos pendentes do composer ============
// (uma imagem e/ou uma música do Spotify por post, resetado após publicar)
const pendingAttachment = {
    imageFile: null,
    imagePreviewUrl: null,
    spotifyTrackId: null
};

// Estado dos anexos pendentes do composer de RESPOSTA (independente do composer principal)
const pendingReplyAttachment = {
    imageFile: null,
    imagePreviewUrl: null,
    spotifyTrackId: null
};

// Post atualmente aberto na tela de detalhe (usado pelo composer de respostas)
let currentDetailPost = null;

const EMOJI_LIST = [
    '😀', '😂', '🤣', '😊', '😉', '😍', '🥰', '😎', '🤔', '😴',
    '😮', '😢', '😭', '😡', '🥳', '😇', '🥲', '😬', '🤯', '💀',
    '🔥', '✨', '💯', '👀', '👍', '👏', '🙌', '🙏', '❤️', '🎉',
    '🚀', '🎸', '🎵', '📸', '☕', '🌙'
];

function extractSpotifyTrackId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    if (trimmed.includes('open.spotify.com/track/')) {
        const parts = trimmed.split('track/');
        return parts[1]?.split('?')[0] || null;
    }
    // Aceita também o formato de URI "spotify:track:ID"
    if (trimmed.includes('spotify:track:')) {
        return trimmed.split('spotify:track:')[1] || null;
    }
    // Assume que já é o ID puro (evita aceitar textos aleatórios)
    return /^[A-Za-z0-9]{10,30}$/.test(trimmed) ? trimmed : null;
}

// ============ Formata "há quanto tempo" no estilo Twitter ============
function timeAgo(dateString) {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'agora';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ Obtém a URL atual do avatar dinamicamente ============
function getAvatarUrl() {
    const avatarImg = document.getElementById('avatarImg');
    if (!avatarImg) return '';

    const src = avatarImg.getAttribute('src');
    // Verifica se a tag existe, possui URL preenchida e se não está explicitamente oculta
    if (src && src.trim() !== '' && avatarImg.style.display !== 'none') {
        return avatarImg.src;
    }
    return '';
}

// ============ Monta o HTML de um post (modelo Twitter) ============
function buildPostCard(post, avatarUrl) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.postId = post.id;

    article.innerHTML = `
        <div class="post-card-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="Avatar">` : ''}
        </div>
        <div class="post-card-body">
            <div class="post-card-header">
                <span class="post-card-name">${AUTHOR_NAME}</span>
                <span class="post-card-handle">@${AUTHOR_HANDLE}</span>
                <span class="post-card-dot">·</span>
                <span class="post-card-time">${timeAgo(post.created_at)}</span>
            </div>
            <div class="post-card-text">${escapeHtml(post.content)}</div>
            ${post.image_url ? `
            <div class="post-card-image">
                <img src="${post.image_url}" alt="Imagem do post" loading="lazy">
            </div>` : ''}
            ${post.spotify_track_id ? `
            <div class="post-card-spotify">
                <iframe src="https://open.spotify.com/embed/track/${post.spotify_track_id}?utm_source=generator&theme=0"
                    width="100%" height="80" frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"></iframe>
            </div>` : ''}
            <div class="post-card-actions">
                <button class="action reply" title="Responder">
                    <i data-lucide="message-circle"></i><span>${post.replies_count || 0}</span>
                </button>
                <button class="action repost" title="Repostar">
                    <i data-lucide="repeat-2"></i><span>${post.reposts_count || 0}</span>
                </button>
                <button class="action like" title="Curtir">
                    <i data-lucide="heart"></i><span>${post.likes_count || 0}</span>
                </button>
                <button class="action views" title="Visualizações">
                    <i data-lucide="bar-chart-2"></i><span>${post.views_count || 0}</span>
                </button>
                <button class="action bookmark" title="Salvar">
                    <i data-lucide="bookmark"></i>
                </button>
                <button class="action share" title="Compartilhar">
                    <i data-lucide="share"></i>
                </button>
                <button class="action edit-post" title="Editar post">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="action delete-post" title="Excluir post">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `;

    wireCardInteractions(article, post, avatarUrl);

    // Torna qualquer área livre do post clicável para abrir a visualização completa
    // (ignora cliques nos botões de ação, links, no player do Spotify e durante a edição)
    article.addEventListener('click', (e) => {
        if (article.classList.contains('editing')) return;
        if (article.closest('#postDetailContent')) return; // já está na tela de detalhe
        if (e.target.closest('.post-card-actions') || e.target.closest('a') || e.target.closest('iframe')) return;
        openPostDetail(post, avatarUrl);
    });

    return article;
}

// ============ Curtir / repostar / salvar são só locais (não vão pro banco) ============
// Editar e excluir, por outro lado, mexem de verdade na tabela "posts".
function wireCardInteractions(card, post, avatarUrl) {
    const replyBtn = card.querySelector('.action.reply');
    const likeBtn = card.querySelector('.action.like');
    const repostBtn = card.querySelector('.action.repost');
    const bookmarkBtn = card.querySelector('.action.bookmark');
    const editBtn = card.querySelector('.action.edit-post');
    const deleteBtn = card.querySelector('.action.delete-post');

    const bumpCounter = (btn, delta) => {
        const span = btn.querySelector('span');
        if (!span) return;
        span.textContent = String(Math.max(0, parseInt(span.textContent, 10) + delta));
    };

    replyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();

        // Se esse card já é o que está aberto na tela de detalhe (dentro de
        // #postDetailContent), não precisa reabrir — isso resetaria o composer
        // de resposta e apagaria o que a pessoa já tivesse escrito/anexado.
        const alreadyOpenInDetail = card.closest('#postDetailContent');
        if (!alreadyOpenInDetail) {
            openPostDetail(post, avatarUrl);
        }

        // Espera a tela de detalhe ficar visível (display: block) antes de focar,
        // senão o focus() não funciona em um elemento ainda escondido.
        requestAnimationFrame(() => {
            document.getElementById('replyInput')?.focus();
        });
    });

    likeBtn?.addEventListener('click', () => {
        const active = likeBtn.classList.toggle('active');
        bumpCounter(likeBtn, active ? 1 : -1);
    });

    repostBtn?.addEventListener('click', () => {
        const active = repostBtn.classList.toggle('active');
        bumpCounter(repostBtn, active ? 1 : -1);
    });

    bookmarkBtn?.addEventListener('click', () => {
        bookmarkBtn.classList.toggle('active');
    });

    editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditPost(card, post);
    });

    deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        deletePost(card, post);
    });
}

// ============ Edita o texto de um post já publicado ============
function startEditPost(card, post) {
    if (card.classList.contains('editing')) return; // já está editando
    card.classList.add('editing');

    const textEl = card.querySelector('.post-card-text');
    if (!textEl) return;

    const originalHtml = textEl.outerHTML;

    const editBox = document.createElement('div');
    editBox.className = 'post-edit-box';
    editBox.innerHTML = `
        <textarea class="composer-input post-edit-textarea" maxlength="500">${post.content || ''}</textarea>
        <div class="post-edit-actions">
            <span class="post-edit-count">${(post.content || '').length}/500</span>
            <div class="post-edit-buttons">
                <button type="button" class="post-edit-cancel">Cancelar</button>
                <button type="button" class="composer-submit post-edit-save">Salvar</button>
            </div>
        </div>
    `;

    textEl.replaceWith(editBox);

    const textarea = editBox.querySelector('.post-edit-textarea');
    const countEl = editBox.querySelector('.post-edit-count');
    const cancelBtn = editBox.querySelector('.post-edit-cancel');
    const saveBtn = editBox.querySelector('.post-edit-save');

    textarea.addEventListener('input', () => {
        countEl.textContent = `${textarea.value.length}/500`;
    });

    // Coloca o cursor no fim do texto ao entrar em modo de edição
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const cancelEdit = () => {
        editBox.replaceWith(document.createRange().createContextualFragment(originalHtml));
        card.classList.remove('editing');
    };

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit();
    });

    editBox.addEventListener('click', (e) => e.stopPropagation());

    editBox.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelEdit();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveBtn.click();
    });

    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newContent = textarea.value.trim();

        if (!newContent && !post.image_url && !post.spotify_track_id) {
            alert('O post não pode ficar vazio.');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        const { data, error } = await supabase
            .from('posts')
            .update({ content: newContent })
            .eq('id', post.id)
            .select()
            .single();

        if (error) {
            logSupabaseError('startEditPost', error);
            alert(`Erro ao salvar a edição: ${error.message}`);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
            return;
        }

        // Atualiza o objeto do post em memória (importante para a tela de detalhe)
        post.content = data.content;

        const newTextEl = document.createElement('div');
        newTextEl.className = 'post-card-text';
        newTextEl.textContent = data.content;
        editBox.replaceWith(newTextEl);
        card.classList.remove('editing');

        // Se esse post estiver aberto na tela de detalhe, reflete a edição lá também
        if (currentDetailPost && currentDetailPost.id === post.id) {
            currentDetailPost.content = data.content;
        }
    });
}

// ============ Exclui um post (com confirmação) ============
async function deletePost(card, post) {
    const confirmed = window.confirm('Excluir este post? Essa ação não pode ser desfeita.');
    if (!confirmed) return;

    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

    if (error) {
        logSupabaseError('deletePost', error);
        alert(`Erro ao excluir o post: ${error.message}`);
        return;
    }

    // Remove o card de todo lugar em que ele aparece na tela (feed e/ou detalhe)
    document.querySelectorAll(`.post-card[data-post-id="${post.id}"]`).forEach(el => el.remove());

    const postsList = document.getElementById('postsList');
    if (postsList) {
        updatePostsStat(postsList.querySelectorAll('.post-card').length);
        if (postsList.children.length === 0) {
            postsList.innerHTML = '<p class="empty-state" id="emptyPostsMsg">Você ainda não fez nenhum post.</p>';
        }
    }

    // Se o post excluído era o que estava aberto na tela de detalhe, volta para a Home
    if (currentDetailPost && currentDetailPost.id === post.id) {
        closePostDetail();
    }
}

// ============ Tela de Post Aberto (visualização completa + estatísticas + respostas) ============
function openPostDetail(post, avatarUrl) {
    const screen = document.getElementById('postDetailScreen');
    const contentBox = document.getElementById('postDetailContent');
    const statsBox = document.getElementById('postDetailExtraStats');
    if (!screen || !contentBox) return;

    currentDetailPost = post;

    // Monta o post completo (mesmo card do feed, sem truncar nada)
    contentBox.innerHTML = '';
    contentBox.appendChild(buildPostCard(post, avatarUrl));

    // Monta a linha com todas as estatísticas do post
    if (statsBox) {
        statsBox.innerHTML = `
            <span><b>${post.replies_count || 0}</b>Respostas</span>
            <span><b>${post.reposts_count || 0}</b>Reposts</span>
            <span><b>${post.likes_count || 0}</b>Curtidas</span>
            <span><b>${post.views_count || 0}</b>Visualizações</span>
        `;
    }

    // Reseta o composer de resposta (avatar, texto, anexos e contador)
    const replyInput = document.getElementById('replyInput');
    if (replyInput) replyInput.value = '';
    clearAllReplyAttachments();
    const replyAvatarImg = document.getElementById('replyComposerAvatarImg');
    if (replyAvatarImg) {
        if (avatarUrl) {
            replyAvatarImg.src = avatarUrl;
            replyAvatarImg.style.display = 'block';
        } else {
            replyAvatarImg.style.display = 'none';
        }
    }
    updateReplyCharCount();

    // Esconde as demais telas e mostra a de detalhe (mesma dinâmica da config de tags)
    const defaultProfileScreen = document.getElementById('defaultProfileScreen');
    const tagConfigScreen = document.getElementById('tagConfigScreen');
    const exploreScreen = document.getElementById('exploreScreen');
    if (defaultProfileScreen) defaultProfileScreen.style.display = 'none';
    if (tagConfigScreen) tagConfigScreen.style.display = 'none';
    if (exploreScreen) exploreScreen.style.display = 'none';
    screen.style.display = 'block';

    if (window.lucide) window.lucide.createIcons();

    loadReplies(post.id);
}

// ============ Fecha a tela de detalhe e volta para o perfil ============
function closePostDetail() {
    const screen = document.getElementById('postDetailScreen');
    const defaultProfileScreen = document.getElementById('defaultProfileScreen');
    if (screen) screen.style.display = 'none';
    if (defaultProfileScreen) defaultProfileScreen.style.display = 'block';

    // Retorna o destaque do menu lateral para "Home"
    document.querySelectorAll('.nav li').forEach(nav => {
        nav.classList.toggle('active', nav.dataset.nav === 'home');
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============ Contador de caracteres do composer de resposta ============
function updateReplyCharCount() {
    const input = document.getElementById('replyInput');
    const counter = document.getElementById('replyCharCount');
    const submitBtn = document.getElementById('replySubmitBtn');
    if (!input) return;

    const len = input.value.length;
    if (counter) counter.textContent = `${len}/280`;

    const hasAttachment = !!pendingReplyAttachment.imageFile || !!pendingReplyAttachment.spotifyTrackId;
    if (submitBtn) submitBtn.disabled = len === 0 && !hasAttachment;
}

// ============ Atualiza o contador de respostas em todos os cards visíveis do post ============
function updateReplyCountEverywhere(postId, newCount) {
    const statsBox = document.getElementById('postDetailExtraStats');
    if (statsBox) {
        const firstStat = statsBox.querySelector('span b');
        if (firstStat) firstStat.textContent = newCount;
    }

    document.querySelectorAll(`.post-card[data-post-id="${postId}"] .action.reply span`).forEach(span => {
        span.textContent = String(newCount);
    });
}

// ============ Publica uma resposta ao post aberto ============
async function submitReply(profileId) {
    const input = document.getElementById('replyInput');
    const submitBtn = document.getElementById('replySubmitBtn');
    if (!input || !currentDetailPost) return;

    const content = input.value.trim();
    const hasImage = !!pendingReplyAttachment.imageFile;
    const hasSpotify = !!pendingReplyAttachment.spotifyTrackId;

    // Permite responder com apenas uma imagem e/ou música, sem texto
    if (!content && !hasImage && !hasSpotify) return;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Respondendo...';
    }

    let imageUrl = null;
    if (hasImage) {
        imageUrl = await uploadReplyImage(pendingReplyAttachment.imageFile, profileId);
        // Se o upload falhar, não bloqueia a resposta (segue sem imagem), aviso já foi mostrado em uploadReplyImage
    }

    const payload = {
        post_id: currentDetailPost.id,
        profile_id: profileId,
        content,
        author_name: AUTHOR_NAME,
        author_handle: AUTHOR_HANDLE,
        avatar_url: getAvatarUrl() || null
    };
    if (imageUrl) payload.image_url = imageUrl;
    if (hasSpotify) payload.spotify_track_id = pendingReplyAttachment.spotifyTrackId;

    const { data, error } = await supabase
        .from('replies')
        .insert(payload)
        .select()
        .single();

    if (submitBtn) submitBtn.textContent = 'Responder';

    if (error) {
        logSupabaseError('submitReply', error);
        alert(
            `Erro ao publicar a resposta: ${error.message}\n` +
            'Confira se a tabela "replies" existe e possui as colunas "image_url" e "spotify_track_id".'
        );
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // Remove a mensagem de "sem respostas" se ainda estiver visível
    const emptyMsg = document.getElementById('emptyRepliesMsg');
    if (emptyMsg) emptyMsg.remove();

    const repliesList = document.getElementById('repliesList');
    if (repliesList) repliesList.appendChild(buildReplyCard(data));

    // Atualiza o contador de respostas (localmente, já que o banco também atualiza via trigger)
    currentDetailPost.replies_count = (currentDetailPost.replies_count || 0) + 1;
    updateReplyCountEverywhere(currentDetailPost.id, currentDetailPost.replies_count);

    input.value = '';
    clearAllReplyAttachments();
    updateReplyCharCount();

    if (window.lucide) window.lucide.createIcons();
}

// ============ Liga os eventos do composer de resposta ============
function setupReplyComposer(profileId) {
    const input = document.getElementById('replyInput');
    const submitBtn = document.getElementById('replySubmitBtn');
    if (!input || !submitBtn) return;

    input.addEventListener('input', updateReplyCharCount);
    input.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            submitReply(profileId);
        }
    });

    submitBtn.addEventListener('click', () => submitReply(profileId));

    setupReplyImageAttachmentButton();
    setupReplySpotifyAttachmentButton();
    setupReplyEmojiButton();
}

// ============ Preview de anexos no composer de resposta (imagem / música) ============
function renderReplyAttachmentsPreview() {
    const container = document.getElementById('replyComposerAttachments');
    if (!container) return;
    container.innerHTML = '';

    if (pendingReplyAttachment.imagePreviewUrl) {
        const box = document.createElement('div');
        box.className = 'attachment-preview image-preview';
        box.innerHTML = `
            <img src="${pendingReplyAttachment.imagePreviewUrl}" alt="Pré-visualização da imagem">
            <button type="button" class="attachment-remove-btn" title="Remover imagem">
                <i data-lucide="x"></i>
            </button>
        `;
        box.querySelector('.attachment-remove-btn').addEventListener('click', () => {
            removeReplyImageAttachment();
        });
        container.appendChild(box);
    }

    if (pendingReplyAttachment.spotifyTrackId) {
        const box = document.createElement('div');
        box.className = 'attachment-preview spotify-preview';
        box.innerHTML = `
            <div class="spotify-preview-icon"><i data-lucide="music"></i></div>
            <span class="spotify-preview-text">Música do Spotify anexada</span>
            <button type="button" class="attachment-remove-btn" title="Remover música">
                <i data-lucide="x"></i>
            </button>
        `;
        box.querySelector('.attachment-remove-btn').addEventListener('click', () => {
            pendingReplyAttachment.spotifyTrackId = null;
            renderReplyAttachmentsPreview();
            updateReplyCharCount();
        });
        container.appendChild(box);
    }

    if (window.lucide) window.lucide.createIcons();
}

function removeReplyImageAttachment() {
    if (pendingReplyAttachment.imagePreviewUrl) {
        URL.revokeObjectURL(pendingReplyAttachment.imagePreviewUrl);
    }
    pendingReplyAttachment.imageFile = null;
    pendingReplyAttachment.imagePreviewUrl = null;

    const replyPhotoInput = document.getElementById('replyPhotoInput');
    if (replyPhotoInput) replyPhotoInput.value = '';

    renderReplyAttachmentsPreview();
    updateReplyCharCount();
}

function clearAllReplyAttachments() {
    removeReplyImageAttachment();
    pendingReplyAttachment.spotifyTrackId = null;
    renderReplyAttachmentsPreview();
}

// ============ Faz upload da imagem anexada à resposta para o Supabase Storage ============
async function uploadReplyImage(file, profileId) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${profileId}/replies/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, file);

    if (uploadError) {
        logSupabaseError('uploadReplyImage', uploadError);
        alert(
            `Erro ao enviar a imagem da resposta: ${uploadError.message}\n` +
            `Verifique se o bucket "posts" existe no Supabase Storage e se há uma Policy de INSERT liberada para o role "anon".`
        );
        return null;
    }

    const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(fileName);
    return publicUrlData?.publicUrl || null;
}

// ============ Botão de imagem da resposta: abre o seletor de arquivo e monta a preview ============
function setupReplyImageAttachmentButton() {
    const imageBtn = document.getElementById('replyImageBtn');
    const photoInput = document.getElementById('replyPhotoInput');
    if (!imageBtn || !photoInput) return;

    imageBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor selecione um arquivo de imagem (JPG, PNG, etc).');
            photoInput.value = '';
            return;
        }

        // Limite de 8MB para evitar uploads muito pesados
        if (file.size > 8 * 1024 * 1024) {
            alert('A imagem é muito grande. Escolha um arquivo de até 8MB.');
            photoInput.value = '';
            return;
        }

        if (pendingReplyAttachment.imagePreviewUrl) {
            URL.revokeObjectURL(pendingReplyAttachment.imagePreviewUrl);
        }

        pendingReplyAttachment.imageFile = file;
        pendingReplyAttachment.imagePreviewUrl = URL.createObjectURL(file);

        renderReplyAttachmentsPreview();
        updateReplyCharCount();
    });
}

// ============ Botão de música da resposta: pede o link do Spotify e anexa ============
function setupReplySpotifyAttachmentButton() {
    const musicBtn = document.getElementById('replyMusicBtn');
    if (!musicBtn) return;

    musicBtn.addEventListener('click', () => {
        const value = prompt('Cole o link (ou URI) da música do Spotify que deseja anexar à resposta:');
        if (!value) return;

        const trackId = extractSpotifyTrackId(value);
        if (!trackId) {
            alert('Não foi possível reconhecer esse link do Spotify. Cole um link do tipo "https://open.spotify.com/track/...".');
            return;
        }

        pendingReplyAttachment.spotifyTrackId = trackId;
        renderReplyAttachmentsPreview();
        updateReplyCharCount();
    });
}

// ============ Botão de emoji da resposta: abre o seletor simples e insere no texto ============
function setupReplyEmojiButton() {
    const emojiBtn = document.getElementById('replyEmojiBtn');
    const picker = document.getElementById('replyEmojiPicker');
    const input = document.getElementById('replyInput');
    if (!emojiBtn || !picker || !input) return;

    if (picker.childElementCount === 0) {
        EMOJI_LIST.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                insertEmojiAtCursor(input, emoji);
                picker.classList.remove('open');
            });
            picker.appendChild(btn);
        });
    }

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (picker.classList.contains('open') && !picker.contains(e.target) && e.target !== emojiBtn) {
            picker.classList.remove('open');
        }
    });
}

// ============ Monta o HTML de uma resposta ============
function buildReplyCard(reply) {
    const article = document.createElement('article');
    article.className = 'reply-card';

    const authorName = reply.author_name || AUTHOR_NAME;
    const authorHandle = reply.author_handle || AUTHOR_HANDLE;
    const replyAvatarUrl = reply.avatar_url || '';
    const initial = authorName.trim().charAt(0).toUpperCase() || '?';

    article.innerHTML = `
        <div class="reply-card-avatar">
            ${replyAvatarUrl ? `<img src="${replyAvatarUrl}" alt="Avatar">` : initial}
        </div>
        <div class="reply-card-body">
            <div class="reply-card-header">
                <span class="reply-card-name">${escapeHtml(authorName)}</span>
                <span class="reply-card-handle">@${escapeHtml(authorHandle)}</span>
                <span class="reply-card-dot">·</span>
                <span class="reply-card-time">${timeAgo(reply.created_at)}</span>
            </div>
            <div class="reply-card-text">${escapeHtml(reply.content || '')}</div>
            ${reply.image_url ? `
            <div class="post-card-image">
                <img src="${reply.image_url}" alt="Imagem da resposta" loading="lazy">
            </div>` : ''}
            ${reply.spotify_track_id ? `
            <div class="post-card-spotify">
                <iframe src="https://open.spotify.com/embed/track/${reply.spotify_track_id}?utm_source=generator&theme=0"
                    width="100%" height="80" frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"></iframe>
            </div>` : ''}
        </div>
    `;

    return article;
}

// ============ Carrega as respostas de um post específico ============
async function loadReplies(postId) {
    const repliesList = document.getElementById('repliesList');
    if (!repliesList) return;

    // Estado inicial: mostra a mensagem de "sem respostas" enquanto carrega
    repliesList.innerHTML = '<p class="empty-state" id="emptyRepliesMsg">Ainda não há respostas para este post.</p>';

    const { data, error } = await supabase
        .from('replies')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (error) {
        // Se a tabela "replies" ainda não existir no banco, trata normalmente como "sem respostas"
        logSupabaseError('loadReplies', error);
        return;
    }

    if (!data || data.length === 0) return;

    repliesList.innerHTML = '';
    data.forEach(reply => {
        repliesList.appendChild(buildReplyCard(reply));
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============ Preview de anexos no composer (imagem / música) ============
function renderAttachmentsPreview() {
    const container = document.getElementById('composerAttachments');
    if (!container) return;
    container.innerHTML = '';

    if (pendingAttachment.imagePreviewUrl) {
        const box = document.createElement('div');
        box.className = 'attachment-preview image-preview';
        box.innerHTML = `
            <img src="${pendingAttachment.imagePreviewUrl}" alt="Pré-visualização da imagem">
            <button type="button" class="attachment-remove-btn" title="Remover imagem">
                <i data-lucide="x"></i>
            </button>
        `;
        box.querySelector('.attachment-remove-btn').addEventListener('click', () => {
            removeImageAttachment();
        });
        container.appendChild(box);
    }

    if (pendingAttachment.spotifyTrackId) {
        const box = document.createElement('div');
        box.className = 'attachment-preview spotify-preview';
        box.innerHTML = `
            <div class="spotify-preview-icon"><i data-lucide="music"></i></div>
            <span class="spotify-preview-text">Música do Spotify anexada</span>
            <button type="button" class="attachment-remove-btn" title="Remover música">
                <i data-lucide="x"></i>
            </button>
        `;
        box.querySelector('.attachment-remove-btn').addEventListener('click', () => {
            pendingAttachment.spotifyTrackId = null;
            renderAttachmentsPreview();
            updateCharCount();
        });
        container.appendChild(box);
    }

    if (window.lucide) window.lucide.createIcons();
}

function removeImageAttachment() {
    if (pendingAttachment.imagePreviewUrl) {
        URL.revokeObjectURL(pendingAttachment.imagePreviewUrl);
    }
    pendingAttachment.imageFile = null;
    pendingAttachment.imagePreviewUrl = null;

    const photoInput = document.getElementById('photoInput');
    if (photoInput) photoInput.value = '';

    renderAttachmentsPreview();
    updateCharCount();
}

function clearAllAttachments() {
    removeImageAttachment();
    pendingAttachment.spotifyTrackId = null;
    renderAttachmentsPreview();
}

// ============ Faz upload da imagem anexada para o Supabase Storage ============
async function uploadPostImage(file, profileId) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${profileId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, file);

    if (uploadError) {
        logSupabaseError('uploadPostImage', uploadError);
        alert(
            `Erro ao enviar a imagem: ${uploadError.message}\n` +
            `Verifique se o bucket "posts" existe no Supabase Storage e se há uma Policy de INSERT liberada para o role "anon".`
        );
        return null;
    }

    const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(fileName);
    return publicUrlData?.publicUrl || null;
}

// ============ Atualiza o contador "Posts" no topo do perfil ============
function updatePostsStat(count) {
    const statsSpans = document.querySelectorAll('.stats span');
    statsSpans.forEach(span => {
        if (span.textContent.trim().endsWith('Posts')) {
            const b = span.querySelector('b');
            if (b) b.textContent = `${count} `;
        }
    });
}

// ============ Carrega os posts salvos e desenha o feed ============
async function loadPosts(profileId) {
    const postsList = document.getElementById('postsList');
    const emptyMsg = document.getElementById('emptyPostsMsg');

    if (!postsList) return;

    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

    if (error) {
        logSupabaseError('loadPosts', error);
        return;
    }

    if (!data || data.length === 0) {
        updatePostsStat(0);
        return; // Mantém a mensagem de "sem posts" que já está no HTML
    }

    if (emptyMsg) emptyMsg.remove();

    // Obtém a imagem do avatar mais recente na hora de renderizar a lista
    const currentAvatarUrl = getAvatarUrl();

    data.forEach(post => {
        postsList.appendChild(buildPostCard(post, currentAvatarUrl));
    });

    updatePostsStat(data.length);

    if (window.lucide) window.lucide.createIcons();
}

// ============ Publica um novo post ============
async function publishPost(profileId) {
    const input = document.getElementById('postInput');
    const submitBtn = document.getElementById('postSubmitBtn');
    const postsList = document.getElementById('postsList');
    const emptyMsg = document.getElementById('emptyPostsMsg');

    if (!input) return;
    const content = input.value.trim();
    const hasImage = !!pendingAttachment.imageFile;
    const hasSpotify = !!pendingAttachment.spotifyTrackId;

    // Permite postar com apenas uma imagem e/ou música, sem texto
    if (!content && !hasImage && !hasSpotify) return;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publicando...';
    }

    let imageUrl = null;
    if (hasImage) {
        imageUrl = await uploadPostImage(pendingAttachment.imageFile, profileId);
        // Se o upload falhar, não bloqueia o post (segue sem imagem) mas avisa o usuário (já feito em uploadPostImage)
    }

    const payload = { profile_id: profileId, content };
    if (imageUrl) payload.image_url = imageUrl;
    if (hasSpotify) payload.spotify_track_id = pendingAttachment.spotifyTrackId;

    const { data, error } = await supabase
        .from('posts')
        .insert(payload)
        .select()
        .single();

    if (submitBtn) submitBtn.textContent = 'Postar';

    if (error) {
        logSupabaseError('publishPost', error);
        alert(
            `Erro ao publicar o post: ${error.message}\n` +
            (hasImage || hasSpotify
                ? 'Se o erro mencionar uma coluna inexistente, é preciso adicionar "image_url" e/ou "spotify_track_id" na tabela "posts".'
                : '')
        );
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // Some com a mensagem de "sem posts" e mostra a postagem no lugar
    if (emptyMsg) emptyMsg.remove();

    // Usa a URL do avatar no momento exato em que o novo post é adicionado
    postsList.insertBefore(buildPostCard(data, getAvatarUrl()), postsList.firstChild);
    if (window.lucide) window.lucide.createIcons();

    updatePostsStat(postsList.querySelectorAll('.post-card').length);

    input.value = '';
    clearAllAttachments();
    updateCharCount();
}

// ============ Contador de caracteres + habilita/desabilita o botão Postar ============
function updateCharCount() {
    const input = document.getElementById('postInput');
    const counter = document.getElementById('charCount');
    const submitBtn = document.getElementById('postSubmitBtn');
    if (!input) return;

    const len = input.value.length;
    if (counter) counter.textContent = `${len}/500`;

    const hasAttachment = !!pendingAttachment.imageFile || !!pendingAttachment.spotifyTrackId;
    if (submitBtn) submitBtn.disabled = len === 0 && !hasAttachment;
}

// ============ Botão de imagem: abre o seletor de arquivo e monta a preview ============
function setupImageAttachmentButton() {
    const imageBtn = document.getElementById('imageBtn');
    const photoInput = document.getElementById('photoInput');
    if (!imageBtn || !photoInput) return;

    imageBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor selecione um arquivo de imagem (JPG, PNG, etc).');
            photoInput.value = '';
            return;
        }

        // Limite de 8MB para evitar uploads muito pesados
        if (file.size > 8 * 1024 * 1024) {
            alert('A imagem é muito grande. Escolha um arquivo de até 8MB.');
            photoInput.value = '';
            return;
        }

        if (pendingAttachment.imagePreviewUrl) {
            URL.revokeObjectURL(pendingAttachment.imagePreviewUrl);
        }

        pendingAttachment.imageFile = file;
        pendingAttachment.imagePreviewUrl = URL.createObjectURL(file);

        renderAttachmentsPreview();
        updateCharCount();
    });
}

// ============ Link do Spotify e anexa ao post ============
function setupSpotifyAttachmentButton() {
    const musicBtn = document.getElementById('musicBtn');
    if (!musicBtn) return;

    musicBtn.addEventListener('click', () => {
        const value = prompt('Cole o link (ou URI) da música do Spotify que deseja anexar ao post:');
        if (!value) return;

        const trackId = extractSpotifyTrackId(value);
        if (!trackId) {
            alert('Não foi possível reconhecer esse link do Spotify. Cole um link do tipo "https://open.spotify.com/track/...".');
            return;
        }

        pendingAttachment.spotifyTrackId = trackId;
        renderAttachmentsPreview();
        updateCharCount();
    });
}

// ============ Seletor simples e insere no texto ============
function setupEmojiButton() {
    const emojiBtn = document.getElementById('emojiBtn');
    const picker = document.getElementById('emojiPicker');
    const input = document.getElementById('postInput');
    if (!emojiBtn || !picker || !input) return;

    if (picker.childElementCount === 0) {
        EMOJI_LIST.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                insertEmojiAtCursor(input, emoji);
                picker.classList.remove('open');
            });
            picker.appendChild(btn);
        });
    }

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (picker.classList.contains('open') && !picker.contains(e.target) && e.target !== emojiBtn) {
            picker.classList.remove('open');
        }
    });
}

function insertEmojiAtCursor(input, emoji) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    const newPos = start + emoji.length;
    input.setSelectionRange(newPos, newPos);

    updateCharCount();
}

// ============ Inicialização ============
export function initPosts(profileId) {
    const input = document.getElementById('postInput');
    const submitBtn = document.getElementById('postSubmitBtn');

    if (input) {
        input.addEventListener('input', updateCharCount);
        input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                publishPost(profileId);
            }
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', () => publishPost(profileId));
    }

    setupImageAttachmentButton();
    setupSpotifyAttachmentButton();
    setupEmojiButton();

    const backFromPostDetailBtn = document.getElementById('backFromPostDetailBtn');
    if (backFromPostDetailBtn) {
        backFromPostDetailBtn.addEventListener('click', closePostDetail);
    }

    setupReplyComposer(profileId);

    loadPosts(profileId);
}