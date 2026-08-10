

// Estrutura do Estado Inicial
const defaultSettings = {
  theme: 'light',       // 'light' | 'dark'
  fontSize: 16,         // 13 a 20 (em px)
  highContrast: false   // true | false
};

let currentSettings = { ...defaultSettings };

// Elementos DOM
const themeLightBtn = document.getElementById('themeLightBtn');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontValueBadge = document.getElementById('fontValueBadge');
const fontPreviewBox = document.getElementById('fontPreviewBox');
const highContrastToggle = document.getElementById('highContrastToggle');

// ======= 1. INICIALIZAÇÃO =======
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // Carrega do LocalStorage primeiro (para resposta instantânea)
  loadLocalSettings();
  
  // Aplica na UI
  applySettingsToDOM(currentSettings);
  updateUIControls(currentSettings);

  // Opcional: Carrega as configurações remotas do Supabase (se o usuário estiver logado)
  // await loadSettingsFromSupabase();
});

// ======= 2. APLICAÇÃO DE CONFIGURAÇÕES NA TELA =======
function applySettingsToDOM(settings) {
  const root = document.documentElement;

  // Tema
  root.setAttribute('data-theme', settings.theme);

  // Tamanho da Fonte
  root.style.setProperty('--base-font-size', `${settings.fontSize}px`);
  if (fontPreviewBox) {
    fontPreviewBox.style.fontSize = `${settings.fontSize}px`;
  }

  // Alto Contraste
  if (settings.highContrast) {
    root.setAttribute('data-contrast', 'high');
  } else {
    root.removeAttribute('data-contrast');
  }
}

// Atualiza o estado dos botões/inputs para refletir a config atual
function updateUIControls(settings) {
  // Botoes de Tema
  if (settings.theme === 'dark') {
    themeDarkBtn.classList.add('active');
    themeLightBtn.classList.remove('active');
  } else {
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  }

  // Slider de fonte
  if (fontSizeSlider) fontSizeSlider.value = settings.fontSize;
  if (fontValueBadge) fontValueBadge.textContent = `${settings.fontSize}px`;

  // Toggle Alto Contraste
  if (highContrastToggle) highContrastToggle.checked = settings.highContrast;
}

// ======= 3. EVENT LISTENERS =======

// Troca de Tema
[themeLightBtn, themeDarkBtn].forEach(btn => {
  btn?.addEventListener('click', () => {
    const selectedTheme = btn.getAttribute('data-theme-val');
    currentSettings.theme = selectedTheme;
    
    applySettingsToDOM(currentSettings);
    updateUIControls(currentSettings);
    saveSettings(currentSettings);
  });
});

// Ajuste Dinâmico de Fonte (Real-time Preview)
fontSizeSlider?.addEventListener('input', (e) => {
  const newSize = parseInt(e.target.value, 10);
  currentSettings.fontSize = newSize;

  applySettingsToDOM(currentSettings);
  if (fontValueBadge) fontValueBadge.textContent = `${newSize}px`;
});

// Ao soltar o slider de fonte, persiste no banco
fontSizeSlider?.addEventListener('change', () => {
  saveSettings(currentSettings);
});

// Toggle de Alto Contraste
highContrastToggle?.addEventListener('change', (e) => {
  currentSettings.highContrast = e.target.checked;

  applySettingsToDOM(currentSettings);
  saveSettings(currentSettings);
});

// ======= 4. SALVAMENTO E SINCRONIZAÇÃO =======

function loadLocalSettings() {
  const saved = localStorage.getItem('postit_user_settings');
  if (saved) {
    try {
      currentSettings = { ...defaultSettings, ...JSON.parse(saved) };
    } catch (err) {
      console.error('Erro ao ler settings locais:', err);
    }
  }
}

function saveSettings(settings) {
  // 1. Salva no LocalStorage
  localStorage.setItem('postit_user_settings', JSON.stringify(settings));

  // 2. Debounce/Enviar para o Supabase
  saveSettingsToSupabase(settings);
}

/* ==========================================================================
   INTEGRAÇÃO SUPABASE (HOOKS)
   ========================================================================== */

/**
 * Envia as configurações atualizadas para a tabela do Supabase.
 * Certifique-se de importar seu cliente Supabase aqui quando disponível.
 */
async function saveSettingsToSupabase(settings) {
  try {
    // Exemplo de integração com Supabase:
    /*
    const user = supabase.auth.user();
    if (!user) return;

    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        theme: settings.theme,
        font_size: settings.fontSize,
        high_contrast: settings.highContrast,
        updated_at: new Date()
      });

    if (error) throw error;
    */
    console.log('Configs salvas para persistência no Supabase:', settings);
  } catch (error) {
    console.error('Erro ao salvar no Supabase:', error);
  }
}

/**
 * Busca as configurações salvas no Supabase ao logar.
 */
async function loadSettingsFromSupabase() {
  try {
    /*
    const user = supabase.auth.user();
    if (!user) return;

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id')
      .single();

    if (data) {
      currentSettings = {
        theme: data.theme,
        fontSize: data.font_size,
        highContrast: data.high_contrast
      };
      applySettingsToDOM(currentSettings);
      updateUIControls(currentSettings);
      localStorage.setItem('postit_user_settings', JSON.stringify(currentSettings));
    }
    */
  } catch (error) {
    console.warn('Configurações remotas não encontradas, usando cache local.');
  }
}