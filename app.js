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

    // 2. Cargar Leads de localStorage (o cargar plantilla cualificada por defecto)
    const savedLeads = localStorage.getItem('autolead_leads');
    if (savedLeads) {
        try {
            state.leads = JSON.parse(savedLeads);
        } catch (e) {
            console.error("Error al parsear leads guardados", e);
            state.leads = sampleQualifiedLeads;
        }
    } else {
        state.leads = sampleQualifiedLeads;
        saveLeadsToStorage();
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
// MÓDULO 1: BUSCADOR Y CUALIFICADOR DE LEADS CON IA
// ==========================================

// Leads cualificados de muestra (Clínicas privadas de Málaga - Alto Ticket)
const sampleQualifiedLeads = [
    {
        id: 101,
        name: "Clínica Dr. Antonio Burgos",
        specialty: "Injerto & Salud Capilar (Técnica FUE)",
        decisionMaker: "Dr. Antonio Burgos (Director Médico & Fundador)",
        email: "info@doctorantonioburgos.com",
        phone: "+34 627 01 25 36 (WhatsApp Business)",
        web: "https://doctorantonioburgos.com",
        instagram: "@dr.antonioburgos",
        qualificationReason: "Cumple 3/3 criterios: Campañas de captación activa de microinjerto en Meta Ads, equipo médico multidisciplinar propio y WhatsApp Business de atención manual sin agendamiento IA.",
        description: "Clínica de referencia en Málaga especializada en microinjerto capilar FUE y tratamientos de salud capilar. Alto volumen diario de solicitudes por publicidad.",
        type: "optimizacion",
        scoringScore: "3/3",
        status: "todo"
    },
    {
        id: 102,
        name: "Clínicas Rincón Dental",
        specialty: "Implantología Digital & Ortodoncia Invisible",
        decisionMaker: "Dr. Juan Carlos Rincón (Socio Director) / Gerente de Operaciones",
        email: "info@clinicasrincondental.com",
        phone: "+34 690 12 34 56 (WhatsApp) | 900 525 284",
        web: "https://clinicasrincondental.com",
        instagram: "@rincondental",
        qualificationReason: "Cumple 3/3 criterios: Anuncios activos en Meta Ads para Invisalign y carillas, red de más de 3 sedes físicas en Málaga y formulario web tradicional sin asistente virtual.",
        description: "Red de clínicas dentales en Málaga con quirófanos propios y unidades de estética dental avanzada de alto ticket.",
        type: "optimizacion",
        scoringScore: "3/3",
        status: "todo"
    },
    {
        id: 103,
        name: "Clínica Esbeltia Málaga",
        specialty: "Cirugía Capilar FUE & Medicina Estética",
        decisionMaker: "Dr. Francisco Javier Ruiz Solanes (Director Médico & Cirujano Capilar)",
        email: "atencion@clinicaesbeltia.es",
        phone: "+34 616 46 44 53 (WhatsApp Business) | 951 10 61 22",
        web: "https://www.clinicaesbeltia.es",
        instagram: "@clinicaesbeltia",
        qualificationReason: "Cumple 3/3 criterios: Promociones activas en redes sociales para valoración capilar gratuita, canal principal en WhatsApp Business con respuesta manual y equipo de más de 3 cirujanos.",
        description: "Centro especializado en injerto capilar FUE y medicina estética facial/corporal en Málaga capital.",
        type: "iniciacion",
        scoringScore: "3/3",
        status: "todo"
    },
    {
        id: 104,
        name: "Your Clinic Teatinos",
        specialty: "Implantología Carga Inmediata & Estética Dental",
        decisionMaker: "Director/a de Operaciones & Patient Experience",
        email: "info@yourclinic.es",
        phone: "+34 689 72 03 83 (WhatsApp Business)",
        web: "https://yourclinic.es",
        instagram: "@yourclinic_",
        qualificationReason: "Cumple 2/3 criterios: Campañas de valoraciones gratuitas en Instagram, canal directo de WhatsApp Business activo y equipo de varios implantólogos.",
        description: "Clínica dental tecnológica en Teatinos enfocada en estética dental y rehabilitación sobre implantes.",
        type: "iniciacion",
        scoringScore: "2/3",
        status: "todo"
    },
    {
        id: 105,
        name: "Meyer & Alcaide Dermatología Capilar",
        specialty: "Tricología Avanzada & Estética Facial",
        decisionMaker: "Dr. Antonio Alcaide & Dra. Teresa Meyer (Codirectores Médicos)",
        email: "consultas@meyeralcaide.com",
        phone: "+34 678 90 12 34 (WhatsApp) | 951 25 67 89",
        web: "https://meyeralcaide.com",
        instagram: "@meyeralcaidedermatologia",
        qualificationReason: "Cumple 3/3 criterios: Dos codirectores de alto prestigio en Top Doctors, publicidad activa en línea para salud capilar y formulario tradicional sin triaje IA 24/7.",
        description: "Centro médico especializado en dermatología médica, estética y soluciones capilares personalizadas.",
        type: "optimizacion",
        scoringScore: "3/3",
        status: "todo"
    },
    {
        id: 106,
        name: "Clínica Dra. Mariana Arocha",
        specialty: "Alta Estética Dental & Diseño de Sonrisa 3D",
        decisionMaker: "Dra. Mariana Arocha (Propietaria & Directora Médica)",
        email: "contacto@marianaarocha.com",
        phone: "+34 644 11 22 33 (WhatsApp) | 952 06 15 20",
        web: "https://marianaarocha.com",
        instagram: "@dra.marianaarocha",
        qualificationReason: "Cumple 2/3 criterios: Fuerte presencia en Instagram con casos antes/después de carillas, agendamiento telefónico tradicional y atención personalizada a clientes alto ticket.",
        description: "Clínica boutique en Málaga dedicada exclusivamente al diseño de sonrisa, Invisalign y porcelana avanzada.",
        type: "iniciacion",
        scoringScore: "2/3",
        status: "todo"
    }
];

function applyPreset(niche, location) {
    document.getElementById('searchNiche').value = niche;
    document.getElementById('searchLocation').value = location;
    
    // Si elegimos el preset de salud y estética, mostramos directamente los prospectos de muestra cualificados si no hay búsquedas
    if (niche.includes('Salud') || niche.includes('Dentales') || niche.includes('Capilar') || niche.includes('Medicina Estética')) {
        state.searchResults = sampleQualifiedLeads;
        renderSearchResults(sampleQualifiedLeads);
    } else {
        searchLeads();
    }
}

async function searchLeads() {
    const nicheInput = document.getElementById('searchNiche').value.trim();
    const locationInput = document.getElementById('searchLocation').value.trim() || 'España (Priorizando Málaga)';

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

    const prompt = `Eres un sistema experto de cualificación comercial y prospección comercial de alto ticket para soluciones de agendamiento y automatización con IA.

OBJETIVO DE LA BÚSQUEDA:
Identificar clínicas privadas de salud, medicina estética y cirugía de alto ticket en ESPAÑA (Ubicación prioritaria: "${locationInput}").
ALCANCE GEOGRÁFICO: PRIORIZA la provincia de Málaga (Málaga capital, Marbella, etc.), pero INCLUYE TAMBIÉN otras principales ciudades de España (Madrid, Barcelona, Valencia, Sevilla, etc.). Genera un mix donde Málaga tenga prioridad pero abarque la geografía española.

PERFILES DE DECISORES A EXTRAER:
1. Director/a Médico/a o Propietario/a (Owner / Founder / Socio Director).
2. Director/a de Operaciones / Gerente de Clínica.
3. Responsable de Marketing / Growth / Patient Experience.

CRITERIOS DE CUALIFICACIÓN SCORING (Deben cumplir al menos 2 de 3):
- Actividad en Marketing: Campañas activas en Meta Ads Library, Google Ads o perfil activo de Instagram.
- Tamaño mínimo: 2 o más doctores/profesionales en el equipo o más de 1 sede física.
- Canal de contacto directo: WhatsApp Business o formulario web visible.

Devuelve estrictamente un array en formato JSON con 5 objetos que contengan exactamente estos 9 campos:
[
  {
    "name": "Nombre exacto de la clínica/empresa",
    "specialty": "Especialidad Principal (ej: Implantología y Estética Dental, Injerto Capilar FUE, etc.)",
    "decisionMaker": "Nombre del Decisor y Cargo (ej: Dr. Nombre Apellido - Director Médico)",
    "email": "Email directo o corporativo directo",
    "phone": "Teléfono / WhatsApp de contacto",
    "web": "URL de la Web o Perfil de Instagram",
    "instagram": "Usuario de Instagram (ej: @clinica_ejemplo)",
    "qualificationReason": "Razón detallada de cualificación (especifica qué 2 o 3 criterios de scoring cumple)",
    "description": "Breve descripción de su volumen de pacientes y oportunidad de automatización de citas con IA",
    "type": "iniciacion" o "optimizacion",
    "scoringScore": "3/3" o "2/3"
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
                <div class="empty-state-text">Ocurrió un error al buscar y cualificar leads:</div>
                <div style="font-family: monospace; font-size: 12px; color: var(--color-danger); margin-top: 8px; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 4px; max-width: 500px; margin-left: auto; margin-right: auto; word-break: break-all;">
                    ${e.message}
                </div>
                <div class="empty-state-text" style="margin-top: 12px; font-size: 12.5px;">Verifica tu clave en Ajustes o haz clic en las plantillas rápidas de Málaga para cargar los prospectos pre-cualificados.</div>
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
                <div class="empty-state-text">No se encontraron leads. Intenta seleccionar una de las plantillas rápidas arriba.</div>
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

        const scoreBadge = lead.scoringScore 
            ? `<span class="lead-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--color-success); border: 1px solid rgba(16, 185, 129, 0.3);">⭐ Score: ${lead.scoringScore}</span>`
            : `<span class="lead-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--color-success);">⭐ Score: 3/3</span>`;

        const specialtyText = lead.specialty || "Salud y Estética";
        const decisionMakerText = lead.decisionMaker || "Director/a Médico/a o Gerente";
        const emailText = lead.email || "Contacto corporativo directo";
        const phoneText = lead.phone || "WhatsApp Business activo";
        const qualificationReason = lead.qualificationReason || lead.description;

        card.innerHTML = `
            <div>
                <div class="lead-header">
                    <div>
                        <h3 class="lead-title">${lead.name}</h3>
                        <div style="font-size: 12px; color: var(--color-info); font-weight: 600; margin-top: 2px;">
                            🏥 ${specialtyText}
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                        ${scoreBadge}
                        ${typeBadge}
                    </div>
                </div>
                
                <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); padding: 10px; margin: 10px 0; border: 1px solid var(--border-card);">
                    <div style="font-size: 12.5px; margin-bottom: 4px;">
                        <strong style="color: var(--text-main);">👤 Decisor clave:</strong> ${decisionMakerText}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                        <span>✉️ ${emailText}</span>
                        <span>📱 ${phoneText}</span>
                    </div>
                </div>

                <div style="font-size: 12px; color: var(--color-warning); background: rgba(245, 158, 11, 0.08); padding: 8px 10px; border-radius: var(--radius-sm); border-left: 3px solid var(--color-warning); margin-bottom: 12px;">
                    <strong>💡 Razón de Cualificación:</strong> ${qualificationReason}
                </div>

                <div class="lead-meta">
                    <i data-lucide="globe" style="width:14px;height:14px;"></i>
                    <a href="${lead.web && lead.web.startsWith('http') ? lead.web : 'https://' + (lead.web || '#')}" target="_blank">${lead.web || 'Ver Sitio Web'}</a>
                    ${lead.instagram ? `
                        <span style="color:var(--text-muted); margin: 0 4px;">|</span>
                        <i data-lucide="instagram" style="width:14px;height:14px;"></i>
                        <a href="https://instagram.com/${lead.instagram.replace('@','')}" target="_blank">${lead.instagram}</a>
                    ` : ''}
                    <span style="color:var(--text-muted); margin: 0 4px;">|</span>
                    <i data-lucide="search" style="width:12px;height:12px;"></i>
                    <a href="https://www.google.com/search?q=${encodeURIComponent(lead.name + ' ' + (document.getElementById('searchLocation').value.trim() || 'Málaga'))}" target="_blank" style="font-size:11px;">Buscar en Google</a>
                </div>
            </div>
            <div class="lead-actions" style="margin-top: 14px;">
                <button class="action-btn" style="flex-grow:1; padding: 10px 14px; font-size:13px;" onclick="selectLeadForAnalysis(${index})">
                    <i data-lucide="sparkles" style="width:14px;height:14px;"></i> Generar Propuesta de IA
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
    const prompt = `Eres un consultor experto en estrategia digital y Experiencia del Paciente para clínicas médicas y de estética de alto ticket.
    
    Vas a redactar un diagnóstico técnico y un mensaje inicial CONCISO Y ALTAMENTE ATRACTIVO para la siguiente clínica:
    - Nombre de la clínica: ${lead.name}
    - Especialidad: ${lead.specialty || 'Salud y Estética'}
    - Decisor / Cargo objetivo: ${lead.decisionMaker || 'Director/a Médico/a o Propietario/a'}
    - Sitio web / Redes: ${lead.web} ${lead.instagram || ''}
    - Razón de cualificación: ${lead.qualificationReason || lead.description}

    Genera exactamente dos bloques de información:
    1. Un array de 3 propuestas de optimización consultiva para esta clínica:
       - Propuesta 1: Asistente conversacional IA en WhatsApp para agendamiento 24/7 sin fricción.
       - Propuesta 2: Triaje y pre-cualificación inteligente de pacientes previa a la primera consulta.
       - Propuesta 3: Secuencia automatizada de acompañamiento y seguimiento de presupuestos.
       Cada idea debe incluir:
       - "title": Título consultivo y profesional.
       - "problem": El área de mejora detectada en la experiencia del paciente (ej: respuesta fuera de horario).
       - "solution": La optimización tecnológica recomendada.
       - "benefit": Impacto en conversión de citas y ahorro de tiempo.
       
    2. Un MENSAJE DE CONTACTO CONCISO, INTRIGANTE Y ATRACTIVO (Máximo 80-100 palabras):
       - REGLAS DE ORO:
         * Formato ultramóvil: Párrafos muy cortos (1-2 frases máximo).
         * Sin rodeos ni relleno corporativo aburrido.
         * Gancho de curiosidad irresistible: Menciona un detalle específico de su clínica (ej. las solicitudes que entran fuera de horario comercial o fines de semana).
         * Llamada a la acción (CTA) de fricción nula: No pidas una reunión larga; ofrece enviar un vídeo-demo de 90 segundos por WhatsApp o email.
       - ESTRUCTURA EXACTA:
         "Hola [Nombre/Cargo de ${lead.decisionMaker || 'Director/a'}], enhorabuena por vuestro trabajo en ${lead.name}.

         Revisando vuestra captación digital noté un detalle clave: vuestros anuncios y redes mueven mucho interés las 24h, pero las solicitudes que entran fuera del horario de recepción se quedan sin agendar hasta el lunes.

         Hemos diseñado un asistente con IA en WhatsApp que pre-cualifica al paciente y le agenda la cita en 45 segundos, incluso a las 11 de la noche.

         ¿Te parece si te envío un vídeo-demo de 90 segundos para que veas cómo funcionaría en ${lead.name}?

         Un saludo,
         [Tu Nombre]"

    Devuelve strictly un objeto JSON con esta estructura exacta:
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
      "email": "Texto conciso del mensaje..."
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

        const specialtyTag = lead.specialty ? `<div style="font-size:11px; color:var(--color-info); font-weight:600; margin-bottom:4px;">🏥 ${lead.specialty}</div>` : '';
        const decisionMakerTag = lead.decisionMaker ? `<div style="font-size:11px; color:var(--text-main); margin-bottom:4px;">👤 <strong>Decisor:</strong> ${lead.decisionMaker}</div>` : '';
        const contactTag = (lead.email || lead.phone) ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">📱 ${lead.phone || ''} | ✉️ ${lead.email || ''}</div>` : '';
        const scoreBadge = lead.scoringScore ? `<span style="font-size:10px; background:rgba(16,185,129,0.2); color:var(--color-success); padding:2px 6px; border-radius:4px; font-weight:600;">⭐ ${lead.scoringScore}</span>` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 4px;">
                <div class="kanban-card-title">${lead.name}</div>
                <div style="display:flex; gap:4px;">
                    ${scoreBadge}
                    <span title="${lead.type === 'iniciacion' ? 'Iniciación' : 'Optimización'}">${typeIcon}</span>
                </div>
            </div>
            ${specialtyTag}
            ${decisionMakerTag}
            ${contactTag}
            <p class="kanban-card-desc" style="font-size:11.5px; line-height:1.4; color:var(--text-muted);">${(lead.qualificationReason || lead.description).substring(0, 95)}...</p>
            <div class="kanban-card-actions" style="margin-top:8px;">
                <button class="card-move-btn" style="color:var(--color-danger);" onclick="deleteLead('${lead.id}')">
                    <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                </button>
                <button class="card-move-btn" style="color:var(--color-info);" onclick="viewSavedLeadProposal('${lead.id}')">
                    Ver propuesta
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
        text: '🏥 Buscar clínicas de salud y medicina estética de alto ticket (2 min)',
        description: 'Vete a la sección "Buscar Leads" para cualificar clínicas dentales, medicina estética o cirugía en España (priorizando Málaga). Extraeremos decisores y canales directos.',
        action: () => applyPreset('Clínicas de Salud y Estética (Alto Ticket)', 'España (Priorizando Málaga)')
    },
    {
        id: 'search_capilar',
        text: '💇‍♂️ Buscar clínicas de injerto y salud capilar FUE (2 min)',
        description: 'Las clínicas capilares invierten activamente en publicidad pero pierden solicitudes fuera de horario. Vamos a buscar prospectos ideales para agendamiento con IA.',
        action: () => applyPreset('Clínicas de Injerto y Salud Capilar FUE', 'España (Priorizando Málaga)')
    },
    {
        id: 'configure_api',
        text: '🔑 Revisar o configurar tu API Key de Gemini en Ajustes.',
        description: 'Si aún no tienes conectada la IA, ve a Ajustes y pega tu clave de desarrollo. ¡Es un solo paso!',
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

    // Generar dinámicamente las 2 opciones basadas en el estado del CRM
    let opt1, opt2;

    const todoLeads = state.leads.filter(l => l.status === 'todo');
    const contactedLeads = state.leads.filter(l => l.status === 'contacted');

    if (todoLeads.length > 0) {
        const firstLead = todoLeads[0];
        opt1 = {
            id: `contact_lead_${firstLead.id}`,
            text: `✉️ Revisar mensaje consultivo para "${firstLead.name}" (2 min)`,
            description: `Abre los detalles de ${firstLead.name}, revisa el mensaje de enfoque consultivo personalizado por la IA y cópialo para su envío. ¡Es solo 1 minuto!`,
            action: () => viewSavedLeadProposal(firstLead.id)
        };
    } else {
        opt1 = defaultMicrotasks[0]; // Buscar clínicas de salud y estética
    }

    if (contactedLeads.length > 0) {
        const firstContacted = contactedLeads[0];
        opt2 = {
            id: `check_reply_${firstContacted.id}`,
            text: `💬 Comprobar si respondió "${firstContacted.name}" (1 min)`,
            description: `Entra a tu bandeja de entrada o WhatsApp y revisa si has recibido respuesta. Si te ha respondido interesado/a, ¡mueve su tarjeta a la columna de Interesados!`,
            action: () => switchView('crm')
        };
    } else {
        opt2 = defaultMicrotasks[1]; // Buscar clínicas capilares
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
