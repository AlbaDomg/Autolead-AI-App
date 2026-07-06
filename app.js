// ==========================================
// AUTOLEAD AI - LÓGICA DE APLICACIÓN
// ==========================================

// --- ESTADO GLOBAL ---
let state = {
    apiKey: '',
    leads: [],
    searchResults: [],
    activeLead: null,
    activeMicrotask: null,
    momentumCount: 0
};

// --- AL CARGAR EL DOCUMENTO ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    registerServiceWorker();
});

// --- INICIALIZACIÓN ---
function initApp() {
    // 1. Cargar API Key
    const savedKey = localStorage.getItem('autolead_gemini_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        document.getElementById('apiKeyInput').value = savedKey;
        updateApiStatus(true);
    } else {
        updateApiStatus(false);
    }

    // 2. Cargar Leads de localStorage
    const savedLeads = localStorage.getItem('autolead_leads');
    if (savedLeads) {
        try {
            state.leads = JSON.parse(savedLeads);
        } catch (e) {
            console.error("Error al parsear leads guardados", e);
            state.leads = [];
        }
    }

    // 3. Renderizar Dashboard y CRM
    updateDashboardStats();
    renderCRM();
    
    // 4. Configurar el Coach de Enfoque TDAH
    setupADHDCoach();
}

// ==========================================
// SEGURIDAD Y API KEY
// ==========================================

function updateApiStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Gemini Conectada';
        text.style.color = 'var(--color-success)';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Gemini Desconectada';
        text.style.color = 'var(--color-danger)';
    }
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput').value.trim();
    if (!input) {
        alert("Por favor, introduce una clave de API válida.");
        return;
    }
    state.apiKey = input;
    localStorage.setItem('autolead_gemini_api_key', input);
    updateApiStatus(true);
    alert("¡Clave de API guardada con éxito!");
    
    // Recargar coach para actualizar tareas si era la tarea pendiente
    setupADHDCoach();
    switchView('dashboard');
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    const icon = document.getElementById('toggleApiIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
}

// ==========================================
// CONTROL DE VISTAS (SPA NAVIGATION)
// ==========================================

function switchView(viewName) {
    // Desactivar todos los botones e indicadores
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(pane => pane.classList.remove('active'));

    // Activar vista seleccionada
    const activePane = document.getElementById(`view-${viewName}`);
    if (activePane) {
        activePane.classList.add('active');
        activePane.classList.add('fade-in');
    }

    // Activar botón del nav correspondiente
    const navButtons = document.querySelectorAll('.tab-btn');
    navButtons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(viewName)) {
            btn.classList.add('active');
        }
    });

    // Actualizaciones específicas al entrar a una vista
    if (viewName === 'dashboard') {
        updateDashboardStats();
        setupADHDCoach();
    } else if (viewName === 'crm') {
        renderCRM();
    }
}

// ==========================================
// INTEGRACIÓN CON API DE GEMINI (LLAMADAS HTTP)
// ==========================================

// Función auxiliar para limpiar y parsear el JSON retornado por la IA
function parseGeminiJSON(text) {
    let cleanText = text.trim();
    
    // Si la IA devuelve el formato envuelto en bloques markdown ```json ... ```
    if (cleanText.startsWith('```json')) {
        cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith('```')) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    
    return JSON.parse(cleanText.trim());
}

// Llamada genérica a Gemini
async function callGemini(promptText) {
    if (!state.apiKey) {
        alert("Configura tu API Key de Gemini en la pestaña de Ajustes primero.");
        switchView('settings');
        throw new Error("Falta la API Key de Gemini");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: promptText
                    }]
                }],
                generationConfig: {
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Error en la petición de Gemini');
        }

        const data = await response.json();
        const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!outputText) {
            throw new Error("Gemini no devolvió texto en su respuesta.");
        }

        return parseGeminiJSON(outputText);
    } catch (error) {
        console.error("Error en la llamada a Gemini:", error);
        alert(`Error al conectar con la IA: ${error.message}`);
        throw error;
    }
}

// ==========================================
// MÓDULO 1: BUSCADOR DE LEADS CON IA
// ==========================================

