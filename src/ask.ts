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
