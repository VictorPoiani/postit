import { supabase } from './../supabase.js';

// Nome/handle exibidos no cabeçalho de cada atualização (mesmo autor do perfil).
const AUTHOR_NAME = 'Victor Poiani';

function logSupabaseError(context, error) {
    console.error(`[Supabase] Erro em "${context}":`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

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

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function uid() {
    return (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ============ Tipos de bloco disponíveis no menu "/" ============
const BLOCK_TYPES = [
    { type: 'paragraph', label: 'Texto', hint: 'Um parágrafo simples', icon: 'align-left' },
    { type: 'heading', label: 'Título', hint: 'Um destaque de seção', icon: 'heading' },
    { type: 'list', label: 'Lista', hint: 'Uma lista com marcadores', icon: 'list' },
    { type: 'image', label: 'Imagem', hint: 'Envie um anexo visual', icon: 'image' },
    { type: 'divider', label: 'Divisória', hint: 'Uma linha de separação', icon: 'minus' }
];

// Guarda os arquivos de imagem ainda não enviados, indexados pelo id do bloco.
const imageFilesByBlockId = new Map();

// Controla se o composer está criando uma atualização nova ou editando uma existente.
let editingUpdateId = null;
// Guardado para reaproveitar em ações que acontecem fora de initNotifications (ex: excluir).
let isAdminUser = false;

// Referência única do menu de comando "/", reaproveitada e reposicionada.
let slashMenuEl = null;
let slashMenuTargetBlockContent = null;
let slashMenuHighlightIndex = 0;

function getSlashMenu() {
    if (slashMenuEl) return slashMenuEl;

    slashMenuEl = document.createElement('div');
    slashMenuEl.className = 'slash-menu';
    slashMenuEl.innerHTML = BLOCK_TYPES.map((bt, i) => `
        <div class="slash-menu-item" data-type="${bt.type}" data-index="${i}">
            <span class="slash-icon"><i data-lucide="${bt.icon}"></i></span>
            <span class="slash-label"><b>${bt.label}</b><small>${bt.hint}</small></span>
        </div>
    `).join('');

    slashMenuEl.querySelectorAll('.slash-menu-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            // mousedown (não click) para disparar antes do blur do contenteditable
            e.preventDefault();
            applySlashSelection(item.dataset.type);
        });
    });

    document.body.appendChild(slashMenuEl);
    return slashMenuEl;
}

function openSlashMenu(blockContentEl) {
    const menu = getSlashMenu();
    slashMenuTargetBlockContent = blockContentEl;
    slashMenuHighlightIndex = 0;
    updateSlashHighlight(menu);

    const rect = blockContentEl.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
}

function closeSlashMenu() {
    if (slashMenuEl) slashMenuEl.classList.remove('open');
    slashMenuTargetBlockContent = null;
}

function updateSlashHighlight(menu) {
    menu.querySelectorAll('.slash-menu-item').forEach((item, i) => {
        item.classList.toggle('highlighted', i === slashMenuHighlightIndex);
    });
}

function applySlashSelection(type) {
    if (!slashMenuTargetBlockContent) return;
    const blockEl = slashMenuTargetBlockContent.closest('.block');
    slashMenuTargetBlockContent.textContent = '';
    closeSlashMenu();
    if (blockEl) setBlockType(blockEl, type);
    updatePublishButtonState();
}

// ============ Cria o elemento DOM de um bloco ============
function createBlockElement(type) {
    const blockEl = document.createElement('div');
    blockEl.className = 'block';
    blockEl.dataset.type = type;
    blockEl.dataset.id = uid();

    blockEl.innerHTML = `
        <div class="block-side-controls">
            <button type="button" class="block-icon-btn add-inline-btn" title="Adicionar bloco abaixo">
                <i data-lucide="plus"></i>
            </button>
            <button type="button" class="block-icon-btn drag-handle" title="Arraste para reordenar">
                <i data-lucide="grip-vertical"></i>
            </button>
        </div>
        <div class="block-slot"></div>
        <button type="button" class="block-icon-btn block-delete-btn" title="Remover bloco">
            <i data-lucide="trash-2"></i>
        </button>
    `;

    const slot = blockEl.querySelector('.block-slot');
    slot.style.flex = '1';
    slot.style.minWidth = '0';
    slot.appendChild(buildBlockContent(type, blockEl.dataset.id));

    wireBlockControls(blockEl);
    return blockEl;
}

// ============ Constrói o conteúdo interno de acordo com o tipo do bloco ============
function buildBlockContent(type, blockId) {
    if (type === 'divider') {
        const div = document.createElement('div');
        div.className = 'block-content';
        div.innerHTML = '<hr>';
        return div;
    }

    if (type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'block-content';
        wrap.innerHTML = `
            <div class="block-image-zone">
                <i data-lucide="image-plus"></i>
                <span>Clique para adicionar uma imagem</span>
            </div>
            <input type="file" accept="image/*" style="display:none;">
        `;
        wireImageBlock(wrap, blockId);
        return wrap;
    }

    // paragraph, heading e list usam contenteditable
    const editable = document.createElement('div');
    editable.className = 'block-content';
    editable.contentEditable = 'true';

    if (type === 'list') {
        editable.innerHTML = '<ul><li><br></li></ul>';
    } else {
        editable.dataset.placeholder = type === 'heading'
            ? 'Título da seção...'
            : "Escreva algo, ou digite '/' para escolher um bloco...";
    }

    wireEditableBlock(editable);
    return editable;
}

// ============ Comportamento dos blocos de texto (parágrafo/título/lista) ============
function wireEditableBlock(editable) {
    editable.addEventListener('input', () => {
        const blockEl = editable.closest('.block');
        const isTextType = blockEl.dataset.type === 'paragraph' || blockEl.dataset.type === 'heading';

        if (isTextType && editable.textContent.trim() === '/') {
            openSlashMenu(editable);
        } else if (slashMenuTargetBlockContent === editable) {
            closeSlashMenu();
        }

        updatePublishButtonState();
    });

    editable.addEventListener('keydown', (e) => {
        const menu = slashMenuEl;
        const menuOpen = menu && menu.classList.contains('open') && slashMenuTargetBlockContent === editable;

        if (menuOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                slashMenuHighlightIndex = (slashMenuHighlightIndex + 1) % BLOCK_TYPES.length;
                updateSlashHighlight(menu);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                slashMenuHighlightIndex = (slashMenuHighlightIndex - 1 + BLOCK_TYPES.length) % BLOCK_TYPES.length;
                updateSlashHighlight(menu);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                applySlashSelection(BLOCK_TYPES[slashMenuHighlightIndex].type);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                editable.textContent = '';
                closeSlashMenu();
                return;
            }
        }

        const blockEl = editable.closest('.block');
        const blockType = blockEl.dataset.type;

        if (e.key === 'Enter' && !e.shiftKey && blockType !== 'list') {
            e.preventDefault();
            const newBlock = createBlockElement('paragraph');
            blockEl.after(newBlock);
            focusBlockContent(newBlock);
            updatePublishButtonState();
            return;
        }

        if (e.key === 'Backspace' && editable.textContent.trim() === '' && blockType !== 'list') {
            const editor = document.getElementById('blockEditor');
            if (editor && editor.children.length > 1) {
                e.preventDefault();
                const prev = blockEl.previousElementSibling;
                blockEl.remove();
                imageFilesByBlockId.delete(blockEl.dataset.id);
                if (prev) focusBlockContent(prev, true);
                updatePublishButtonState();
            }
        }
    });

    editable.addEventListener('blur', () => {
        // Pequeno atraso para permitir que o mousedown do menu seja processado antes de fechar.
        setTimeout(() => {
            if (slashMenuTargetBlockContent === editable) closeSlashMenu();
        }, 150);
    });
}