async function searchLeads() {
    const nicheInput = document.getElementById('searchNiche').value.trim();
    const locationInput = document.getElementById('searchLocation').value.trim() || 'Málaga';

    if (!nicheInput) {
        alert("Por favor, introduce el sector/nicho que te interesa.");
        return;
    }

    const searchBtn = document.getElementById('searchBtn');
    const loader = document.getElementById('searchLoader');
    const resultsContainer = document.getElementById('searchResults');

    // UI Feedback
    searchBtn.disabled = true;
    loader.style.display = 'flex';
    resultsContainer.innerHTML = '';

    const prompt = `Eres un asistente de investigación de mercado y prospección comercial. El usuario es un programador autónomo especializado en construir aplicaciones y scripts de automatización de procesos (APIs, IA, web scraping, bots, automatización de tareas).
    
    Busca clientes potenciales reales (o que representen empresas locales muy plausibles y lógicas) del sector "${nicheInput}" en "${locationInput}", España.
    
    Para cada cliente, clasifícalo en una de estas dos categorías según su madurez de automatización:
    - 'iniciacion': Empresas tradicionales con alta carga de trabajo manual y poca digitalización que hacen tareas repetitivas a mano (ej: clínicas locales, comercios pequeños, etc.). Necesitan iniciarse en la automatización.
    - 'optimizacion': Empresas que ya usan herramientas digitales pero tienen flujos rotos, ineficientes o que podrían conectarse de forma inteligente con IA o APIs (ej: agencias locales, productoras de video, tiendas online).
    
    Devuelve estrictamente un array en formato JSON con 5 objetos que tengan exactamente esta estructura:
    [
      {
        "name": "Nombre real o plausible de la empresa local",
        "web": "URL aproximada o real del sitio web",
        "description": "Una frase detallando qué hacen y por qué son candidatos perfectos, mencionando qué tareas manuales o flujos están listos para automatizar",
        "type": "iniciacion" o "optimizacion"
      }
    ]
    
    No devuelvas ninguna explicación fuera del JSON. Devuelve únicamente el array.`;

    try {
        const results = await callGemini(prompt);
        state.searchResults = results;
        renderSearchResults(results);
    } catch (e) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon" style="color: var(--color-danger)">⚠️</div>
                <div class="empty-state-text">Ocurrió un error al buscar leads:</div>
                <div style="font-family: monospace; font-size: 12px; color: var(--color-danger); margin-top: 8px; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 4px; max-width: 500px; margin-left: auto; margin-right: auto; word-break: break-all;">
                    ${e.message}
                </div>
                <div class="empty-state-text" style="margin-top: 12px; font-size: 12.5px;">Verifica tu clave en Ajustes o inténtalo de nuevo en unos momentos.</div>
            </div>
        `;
    } finally {
        searchBtn.disabled = false;
        loader.style.display = 'none';
    }
}

function renderSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">No se encontraron leads. Intenta cambiar los términos de búsqueda.</div>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = '';
    results.forEach((lead, index) => {
        const card = document.createElement('div');
        card.className = 'lead-card fade-in';
        
        const typeBadge = lead.type === 'iniciacion' 
            ? `<span class="lead-badge iniciacion">🏷️ Iniciación</span>`
            : `<span class="lead-badge optimizacion">⚡ Optimización</span>`;

        card.innerHTML = `
            <div>
                <div class="lead-header">
                    <h3 class="lead-title">${lead.name}</h3>
                    ${typeBadge}
                </div>
                <p class="lead-desc">${lead.description}</p>
                <div class="lead-meta">
                    <i data-lucide="globe" style="width:14px;height:14px;"></i>
                    <a href="${lead.web.startsWith('http') ? lead.web : 'https://' + lead.web}" target="_blank">${lead.web}</a>
                    <span style="color:var(--text-muted); margin: 0 4px;">|</span>
                    <i data-lucide="search" style="width:12px;height:12px;"></i>
                    <a href="https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (document.getElementById('searchLocation').value.trim() || 'Málaga'))}" target="_blank" style="font-size:11px;">Buscar en Google</a>
                </div>
            </div>
            <div class="lead-actions">
                <button class="action-btn" style="flex-grow:1; padding: 10px 14px; font-size:13px;" onclick="selectLeadForAnalysis(${index})">
                    <i data-lucide="sparkles" style="width:14px;height:14px;"></i> Generar Propuesta
                </button>
            </div>
        `;
        resultsContainer.appendChild(card);
    });
    
    lucide.createIcons();
}

// ==========================================
// MÓDULO 2: ANALIZADOR Y GENERADOR DE PROPUESTAS
// ==========================================

function selectLeadForAnalysis(index) {
    const lead = state.searchResults[index];
    state.activeLead = {
        ...lead,
        id: Date.now(),
        status: 'todo',
        ideas: [],
        email: ''
    };

    // Navegar a la vista de propuestas
    switchView('proposal');

    // Configurar cabecera
    const badge = document.getElementById('proposalLeadBadge');
    badge.className = `lead-badge ${state.activeLead.type}`;
    badge.textContent = state.activeLead.type === 'iniciacion' ? '🏷️ Iniciación' : '⚡ Optimización';
    
    document.getElementById('proposalLeadName').textContent = state.activeLead.name;
    
    const webLink = document.getElementById('proposalLeadUrl');
    const realWeb = state.activeLead.web.startsWith('http') ? state.activeLead.web : 'https://' + state.activeLead.web;
    const locationVal = document.getElementById('searchLocation').value || 'Málaga';
    webLink.innerHTML = `
        <i data-lucide="external-link" style="width:14px; vertical-align: middle;"></i> 
        <a href="${realWeb}" target="_blank">${state.activeLead.web}</a>
        <span style="color:var(--text-muted); margin: 0 8px;">|</span>
        <i data-lucide="search" style="width:14px; vertical-align: middle;"></i> 
        <a href="https://www.google.com/search?q=${encodeURIComponent(state.activeLead.name + ' ' + locationVal)}" target="_blank">Buscar en Google</a>
    `;
    lucide.createIcons();

    // Resetear contenedores y activar loader
    document.getElementById('proposalContent').style.display = 'none';
    document.getElementById('proposalLoader').style.display = 'flex';

    generateProposalAI();
}

async function generateProposalAI() {
    const lead = state.activeLead;
    const prompt = `Eres un desarrollador freelance gallego experto en automatizaciones de procesos comerciales mediante IA, APIs (YouTube, CRM, Google Sheets, WhatsApp, Gmail, etc.) y programación de integraciones web.
    
    Vas a crear una propuesta de negocio inicial para el siguiente cliente potencial:
    - Nombre de la empresa: ${lead.name}
    - Sitio web: ${lead.web}
    - Descripción del cliente y su necesidad: ${lead.description}
    - Tipo de cliente: ${lead.type === 'iniciacion' ? 'Empresa tradicional que hace tareas muy manuales y carece de automatización' : 'Empresa digitalizada que puede optimizar y conectar sus flujos'}

    Genera exactamente dos bloques de información:
    1. Un array de 3 ideas concretas de automatización técnica para esta empresa. Cada idea debe incluir:
       - "title": Título corto y vendedor de la automatización.
       - "problem": El problema o proceso ineficiente que hace perder tiempo.
       - "solution": Qué software, scripts, APIs o IA programarás para resolverlo.
       - "benefit": Cuál es el beneficio financiero o ahorro de tiempo directo (sé concreto).
       
    2. Un correo electrónico inicial frío ("cold email") redactado en Castellano, diseñado para el responsable de la empresa.
       - Tono: Profesional, directo, sin rodeos corporativos aburridos, de programador a programador/dueño.
       - Enfoque: Propón solucionar uno de los problemas identificados. Ofrece una breve charla informal de 10 minutos (teléfono o videollamada) donde les propones enseñarle cómo podría ahorrar tiempo de inmediato.
       - Personalización: Haz referencia directa a la actividad de su empresa.
       - Usa placeholders legibles para que yo firme al final, como "[Tu Nombre]".

    Devuelve estrictamente un objeto JSON con esta estructura exacta:
    {
      "proposals": [
        {
          "title": "...",
          "problem": "...",
          "solution": "...",
          "benefit": "..."
        },
        { ... },
        { ... }
      ],
      "email": "Borrador completo del correo..."
    }

    No añadas ningún texto antes ni después del JSON.`;

    try {
        const result = await callGemini(prompt);
        
        state.activeLead.ideas = result.proposals;
        state.activeLead.email = result.email;

        // Renderizar propuestas
        renderProposalContent();
    } catch (e) {
        document.getElementById('proposalLoader').style.display = 'none';
        alert("No se pudo generar la propuesta comercial. Revisa la consola.");
        switchView('search');
    }
}

function renderProposalContent() {
    document.getElementById('proposalLoader').style.display = 'none';
    const container = document.getElementById('proposalContent');
    container.style.display = 'grid';

    // Rellenar ideas
    const ideasContainer = document.getElementById('proposalIdeasContainer');
    ideasContainer.innerHTML = '';
    
    state.activeLead.ideas.forEach((idea, idx) => {
        const item = document.createElement('div');
        item.className = 'proposal-item fade-in';
        item.innerHTML = `
            <h4>${idx + 1}. ${idea.title}</h4>
            <p style="font-size: 13px; margin-bottom: 6px;"><strong style="color:var(--color-danger)">Problema:</strong> ${idea.problem}</p>
            <p style="font-size: 13px; margin-bottom: 6px;"><strong style="color:var(--color-info)">Solución:</strong> ${idea.solution}</p>
            <p style="font-size: 13px; margin-bottom: 0;"><strong style="color:var(--color-success)">Beneficio:</strong> ${idea.benefit}</p>
        `;
        ideasContainer.appendChild(item);
    });

    // Rellenar email
    document.getElementById('proposalEmailText').value = state.activeLead.email;
}

function copyProposalEmail() {
    const text = document.getElementById('proposalEmailText').value;
    navigator.clipboard.writeText(text);
    alert("¡Borrador de email copiado al portapapeles!");
}

function saveToCRMAndMarkContacted() {
    // Actualizar el correo modificado por si el usuario lo editó en el textarea
    state.activeLead.email = document.getElementById('proposalEmailText').value;
    state.activeLead.status = 'todo'; // Entra al CRM en la primera columna "Por contactar"
    
    // Evitar duplicados
    state.leads = state.leads.filter(l => l.name !== state.activeLead.name);
    state.leads.push(state.activeLead);
    
    // Persistencia
    saveLeadsToStorage();
    
    // Confeti!
    confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
    });

    alert("¡Lead guardado correctamente en tu CRM Kanban!");
    switchView('crm');
}

function backToSearch() {
    switchView('search');
}

// ==========================================
// MÓDULO 3: TABLERO KANBAN (CRM)
// ==========================================

function saveLeadsToStorage() {
    localStorage.setItem('autolead_leads', JSON.stringify(state.leads));
    updateDashboardStats();
}

function clearCRMData() {
    if (confirm("¿Estás seguro de que quieres borrar todos los leads guardados en el CRM? Esta acción no se puede deshacer.")) {
        state.leads = [];
        saveLeadsToStorage();
        renderCRM();
        alert("CRM vaciado con éxito.");
    }
}

function renderCRM() {
    const todoContainer = document.getElementById('cards-todo');
    const contactedContainer = document.getElementById('cards-contacted');
    const interestedContainer = document.getElementById('cards-interested');

    todoContainer.innerHTML = '';
    contactedContainer.innerHTML = '';
    interestedContainer.innerHTML = '';

    let todoCount = 0;
    let contactedCount = 0;
    let interestedCount = 0;

    state.leads.forEach(lead => {
        const card = document.createElement('div');
        card.className = 'kanban-card fade-in';
        
        const typeIcon = lead.type === 'iniciacion' ? '🏷️' : '⚡';

        // Botones de acción según la columna para mover rápido
        let actionBtn = '';
        if (lead.status === 'todo') {
            todoCount++;
            actionBtn = `
                <button class="card-move-btn" onclick="moveLead('${lead.id}', 'contacted')">
                    Marcar Contactado <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
                </button>
            `;
        } else if (lead.status === 'contacted') {
            contactedCount++;
            actionBtn = `
                <button class="card-move-btn" onclick="moveLead('${lead.id}', 'interested')">
                    ¡Interesado! <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
                </button>
            `;
        } else if (lead.status === 'interested') {
            interestedCount++;
            actionBtn = `
                <span style="color:var(--color-success); font-weight:600;"><i data-lucide="sparkles" style="width:12px;height:12px;vertical-align:middle;"></i> ¡Oportunidad de Oro!</span>
            `;
        }

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 6px;">
                <div class="kanban-card-title">${lead.name}</div>
                <span title="${lead.type === 'iniciacion' ? 'Iniciación' : 'Optimización'}">${typeIcon}</span>
            </div>
            <p class="kanban-card-desc">${lead.description.substring(0, 80)}...</p>
            <div class="kanban-card-actions">
                <button class="card-move-btn" style="color:var(--color-danger);" onclick="deleteLead('${lead.id}')">
                    <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                </button>
                <button class="card-move-btn" style="color:var(--color-info);" onclick="viewSavedLeadProposal('${lead.id}')">
                    Ver email
                </button>
                ${actionBtn}
            </div>
        `;

        if (lead.status === 'todo') {
            todoContainer.appendChild(card);
        } else if (lead.status === 'contacted') {
            contactedContainer.appendChild(card);
        } else if (lead.status === 'interested') {
            interestedContainer.appendChild(card);
        }
    });

    // Actualizar contadores del DOM
    document.getElementById('count-todo').textContent = todoCount;
    document.getElementById('count-contacted').textContent = contactedCount;
    document.getElementById('count-interested').textContent = interestedCount;

    // Si las columnas están vacías, meter estado vacío
    if (todoCount === 0) todoContainer.innerHTML = '<div style="text-align:center; padding: 20px; font-size:12px; color:var(--text-muted);">Sin leads por contactar</div>';
    if (contactedCount === 0) contactedContainer.innerHTML = '<div style="text-align:center; padding: 20px; font-size:12px; color:var(--text-muted);">Sin leads contactados</div>';
    if (interestedCount === 0) interestedContainer.innerHTML = '<div style="text-align:center; padding: 20px; font-size:12px; color:var(--text-muted);">Nadie interesado de momento</div>';

    lucide.createIcons();
}

