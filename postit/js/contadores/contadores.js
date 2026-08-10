// ============ Lucide Icons ============
export function initIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ============ Follow Button ============
export function setupFollowButton(buttonId = 'followBtn') {
    const followBtn = document.getElementById(buttonId);
    if (!followBtn) return;

    followBtn.addEventListener('click', () => {
        followBtn.classList.toggle('following');
        followBtn.textContent = followBtn.classList.contains('following') ? 'Seguindo' : 'Seguir';
    });
    
    return followBtn;
}

// ============ Tabs ============
export function setupTabs(tabSelector = '.tab', contentId = 'tabContent') {
    const tabs = document.querySelectorAll(tabSelector);
    const tabContent = document.getElementById(contentId);
    
    const tabTexts = {
        principal: 'Ainda não há posts na aba Principal.',
        artigue: 'Nenhum artigo publicado ainda.',
        professional: 'Nenhuma experiência profissional adicionada ainda.'
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tabContent) {
                tabContent.textContent = tabTexts[tab.dataset.tab] || '';
            }
        });
    });

    return { tabs, tabContent };
}

// ============ Dynamic Tags & Links ============
export function setupAddTag(btnId = 'addTag', containerId = 'tagRow') {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('click', () => {
        const value = prompt('Nova tag:');
        if (value && value.trim()) {
            const pill = document.createElement('span');
            pill.className = 'pill';
            pill.textContent = value.trim();
            document.getElementById(containerId)?.insertBefore(pill, btn);
        }
    });
}

export function setupAddLink(btnId = 'addLink', containerId = 'linkRow') {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('click', () => {
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
            document.getElementById(containerId)?.insertBefore(circle, btn);
        }
    });
}

// ============ Audio Waveform ============
export function renderWaveform(containerId = 'waveform', barsCount = 12) {
    const waveform = document.getElementById(containerId);
    if (!waveform) return;

    waveform.innerHTML = ''; // Limpa barras existentes caso seja re-renderizado
    for (let i = 0; i < barsCount; i++) {
        const bar = document.createElement('span');
        bar.style.animationDelay = (i * 0.06) + 's';
        bar.style.height = (4 + Math.random() * 16) + 'px';
        waveform.appendChild(bar);
    }
}

// ============ Image Upload Helper ============
export function setupImageUpload(containerId, inputId, imgId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);

    if (!container || !input || !img) return;

    container.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor selecione um arquivo de imagem.');
            return;
        }

        const url = URL.createObjectURL(file);
        img.src = url;
        img.style.display = 'block';
        container.classList.add('has-image');
    });
}

// ============ Main Initializer ============
// Função conveniente para inicializar tudo de uma vez no seu arquivo principal
export function initAll() {
    initIcons();
    setupFollowButton();
    setupTabs();
    setupAddTag();
    setupAddLink();
    renderWaveform();
    setupImageUpload('coverUpload', 'coverInput', 'coverImg');
    setupImageUpload('avatarUpload', 'avatarInput', 'avatarImg');
}