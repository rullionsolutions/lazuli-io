/* global Packages */

"use strict";

var Core = require("lapis-core/index.js");

/*
Define whitelist and formatting objects for use with JSoup library
relaxed whitelist:
    1) a, b, blockquote, br, caption, cite, code, col, colgroup, dd, dl, dt, em,
        h1, h2, h3, h4, h5, h6, i, img, li, ol, p, pre, q, small, strike, strong, sub, sup, table,
        tbody, td, tfoot, th, thead, tr, u, ul
    2) Enforces rel=nofollow on a tags    3) class and id attributes allowed
*/

module.exports = Core.Base.clone({
    id: "JSoup",
});


module.exports.tag_whitelist =          // eslint-disable-next-line new-cap
    new Packages.org.jsoup.safety.Whitelist.relaxed().addEnforcedAttribute("a", "rel", "nofollow");
module.exports.tag_whitelist.addAttributes(":all", "class");
module.exports.tag_whitelist.addAttributes(":all", "id");
module.exports.JSoup_output_settings =
    new Packages.org.jsoup.nodes.Document.OutputSettings().prettyPrint(false);


module.exports.override("clone", function () {
    this.throwError("this is a singleton and should not be cloned");
});


module.exports.define("escape", function (str, JSoup_output_settings) {
    return String(Packages.org.jsoup.Jsoup.clean(str,
            "",
            this.tag_whitelist,
            JSoup_output_settings || this.JSoup_output_settings
    ));
});


module.exports.define("unescape", function (str) {
    return String(Packages.org.jsoup.parser.Parser.unescapeEntities(str, false));
});


module.exports.define("removeTags", function (str) {
    str = String(Packages.org.jsoup.Jsoup.clean(str, "",
            Packages.org.jsoup.safety.Whitelist.none(),
            new Packages.org.jsoup.nodes.Document.OutputSettings()
            .prettyPrint(true)
            .charset("ASCII")
            .escapeMode(Packages.org.jsoup.nodes.Entities.EscapeMode.xhtml)
    ));
    return str.replace(/&#xa3;/g, "£")
        .replace(/&pound;/g, "£")
        .replace(/&#x26;/g, "&")
        .replace(/&amp;/g, "&");
});


module.exports.define("parse", function (xml_string) {
    var Parser = Packages.org.jsoup.parser.Parser;
    var Jsoup = Packages.org.jsoup.Jsoup;
    return Jsoup.parse(xml_string, "", Parser.xmlParser());
});


module.exports.define("clean", function (str) {
    return Packages.org.jsoup.Jsoup.clean(str, Packages.org.jsoup.safety.Whitelist.none());
});