function moveLead(id, newStatus) {
    const leadId = parseFloat(id);
    state.leads = state.leads.map(lead => {
        if (lead.id === leadId) {
            // Si pasa a interesado, ¡confeti de celebración!
            if (newStatus === 'interested') {
                confetti({
                    particleCount: 120,
                    spread: 80,
                    colors: ['#7c3aed', '#10b981', '#06b6d4']
                });
            }
            return { ...lead, status: newStatus };
        }
        return lead;
    });
    saveLeadsToStorage();
    renderCRM();
}

function deleteLead(id) {
    const leadId = parseFloat(id);
    if (confirm("¿Seguro que deseas eliminar este cliente del embudo?")) {
        state.leads = state.leads.filter(lead => lead.id !== leadId);
        saveLeadsToStorage();
        renderCRM();
    }
}

function viewSavedLeadProposal(id) {
    const leadId = parseFloat(id);
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead) return;

    state.activeLead = lead;
    switchView('proposal');

    // Rellenar cabecera y contenidos guardados
    const badge = document.getElementById('proposalLeadBadge');
    badge.className = `lead-badge ${lead.type}`;
    badge.textContent = lead.type === 'iniciacion' ? '🏷️ Iniciación' : '⚡ Optimización';
    document.getElementById('proposalLeadName').textContent = lead.name;
    
    const webLink = document.getElementById('proposalLeadUrl');
    const realWeb = lead.web.startsWith('http') ? lead.web : 'https://' + lead.web;
    webLink.innerHTML = `
        <i data-lucide="external-link" style="width:14px; vertical-align: middle;"></i> 
        <a href="${realWeb}" target="_blank">${lead.web}</a>
        <span style="color:var(--text-muted); margin: 0 8px;">|</span>
        <i data-lucide="search" style="width:14px; vertical-align: middle;"></i> 
        <a href="https://www.google.com/search?q=${encodeURIComponent(lead.name)}" target="_blank">Buscar en Google</a>
    `;

    document.getElementById('proposalLoader').style.display = 'none';
    document.getElementById('proposalContent').style.display = 'grid';

    // Rellenar ideas
    const ideasContainer = document.getElementById('proposalIdeasContainer');
    ideasContainer.innerHTML = '';
    lead.ideas.forEach((idea, idx) => {
        const item = document.createElement('div');
        item.className = 'proposal-item';
        item.innerHTML = `
            <h4>${idx + 1}. ${idea.title}</h4>
            <p style="font-size: 13px; margin-bottom: 4px;"><strong style="color:var(--color-danger)">Problema:</strong> ${idea.problem}</p>
            <p style="font-size: 13px; margin-bottom: 4px;"><strong style="color:var(--color-info)">Solución:</strong> ${idea.solution}</p>
            <p style="font-size: 13px; margin-bottom: 0;"><strong style="color:var(--color-success)">Beneficio:</strong> ${idea.benefit}</p>
        `;
        ideasContainer.appendChild(item);
    });

    document.getElementById('proposalEmailText').value = lead.email;
    lucide.createIcons();
}

