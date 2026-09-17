/* Shared display-language preference for Knox pages. AI replies use the same stored preference on the server. */
(function () {
  const spanish = {
    'Log in': 'Iniciar sesión', 'Login': 'Iniciar sesión', 'Sign up': 'Registrarse', 'Get started': 'Comenzar',
    'Ask Knox': 'Pregunta a Knox', 'Calculator': 'Calculadora', 'Learn': 'Aprender', 'Study Hub': 'Centro de estudio',
    'Chrome extension': 'Extensión de Chrome', 'Your history': 'Tu historial', 'History': 'Historial', 'Settings': 'Configuración',
    'Account & Plan': 'Cuenta y plan', 'Account & plan': 'Cuenta y plan', 'Dark mode': 'Modo oscuro', 'Light mode': 'Modo claro',
    'Contact support': 'Contactar soporte', 'Send feedback': 'Enviar comentarios', 'Upgrade': 'Mejorar plan', 'Free plan': 'Plan gratuito',
    'Back to Knox': 'Volver a Knox', 'Response style': 'Estilo de respuesta', 'Display language': 'Idioma de pantalla',
    'Appearance': 'Apariencia', 'What are we tackling today?': '¿Qué vamos a resolver hoy?',
    'Pick a topic below to get started — or type your own question in the box.': 'Elige un tema para comenzar o escribe tu propia pregunta.',
    'Ask Knox anything...': 'Pregúntale lo que sea a Knox...'
  };
  const originals = new WeakMap();
  function replaceText(root, isSpanish) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest('script, style, code, pre, textarea, #chatThread, #knoxBoot, #profile, #signedIn')) return;
      const previous = originals.get(node);
      if (!previous || (node.nodeValue !== previous.original && node.nodeValue !== previous.translated)) {
        const text = node.nodeValue.trim();
        if (!Object.hasOwn(spanish, text)) return;
        originals.set(node, { original: node.nodeValue, translated: node.nodeValue.replace(text, spanish[text]) });
      }
      const pair = originals.get(node);
      node.nodeValue = isSpanish ? pair.translated : pair.original;
    });
  }
  function applyLanguage() {
    let language;
    try { language = localStorage.getItem('knoxLanguage') || JSON.parse(localStorage.getItem('knoxLearningPreferences') || '{}').language; } catch (_) {}
    document.documentElement.lang = language === 'spanish' ? 'es' : 'en';
    if (document.body) replaceText(document.body, language === 'spanish');
  }
  window.addEventListener('DOMContentLoaded', applyLanguage);
  window.addEventListener('storage', event => {
    if (event.key === 'knoxLanguage' || event.key === 'knoxLearningPreferences') applyLanguage();
    if (event.key === 'knoxTheme') { document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light'; window.syncDarkModeIcon?.(); }
  });
  window.knoxApplyLanguage = applyLanguage;
})();
