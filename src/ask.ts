// Rückfrage mit mehreren Antworten, im Aussehen des Fensters »Hub verbinden«.
// Alle Texte gehen als Text in die Seite – auch Namen aus fremden Dateien.

export interface AskOptions {
  title: string;
  /** Absätze über der Aufzählung */
  text: string[];
  /** Aufzählung: der Name fett, darunter die Erklärung; `warn` hebt den Eintrag hervor */
  items?: {name: string; note: string; warn?: boolean}[];
  /** Knöpfe von links nach rechts; `primary` ist der hervorgehobene */
  buttons: {id: string; label: string; primary?: boolean}[];
}

/** Liefert die Kennung des gewählten Knopfs – oder null, wenn das Fenster mit ✕ oder Esc geschlossen wurde. */
export function ask(opts: AskOptions): Promise<string | null> {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const node = document.createElement(tag); if (cls) node.className = cls; node.textContent = text; return node;
  };
  return new Promise((resolve) => {
    const dialog = el('dialog', 'connect ask');
    const done = (id: string | null) => { dialog.close(); dialog.remove(); resolve(id); };

    const head = dialog.appendChild(el('div', 'connect-head'));
    head.appendChild(el('h2', '', opts.title));
    const x = head.appendChild(el('button', 'btn', '✕'));
    x.type = 'button'; x.setAttribute('aria-label', 'Abbrechen');
    x.addEventListener('click', () => done(null));

    const body = dialog.appendChild(el('div', 'ask-body'));
    for (const p of opts.text) body.appendChild(el('p', '', p));
    if (opts.items?.length){
      const list = body.appendChild(el('ul', 'ask-list'));
      for (const item of opts.items){
        const li = list.appendChild(el('li', item.warn ? 'warn' : ''));
        li.append(el('b', '', item.name), el('span', '', item.note));
      }
    }

    const actions = dialog.appendChild(el('div', 'connect-actions'));
    for (const b of opts.buttons){
      const button = actions.appendChild(el('button', b.primary ? 'btn primary' : 'btn', b.label));
      button.type = 'button';
      button.addEventListener('click', () => done(b.id));
    }
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });   // Esc-Taste
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

/**
 * Fragt einen Text oder eine Zahl ab – ersetzt Blocklys eigenes Eingabefenster am Handy und Tablet.
 * Das Fenster sitzt am oberen Rand: Mittig verdeckt es die Bildschirmtastatur, und manche Browser
 * am iPad schieben dann die ganze Seite so weit hoch, dass das Eingabefeld oben herausrutscht.
 * Liefert null, wenn abgebrochen wurde.
 */
export function askText(title: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog'); dialog.className = 'connect ask ask-text';
    const form = dialog.appendChild(document.createElement('form')); form.method = 'dialog';
    const label = form.appendChild(document.createElement('label')); label.textContent = title;
    const input = label.appendChild(document.createElement('input'));
    input.type = 'text'; input.value = value; input.autocomplete = 'off'; input.enterKeyHint = 'done';
    // Zahlen bekommen die Zifferntastatur
    if (/^-?[\d.,]*$/.test(value)) input.inputMode = 'decimal';
    const actions = form.appendChild(document.createElement('div')); actions.className = 'connect-actions';
    const button = (text: string, cls: string) => { const b = actions.appendChild(document.createElement('button')); b.type = 'button'; b.className = cls; b.textContent = text; return b; };
    const cancel = button('Abbrechen', 'btn'), ok = button('OK', 'btn primary');

    // dem sichtbaren Ausschnitt folgen, falls der Browser die Seite unter der Tastatur verschiebt
    const view = window.visualViewport;
    const follow = () => { dialog.style.top = `${(view?.offsetTop ?? 0) + 12}px`; };
    const done = (result: string | null) => {
      view?.removeEventListener('scroll', follow); view?.removeEventListener('resize', follow);
      dialog.close(); dialog.remove(); resolve(result);
    };
    view?.addEventListener('scroll', follow); view?.addEventListener('resize', follow);
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(input.value));
    form.addEventListener('submit', (e) => { e.preventDefault(); done(input.value); });   // Eingabetaste
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });        // Esc-Taste
    document.body.appendChild(dialog);
    follow();
    dialog.showModal();
    input.focus(); input.select();
  });
}
