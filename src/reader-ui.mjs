import { element, flagIcon, showEditor } from './ui.mjs';
import { isReaderBookmark } from './core.mjs';
import { READER_CSS } from './styles.mjs';

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
    const popup = this.doc.querySelector('.appearance-popup');
    if (popup && !popup.querySelector('[data-motero-crop-settings]')) popup.append(this.cropControls());
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
    outline.before(tab);
    const panel = element(doc, 'div', undefined, { id: 'moteroBookmarksView', role: 'tabpanel',
      'aria-labelledby': tab.id, 'data-motero-owned': '' });
    const search = element(doc, 'div', undefined, { class: 'motero-search' });
    this.filter = element(doc, 'input', undefined, { type: 'search',
      'aria-label': t('Lesezeichen filtern', 'Filter bookmarks'),
      placeholder: t('Lesezeichen filtern', 'Filter bookmarks'), 'data-tabstop': '1' });
    this.filter.addEventListener('input', () => this.renderBookmarks());
    search.append(this.filter);
    this.list = element(doc, 'div', undefined, { class: 'motero-bookmarks', 'aria-live': 'polite' });
    panel.append(search, this.list);
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
    section.append(element(doc, 'h3', t('PDF-Zuschnitt', 'PDF cropping')));
    const field = (name, title, values, selected) => {
      const row = element(doc, 'div', undefined, { class: 'option' });
      const label = element(doc, 'label', title);
      const control = element(doc, 'select', undefined, { name, 'data-tabstop': '1', 'aria-label': title });
      for (const [value, text] of values) control.append(element(doc, 'option', text, { value }));
      control.value = selected;
      control.addEventListener('change', () => state.change({ ...state.options, [name]: control.value }));
      label.append(control); row.append(label); section.append(row); return control;
    };
    field('mode', t('Zuschnitt ', 'Crop '), [['off', t('Original', 'Original')],
      ['automatic', t('Automatisch', 'Automatic')], ['manual', t('Manuell', 'Manual')]], state.options.mode);
    field('fit', t('Anpassen ', 'Fit '), [['width', t('Breite', 'Width')],
      ['height', t('Höhe', 'Height')], ['page', t('Ganze Seite', 'Whole page')]], state.options.fit);
    const marginRow = element(doc, 'div', undefined, { class: 'option' });
    const marginLabel = element(doc, 'label', t('Rand', 'Margin'));
    const margin = element(doc, 'input', undefined, { type: 'range', min: '0', max: '15', step: '.5',
      name: 'margin', 'aria-label': t('Rand (%)', 'Margin (%)'), 'data-tabstop': '1' });
    margin.value = String(state.options.margin * 100);
    const value = element(doc, 'span', `${margin.value}%`, { class: 'value' });
    margin.addEventListener('input', () => { value.textContent = margin.value + '%'; });
    margin.addEventListener('change', () => state.change({ ...state.options, margin: Number(margin.value) / 100 }));
    marginLabel.append(margin); marginRow.append(marginLabel, value); section.append(marginRow);
    const marginalRow = element(doc, 'div', undefined, { class: 'option' });
    const marginalLabel = element(doc, 'label', t('Marginalien beibehalten', 'Keep marginal notes'));
    const marginal = element(doc, 'input', undefined, { type: 'checkbox', class: 'switch', name: 'includeMarginalia', 'data-tabstop': '1' });
    marginal.checked = state.options.includeMarginalia;
    marginal.addEventListener('change', () => state.change({ ...state.options, includeMarginalia: marginal.checked }));
    marginalLabel.append(marginal); marginalRow.append(marginalLabel); section.append(marginalRow);
    const actions = element(doc, 'div', undefined, { class: 'motero-actions' });
    const action = (title, fn) => {
      const button = element(doc, 'button', title, { type: 'button', class: 'motero-action', 'data-tabstop': '1' });
      button.addEventListener('click', fn); actions.append(button); return button;
    };
    action(t('Rahmen bearbeiten…', 'Edit frame…'), () => {
      this.doc.getElementById('appearance')?.click();
      showEditor(state).catch(error => state.error(error));
    });
    action(t('Originalansicht', 'Original view'), () => state.togglePeek());
    action(t('Zurücksetzen', 'Reset'), () => {
      state.change({ ...state.options, mode: 'off', crops: {} });
      section.querySelector('[name=mode]').value = 'off';
    });
    section.append(actions); return section;
  }
  destroy() {
    this.setActive(false);
    this.doc.removeEventListener('click', this.nativeClick, true);
    this.doc.getElementById('viewMoteroBookmarks')?.remove();
    this.doc.getElementById('moteroBookmarksView')?.remove();
    for (const node of this.doc.querySelectorAll('[data-motero-crop-settings]')) node.remove();
    this.style.remove();
  }
}
