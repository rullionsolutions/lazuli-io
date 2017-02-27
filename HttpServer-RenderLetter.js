"use strict";

var IO = require("lazuli-io/index.js");


module.exports = IO.HttpServer;


module.exports.define("renderLetter", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;
    var xmlstream;
    var head;
    var link;
    var body;
    var div;

    module.exports.debug("---");
    module.exports.info("--- renderPrint()" + (js_session ? " on js_session " + js_session.id : "")
        + ", page: " + params.page_id + (params.page_key ? ":" + params.page_key : "") + " ---");
    if (!js_session) {
        module.exports.throwError("Not logged in");
    }
    if (!params.page_id) {
        module.exports.throwError("Parameter 'page_id' must be supplied");
    }
    page = js_session.getPage(params.page_id, params.page_key);
    xmlstream = IO.XmlStream.clone({
        id: "http_xmlstream",
        name: "html",
        out: response.getWriter(),
        indent: null,
    });
    head = xmlstream.makeElement("head");
    head.makeElement("meta").attr("charset", "UTF-8");
    link = head.makeElement("link");
    link.attr("rel", "stylesheet");
    link.attr("type", "text/css");
    link.attr("href", "../style/style-letter.css");

    body = xmlstream.makeElement("body");
    div = body.makeElement("div", null, "css_page_letter");
    page.render(div, {
        all_sections: true,
        include_buttons: false,
        uneditable: true,
        dynamic_page: false,
        show_links: false,
        long_lists: true,
    });
    xmlstream.close();
});
