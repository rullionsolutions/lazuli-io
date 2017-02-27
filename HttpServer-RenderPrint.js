"use strict";

var IO = require("lazuli-io/index.js");
var Rhino = require("lazuli-rhino/index.js");


module.exports = IO.HttpServer;


module.exports.define("renderPrint", function (request, response) {
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
    link.attr("href", "../style/style-print.css");

    module.exports.addChartSupport(head);

    body = xmlstream.makeElement("body");
    div = body.makeElement("div", null, "css_page_print");
    div.makeElement("h1").text(page.getPageTitle());
    div.makeElement("p").text("Print-Friendly View at " + (new Date()).toString());
    div.makeElement("p").text("Source " + Rhino.app.base_uri + "/" + page.getSimpleURL());
    page.render(div, {
        all_sections: true,
        include_buttons: false,
        uneditable: true,
        dynamic_page: false,
        show_links: false,
        long_lists: true,
    });
    div.makeElement("p").text("End of Print");
    xmlstream.close();
});


module.exports.define("addChartSupport", function (target) {
    var js;
    var file_id;
    var files = [
        "../../cdn/jquery-v1.11.3/jquery-1.11.3.min.js",
        "../../cdn/highcharts-3.0.0/highcharts.js",
        "../../cdn/highcharts-3.0.0/highcharts-more.js",
        "../../cdn/highcharts-3.0.0/exporting.js",
        "../style/render_charts.js",
    ];

    for (file_id = 0; file_id < files.length; file_id += 1) {
        js = target.addChild("script");
        js.attribute("type", "text/javascript");
        js.attribute("src", files[file_id]);
        js.addText(" ");
    }
});
