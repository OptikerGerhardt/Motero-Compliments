import { contentData, waive } from './bridge.mjs';
import { element } from './ui.mjs';
import { detectHeadings, MAX_OUTLINE_ENTRIES, outlineEntries, validOutlineEntry } from './outline.mjs';
import { getReadingTextLines } from './vendor/motero/reading-layout.mjs';

export async function writeOutlineCopy(rootURI, source, destination, entries) {
  if (source === destination) throw Error('Choose a new PDF path');
  const scope = { setTimeout };
  Services.scriptloader.loadSubScriptWithOptions(rootURI + 'outline-pdf.js', { target: scope, allowUnsafeURL: true });
  const result = await scope.MoteroOutlinePDF.appendOutline(await IOUtils.read(source), entries);
  await IOUtils.write(destination, result, { mode: 'create' });
}

async function saveCopy(state, entries) {
  const source = await state.reader._item.getFilePathAsync();
  if (!source) throw Error(state.t('PDF-Datei nicht gefunden', 'PDF file not found'));
  const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
  const picker = new FilePicker();
  picker.init(Zotero.getMainWindow(), state.t('PDF-Kopie speichern', 'Save PDF copy'), picker.modeSave);
  picker.appendFilter('PDF', '*.pdf');
  picker.defaultExtension = 'pdf';
  picker.defaultString = source.split(/[/\\]/).at(-1).replace(/\.pdf$/i, '') + '-outline.pdf';
  const selection = await picker.show();
  if (selection === picker.returnCancel) return false;
  if (selection !== picker.returnOK) throw Error(state.t('Wähle eine neue Datei', 'Choose a new file'));
  if (state.closed) return false;
  await writeOutlineCopy(state.rootURI, source, picker.file, entries);
  return true;
}

