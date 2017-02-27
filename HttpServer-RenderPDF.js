/* global java, Packages */

"use strict";

var IO = require("lazuli-io/index.js");
var Rhino = require("lazuli-rhino/index.js");


module.exports = IO.HttpServer;


module.exports.define("renderPDF", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;
    var xmlstream;
    var head;
    var body;
    var div;
    var exec;
    var includes;
    var exec_process;
    var tmp_html;
    var tmp_pdf;
    var out;
    var output_stream = response.getOutputStream();
    var inn;
    var line;
    var css_pattern = /.*\.css/;

    module.exports.debug("---");
    module.exports.info("--- renderPDF()" + (js_session ? " on js_session " + js_session.id : "")
        + ", page: " + params.page_id + (params.page_key ? ":" + params.page_key : "") + " ---");

    if (!js_session) {
        module.exports.throwError("Not logged in");
    }
    if (!params.page_id) {
        module.exports.throwError("Parameter 'page_id' must be supplied");
    }

    page = js_session.getPage(params.page_id, params.page_key);
    includes = page.includes || [];

    response.setContentType("application/pdf");
    response.setHeader("Content-Disposition", "filename=" + page.title + ".pdf");
    tmp_html = new java.io.File.createTempFile("test", ".html");        // eslint-disable-line new-cap
    tmp_pdf = new java.io.File.createTempFile("pdf", ".pdf");           // eslint-disable-line new-cap
    out = new java.io.PrintStream(new java.io.BufferedOutputStream(
        new java.io.FileOutputStream(tmp_html)), true);
    xmlstream = IO.XmlStream.clone({
        id: "http_xmlstream",
        name: "html",
        out: out,
        indent: null,
    });

    head = xmlstream.addChild("head");
    head.addChild("meta").attribute("charset", "UTF-8");

    exec = Rhino.app.webapps_dir + "cdn/phantomjs-1.9.7/phantomjs-1.9.7";
    if (Rhino.app.isWindows()) {
        exec = "cmd /c " + exec + ".exe";
    }
    exec += " " + Rhino.app.webapps_dir + Rhino.app.cdn_rsl_dir + "pdf_render.js";
    module.exports.addInternalCSS(head, Rhino.app.webapps_dir + Rhino.app.cdn_rsl_dir + "style-print.css");
    module.exports.addInternalCSS(head, Rhino.app.webapps_dir + Rhino.app.cdn_rsl_dir + "style-pdf.css");
    module.exports.addInternalCSS(head, Rhino.app.emerald_dir + "style/style-print.css");
    module.exports.addInternalCSS(head, Rhino.app.emerald_dir + "style/style-pdf.css");
    includes.forEach(function (path) {
        if (css_pattern.test(path) === true) {
            module.exports.addInternalCSS(head, Rhino.app.emerald_dir + "/" + path);
        }
    });

    body = xmlstream.addChild("body");
    div = body.addChild("div", "css_page_print");
    if (!page.ignore_print_header) {
        div.addChild("h1", null, null, page.getPageTitle());
        div.addChild("p", null, null, "PDF View at " + (new Date()).toString());
        div.addChild("p", null, null, "Source " + Rhino.app.base_uri + "/" + page.getSimpleURL());
    }
    page.render(div, {
        all_sections: true,
        include_buttons: false,
        uneditable: true,
        dynamic_page: false,
        show_links: false,
        long_lists: true,
    });
    if (!page.ignore_print_footer) {
        div.addChild("p", null, null, "End of Print");
    }
    xmlstream.close();

    out.close();
    exec_process = java.lang.Runtime.getRuntime().exec(exec + " " + tmp_html.getAbsolutePath() + " " + tmp_pdf.getAbsolutePath());

    // required otherwise the waitFor stucks
    inn = new java.io.BufferedReader(new java.io.InputStreamReader(exec_process.getInputStream()));
    do {
        line = inn.readLine();
        module.exports.debug("phantomjs_out: " + line);
    } while (line !== null);
    inn.close();

    exec_process.waitFor();

    Packages.rsl.FileManager.pipe(new java.io.BufferedInputStream(
        new java.io.FileInputStream(tmp_pdf)),
        new java.io.BufferedOutputStream(output_stream));

    tmp_html.delete();
    tmp_pdf.delete();
});


module.exports.define("addInternalCSS", function (target, css_path) {
    var reader;
    var css_text = "";

    function getLine() {
        var css_line = reader.readLine();
        if (css_line !== null) {
            css_text += css_line;
            return true;
        }
        return false;
    }
    if (!IO.File.exists(css_path)) {
        return;
    }
    reader = new java.io.BufferedReader(new java.io.FileReader(css_path));
    while (getLine());
    reader.close();
    target.addChild("style").addText(css_text);
});