// ============ Comportamento do bloco de imagem (upload + preview) ============
function wireImageBlock(wrap, blockId) {
    const zone = wrap.querySelector('.block-image-zone');
    const input = wrap.querySelector('input[type="file"]');

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Selecione um arquivo de imagem (JPG, PNG, etc).');
            input.value = '';
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            alert('A imagem é muito grande. Escolha um arquivo de até 8MB.');
            input.value = '';
            return;
        }

        imageFilesByBlockId.set(blockId, file);
        const previewUrl = URL.createObjectURL(file);

        wrap.innerHTML = `
            <div class="block-image-preview">
                <img src="${previewUrl}" alt="Imagem anexada">
                <button type="button" class="block-image-remove" title="Remover imagem">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="block-image-caption" contenteditable="true" data-placeholder="Adicionar uma legenda (opcional)"></div>
        `;

        wrap.querySelector('.block-image-remove').addEventListener('click', () => {
            imageFilesByBlockId.delete(blockId);
            URL.revokeObjectURL(previewUrl);
            const freshWrap = buildBlockContent('image', blockId);
            wrap.replaceWith(freshWrap);
            if (window.lucide) window.lucide.createIcons();
            updatePublishButtonState();
        });

        wrap.querySelector('.block-image-caption').addEventListener('input', updatePublishButtonState);

        if (window.lucide) window.lucide.createIcons();
        updatePublishButtonState();
    });
}

