export const READER_CSS = `
.sidebar-toolbar:not(:has(#viewOutline[aria-selected=true])) .motero-outline-tool{display:none}
[data-motero-outline-editor] fieldset{margin-block:8px;display:flex;gap:8px;flex-wrap:wrap}
[data-motero-outline-editor] :is(fieldset,li) label{display:inline-flex;align-items:center;gap:5px}
[data-motero-outline-editor] input[type=number]{width:5ch}
[data-motero-outline-editor] .motero-outline-preview{max-height:25vh;overflow:auto}
[data-motero-outline-editor] li button{margin-inline-start:5px}
.motero-crop-settings,.motero-crop-settings :is(label,button,input,select,output){font:inherit;color:inherit}
.motero-crop-settings .motero-margin-control{width:187px;display:flex;align-items:center;gap:8px}
.motero-crop-settings .motero-margin-control input{min-width:0;flex:1;width:130px}
.motero-crop-settings .motero-margin-control .value{min-width:28px;text-align:end}
.motero-crop-settings .motero-actions{display:flex;justify-content:flex-end;gap:8px}
.motero-crop-settings .motero-action,.motero-crop-editor button:not(.toolbar-button){border:var(--material-border-quarternary);border-radius:5px;background:var(--material-button,var(--material-background));color:inherit;padding:3px 8px;font:inherit}
.motero-crop-settings .motero-action:hover,.motero-crop-editor button:hover{background:var(--material-mix-quinary,var(--fill-quinary))}
#viewMoteroBookmarks svg{width:20px;height:20px}
.appearance-popup{max-height:calc(100vh - 60px);overflow:auto}
#moteroBookmarksView{display:none;height:100%;flex-direction:column;user-select:none}
.motero-bookmarks-open #moteroBookmarksView{display:flex}
.motero-bookmarks-open #sidebarContent>.viewWrapper{display:none!important}
.motero-bookmarks-open .sidebar-toolbar .end>:not(.motero-search){display:none!important}
.motero-bookmarks-open .sidebar-toolbar .toolbar-button.active:not(#viewMoteroBookmarks){background:transparent}
.motero-search[hidden]{display:none!important}
.motero-search button svg{width:20px;height:20px}
.motero-search.expanded button svg{width:16px;height:16px}
.motero-search input{font:inherit;color:inherit}
.motero-bookmarks-open .sidebar-toolbar .end{min-width:0}
.motero-search input{min-width:0}
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
.motero-crop-editor h2{font:inherit;font-weight:600;margin:0 0 12px}
`;

export const PDF_CSS = `
.motero-page-corner{position:absolute;z-index:20;pointer-events:none;display:grid;place-items:start end;color:var(--primary-color,#000)}
.motero-bookmark-marker{width:42px;height:54px;max-width:100%;max-height:100%;opacity:.65;pointer-events:none;margin:4px}
.motero-bookmark-marker[hidden]{display:none}
.motero-page-toggle{position:absolute;inset:0;width:100%;height:100%;padding:4px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;opacity:0;pointer-events:auto;display:grid;place-items:start end}
.motero-page-toggle svg{width:42px;height:54px;pointer-events:none}
.motero-page-corner:hover .motero-page-toggle,.motero-page-toggle:focus-visible{opacity:.7;background:var(--fill-quinary,#8882)}
.motero-page-toggle:focus-visible{outline:2px solid var(--accent-blue,#3080ff);outline-offset:-2px}
.motero-page-toggle:disabled{cursor:default}
`;