// ==========================================
// ESTADÍSTICAS DEL DASHBOARD
// ==========================================

function updateDashboardStats() {
    const totalLeads = state.leads.length;
    const contactedLeads = state.leads.filter(l => l.status === 'contacted' || l.status === 'interested').length;
    const interestedLeads = state.leads.filter(l => l.status === 'interested').length;
    
    let rate = 0;
    if (contactedLeads > 0) {
        rate = Math.round((interestedLeads / contactedLeads) * 100);
    }

    document.getElementById('statTotalLeads').textContent = totalLeads;
    document.getElementById('statContacted').textContent = contactedLeads;
    document.getElementById('statInterested').textContent = interestedLeads;
    document.getElementById('statConversion').textContent = `${rate}%`;
}

// ==========================================
// COACH TDAH ("MOMENTUM MODE")
// ==========================================

// Lista de micro-tareas genéricas por si el CRM está vacío
const defaultMicrotasks = [
    {
        id: 'search_niche',
        text: 'Buscar 5 minutos clientes del nicho de "clínicas dentales" en tu zona.',
        description: 'Vete a la sección "Buscar Leads", escribe "Clínicas dentales" en tu ciudad y pulsa Buscar. Analizaremos qué empresas tradicionales operan en papel o métodos antiguos.',
        action: () => switchView('search')
    },
    {
        id: 'read_inspiration',
        text: 'Buscar ideas inspiradoras de automatización en YouTube o Google.',
        description: 'Tómate exactamente 3 minutos para ver qué automatizaciones está haciendo la gente con Make.com, n8n o Python en canales especializados. Anota 1 idea rápida.',
        action: () => window.open('https://www.youtube.com/results?search_query=automatizaciones+con+ia+para+negocios', '_blank')
    },
    {
        id: 'configure_api',
        text: 'Revisar o configurar tu API Key de Gemini en Ajustes.',
        description: 'Si aún no tienes conectada la IA, ve a Ajustes, haz clic en el enlace para generar una clave de desarrollo gratuita y pégala aquí. ¡Es un solo paso!',
        action: () => switchView('settings')
    }
];