// ============ Botões de cada bloco (+ / arrastar / excluir) ============
function wireBlockControls(blockEl) {
    const addBtn = blockEl.querySelector('.add-inline-btn');
    const deleteBtn = blockEl.querySelector('.block-delete-btn');
    const dragHandle = blockEl.querySelector('.drag-handle');

    addBtn.addEventListener('click', () => {
        const newBlock = createBlockElement('paragraph');
        blockEl.after(newBlock);
        focusBlockContent(newBlock);
        if (window.lucide) window.lucide.createIcons();
    });

    deleteBtn.addEventListener('click', () => {
        const editor = document.getElementById('blockEditor');
        if (editor.children.length <= 1) {
            // Nunca deixa o editor sem nenhum bloco: reseta para um parágrafo vazio.
            const fresh = createBlockElement('paragraph');
            blockEl.replaceWith(fresh);
            if (window.lucide) window.lucide.createIcons();
        } else {
            blockEl.remove();
        }
        imageFilesByBlockId.delete(blockEl.dataset.id);
        updatePublishButtonState();
    });

    // Drag and drop: só é possível iniciar o arraste segurando o "grip".
    dragHandle.addEventListener('mousedown', () => { blockEl.draggable = true; });
    document.addEventListener('mouseup', () => { blockEl.draggable = false; });

    blockEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', blockEl.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => blockEl.classList.add('dragging'));
    });

    blockEl.addEventListener('dragend', () => {
        blockEl.classList.remove('dragging');
        blockEl.draggable = false;
        document.querySelectorAll('.block.drag-over').forEach(b => b.classList.remove('drag-over'));
    });

    blockEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        blockEl.classList.add('drag-over');
    });

    blockEl.addEventListener('dragleave', () => blockEl.classList.remove('drag-over'));

    blockEl.addEventListener('drop', (e) => {
        e.preventDefault();
        blockEl.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        const editor = document.getElementById('blockEditor');
        const draggedEl = editor.querySelector(`.block[data-id="${draggedId}"]`);
        if (!draggedEl || draggedEl === blockEl) return;

        const rect = blockEl.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        blockEl[before ? 'before' : 'after'](draggedEl);
    });
}

// ============ Troca o tipo de um bloco existente (usado pelo menu "/") ============
function setBlockType(blockEl, type) {
    const blockId = blockEl.dataset.id;
    blockEl.dataset.type = type;
    const slot = blockEl.querySelector('.block-slot');
    slot.innerHTML = '';
    const content = buildBlockContent(type, blockId);
    slot.appendChild(content);
    if (window.lucide) window.lucide.createIcons();
    focusBlockContent(blockEl);
}