export function openOutlineEditor(state) {
  const view = state.activeView();
  if (!view || state.doc.querySelector('[data-motero-outline-editor]')) return;
  const { doc, t } = state;
  const pages = view.viewer.pagesCount;
  const entries = [];
  const dialog = element(doc, 'dialog', undefined, { class: 'motero-crop-editor', 'data-motero-outline-editor': '' });
  dialog.append(element(doc, 'h2', t('PDF-Inhaltsverzeichnis', 'PDF outline')));
  const field = (parent, label, input) => {
    const row = element(doc, 'label', label);
    row.append(input);
    parent.append(row);
    return input;
  };
  const select = (parent, label, options) => {
    const select = field(parent, label, element(doc, 'select'));
    for (const [value, title] of options) select.append(element(doc, 'option', title, { value }));
    return select;
  };
  function button(parent, label, action) {
    const control = element(doc, 'button', label, { type: 'button' });
    control.addEventListener('click', action);
    parent.append(control);
    return control;
  }
  const input = (parent, label, attrs) => field(parent, label, element(doc, 'input', undefined, attrs));
  const group = label => {
    const box = element(doc, 'fieldset');
    box.append(element(doc, 'legend', label));
    dialog.append(box);
    return box;
  };
  const manual = group(t('Manueller Eintrag', 'Manual entry'));
  const heading = input(manual, t('Titel', 'Title'), { type: 'text', maxlength: '240', name: 'outline-title' });
  const page = input(manual, t('PDF-Seite', 'PDF page'), { type: 'number', min: '1', max: String(pages), value: String(view.viewer.currentPageNumber) });
  const depth = input(manual, t('Ebene', 'Level'), { type: 'number', min: '1', max: '6', value: '1' });
  button(manual, t('Hinzufügen', 'Add entry'), () => {
    const entry = { title: heading.value, pageIndex: Number(page.value) - 1, level: Number(depth.value) };
    if (!validOutlineEntry(entry, pages)) {
      status.textContent = t('Titel, Seite und Ebene prüfen.', 'Check the title, page and level.');
      return;
    }
    add([entry]);
    heading.value = '';
  });

  const rules = group(t('Aus Annotationen', 'From annotations'));
  const types = [['', t('Alle', 'Any')], ['highlight', t('Hervorhebung', 'Highlight')], ['underline', t('Unterstreichung', 'Underline')], ['note', t('Notiz', 'Note')], ['bookmark', t('Lesezeichen', 'Bookmark')], ['text', 'Text'], ['image', t('Bild', 'Image')], ['ink', t('Zeichnung', 'Drawing')]];
  const type = select(rules, t('Typ', 'Type'), types);
  const tag = input(rules, 'Tag', { type: 'text' });
  const color = input(rules, t('Farbe (#RRGGBB)', 'Color (#RRGGBB)'), { type: 'text', maxlength: '7' });
  const titleField = select(rules, t('Titel aus', 'Title from'), [['comment', t('Kommentar', 'Comment')], ['text', t('Markierter Text', 'Highlighted text')], ['tag', t('Erster Tag', 'First tag')], ['page', t('Seitenlabel', 'Page label')]]);
  const prefix = input(rules, t('Titelpräfix', 'Title prefix'), { type: 'text', maxlength: '80' });
  const level = input(rules, t('Ebene', 'Level'), { type: 'number', min: '1', max: '6', value: '1' });
  button(rules, t('Treffer hinzufügen', 'Add matching annotations'), () => {
    const hex = color.value.trim();
    if ((hex && !/^#[\da-f]{6}$/i.test(hex)) || !level.checkValidity() || !level.value) {
      status.textContent = t('Farbe und Ebene prüfen.', 'Check color and level.');
      return;
    }
    const annotations = state.annotations();
    add(outlineEntries(annotations, { tag: tag.value, color: hex, title: titleField.value,
      prefix: prefix.value, type: type.value, level: Number(level.value) }, pages));
  });

  const scan = button(dialog, t('Überschriften im PDF suchen', 'Find headings in PDF'), async () => {
    scan.disabled = true;
    try {
      const found = [];
      for (let index = 0; index < pages && dialog.open && found.length < MAX_OUTLINE_ENTRIES; index++) {
        status.textContent = t('Seite ', 'Page ') + (index + 1) + ' / ' + pages;
        const pdfPage = waive(await view.app.pdfDocument.getPage(index + 1));
        const viewport = waive(pdfPage.getViewport(contentData(view.win, { scale: 1 })));
        const text = await pdfPage.getTextContent();
        found.push(...detectHeadings(getReadingTextLines(text, viewport), index, viewport));
        await Zotero.Promise.delay(0);
      }
      if (dialog.open) add(found);
    }
    catch (error) { if (dialog.open) status.textContent = String(error.message || error); }
    finally { scan.disabled = false; }
  });
  const preview = element(doc, 'ol', undefined, { class: 'motero-outline-preview' });
  const status = element(doc, 'p', '', { role: 'status' });
  dialog.append(preview, status);
  const actions = element(doc, 'footer');
  dialog.append(actions);
  const save = button(actions, t('PDF-Kopie speichern…', 'Save PDF copy…'), async () => {
    save.disabled = true;
    try {
      if (await saveCopy(state, entries.map(entry => ({ ...entry })))) dialog.close();
    }
    catch (error) { status.textContent = String(error.message || error); }
    finally { save.disabled = !entries.length; }
  });
  button(actions, t('Schließen', 'Close'), () => dialog.close());

  function render() {
    preview.replaceChildren();
    for (const [index, entry] of entries.entries()) {
      const item = element(doc, 'li');
      item.style.marginInlineStart = ((entry.level - 1) * 12) + 'px';
      const name = input(item, t('Titel', 'Title'), { type: 'text', value: entry.title, maxlength: '240' });
      name.addEventListener('input', () => { entry.title = name.value; });
      button(item, t('Seite ', 'Page ') + (entry.pageIndex + 1), () => {
        view.viewer.scrollPageIntoView(contentData(view.win, { pageNumber: entry.pageIndex + 1,
          ...(entry.x == null && entry.y == null ? {} : { destArray: [null, { name: 'XYZ' }, entry.x, entry.y, null] }) }));
      });
      button(item, t('Entfernen', 'Remove'), () => { entries.splice(index, 1); render(); });
      preview.append(item);
    }
    save.disabled = !entries.length;
  }
  function add(found) {
    const available = MAX_OUTLINE_ENTRIES - entries.length;
    entries.push(...found.slice(0, available));
    status.textContent = found.length ? entries.length + t(' Einträge', ' entries')
      : t('Keine passenden Einträge gefunden', 'No matching entries found');
    render();
  }

  dialog.addEventListener('close', () => { state.dialogs.delete(dialog); dialog.remove(); }, { once: true });
  state.dialogs.add(dialog);
  doc.body.append(dialog);
  render();
  dialog.showModal();
}