function setupADHDCoach() {
    const selectMode = document.getElementById('coachSelectMode');
    const activeMode = document.getElementById('coachActiveMode');
    const momentumMode = document.getElementById('coachMomentumMode');

    // Ocultar estados secundarios, mostrar selección
    selectMode.style.display = 'block';
    activeMode.style.display = 'none';
    momentumMode.style.display = 'none';

    // Generar dinámicamente las 2 opciones basadas en el estado
    let opt1, opt2;

    if (!state.apiKey) {
        // Opción prioritaria: Configurar API Key
        opt1 = {
            id: 'configure_api',
            text: '🔑 Configurar tu API Key de Gemini en la pestaña de Ajustes (1 min)',
            description: 'Vete a Ajustes y pega tu clave para poder usar la búsqueda por IA.',
            action: () => switchView('settings')
        };
        opt2 = defaultMicrotasks[1]; // Buscar inspiración
    } 
    else if (state.leads.length === 0) {
        // No hay leads en el CRM
        opt1 = {
            id: 'search_audiovisual',
            text: '🎥 Buscar empresas del sector audiovisual/productoras (2 min)',
            description: 'Ve al buscador de Leads y escribe "Productoras de video" en tu región. La IA te dirá empresas locales que necesitan automatización de video.',
            action: () => {
                switchView('search');
                document.getElementById('searchNiche').value = 'Productoras de video';
            }
        };
        opt2 = {
            id: 'search_inmobiliarias',
            text: '🏠 Buscar empresas del sector inmobiliario en Málaga (2 min)',
            description: 'Las inmobiliarias manejan docenas de emails manuales y fotos diariamente. Vamos a buscar algunas para automatizar sus tareas.',
            action: () => {
                switchView('search');
                document.getElementById('searchNiche').value = 'Inmobiliarias';
            }
        };
    } 
    else {
        // Hay leads en el CRM
        const todoLeads = state.leads.filter(l => l.status === 'todo');
        const contactedLeads = state.leads.filter(l => l.status === 'contacted');

        if (todoLeads.length > 0) {
            const firstLead = todoLeads[0];
            opt1 = {
                id: `contact_lead_${firstLead.id}`,
                text: `✉️ Enviar correo inicial a "${firstLead.name}" (2 min)`,
                description: `Abre los detalles de ${firstLead.name}, revisa o adapta el correo que la IA te redactó, cópialo y envíaselo por correo o formulario de contacto. ¡Es solo un email!`,
                action: () => viewSavedLeadProposal(firstLead.id)
            };
        } else {
            opt1 = defaultMicrotasks[0]; // Buscar un nicho
        }

        if (contactedLeads.length > 0) {
            const firstContacted = contactedLeads[0];
            opt2 = {
                id: `check_reply_${firstContacted.id}`,
                text: `💬 Comprobar si respondió "${firstContacted.name}" (1 min)`,
                description: `Entra a tu bandeja de entrada y revisa si has recibido respuesta. Si te ha respondido interesado/a, ¡mueve su tarjeta a la columna de Interesados!`,
                action: () => switchView('crm')
            };
        } else {
            opt2 = defaultMicrotasks[1]; // Buscar inspiración
        }
    }

    // Guardar opciones activas en variables de objeto temporales
    state.opt1 = opt1;
    state.opt2 = opt2;

    // Pintar los botones
    document.getElementById('opt1Text').textContent = opt1.text;
    document.getElementById('opt2Text').textContent = opt2.text;
}