// ============ Foca o conteúdo editável de um bloco (fim do texto, se pedido) ============
function focusBlockContent(blockEl, atEnd = false) {
    const editable = blockEl.querySelector('[contenteditable="true"]');
    if (!editable) {
        const imageZone = blockEl.querySelector('.block-image-zone');
        if (imageZone) imageZone.focus?.();
        return;
    }
    editable.focus();

    if (atEnd) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editable);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// ============ Serializa todos os blocos do editor em JSON ============
function serializeBlocks() {
    const editor = document.getElementById('blockEditor');
    const blocks = [];

    editor.querySelectorAll(':scope > .block').forEach(blockEl => {
        const type = blockEl.dataset.type;

        if (type === 'paragraph' || type === 'heading') {
            const text = blockEl.querySelector('.block-content').textContent.trim();
            if (text) blocks.push({ type, text });
            return;
        }

        if (type === 'list') {
            const items = Array.from(blockEl.querySelectorAll('li'))
                .map(li => li.textContent.trim())
                .filter(Boolean);
            if (items.length) blocks.push({ type, items });
            return;
        }

        if (type === 'divider') {
            blocks.push({ type });
            return;
        }

        if (type === 'image') {
            const uploadedUrl = blockEl.dataset.uploadedUrl;
            const captionEl = blockEl.querySelector('.block-image-caption');
            const caption = captionEl ? captionEl.textContent.trim() : '';
            const hasPendingFile = imageFilesByBlockId.has(blockEl.dataset.id);
            if (uploadedUrl || hasPendingFile) {
                blocks.push({ type, url: uploadedUrl || null, caption, __blockId: blockEl.dataset.id });
            }
        }
    });

    return blocks;
}

// ============ Habilita/desabilita o botão de publicar ============
function updatePublishButtonState() {
    const publishBtn = document.getElementById('publishUpdateBtn');
    if (!publishBtn) return;
    const hasContent = serializeBlocks().length > 0;
    publishBtn.disabled = !hasContent;
}

// ============ Reseta o editor para o estado inicial (um parágrafo vazio) ============
function resetEditor() {
    const editor = document.getElementById('blockEditor');
    const titleInput = document.getElementById('updateTitleInput');
    if (titleInput) titleInput.value = '';
    imageFilesByBlockId.clear();
    editor.innerHTML = '';
    editor.appendChild(createBlockElement('paragraph'));
    if (window.lucide) window.lucide.createIcons();
    updatePublishButtonState();
}

