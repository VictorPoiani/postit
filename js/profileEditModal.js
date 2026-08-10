import { supabase } from './supabase.js';

function logSupabaseError(context, error) {
    console.error(`[Supabase] Erro em "${context}":`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
    });
}

// ============ Inicializa o modal de edição de perfil ============
export function initProfileEditModal(profileId) {
    const editBtn = document.getElementById('editProfileBtn');
    const overlay = document.getElementById('editProfileOverlay');
    const closeBtn = document.getElementById('closeEditProfileBtn');
    const cancelBtn = document.getElementById('cancelEditProfileBtn');
    const saveBtn = document.getElementById('saveEditProfileBtn');

    if (!editBtn || !overlay) return;

    const inputDisplayName = document.getElementById('inputDisplayName');
    const inputNickname = document.getElementById('inputNickname');
    const inputBirthday = document.getElementById('inputBirthday');
    const inputLocation = document.getElementById('inputLocation');
    const inputBio = document.getElementById('inputBio');

    const countDisplayName = document.getElementById('countDisplayName');
    const countNickname = document.getElementById('countNickname');
    const countBio = document.getElementById('countBio');

    const colorSwatches = document.querySelectorAll('.color-swatch');
    let selectedColor = null;

    // Elementos exibidos na tela principal do perfil
    const displayNameText = document.getElementById('displayNameText');
    const nicknameText = document.getElementById('nicknameText');
    const locationText = document.getElementById('locationText');
    const birthdayRow = document.getElementById('birthdayRow');
    const birthdayText = document.getElementById('birthdayText');
    const bioText = document.getElementById('bioText');

    function updateCounter(input, counterEl) {
        if (!input || !counterEl) return;
        counterEl.textContent = String(input.value.length);
    }

    function formatBirthday(isoDate) {
        if (!isoDate) return '';
        const [year, month, day] = isoDate.split('-');
        if (!year || !month || !day) return '';
        return `${day}/${month}/${year}`;
    }

    function selectColor(color, { silent } = {}) {
        selectedColor = color;
        colorSwatches.forEach(sw => {
            sw.classList.toggle('selected', sw.dataset.color.toLowerCase() === (color || '').toLowerCase());
        });
    }

    // ---- Preenche o modal com os dados atuais antes de abrir ----
    function fillModalWithCurrentData() {
        inputDisplayName.value = (displayNameText?.textContent || '').trim();
        inputNickname.value = (nicknameText?.textContent || '').replace(/\.$/, '').trim();
        inputLocation.value = (locationText?.textContent || '').trim();
        inputBio.value = (bioText?.textContent || '').trim();
        inputBirthday.value = inputBirthday.dataset.iso || '';

        const currentColor = nicknameText?.style.color
            ? rgbToHex(nicknameText.style.color)
            : null;
        selectColor(currentColor);

        updateCounter(inputDisplayName, countDisplayName);
        updateCounter(inputNickname, countNickname);
        updateCounter(inputBio, countBio);
    }

    function rgbToHex(rgb) {
        const match = rgb.match(/\d+/g);
        if (!match) return null;
        const [r, g, b] = match.map(Number);
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function openModal() {
        fillModalWithCurrentData();
        overlay.classList.add('open');
        if (window.lucide) window.lucide.createIcons();
    }

    function closeModal() {
        overlay.classList.remove('open');
    }

    editBtn.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });

    inputDisplayName?.addEventListener('input', () => updateCounter(inputDisplayName, countDisplayName));
    inputNickname?.addEventListener('input', () => updateCounter(inputNickname, countNickname));
    inputBio?.addEventListener('input', () => updateCounter(inputBio, countBio));

    colorSwatches.forEach(sw => {
        sw.addEventListener('click', () => selectColor(sw.dataset.color));
    });

    // ---- Salva as alterações: atualiza a tela e persiste no Supabase ----
    saveBtn?.addEventListener('click', async () => {
        const newDisplayName = inputDisplayName.value.trim();
        const newNickname = inputNickname.value.trim();
        const newLocation = inputLocation.value.trim();
        const newBio = inputBio.value.trim();
        const newBirthdayIso = inputBirthday.value;
        const newColor = selectedColor;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        // Atualiza a interface imediatamente (feedback otimista)
        if (newDisplayName && displayNameText) displayNameText.textContent = newDisplayName;

        if (nicknameText) {
            nicknameText.textContent = newNickname || '';
            if (newColor) nicknameText.style.color = newColor;
        }

        if (newLocation && locationText) locationText.textContent = newLocation;

        if (newBirthdayIso && birthdayText && birthdayRow) {
            birthdayText.textContent = formatBirthday(newBirthdayIso);
            birthdayRow.style.display = 'flex';
            inputBirthday.dataset.iso = newBirthdayIso;
        }

        if (bioText) bioText.textContent = newBio;

        if (window.lucide) window.lucide.createIcons();

        // Persiste no Supabase (tabela "profiles")
        const { data, error } = await supabase
            .from('profiles')
            .update({
                display_name: newDisplayName,
                nickname: newNickname,
                nickname_color: newColor,
                birthday: newBirthdayIso || null,
                location: newLocation,
                bio: newBio
            })
            .eq('id', profileId)
            .select();

        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar alterações';

        if (error) {
            logSupabaseError('saveProfileEdit', error);
            alert(
                `As alterações foram exibidas na tela, mas não foi possível salvá-las no banco de dados: ${error.message}\n` +
                `Confira se as colunas (display_name, nickname, nickname_color, birthday, location, bio) existem na tabela "profiles".`
            );
            closeModal();
            return;
        }

        if (!data || data.length === 0) {
            console.warn('[saveProfileEdit] 0 linhas atualizadas. Confira se o ID existe na tabela "profiles".');
        } else {
            console.log('[saveProfileEdit] Perfil salvo com sucesso:', data);
        }

        closeModal();
    });
}

// ============ Carrega dados salvos do perfil (nome, alcunha, cor, aniversário, localização, bio) ============
export async function loadProfileEditableData(profileId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('display_name, nickname, nickname_color, birthday, location, bio')
        .eq('id', profileId)
        .single();

    if (error) {
        // Colunas podem ainda não existir no banco; não incomoda o usuário por isso.
        console.warn('[loadProfileEditableData] Não foi possível carregar os dados de edição do perfil:', error.message);
        return;
    }

    const displayNameText = document.getElementById('displayNameText');
    const nicknameText = document.getElementById('nicknameText');
    const locationText = document.getElementById('locationText');
    const birthdayRow = document.getElementById('birthdayRow');
    const birthdayText = document.getElementById('birthdayText');
    const bioText = document.getElementById('bioText');
    const inputBirthday = document.getElementById('inputBirthday');

    if (data?.display_name && displayNameText) displayNameText.textContent = data.display_name;
    if (data?.nickname && nicknameText) nicknameText.textContent = data.nickname;
    if (data?.nickname_color && nicknameText) nicknameText.style.color = data.nickname_color;
    if (data?.location && locationText) locationText.textContent = data.location;
    if (data?.bio && bioText) bioText.textContent = data.bio;

    if (data?.birthday && birthdayText && birthdayRow) {
        const [year, month, day] = String(data.birthday).split('-');
        if (year && month && day) {
            birthdayText.textContent = `${day}/${month}/${year}`;
            birthdayRow.style.display = 'flex';
        }
        if (inputBirthday) inputBirthday.dataset.iso = data.birthday;
    }

    console.log('[loadProfileEditableData] Dados de edição do perfil carregados:', data);
}