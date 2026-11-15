import { element, flagIcon, showEditor } from './ui.mjs';
import { isReaderBookmark } from './core.mjs';
import { READER_CSS } from './styles.mjs';
import { icon } from './icons.mjs';

export class ReaderUI {
  constructor(state) {
    this.state = state; this.doc = state.doc;
    this.style = element(this.doc, 'style', READER_CSS, { 'data-motero-style': '' });
    this.doc.head.append(this.style);
    this.nativeClick = event => {
      const button = event.target.closest?.('.sidebar-toolbar [role=tab]');
      if (button && button.id !== 'viewMoteroBookmarks') this.setActive(false);
    };
    this.doc.addEventListener('click', this.nativeClick, true);
    this.sync();
  }
  sync() {
    if (this.state.closed) return;
    const outline = this.doc.getElementById('viewOutline');
    if (outline && !this.doc.getElementById('viewMoteroBookmarks')) this.attachSidebar(outline);
    if (this.search && !this.search.isConnected) this.doc.querySelector('.sidebar-toolbar .end')?.append(this.search);
    const popup = this.doc.querySelector('.appearance-popup');
    if (popup && !popup.querySelector('[data-motero-crop-settings]')) {
      const reference = popup.querySelector('.group .option > label') || popup;
      this.font = this.doc.defaultView.getComputedStyle(reference).font;
      popup.append(this.cropControls()); this.syncControls();
    }
  }
  setActive(active) {
    this.active = active;
    this.doc.body.classList.toggle('motero-bookmarks-open', active);
    this.updateTabState();
    if (active) this.renderBookmarks();
  }
  updateTabState() {
    const tab = this.doc.getElementById('viewMoteroBookmarks');
    tab?.classList.toggle('active', !!this.active);
    tab?.setAttribute('aria-selected', String(!!this.active));
    const current = this.state.internal._state.sidebarView;
    for (const [id, view] of [['viewThumbnail', 'thumbnails'], ['viewAnnotations', 'annotations'], ['viewOutline', 'outline']]) {
      this.doc.getElementById(id)?.setAttribute('aria-selected', String(!this.active && current === view));
    }
    if (this.search) this.search.hidden = !this.active;
  }
  openBookmarks() {
    this.state.internal.toggleSidebar(true);
    this.sync(); this.setActive(true);
  }
  openAppearance() {
    if (!this.doc.querySelector('.appearance-popup')) this.doc.getElementById('appearance')?.click();
    this.sync();
  }
  attachSidebar(outline) {
    const doc = this.doc, state = this.state, t = state.t;
    const tab = element(doc, 'button', undefined, { id: 'viewMoteroBookmarks', type: 'button',
      class: 'toolbar-button', role: 'tab', tabindex: '-1', 'data-tabstop': '1',
      'aria-controls': 'moteroBookmarksView', 'aria-selected': 'false',
      title: t('Lesezeichen', 'Bookmarks'), 'aria-label': t('Lesezeichen', 'Bookmarks') });
    tab.append(flagIcon(doc, true));
    tab.addEventListener('click', () => this.setActive(true));
    outline.after(tab);
    const panel = element(doc, 'div', undefined, { id: 'moteroBookmarksView', role: 'tabpanel',
      'aria-labelledby': tab.id, 'data-motero-owned': '' });
    const search = element(doc, 'div', undefined, { class: 'search-box motero-search', 'data-motero-owned': '' });
    const magnifier = element(doc, 'button', undefined, { class: 'btn magnifier', type: 'button', title: t('Lesezeichen filtern', 'Filter bookmarks'), 'aria-label': t('Lesezeichen filtern', 'Filter bookmarks'), 'aria-expanded': 'false', 'data-tabstop': '1' });
    magnifier.append(icon(doc, 'search'));
    this.filter = element(doc, 'input', undefined, { type: 'text',
      'aria-label': t('Lesezeichen filtern', 'Filter bookmarks'),
      placeholder: t('Lesezeichen filtern', 'Filter bookmarks'), 'data-tabstop': '1' });
    this.filter.addEventListener('input', () => this.renderBookmarks());
    const expand = expanded => { search.classList.toggle('expanded', expanded); magnifier.setAttribute('aria-expanded', String(expanded)); };
    magnifier.addEventListener('click', () => { expand(true); this.filter.focus(); });
    this.filter.addEventListener('focus', () => expand(true));
    this.filter.addEventListener('blur', () => { if (!this.filter.value) expand(false); });
    this.filter.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation(); this.filter.value = ''; this.renderBookmarks(); expand(false); magnifier.focus();
    });
    search.append(magnifier, this.filter); this.search = search;
    doc.querySelector('.sidebar-toolbar .end').append(search);
    this.list = element(doc, 'div', undefined, { class: 'motero-bookmarks', 'aria-live': 'polite' });
    panel.append(this.list);
    doc.getElementById('sidebarContent').append(panel);
    this.renderBookmarks(); this.updateTabState();
  }
  renderBookmarks() {
    if (!this.list?.isConnected) return;
    const state = this.state, doc = this.doc, t = state.t;
    const query = this.filter.value.toLocaleLowerCase();
    const bookmarks = state.annotations().filter(isReaderBookmark)
      .filter(a => `${a.pageLabel} ${a.comment}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => (a.sortIndex || '').localeCompare(b.sortIndex || ''));
    this.list.replaceChildren();
    for (const mark of bookmarks) {
      const card = element(doc, 'div', undefined, { class: 'annotation', 'data-motero-bookmark-id': mark.id });
      const header = element(doc, 'div', undefined, { class: 'motero-card-header' });
      const icon = flagIcon(doc, true); icon.style.color = mark.color || 'currentColor';
      const go = element(doc, 'button', `${t('Seite', 'Page')} ${mark.pageLabel || mark.position.pageIndex + 1}`,
        { class: 'motero-go', type: 'button', 'data-tabstop': '1' });
      go.addEventListener('click', () => state.reader.navigate({ pageIndex: mark.position.pageIndex }));
      const remove = element(doc, 'button', t('Löschen', 'Delete'), { type: 'button', 'data-tabstop': '1' });
      remove.disabled = !state.canEdit() || mark.readOnly;
      remove.addEventListener('click', () => state.removeBookmark(mark.id).catch(error => state.error(error)));
      header.append(icon, go, remove);
      const comment = (mark.comment || '').replace(/^(?:Bookmark|Lesezeichen)\s*·\s*/i, '');
      card.append(header, element(doc, 'div', comment, { class: 'motero-comment' }));
      this.list.append(card);
    }
    if (!bookmarks.length) this.list.append(element(doc, 'p', t('Keine Lesezeichen.', 'No bookmarks.'), { class: 'motero-empty' }));
  }
  cropControls() {
    const doc = this.doc, state = this.state, t = state.t;
    const section = element(doc, 'section', undefined, { class: 'group motero-crop-settings', 'data-motero-crop-settings': '' });
    if (this.font) section.style.font = this.font;
    section.setAttribute('aria-label', t('PDF-Zuschnitt', 'PDF cropping'));
    const field = (name, title, values) => {
      const row = element(doc, 'div', undefined, { class: 'option' });
      const label = element(doc, 'label', title, { id: 'motero-label-' + name });
      const group = element(doc, 'div', undefined, { class: 'split-toggle', role: 'group', 'data-motero-choice': name, 'data-tabstop': '1', 'aria-labelledby': label.id });
      for (const [value, text, glyph] of values) {
        const button = element(doc, 'button', undefined, { type: 'button', 'data-value': String(value), title: text, 'aria-label': title + ': ' + text, 'aria-pressed': 'false' });
        button.append(icon(doc, glyph));
        button.addEventListener('click', () => state.change({ ...state.options, [name]: value })); group.append(button);
      }
      row.append(label, group); section.append(row);
    };
    field('mode', t('PDF-Zuschnitt', 'PDF cropping'), [['off', t('Original', 'Original'), 'off'],
      ['automatic', t('Automatisch', 'Automatic'), 'automatic'], ['manual', t('Manuell', 'Manual'), 'manual']]);
    field('fit', t('Anpassen', 'Fit'), [['width', t('Breite', 'Width'), 'width'],
      ['height', t('Höhe', 'Height'), 'height'], ['page', t('Ganze Seite', 'Whole page'), 'page']]);
    const marginRow = element(doc, 'div', undefined, { class: 'option' });
    const marginLabel = element(doc, 'label', t('Rand', 'Margin'), { for: 'motero-margin' });
    const margin = element(doc, 'input', undefined, { type: 'range', min: '0', max: '15', step: '.5',
      name: 'margin', id: 'motero-margin', 'aria-label': t('Rand (%)', 'Margin (%)'), 'data-tabstop': '1' });
    margin.value = String(state.options.margin * 100);
    const value = element(doc, 'span', `${margin.value}%`, { class: 'value' });
    margin.addEventListener('input', () => { value.textContent = margin.value + '%'; });
    margin.addEventListener('change', () => state.change({ ...state.options, margin: Number(margin.value) / 100 }));
    const slider = element(doc, 'div', undefined, { class: 'motero-margin-control' });
    slider.append(margin, value); marginRow.append(marginLabel, slider); section.append(marginRow);
    const choices = [[false, t('Ausschließen', 'Exclude'), 'exclude'], [true, t('Einschließen', 'Include'), 'include']];
    field('includeMarginalia', t('Randnotizen', 'Marginal notes'), choices);
    field('includeReferences', t('Randverweise', 'References'), choices);
    const actions = element(doc, 'div', undefined, { class: 'motero-actions' });
    const action = (title, fn) => {
      const button = element(doc, 'button', title, { type: 'button', class: 'motero-action', 'data-tabstop': '1' });
      button.addEventListener('click', fn); actions.append(button); return button;
    };
    action(t('Rahmen bearbeiten…', 'Edit frame…'), () => {
      this.doc.getElementById('appearance')?.click();
      showEditor(state).catch(error => state.error(error));
    });
    action(t('Zurücksetzen', 'Reset'), () => {
      state.change({ ...state.options, mode: 'off', crops: {} });
    });
    section.append(actions); return section;
  }
  syncControls() {
    for (const group of this.doc.querySelectorAll('[data-motero-choice]')) {
      const value = String(this.state.options[group.getAttribute('data-motero-choice')]);
      for (const button of group.querySelectorAll('button')) {
        const active = button.getAttribute('data-value') === value;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      }
    }
  }
  destroy() {
    this.setActive(false);
    this.doc.removeEventListener('click', this.nativeClick, true);
    this.doc.getElementById('viewMoteroBookmarks')?.remove();
    this.doc.getElementById('moteroBookmarksView')?.remove();
    this.search?.remove();
    for (const node of this.doc.querySelectorAll('[data-motero-crop-settings]')) node.remove();
    this.style.remove();
  }
}
