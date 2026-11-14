export const READER_CSS = `
.motero-crop-settings h3{font-size:inherit;font-weight:600;margin:0}
.motero-crop-settings select,.motero-crop-settings input{font:inherit;color:inherit}
.motero-crop-settings select{max-width:175px;border:1px solid var(--fill-quinary);border-radius:4px;background:var(--material-background);padding:3px 5px}
.motero-crop-settings .motero-actions{display:flex;gap:8px;flex-wrap:wrap}
.motero-crop-settings .motero-action,.motero-crop-editor button:not(.toolbar-button){border:1px solid var(--fill-quinary);border-radius:4px;background:var(--material-background);color:inherit;padding:4px 8px;font:inherit}
.motero-crop-settings .motero-action:hover,.motero-crop-editor button:hover{background:var(--fill-quinary)}
.appearance-popup{max-height:calc(100vh - 60px);overflow:auto}
#moteroBookmarksView{display:none;height:100%;flex-direction:column;user-select:none}
.motero-bookmarks-open #moteroBookmarksView{display:flex}
.motero-bookmarks-open #sidebarContent>.viewWrapper{display:none!important}
.motero-bookmarks-open .sidebar-toolbar .end>*{visibility:hidden}
.motero-bookmarks-open .sidebar-toolbar .toolbar-button.active:not(#viewMoteroBookmarks){background:transparent}
#moteroBookmarksView .motero-search{margin:6px 8px;flex:none;display:flex}
#moteroBookmarksView input{width:100%;box-sizing:border-box;border:1px solid var(--fill-quinary);border-radius:5px;background:var(--material-background);color:inherit;padding:5px 7px;font:inherit}
#moteroBookmarksView .motero-bookmarks{overflow:auto;padding:3px 7px 8px;flex:1}
#moteroBookmarksView .annotation{background:var(--material-background);outline:1px solid var(--fill-quinary);border-radius:5px;overflow:hidden;margin:1px 1px 8px}
#moteroBookmarksView .motero-card-header{display:flex;align-items:center;padding:4px 6px;gap:6px;border-bottom:1px solid var(--fill-quinary)}
#moteroBookmarksView .motero-card-header>svg{width:16px;height:16px;flex:none}
#moteroBookmarksView .motero-go{color:var(--fill-primary);text-align:start;flex:1;padding:4px;min-width:0}
#moteroBookmarksView .motero-go:hover{color:var(--accent-blue)}
#moteroBookmarksView .motero-comment{padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fill-secondary)}
#moteroBookmarksView .motero-empty{padding:12px;color:var(--fill-secondary)}
.motero-crop-editor{color:var(--fill-primary);background:var(--material-background);border:var(--material-panedivider);border-radius:8px;padding:16px;max-width:min(620px,90vw);max-height:88vh;overflow:auto;font:inherit;box-shadow:0 4px 24px #0004}
.motero-crop-editor::backdrop{background:#0003}
.motero-crop-editor input,.motero-crop-editor select{font:inherit;color:inherit;background:var(--material-background);border:1px solid var(--fill-quinary);border-radius:4px;padding:3px}
.motero-crop-editor h2{font-size:14px;margin:0 0 12px}
`;

export const PDF_CSS = `
.motero-page-corner{position:absolute;z-index:20;pointer-events:none;display:grid;place-items:start end;color:var(--primary-color,#000)}
.motero-bookmark-marker{width:22px;height:26px;max-width:100%;max-height:100%;opacity:.25;pointer-events:none;margin:4px}
.motero-bookmark-marker[hidden]{display:none}
.motero-page-toggle{position:absolute;inset:0;width:100%;height:100%;padding:4px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;opacity:0;pointer-events:auto;display:grid;place-items:start end}
.motero-page-toggle svg{width:22px;height:26px;pointer-events:none}
.motero-page-corner:hover .motero-page-toggle,.motero-page-toggle:focus-visible{opacity:.7;background:var(--fill-quinary,#8882)}
.motero-page-toggle:focus-visible{outline:2px solid var(--accent-blue,#3080ff);outline-offset:-2px}
.motero-page-toggle:disabled{cursor:default}
`;