function startMicrotask(optionNum) {
    const selectedTask = optionNum === 1 ? state.opt1 : state.opt2;
    state.activeMicrotask = selectedTask;

    // UI transitions
    document.getElementById('coachSelectMode').style.display = 'none';
    
    const activeMode = document.getElementById('coachActiveMode');
    activeMode.style.display = 'block';
    
    document.getElementById('activeTaskDescription').innerHTML = `
        <strong style="color:var(--color-primary); font-size:16px;">${selectedTask.text}</strong>
        <p style="margin-top: 10px; font-size: 13.5px; color: var(--text-muted); text-align: left;">${selectedTask.description}</p>
    `;

    // Ejecutar acción automática asociada a la tarea
    if (selectedTask.action) {
        selectedTask.action();
    }
}

function completeMicrotask() {
    // Incrementar contador de momentum
    state.momentumCount++;

    // Lluvia de confeti
    confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
    });

    // Ocultar activo, mostrar pantalla de momentum
    document.getElementById('coachActiveMode').style.display = 'none';
    document.getElementById('coachMomentumMode').style.display = 'block';
}

function cancelMicrotask() {
    state.activeMicrotask = null;
    setupADHDCoach();
}

function keepMomentum() {
    // Reiniciar al estado de selección con nuevas tareas dinámicas
    setupADHDCoach();
    
    // Pequeño guiño de animación
    confetti({
        particleCount: 30,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
    });
    confetti({
        particleCount: 30,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
    });
}