// ============ Carrega os blocos de uma atualização já publicada de volta no editor (para editar) ============
function loadBlocksIntoEditor(blocks) {
    const editor = document.getElementById('blockEditor');
    imageFilesByBlockId.clear();
    editor.innerHTML = '';

    if (!blocks || blocks.length === 0) {
        editor.appendChild(createBlockElement('paragraph'));
        updatePublishButtonState();
        return;
    }

    blocks.forEach(block => {
        const blockEl = createBlockElement(block.type);
        const slot = blockEl.querySelector('.block-slot');

        if (block.type === 'paragraph' || block.type === 'heading') {
            const editable = slot.querySelector('.block-content');
            if (editable) editable.textContent = block.text || '';
        } else if (block.type === 'list') {
            const ul = slot.querySelector('.block-content ul');
            if (ul) ul.innerHTML = (block.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('') || '<li><br></li>';
        } else if (block.type === 'image' && block.url) {
            const wrap = slot.querySelector('.block-content');
            wrap.innerHTML = `
                <div class="block-image-preview">
                    <img src="${block.url}" alt="Imagem da atualização">
                    <button type="button" class="block-image-remove" title="Remover imagem">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="block-image-caption" contenteditable="true" data-placeholder="Adicionar uma legenda (opcional)">${escapeHtml(block.caption || '')}</div>
            `;
            blockEl.dataset.uploadedUrl = block.url;

            wrap.querySelector('.block-image-remove').addEventListener('click', () => {
                delete blockEl.dataset.uploadedUrl;
                imageFilesByBlockId.delete(blockEl.dataset.id);
                const freshWrap = buildBlockContent('image', blockEl.dataset.id);
                wrap.replaceWith(freshWrap);
                if (window.lucide) window.lucide.createIcons();
                updatePublishButtonState();
            });
            wrap.querySelector('.block-image-caption').addEventListener('input', updatePublishButtonState);
        }
        // 'divider' não precisa de nenhum dado extra além do tipo.

        editor.appendChild(blockEl);
    });

    if (window.lucide) window.lucide.createIcons();
    updatePublishButtonState();
}

// ============ Entra em modo de edição: preenche o composer com uma atualização existente ============
function startEditUpdate(update) {
    const composer = document.getElementById('updateComposer');
    const titleInput = document.getElementById('updateTitleInput');
    const publishBtn = document.getElementById('publishUpdateBtn');
    if (!composer) return;

    editingUpdateId = update.id;
    if (titleInput) titleInput.value = update.title || '';
    loadBlocksIntoEditor(update.blocks);

    if (publishBtn) publishBtn.textContent = 'Salvar edição';
    showEditingBanner(update.id);

    composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============ Mostra um aviso de "editando" com opção de cancelar ============
function showEditingBanner(updateId) {
    removeEditingBanner();
    const composer = document.getElementById('updateComposer');
    if (!composer) return;

    const banner = document.createElement('div');
    banner.className = 'update-editing-banner';
    banner.id = 'updateEditingBanner';
    banner.innerHTML = `
        <span><i data-lucide="pencil"></i>Editando uma atualização publicada</span>
        <button type="button" id="cancelEditUpdateBtn">Cancelar edição</button>
    `;
    composer.insertBefore(banner, composer.firstChild);

    banner.querySelector('#cancelEditUpdateBtn').addEventListener('click', () => {
        cancelEditUpdate();
    });

    if (window.lucide) window.lucide.createIcons();
}

function removeEditingBanner() {
    document.getElementById('updateEditingBanner')?.remove();
}

// ============ Sai do modo de edição e volta o composer para "criar nova atualização" ============
function cancelEditUpdate() {
    editingUpdateId = null;
    removeEditingBanner();
    const publishBtn = document.getElementById('publishUpdateBtn');
    if (publishBtn) publishBtn.textContent = 'Publicar atualização';
    resetEditor();
}

// ============ Upload das imagens pendentes para o bucket "updates" ============
async function uploadPendingImages(profileId) {
    const editor = document.getElementById('blockEditor');
    const imageBlocks = Array.from(editor.querySelectorAll('.block[data-type="image"]'));

    for (const blockEl of imageBlocks) {
        const file = imageFilesByBlockId.get(blockEl.dataset.id);
        if (!file) continue;

        const fileExt = file.name.split('.').pop();
        const fileName = `${profileId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('updates')
            .upload(fileName, file);

        if (uploadError) {
            logSupabaseError('uploadPendingImages', uploadError);
            alert(
                `Erro ao enviar uma das imagens: ${uploadError.message}\n` +
                `Verifique se o bucket "updates" existe no Supabase Storage e se há uma Policy de INSERT para o role "anon".`
            );
            continue;
        }

        const { data: publicUrlData } = supabase.storage.from('updates').getPublicUrl(fileName);
        blockEl.dataset.uploadedUrl = publicUrlData?.publicUrl || '';
    }
}

// ============ Publica uma nova atualização OU salva a edição de uma já existente ============
async function publishUpdate(profileId) {
    const publishBtn = document.getElementById('publishUpdateBtn');
    const titleInput = document.getElementById('updateTitleInput');
    const updatesList = document.getElementById('updatesList');
    const emptyMsg = document.getElementById('emptyUpdatesMsg');
    const isEditing = !!editingUpdateId;

    await uploadPendingImages(profileId);
    const blocks = serializeBlocks().map(({ __blockId, ...rest }) => rest);

    if (blocks.length === 0) return;

    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = isEditing ? 'Salvando...' : 'Publicando...';
    }

    const payload = {
        profile_id: profileId,
        title: titleInput.value.trim() || null,
        blocks
    };

    const query = isEditing
        ? supabase.from('updates').update(payload).eq('id', editingUpdateId).select().single()
        : supabase.from('updates').insert(payload).select().single();

    const { data, error } = await query;

    if (publishBtn) publishBtn.textContent = isEditing ? 'Salvar edição' : 'Publicar atualização';

    if (error) {
        logSupabaseError('publishUpdate', error);
        alert(
            `Erro ao ${isEditing ? 'salvar a edição' : 'publicar a atualização'}: ${error.message}\n` +
            `Confira se a tabela "updates" existe no Supabase com as colunas ` +
            `"profile_id", "title" e "blocks" (tipo jsonb), e se há uma Policy liberada para ${isEditing ? 'UPDATE' : 'INSERT'}.`
        );
        if (publishBtn) publishBtn.disabled = false;
        return;
    }

    if (isEditing) {
        // Substitui o card antigo pela versão atualizada, no mesmo lugar da timeline.
        const oldCard = updatesList.querySelector(`.update-card[data-update-id="${editingUpdateId}"]`);
        const newCard = buildUpdateCard(data);
        if (oldCard) oldCard.replaceWith(newCard);
        else updatesList.insertBefore(newCard, updatesList.firstChild);
    } else {
        if (emptyMsg) emptyMsg.remove();
        updatesList.insertBefore(buildUpdateCard(data), updatesList.firstChild);
    }

    if (window.lucide) window.lucide.createIcons();

    editingUpdateId = null;
    removeEditingBanner();
    resetEditor();
}

// ============ Exclui uma atualização publicada (com confirmação) ============
async function deleteUpdate(update) {
    const confirmed = window.confirm('Excluir esta atualização? Essa ação não pode ser desfeita.');
    if (!confirmed) return;

    const { error } = await supabase
        .from('updates')
        .delete()
        .eq('id', update.id);

    if (error) {
        logSupabaseError('deleteUpdate', error);
        alert(`Erro ao excluir a atualização: ${error.message}`);
        return;
    }

    document.querySelectorAll(`.update-card[data-update-id="${update.id}"]`).forEach(el => el.remove());

    // Se estava editando justamente essa atualização, cancela a edição.
    if (editingUpdateId === update.id) {
        cancelEditUpdate();
    }

    const updatesList = document.getElementById('updatesList');
    if (updatesList && updatesList.children.length === 0) {
        updatesList.innerHTML = '<p class="empty-state" id="emptyUpdatesMsg">Ainda não há atualizações publicadas.</p>';
    }
}

// ============ Renderiza os blocos salvos em HTML de leitura ============
function renderBlocksHtml(blocks) {
    if (!Array.isArray(blocks)) return '';

    return blocks.map(block => {
        switch (block.type) {
            case 'paragraph':
                return `<p>${escapeHtml(block.text)}</p>`;
            case 'heading':
                return `<h4>${escapeHtml(block.text)}</h4>`;
            case 'list':
                return `<ul>${(block.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
            case 'divider':
                return '<hr>';
            case 'image':
                return `
                    <figure>
                        ${block.url ? `<img src="${block.url}" alt="Imagem da atualização" loading="lazy">` : ''}
                        ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}
                    </figure>`;
            default:
                return '';
        }
    }).join('');
}

// ============ Monta o card de uma atualização já publicada ============
function buildUpdateCard(update) {
    const article = document.createElement('article');
    article.className = 'update-card';
    article.dataset.updateId = update.id;

    article.innerHTML = `
        <div class="update-card-rail"><div class="update-card-dot"></div></div>
        <div class="update-card-body">
            <div class="update-card-header">
                <span class="update-card-badge"><i data-lucide="megaphone"></i>Atualização oficial</span>
                <span class="update-card-time">${AUTHOR_NAME} · ${timeAgo(update.created_at)}</span>
            </div>
            ${update.title ? `<div class="update-card-title">${escapeHtml(update.title)}</div>` : ''}
            <div class="update-card-content">${renderBlocksHtml(update.blocks)}</div>
            <div class="update-card-actions">
                <button class="action like" title="Curtir">
                    <i data-lucide="heart"></i><span>${update.likes_count || 0}</span>
                </button>
                <button class="action share" title="Compartilhar">
                    <i data-lucide="share"></i>
                </button>
                ${isAdminUser ? `
                <button class="action edit-update" title="Editar atualização">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="action delete-update" title="Excluir atualização">
                    <i data-lucide="trash-2"></i>
                </button>` : ''}
            </div>
        </div>
    `;

    const likeBtn = article.querySelector('.action.like');
    likeBtn.addEventListener('click', () => {
        const active = likeBtn.classList.toggle('active');
        const span = likeBtn.querySelector('span');
        span.textContent = String(Math.max(0, parseInt(span.textContent, 10) + (active ? 1 : -1)));
    });

    if (isAdminUser) {
        article.querySelector('.action.edit-update')?.addEventListener('click', () => startEditUpdate(update));
        article.querySelector('.action.delete-update')?.addEventListener('click', () => deleteUpdate(update));
    }

    return article;
}

// ============ Carrega as atualizações já publicadas ============
async function loadUpdates() {
    const updatesList = document.getElementById('updatesList');
    if (!updatesList) return;

    const { data, error } = await supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        logSupabaseError('loadUpdates', error);
        updatesList.innerHTML = `
            <p class="empty-state">
                Não foi possível carregar as atualizações agora. Confira se a tabela "updates" já existe no Supabase.
            </p>`;
        return;
    }

    if (!data || data.length === 0) return; // mantém a mensagem de "vazio" já presente no HTML

    const emptyMsg = document.getElementById('emptyUpdatesMsg');
    if (emptyMsg) emptyMsg.remove();

    data.forEach(update => updatesList.appendChild(buildUpdateCard(update)));
    if (window.lucide) window.lucide.createIcons();
}

// ============ Inicialização da página de Notificações ============
export function initNotifications(currentProfileId, adminProfileId) {
    // Guarda de segurança: como global.js agora é compartilhado por todas as páginas
    // do site, initNotifications só deve rodar de fato na página que tem o mural
    // (notificacoes.html). Em qualquer outra página (ex: inicio.html), #updatesBoard
    // não existe e a função para aqui, sem tentar mexer em elementos inexistentes.
    if (!document.getElementById('updatesBoard')) return;

    const isAdmin = currentProfileId === adminProfileId;
    isAdminUser = isAdmin;

    const composer = document.getElementById('updateComposer');
    const readonlyNote = document.getElementById('updatesReadonlyNote');
    const addBlockBtn = document.getElementById('addBlockBtn');
    const publishBtn = document.getElementById('publishUpdateBtn');
    const titleInput = document.getElementById('updateTitleInput');

    if (isAdmin) {
        if (composer) composer.style.display = 'block';
        if (readonlyNote) readonlyNote.style.display = 'none';

        resetEditor();

        addBlockBtn?.addEventListener('click', () => {
            const editor = document.getElementById('blockEditor');
            const newBlock = createBlockElement('paragraph');
            editor.appendChild(newBlock);
            focusBlockContent(newBlock);
            if (window.lucide) window.lucide.createIcons();
        });

        titleInput?.addEventListener('input', updatePublishButtonState);
        publishBtn?.addEventListener('click', () => publishUpdate(currentProfileId));

        // Fecha o menu "/" ao clicar fora dele.
        document.addEventListener('mousedown', (e) => {
            if (slashMenuEl && slashMenuEl.classList.contains('open') && !slashMenuEl.contains(e.target)) {
                closeSlashMenu();
            }
        });
    } else {
        if (composer) composer.style.display = 'none';
        if (readonlyNote) readonlyNote.style.display = 'flex';
    }

    loadUpdates();
}