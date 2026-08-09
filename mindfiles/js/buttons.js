import { supabase } from './supabase.js';
import { CURRENT_PROFILE_ID } from './config.js'; // Importa o ID real para salvar os dados

// ============ Follow button toggle ============
export const followBtn = document.getElementById('followBtn');
if (followBtn) {
    followBtn.addEventListener('click', () => {
        followBtn.classList.toggle('following');
        followBtn.textContent = followBtn.classList.contains('following') ? 'Seguindo' : 'Seguir';
    });
}

// ============ Tabs ============
// Cada aba agora é um painel próprio dentro de #tabContent (data-panel).
// A aba "Principal" contém o composer + feed de posts; as outras seguem
// mostrando um texto simples de "em breve".
export const tabs = document.querySelectorAll('.tab');
export const tabPanels = document.querySelectorAll('.tab-panel');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
        });
    });
});

// ============ Helper genérico para logar erro completo do Supabase ============
function logSupabaseError(context, error) {
    console.error(`[Supabase] Erro em "${context}":`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
    });
}

// ============ Helper para salvar tags no Supabase ============
async function saveTagsToDatabase(userId) {
    const pillElements = document.querySelectorAll('#tagRow .pill');
    const tagsArray = Array.from(pillElements).map(pill => pill.textContent.trim());

    const { data, error } = await supabase
        .from('profiles')
        .update({ tags: tagsArray })
        .eq('id', userId)
        .select(); // .select() é o que faz o Supabase retornar as linhas afetadas

    if (error) {
        logSupabaseError('saveTagsToDatabase', error);
        alert(`Erro ao salvar as tags: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        console.warn('[saveTagsToDatabase] 0 linhas atualizadas. Confira se o ID existe na tabela "profiles" e se a RLS não está bloqueando.');
        alert('As tags não foram salvas: nenhuma linha correspondente ao ID do perfil foi encontrada.');
        return;
    }

    console.log('[saveTagsToDatabase] Tags salvas com sucesso:', data);
}

// ============ Add tag ============
// ============ Add tag via Tela de Configuração ============
const addTagBtn = document.getElementById('addTag');
const defaultProfileScreen = document.getElementById('defaultProfileScreen');
const tagConfigScreen = document.getElementById('tagConfigScreen');
const tagOptions = document.querySelectorAll('.tag-option');
const saveTagsBtn = document.getElementById('saveTagsBtn');
const cancelTagsBtn = document.getElementById('cancelTagsBtn');

// 1. Ao clicar em '+', esconde o perfil e mostra a configuração
if (addTagBtn) {
    addTagBtn.addEventListener('click', () => {
        defaultProfileScreen.style.display = 'none';
        tagConfigScreen.style.display = 'block';
    });
}

// 2. Permite ao usuário clicar nas opções para selecioná-las
tagOptions.forEach(tag => {
    tag.addEventListener('click', () => {
        tag.classList.toggle('selected'); // Adiciona ou remove a classe 'selected'
    });
});

// 3. Botão Cancelar (voltar sem salvar)
if (cancelTagsBtn) {
    cancelTagsBtn.addEventListener('click', () => {
        // Desmarca todas as tags caso o usuário tenha clicado em alguma e cancelado
        tagOptions.forEach(t => t.classList.remove('selected'));

        tagConfigScreen.style.display = 'none';
        defaultProfileScreen.style.display = 'block';
    });
}

// 4. Botão Salvar
if (saveTagsBtn) {
    saveTagsBtn.addEventListener('click', async () => {
        // Pega apenas as tags que o usuário marcou
        const selectedTags = document.querySelectorAll('.tag-option.selected');
        const tagRow = document.getElementById('tagRow');

        if (selectedTags.length > 0) {
            selectedTags.forEach(tagEl => {
                // Cria a nova pill na tela principal
                const pill = document.createElement('span');
                pill.className = 'pill';
                pill.textContent = tagEl.textContent.trim();

                // Opcional: Copia as cores e formatos da tag configurada para manter a estética
                pill.style.cssText = tagEl.style.cssText;

                // Insere antes do botão '+'
                tagRow.insertBefore(pill, addTagBtn);

                // Desmarca a tag da tela de configuração para próximos usos
                tagEl.classList.remove('selected');
            });

            // Salva as tags no Supabase utilizando a função existente
            await saveTagsToDatabase(CURRENT_PROFILE_ID);
        }

        // Retorna para a tela principal
        tagConfigScreen.style.display = 'none';
        defaultProfileScreen.style.display = 'block';
    });
}

// ============ Helper para salvar links no Supabase ============
async function saveLinksToDatabase(userId) {
    const linkElements = document.querySelectorAll('#linkRow .social-circle');
    const linksArray = Array.from(linkElements).map(circle => circle.title);

    const { data, error } = await supabase
        .from('profiles')
        .update({ links: linksArray })
        .eq('id', userId)
        .select();

    if (error) {
        logSupabaseError('saveLinksToDatabase', error);
        alert(`Erro ao salvar os links: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        console.warn('[saveLinksToDatabase] 0 linhas atualizadas. Confira se o ID existe na tabela "profiles" e se a RLS não está bloqueando.');
        alert('Os links não foram salvos: nenhuma linha correspondente ao ID do perfil foi encontrada.');
        return;
    }

    console.log('[saveLinksToDatabase] Links salvos com sucesso:', data);
}

// ============ Add link ============
const addLinkBtn = document.getElementById('addLink');
if (addLinkBtn) {
    addLinkBtn.addEventListener('click', async () => {
        const value = prompt('Nome da nova rede/link:');
        if (value && value.trim()) {
            const circle = document.createElement('span');
            circle.className = 'social-circle';
            circle.style.background = '#374151';
            circle.style.color = '#fff';
            circle.style.fontSize = '13px';
            circle.style.fontWeight = '700';
            circle.title = value.trim();
            circle.textContent = value.trim().charAt(0).toUpperCase();
            document.getElementById('linkRow').insertBefore(circle, addLinkBtn);

            // Salva no banco de dados imediatamente
            await saveLinksToDatabase(CURRENT_PROFILE_ID);
        }
    });
}

// ============ Audio Waveform ============
const waveform = document.getElementById('waveform');
if (waveform) {
    const bars = 22;
    for (let i = 0; i < bars; i++) {
        const bar = document.createElement('span');
        bar.style.animationDelay = (i * 0.06) + 's';
        bar.style.height = (4 + Math.random() * 16) + 'px';
        waveform.appendChild(bar);
    }
}

// ============ Image upload com Supabase Storage ============
export function setupImageUpload(containerId, inputId, imgId, bucketName, columnToUpdate, profileId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);

    if (!container || !input || !img) return;

    input.addEventListener('click', (e) => e.stopPropagation());
    container.addEventListener('click', () => input.click());

    input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor selecione um arquivo de imagem (JPG, PNG, etc).');
            return;
        }

        const tempUrl = URL.createObjectURL(file);
        img.src = tempUrl;
        img.style.display = 'block';
        container.classList.add('has-image');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;

        console.log(`[setupImageUpload] Enviando "${fileName}" para o bucket "${bucketName}"...`);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(fileName, file);

        if (uploadError) {
            logSupabaseError(`upload (bucket: ${bucketName})`, uploadError);
            alert(
                `Erro no upload para o bucket "${bucketName}": ${uploadError.message}\n` +
                `Verifique no painel do Supabase: (1) se o bucket "${bucketName}" existe, ` +
                `(2) se há uma Policy de INSERT liberada para o role "anon" em Storage > Policies.`
            );
            return;
        }

        console.log('[setupImageUpload] Upload concluído:', uploadData);

        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

        const publicUrl = publicUrlData.publicUrl;
        console.log('[setupImageUpload] URL pública gerada:', publicUrl);

        if (profileId && columnToUpdate) {
            const { data: dbData, error: dbError } = await supabase
                .from('profiles')
                .update({ [columnToUpdate]: publicUrl })
                .eq('id', profileId)
                .select();

            if (dbError) {
                logSupabaseError(`update coluna ${columnToUpdate}`, dbError);
                alert(`A foto subiu, mas falhou ao salvar na coluna "${columnToUpdate}": ${dbError.message}`);
                return;
            }

            if (!dbData || dbData.length === 0) {
                console.warn(`[setupImageUpload] 0 linhas atualizadas ao salvar ${columnToUpdate}. Confira se o ID "${profileId}" existe na tabela "profiles".`);
                alert(`A foto subiu, mas nenhuma linha com o ID "${profileId}" foi encontrada na tabela "profiles" para salvar a URL.`);
                return;
            }

            console.log(`[setupImageUpload] Coluna "${columnToUpdate}" atualizada com sucesso:`, dbData);
        }
    });
}


