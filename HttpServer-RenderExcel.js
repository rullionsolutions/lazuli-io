"use strict";

var IO = require("lazuli-io/index.js");
var Rhino = require("lazuli-rhino/index.js");


module.exports = IO.HttpServer;


module.exports.define("renderExcel", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;
    var xmlstream;
    var head;
    var body;
    var div;

    module.exports.debug("---");
    module.exports.info("--- renderExcel()" + (js_session ? " on js_session " + js_session.id : "")
        + ", page: " + params.page_id + (params.page_key ? ":" + params.page_key : "") + " ---");
    if (!js_session) {
        module.exports.throwError("Not logged in");
    }
    if (!params.page_id) {
        module.exports.throwError("Parameter 'page_id' must be supplied");
    }

    page = js_session.getPage(params.page_id, params.page_key);

    response.setContentType("application/vnd.ms-excel");
    response.setHeader("Content-Disposition", "filename=" + page.id + ".xls");
    xmlstream = IO.XmlStream.clone({
        id: "http_xmlstream",
        name: "html",
        out: response.getWriter(),
        indent: null,
    });
    head = xmlstream.makeElement("head");
    head.makeElement("meta").attr("charset", "UTF-8");
    body = xmlstream.makeElement("body");
    div = body.makeElement("div", null, "css_page_excel");
    div.makeElement("h1").text(page.getPageTitle());
    div.makeElement("p").text("MS Excel View at " + (new Date()).toString());
    div.makeElement("p").text("Source " + Rhino.app.base_uri + "/" + page.getSimpleURL());
    page.render(div, {
        all_sections: true,
        include_buttons: false,
        uneditable: true,
        dynamic_page: false,
        show_links: false,
        long_lists: true,
        hide_images: true,
    });
    div.makeElement("p").text("End of Export");
    xmlstream.close();
});