function stopMomentum() {
    // Resetear contador y volver al estado inicial del coach
    state.momentumCount = 0;
    setupADHDCoach();
    alert("¡Gran trabajo hoy! La clave para vencer el TDAH es la constancia de pequeños pasos. ¡Nos vemos en tu próxima sesión!");
}

// ==========================================
// PROGRESSIVE WEB APP (PWA) LÓGICA
// ==========================================

let deferredPrompt;

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
                .catch(err => console.error('Error al registrar el Service Worker:', err));
        });
    }
}

// Escuchar el evento de instalación de PWA
window.addEventListener('beforeinstallprompt', (e) => {
    // Evitar que Chrome muestre el diálogo automáticamente de inmediato
    e.preventDefault();
    // Guardar el evento para dispararlo cuando el usuario haga click
    deferredPrompt = e;
    // Mostrar el botón de descarga en el header
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = 'inline-flex';
    }
});

// Función asociada al botón de "Descargar App"
function installApp() {
    if (!deferredPrompt) return;
    // Mostrar el diálogo de instalación nativo
    deferredPrompt.prompt();
    // Esperar la respuesta del usuario
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('El usuario aceptó la instalación de AutoLead AI');
        } else {
            console.log('El usuario declinó la instalación');
        }
        deferredPrompt = null;
        // Ocultar el botón
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
    });
}

// Ocultar el botón si ya está instalada
window.addEventListener('appinstalled', (evt) => {
    console.log('¡AutoLead AI ha sido instalada exitosamente!');
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
});
