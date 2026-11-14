var Motero;
var pluginScope = this;
function install() {}
function uninstall() {}
async function startup(data) {
  Services.scriptloader.loadSubScriptWithOptions(data.rootURI + 'motero.js', {
    target: pluginScope, ignoreCache: true, allowUnsafeURL: true
  });
  await Motero.startup(data);
}
function shutdown() {
  Motero?.shutdown();
  Motero = undefined;
}