// ============ Spotify Track Manager ============
const editSpotifyBtn = document.getElementById('editSpotifyBtn');
const spotifyPlayer = document.getElementById('spotifyPlayer');

// Helper para extrair apenas o ID da música a partir do link do Spotify
function extractSpotifyTrackId(urlOrId) {
    if (!urlOrId) return null;
    if (urlOrId.includes('open.spotify.com/track/')) {
        const parts = urlOrId.split('track/');
        return parts[1].split('?')[0]; // Pega apenas a hash/id antes dos parâmetros
    }
    return urlOrId.trim(); // Se já for o ID puro
}

if (editSpotifyBtn) {
    editSpotifyBtn.addEventListener('click', async () => {
        const input = prompt('Cole o link da música do Spotify (ex: https://open.spotify.com/track/...):');
        const trackId = extractSpotifyTrackId(input);

        if (trackId) {
            // Atualiza o iframe imediatamente na tela
            spotifyPlayer.src = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

            // Salva a nova música na tabela 'profiles' do Supabase
            const { error } = await supabase
                .from('profiles')
                .update({ spotify_track_id: trackId })
                .eq('id', CURRENT_PROFILE_ID);

            if (error) {
                console.error('Erro ao salvar música do Spotify:', error);
                alert('Falha ao salvar a música no banco de dados.');
            }
        }
    });
}