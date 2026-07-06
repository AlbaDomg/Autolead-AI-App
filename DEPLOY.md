# Guía de Despliegue en Vercel y Configuración de Dominio para AutoLead AI

Esta guía contiene los pasos detallados para desplegar **AutoLead AI** en la nube utilizando Vercel, asociar tu propio dominio y permitir que cualquier usuario la instale ("descargue") en su ordenador o teléfono móvil.

---

## 🛠️ Paso 1: Subir tu Código a GitHub

Vercel funciona mejor cuando está conectado a un repositorio de GitHub, ya que actualizará tu app automáticamente cada vez que subas cambios.

1. Crea una cuenta gratuita en [GitHub](https://github.com/) si aún no tienes una.
2. Crea un nuevo repositorio público o privado llamado `autolead-ai`.
3. Abre una consola/terminal en la carpeta del proyecto (`c:\Users\albad\OneDrive\Documentos\App Trabajo`) e inicializa Git:
   ```bash
   git init
   git add .
   git commit -m "feat: setup app shell and PWA support"
   ```
4. Vincula tu repositorio local con el de GitHub (los comandos exactos te los proporcionará GitHub al crear el repositorio vacío):
   ```bash
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/autolead-ai.git
   git push -u origin main
   ```

---

## 🚀 Paso 2: Desplegar en Vercel

1. Entra en [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
2. En el panel principal (Dashboard), haz clic en el botón **"Add New..."** y luego selecciona **"Project"**.
3. Importa tu repositorio `autolead-ai` desde la lista de GitHub.
4. En la configuración del proyecto:
   - **Framework Preset**: Selecciona `Other` (ya que es un proyecto HTML estático).
   - **Build and Output Settings**: Déjalos por defecto (no requerimos ningún comando de construcción).
5. Haz clic en **"Deploy"**. En unos segundos tu aplicación estará en línea con un subdominio gratuito de Vercel (ej. `autolead-ai.vercel.app`).

---

## 🌐 Paso 3: Configurar tu Dominio Personalizado

Una vez que tu app esté desplegada en Vercel, puedes asociarle tu propio dominio (ej. `tu-dominio.com` o `crm.tu-dominio.com`).

1. En el panel de tu proyecto en Vercel, ve a la pestaña **Settings** (Ajustes) en el menú superior.
2. En la barra lateral izquierda, selecciona **Domains** (Dominios).
3. Escribe tu dominio en el campo de texto y haz clic en **Add** (Añadir).
   - *Nota: Vercel te preguntará si deseas añadir la versión con `www` (ej. `www.tu-dominio.com`) y redireccionar el tráfico de forma automática. Te recomendamos elegir que **sí**.*
4. Vercel te mostrará el estado de la configuración de DNS indicando que está **Pending** (Pendiente) y te dará la información del registro necesario:
   - **Para el dominio raíz (ej. `tu-dominio.com`)**: Debes configurar un registro de tipo **A** que apunte a la IP de Vercel: `76.76.21.21`.
   - **Para un subdominio (ej. `crm.tu-dominio.com` o `www.tu-dominio.com`)**: Debes configurar un registro de tipo **CNAME** que apunte a `cname.vercel-dns.com`.
5. Entra al panel de administración del registrador donde compraste tu dominio (ej. GoDaddy, Namecheap, Ionos, Cloudflare).
6. Ve a la sección **DNS** o **Manage DNS** y agrega/modifica el registro según lo indicado por Vercel.
7. Vuelve a Vercel y espera unos minutos. El estado cambiará a **Valid** (Válido) en color verde. ¡Vercel generará e instalará un certificado SSL (HTTPS) de forma automática y gratuita!

---

## 📲 Paso 4: Cómo Instalar ("Descargar") la Aplicación

Para que la aplicación sea instalable en los dispositivos, se deben cumplir tres condiciones (las cuales ya están implementadas en tu código):
1. **Certificado SSL (HTTPS)**: Vercel lo proporciona automáticamente.
2. **Manifiesto de PWA**: Ya creado en `manifest.json`.
3. **Service Worker**: Ya creado en `sw.js` y configurado para cachear los recursos.

### En Ordenadores (Windows/Mac/Linux):
1. Abre tu dominio personalizado en Google Chrome o Microsoft Edge.
2. Verás el botón de **"Descargar App"** en la parte superior derecha (Header) de la aplicación, o bien un icono de instalación en la barra de direcciones del navegador.
3. Haz clic en él para instalar la app. Se creará un acceso directo en tu escritorio y se abrirá en una ventana propia, sin la barra de navegación del navegador, como una app nativa.

### En Dispositivos Móviles:
- **Android (Chrome)**: Abre el sitio web, aparecerá un banner inferior sugiriendo "Añadir AutoLead AI a la pantalla de inicio" o podrás pulsar en el botón **"Descargar App"** en la cabecera.
- **iOS / iPhone (Safari)**: Abre tu dominio en Safari, pulsa el botón de **Compartir** (icono de la caja con la flecha hacia arriba) y selecciona la opción **"Añadir a la pantalla de inicio"**. Se instalará inmediatamente con el icono correspondiente.
